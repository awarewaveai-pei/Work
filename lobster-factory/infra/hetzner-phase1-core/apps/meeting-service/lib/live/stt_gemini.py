# Ported from OwnVoice Meet src-tauri/src/gemini.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Speech-to-text over the Gemini Live API (WebSocket, BidiGenerateContent) with a transcription model.
  setup { model, generationConfig.responseModalities, inputAudioTranscription.languageCodes }
  realtimeInput.audio { data: base64 16-bit 16 kHz mono PCM, mimeType "audio/pcm;rate=16000" }
  serverContent.interimInputTranscription.text  live hypothesis while someone talks (gray)
  serverContent.inputTranscription.text         finalized text at a pause
A session streams for up to 10 minutes, so it is replaced before that, at a pause when possible.

`audio` carries (start in the recording in samples, bytes of 16 kHz mono PCM16 little-endian) or None
(= stop). Gemini says nothing about when words were spoken: a line starts and ends where the recording
had been sent up to when its text arrived (late by Gemini's delay). The key lives only in the
connection URL; every message shown to the user or raised has it scrubbed."""
import asyncio
import base64
import json
import re
import time

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from lib.live.respace import Respace
from lib.live.sentences import DROP, FINAL, INTERIM, Tracker

RATE = 16_000
MODEL = "gemini-3.5-transcribe-live"
ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
ROTATE_AT_PAUSE = 9 * 60
ROTATE_ANYWAY = 9 * 60 + 50
SETUP_TIMEOUT = 10
SILENCE_AFTER = 0.25
TICK = 0.1
DRAIN_AFTER_STOP = 1.5
CHUNK_BYTES = RATE // 10 * 2

_ROTATE = "rotate"
_AUDIO_CLOSED = "audio_closed"


class _Fatal(Exception):
    pass


class _Retry(Exception):
    pass


def _scrub(text: str, key: str) -> str:
    text = re.sub(r"([?&]key=)[^&\s'\"]+", r"\1***", str(text))
    return text.replace(key, "***") if key else text


class Live:
    """Which caption line the live hypothesis belongs to; one per listening run, across reconnects.
    Gemini ends a turn only at a pause, and its interim text is the whole turn so far: speech without
    pauses would grow one line for minutes. The turn is cut into sentences as they settle
    (sentences.py), so each sentence gets its own line, translation and transcript entry."""

    def __init__(self, session, clock=time.monotonic):
        self.session = session
        self.clock = clock
        self.current = None
        self.spacing = Respace()
        self.tracker = Tracker()
        self.text = ""   # the turn's hypothesis so far
        self.sent = 0    # the recording position (samples) streamed so far

    def handle(self, v: dict) -> None:
        sc = v.get("serverContent")
        if not isinstance(sc, dict):
            return
        interim = sc.get("interimInputTranscription")
        if isinstance(interim, dict) and isinstance(interim.get("text"), str):
            self.interim(interim["text"].strip())
        final = sc.get("inputTranscription")
        if isinstance(final, dict) and isinstance(final.get("text"), str):
            self.finish(final["text"].strip())

    def interim(self, text: str) -> None:
        if not text:
            return
        self.text = self.spacing.fix(text)
        self._apply(self.tracker.update(self.text, self.clock()))

    def tick(self) -> None:
        """Time passed without a new hypothesis: a sentence end may have settled."""
        if self.text:
            self._apply(self.tracker.update(self.text, self.clock()))

    def finish(self, text: str) -> None:
        """The turn ended: what is left of it is finished, a sentence at a time."""
        self.spacing.reset()
        if text and not self.tracker.follows(text):
            # The final text rewrote words already finished (interim glues words, "oldbuild"): going on
            # from it would repeat or skip a sentence. What was heard so far is finished instead.
            text = self.text
        if text:
            self._apply(self.tracker.update(text, self.clock(), final=True))
        if self.current is not None:
            # Nothing final came of the rest of the hypothesis: the gray line is dropped.
            line, self.current = self.current, None
            self.session.finish(line, "", self._now())
        self.tracker = Tracker()
        self.text = ""

    def close(self) -> None:
        """Listening stopped before Gemini ended the turn: finish what was heard."""
        if self.text:
            self.finish(self.text)

    def _now(self) -> float:
        return self.sent / RATE

    def _apply(self, events) -> None:
        for kind, text in events:
            if kind == INTERIM:
                if self.current is None:
                    self.current = self.session.open(self._now())
                self.session.interim(self.current, text)
            elif kind == FINAL:
                line = self.current if self.current is not None else self.session.open(self._now())
                self.current = None
                self.session.finish(line, text, self._now())
            elif kind == DROP and self.current is not None:
                line, self.current = self.current, None
                self.session.finish(line, "", self._now())


def _parse(raw):
    """JSON from a text or binary frame (the Live API sends JSON in binary frames too)."""
    if isinstance(raw, (bytes, bytearray)):
        raw = bytes(raw).decode("utf-8", errors="replace")
    try:
        v = json.loads(raw)
    except ValueError:
        return None
    return v if isinstance(v, dict) else None


def _close_reason(e: ConnectionClosed):
    """'code reason' of the close frame the server sent, None if the connection just dropped."""
    if e.rcvd is None:
        return None
    return f"{e.rcvd.code} {e.rcvd.reason}"


def audio_message(chunk: bytes) -> str:
    data = base64.b64encode(chunk).decode("ascii")
    return json.dumps({"realtimeInput": {"audio": {"data": data, "mimeType": "audio/pcm;rate=16000"}}})


async def _wait_setup(ws):
    while True:
        try:
            raw = await ws.recv()
        except ConnectionClosed as e:
            reason = _close_reason(e)
            if reason is None:
                raise _Retry("closed during setup")
            raise _Fatal(f"closed during setup: {reason}")
        v = _parse(raw)
        if v is not None and "setupComplete" in v:
            return


async def _close(ws):
    try:
        await ws.close()
    except Exception:
        pass


async def _connect(key: str, language: str):
    """Open a socket, send the setup and wait for setupComplete."""
    try:
        ws = await connect(f"{ENDPOINT}?key={key}")
    except InvalidStatus as e:
        code = e.response.status_code
        body = (e.response.body or b"").decode("utf-8", errors="replace")[:200]
        msg = f"HTTP {code} {body}"
        raise (_Fatal if code in (401, 403, 404) else _Retry)(msg)
    except Exception as e:
        raise _Retry(f"{type(e).__name__}: {e}")
    # langs.py code; auto = no hint (Gemini decides; the line's language then comes from its script).
    languages = [] if language in ("", "auto") else [language]
    setup = {
        "setup": {
            "model": f"models/{MODEL}",
            "generationConfig": {"responseModalities": ["TEXT"]},
            "inputAudioTranscription": {"languageCodes": languages},
        }
    }
    try:
        await ws.send(json.dumps(setup))
        # A bad key or model closes the socket here, with the reason in the close frame.
        await asyncio.wait_for(_wait_setup(ws), SETUP_TIMEOUT)
    except asyncio.TimeoutError:
        await _close(ws)
        raise _Retry("setup timed out")
    except ConnectionClosed as e:
        await _close(ws)
        raise _Retry(f"closed during setup: {e}")
    except BaseException:
        await _close(ws)
        raise
    return ws


async def _read(ws, live: Live, state: dict):
    """Handle server messages until the socket closes; returns the close reason (None = dropped)."""
    while True:
        try:
            raw = await ws.recv()
        except ConnectionClosed as e:
            return _close_reason(e)
        v = _parse(raw)
        if v is None:
            continue
        if "goAway" in v:
            state["going_away"] = True
        live.handle(v)


def _after_reader(reader, started: float, clock):
    try:
        reason = reader.result()
    except Exception as e:
        raise _Retry(f"{type(e).__name__}: {e}")
    if reason is None:
        raise _Retry("connection ended")
    if clock() - started > ROTATE_AT_PAUSE:
        return _ROTATE
    raise _Retry(f"closed: {reason}")


async def _session(session, usage, key: str, language: str, audio: asyncio.Queue, live: Live, clock=time.monotonic):
    ws = await _connect(key, language)
    reader = None
    try:
        session.status("聆聽中（Gemini Live）")
        started = last_audio = last_tick = clock()
        state = {"going_away": False}
        reader = asyncio.ensure_future(_read(ws, live, state))
        silence = bytes(CHUNK_BYTES)
        while True:
            if reader.done():
                return _after_reader(reader, started, clock)
            try:
                item = await asyncio.wait_for(audio.get(), TICK)
            except asyncio.TimeoutError:
                item = ()
            if item is None:
                # Listening stopped: end the stream and give the last words a moment to arrive.
                try:
                    await ws.send(json.dumps({"realtimeInput": {"audioStreamEnd": True}}))
                    await asyncio.wait({reader}, timeout=DRAIN_AFTER_STOP)
                except ConnectionClosed:
                    pass
                return _AUDIO_CLOSED
            if item:
                at, chunk = item
                last_audio = clock()
                await ws.send(audio_message(chunk))
                live.sent = at + len(chunk) // 2
                # Gemini bills every second streamed, silence included.
                usage.add_audio("gemini-live", len(chunk) / 2 / RATE)
            now = clock()
            if now - last_tick >= TICK:
                last_tick = now
                live.tick()
                if now - last_audio > SILENCE_AFTER:
                    await ws.send(audio_message(silence))
                    usage.add_audio("gemini-live", len(silence) / 2 / RATE)
                quiet = live.current is None
                elapsed = now - started
                if (state["going_away"] and quiet) or (elapsed > ROTATE_AT_PAUSE and quiet) or elapsed > ROTATE_ANYWAY:
                    return _ROTATE
    except ConnectionClosed as e:
        raise _Retry(f"closed: {e}")
    finally:
        if reader is not None and not reader.done():
            reader.cancel()
        await _close(ws)


def _drain(audio: asyncio.Queue, session) -> bool:
    """Empty the queue, reporting the audio as lost; True if the stop marker (None) was in it."""
    samples = 0
    try:
        while True:
            item = audio.get_nowait()
            if item is None:
                return True
            samples += len(item[1]) // 2
    except asyncio.QueueEmpty:
        return False
    finally:
        if samples:
            session.lost(samples / RATE)


async def run(session, usage, key: str, language: str, audio: asyncio.Queue):
    """Run until `audio` yields None (listening stopped), reconnecting as needed."""
    live = Live(session)
    backoff = 1
    while True:
        try:
            end = await _session(session, usage, key, language, audio, live)
        except _Fatal as e:
            session.status(f"Gemini 拒絕連線：{_scrub(e, key)}（請到設定檢查 key 與模型）")
            return
        except Exception as e:
            msg = e if isinstance(e, _Retry) else f"{type(e).__name__}: {e}"
            session.status(f"Gemini 連線中斷：{_scrub(msg, key)}；{backoff} 秒後重試")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
            # Audio from while the line was down is not sent late; a stop asked for meanwhile is honoured.
            if _drain(audio, session):
                return
            continue
        finally:
            # Every connection's end (stop, rotation, a drop, a refusal) ends the turn: a new connection
            # starts its own hypothesis, so what was heard of this one is finished now, never left gray.
            live.close()
        if end == _AUDIO_CLOSED:
            return
        backoff = 1
