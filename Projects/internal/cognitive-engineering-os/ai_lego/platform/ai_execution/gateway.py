"""One seam for every real call to an LLM, gated by the same model registry shape as ``policies/provider/model-registry.policy.yaml``.

Why this exists: until now, no code in this repo had ever actually called a
model. ``research.qualitative_coding``'s "AI-suggested" labels came from a
hardcoded fixture dict (``synthetic_fixtures.py``) -- every downstream layer
(``ContractCatalog.invoke``, provenance, the citation gate in
``modules/research/gates.py``) was built to consume a real ``AI_SUGGESTION``,
but nothing upstream of it had ever produced one. This module is what makes
that assumption true.

Two providers, both real:

* ``anthropic`` -- cloud API through the platform's one Anthropic seam (``ai_gateway.provider.AnthropicProvider``:
  the egress allowlist, no SDK; until 2026-10-04 the SDK, which also took ANTHROPIC_BASE_URL from the environment and
  so could send a prompt anywhere -- Codex F1). The key is supplied
  by the CALLER at construction time (``AIGateway(registry, api_key=...)``),
  never read from ``ANTHROPIC_API_KEY`` in the process environment. This
  mirrors ``lobster-factory``'s meeting-service (``lib/settings.py``): that
  file's own docstring explains why -- "each client fills in their own key,
  it must not be shared with the operator's, and must not be baked into
  code" -- and the operator's own ``mcp/user-env.ps1`` deliberately keeps
  ``ANTHROPIC_API_KEY`` OUT of the Windows environment so that Claude Code
  itself keeps using the Pro/Max subscription instead of triggering API
  billing. Reading the env var here would silently break that guarantee.
  The BYOK settings surface (where the key comes from) is out of this
  module's scope -- see meeting-service's ``/api/settings`` for the
  reference UI pattern this Gateway is designed to sit behind.
* ``ollama`` -- local HTTP to a loopback address only (``egress.fetch_loopback_json``; an ``endpoint.uri`` on any
  other host, a name included, is refused), no network egress, no key. Chosen for the "resident data never leaves this machine"
  posture (``policies/ai-execution/network-egress.yaml``); quality is lower
  than the cloud model, which is why the caller picks per ``model_profile_id``
  rather than this module silently preferring one.

Selection is by ``model_profile_id`` resolved against a caller-supplied
registry (dicts shaped like ``model-registry.policy.yaml``'s
``model_registry_entry``), not a hardcoded model name -- swapping the model
behind a profile id is a registry edit, not a code change (MP §9).

Egress is policy-checked, not merely provider-checked: ``complete(...,
classification_tag=...)`` enforces the EXISTING four-value
Public/Internal/Confidential/Restricted vocabulary (EC §101 L2966-2970, MP
§61 L2730-2734, ``specs/security/personal-data-envelope.schema.yaml``'s
``classification_tag``) and the exact rule already ratified for it
(``policies/ai-execution/network-egress.yaml`` rule ``EGRESS-MP64-1``:
"classification_tag = Restricted AND external_model = true -> DENY"). No
new vocabulary is invented here -- an earlier draft of this module used a
GPT-authored "PUBLIC/INTERNAL/CONFIDENTIAL/HIGHLY_SENSITIVE" tier scheme
that does NOT match this repo's ratified one; that draft was discarded
before being committed, in favour of the vocabulary that already has an
ADR-ratified rule behind it, so this Gateway does not become a second,
drifting copy of a classification system this repo already has one of.

What this module deliberately does NOT do: MP §151 L5731's "Fallback only
within Eligible Provider Set" circuit breaker
(``policies/provider/ai-gateway-fallback.policy.yaml`` -- health_check /
trip_condition / recovery / half-open canaries) is a stateful multi-call
policy layered ON TOP of single calls; this module is the single-call
primitive that breaker would wrap. Flagged as out of scope here, not
silently skipped.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from ai_lego.errors import AdapterUnavailable, InvariantViolation
from ai_lego.platform.ai_gateway.provider import AnthropicProvider
from ai_lego.platform.entitlement.check import Grant, assert_grant
from ai_lego.platform.net.egress import fetch_loopback_json

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_ANTHROPIC_MODEL_MAX_TOKENS = 4096

# EC §101 / MP §61 / personal-data-envelope.schema.yaml#/properties/classification_tag -- the
# repo's one ratified four-value vocabulary. Providers NOT in EXTERNAL_MODEL_PROVIDERS are
# treated as never leaving this machine (today: only "self-hosted"/Ollama).
EXTERNAL_MODEL_PROVIDERS = frozenset({"anthropic"})


@dataclass(frozen=True)
class GatewayResult:
    text: str
    provider: str
    model_identifier: str
    model_profile_id: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    trace_id: str | None
    prompt_version: str | None


class AIGateway:
    """Resolves a ``model_profile_id`` against a registry, dispatches to the matching provider.

    ``registry`` entries only need the fields this module reads:
    ``provider`` (``anthropic`` | ``ollama``), ``model_identifier``, and an
    optional ``endpoint.uri`` (defaults to ``DEFAULT_OLLAMA_BASE_URL`` for
    ``ollama``). Extra fields from the full ``model_registry_entry`` schema
    (cost_profile, champion_status, ...) are ignored here on purpose -- this
    module is the invocation path, not the registry's own validator.
    """

    def __init__(self, registry: dict[str, dict[str, Any]], *, grant: Grant | None, api_key: str | None = None) -> None:
        """``grant`` is required (ADR 017 §4): an allowed ``check_entitlement`` grant before any external (paid) provider;
        ``None`` is accepted only for loopback Ollama, which bills no one."""
        self.registry = registry
        self._grant = grant
        self._api_key = api_key

    def _entry(self, model_profile_id: str) -> dict[str, Any]:
        entry = self.registry.get(model_profile_id)
        if entry is None:
            raise InvariantViolation(f"MODEL_PROFILE_NOT_REGISTERED: {model_profile_id!r} not in the model registry supplied to this Gateway")
        return entry

    def complete(
        self,
        model_profile_id: str,
        *,
        system: str,
        prompt: str,
        max_tokens: int = DEFAULT_ANTHROPIC_MODEL_MAX_TOKENS,
        classification_tag: str | None = None,
        trace_id: str | None = None,
        prompt_version: str | None = None,
        seed: int | None = None,
        temperature: float | None = None,
    ) -> GatewayResult:
        """``seed``/``temperature`` make a second, independent pass reproducible on Ollama, which honours both. Neither
        is sent to the Anthropic API: it has no seed, and current Claude models reject a non-default temperature."""
        entry = self._entry(model_profile_id)
        provider = entry["provider"]
        if classification_tag == "Restricted" and provider in EXTERNAL_MODEL_PROVIDERS:
            raise InvariantViolation(
                f"EGRESS_MP64_1_VIOLATION: classification_tag=Restricted may not route to external_model provider {provider!r} "
                f"(model profile {model_profile_id!r}) -- policies/ai-execution/network-egress.yaml rule EGRESS-MP64-1 (EC §101). "
                f"Select a non-external-model profile (provider='self-hosted') instead."
            )
        if provider in EXTERNAL_MODEL_PROVIDERS:
            assert_grant(self._grant)
        if provider == "anthropic":
            return self._complete_anthropic(model_profile_id, entry, system=system, prompt=prompt, max_tokens=max_tokens, trace_id=trace_id, prompt_version=prompt_version)
        if provider == "self-hosted":
            return self._complete_ollama(model_profile_id, entry, system=system, prompt=prompt, trace_id=trace_id, prompt_version=prompt_version, seed=seed, temperature=temperature)
        raise InvariantViolation(f"PROVIDER_NOT_IMPLEMENTED: {provider!r} (model profile {model_profile_id!r}) -- this Gateway implements 'anthropic' and 'self-hosted' (Ollama) only")

    def _complete_anthropic(self, model_profile_id: str, entry: dict[str, Any], *, system: str, prompt: str, max_tokens: int, trace_id: str | None, prompt_version: str | None) -> GatewayResult:
        api_key = self._api_key
        if not api_key:
            raise AdapterUnavailable("ANTHROPIC_API_KEY_MISSING: construct AIGateway(..., api_key=...) with a caller-supplied key before selecting an 'anthropic' model profile -- this Gateway does not read ANTHROPIC_API_KEY from the environment (see module docstring)")
        started = time.monotonic()
        try:
            completion = AnthropicProvider(api_key, entry["model_identifier"]).complete(system, prompt, max_tokens=max_tokens)
        except InvariantViolation as error:
            raise AdapterUnavailable(f"ANTHROPIC_CALL_FAILED: {error}") from error
        latency_ms = int((time.monotonic() - started) * 1000)
        return GatewayResult(
            text=completion.text,
            provider="anthropic",
            model_identifier=entry["model_identifier"],
            model_profile_id=model_profile_id,
            input_tokens=completion.input_tokens,
            output_tokens=completion.output_tokens,
            latency_ms=latency_ms,
            trace_id=trace_id,
            prompt_version=prompt_version,
        )

    def _complete_ollama(self, model_profile_id: str, entry: dict[str, Any], *, system: str, prompt: str, trace_id: str | None, prompt_version: str | None, seed: int | None = None, temperature: float | None = None) -> GatewayResult:
        base_url = (entry.get("endpoint") or {}).get("uri") or DEFAULT_OLLAMA_BASE_URL
        options: dict[str, Any] = {}
        if seed is not None:
            options["seed"] = seed
        if temperature is not None:
            options["temperature"] = temperature
        body_out: dict[str, Any] = {
            "model": entry["model_identifier"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "stream": False,
        }
        if options:
            body_out["options"] = options
        started = time.monotonic()
        try:
            body = fetch_loopback_json(f"{base_url.rstrip('/')}/api/chat", 180, method="POST", body=body_out, error_prefix="OLLAMA")
        except InvariantViolation as error:
            if not str(error).startswith("OLLAMA_UNAVAILABLE"):
                raise   # not on this machine, or not JSON: named as it is
            raise AdapterUnavailable(f"OLLAMA_UNAVAILABLE: could not reach {base_url} ({error}) -- is the Ollama service running?") from error
        latency_ms = int((time.monotonic() - started) * 1000)
        if "error" in body:
            raise AdapterUnavailable(f"OLLAMA_CALL_FAILED: {body['error']} (model {entry['model_identifier']!r} -- pulled with `ollama pull {entry['model_identifier']}`?)")
        return GatewayResult(
            text=body["message"]["content"],
            provider="self-hosted",
            model_identifier=entry["model_identifier"],
            model_profile_id=model_profile_id,
            input_tokens=body.get("prompt_eval_count", 0),
            output_tokens=body.get("eval_count", 0),
            latency_ms=latency_ms,
            trace_id=trace_id,
            prompt_version=prompt_version,
        )


def ollama_available(base_url: str = DEFAULT_OLLAMA_BASE_URL) -> tuple[bool, str]:
    """Availability probe mirroring ``WindowsSapiSpeechAudioFactory.availability()``'s (bool, reason) shape."""
    try:
        body = fetch_loopback_json(f"{base_url.rstrip('/')}/api/version", 5, error_prefix="OLLAMA")
    except InvariantViolation as error:
        return False, f"could not reach {base_url}: {error}"
    return True, f"ollama {body.get('version', 'unknown')} at {base_url}"
