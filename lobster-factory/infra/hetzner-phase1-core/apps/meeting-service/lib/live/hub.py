"""The one live meeting of this process, and the browser pages watching it.

A page connects over WebSocket (/api/live/ws). Text frames are JSON commands, binary frames are audio
(16 kHz mono PCM16) from the page that pressed 聆聽. Everything a page shows comes back as JSON events:
the Session's own (caption, caption-remove, status, clear) plus
  {"type":"snapshot","segments":[...],"status":str,"listening":bool,"stt":str,"usage":{...},
   "reply":{id,zh,en,done}|null,"script":str,"glossary":str}
  {"type":"listening","on":bool,"stt":str}      {"type":"usage", ...Usage.today()}
  {"type":"reply","id","zh","en","done"}        {"type":"script","script":str,"glossary":str}
Commands from the page include {"type":"reply","zh":str} (works without listening).
Keys never leave the server: Gemini from the environment, Anthropic from the settings page."""
import asyncio
import json
import os
import time
from urllib.parse import urlsplit

from lib import settings

from . import gloss, idle, script_store, stt_gemini, stt_local
from .prompts import parse_glossary
from .session import Session
from .translate import Translator
from .usage import Usage

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

    # ---- state ----

    def _session(self) -> Session:
        if self.session is None:
            self.session = Session(self._translate, self.emit, compose=self._compose)
            saved = script_store.load()
            self.session.script, self.session.glossary = saved["script"], saved["glossary"]
        return self.session

    async def _translate(self, system, user, on_delta, stop, early):
        return await self.translator(system, user, on_delta, stop, early)

    def _refresh_keys(self) -> str:
        """Read the keys now (the settings page may have changed them); returns the Gemini key."""
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
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
        }

    def transcript_tail(self) -> str:
        """What has been said so far in this page's meeting (finished lines), for 問 AI's context."""
        if self.session is None:
            return ""
        return "\n".join(f"{g.en}\n{g.zh}".strip() for g in self.session.segments if g.final)

    # ---- listening ----

    async def start(self, owner, stt: str, language: str, pause_min: float = PAUSE_MIN, end_min: float = END_MIN) -> None:
        # No await between this check and `self.task = ...`: two pages pressing 聆聽 at once must not
        # both get through (the first task would be orphaned and keep a paid connection open).
        if self.listening:
            return
        session = self._session()
        if stt not in STT:
            return self._refuse(f"不認得的辨識方式：{stt}")
        gemini_key = self._refresh_keys()
        if stt == "gemini" and not gemini_key:
            return self._refuse("這台電腦沒有設定 Gemini 金鑰（環境變數 GEMINI_API_KEY），請改用「本機（免費）」")
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
        self.task = asyncio.ensure_future(self._supervise(run, pause_min, end_min))
        self.task.add_done_callback(self._ended)
        self.ticker = asyncio.ensure_future(self._tick())
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

    def _ended(self, task) -> None:
        if not task.cancelled() and task.exception() is not None:
            e = task.exception()
            self._session().status(f"聆聽意外結束：{type(e).__name__}: {e}")
        if self.ticker is not None:
            self.ticker.cancel()
        self.owner = None
        self.usage.flush()
        self.emit({"type": "listening", "on": False, "stt": self.stt})
        self.emit({"type": "usage", **self.usage.today()})

    async def _tick(self) -> None:
        while True:
            await asyncio.sleep(USAGE_EVERY)
            self.emit({"type": "usage", **self.usage.today()})

    def feed(self, sender, chunk: bytes) -> None:
        if not self.listening or sender is not self.owner:
            return
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
            try:
                await ws.close()
            except Exception:
                pass

    async def _command(self, ws, text: str) -> None:
        try:
            cmd = json.loads(text)
            kind = cmd["type"]
        except (ValueError, KeyError, TypeError):
            return
        if kind == "start":
            await self.start(ws, str(cmd.get("stt", "")), str(cmd.get("language", "en-US"))[:16],
                             _minutes(cmd.get("pause_min"), PAUSE_MIN), _minutes(cmd.get("end_min"), END_MIN))
        elif kind == "stop":
            await self.stop()
        elif kind == "clear":
            self._session().clear()
        elif kind == "reply":
            zh = clean_text(str(cmd.get("zh", ""))).strip()[:REPLY_MAX].strip()
            if zh:
                self._session().compose_reply(zh)
