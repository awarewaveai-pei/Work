# Ported from OwnVoice Meet src-tauri/src/archive.rs and recorder.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Saving a listening session in the folder format lib/ownvoice.py reads (and OwnVoice Meet writes):
  <base>/<YYYY-MM-DD HHMM[-N]>/NN-<segment>.wav  16 kHz mono PCM16, one file per segment
                               NN-<segment>.md   that segment's transcript
                               transcript.md     the whole session, segment by segment
                               summary.md        the live summary (lib/live/summary.py)
`Archive` is plain synchronous code driven from the event loop: audio chunks, caption callbacks and
a once-a-second `tick()`. Every write is a few KB; the WAV header sizes are rewritten by `tick()`
every 5 s and transcript files at most every 3 s while they change, so a crash loses at most that
much and the files still open. `end()` writes the last versions. Times are seconds from `clock`."""
import logging
import os
import shutil
import struct
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

log = logging.getLogger(__name__)

RATE = 16000
HEADER_EVERY = 5.0
FLUSH_EVERY = 3.0
# Fill with silence only when the file is behind real time by more than this (seconds).
GAP_FILL_AFTER = 2.0
# A WAV's data size is a 32-bit number: before reaching it (minus 1 MB) the next segment starts by itself.
WAV_MAX_BYTES = 0xFFFFFFFF - (1 << 20)
REPLACE_RETRIES, REPLACE_WAIT = 3, 0.05
# Less free space than this and the session is not saved (an hour of audio is about 115 MB).
MIN_FREE_BYTES = 1 << 30
NAME_MAX = 80
U32_MAX = 0xFFFFFFFF


class ArchiveError(Exception):
    """Saving could not start; the message is shown to the user."""


@dataclass
class Segment:
    name: str
    at: float
    wall: datetime
    # The recording file as it was opened (renamed when the segment closes, if the name changed).
    wav: Optional[str] = None


@dataclass
class Line:
    at: float
    seg: int
    en: str
    zh: str = ""
    speaker: Optional[str] = None


# ---- names (archive.rs) ----

def parse_agenda(text: str) -> list:
    return [l.strip() for l in text.splitlines() if l.strip()]


def segment_name(agenda: list, i: int) -> str:
    """Segment `i` (0-based) takes the agenda's `i`-th name, or "段落 N"."""
    return agenda[i] if i < len(agenda) else f"段落 {i + 1}"


def clean_name(name) -> str:
    """A segment name from a page: one line, no control characters, at most NAME_MAX characters."""
    s = "".join(" " if unicodedata.category(c) == "Cc" else c for c in str(name or ""))
    return " ".join(s.split())[:NAME_MAX].strip()


def stem(index: int, name: str) -> str:
    """"03-Session 2A Digital Libraries": a file name safe on Windows and macOS."""
    clean = " ".join("".join(" " if unicodedata.category(c) == "Cc" or c in '\\/:*?"<>|' else c for c in name).split())
    clean = clean[:60].rstrip(". ")
    return f"{index:02d}-{clean}" if clean else f"{index:02d}"


def unique_dir(base: str, name: str) -> str:
    """A folder named for the start time; "-2", "-3"… when two sessions start in the same minute."""
    first = os.path.join(base, name)
    if not os.path.exists(first):
        return first
    n = 2
    while os.path.exists(os.path.join(base, f"{name}-{n}")):
        n += 1
    return os.path.join(base, f"{name}-{n}")


def hms(secs: float) -> str:
    s = int(secs)
    return f"{s // 3600:02d}:{s // 60 % 60:02d}:{s % 60:02d}"


# ---- transcript text (archive.rs) ----

def render_header(started_at: datetime, about: list) -> str:
    return f"- 開始：{started_at.strftime('%Y-%m-%d %H:%M')}\n" + "".join(f"- {line}\n" for line in about)


def render(header: str, segments: list, lines: list, only: Optional[int] = None) -> str:
    """The transcript as Markdown: every segment, or only segment `only` (0-based)."""
    title = f"# {only + 1:02d} · {segments[only].name}" if only is not None else "# 逐字稿"
    out = [f"{title}\n\n{header}"]
    for i, seg in enumerate(segments):
        if only is not None and only != i:
            continue
        out.append(f"\n## {i + 1:02d} · {seg.name}（{seg.wall.strftime('%H:%M')} 開始，{hms(seg.at)}）\n\n")
        for l in lines:
            if l.seg != i or not l.en.strip():
                continue
            who = f"{l.speaker}：" if l.speaker else ""
            out.append(f"[{hms(l.at)}] {who}{l.en.strip()}\n")
            if l.zh.strip():
                out.append(f"　{l.zh.strip()}\n")
            out.append("\n")
    return "".join(out)


def write_atomic(path: str, text: str) -> None:
    # errors="replace": a lone surrogate from a page must not stop the transcript from being written.
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", errors="replace", newline="\n") as f:
        f.write(text)
    for attempt in range(REPLACE_RETRIES + 1):
        try:
            return os.replace(tmp, path)
        except PermissionError:
            # Windows: someone has the old file open for reading right now.
            if attempt == REPLACE_RETRIES:
                raise
            time.sleep(REPLACE_WAIT)


# ---- the recording (recorder.rs) ----

def wav_header(rate: int, data_bytes: int) -> bytes:
    """The canonical 44-byte header for 16-bit mono PCM."""
    return (b"RIFF" + struct.pack("<I", min(36 + data_bytes, U32_MAX)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", data_bytes))


class Wav:
    """A WAV file being written: the 44-byte header holds the sizes, rewritten as the data grows."""

    def __init__(self, path: str, rate: int, clock: Callable[[], float]):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.out = open(path, "wb")
        self.out.write(wav_header(rate, 0))
        self.path, self.rate, self.clock = path, rate, clock
        self.opened = self.last_header = clock()
        self.data_bytes = 0

    def fill_gap(self, incoming: int) -> None:
        """Silence for a real break in the audio (the page reconnected), leaving room for `incoming`
        samples about to be written: the file then covers the time since it was opened.
        Unlike recorder.rs (0.3 s slack, a local device clock) only a lag of more than GAP_FILL_AFTER
        counts: this audio comes from a browser over a WebSocket and arrives with jitter, which must
        not be stretched into silence in the middle of speech."""
        due = int((self.clock() - self.opened) * self.rate)
        have = self.data_bytes // 2 + incoming
        if due > have + int(GAP_FILL_AFTER * self.rate):
            self.write(bytes((due - have) * 2))

    def write(self, pcm: bytes) -> None:
        self.out.write(pcm)
        self.data_bytes = min(self.data_bytes + len(pcm), U32_MAX)

    def sync_header(self) -> None:
        self.last_header = self.clock()
        self.out.seek(4)
        self.out.write(struct.pack("<I", min(36 + self.data_bytes, U32_MAX)))
        self.out.seek(40)
        self.out.write(struct.pack("<I", self.data_bytes))
        self.out.seek(0, os.SEEK_END)
        self.out.flush()

    def finish(self, closing_as: str) -> None:
        """Final sizes, flushed and closed; then renamed if the segment's name changed meanwhile."""
        try:
            self.sync_header()
        finally:
            self.out.close()
        if closing_as != self.path:
            os.rename(self.path, closing_as)


# ---- the session ----

class Archive:
    def __init__(self, base: str, about: list, agenda: list = (), clock: Callable[[], float] = time.monotonic,
                 now: Callable[[], datetime] = datetime.now, on_problem: Callable[[str], None] = None,
                 on_segment: Callable[[dict], None] = None):
        """Opens the folder and the first recording file; raises ArchiveError (nothing is left behind).
        `on_segment(info)` is called when a segment starts by itself (a recording reaching the WAV size limit)."""
        self.clock, self.on_problem = clock, on_problem or (lambda msg: None)
        self.on_segment = on_segment or (lambda info: None)
        self.agenda = list(agenda)
        try:
            os.makedirs(base, exist_ok=True)
            free = shutil.disk_usage(base).free
        except OSError as e:
            raise ArchiveError(f"無法使用存檔資料夾 {base}：{e}") from None
        if free < MIN_FREE_BYTES:
            raise ArchiveError(f"存檔資料夾所在的磁碟只剩 {free // (1 << 20)} MB（要有 1 GB），這場不存檔")
        self.started_at = now()
        self.now = now
        self.started = clock()
        self.dir = unique_dir(base, self.started_at.strftime("%Y-%m-%d %H%M"))
        self.about = list(about)
        self.segments = [Segment(segment_name(self.agenda, 0), 0.0, self.started_at)]
        self.lines: list = []
        self.by_id: dict = {}
        self.open: dict = {}           # id -> (start offset, segment index) of lines opened but not final yet
        self.written: dict = {}        # segment index -> the per-segment transcript file written last time
        self.wav: Optional[Wav] = None
        self.dirty = True
        self.last_flush = clock()
        self.ended = False
        self._problem_said = set()
        try:
            os.makedirs(self.dir)
        except OSError as e:
            raise ArchiveError(f"無法建立存檔資料夾 {self.dir}：{e}") from None
        try:
            path = os.path.join(self.dir, f"{stem(1, self.segments[0].name)}.wav")
            self.wav = Wav(path, RATE, clock)
            self.segments[0].wav = path
        except OSError as e:
            shutil.rmtree(self.dir, ignore_errors=True)
            raise ArchiveError(f"無法建立錄音檔：{e}") from None

    def info(self) -> dict:
        i = len(self.segments)
        return {"index": i, "name": self.segments[-1].name, "recording": self.wav is not None, "dir": self.dir}

    def _problem(self, key: str, msg: str) -> None:
        log.warning("archive: %s", msg)
        if key not in self._problem_said:
            self._problem_said.add(key)
            self.on_problem(msg)

    # ---- audio ----

    def feed(self, pcm: bytes) -> None:
        """One chunk of 16 kHz mono PCM16 from the page (also while the speech service is paused)."""
        if self.wav is None:
            return
        pcm = pcm[: len(pcm) // 2 * 2]
        try:
            self.wav.fill_gap(len(pcm) // 2)
            if self.wav.data_bytes + len(pcm) > WAV_MAX_BYTES:
                self.on_segment(self.next_segment())
                if self.wav is None:
                    return
            self.wav.write(pcm)
        except OSError as e:
            self._lose_audio(e)

    def _lose_audio(self, e: Exception) -> None:
        wav, self.wav = self.wav, None
        try:
            wav.sync_header()      # what was written so far stays readable
        except (OSError, ValueError):
            pass
        try:
            wav.out.close()
        except OSError:
            pass
        self._problem("wav", f"錄音寫入失敗（{e}），這場之後不再錄音，逐字稿照常存")

    def close_audio(self) -> None:
        """No more chunks will come: close the current recording under its segment's name."""
        if self.wav is None:
            return
        wav, self.wav = self.wav, None
        try:
            wav.fill_gap(0)
            wav.finish(self._closing_path(len(self.segments) - 1))
        except OSError as e:
            self._problem("wav", f"錄音檔收尾失敗（{e}）")

    def _closing_path(self, i: int) -> str:
        """The name segment `i` (0-based) closes under: its current name."""
        seg = self.segments[i]
        wanted = os.path.join(self.dir, f"{stem(i + 1, seg.name)}.wav")
        # Renaming onto an existing file fails on Windows; keep the opened name in that case.
        if seg.wav is not None and seg.wav != wanted and os.path.exists(wanted):
            return seg.wav
        return wanted

    # ---- segments ----

    def next_segment(self, name: Optional[str] = None) -> dict:
        i = len(self.segments)
        seg = Segment(clean_name(name) or segment_name(self.agenda, i), self.clock() - self.started, self.now())
        if self.wav is not None:
            nxt = os.path.join(self.dir, f"{stem(i + 1, seg.name)}.wav")
            wav, self.wav = self.wav, None
            try:
                wav.fill_gap(0)
                wav.finish(self._closing_path(i - 1))
            except OSError as e:
                self._problem("wav", f"錄音檔收尾失敗（{e}）")
            try:
                self.wav = Wav(nxt, RATE, self.clock)
                seg.wav = nxt
            except OSError as e:
                self._problem("wav", f"無法開新的錄音檔（{e}），這場之後不再錄音，逐字稿照常存")
        self.segments.append(seg)
        self.dirty = True
        self._write_quietly()
        return self.info()

    def rename_segment(self, name: str) -> dict:
        """Rename the current segment (its transcript file takes the new name; the recording when it closes)."""
        name = clean_name(name)
        if not name:
            raise ValueError("名稱不能是空的")
        self.segments[-1].name = name
        self.dirty = True
        self._write_quietly()
        return self.info()

    # ---- captions ----

    def open_line(self, id: int) -> None:
        """A caption line started (speech began): remember when, and in which segment."""
        self.open[id] = (self.clock() - self.started, len(self.segments) - 1)

    def set_en(self, id: int, en: str) -> None:
        at, seg = self.open.get(id, (self.clock() - self.started, len(self.segments) - 1))
        if id in self.by_id:
            self.lines[self.by_id[id]].en = en
        else:
            self.by_id[id] = len(self.lines)
            self.lines.append(Line(at, seg, en))
        self.dirty = True

    def set_zh(self, id: int, zh: str) -> None:
        if id in self.by_id:
            self.lines[self.by_id[id]].zh = zh
            self.dirty = True

    def drop_line(self, id: int) -> None:
        """A line that came to nothing never enters the transcript."""
        self.open.pop(id, None)
        if id in self.by_id:
            line = self.lines[self.by_id[id]]
            line.en = line.zh = ""
            self.dirty = True

    def set_summary(self, text: str, updated: str) -> None:
        """The live summary, kept in the session folder as summary.md."""
        try:
            write_atomic(os.path.join(self.dir, "summary.md"), f"# 摘要\n\n- 更新：{updated}\n\n{text.strip()}\n")
        except OSError as e:
            self._problem("summary", f"摘要存檔失敗：{e}")

    # ---- writing ----

    def write(self) -> None:
        header = render_header(self.started_at, self.about)
        write_atomic(os.path.join(self.dir, "transcript.md"), render(header, self.segments, self.lines))
        for i, seg in enumerate(self.segments):
            path = os.path.join(self.dir, f"{stem(i + 1, seg.name)}.md")
            old = self.written.get(i)
            if old is not None and old != path:
                try:
                    os.remove(old)
                except OSError:
                    pass
            write_atomic(path, render(header, self.segments, self.lines, i))
            self.written[i] = path
        self.dirty = False
        self.last_flush = self.clock()

    def _write_quietly(self, tries: int = 1) -> None:
        for attempt in range(tries):
            try:
                return self.write()
            except OSError as e:
                if attempt == tries - 1:
                    self._problem("transcript", f"逐字稿存檔失敗：{e}")

    def tick(self) -> None:
        """Once a second: the transcript when it changed and 3 s have passed, the WAV header every 5 s."""
        now = self.clock()
        if self.dirty and now - self.last_flush >= FLUSH_EVERY:
            self._write_quietly()
        if self.wav is not None and now - self.wav.last_header >= HEADER_EVERY:
            try:
                self.wav.sync_header()
            except OSError as e:
                self._lose_audio(e)

    def end(self) -> str:
        """Stop saving: close the recording and write the transcript one last time. Returns the folder."""
        if not self.ended:
            self.ended = True
            self.close_audio()
            self._write_quietly(tries=2)      # the last version: worth one more try
        return self.dir
