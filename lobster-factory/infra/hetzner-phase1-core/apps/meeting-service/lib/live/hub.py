"""The one live meeting of this process, and the browser pages watching it.

A page connects over WebSocket (/api/live/ws). Text frames are JSON commands, binary frames are audio
(16 kHz mono PCM16) from the page that pressed 聆聽. Everything a page shows comes back as JSON events:
the Session's own (caption, caption-remove, status, clear) plus
  {"type":"snapshot","segments":[...],"status":str,"listening":bool,"stt":str,"usage":{...}}
  {"type":"listening","on":bool,"stt":str}      {"type":"usage", ...Usage.today()}
Keys never leave the server: Gemini from the environment, Anthropic from the settings page."""
import asyncio
import json
import os
from urllib.parse import urlsplit

from lib import settings

from . import stt_gemini, stt_local
from .session import Session
from .translate import Translator
from .usage import Usage

STT = ("gemini", "local")
# 10 s of 100 ms chunks; when the speech service falls behind, the oldest audio goes.
AUDIO_QUEUE = 100
USAGE_EVERY = 5.0
STOP_TIMEOUT = 5.0
LOCAL_HOSTS = ("127.0.0.1", "localhost")


def origin_allowed(origin: str, host: str) -> bool:
    """Only this service's own pages may open the socket. Without this, any web page open in the
    browser could connect to 127.0.0.1, read the captions and start paid listening."""
    try:
        o = urlsplit(origin or "")
    except ValueError:
        return False
    return o.scheme == "http" and bool(host) and o.netloc == host and o.hostname in LOCAL_HOSTS


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

    # ---- state ----

    def _session(self) -> Session:
        if self.session is None:
            self.session = Session(self._translate, self.emit)
        return self.session

    async def _translate(self, system, user, on_delta, stop, early):
        return await self.translator(system, user, on_delta, stop, early)

    @property
    def listening(self) -> bool:
        return self.task is not None and not self.task.done()

    def emit(self, event: dict) -> None:
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
        }

    # ---- listening ----

    async def start(self, owner, stt: str, language: str) -> None:
        # No await between this check and `self.task = ...`: two pages pressing 聆聽 at once must not
        # both get through (the first task would be orphaned and keep a paid connection open).
        if self.listening:
            return
        session = self._session()
        if stt not in STT:
            return self._refuse(f"不認得的辨識方式：{stt}")
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if stt == "gemini" and not gemini_key:
            return self._refuse("這台電腦沒有設定 Gemini 金鑰（環境變數 GEMINI_API_KEY），請改用「本機（免費）」")
        self.translator.set_keys(settings.get_api_key(), gemini_key)
        self.audio = asyncio.Queue(maxsize=AUDIO_QUEUE)
        self.owner, self.stt = owner, stt
        if stt == "gemini":
            run = stt_gemini.run(session, self.usage, gemini_key, language, self.audio)
        else:
            run = stt_local.run(session, self.usage, language, self.audio)
        self.task = asyncio.ensure_future(run)
        self.task.add_done_callback(self._ended)
        self.ticker = asyncio.ensure_future(self._tick())
        self.emit({"type": "listening", "on": True, "stt": stt})

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
        while True:
            await ws.send_text(json.dumps(await out.get(), ensure_ascii=False))

    async def _command(self, ws, text: str) -> None:
        try:
            cmd = json.loads(text)
            kind = cmd["type"]
        except (ValueError, KeyError, TypeError):
            return
        if kind == "start":
            await self.start(ws, str(cmd.get("stt", "")), str(cmd.get("language", "en-US"))[:16])
        elif kind == "stop":
            await self.stop()
        elif kind == "clear":
            self._session().clear()
