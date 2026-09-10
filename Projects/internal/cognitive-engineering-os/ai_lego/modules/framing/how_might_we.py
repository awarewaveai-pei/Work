"""``framing.how_might_we`` -- F01 "Goal & Problem Framing" family (Atlas F01 table row,
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:342), 9th member of this family. Atlas has exactly 2
citations for this method: the table row itself and a dedicated section, Sec12.3 (L2575-2580) -- grep-confirmed
no other "How Might We"/"how might we" mention exists anywhere in the document.

**Shape:** both citations give one worked example (a single prose reframing: "不要寫「做一個 chatbot」，改成
「我們可以如何讓第一次使用者在 3 分鐘內找到正確資訊？」") and no field-level sub-structure. Transcribed as a flat
record of 2 plain non-empty strings -- ``pain_point`` (the original problem, kept separate so the reframing
stays auditable) and ``hmw_question`` (the reframed open question) -- same shape class
``framing.north_star_metric``'s own flat 3-field record already uses for this family.

**Core structural point (Atlas's own explicit constraint, both citations): the output must NOT presuppose a
solution.** Two real invariants enforce this, both at construction (raise BEFORE any record is built) AND
independently re-derived by a gate from raw fields, same two-layer discipline every sibling module in this
package already establishes:

1. ``hmw_question`` must genuinely differ from ``pain_point`` (case/whitespace-insensitive) -- same "identical
   pair is an echo, not a reframing" invariant class ``framing.problem_statement``'s own
   ``expected_state != current_state`` and ``framing.north_star_metric``'s own
   ``proxy_metric != core_value_proposition`` already establish for this family.
2. ``hmw_question`` must be structurally a real question, not a declarative solution statement: it must begin
   with one of Atlas's own 2 literal cited stems ("how might we" -- the method's own English name, case
   -insensitive -- or 「我們可以如何」) and end with a question mark (``?`` or ``？``). This is a checkable PROXY
   for "does not presuppose a solution", not a semantic guarantee (no gate in this corpus performs semantic
   judgment) -- same class of deliberate structural proxy ``framing.north_star_metric``'s own
   ``anti_gaming_validation`` field already accepts. Broader English synonyms ("how can we"/"how could we") are
   deliberately NOT accepted; only the 2 forms Atlas itself literally uses are (see the contract's own
   ``compilation_decisions`` for why inventing synonym stems would be fabricated scope).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` for
"how_might_we"/"how might we" (case-insensitive) before writing any of this module's own files: zero
pre-existing hits anywhere.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.how_might_we"
RECORD_ID_PREFIX = "HMW-"
HMW_ENGLISH_STEM = "how might we"
HMW_CHINESE_STEM = "我們可以如何"
QUESTION_MARKS = ("?", "？")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role as framing.north_star_metric's own
    ``_normalize``, reused for the identical echo-invariant purpose (see module docstring, Invariant #1).
    NFKC-normalized first so width-variant characters (e.g. ASCII '?' vs full-width '?') don't defeat the
    echo check (critic finding, 2026-09-10 F01 closeout batch review)."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _has_hmw_stem(value: str) -> bool:
    """True if ``value`` begins with one of Atlas's own 2 literal cited HMW stems (see module docstring,
    Invariant #2). Deliberately not a broader synonym list -- see the contract's own compilation_decisions."""
    stripped = value.strip()
    return stripped.casefold().startswith(HMW_ENGLISH_STEM) or stripped.startswith(HMW_CHINESE_STEM)


def _ends_with_question_mark(value: str) -> bool:
    return value.rstrip().endswith(QUESTION_MARKS)


def _fields_are_complete(pain_point: Any, hmw_question: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(pain_point):
        return False, "EMPTY_PAIN_POINT"
    if not _is_nonempty_str(hmw_question):
        return False, "EMPTY_HMW_QUESTION"
    return True, None


def _question_form_reason(hmw_question: str) -> str | None:
    """Returns a failure reason code, or None if ``hmw_question`` is structurally a well-formed HMW question
    (Invariant #2, see module docstring). Shared by the builder and the gate so neither can drift from the
    other."""
    if not _has_hmw_stem(hmw_question):
        return "MISSING_STEM"
    if not _ends_with_question_mark(hmw_question):
        return "MISSING_QUESTION_MARK"
    return None


def generate_how_might_we(
    record_id: str,
    pain_point: str,
    hmw_question: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/how-might-we-record.schema.yaml``. Enforces both real invariants fail-closed
    -- never a record that itself proves it was built illegally, same family-wide "raise-before-construction"
    discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"HOWMIGHTWE_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"HOWMIGHTWE_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(pain_point, hmw_question)
    if not complete:
        if reason == "EMPTY_PAIN_POINT":
            raise InvariantViolation(f"HOWMIGHTWE_EMPTY_PAIN_POINT: pain_point must be a non-empty string, got {pain_point!r}")
        raise InvariantViolation(f"HOWMIGHTWE_EMPTY_HMW_QUESTION: hmw_question must be a non-empty string, got {hmw_question!r}")

    if _normalize(hmw_question) == _normalize(pain_point):
        raise InvariantViolation(
            f"HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT: hmw_question must genuinely differ from pain_point (case/whitespace-insensitive), "
            f"got pain_point={pain_point!r} hmw_question={hmw_question!r}"
        )

    form_reason = _question_form_reason(hmw_question)
    if form_reason == "MISSING_STEM":
        raise InvariantViolation(
            f"HOWMIGHTWE_QUESTION_MISSING_STEM: hmw_question must begin with {HMW_ENGLISH_STEM!r} or {HMW_CHINESE_STEM!r} (Atlas's own 2 cited stems), got {hmw_question!r}"
        )
    if form_reason == "MISSING_QUESTION_MARK":
        raise InvariantViolation(f"HOWMIGHTWE_QUESTION_MISSING_QUESTION_MARK: hmw_question must end with '?' or '？', got {hmw_question!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "pain_point": pain_point,
        "hmw_question": hmw_question,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_how_might_we_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_how_might_we``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("how_might_we_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("how_might_we_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("how_might_we_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(record.get("pain_point"), record.get("hmw_question"))
    if not complete:
        return _result("how_might_we_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    pain_point = record["pain_point"]
    hmw_question = record["hmw_question"]
    if _normalize(hmw_question) == _normalize(pain_point):
        return _result("how_might_we_integrity", False, [{"reason": "QUESTION_ECHOES_PAIN_POINT"}], validator, timestamp)

    form_reason = _question_form_reason(hmw_question)
    if form_reason is not None:
        return _result("how_might_we_integrity", False, [{"reason": form_reason}], validator, timestamp)

    return _result("how_might_we_integrity", True, [{"pain_point_len": len(pain_point), "hmw_question_len": len(hmw_question)}], validator, timestamp)


def evaluate_how_might_we_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_how_might_we_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
