"""``foresight.weak_signal_detection`` -- F13 foresight family (Atlas L673: "anomalies/niche events→triangulate→
monitor").

Real invariant: Atlas's own pipeline word is "triangulate" -- a weak signal
corroborated by only 1 source has not been triangulated, it is an
anecdote, and silently accepting it defeats the method's own stated
benefit (增加提前量 without false positives). Enforced at TWO independent
layers: the builder refuses to construct a weak signal with fewer than 2
DISTINCT corroborating source refs (distinct after whitespace
normalization -- " eu " and "eu" are the same source, not two), and the
gate independently re-derives the same check from raw fields.

Dedup grep (case-insensitive, full spec root, before writing): one near-miss
found -- `evidence.triangulation.contract.yaml` (evidence family, MP §9
Workflow IR) also uses "triangulate", but cross-validates research
themes/literature into a `TriangulatedFindingSet` with no built schema and
no per-signal source-count threshold. Not a duplicate; disclosed in
`methods/contracts/foresight.weak_signal_detection.contract.yaml`'s own
`open_questions`.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.weak_signal_detection"
RECORD_ID_PREFIX = "WSIG-"
VALID_MONITOR_STATUSES = frozenset({"MONITORING", "ESCALATING", "CONFIRMED", "DISCONFIRMED", "ARCHIVED"})
_MIN_DISTINCT_SOURCES = 2
_WEAK_SIGNAL_KEYS = frozenset({"id", "description", "corroborating_source_refs", "monitor_status"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _distinct_normalized_refs(refs: list[Any]) -> set[str]:
    """Whitespace-normalized distinctness -- " eu " and "eu" count as ONE source, not two (the exact bug a
    prior batch shipped, per this module's own docstring)."""
    return {ref.strip() for ref in refs if isinstance(ref, str)}


def _weak_signal_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, genuinely-triangulated weak signal" -- both
    ``weak_signal()`` (construction layer) and the gate's own re-derivation consult it, so the two layers
    cannot drift apart (same shape ``epistemic.evidence_matrix``'s ``_link_problem`` already establishes).
    Returns None when valid.
    """
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _WEAK_SIGNAL_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _WEAK_SIGNAL_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    refs = value.get("corroborating_source_refs")
    if not isinstance(refs, list) or not all(_is_nonempty_str(r) for r in refs):
        return f"corroborating_source_refs must be a list of non-empty strings, got {refs!r}"
    distinct = _distinct_normalized_refs(refs)
    if len(distinct) < _MIN_DISTINCT_SOURCES:
        return f"corroborating_source_refs has only {len(distinct)} distinct source(s) {sorted(distinct)} -- Atlas L673's own 'triangulate' requires >={_MIN_DISTINCT_SOURCES}, a single source is an anecdote, not a triangulated signal"
    if value.get("monitor_status") not in VALID_MONITOR_STATUSES:
        return f"monitor_status must be one of {sorted(VALID_MONITOR_STATUSES)}, got {value.get('monitor_status')!r}"
    return None


def weak_signal(signal_id: str, description: str, corroborating_source_refs: list[str], monitor_status: str) -> dict[str, Any]:
    """One item of ``typed-objects/weak-signal-detection.schema.yaml#/properties/weak_signals``. Deep-copies
    ``corroborating_source_refs`` -- a nested list field -- so the returned record never aliases the caller's
    own mutable list (see module docstring)."""
    record = {
        "id": signal_id,
        "description": description,
        "corroborating_source_refs": copy.deepcopy(corroborating_source_refs),
        "monitor_status": monitor_status,
    }
    problem = _weak_signal_problem(record)
    if problem is not None:
        raise InvariantViolation(f"WSIG_INVALID_WEAK_SIGNAL: {problem}")
    return record


def generate_weak_signal_detection_record(
    record_id: str,
    weak_signals: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/weak-signal-detection.schema.yaml``.

    Rebuilds every weak signal via ``weak_signal()`` (deep-copying ``corroborating_source_refs``, never trusting
    the caller's raw dicts/lists), then enforces the method contract's own real invariant fail-closed, in
    order: >=1 weak signal declared, every weak signal well-shaped and triangulated by >=2 distinct sources (via
    ``weak_signal()``), and no duplicate weak-signal ``id`` -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WSIG_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WSIG_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("WSIG_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(weak_signals, list) or not weak_signals:
        raise InvariantViolation("WSIG_NO_WEAK_SIGNALS: at least 1 weak signal is required")
    rebuilt: list[dict[str, Any]] = []
    for i, ws in enumerate(weak_signals):
        if not isinstance(ws, dict) or set(ws.keys()) - _WEAK_SIGNAL_KEYS or _WEAK_SIGNAL_KEYS - ws.keys():
            raise InvariantViolation(f"WSIG_INVALID_WEAK_SIGNAL: weak_signals[{i}] must be a {{{', '.join(sorted(_WEAK_SIGNAL_KEYS))}}} object, got {ws!r}")
        rebuilt.append(weak_signal(ws["id"], ws["description"], ws["corroborating_source_refs"], ws["monitor_status"]))

    ids = [ws["id"] for ws in rebuilt]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"WSIG_DUPLICATE_ID: weak_signals[] ids must be unique, duplicates found: {duplicate_ids}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "weak_signals": rebuilt,
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


def evaluate_triangulation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L673's own 'triangulate' invariant directly from raw fields via the SAME predicate
    ``weak_signal()`` uses -- not just trusting that ``generate_weak_signal_detection_record``'s own
    construction-time check already ran. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("triangulation_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    weak_signals = record.get("weak_signals")
    if not isinstance(weak_signals, list) or not weak_signals:
        return _result("triangulation_required", False, [{"reason": "weak_signals must be a non-empty list"}], validator, timestamp)
    problems = [f"weak_signals[{i}]: {problem}" for i, problem in ((i, _weak_signal_problem(ws)) for i, ws in enumerate(weak_signals)) if problem]
    passed = not problems
    return _result("triangulation_required", passed, [{"weak_signals_checked": len(weak_signals), "problems": problems}], validator, timestamp)


def evaluate_no_duplicate_id_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the no-duplicate-id invariant directly from raw fields. Fails closed on malformed entries."""
    if not isinstance(record, dict):
        return _result("no_duplicate_id", False, [{"reason": "record is not a dict"}], validator, timestamp)
    weak_signals = record.get("weak_signals")
    if not isinstance(weak_signals, list):
        return _result("no_duplicate_id", False, [{"reason": "weak_signals must be a list"}], validator, timestamp)
    ids = [ws.get("id") if isinstance(ws, dict) else None for ws in weak_signals]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1}, key=repr)
    passed = not duplicate_ids
    return _result("no_duplicate_id", passed, [{"weak_signals_checked": len(weak_signals), "duplicate_ids": duplicate_ids}], validator, timestamp)


def evaluate_weak_signal_detection_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_triangulation_gate(record, validator, timestamp),
        evaluate_no_duplicate_id_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
