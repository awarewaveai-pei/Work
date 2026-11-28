# Ported from OwnVoice Meet src-tauri/src/archive.rs and recorder.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Saving a listening session in the folder format lib/ownvoice.py reads (and OwnVoice Meet writes):
  <base>/<YYYY-MM-DD HHMM[-N]>/NN-<segment>.wav  16 kHz PCM16, one file per segment: mono, or stereo
                                                 with two channels (left 我, right 對方, aligned by position)
                               NN-<segment>.md   that segment's transcript
                               transcript.md     the whole session, segment by segment
                               session.json      the same lines for programs (lib/ownvoice.py session_lines)
                               summary.md        the live summary (lib/live/summary.py)
`Archive` is plain synchronous code driven from the event loop: audio chunks, caption callbacks and
a once-a-second `tick()`. Every write is a few KB; the WAV header sizes are rewritten by `tick()`
every 5 s and transcript files at most every 3 s while they change, so a crash loses at most that
much and the files still open. `end()` writes the last versions. Line and segment times are positions
in the recording (samples / RATE, silence filled in included); `clock` only paces the writing and
measures breaks in the audio."""
import json
import logging
import os
import shutil
import struct
import time
import unicodedata
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from typing import Callable, Optional

import numpy as np

from lib.ownvoice import SIDECAR

from .session import Segment as Line

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
SIDECAR_VERSION = 1


def align_stereo(pos: list, ch: int, n: int) -> tuple:
    """Two channels' recording positions (samples; `pos` updated in place) after `n` samples of channel `ch`:
    (where they start, silence added to the other channel). A channel that sent nothing for GAP_FILL_AFTER
    while the other did is moved up with silence, so the two stay aligned (computer sound shared and then
    stopped, a stalled device)."""
    at = pos[ch]
    pos[ch] += n
    other = 1 - ch
    fill = pos[ch] - pos[other] if pos[ch] - pos[other] > GAP_FILL_AFTER * RATE else 0
    pos[other] += fill
    return at, fill


class ArchiveError(Exception):
    """Saving could not start; the message is shown to the user."""


@dataclass
class Segment:
    name: str
    at: float
    wall: datetime
    # The recording file as it was opened (renamed when the segment closes, if the name changed).
    wav: Optional[str] = None


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
            if l.seg != i or not l.text.strip():
                continue
            who = f"{l.speaker}：" if l.speaker else ""
            out.append(f"[{hms(l.start)}] {who}{l.text.strip()}\n")
            if l.tr.strip():
                out.append(f"　{l.tr.strip()}\n")
            out.append("\n")
    return "".join(out)


def write_atomic(path: str, text: str) -> None:
    # errors="replace": a lone surrogate from a page must not stop the transcript from being written.
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", errors="replace", newline="\n") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    for attempt in range(REPLACE_RETRIES + 1):
        try:
            return os.replace(tmp, path)
        except PermissionError:
            # Windows: someone has the old file open for reading right now.
            if attempt == REPLACE_RETRIES:
                raise
            time.sleep(REPLACE_WAIT)


# ---- the recording (recorder.rs) ----

def wav_header(rate: int, data_bytes: int, channels: int = 1) -> bytes:
    """The canonical 44-byte header for 16-bit PCM."""
    return (b"RIFF" + struct.pack("<I", min(36 + data_bytes, U32_MAX)) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, channels, rate, rate * 2 * channels, 2 * channels, 16)
            + b"data" + struct.pack("<I", data_bytes))


class Wav:
    """A WAV file being written: the 44-byte header holds the sizes, rewritten as the data grows."""

    def __init__(self, path: str, rate: int, clock: Callable[[], float], channels: int = 1):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.out = open(path, "wb")
        self.out.write(wav_header(rate, 0, channels))
        self.path, self.rate, self.clock, self.frame = path, rate, clock, 2 * channels
        self.opened = self.last_header = clock()
        self.data_bytes = 0

    def fill_gap(self, incoming: int) -> int:
        """Silence for a real break in the audio (the page reconnected), leaving room for `incoming`
        samples (frames) about to be written: the file then covers the time since it was opened. Returns the
        samples (frames) of silence written.
        Unlike recorder.rs (0.3 s slack, a local device clock) only a lag of more than GAP_FILL_AFTER
        counts: this audio comes from a browser over a WebSocket and arrives with jitter, which must
        not be stretched into silence in the middle of speech."""
        due = int((self.clock() - self.opened) * self.rate)
        have = self.data_bytes // self.frame + incoming
        if due <= have + int(GAP_FILL_AFTER * self.rate):
            return 0
        self.write(bytes((due - have) * self.frame))
        return due - have

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
    def __init__(self, base: str, about: list, meta: dict, agenda: list = (), clock: Callable[[], float] = time.monotonic,
                 now: Callable[[], datetime] = datetime.now, on_problem: Callable[[str], None] = None,
                 on_segment: Callable[[dict], None] = None):
        """Opens the folder and the first recording file; raises ArchiveError (nothing is left behind).
        `meta` = {listen, target, stt, channels[, stt_me]}, written into session.json as is; channels 2 = a
        stereo recording fed per channel (feed(pcm, 0) 我 = left, feed(pcm, 1) 對方 = right).
        `on_segment(info)` is called when a segment starts by itself (a recording reaching the WAV size limit)."""
        self.meta = dict(meta)
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
        self.dir = unique_dir(base, self.started_at.strftime("%Y-%m-%d %H%M"))
        self.about = list(about)
        self.segments = [Segment(segment_name(self.agenda, 0), 0.0, self.started_at)]
        self.lines: list = []
        self.by_id: dict = {}
        self.failed: dict = {}         # id -> the error shown in place of the line's translation
        self.channels = int(meta.get("channels", 1))
        self.pos = [0] * self.channels         # per channel: where its next chunk starts in the recording
        self.pending = [bytearray() for _ in range(self.channels)]    # stereo: received, not yet paired
        self.dropped_sec = 0.0         # audio the speech service never got (lib/live/hub.py counts it)
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
            self.wav = Wav(path, RATE, clock, self.channels)
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

    def feed(self, pcm: bytes, ch: int = 0) -> int:
        """One chunk of 16 kHz mono PCM16 of channel `ch` from the page (also while the speech service is
        paused). Returns where it starts in the recording, in samples (counted on after the recording is lost)."""
        n = len(pcm) // 2
        if self.channels == 2:
            return self._feed_stereo(pcm[: n * 2], ch)
        if self.wav is not None:
            try:
                self.pos[0] += self.wav.fill_gap(n)
                if self.wav.data_bytes + n * 2 > WAV_MAX_BYTES:
                    self.on_segment(self.next_segment())
                if self.wav is not None:
                    self.wav.write(pcm[: n * 2])
            except OSError as e:
                self._lose_audio(e)
        at, self.pos[0] = self.pos[0], self.pos[0] + n
        return at

    def _feed_stereo(self, pcm: bytes, ch: int) -> int:
        """The two channels arrive separately: what both have is written as stereo frames, the rest waits.
        A channel that sent nothing for GAP_FILL_AFTER while the other did is filled with silence, so they
        stay aligned (computer sound shared and then stopped, a stalled device)."""
        at, fill = align_stereo(self.pos, ch, len(pcm) // 2)
        self.pending[ch].extend(pcm)
        self.pending[1 - ch].extend(bytes(fill * 2))
        self._write_frames(min(len(p) for p in self.pending) // 2)
        return at

    def _write_frames(self, k: int) -> None:
        if not k:
            return
        frames = np.empty((k, 2), dtype="<i2")
        for c, p in enumerate(self.pending):
            frames[:, c] = np.frombuffer(bytes(p[: k * 2]), dtype="<i2")
            del p[: k * 2]
        if self.wav is None:
            return
        data = frames.tobytes()
        try:
            if self.wav.data_bytes + len(data) > WAV_MAX_BYTES:
                self.on_segment(self.next_segment())
            if self.wav is not None:
                self.wav.write(data)
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

    def _flush_pending(self) -> None:
        """Stereo: the channel that is behind gets silence up to the other, and everything is written."""
        if self.channels != 2:
            return
        longest = max(len(p) for p in self.pending)
        for c, p in enumerate(self.pending):
            self.pos[c] += (longest - len(p)) // 2
            p.extend(bytes(longest - len(p)))
        self._write_frames(longest // 2)

    def close_audio(self) -> None:
        """No more chunks will come: close the current recording under its segment's name."""
        self._flush_pending()
        if self.wav is None:
            return
        wav, self.wav = self.wav, None
        try:
            self.pos[0] += wav.fill_gap(0) if self.channels == 1 else 0
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
        name = clean_name(name) or segment_name(self.agenda, i)
        nxt = None
        self._flush_pending()      # audio received before the change belongs to the segment that is closing
        if self.wav is not None:
            nxt = os.path.join(self.dir, f"{stem(i + 1, name)}.wav")
            wav, self.wav = self.wav, None
            try:
                self.pos[0] += wav.fill_gap(0) if self.channels == 1 else 0
                wav.finish(self._closing_path(i - 1))
            except OSError as e:
                self._problem("wav", f"錄音檔收尾失敗（{e}）")
        seg = Segment(name, max(self.pos) / RATE, self.now())
        if nxt is not None:
            try:
                self.wav = Wav(nxt, RATE, self.clock, self.channels)
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

    def line_final(self, line: Line) -> None:
        """A caption's text is final: it enters the transcript (a copy; the translation comes separately)."""
        if line.id in self.by_id:
            i = self.by_id[line.id]
            self.lines[i] = replace(line, tr=self.lines[i].tr)
        else:
            self.by_id[line.id] = len(self.lines)
            self.lines.append(replace(line, tr=""))
        self.dirty = True

    def line_translated(self, id: int, tr: str, failed: bool) -> None:
        """Its final translation, or (failed) the error shown in its place: transcript.md keeps showing
        that error as today; session.json leaves `tr` empty and lists the line in `failed_lines`."""
        if id in self.by_id:
            self.lines[self.by_id[id]].tr = tr
            if failed:
                self.failed[id] = tr
            else:
                self.failed.pop(id, None)
            self.dirty = True

    def line_label(self, id: int, speaker: str, guess: bool) -> None:
        """Its speaker, decided while listening or at the regroup at stop (lib/live/speakers.py)."""
        if id in self.by_id:
            line = self.lines[self.by_id[id]]
            line.speaker, line.guess = speaker, guess
            self.dirty = True

    def drop_line(self, id: int) -> None:
        """A line that came to nothing never enters the transcript."""
        self.failed.pop(id, None)
        if id in self.by_id:
            line = self.lines[self.by_id[id]]
            line.text = line.tr = ""
            self.dirty = True

    def set_summary(self, text: str, updated: str) -> None:
        """The live summary, kept in the session folder as summary.md."""
        try:
            write_atomic(os.path.join(self.dir, "summary.md"), f"# 摘要\n\n- 更新：{updated}\n\n{text.strip()}\n")
        except OSError as e:
            self._problem("summary", f"摘要存檔失敗：{e}")

    # ---- writing ----

    def sidecar(self) -> dict:
        """session.json: the lines that are in transcript.md, in the caption format, times rounded to the millisecond."""
        lines = [{**asdict(l), "start": round(l.start, 3), "end": round(l.end, 3), "tr": "" if l.id in self.failed else l.tr}
                 for l in self.lines if l.text.strip()]
        return {"version": SIDECAR_VERSION, **self.meta, "lines": lines, "dropped_sec": round(self.dropped_sec, 3),
                "failed_lines": [{"id": id, "error": msg} for id, msg in self.failed.items()]}

    def write(self) -> None:
        header = render_header(self.started_at, self.about)
        # Two files, two replaces: one failing leaves `dirty` set, so the next tick writes both again.
        write_atomic(os.path.join(self.dir, SIDECAR), json.dumps(self.sidecar(), ensure_ascii=False, indent=1) + "\n")
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

    def write_again(self) -> None:
        """After end(): the transcript files once more (lines or labels that arrived late); the recording is closed."""
        self._write_quietly(tries=2)

    def end(self) -> str:
        """Stop saving: close the recording and write the transcript one last time. Returns the folder."""
        if not self.ended:
            self.ended = True
            self.close_audio()
            self._write_quietly(tries=2)      # the last version: worth one more try
        return self.dir
