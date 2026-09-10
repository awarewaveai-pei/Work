"""``causal.rct`` -- 2nd F11 `causal` family member (after ``causal.dag``, F11 was 1/10 built before this batch).

Atlas F11 table row (L621) is this method's ONLY citation -- grep-confirmed
no dedicated §11.x/§12.x section exists for RCT (unlike ``causal.dag``'s own
§11.21) and no §22.3 Method-specific Gate table row. The row's own 4-step
pipeline: "randomize→power→treatment/control→analysis".

**Scope boundary (task-mandated, disclosed here so a future reader does not
mistake this for, or try to extend this into, an actual stats engine): this
method captures the STRUCTURE/DESIGN of a study, it does not run an RNG or a
statistical hypothesis test.** Same restraint
``ai_lego/modules/association/morphological_analysis.py`` applies to
combinatorics (it generates a legal-combination SET structurally, it does
not run an optimizer) and
``ai_lego/modules/decision/weighted_decision_matrix.py`` applies to scoring
(it captures scores/weights, it does not implement a general linear-algebra
solver). All 5 content fields below are DISCLOSURE-ONLY: presence and (for
the 2 group fields) distinctness are enforced; the actual randomization
method, power/sample-size methodology, and analytical findings are REPORTED/
INPUT content the caller supplies, with provenance on the record's own
top-level ``provenance`` field -- never computed by this module. There is no
``engine``/``computation_provenance_ref`` field on this record (contrast
``causal-dag-analysis.schema.yaml``'s own ``acyclic_verified``): the absence
itself is the honest disclosure that nothing here is GENUINE_COMPUTE.

Modeled directly on ``ai_lego/modules/framing/how_might_we.py``'s own flat-
record-from-thin-citation shape (2 fields, 1 echo invariant), scaled to 5
fields / 1 echo pair:

1. **Field completeness** (``RCT_EMPTY_*``): ``randomization``,
   ``power_analysis``, ``treatment_group``, ``control_group``, and
   ``analysis_summary`` must each be a non-empty string. ``power_analysis``
   is REQUIRED, not optional -- a study disclosing no power justification is
   a real, well-known methodological red flag worth structurally surfacing
   (same "a declared gap needs an explicit justification, not a silent
   omission" discipline ``ai_lego/modules/framing/boundary_critique.py``'s
   own ``empty_justification`` requirement establishes for a different kind
   of declared gap): a caller with no formal power analysis must say so
   explicitly, not omit the field.
2. **Treatment/control distinctness** (``RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP``):
   ``treatment_group`` and ``control_group`` must be genuinely distinct
   (NFKC-normalized, case/whitespace-insensitive) -- the method's own name
   (randomized CONTROLLED trial) is the claim; a record naming an identical
   arm twice is not describing one.

Both invariants are enforced at construction (raise BEFORE any record is
built) AND independently re-derived by a gate from raw fields (catching a
hand-tampered record that bypassed the builder entirely) -- same two-layer
discipline every sibling module in this package already establishes.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "causal.rct"/"randomized_controlled"/"RCT" before
writing any of this method's own files: zero pre-existing implementation
(a handful of unrelated 3-bare-letter false-positive hits in method-
inventory.yaml/the Atlas/evidence.schema.yaml triaged and confirmed
non-matching -- none is this method).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.rct"
RECORD_ID_PREFIX = "RCT-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first so width-variant characters (e.g. ASCII
    vs full-width punctuation) don't defeat the echo check -- same helper shape
    ``ai_lego/modules/framing/how_might_we.py``'s own ``_normalize`` already establishes, built in from the
    start here rather than retrofitted after a critic finding."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _fields_are_complete(
    randomization: Any,
    power_analysis: Any,
    treatment_group: Any,
    control_group: Any,
    analysis_summary: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(randomization):
        return False, "EMPTY_RANDOMIZATION"
    if not _is_nonempty_str(power_analysis):
        return False, "EMPTY_POWER_ANALYSIS"
    if not _is_nonempty_str(treatment_group):
        return False, "EMPTY_TREATMENT_GROUP"
    if not _is_nonempty_str(control_group):
        return False, "EMPTY_CONTROL_GROUP"
    if not _is_nonempty_str(analysis_summary):
        return False, "EMPTY_ANALYSIS_SUMMARY"
    return True, None


def _groups_echo(treatment_group: str, control_group: str) -> bool:
    """True if ``control_group`` is effectively identical to ``treatment_group`` (Invariant #2, see module
    docstring). Shared by the builder and the gate so neither can drift from the other."""
    return _normalize(control_group) == _normalize(treatment_group)


def generate_rct_record(
    record_id: str,
    randomization: str,
    power_analysis: str,
    treatment_group: str,
    control_group: str,
    analysis_summary: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/rct-record.schema.yaml``. Enforces both real invariants fail-closed -- never
    a record that itself proves it was built illegally, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RCT_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RCT_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(randomization, power_analysis, treatment_group, control_group, analysis_summary)
    if not complete:
        raise InvariantViolation(f"RCT_{reason}: all of randomization/power_analysis/treatment_group/control_group/analysis_summary must be non-empty strings ({reason} failed)")

    if _groups_echo(treatment_group, control_group):
        raise InvariantViolation(
            f"RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP: control_group is effectively identical (NFKC/case/whitespace-insensitive) to "
            f"treatment_group -- a 'RCT' naming an identical treatment and control arm is not describing a randomized CONTROLLED trial, "
            f"got treatment_group={treatment_group!r} control_group={control_group!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "randomization": randomization,
        "power_analysis": power_analysis,
        "treatment_group": treatment_group,
        "control_group": control_group,
        "analysis_summary": analysis_summary,
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


def evaluate_rct_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_rct_record``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("rct_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("rct_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("rct_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(
        record.get("randomization"),
        record.get("power_analysis"),
        record.get("treatment_group"),
        record.get("control_group"),
        record.get("analysis_summary"),
    )
    if not complete:
        return _result("rct_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    treatment_group = record["treatment_group"]
    control_group = record["control_group"]
    if _groups_echo(treatment_group, control_group):
        return _result("rct_integrity", False, [{"reason": "CONTROL_GROUP_ECHOES_TREATMENT_GROUP"}], validator, timestamp)

    return _result(
        "rct_integrity",
        True,
        [{"randomization_len": len(record["randomization"]), "power_analysis_len": len(record["power_analysis"]), "analysis_summary_len": len(record["analysis_summary"])}],
        validator,
        timestamp,
    )


def evaluate_rct_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_rct_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
