"""``foresight.outlier_analysis`` -- F13 foresight family (Atlas L678: "identify→排除資料錯誤→深挖機制").

Real invariant: Atlas's own 3-step pipeline puts "排除資料錯誤" (rule out
data error) strictly BEFORE "深挖機制" (dig into mechanism) -- ruling out
data error is the MIDDLE step, not skippable. A `mechanism_hypothesis` may
only be present when `data_error_ruled_out` is exactly `True` (a real
bool -- `isinstance(x, bool)` correctly excludes int 0/1, since `bool` is
a subclass of `int` but not vice versa) AND `data_error_assessment` is
non-empty. Enforced at TWO independent layers: the builder refuses to
construct an outlier that violates the ordering, and the gate
independently re-derives the same check from raw fields.

Dedup grep (case-insensitive, full spec root, before writing): one
near-miss found -- `data-quality-assessment-record.schema.yaml`'s own
description cites Master Plan §35's ML checklist (which lists "Outliers"
as one of nine dataset-profiling dimensions), but that method profiles a
WHOLE DATASET's fields, not an individual anomalous case's own mechanism.
Not a duplicate; disclosed in
`methods/contracts/foresight.outlier_analysis.contract.yaml`'s own
`open_questions`.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.outlier_analysis"
RECORD_ID_PREFIX = "OUTLIER-"
_OUTLIER_REQUIRED_KEYS = frozenset({"id", "description", "data_error_ruled_out", "data_error_assessment"})
_OUTLIER_OPTIONAL_KEYS = frozenset({"mechanism_hypothesis"})
_OUTLIER_ALL_KEYS = _OUTLIER_REQUIRED_KEYS | _OUTLIER_OPTIONAL_KEYS


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _outlier_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped outlier that respects Atlas L678's own ordering" -- both
    ``outlier()`` (construction layer) and the gate's own re-derivation consult it, so the two layers cannot
    drift apart (same shape ``epistemic.evidence_matrix``'s ``_link_problem`` already establishes). Returns
    None when valid.
    """
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _OUTLIER_ALL_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _OUTLIER_REQUIRED_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    ruled_out = value.get("data_error_ruled_out")
    if not isinstance(ruled_out, bool):
        return f"data_error_ruled_out must be a real bool, got {ruled_out!r} ({type(ruled_out).__name__}) -- int 0/1 is not accepted"
    if not _is_nonempty_str(value.get("data_error_assessment")):
        return f"data_error_assessment must be a non-empty string, got {value.get('data_error_assessment')!r}"
    if "mechanism_hypothesis" in value:
        mechanism = value["mechanism_hypothesis"]
        if not _is_nonempty_str(mechanism):
            return f"mechanism_hypothesis must be a non-empty string when present, got {mechanism!r}"
        if ruled_out is not True:
            return "mechanism_hypothesis present but data_error_ruled_out is not True -- Atlas L678's own pipeline (identify→排除資料錯誤→深挖機制) forbids digging into mechanism before data error is ruled out"
    return None


def outlier(outlier_id: str, description: str, data_error_ruled_out: bool, data_error_assessment: str, mechanism_hypothesis: str | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/outlier-analysis.schema.yaml#/properties/outliers``."""
    record: dict[str, Any] = {
        "id": outlier_id,
        "description": description,
        "data_error_ruled_out": data_error_ruled_out,
        "data_error_assessment": data_error_assessment,
    }
    if mechanism_hypothesis is not None:
        record["mechanism_hypothesis"] = mechanism_hypothesis
    problem = _outlier_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OUTLIER_INVALID_OUTLIER: {problem}")
    return record


def generate_outlier_analysis_record(
    record_id: str,
    outliers: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/outlier-analysis.schema.yaml``.

    Rebuilds every outlier via ``outlier()`` (never trusting the caller's raw dicts), then enforces the method
    contract's own real invariant fail-closed, in order: >=1 outlier declared, every outlier well-shaped and
    respecting Atlas L678's own data-error-before-mechanism ordering (via ``outlier()``), and no duplicate
    outlier ``id`` -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OUTLIER_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OUTLIER_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("OUTLIER_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(outliers, list) or not outliers:
        raise InvariantViolation("OUTLIER_NO_OUTLIERS: at least 1 outlier is required -- Atlas L678's own 'identify' step")
    rebuilt: list[dict[str, Any]] = []
    for i, o in enumerate(outliers):
        if not isinstance(o, dict) or set(o.keys()) - _OUTLIER_ALL_KEYS or _OUTLIER_REQUIRED_KEYS - o.keys():
            raise InvariantViolation(f"OUTLIER_INVALID_OUTLIER: outliers[{i}] must be an object with required keys {sorted(_OUTLIER_REQUIRED_KEYS)} (optionally {sorted(_OUTLIER_OPTIONAL_KEYS)}), got {o!r}")
        rebuilt.append(outlier(o["id"], o["description"], o["data_error_ruled_out"], o["data_error_assessment"], o.get("mechanism_hypothesis")))

    ids = [o["id"] for o in rebuilt]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"OUTLIER_DUPLICATE_ID: outliers[] ids must be unique, duplicates found: {duplicate_ids}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "outliers": copy.deepcopy(rebuilt),
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_data_error_ordering_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L678's own data-error-before-mechanism ordering directly from raw fields via the SAME
    predicate ``outlier()`` uses -- not just trusting that ``generate_outlier_analysis_record``'s own
    construction-time check already ran. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("data_error_ruled_out_before_mechanism", False, [{"reason": "record is not a dict"}], validator, timestamp)
    outliers = record.get("outliers")
    if not isinstance(outliers, list) or not outliers:
        return _result("data_error_ruled_out_before_mechanism", False, [{"reason": "outliers must be a non-empty list"}], validator, timestamp)
    problems = [f"outliers[{i}]: {problem}" for i, problem in ((i, _outlier_problem(o)) for i, o in enumerate(outliers)) if problem]
    passed = not problems
    return _result("data_error_ruled_out_before_mechanism", passed, [{"outliers_checked": len(outliers), "problems": problems}], validator, timestamp)


def evaluate_no_duplicate_id_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the no-duplicate-id invariant directly from raw fields. Fails closed on malformed entries."""
    if not isinstance(record, dict):
        return _result("no_duplicate_id", False, [{"reason": "record is not a dict"}], validator, timestamp)
    outliers = record.get("outliers")
    if not isinstance(outliers, list):
        return _result("no_duplicate_id", False, [{"reason": "outliers must be a list"}], validator, timestamp)
    ids = [o.get("id") if isinstance(o, dict) else None for o in outliers]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1}, key=repr)
    passed = not duplicate_ids
    return _result("no_duplicate_id", passed, [{"outliers_checked": len(outliers), "duplicate_ids": duplicate_ids}], validator, timestamp)


def evaluate_outlier_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_data_error_ordering_gate(record, validator, timestamp),
        evaluate_no_duplicate_id_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
