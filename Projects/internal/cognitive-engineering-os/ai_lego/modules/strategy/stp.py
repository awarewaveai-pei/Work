"""``strategy.stp`` -- F08 context/strategy family, 7th member (after ``strategy.swot``/``strategy.pestel``/
``strategy.steepv``/``strategy.three_c``/``strategy.tows``/``strategy.porter_five_forces``).

Atlas F08 table row L523 ("STP｜市場分群/選擇/定位｜Segmentation→Targeting→Positioning｜避免一體適用｜JTBD") +
dedicated §12.14 (L2705-2712: 用途「決定不是「賣給所有人」，而是先選 segment 再定位」, 搭配 "JTBD / Survey → STP →
Value Proposition"). Genuinely SEQUENTIAL 3-stage pipeline per the method's own name and arrow notation
(Segmentation→Targeting→Positioning) -- unlike ``ai_lego.modules.causal.logic_model``'s uniform 5-tuple of
same-shaped stage entries, STP's 3 stages are NOT uniform (``segments`` is a list of segment objects,
``targeting_decision`` is a single decision object, ``positioning_statement`` is a bare string), so the
sequential dependency is enforced via REFERENTIAL INTEGRITY (``targeting_decision``'s targeted segment id must
resolve to a real ``segments[]`` entry) rather than array position -- same class of check
``ai_lego.modules.strategy.tows``'s pairings->SwotAnalysis.factors check already establishes, scaled down to a
single-record (not cross-record) reference. See ``methods/contracts/strategy.stp.contract.yaml``'s own
``compilation_decisions`` for the full reasoning.

Real invariants (beyond per-field completeness), enforced at BOTH construction (raise before any record is
built) AND independently re-derived by a gate from raw fields -- same two-layer discipline every sibling module
in this package establishes:

1. **STP_EMPTY_SEGMENTS**: Segmentation (stage 1) must produce at least one real segment.
2. **STP_UNKNOWN_TARGET_SEGMENT_ID**: Targeting (stage 2) cannot choose a segment Segmentation never identified
   -- ``targeting_decision``'s ``targeted_segment_id`` must resolve to a real id in ``segments[]``.
3. **STP_EMPTY_POSITIONING_STATEMENT**: Positioning (stage 3), Atlas's own final, required stage -- an STP
   record with no positioning content has not completed the method its own name promises.

Grepped the whole ``ai_lego`` tree case-insensitively for "strategy.stp"/"StpAnalysis" before writing any of
this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.stp"
RECORD_ID_PREFIX = "STP-"

_SEGMENT_FAILURE_MESSAGES = {
    "STP_EMPTY_SEGMENTS": "segments must be a non-empty list -- Segmentation (stage 1) must produce at least one real segment",
    "STP_SEGMENT_MISSING_ID": "every segment must carry a non-empty id",
    "STP_DUPLICATE_SEGMENT_ID": "segment id appears more than once",
    "STP_SEGMENT_MISSING_DESCRIPTION": "every segment must carry a non-empty description",
    "STP_SEGMENT_MISSING_CRITERIA": "every segment must carry a non-empty criteria[] (at least one non-empty defining-criteria string)",
}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def segment(segment_id: str, description: str, criteria: list[str], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/stp-analysis.schema.yaml#/properties/segments``. Convenience constructor
    only -- emits ONLY known-good keys; does NOT itself enforce completeness (``generate_stp_analysis``
    validates whatever dict it is handed regardless of how it was built)."""
    record: dict[str, Any] = {"id": segment_id, "description": description, "criteria": list(criteria)}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def targeting_decision(targeted_segment_id: str, rationale: str) -> dict[str, Any]:
    """The Targeting (stage 2) decision, BEFORE referential integrity against real ``segments[]`` is checked --
    ``generate_stp_analysis``/``evaluate_stp_integrity_gate`` perform that check, not this thin constructor."""
    return {"targeted_segment_id": targeted_segment_id, "rationale": rationale}


def _segment_id_set(segments: Any) -> tuple[bool, set[str] | None, str | None]:
    """Validates ``segments`` shape and returns ``(is_valid, id_set, failure_reason)``. Shared by the builder
    and the gate so neither can drift from the other."""
    if not isinstance(segments, list) or not segments:
        return False, None, "STP_EMPTY_SEGMENTS"
    ids: set[str] = set()
    for entry in segments:
        if not isinstance(entry, dict) or not _is_nonempty_str(entry.get("id")):
            return False, None, "STP_SEGMENT_MISSING_ID"
        if entry["id"] in ids:
            return False, None, "STP_DUPLICATE_SEGMENT_ID"
        if not _is_nonempty_str(entry.get("description")):
            return False, None, "STP_SEGMENT_MISSING_DESCRIPTION"
        criteria = entry.get("criteria")
        if not isinstance(criteria, list) or not criteria or not all(_is_nonempty_str(c) for c in criteria):
            return False, None, "STP_SEGMENT_MISSING_CRITERIA"
        ids.add(entry["id"])
    return True, ids, None


def generate_stp_analysis(
    record_id: str,
    segments: list[dict[str, Any]],
    targeting_decision: dict[str, Any],
    positioning_statement: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stp-analysis.schema.yaml``. Enforces every real invariant fail-closed BEFORE
    constructing a record -- same discipline every sibling module in this package establishes. ``targeting_decision``
    is the raw dict from the ``targeting_decision()`` constructor above (shadows that function's own name only
    within this parameter's local scope, matching the field name it becomes on the record)."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"STP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"STP_INVALID_VERSION: version must be a string, got {version!r}")

    segments_ok, id_set, reason = _segment_id_set(segments)
    if not segments_ok:
        raise InvariantViolation(f"{reason}: {_SEGMENT_FAILURE_MESSAGES[reason]}, got {segments!r}")

    if not isinstance(targeting_decision, dict):
        raise InvariantViolation(f"STP_INVALID_TARGETING_DECISION: targeting_decision must be a dict, got {targeting_decision!r}")
    targeted_id = targeting_decision.get("targeted_segment_id")
    if targeted_id not in id_set:
        raise InvariantViolation(
            f"STP_UNKNOWN_TARGET_SEGMENT_ID: targeting_decision.targeted_segment_id {targeted_id!r} does not resolve to any segment in "
            f"segments[] (Targeting cannot choose a segment Segmentation never identified) -- known ids {sorted(id_set)}"
        )
    if not _is_nonempty_str(targeting_decision.get("rationale")):
        raise InvariantViolation("STP_EMPTY_TARGETING_RATIONALE: targeting_decision.rationale must be a non-empty string")

    if not _is_nonempty_str(positioning_statement):
        raise InvariantViolation(
            "STP_EMPTY_POSITIONING_STATEMENT: positioning_statement must be a non-empty string -- Positioning (stage 3) is Atlas §12.14's "
            "own final, required stage; an STP record with no positioning content has not completed the method its own name promises"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "segments": [dict(s) for s in segments],
        "targeting_decision": {"targeted_segment_id": targeted_id, "rationale": targeting_decision["rationale"]},
        "positioning_statement": positioning_statement,
        "referential_integrity_verified": True,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance_record is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_stp_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_stp_analysis``, so a hand-tampered record (one that bypassed the builder entirely)
    is caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("stp_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("stp_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("stp_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    problems: list[dict[str, Any]] = []

    segments_ok, id_set, reason = _segment_id_set(record.get("segments"))
    if not segments_ok:
        problems.append({"reason": reason})
        id_set = set()

    decision = record.get("targeting_decision")
    if not isinstance(decision, dict):
        problems.append({"reason": "STP_INVALID_TARGETING_DECISION"})
    else:
        targeted_id = decision.get("targeted_segment_id")
        if targeted_id not in id_set:
            problems.append({"reason": "STP_UNKNOWN_TARGET_SEGMENT_ID", "targeted_segment_id": targeted_id})
        if not _is_nonempty_str(decision.get("rationale")):
            problems.append({"reason": "STP_EMPTY_TARGETING_RATIONALE"})

    if not _is_nonempty_str(record.get("positioning_statement")):
        problems.append({"reason": "STP_EMPTY_POSITIONING_STATEMENT"})

    if record.get("referential_integrity_verified") is not True:
        problems.append({"reason": "REFERENTIAL_INTEGRITY_VERIFIED_NOT_TRUE"})

    passed = not problems
    return _result("stp_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_stp_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stp_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
