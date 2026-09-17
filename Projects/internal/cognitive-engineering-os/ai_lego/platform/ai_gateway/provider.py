"""LLM provider seam. Anthropic Messages API over the shared egress gate; no SDK dependency.

Traps for future readers:
- The key is read from ``COGNITIVE_OS_ANTHROPIC_API_KEY`` only; a missing key yields ``None`` from
  ``provider_from_env`` and the API answers 503 -- never a fixture "AI".
- ``fetch`` is injectable for tests; production always goes through ``platform.net.egress.fetch_json``
  so ``api.anthropic.com`` must be in the runtime allowlist.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from ai_lego.errors import InvariantViolation
from ai_lego.platform.net.egress import fetch_json

API_KEY_ENV = "COGNITIVE_OS_ANTHROPIC_API_KEY"
MODEL_ENV = "COGNITIVE_OS_AI_MODEL"
DEFAULT_MODEL = "claude-sonnet-5"
ANTHROPIC_HOST = "api.anthropic.com"
ANTHROPIC_MESSAGES_URL = f"https://{ANTHROPIC_HOST}/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_TIMEOUT_SECONDS = 60.0
MAX_OUTPUT_TOKENS = 8192
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class AiCompletion:
    text: str
    model: str
    input_tokens: int
    output_tokens: int


class AiProvider(Protocol):
    model: str

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion: ...


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, *, fetch: Callable[..., dict[str, Any]] | None = None, timeout: float = DEFAULT_TIMEOUT_SECONDS):
        if not isinstance(api_key, str) or not api_key.strip():
            raise InvariantViolation("AI_PROVIDER_KEY_REQUIRED")
        if not isinstance(model, str) or not model.strip():
            raise InvariantViolation("AI_PROVIDER_MODEL_REQUIRED")
        self._api_key = api_key.strip()
        self.model = model.strip()
        self._fetch = fetch or fetch_json
        self._timeout = timeout

    def complete(self, system: str, user: str, *, max_tokens: int = MAX_OUTPUT_TOKENS) -> AiCompletion:
        if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or not 1 <= max_tokens <= MAX_OUTPUT_TOKENS:
            raise InvariantViolation(f"AI_MAX_TOKENS_INVALID: expected 1..{MAX_OUTPUT_TOKENS}, got {max_tokens!r}")
        body = {"model": self.model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": user}]}
        headers = {"x-api-key": self._api_key, "anthropic-version": ANTHROPIC_VERSION}
        payload = self._fetch(ANTHROPIC_MESSAGES_URL, self._timeout, method="POST", headers=headers, body=body, max_bytes=MAX_RESPONSE_BYTES, error_prefix="AI_PROVIDER")
        content = payload.get("content")
        if not isinstance(content, list):
            raise InvariantViolation("AI_PROVIDER_MALFORMED_RESPONSE: content[] missing")
        text = "".join(str(block.get("text", "")) for block in content if isinstance(block, dict) and block.get("type") == "text")
        if not text.strip():
            raise InvariantViolation(f"AI_PROVIDER_EMPTY_RESPONSE: stop_reason={payload.get('stop_reason')!r}")
        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        return AiCompletion(
            text=text,
            model=str(payload.get("model") or self.model),
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
        )


def provider_from_env(environ: dict[str, str] | None = None) -> AnthropicProvider | None:
    """``None`` when no key is configured -- the caller must answer "unconfigured", not fall back."""
    env = os.environ if environ is None else environ
    key = env.get(API_KEY_ENV, "").strip()
    if not key:
        return None
    return AnthropicProvider(key, env.get(MODEL_ENV, "").strip() or DEFAULT_MODEL)
