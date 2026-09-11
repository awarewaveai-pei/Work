"""``insight.interview`` -- F06 人類／顧客洞察 (Human / Customer Insight) family, 7th of 9 members
(new family this batch opens in parallel: jtbd/persona/empathy_map/journey_map/service_blueprint/
contextual_inquiry/interview/survey/focus_group).

Atlas gives this method TWO citations: the F06 tool table row (L467: "招募→題綱→訪談→coding→themes
→countercases", limitation "樣本與偏誤要記錄") and a dedicated §12.17 深度訪談／訪談法 (L2759-2764),
a RICHER, more precise 9-stage chain: "Research question→Sampling→Guide→Consent→Interview
→Transcribe→Code→Themes→Negative cases", limitation "不能用少量訪談直接推估人口比例". Per this
family's task-mandated design, §12.17's own richer pipeline is the real design, superseding the
table row's own shorter compression (same method, two citations of differing granularity, not two
methods). Grep-confirmed the table row's own "樣本與偏誤要記錄" phrase appears exactly ONCE in the
whole Atlas file (L467 only) -- §12.17 itself does NOT repeat it verbatim, its own limitation is the
separate population-inference sentence above.

Structurally the closest existing precedent is ``security.pasta`` (a fixed-length, positionally-
ordered pipeline, record-level provenance) -- but §12.17 names 9 DIFFERENTLY-TYPED stages (a
research question, a sampling approach, a guide, ...), not a uniform stage_id/summary shape, so
this module models them as 9 separate NAMED fields rather than PASTA's own ``stages[]`` array.

Two real invariants, both STRUCTURAL (``provenance_required`` + one integrity gate, NOT
``genuine_compute`` -- no numeric/ordinal derivation, same class PASTA's own stage-completeness-and-
order check already establishes):

1. **All 9 of STAGE_FIELDS are present and non-empty** (in §12.17's own literal order):
   ``research_question``/``sampling_approach``/``guide``/``consent_process``/``interview_notes``
   /``transcript_ref``/``negative_cases`` must each be a non-empty string; ``codes``/``themes`` must
   each be a non-empty list of non-empty strings.
2. **``documented_biases`` is a SEPARATE, ADDITIONAL required non-empty string** -- NOT one of the 9
   pipeline stages. Mechanizes the F06 table row's own explicit caution (L467: "樣本與偏誤要記錄")
   as a real, structurally-enforced requirement rather than a soft caution a caller could silently
   skip.

Provenance is RECORD-LEVEL ONLY (no per-item provenance on codes[]/themes[] entries) -- a deliberate
F06-batch-wide decision (matching ``insight.jtbd``'s own identical placement, disclosed in the
method contract's own compilation_decisions) to avoid the per-item/record-level provenance-
placement ambiguity that hit both the prior F02 and F03 batches.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"insight.interview"/"InterviewStudy" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.interview"
RECORD_ID_PREFIX = "INTERVIEW-"

# Atlas §12.17's own literal 9-word chain (L2762), transcribed verbatim and in Atlas's own order as
# 9 separate named fields (see module docstring for why this differs from security.pasta's own
# uniform stage_id/summary array shape). LIST_STAGE_FIELDS names the 2 list-shaped stages so
# callers and tests share one source of truth for "which fields are lists vs plain strings".
STAGE_FIELDS: tuple[str, ...] = (
    "research_question",
    "sampling_approach",
    "guide",
    "consent_process",
    "interview_notes",
    "transcript_ref",
    "codes",
    "themes",
    "negative_cases",
)
assert len(STAGE_FIELDS) == 9, "Atlas §12.17's own chain has exactly 9 stages"
LIST_STAGE_FIELDS: frozenset[str] = frozenset({"codes", "themes"})

# documented_biases is a SEPARATE, ADDITIONAL required field -- NOT one of the 9 pipeline stages
# above (see module docstring). Kept as its own named constant so no code path can accidentally
# fold it into STAGE_FIELDS.
DOCUMENTED_BIASES_FIELD = "documented_biases"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _stage_value_is_valid(field: str, value: Any) -> bool:
    """Shared predicate for one stage's own value: the 2 list fields (codes/themes) need a
    non-empty list of non-empty strings, every other stage field needs a non-empty string. Called
    by BOTH the builder and the gate."""
    if field in LIST_STAGE_FIELDS:
        return _is_nonempty_str_list(value)
    return _is_nonempty_str(value)


def _stages_are_valid(record_like: dict[str, Any]) -> bool:
    """Invariant 1: all 9 of STAGE_FIELDS present in ``record_like`` with valid content. Does not
    check documented_biases (invariant 2, checked separately) or any other key. Called by BOTH the
    builder and the gate."""
    return all(_stage_value_is_valid(field, record_like.get(field)) for field in STAGE_FIELDS)


def generate_interview_study(
    record_id: str,
    research_question: str,
    sampling_approach: str,
    documented_biases: str,
    guide: str,
    consent_process: str,
    interview_notes: str,
    transcript_ref: str,
    codes: list[str],
    themes: list[str],
    negative_cases: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/interview-study.schema.yaml``. Enforces both real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in
    this package already establishes. Parameter order follows the method contract's own field
    order -- ``documented_biases`` sits right after ``sampling_approach``, even though it is NOT
    itself one of the 9 §12.17 pipeline stages (see module docstring, invariant 2)."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"INTERVIEW_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"INTERVIEW_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"INTERVIEW_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")

    candidate = {
        "research_question": research_question,
        "sampling_approach": sampling_approach,
        "guide": guide,
        "consent_process": consent_process,
        "interview_notes": interview_notes,
        "transcript_ref": transcript_ref,
        "codes": codes,
        "themes": themes,
        "negative_cases": negative_cases,
    }
    if not _stages_are_valid(candidate):
        invalid = [f for f in STAGE_FIELDS if not _stage_value_is_valid(f, candidate.get(f))]
        raise InvariantViolation(
            f"INTERVIEW_INVALID_STAGES: every one of §12.17's own 9 pipeline stages must be present and non-empty "
            f"(codes/themes as non-empty lists of non-empty strings, the rest as non-empty strings); invalid/missing: {invalid}"
        )
    if not _is_nonempty_str(documented_biases):
        raise InvariantViolation(
            f"INTERVIEW_EMPTY_DOCUMENTED_BIASES: documented_biases must be a non-empty string -- a SEPARATE, ADDITIONAL "
            f"required field (not one of the 9 pipeline stages) mechanizing the F06 table row's own explicit caution "
            f"('樣本與偏誤要記錄', L467), got {documented_biases!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "provenance": provenance,
        "research_question": research_question,
        "sampling_approach": sampling_approach,
        "documented_biases": documented_biases,
        "guide": guide,
        "consent_process": consent_process,
        "interview_notes": interview_notes,
        "transcript_ref": transcript_ref,
        "codes": list(codes),
        "themes": list(themes),
        "negative_cases": negative_cases,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own RECORD-LEVEL provenance is
    schema-valid (no per-item provenance on codes[]/themes[] -- see module docstring). Fails closed
    on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_interview_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_interview_study``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been. Fails
    closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("interview_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("interview_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("interview_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    if not _stages_are_valid(record):
        invalid = [f for f in STAGE_FIELDS if not _stage_value_is_valid(f, record.get(f))]
        return _result("interview_integrity", False, [{"reason": f"one or more of the 9 §12.17 pipeline stages missing/invalid: {invalid}"}], validator, timestamp)
    if not _is_nonempty_str(record.get(DOCUMENTED_BIASES_FIELD)):
        return _result("interview_integrity", False, [{"reason": "documented_biases missing or empty (see module docstring, invariant 2)"}], validator, timestamp)

    return _result(
        "interview_integrity",
        True,
        [{"stage_count": len(STAGE_FIELDS), "code_count": len(record["codes"]), "theme_count": len(record["themes"])}],
        validator,
        timestamp,
    )


def evaluate_interview_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property,
    then the independent structural integrity re-derivation. No ``evidence_labeling_required`` gate
    -- the contract sets that flag to ``false``, same "only emit gates for what is actually declared
    true" discipline every sibling module already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_interview_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
