"""The one live meeting of this process, and the browser pages watching it.

A page connects over WebSocket (/api/live/ws). Text frames are JSON commands, binary frames are audio
(16 kHz mono PCM16) from the page that pressed 聆聽. Everything a page shows comes back as JSON events:
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
{"type":"start", ..., "save":bool, "summary":bool, "summary_min":number} (both off unless true),
{"type":"segment-next","name":str|null} and {"type":"segment-rename","name":str} (while saving).
Keys never leave the server; they are read through lib/settings.py (settings panel, else environment)."""
import asyncio
import functools
import json
import logging
import time
from urllib.parse import urlsplit

from lib import ownvoice, settings

from . import gloss, idle, script_store, stt_gemini, stt_local
from .archive import Archive, ArchiveError
from .prompts import SUMMARY_SYSTEM, parse_glossary, system_blocks
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
NOT_SAVING = {"index": 0, "name": "", "recording": False, "dir": ""}


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
        self.audio = None
        self.owner = None
        self.stt = ""
        self.last_caption = time.monotonic()
        self.archive = None          # the Archive of the session being saved (until it is closed out)
        self.archive_task = None
        self.finalizing = None       # the task closing out the session that just ended
        self.summary = None

    # ---- state ----

    def _session(self) -> Session:
        if self.session is None:
            s = self.session = Session(self._translate, self.emit, compose=self._compose)
            saved = script_store.load()
            s.script, s.glossary = saved["script"], saved["glossary"]
            self.summary = Summary(self._complete, lambda: system_blocks(SUMMARY_SYSTEM, parse_glossary(s.glossary), s.script), self.emit)
            s.on_open.append(lambda id: self.archive and self.archive.open_line(id))
            s.on_final.append(self._line_final)
            s.on_translated.append(self._line_translated)
            s.on_drop.append(lambda id: self.archive and self.archive.drop_line(id))
            s.on_clear.append(self.summary.clear)
        return self.session

    def _complete(self, system, user):
        return self.translator.complete(system, user)

    def _line_final(self, id: int, en: str) -> None:
        if self.archive is not None:
            self.archive.set_en(id, en)
        self.summary.line_finished(id, en)

    def _line_translated(self, id: int, zh: str) -> None:
        if self.archive is not None:
            self.archive.set_zh(id, zh)
        self.summary.line_translated(id, zh)

    def _problem(self, text: str) -> None:
        self._session().status(text)

    def _begin_archive(self, stt: str):
        """Open the folder for this listening, or say why not and carry on without saving."""
        about = ["收音：瀏覽器（麥克風／電腦聲音）", "辨識：" + ("Gemini Live" if stt == "gemini" else "本機 faster-whisper"),
                 "翻譯：" + (ANTHROPIC_MODEL if settings.get_api_key() else GEMINI_MODEL)]
        try:
            return Archive(ownvoice.base_dir(), about, on_problem=self._problem,
                           on_segment=lambda info: self.emit({"type": "segment", **info}))
        except ArchiveError as e:
            self._session().status(str(e))
            return None

    def _segment(self) -> dict:
        return self.archive.info() if self.archive is not None else NOT_SAVING

    async def _translate(self, system, user, on_delta, stop, early):
        return await self.translator(system, user, on_delta, stop, early)

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
        for q in self.clients.values():
            q.put_nowait(event)

    def snapshot(self) -> dict:
        s = self._session()
        return {
            "type": "snapshot",
            "segments": [{"id": g.id, "en": g.en, "zh": g.zh, "final": g.final} for g in s.segments],
            "status": s.status_text,
            "listening": self.listening,
            "stt": self.stt,
            "usage": self.usage.today(),
            "reply": s.reply,
            "script": s.script,
            "glossary": s.glossary,
            "segment": self._segment(),
            "summary": {k: v for k, v in self.summary.view().items() if k != "type"},
        }

    async def ask(self, system: str, user: str) -> str:
        """One answer from the meeting's language model (Claude, else Gemini); counted in today's usage."""
        self._refresh_keys()
        return await self.translator.complete([{"type": "text", "text": system}], user)

    def transcript_tail(self) -> str:
        """What has been said so far in this page's meeting (finished lines), for 問 AI's context."""
        if self.session is None:
            return ""
        return "\n".join(f"{g.en}\n{g.zh}".strip() for g in self.session.segments if g.final)

    # ---- listening ----

    async def start(self, owner, stt: str, language: str, pause_min: float = PAUSE_MIN, end_min: float = END_MIN,
                    save: bool = False, summary: bool = False, summary_min: float = DEFAULT_EVERY_MIN) -> None:
        """`save`: keep the recording and transcript in OwnVoice's folder format (archive.py);
        `summary`: the live summary (paid model call every `summary_min` minutes, summary.py). Both off unless asked."""
        # No await between this check and `self.task = ...`: two pages pressing 聆聽 at once must not
        # both get through (the first task would be orphaned and keep a paid connection open).
        if self.listening:
            return
        session = self._session()
        if self.finalizing is not None:
            return self._refuse("上一場還在收尾存檔，幾秒後再按「聆聽」")
        if stt not in STT:
            return self._refuse(f"不認得的辨識方式：{stt}")
        gemini_key = self._refresh_keys()
        if stt == "gemini" and not gemini_key:
            return self._refuse("還沒填 Gemini 金鑰：到「設定」面板填，或改用「本機（免費）」")
        self.archive = self._begin_archive(stt) if save else None
        if self.archive is not None:
            self.archive_task = asyncio.ensure_future(self._archive_loop(self.archive))
        if summary:
            self.summary.begin(summary_min)
        self.summary.on_update = self.archive.set_summary if summary and self.archive is not None else None
        self.emit({"type": "segment", **self._segment()})
        self.audio = asyncio.Queue(maxsize=AUDIO_QUEUE)
        self.owner, self.stt = owner, stt
        if stt == "gemini":
            def run(audio):
                return stt_gemini.run(session, self.usage, gemini_key, language, audio)
        else:
            # Local recognition costs nothing while quiet, and pausing would unload the model:
            # only the end time applies.
            pause_min = 0

            def run(audio):
                return stt_local.run(session, self.usage, language, audio)
        self.ticker = asyncio.ensure_future(self._tick())
        self.task = asyncio.ensure_future(self._supervise(run, pause_min, end_min))
        # This listening's own archive and ticker: by the time the callback runs `self` may hold the next one's.
        self.task.add_done_callback(functools.partial(self._ended, archive=self.archive, archive_task=self.archive_task, ticker=self.ticker))
        self.emit({"type": "listening", "on": True, "stt": stt})

    async def _supervise(self, run, pause_min: float, end_min: float) -> None:
        """Sit between the page's audio and the speech service (idle.py): forward audio, let the
        service go when it is quiet, bring it back when someone speaks, end when quiet too long."""
        session = self._session()
        gate = idle.Gate(idle.minutes(pause_min), idle.minutes(end_min))
        self.last_caption = time.monotonic()
        inner = task = None

        def begin(first):
            nonlocal inner, task
            inner = asyncio.Queue(maxsize=AUDIO_QUEUE)
            for c in first:
                inner.put_nowait(c)
            task = asyncio.ensure_future(run(inner))

        async def end():
            nonlocal inner, task
            if task is None:
                return
            if inner.full():
                inner.get_nowait()
            inner.put_nowait(None)
            await task
            inner = task = None

        begin([])
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(self.audio.get(), IDLE_TICK)
                except asyncio.TimeoutError:
                    chunk = b""
                if chunk is None:
                    return await end()
                if task is not None and task.done():
                    return  # the speech service gave up on its own (a rejected key, say) and said why
                quiet = time.monotonic() - self.last_caption
                step, payload = gate.on_chunk(chunk, idle.rms(chunk), quiet) if chunk else gate.on_tick(quiet)
                if step == idle.FORWARD:
                    if inner.full():
                        inner.get_nowait()
                    inner.put_nowait(payload)
                elif step == idle.PAUSE:
                    await end()
                    session.status(f"已暫停辨識：安靜超過 {idle.minutes_label(pause_min)} 分鐘，不再送出聲音、不計費；有人說話會自動接上")
                elif step == idle.RESUME:
                    session.status("有聲音，重新連線中…")
                    begin(payload)
                elif step == idle.END:
                    await end()
                    session.status(f"安靜超過 {idle.minutes_label(end_min)} 分鐘，已自動結束聆聽")
                    return
        finally:
            if task is not None and not task.done():
                task.cancel()

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
            if archive is not None:
                archive.end()
        finally:
            if archive_task is not None:
                archive_task.cancel()
            if self.archive is archive:
                self.archive = self.archive_task = None
            self.finalizing = None
            self.emit({"type": "segment", **NOT_SAVING})

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

    def feed(self, sender, chunk: bytes) -> None:
        if not self.listening or sender is not self.owner:
            return
        if self.archive is not None:
            self.archive.feed(chunk)
        if self.audio.full():
            self.audio.get_nowait()
        self.audio.put_nowait(chunk)

    async def stop(self) -> None:
        if not self.listening:
            return
        task = self.task
        if self.audio.full():
            self.audio.get_nowait()
        self.audio.put_nowait(None)
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
        self.emit({"type": "segment", **info})

    async def _command(self, ws, text: str) -> None:
        try:
            cmd = json.loads(text)
            kind = cmd["type"]
        except (ValueError, KeyError, TypeError):
            return
        if kind == "start":
            await self.start(ws, str(cmd.get("stt", "")), str(cmd.get("language", "en-US"))[:16],
                             _minutes(cmd.get("pause_min"), PAUSE_MIN), _minutes(cmd.get("end_min"), END_MIN),
                             cmd.get("save") is True, cmd.get("summary") is True,
                             min(max(_minutes(cmd.get("summary_min"), DEFAULT_EVERY_MIN), 1.0), 60.0))
        elif kind == "stop":
            await self.stop()
        elif kind in ("segment-next", "segment-rename"):
            self._segment_command(kind, cmd.get("name"))
        elif kind == "clear":
            self._session().clear()
        elif kind == "reply":
            zh = clean_text(str(cmd.get("zh", ""))).strip()[:REPLY_MAX].strip()
            if zh:
                self._session().compose_reply(zh)
