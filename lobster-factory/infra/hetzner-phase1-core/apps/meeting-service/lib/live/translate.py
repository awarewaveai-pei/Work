# Ported from OwnVoice Meet src-tauri/src/llm.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Language model calls over two wire formats, plain HTTP (no SDK):
  anthropic  Claude Messages API with streaming: `content_block_delta`/`text_delta` events carry text,
             `message_start` / `message_delta` carry usage.
  gemini     Gemini's OpenAI-compatible Chat Completions with streaming: `choices[0].delta.content`
             carries text; with stream_options.include_usage the last chunk carries usage.
Keys are passed in; nothing is read from the environment."""
import json
import threading
from typing import Callable, Optional

import httpx

from .usage import Tally, Usage
from .langs import MINE, taiwan

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GEMINI_COMPAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

ANTHROPIC_MODEL = "claude-haiku-5-5"
ANTHROPIC_EFFORT = "low"
GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_EFFORT = "minimal"


class TranslateError(Exception):
    """A translation that failed; the message is shown to the user."""


def _get(v, *path):
    """v[path...] where any missing step gives None (serde_json indexing)."""
    for p in path:
        if isinstance(p, int):
            v = v[p] if isinstance(v, list) and -len(v) <= p < len(v) else None
        else:
            v = v.get(p) if isinstance(v, dict) else None
    return v


def _u64(v) -> int:
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else 0


def anthropic_event(ev: dict, usage: Tally, on_delta: Callable[[str], None]) -> None:
    kind = _get(ev, "type")
    if kind == "message_start":
        u = _get(ev, "message", "usage")
        usage.input = _u64(_get(u, "input_tokens"))
        usage.cached = _u64(_get(u, "cache_read_input_tokens"))
        usage.cache_write = _u64(_get(u, "cache_creation_input_tokens"))
    elif kind == "content_block_delta" and _get(ev, "delta", "type") == "text_delta":
        t = _get(ev, "delta", "text")
        if isinstance(t, str):
            on_delta(t)
    elif kind == "message_delta":
        o = _get(ev, "usage", "output_tokens")
        if isinstance(o, int) and not isinstance(o, bool) and o >= 0:
            usage.output = o
        if _get(ev, "delta", "stop_reason") == "refusal":
            on_delta(" [declined]")
    elif kind == "error":
        msg = _get(ev, "error", "message")
        raise TranslateError(msg if isinstance(msg, str) else "stream error")


def openai_event(ev: dict, usage: Tally, on_delta: Callable[[str], None]) -> None:
    if "error" in ev:
        msg = _get(ev, "error", "message")
        raise TranslateError(msg if isinstance(msg, str) else "stream error")
    t = _get(ev, "choices", 0, "delta", "content")
    if isinstance(t, str):
        on_delta(t)
    u = _get(ev, "usage")
    if isinstance(u, dict):
        prompt = _u64(_get(u, "prompt_tokens"))
        cached = _u64(_get(u, "prompt_tokens_details", "cached_tokens"))
        usage.input = max(prompt - cached, 0)
        usage.cached = cached
        usage.output = _u64(_get(u, "completion_tokens"))


def error_message(text: str) -> str:
    """The readable part of an error body: {"error":{"message"}} (Anthropic) or a list of those
    (Gemini), else the raw text."""
    try:
        v = json.loads(text)
    except ValueError:
        v = None
    e = _get(v, 0, "error") if isinstance(v, list) else _get(v, "error")
    msg = _get(e, "message")
    return msg if isinstance(msg, str) else text


class Translator:
    """`await translator(system, user, on_delta, stop, early)` is the contract Session expects.
    `on_delta` gets the whole translation so far each time text arrives (Taiwan Traditional when the
    target is Chinese: langs.taiwan)."""

    def __init__(self, usage: Usage, anthropic_key: str, gemini_key: str):
        self._usage = usage
        self._anthropic_key = anthropic_key
        self._gemini_key = gemini_key
        self._client: Optional[httpx.AsyncClient] = None

    def set_keys(self, anthropic_key: str, gemini_key: str) -> None:
        """Keys can change between meetings (the settings page); requests already running keep theirs."""
        self._anthropic_key = anthropic_key
        self._gemini_key = gemini_key

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
        return self._client

    def _use_anthropic(self) -> bool:
        """True for Anthropic, False for Gemini (used when only that key is set)."""
        if self._anthropic_key:
            return True
        if self._gemini_key:
            return False
        raise TranslateError("還沒有設定翻譯用的金鑰（Anthropic 或 Gemini），請先到設定頁填寫")

    def _request(self, anthropic: bool, system: list, user: str) -> tuple:
        if anthropic:
            body = {
                "model": ANTHROPIC_MODEL,
                "max_tokens": 4000,
                "stream": True,
                "system": system,
                "messages": [{"role": "user", "content": user}],
                "output_config": {"effort": ANTHROPIC_EFFORT},
            }
            headers = {"x-api-key": self._anthropic_key, "anthropic-version": "2023-06-01"}
            return ANTHROPIC_URL, headers, body
        # Chat Completions has no cache_control: the system blocks become one system message.
        system_text = "\n\n".join(b["text"] for b in system if isinstance(b.get("text"), str))
        body = {
            "model": GEMINI_MODEL,
            "stream": True,
            "stream_options": {"include_usage": True},
            "messages": [{"role": "system", "content": system_text}, {"role": "user", "content": user}],
            "reasoning_effort": GEMINI_EFFORT,
        }
        return GEMINI_COMPAT_URL, {"Authorization": f"Bearer {self._gemini_key}"}, body

    async def _stream(self, system: list, user: str, on_text: Callable[[str], None], stop: Optional[threading.Event]) -> tuple:
        """Stream one completion; `on_text` gets each piece as it arrives. Returns (model id, Tally),
        ending early (with the usage known so far) once `stop` is set. Raises TranslateError."""
        anthropic = self._use_anthropic()
        url, headers, body = self._request(anthropic, system, user)
        event = anthropic_event if anthropic else openai_event
        usage = Tally()
        connected = False
        try:
            async with self._http().stream("POST", url, headers=headers, json=body) as resp:
                connected = True
                if not 200 <= resp.status_code < 300:
                    text = (await resp.aread()).decode("utf-8", errors="replace")
                    raise TranslateError(f"{resp.status_code} {resp.reason_phrase}: {error_message(text)[:300]}")
                # Bytes, not text: a Chinese character can be split across two network chunks.
                buf = b""
                async for chunk in resp.aiter_bytes():
                    if stop is not None and stop.is_set():
                        break  # leaving the block closes the request
                    buf += chunk
                    while True:
                        end = buf.find(b"\n")
                        if end < 0:
                            break
                        line = buf[:end].decode("utf-8", errors="replace").rstrip("\r")
                        buf = buf[end + 1:]
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].lstrip()
                        if data == "[DONE]":
                            continue
                        try:
                            ev = json.loads(data)
                        except ValueError:
                            continue
                        if isinstance(ev, dict):
                            event(ev, usage, on_text)
        except httpx.HTTPError as e:
            raise TranslateError(f"{'stream' if connected else 'network'}: {str(e) or type(e).__name__}") from None
        return (ANTHROPIC_MODEL if anthropic else GEMINI_MODEL), usage

    async def __call__(self, system: list, user: str, on_delta: Callable[[str], None], stop: threading.Event, early: bool,
                       target: str = MINE) -> str:
        zh = ""

        def on_text(d: str) -> None:
            nonlocal zh
            zh += d
            on_delta(taiwan(zh, target))

        self._use_anthropic()  # a missing key is its own message, not "translation failed"
        try:
            model, usage = await self._stream(system, user, on_text, stop)
        except TranslateError as e:
            raise TranslateError(f"翻譯失敗：{e}") from None
        usage.early = int(early)
        self._usage.add_tokens(model, usage)
        return taiwan(zh, target)

    async def stream_text(self, system: list, user: str, on_delta: Optional[Callable[[str], None]] = None) -> str:
        """One completion as the model wrote it (no Chinese conversion: for English replies); `on_delta`
        gets the whole text so far each time more arrives. Usage is recorded. Raises TranslateError."""
        text = ""

        def on_text(d: str) -> None:
            nonlocal text
            text += d
            if on_delta is not None:
                on_delta(text)

        model, usage = await self._stream(system, user, on_text, None)
        self._usage.add_tokens(model, usage)
        return text

    async def complete(self, system: list, user: str, target: str = MINE) -> str:
        """The whole answer without streaming it anywhere (summaries, script glosses), in Taiwan
        Traditional Chinese where it is Chinese; raises TranslateError."""
        return taiwan(await self.stream_text(system, user), target)
