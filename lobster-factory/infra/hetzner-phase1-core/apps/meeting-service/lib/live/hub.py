"""The one live meeting of this process, and the browser pages watching it.

A page connects over WebSocket (/api/live/ws). Text frames are JSON commands, binary frames are audio
(16 kHz mono PCM16) from the page that pressed 聆聽: one source = the frame is the PCM of the 「對方」
channel (a page that sends no `proto`, as before C17); `proto: 2` = two sources, each frame is one byte
(0 我 = microphone, 1 對方 = computer sound) + PCM16 (parse_frame). Each source is a Channel with its own
recogniser; the speech service gets each chunk as (its start in the recording in samples, pcm).
Everything a page shows comes back as JSON events:
the Session's own (caption, caption-remove, status, clear) plus
  {"type":"snapshot","segments":[...],"status":str,"listening":bool,"stt":str,"usage":{...},
   "reply":{id,zh,en,done}|null,"script":str,"glossary":str,
   "segment":{index,name,recording,dir},"summary":{text,updated,lines,working,error,enabled}}
  {"type":"listening","on":bool,"stt":str}      {"type":"usage", ...Usage.today()}
  {"type":"reply","id","zh","en","done"}        {"type":"script","script":str,"glossary":str}
  {"type":"segment","index":int,"name":str,"recording":bool,"dir":str}   the segment being saved (lib/live/archive.py);
      index 0 (name "", dir "") = nothing is being saved
  {"type":"summary","text","updated","lines","working","error","enabled"}  the live summary (enabled = on for this listening) (lib/live/summary.py)
Commands from the page include {"type":"reply","zh":str} (works without listening),
{"type":"start", "stt", "listen", "target" (lib/live/langs.py codes), ..., "save":bool, "summary":bool, "summary_min":number} (both off unless true;
"proto":2 with "stt_me" = two channels, `stt` being the 「對方」 one),
{"type":"segment-next","name":str|null} and {"type":"segment-rename","name":str} (while saving).
Live speakers (C18, "speakers":true at start): {"type":"speaker-rename","old","name"}, {"type":"voice-save","name"},
{"type":"voice-delete","id"}; event {"type":"speakers","on":bool,"list":[{name,lines,voice}],"voices":[{id,name}]}.
Keys never leave the server; they are read through lib/settings.py (settings panel, else environment)."""
import asyncio
import functools
import json
import logging
import time
from dataclasses import asdict
from urllib.parse import urlsplit

from lib import gpu_gate, ownvoice, settings

from . import echo, gloss, idle, langs, script_store, speakers, stt_gemini, stt_local
from .archive import RATE, Archive, ArchiveError, align_stereo
from .prompts import parse_glossary, summary_system, system_blocks
from .session import Session
from .summary import DEFAULT_EVERY_MIN, Summary
from .translate import ANTHROPIC_MODEL, GEMINI_MODEL, Translator
from .usage import Usage

log = logging.getLogger(__name__)

STT = ("gemini", "local")
# 10 s of 100 ms chunks; when the speech service falls behind, the oldest audio goes.
AUDIO_QUEUE = 100
USAGE_EVERY = 5.0
STOP_TIMEOUT = 5.0
IDLE_TICK = 1.0
# Minutes without a new caption before the paid speech service is let go / before listening ends.
PAUSE_MIN, END_MIN = 3.0, 30.0
LOCAL_HOSTS = ("127.0.0.1", "localhost")
# Longest Chinese a page may send to be turned into an English reply.
REPLY_MAX = 2000
ARCHIVE_TICK = 1.0
# At the end of listening: how long to wait for the translations still running, and for the last summary update.
DRAIN_TIMEOUT, SUMMARY_TIMEOUT = 15.0, 20.0
# At the end of listening: how long the last save waits for the recognizer and the speakers to close (a model
# still loading, the regroup); the closing itself is never cut short (the GPU claim goes after both unload).
CLOSE_TIMEOUT = 60.0
NOT_SAVING = {"index": 0, "name": "", "recording": False, "dir": ""}
# proto 2: the first byte of every audio frame says which channel it is.
SOURCES = {0: "me", 1: "them"}
BUSY_TEXT = "顯卡正在跑會後整理，本機辨識要等它結束"
NAME_MAX = 40


def parse_frame(data: bytes, proto: int):
    """(who, pcm) of one binary frame, or None = drop it. Without proto 2 the whole frame is the one
    channel's PCM, 「對方」 (as before C17; never guessed from the first byte). proto 2: a known source
    byte and a whole number of 16-bit samples, at least one."""
    if proto != 2:
        return "them", data
    if len(data) < 3 or len(data) % 2 != 1 or data[0] not in SOURCES:
        return None
    return SOURCES[data[0]], data[1:]


def origin_allowed(origin: str, host: str) -> bool:
    """Only this service's own pages may open the socket. Without this, any web page open in the
    browser could connect to 127.0.0.1, read the captions and start paid listening."""
    try:
        o = urlsplit(origin or "")
    except ValueError:
        return False
    return o.scheme == "http" and bool(host) and o.netloc == host and o.hostname in LOCAL_HOSTS


def _minutes(value, default: float) -> float:
    """A number of minutes from the page; anything else means the default. 0 (or less) = never.
    Shorter than 0.1 min would drop and reopen the paid connection on every sentence."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    try:
        v = float(value)
    except OverflowError:
        return default
    if v != v:
        return default
    return 0.0 if v <= 0 else min(max(v, 0.1), 24 * 60.0)


def clean_text(s):
    """Text from a page without lone surrogates (a half emoji from a cut string): they cannot be
    encoded, so one in an event would stop every page's event stream. Non-strings pass through."""
    return s.encode("utf-8", "ignore").decode("utf-8") if isinstance(s, str) else s


class ScriptChanged(Exception):
    """The script was edited while a 補對照 was running; its result was not applied."""


class Hub:
    def __init__(self, usage: Usage = None):
        self.usage = usage or Usage()
        self.clients = {}            # ws -> outgoing asyncio.Queue
        self.session = None
        self.translator = Translator(self.usage, "", "")
        self.task = None
        self.ticker = None
        self.channels = {}           # who -> Channel of this listening
        self.proto = 1
        self.owner = None
        self.stt = ""
        self.last_caption = time.monotonic()
        self.archive = None          # the Archive of the session being saved (until it is closed out)
        self.tracker = None          # live speakers of the 對方 channel (lib/live/speakers.py), when on
        self.closing = None          # the task closing this listening's recognizer and speakers (never cancelled)
        self.recognizer = None       # this listening's shared local recognizer (lib/live/stt_local.py)
        self._voices = None          # the saved voices, read once and again after a save or delete
        self.archive_task = None
        self.finalizing = None       # the task closing out the session that just ended
        self.summary = None

    # ---- state ----

    def _session(self) -> Session:
        if self.session is None:
            s = self.session = Session(self._translate, self.emit, compose=self._compose)
            saved = script_store.load()
            s.script, s.glossary = saved["script"], saved["glossary"]
            self.summary = Summary(self._complete, lambda: system_blocks(summary_system(langs.mine(s.target), langs.theirs(s.listen)),
                                                                         parse_glossary(s.glossary), s.script), self.emit)
            self.summary.languages = lambda: (langs.theirs(s.listen), langs.mine(s.target))
            s.on_final.append(self._line_final)
            s.on_translated.append(self._line_translated)
            s.on_drop.append(lambda id: self.archive and self.archive.drop_line(id))
            s.on_clear.append(self.summary.clear)
            s.on_lost.append(self._audio_lost)
            s.on_label.append(self._line_label)
        return self.session

    def _audio_lost(self, seconds: float) -> None:
        if self.archive is not None:
            self.archive.dropped_sec += seconds

    def _complete(self, system, user):
        return self.translator.complete(system, user, langs.mine(self._session().target))

    def _line_final(self, line) -> None:
        if self.archive is not None:
            self.archive.line_final(line)
        if self.tracker is not None:
            self.tracker.line_final(line)
        self.summary.line_finished(line.id, line.text)

    def _line_label(self, id: int, speaker: str, guess: bool) -> None:
        if self.archive is not None:
            self.archive.line_label(id, speaker, guess)

    def _saved_voices(self) -> list:
        """The saved voices (lib/live/speakers.py Voices), not read again on every line. Raises
        speakers.VoicesUnreadable / ValueError (the file is in a forbidden place) for the caller to say."""
        if self._voices is None:
            self._voices = speakers.Voices().load()
        return self._voices

    def _speakers_view(self) -> dict:
        names = {}
        if self.tracker is not None:
            for name, _ in self.tracker.clusters.labels().values():
                names[name] = names.get(name, 0) + 1
            voices = {s["name"]: s["voice"] for s in self.tracker.clusters.speakers.values()}
        else:
            voices = {}
        try:
            saved = [{"id": v["id"], "name": v["name"]} for v in self._saved_voices()]
        except (speakers.VoicesUnreadable, ValueError):
            saved = []
        return {"type": "speakers", "on": self.tracker is not None,
                "list": [{"name": n, "lines": c, "voice": voices.get(n)} for n, c in names.items()], "voices": saved}

    def _line_translated(self, id: int, tr: str, failed: bool) -> None:
        if self.archive is not None:
            self.archive.line_translated(id, tr, failed)
        self.summary.line_translated(id, tr)

    def _segment_changed(self, info: dict) -> None:
        """The recording segment began (by the page, or a WAV reaching its size limit) or was renamed:
        new lines belong to it."""
        self._session().seg = info["index"] - 1
        self.emit({"type": "segment", **info})

    def _problem(self, text: str) -> None:
        self._session().status(text)

    def _begin_archive(self, stt: str, listen: str, target: str, stt_me: str = None):
        """Open the folder for this listening, or say why not and carry on without saving.
        Two channels (stt_me given): a stereo recording, left 我, right 對方; session.json says both recognisers."""
        def name(x):
            return "Gemini Live" if x == "gemini" else "本機 faster-whisper"
        about = ["收音：瀏覽器（麥克風／電腦聲音）" if stt_me is None else "收音：我＝麥克風（左聲道），對方＝電腦聲音（右聲道）",
                 "辨識：" + (name(stt) if stt_me is None else f"我＝{name(stt_me)}，對方＝{name(stt)}"),
                 "翻譯：" + (ANTHROPIC_MODEL if settings.get_api_key() else GEMINI_MODEL)]
        meta = {"listen": listen, "target": target, "stt": stt, "channels": 1 if stt_me is None else 2}
        if stt_me is not None:
            meta["stt_me"] = stt_me
        try:
            return Archive(ownvoice.recording_dir(), about, meta, on_problem=self._problem, on_segment=self._segment_changed)
        except (ArchiveError, ValueError) as e:      # ValueError: the recording folder cannot be opened (lib/paths.PathError)
            self._session().status(str(e))
            return None

    def _segment(self) -> dict:
        return self.archive.info() if self.archive is not None else NOT_SAVING

    async def _translate(self, system, user, on_delta, stop, early):
        return await self.translator(system, user, on_delta, stop, early, self._session().target)

    def _refresh_keys(self) -> str:
        """Read the keys now (the settings page may have changed them); returns the Gemini key."""
        gemini_key = settings.key("gemini_api_key")
        self.translator.set_keys(settings.get_api_key(), gemini_key)
        return gemini_key

    async def _compose(self, system, user, on_delta):
        self._refresh_keys()
        return await self.translator.stream_text(system, user, on_delta)

    def set_script(self, script=None, glossary=None) -> None:
        """New script and/or glossary (None = keep): translations and replies use them from now on,
        and every open page shows them."""
        s = self._session()
        if script is not None:
            s.script = clean_text(script)
        if glossary is not None:
            s.glossary = clean_text(glossary)
        self.emit({"type": "script", "script": s.script, "glossary": s.glossary})

    async def gloss_script(self, text: str) -> tuple:
        """補對照 on `text`; when something was filled, the result becomes the saved script, but only
        if the script is still `text` (the result belongs to that version, not to a later edit).
        Returns (script, lines filled); raises TranslateError, ValueError (too long), ScriptChanged."""
        text = clean_text(text)
        script_store.check("講稿", text)
        # The filled script is longer than the original: refuse now what could not be saved afterwards.
        if len(text.encode("utf-8")) * 2 > script_store.MAX_BYTES:
            raise ValueError("講稿太長，無法補對照")
        self._refresh_keys()
        filled, n = await gloss.fill(self.translator.complete, parse_glossary(self._session().glossary), text)
        if n:
            if self._session().script != text:
                raise ScriptChanged("講稿在補對照期間被改過，這次的結果沒有套用，請再按一次")
            script_store.save(script=filled)
            self.set_script(filled)
        return filled, n

    @property
    def listening(self) -> bool:
        return self.task is not None and not self.task.done()

    def emit(self, event: dict) -> None:
        if event.get("type") == "caption":
            self.last_caption = time.monotonic()
            ch = self.channels.get(event.get("who"))
            if ch is not None:
                ch.last_caption = self.last_caption
        for q in self.clients.values():
            q.put_nowait(event)

    def snapshot(self) -> dict:
        s = self._session()
        return {
            "type": "snapshot",
            # The language buttons (lib/live/langs.py): every row; target also offers `none` (不翻譯);
            # mine / theirs = what 不翻譯 and auto fall back to.
            "langs": {"rows": [{"code": l.code, "label": l.label} for l in langs.LANGS], "none": langs.NONE,
                      "mine": langs.MINE, "theirs": langs.THEIRS},
            "segments": [asdict(g) for g in s.segments],
            "status": s.status_text,
            "listening": self.listening,
            "stt": self.stt,
            "usage": self.usage.today(),
            "reply": s.reply,
            "script": s.script,
            "glossary": s.glossary,
            "segment": self._segment(),
            "summary": {k: v for k, v in self.summary.view().items() if k != "type"},
            "speakers": {k: v for k, v in self._speakers_view().items() if k != "type"},
        }

    async def ask(self, system: str, user: str) -> str:
        """One answer from the meeting's language model (Claude, else Gemini); counted in today's usage."""
        self._refresh_keys()
        return await self.translator.complete([{"type": "text", "text": system}], user)

    def transcript_tail(self) -> str:
        """What has been said so far in this page's meeting (finished lines), for 問 AI's context."""
        if self.session is None:
            return ""
        return "\n".join(f"{g.text}\n{g.tr}".strip() for g in self.session.segments if g.final)

    # ---- listening ----

    async def start(self, owner, stt: str, listen: str, pause_min: float = PAUSE_MIN, end_min: float = END_MIN,
                    save: bool = False, summary: bool = False, summary_min: float = DEFAULT_EVERY_MIN,
                    target: str = langs.MINE, stt_me: str = None, live_speakers: bool = False) -> None:
        """`save`: keep the recording and transcript in OwnVoice's folder format (archive.py);
        `summary`: the live summary (paid model call every `summary_min` minutes, summary.py). Both off unless asked.
        `stt_me`: two channels (proto 2), the user's own microphone recognised by `stt_me`, the others by `stt`.
        `live_speakers`: tell the others apart while listening (lib/live/speakers.py; free, needs the GPU)."""
        # No await between this check and `self.task = ...`: two pages pressing 聆聽 at once must not
        # both get through (the first task would be orphaned and keep a paid connection open).
        if self.listening:
            return
        session = self._session()
        if self.finalizing is not None:
            return self._refuse("上一場還在收尾存檔，幾秒後再按「聆聽」")
        kinds = {"them": stt} if stt_me is None else {"me": stt_me, "them": stt}
        if any(k not in STT for k in kinds.values()):
            return self._refuse(f"不認得的辨識方式：{'、'.join(kinds.values())}")
        if listen not in langs.listen_codes() or target not in langs.target_codes():
            return self._refuse(f"不認得的語言：{listen} → {target}")
        gemini_key = self._refresh_keys()
        if "gemini" in kinds.values() and not gemini_key:
            return self._refuse("還沒填 Gemini 金鑰：到「設定」面板填，或改用「本機（免費）」")
        # The GPU rule, in one place: any local channel, or live speakers, claims it once for the whole listening.
        # Speakers alone give way to a batch job holding the GPU (the captions still run).
        note = ""
        if live_speakers and not settings.key("hf_token"):
            live_speakers, note = False, "還沒填 Hugging Face 金鑰（設定面板），這場不即時分講者，字幕照常"
        local = "local" in kinds.values()
        gpu = local or live_speakers
        if gpu and not gpu_gate.acquire_live():
            if local:
                return self._refuse(BUSY_TEXT)
            live_speakers, gpu, note = False, False, "顯卡正在跑會後整理，這場不即時分講者，字幕照常"
        try:
            self._begin(session, owner, stt, listen, target, kinds, gemini_key, local, live_speakers, gpu, note,
                        pause_min, end_min, save, summary, summary_min, stt_me)
        except BaseException:
            # Nothing after the claim may keep it: a listening that did not start gives the GPU back, after
            # closing a recognizer it already created (its model may be loading).
            if self.task is None or self.task.done():
                if self.recognizer is not None:
                    self.closing = asyncio.ensure_future(self._close(self.recognizer, None, gpu))
                elif gpu:
                    gpu_gate.release_live()
            raise

    def _begin(self, session, owner, stt, listen, target, kinds, gemini_key, local, live_speakers, gpu, note,
               pause_min, end_min, save, summary, summary_min, stt_me) -> None:
        """The rest of start(), after the GPU claim (start() gives the claim back if this raises)."""
        self.task = self.recognizer = None
        session.listen, session.target = listen, target
        self.archive = self._begin_archive(stt, listen, target, stt_me) if save else None
        if self.archive is not None:
            self.archive_task = asyncio.ensure_future(self._archive_loop(self.archive))
        session.seg = 0
        if summary:
            self.summary.begin(summary_min)
        self.summary.on_update = self.archive.set_summary if summary and self.archive is not None else None
        self.emit({"type": "segment", **self._segment()})
        self.owner, self.stt, self.proto = owner, stt, 1 if stt_me is None else 2
        recognizer = self.recognizer = stt_local.Recognizer(session, self.usage) if local else None
        self.last_caption = time.monotonic()      # "quiet for end_min" counts from this listening's start
        self.positions = [0] * len(kinds)          # recording positions when nothing is saved
        self.channels = {}
        for i, (who, kind) in enumerate(kinds.items()):
            # The user's own channel is recognised in whatever language they speak (lib/live/session.py).
            language = "auto" if who == "me" else listen
            if kind == "gemini":
                run = functools.partial(stt_gemini.run, session, self.usage, gemini_key, language, who=who)
                pause = pause_min
            else:
                run = functools.partial(stt_local.run, session, recognizer, language, who=who)
                # Local recognition costs nothing while quiet, and pausing would unload the model:
                # only the end time applies.
                pause = 0
            self.channels[who] = Channel(self, who, i, run, pause)
        session.echo = self._echo if stt_me is not None else None
        self.tracker = None
        if live_speakers:
            self._voices = None
            try:
                saved = self._saved_voices()
            except speakers.VoicesUnreadable as e:
                saved, note = [], f"{e}；這場不認已記住的聲音"
            except ValueError as e:      # the voices file would land in a forbidden folder
                saved, note = None, f"{e}，這場不即時分講者"
            if saved is not None:
                self.tracker = speakers.Tracker(session, self.channels["them"].ring, kinds["them"] == "gemini", saved,
                                                speakers.Embedder(settings.key("hf_token")),
                                                on_change=lambda: self.emit(self._speakers_view()))
            elif gpu and not local:
                gpu_gate.release_live()      # the claim was only for the speakers
                gpu = False
        if note:
            session.status(note)
        if self.tracker is not None:
            self.emit(self._speakers_view())
        self.ticker = asyncio.ensure_future(self._tick())
        self.task = asyncio.ensure_future(self._listen(list(self.channels.values()), end_min, recognizer, self.tracker, gpu))
        # This listening's own archive and ticker: by the time the callback runs `self` may hold the next one's.
        self.task.add_done_callback(functools.partial(self._ended, archive=self.archive, archive_task=self.archive_task, ticker=self.ticker))
        self.emit({"type": "listening", "on": True, "stt": stt})

    def _echo(self, start: float, end: float) -> bool:
        """Is the 「我」 line start..end the others' voice coming back through the microphone (lib/live/echo.py)?"""
        me, them = self.channels.get("me"), self.channels.get("them")
        if me is None or them is None:
            return False
        a, b = int(start * RATE), int(end * RATE)
        return echo.is_echo(me.ring.slice(a, b), them.ring.slice(a, b))

    async def _listen(self, channels: list, end_min: float, recognizer, tracker, gpu: bool) -> None:
        """Every channel until it ends; then the shared local recognizer finishes, the live speakers are
        grouped once more (written to the session before it is saved the last time), and the GPU claim goes."""
        try:
            ended = await asyncio.gather(*(c.supervise(idle.minutes(end_min)) for c in channels))
            if any(ended):
                self._session().status(f"安靜超過 {idle.minutes_label(end_min)} 分鐘，已自動結束聆聽")
        finally:
            # Stop's timeout may cancel this task: the closing runs on in its own task regardless.
            self.closing = asyncio.ensure_future(self._close(recognizer, tracker, gpu))
            await asyncio.shield(self.closing)

    async def _close(self, recognizer, tracker, gpu: bool) -> None:
        """The recognizer's queued sentences and model, then the speakers' regroup and model; each waits
        for a model still loading. Only then is the GPU claim given back."""
        try:
            if recognizer is not None:
                try:
                    await recognizer.close()
                except Exception:
                    log.exception("closing the local recognizer failed")
            if tracker is not None:
                try:
                    await tracker.finish()
                except Exception:
                    log.exception("closing the live speakers failed")
        finally:
            if gpu:
                gpu_gate.release_live()

    def _refuse(self, why: str) -> None:
        """Not started: say why, and tell the page so it lets go of the microphone it already opened."""
        self._session().status(why)
        self.emit({"type": "listening", "on": False, "stt": self.stt})

    def _ended(self, task, archive, archive_task, ticker) -> None:
        if task is not self.task:
            return
        if not task.cancelled() and task.exception() is not None:
            e = task.exception()
            self._session().status(f"聆聽意外結束：{type(e).__name__}: {e}")
        ticker.cancel()
        self.owner = None
        self.usage.flush()
        if archive is not None:
            archive.close_audio()
        self.finalizing = asyncio.ensure_future(self._finalize(archive, archive_task))
        self.emit({"type": "listening", "on": False, "stt": self.stt})
        self.emit({"type": "usage", **self.usage.today()})

    async def _finalize(self, archive, archive_task) -> None:
        """After the speech service is gone: let the translations still running land (waiting, never
        cancelling them: one that is late just leaves its English-only line in the transcript), give the
        summary its last update, then write the last version of every file.
        Nothing here may fail the next listening."""
        try:
            running = set(self._session()._tasks)
            if running:
                await asyncio.wait(running, timeout=DRAIN_TIMEOUT)
            try:
                await asyncio.wait_for(asyncio.shield(self.summary.finish()), SUMMARY_TIMEOUT)
            except asyncio.TimeoutError:
                pass
            if self.closing is not None:
                # The regrouped speakers go into the last save.
                await asyncio.wait({self.closing}, timeout=CLOSE_TIMEOUT)
            if archive is not None:
                archive.end()
        finally:
            if archive_task is not None:
                archive_task.cancel()
            if self.archive is archive:
                self.archive = self.archive_task = None
            self.finalizing = None
            self.emit({"type": "segment", **NOT_SAVING})
            if self.tracker is not None:
                # Its vectors stay no longer than the listening; the page shows speakers off.
                self.tracker = None
                self.emit(self._speakers_view())

    async def _tick(self) -> None:
        while True:
            await asyncio.sleep(USAGE_EVERY)
            self.emit({"type": "usage", **self.usage.today()})
            if self.summary.enabled:
                self.summary.tick()

    async def _archive_loop(self, archive: Archive) -> None:
        while True:
            await asyncio.sleep(ARCHIVE_TICK)
            try:
                archive.tick()
            except Exception:
                # One failed write must not end the writing for the rest of the meeting.
                log.exception("archive tick failed")

    def _put(self, queue: asyncio.Queue, item) -> None:
        """Into a queue on the way to the speech service; when it is full (the service fell behind) the
        oldest chunk goes, and is reported lost (the saved session's dropped_sec)."""
        if queue.full():
            old = queue.get_nowait()
            if old:
                self._session().lost(len(old[1]) // 2 / RATE)
        queue.put_nowait(item)

    def feed(self, sender, data: bytes) -> None:
        if not self.listening or sender is not self.owner:
            return
        frame = parse_frame(data, self.proto)
        ch = self.channels.get(frame[0]) if frame is not None else None
        if ch is None:
            return
        pcm = frame[1]
        # Saving: the recording says where the chunk lands (silence it filled in for a break counts).
        if self.archive is not None:
            at = self.archive.feed(pcm, ch.index)
        elif len(self.positions) == 2:
            at, _ = align_stereo(self.positions, ch.index, len(pcm) // 2)
        else:
            at, self.positions[0] = self.positions[0], self.positions[0] + len(pcm) // 2
        if self.proto == 2 or (self.tracker is not None and ch.who == "them"):
            ch.ring.add(at, pcm)
        if not ch.closed:
            self._put(ch.audio, (at, pcm))   # a channel whose recogniser gave up takes no more (not "lost" audio)

    async def stop(self) -> None:
        if not self.listening:
            return
        task = self.task
        for ch in self.channels.values():
            self._put(ch.audio, None)
        done, _ = await asyncio.wait({task}, timeout=STOP_TIMEOUT)
        if not done:
            task.cancel()
        self._session().status("已停止")

    # ---- one page ----

    async def serve(self, ws) -> None:
        """`ws` is an accepted starlette WebSocket."""
        out = asyncio.Queue()
        self.clients[ws] = out
        out.put_nowait(self.snapshot())
        sender = asyncio.ensure_future(self._send(ws, out))
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes") is not None:
                    self.feed(ws, msg["bytes"])
                elif msg.get("text"):
                    await self._command(ws, msg["text"])
        finally:
            sender.cancel()
            del self.clients[ws]
            if ws is self.owner:
                # The page that was sending the audio is gone: nothing left to listen to.
                await self.stop()

    async def _send(self, ws, out: asyncio.Queue) -> None:
        try:
            while True:
                await ws.send_text(json.dumps(await out.get(), ensure_ascii=False))
        except Exception:
            # An event that cannot be sent must not leave a socket that is open but silent: close it,
            # so the page reconnects (and gets a fresh snapshot).
            log.exception("event send failed; closing this page's socket")
            try:
                await ws.close()
            except Exception:
                pass

    def _segment_command(self, kind: str, name) -> None:
        name = clean_text(name) if isinstance(name, str) else None
        if not self.listening or self.archive is None:
            return self._session().status("要先按「聆聽」並開啟「存檔」，才能分段")
        try:
            info = self.archive.next_segment(name) if kind == "segment-next" else self.archive.rename_segment(name)
        except ValueError as e:
            return self._session().status(str(e))
        self._segment_changed(info)

    def _speaker_command(self, kind: str, cmd: dict) -> None:
        """Renames are for this listening (until it is saved the last time); saved voices outlive it."""
        s, t = self._session(), self.tracker
        if kind == "voice-delete":
            try:
                speakers.delete_voice(speakers.Voices(), t.clusters if t is not None else None, str(cmd.get("id", "")))
            except (OSError, ValueError, speakers.VoicesUnreadable) as e:
                return s.status(f"刪不掉這個聲音：{e}")
            finally:
                self._voices = None
            if t is not None:
                for line, (who, guess) in t.clusters.labels().items():
                    s.label(line, who, guess)
            return self.emit(self._speakers_view())
        if t is None or not (self.listening or self.finalizing is not None):
            return s.status("要在開了「即時分講者」的聆聽中（或剛停止、還在存檔時）才能改名或記住聲音")
        if t.regrouping:
            return s.status("正在重新分出講者，幾秒後再改")
        name = clean_text(str(cmd.get("name", ""))).strip()[:NAME_MAX].strip()
        if not name:
            return s.status("名字不能是空的")
        if kind == "speaker-rename":
            if t.clusters.rename(str(cmd.get("old", "")), name):
                for line, (who, guess) in t.clusters.labels().items():
                    s.label(line, who, guess)
            return self.emit(self._speakers_view())
        centre = t.clusters.centre_of(name)
        if centre is None:
            return s.status(f"「{name}」還沒有足夠的聲音可以記住")
        try:
            item = speakers.Voices().save(name, centre)
        except (OSError, ValueError, speakers.VoicesUnreadable) as e:
            return s.status(f"記不住這個聲音：{e}")
        finally:
            self._voices = None
        t.clusters.remember(name, item)
        s.status(f"記住了「{name}」的聲音（只存聲紋與名字，不存錄音）")
        self.emit(self._speakers_view())

    async def _command(self, ws, text: str) -> None:
        try:
            cmd = json.loads(text)
            kind = cmd["type"]
        except (ValueError, KeyError, TypeError):
            return
        if kind == "start":
            await self.start(ws, str(cmd.get("stt", "")), str(cmd.get("listen", langs.THEIRS))[:16],
                             _minutes(cmd.get("pause_min"), PAUSE_MIN), _minutes(cmd.get("end_min"), END_MIN),
                             cmd.get("save") is True, cmd.get("summary") is True,
                             min(max(_minutes(cmd.get("summary_min"), DEFAULT_EVERY_MIN), 1.0), 60.0),
                             str(cmd.get("target", langs.MINE))[:16],
                             str(cmd.get("stt_me", ""))[:16] if cmd.get("proto") == 2 else None,
                             cmd.get("speakers") is True)
        elif kind == "stop":
            await self.stop()
        elif kind in ("segment-next", "segment-rename"):
            self._segment_command(kind, cmd.get("name"))
        elif kind in ("speaker-rename", "voice-save", "voice-delete"):
            self._speaker_command(kind, cmd)
        elif kind == "clear":
            self._session().clear()
        elif kind == "reply":
            zh = clean_text(str(cmd.get("zh", ""))).strip()[:REPLY_MAX].strip()
            if zh:
                s = self._session()
                # While listening or closing out (the last summary still runs), the languages it started with.
                if not self.listening and self.finalizing is None:
                    s.listen, s.target = settings.pref("listen"), settings.pref("target")
                s.compose_reply(zh)


class Channel:
    """One audio source on its way to its recogniser: its queue, its idle gate (a quiet Gemini channel is
    let go and comes back when someone speaks, idle.py) and its recogniser task. `index`: its channel in
    the recording (0 = the only one, or left = 我; 1 = right = 對方)."""

    def __init__(self, hub: "Hub", who: str, index: int, run, pause_min: float):
        self.hub, self.who, self.index, self.run, self.pause_min = hub, who, index, run, pause_min
        self.audio = asyncio.Queue(maxsize=AUDIO_QUEUE)
        self.closed = False              # its recogniser ended (stopped, or gave up on its own)
        self.ring = echo.Ring()          # recent audio, for the echo guard (two channels only)
        self.last_caption = time.monotonic()

    async def supervise(self, end_after) -> bool:
        """Until stopped or quiet too long (every channel quiet for `end_after` seconds: then True)."""
        hub, session = self.hub, self.hub._session()
        gate = idle.Gate(idle.minutes(self.pause_min), None)
        self.last_caption = time.monotonic()
        inner = task = None

        def begin(first):
            nonlocal inner, task
            inner = asyncio.Queue(maxsize=AUDIO_QUEUE)
            for c in first:
                inner.put_nowait(c)
            task = asyncio.ensure_future(self.run(inner))

        async def end():
            nonlocal inner, task
            if task is None:
                return
            hub._put(inner, None)
            await task
            inner = task = None

        begin([])
        try:
            while True:
                try:
                    item = await asyncio.wait_for(self.audio.get(), IDLE_TICK)
                except asyncio.TimeoutError:
                    item = ()
                if item is None:
                    await end()
                    return False
                if task is not None and task.done():
                    return False  # the speech service gave up on its own (a rejected key, say) and said why
                now = time.monotonic()
                if end_after is not None and now - hub.last_caption >= end_after:
                    await end()
                    return True
                quiet = now - self.last_caption
                step, payload = gate.on_chunk(item, idle.rms(item[1]), quiet) if item else gate.on_tick(quiet)
                if step == idle.FORWARD:
                    hub._put(inner, payload)
                elif step == idle.PAUSE:
                    await end()
                    session.status(f"已暫停辨識：安靜超過 {idle.minutes_label(self.pause_min)} 分鐘，不再送出聲音、不計費；有人說話會自動接上")
                elif step == idle.RESUME:
                    session.status("有聲音，重新連線中…")
                    begin(payload)
        finally:
            self.closed = True
            if task is not None and not task.done():
                task.cancel()
