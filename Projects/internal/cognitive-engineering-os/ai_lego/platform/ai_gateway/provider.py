"""LLM provider seam. Anthropic Messages API over the shared egress gate; no SDK dependency.

Traps for future readers:
- The key is read from ``COGNITIVE_OS_ANTHROPIC_API_KEY`` only; a missing key yields ``None`` from
  ``provider_from_env`` and the API answers 503 -- never a fixture "AI".
- ``fetch`` is injectable for tests; production always goes through ``platform.net.egress.fetch_json``
  so ``api.anthropic.com`` must be in the runtime allowlist.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from ai_lego.errors import InvariantViolation
from ai_lego.platform.net.egress import fetch_json

API_KEY_ENV = "COGNITIVE_OS_ANTHROPIC_API_KEY"
MODEL_ENV = "COGNITIVE_OS_AI_MODEL"
DEFAULT_MODEL = "claude-opus-5-5"
ANTHROPIC_HOST = "api.anthropic.com"
ANTHROPIC_MESSAGES_URL = f"https://{ANTHROPIC_HOST}/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
# claude-opus-5-5 always thinks and effort is its only control; its API default is medium, set here explicitly.
DEFAULT_EFFORT = "medium"
EFFORTS = ("low", "medium", "high", "xhigh", "max")
NO_EFFORT_MODEL_PREFIXES = ("claude-haiku-",)   # effort is a 400 there (COGNITIVE_OS_AI_MODEL may name one)
# A safety-classifier decline is re-run by the API on the model it picks for that category (billed at that
# model's rates; payload["model"] names who answered, which is what the meter prices).
FALLBACK_MODELS = ("claude-opus-5-5", "claude-opus-5", "claude-fable-5-1")
FALLBACK_BETA = "server-side-fallback-2026-07-01"
DEFAULT_TIMEOUT_SECONDS = 60.0
MAX_OUTPUT_TOKENS = 16384   # the gateway's ceiling per call; a caller picks its own limit under it (drafts 6000, interpretations 12288)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
# A tool call can come back with its next argument written inside a string argument, in the model's own call syntax:
# {"summary": "…</summary>\n<parameter name=\"gaps\">[\"…\"]"} and no "gaps" (2026-10-13, SENSE mirror on the page).
LEAKED_ARGUMENT = re.compile(r'\s*(?:</[A-Za-z_][\w-]*>\s*)?<parameter name="([A-Za-z_][\w-]*)">')
CALL_MARKUP = re.compile(r'</?parameter\b|</?invoke\b|</?antml:')


@dataclass(frozen=True)
class AiCompletion:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    stop_reason: str = ""


class ProviderCallError(InvariantViolation):
    """A call the API answered -- and billed -- without a usable answer: cut off by the caller's own max_tokens
    (``AI_ANSWER_TRUNCATED``, reason ``cut_off``: never read as a schema error -- the cap is ours, not the model's fault),
    refused (``AI_PROVIDER_REFUSAL``), empty (``AI_PROVIDER_EMPTY_RESPONSE``) or malformed (``AI_PROVIDER_MALFORMED_RESPONSE``; reason ``usage_unreadable``
    when a usable answer's cost cannot be read); ``usage_known`` is False whenever the tokens are not the real ones. ``input_tokens``/``output_tokens`` are
    what it cost, so a caller can count it and decide whether one more try is worth it (only a cut-off is)."""

    def __init__(self, message: str, *, reason: str, input_tokens: int = 0, output_tokens: int = 0, usage_known: bool = True):
        super().__init__(message)
        self.reason = reason
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.usage_known = usage_known   # False: the answer's usage was missing or unreadable -- meter the worst case


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

    def with_timeout(self, timeout: float) -> "AnthropicProvider":
        """The same key, model and transport with another per-request timeout (a background job that writes a long answer)."""
        return AnthropicProvider(self._api_key, self.model, fetch=self._fetch, timeout=timeout)

    def _post(self, body: dict[str, Any], *, max_tokens: int, effort: str | None) -> dict[str, Any]:
        """One Messages call: the model, effort (unless the model rejects it) and the classifier fallback opt-in are
        set here for every caller. A refusal the fallback could not rescue raises, like a cut-off."""
        if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or not 1 <= max_tokens <= MAX_OUTPUT_TOKENS:
            raise InvariantViolation(f"AI_MAX_TOKENS_INVALID: expected 1..{MAX_OUTPUT_TOKENS}, got {max_tokens!r}")
        effort = DEFAULT_EFFORT if effort is None else effort
        if effort not in EFFORTS:
            raise InvariantViolation(f"AI_EFFORT_INVALID: {effort!r}")
        body = {"model": self.model, "max_tokens": max_tokens, **body}
        if not self.model.startswith(NO_EFFORT_MODEL_PREFIXES):
            body["output_config"] = {"effort": effort}
        headers = {"x-api-key": self._api_key, "anthropic-version": ANTHROPIC_VERSION}
        if self.model in FALLBACK_MODELS:
            body["fallbacks"] = "default"
            headers["anthropic-beta"] = FALLBACK_BETA
        payload = self._fetch(ANTHROPIC_MESSAGES_URL, self._timeout, method="POST", headers=headers, body=body, max_bytes=MAX_RESPONSE_BYTES, error_prefix="AI_PROVIDER")
        self._content(payload)   # answered from here on: every refusal carries what the call cost
        stop = payload.get("stop_reason")
        if stop == "max_tokens":   # a tool input or text cut off mid-way is never a whole answer
            usage = self._usage(payload)
            raise self._refused(payload, f"AI_ANSWER_TRUNCATED: the answer reached our cap (max_tokens={max_tokens}, output_tokens={usage[1] if usage else '?'}) before it was whole", "cut_off")
        if stop == "refusal":
            category = (payload.get("stop_details") or {}).get("category") if isinstance(payload.get("stop_details"), dict) else None
            raise self._refused(payload, f"AI_PROVIDER_REFUSAL: the model declined to answer (category={category!r})", "refusal")
        return payload

    def complete(self, system: str, user: str, *, max_tokens: int = MAX_OUTPUT_TOKENS, effort: str | None = None) -> AiCompletion:
        payload = self._post({"system": system, "messages": [{"role": "user", "content": user}]}, max_tokens=max_tokens, effort=effort)
        content = payload["content"]
        text = "".join(str(block.get("text", "")) for block in content if isinstance(block, dict) and block.get("type") == "text")
        if not text.strip():
            raise self._refused(payload, f"AI_PROVIDER_EMPTY_RESPONSE: stop_reason={payload.get('stop_reason')!r}", "empty")
        return self._completion(payload, text)

    def complete_json(self, system: str, user: str, *, max_tokens: int = MAX_OUTPUT_TOKENS, name: str = "answer", description: str = "The answer, as the one JSON object the instructions describe.", effort: str | None = None, input_schema: dict[str, Any] | None = None) -> AiCompletion:
        """One JSON object, parsed by the API: the answer is a tool call whose input is that object (an open schema, so
        the instructions stay the specification), and ``text`` is its serialization -- never text the model typed with
        a stray quote in it (2026-09-27: a first answer refused as NOT_JSON at char 244 cost a whole retry). The tool
        is offered, not forced (forced tool use is rejected by some models); an answer that came back as text is
        returned as that text, for the caller's own parser. An answer cut off by max_tokens, refused or empty raises
        ProviderCallError carrying what the call cost. ``effort`` (see ``EFFORTS``; ``DEFAULT_EFFORT`` when None) bounds
        the model's thinking, which counts against max_tokens and is billed as output. ``input_schema`` is guidance for
        the object's shape; the caller's own gates stay the authority."""
        payload = self._post({
            "system": system,
            "messages": [{"role": "user", "content": user + f"\n\nAnswer by calling the tool `{name}` with the JSON object as its input."}],
            "tools": [{"name": name, "description": description, "input_schema": input_schema or {"type": "object"}}],
            "tool_choice": {"type": "auto", "disable_parallel_tool_use": True},
        }, max_tokens=max_tokens, effort=effort)
        content, stop = payload["content"], payload.get("stop_reason")
        call = next((block for block in content if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") == name), None)
        if call is not None and isinstance(call.get("input"), dict):
            return self._completion(payload, json.dumps(self._unfolded(payload, call["input"]), ensure_ascii=False))
        text = "".join(str(block.get("text", "")) for block in content if isinstance(block, dict) and block.get("type") == "text")
        if not text.strip():
            raise self._refused(payload, f"AI_PROVIDER_EMPTY_RESPONSE: stop_reason={stop!r}", "empty")
        return self._completion(payload, text)

    def _unfolded(self, payload: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
        """The arguments with every argument written inside another's string put back as its own field (LEAKED_ARGUMENT);
        a value that is JSON is read as JSON. Call markup still anywhere after that, or an argument named twice, is not an
        answer: AI_PROVIDER_MALFORMED_RESPONSE, with what it cost -- nothing of it reaches a page."""
        out = dict(arguments)
        for key, value in arguments.items():
            if not isinstance(value, str) or not LEAKED_ARGUMENT.search(value):
                continue
            head, *rest = LEAKED_ARGUMENT.split(value)
            out[key] = head.rstrip()
            for name, raw in zip(rest[::2], rest[1::2]):
                raw = re.sub(r"\s*</parameter>\s*$", "", raw).strip()
                if name in out or not raw:
                    raise self._refused(payload, f"AI_PROVIDER_MALFORMED_RESPONSE: argument {name!r} given twice or empty", "malformed")
                try:
                    out[name] = json.loads(raw)
                except ValueError:
                    out[name] = raw
        if CALL_MARKUP.search(json.dumps(out, ensure_ascii=False)):
            raise self._refused(payload, "AI_PROVIDER_MALFORMED_RESPONSE: call markup inside an argument", "malformed")
        return out

    def _content(self, payload: dict[str, Any]) -> list[Any]:
        """The answer's content blocks; an answer without them is still billed, so the refusal carries its usage."""
        content = payload.get("content")
        if not isinstance(content, list):
            raise self._refused(payload, "AI_PROVIDER_MALFORMED_RESPONSE: content[] missing", "malformed")
        return content

    @staticmethod
    def _usage(payload: dict[str, Any]) -> tuple[int, int] | None:
        """(input, output) tokens the answer says it cost, or None when missing or unreadable (never guessed as 0)."""
        usage = payload.get("usage")
        values = [usage.get(key) for key in ("input_tokens", "output_tokens")] if isinstance(usage, dict) else [None, None]
        if all(isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in values):
            return values[0], values[1]
        return None

    def _refused(self, payload: dict[str, Any], message: str, reason: str) -> ProviderCallError:
        usage = self._usage(payload)
        return ProviderCallError(message, reason=reason, input_tokens=usage[0] if usage else 0, output_tokens=usage[1] if usage else 0, usage_known=usage is not None)

    def _completion(self, payload: dict[str, Any], text: str) -> AiCompletion:
        usage = self._usage(payload)
        if usage is None:   # a usable answer whose cost cannot be read: the meter assumes the worst
            raise self._refused(payload, "AI_PROVIDER_MALFORMED_RESPONSE: usage missing or unreadable", "usage_unreadable")
        return AiCompletion(
            text=text,
            model=str(payload.get("model") or self.model),
            input_tokens=usage[0],
            output_tokens=usage[1],
            stop_reason=str(payload.get("stop_reason") or ""),
        )


DAILY_TOKEN_BUDGET_ENV = "COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET"
DEFAULT_DAILY_TOKEN_BUDGET = 200_000
PERSON_TOKEN_BUDGET_ENV = "COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET_PER_PERSON"
DEFAULT_PERSON_TOKEN_BUDGET = 100_000
SCOPE_PERSON, SCOPE_TENANT = "person", "tenant"


def _budget_from_env(name: str, default: int, environ: dict[str, str] | None) -> int:
    env = os.environ if environ is None else environ
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise InvariantViolation(f"AI_DAILY_TOKEN_BUDGET_INVALID: {name}={raw!r} is not an integer") from None
    if value <= 0:
        raise InvariantViolation(f"AI_DAILY_TOKEN_BUDGET_INVALID: {name} must be a positive integer, got {value}")
    return value


def daily_token_budget(environ: dict[str, str] | None = None) -> int:
    """OQ-AIDRAFT-2 (answered 2026-09-17): a per-tenant daily ceiling on AI Gateway token usage (input+output
    combined), checked against ``ai_usage`` before every draft call -- Phase 1 has no billing/credits system,
    so this is the only thing standing between a runaway loop (or a malicious/confused caller hammering
    ``/ai/draft/*``) and an unbounded Anthropic bill. A misconfigured value fails closed (raises) rather than
    silently falling back to unlimited. With self-registered people in one tenant this is the space's ceiling
    (the cost brake); what one person may use is ``daily_person_budget``."""
    return _budget_from_env(DAILY_TOKEN_BUDGET_ENV, DEFAULT_DAILY_TOKEN_BUDGET, environ)


def daily_person_budget(environ: dict[str, str] | None = None) -> int:
    """What one person (identity) may use per UTC day, so that one class cannot spend everyone's share (2026-10-12: the
    tenant's 200k was one workshop's). Checked beside the space's ceiling in the same reservation; same fail-closed rule.
    A per-person credit wallet (ADR 015) replaces this number with a balance, at this one place."""
    return _budget_from_env(PERSON_TOKEN_BUDGET_ENV, DEFAULT_PERSON_TOKEN_BUDGET, environ)


def fits_budget(used: int, reserve: int, budget: int) -> bool:
    """The one budget rule: a call starts only if today's usage (reserved rows at their worst case included) is under
    the budget and the call's own worst case still fits under it."""
    return used < budget and used + reserve <= budget


def budget_exceeded(used: int, budget: int, reserve: int = 0, scope: str = SCOPE_TENANT) -> str:
    """The 429 text. One code for both limits (the page, the runners and the logs already know it); ``scope=`` says whose:
    ``person`` = this person's own daily share, ``tenant`` = the space everyone shares."""
    needs = f"; this call may use up to {reserve}" if reserve else ""
    whose = "your own daily share" if scope == SCOPE_PERSON else "the whole space's daily limit (everyone in it together)"
    return f"AI_DAILY_TOKEN_BUDGET_EXCEEDED: scope={scope}; {whose}: {used}/{budget} tokens used today (UTC){needs}; resets at midnight UTC"


def provider_from_env(environ: dict[str, str] | None = None) -> AnthropicProvider | None:
    """``None`` when no key is configured -- the caller must answer "unconfigured", not fall back."""
    env = os.environ if environ is None else environ
    key = env.get(API_KEY_ENV, "").strip()
    if not key:
        return None
    return AnthropicProvider(key, env.get(MODEL_ENV, "").strip() or DEFAULT_MODEL)
