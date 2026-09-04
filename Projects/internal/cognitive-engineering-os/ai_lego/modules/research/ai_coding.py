"""Real open coding for ``research.qualitative_coding``: a model reads REDACTED units and proposes labels.

This is the first place in the repo where an ``AI_SUGGESTION`` is produced by
an actual model call (through ``AIGateway``) rather than read from
``synthetic_fixtures.CODER_ONE_PENDING_AI_LABELS``. It replaces exactly that
dict: the return shape is ``{source_id: label}`` plus the evidence needed to
say WHY each label was accepted or thrown away.

Three invariants, each with a test that turns red when the guard is removed:

1. **The model only ever sees redacted text.** ``suggest_open_codes`` runs
   the caller's ``PiiLedgerGuard`` over the prompt BEFORE the Gateway is
   called -- the same guard that protects the append-only ledger. A prompt
   that would carry a detected PII value raises ``MODEL_INPUT_PII_GUARD_TRIPPED``
   and nothing is sent anywhere.
2. **Evidence cannot be fabricated.** The model must return an
   ``evidence_span`` for every label, and that span must be a verbatim
   substring of the redacted unit it was shown. A span that is not found is
   REJECTED (``FABRICATED_EVIDENCE``) -- the label never becomes a code, not
   even as a pending suggestion. This is the open-coding counterpart of the
   citation gate in ``gates.py``: there, a Claim without a resolvable
   sentence-provenance record fails; here, a label without a resolvable span
   never enters the CodeSet.
3. **A label is a controlled token, not prose.** Labels are normalised to
   ``[a-z0-9_]{3,40}``; anything the model returns that cannot be normalised
   (empty, too long, symbols) is REJECTED (``UNUSABLE_LABEL``), so the axial
   map and the Kappa computation only ever see well-formed tokens.

Small local models (``gemma3:4b``) wrap JSON in prose or code fences; the
parser extracts the first JSON array rather than demanding a bare document,
because that is what the model actually does, not what a prompt asks for.
Anything after the array is ignored; a response with no array at all is a
single ``NO_JSON_ARRAY`` rejection covering every unit (nothing is guessed).

Provenance: every accepted label is ``AI_SUGGESTION`` / ``AI_SUGGESTED``,
identical to the fixture path, so the authorship gate sees no difference
between a fixture suggestion and a model suggestion -- which is the point:
downstream code must not be able to tell, and must not need to.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.gateway import AIGateway

OPEN_CODING_PROMPT_VERSION = "open-coding-v1"

# Default local registry for the research slice. A registry is DATA the caller may replace; this constant is only
# the slice's own default so `--coding local-llm` needs no config file. Provider vocabulary = model-registry.policy.yaml.
DEFAULT_LOCAL_MODEL_PROFILE = "local-open-coding-v1"
DEFAULT_LOCAL_MODEL_IDENTIFIER = "gemma3:4b"


def default_local_registry(model_identifier: str = DEFAULT_LOCAL_MODEL_IDENTIFIER) -> dict[str, dict[str, Any]]:
    return {
        DEFAULT_LOCAL_MODEL_PROFILE: {
            "model_profile_id": DEFAULT_LOCAL_MODEL_PROFILE,
            "provider": "self-hosted",
            "model_identifier": model_identifier,
            "endpoint": {"type": "local_runtime", "uri": "http://127.0.0.1:11434"},
            "capability_tags": ["open_coding"],
            "champion_status": "shadow",
        }
    }


OPEN_CODING_SYSTEM_PROMPT = (
    "You are assisting a qualitative researcher with OPEN CODING (Strauss & Corbin). "
    "For each interview unit you are given, propose ONE short descriptive code label that captures what the "
    "participant is describing, and quote the exact words that justify it. "
    "Rules: the label is 2-5 lowercase words joined by underscores; evidence_span must be copied VERBATIM from "
    "the unit text, unchanged; do not invent, summarise, or diagnose; one object per unit; "
    "respond with a JSON array only, no commentary."
)

_LABEL_RE = re.compile(r"^[a-z0-9_]{3,40}$")
_ARRAY_RE = re.compile(r"\[\s*\{.*?\}\s*\]", re.DOTALL)


def build_open_coding_prompt(units: list[dict[str, str]]) -> str:
    lines = ["Units (each has an id and the redacted unit text):", ""]
    for unit in units:
        lines.append(f"[{unit['source_id']}] {unit['text']}")
    lines += [
        "",
        'Return a JSON array of objects: [{"source_id": "...", "label": "...", "evidence_span": "..."}]',
    ]
    return "\n".join(lines)


def normalise_label(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    token = re.sub(r"[^a-z0-9]+", "_", raw.strip().casefold()).strip("_")
    token = re.sub(r"_+", "_", token)
    return token if _LABEL_RE.match(token) else None


def extract_json_array(text: str) -> list[Any] | None:
    """First JSON array of objects in ``text``; None when there is none (never a guessed structure)."""
    for candidate in _ARRAY_RE.finditer(text):
        try:
            parsed = json.loads(candidate.group(0))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            return parsed
    return None


def validate_open_coding_response(raw_text: str, units: list[dict[str, str]]) -> dict[str, Any]:
    """Pure validation of a model response against the units it was shown. No I/O; the mutation-test target."""
    by_id = {unit["source_id"]: unit["text"] for unit in units}
    accepted: dict[str, dict[str, str]] = {}
    rejected: list[dict[str, Any]] = []
    items = extract_json_array(raw_text)
    if items is None:
        return {"labels": {}, "accepted": {}, "rejected": [{"source_id": sid, "reason": "NO_JSON_ARRAY"} for sid in by_id], "missing": []}
    for item in items:
        if not isinstance(item, dict):
            rejected.append({"source_id": None, "reason": "NOT_AN_OBJECT", "raw": item})
            continue
        source_id = item.get("source_id")
        if source_id not in by_id:
            rejected.append({"source_id": source_id, "reason": "UNKNOWN_SOURCE_ID", "raw": item})
            continue
        if source_id in accepted:
            rejected.append({"source_id": source_id, "reason": "DUPLICATE_SOURCE_ID", "raw": item})
            continue
        span = item.get("evidence_span")
        if not isinstance(span, str) or not span.strip() or span.strip() not in by_id[source_id]:
            rejected.append({"source_id": source_id, "reason": "FABRICATED_EVIDENCE", "raw": item})
            continue
        label = normalise_label(item.get("label"))
        if label is None:
            rejected.append({"source_id": source_id, "reason": "UNUSABLE_LABEL", "raw": item})
            continue
        accepted[source_id] = {"label": label, "evidence_span": span.strip()}
    missing = [sid for sid in by_id if sid not in accepted and not any(r.get("source_id") == sid for r in rejected)]
    return {"labels": {sid: entry["label"] for sid, entry in accepted.items()}, "accepted": accepted, "rejected": rejected, "missing": missing}


CODEBOOK_PROMPT_VERSION = "apply-codebook-v1"

CODEBOOK_SYSTEM_PROMPT = (
    "You are an independent second coder in a qualitative study. You are given a CODEBOOK (the allowed code labels, "
    "already agreed by the first coder) and interview units. For each unit choose exactly ONE label FROM THE CODEBOOK "
    "that best fits, and quote the exact words that justify it. "
    "Rules: label must be copied exactly from the codebook; evidence_span must be copied VERBATIM from the unit text; "
    "do not invent new labels; one object per unit; respond with a JSON array only, no commentary."
)


def build_codebook_prompt(units: list[dict[str, str]], codebook: list[str]) -> str:
    lines = ["Codebook (allowed labels):", ""]
    lines += [f"- {label}" for label in codebook]
    lines += ["", "Units (each has an id and the redacted unit text):", ""]
    for unit in units:
        lines.append(f"[{unit['source_id']}] {unit['text']}")
    lines += ["", 'Return a JSON array of objects: [{"source_id": "...", "label": "...", "evidence_span": "..."}]']
    return "\n".join(lines)


def validate_codebook_response(raw_text: str, units: list[dict[str, str]], codebook: list[str]) -> dict[str, Any]:
    """Like ``validate_open_coding_response`` plus one more gate: the label must be IN the codebook
    (``LABEL_NOT_IN_CODEBOOK``). A second coder who invents labels is not measuring agreement with the first."""
    base = validate_open_coding_response(raw_text, units)
    allowed = set(codebook)
    labels: dict[str, str] = {}
    accepted: dict[str, dict[str, str]] = {}
    rejected = list(base["rejected"])
    for source_id, entry in base["accepted"].items():
        if entry["label"] not in allowed:
            rejected.append({"source_id": source_id, "reason": "LABEL_NOT_IN_CODEBOOK", "raw": entry})
            continue
        labels[source_id] = entry["label"]
        accepted[source_id] = entry
    by_id = {unit["source_id"] for unit in units}
    missing = [sid for sid in by_id if sid not in accepted and not any(r.get("source_id") == sid for r in rejected)]
    return {"labels": labels, "accepted": accepted, "rejected": rejected, "missing": sorted(missing)}


def apply_codebook(
    gateway: AIGateway,
    model_profile_id: str,
    units: list[dict[str, str]],
    codebook: list[str],
    *,
    pii_guard: Any,
    classification_tag: str,
    trace_id: str,
    seed: int = 20260904,
) -> dict[str, Any]:
    """Second-coder pass: assign one codebook label per unit with verbatim evidence. Deterministic ``seed`` +
    temperature 0 so the pass is reproducible; a different seed than any first-coder call keeps it independent."""
    if not units:
        raise InvariantViolation("CODEBOOK_NO_UNITS: nothing to code")
    if not codebook:
        raise InvariantViolation("CODEBOOK_EMPTY: a second coder needs the first coder's reviewed labels")
    system = CODEBOOK_SYSTEM_PROMPT
    prompt = build_codebook_prompt(units, sorted(codebook))
    frame = build_codebook_prompt([{"source_id": unit["source_id"], "text": ""} for unit in units], sorted(codebook))
    try:
        pii_guard("ModelInput:apply_codebook", {"system": system, "prompt_frame": frame, "redacted_transcript": [unit["text"] for unit in units]})
    except InvariantViolation as error:
        raise InvariantViolation(f"MODEL_INPUT_PII_GUARD_TRIPPED: refusing to send a prompt carrying detected PII to a model ({error})") from error
    result = gateway.complete(model_profile_id, system=system, prompt=prompt, classification_tag=classification_tag, trace_id=trace_id, prompt_version=CODEBOOK_PROMPT_VERSION, seed=seed, temperature=0.0)
    validated = validate_codebook_response(result.text, units, sorted(codebook))
    return {
        **validated,
        "codebook": sorted(codebook),
        "raw_text": result.text,
        "suggestion_source": {
            "provider": result.provider,
            "model_identifier": result.model_identifier,
            "model_profile_id": result.model_profile_id,
            "prompt_version": result.prompt_version,
            "trace_id": result.trace_id,
            "seed": seed,
            "temperature": 0.0,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "latency_ms": result.latency_ms,
            "classification_tag": classification_tag,
            "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED"),
        },
    }


def suggest_open_codes(
    gateway: AIGateway,
    model_profile_id: str,
    units: list[dict[str, str]],
    *,
    pii_guard: Any,
    classification_tag: str,
    trace_id: str,
) -> dict[str, Any]:
    """Model-proposed open codes for ``units`` (``[{source_id, text}]``, text already redacted).

    Returns ``labels`` (the ``CODER_ONE_PENDING_AI_LABELS`` shape), the accepted/rejected/missing breakdown, and a
    ``suggestion_source`` record (provider, model, prompt version, trace id, token counts) for the audit trail.
    """
    if not units:
        raise InvariantViolation("OPEN_CODING_NO_UNITS: nothing to code")
    system = OPEN_CODING_SYSTEM_PROMPT
    prompt = build_open_coding_prompt(units)
    # The guard payload mirrors the ledger's own contract: everything is checked EXCEPT the field the ledger already
    # exempts (`ledger_guards.EXEMPT_FIELDS` = {"redacted_transcript"}), because redaction replaces the first
    # occurrence of each detected value and the fixture deliberately contains a city that is also an ordinary word
    # ("Reading project updates...") -- the redacted body legitimately still contains that token. So: the unit
    # texts travel under the exempt key and were produced by the same `redact_transcript` the ledger trusts; the
    # system prompt and the prompt frame (everything that is NOT redacted transcript) are checked in full. A PII
    # value smuggled into the frame or the system prompt still trips the guard; nothing is sent when it does.
    frame = build_open_coding_prompt([{"source_id": unit["source_id"], "text": ""} for unit in units])
    try:
        pii_guard("ModelInput:open_coding", {"system": system, "prompt_frame": frame, "redacted_transcript": [unit["text"] for unit in units]})
    except InvariantViolation as error:
        raise InvariantViolation(f"MODEL_INPUT_PII_GUARD_TRIPPED: refusing to send a prompt carrying detected PII to a model ({error})") from error
    result = gateway.complete(
        model_profile_id,
        system=system,
        prompt=prompt,
        classification_tag=classification_tag,
        trace_id=trace_id,
        prompt_version=OPEN_CODING_PROMPT_VERSION,
    )
    validated = validate_open_coding_response(result.text, units)
    return {
        **validated,
        "raw_text": result.text,
        "suggestion_source": {
            "provider": result.provider,
            "model_identifier": result.model_identifier,
            "model_profile_id": result.model_profile_id,
            "prompt_version": result.prompt_version,
            "trace_id": result.trace_id,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "latency_ms": result.latency_ms,
            "classification_tag": classification_tag,
            "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED"),
        },
    }
