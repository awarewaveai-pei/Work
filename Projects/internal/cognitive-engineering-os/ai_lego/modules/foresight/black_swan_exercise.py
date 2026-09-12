"""``foresight.black_swan_exercise`` -- F13 unknown-unknowns/foresight family (Atlas L668-685), FIRST built
member.

Atlas's own table row (L679, verbatim): "Black Swan Exercise | 低機率高衝擊 | tail events→exposure→
survivability→hedges | 強化韌性" (low-probability/high-impact; tail events -> exposure -> survivability ->
hedges; benefit: strengthen resilience). No dedicated §11/§12 section exists for this method -- the table row
is the sole citation (see the method contract's own `verification` for the grep record).

Real invariant (referential completeness across a 4-stage chain, enforced at TWO independent layers, same
belt-and-suspenders discipline every prior slice in this corpus establishes):

  1. Every ``exposures[].tail_event_id`` must resolve to a declared ``tail_events[]`` entry.
  2. Every ``survivability_assessments[].exposure_id`` must resolve to a declared ``exposures[]`` entry.
  3. Every ``hedges[].exposure_id`` must resolve to a declared ``exposures[]`` entry.
  4. Every declared ``tail_events[]`` entry must be referenced by >=1 ``exposures[]`` entry -- a tail event
     with no traced exposure is the first pipeline stage silently skipped.
  5. Every declared ``exposures[]`` entry must be referenced by >=1 ``survivability_assessments[]`` entry --
     Atlas's own "exposure→survivability" step, mechanized; an exposure nobody assessed for survivability is
     exactly the stage this method exists to force (its own benefit column, "強化韌性", depends on it).

``hedges[]`` is checked for referential integrity only (invariant 3) -- NO per-exposure hedge-coverage
requirement is enforced, a disclosed scope choice (see the method contract's own `compilation_decisions` and
OQ-BSWAN-1): a black swan exercise may conclude some exposures are accepted risk with no hedge built yet,
without that making the exercise incomplete the way an unassessed exposure would.

Every ``tail_events[]``/``exposures[]``/``survivability_assessments[]``/``hedges[]`` entry is rebuilt via
``copy.deepcopy`` of the caller-supplied dict (never a shallow ``dict()`` copy) -- a critic review of this
corpus's own F09 batch (2026-09-12, ``ai_lego/modules/systems/__init__.py``) found builders silently sharing a
mutable dict/list with the caller's own input via a shallow copy; this module applies that fix proactively.

Record-level-only provenance (batch-wide precedent this corpus's F06/F07/F12 builds already use, matching
``challenge.red_team``/``challenge.pre_mortem``/``stakeholders.game_theory``'s own overall-record field) -- no
per-item provenance.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "black swan"/"black_swan"/
"tail_event" before writing any of this method's own files: only Atlas's own L679 table row and the two
name-only ``method-inventory.yaml`` listings found, zero pre-existing implementation.

Distinct from ``challenge.pre_mortem`` (read in full first) despite a superficially similar chain+coverage
shape: pre-mortem assumes ONE SPECIFIC project has already failed and works backward to causes/controls; this
method catalogues MULTIPLE independent tail events and asks a portfolio-level survivability/hedging question
per event, with no clustering/likelihood-impact-priority ranking step (Atlas L679 cites none). Not a duplicate
under a different name -- see the method contract's own description for the full disclosure.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.black_swan_exercise"
RECORD_ID_PREFIX = "BSWAN-"

_TAIL_EVENT_KEYS = frozenset({"id", "description"})
_EXPOSURE_KEYS = frozenset({"id", "tail_event_id", "description"})
_SURVIVABILITY_KEYS = frozenset({"id", "exposure_id", "description"})
_HEDGE_KEYS = frozenset({"id", "exposure_id", "description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this package already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Shape validators -- the SINGLE definition of "is this entry well-shaped", consulted by both the builder and
# the independent gate re-derivation (same shared-predicate discipline ``epistemic.evidence_matrix``'s own
# ``_link_problem`` establishes) so the two layers cannot drift apart.
# --------------------------------------------------------------------------


def _tail_event_problem(value: Any) -> str | None:
    if not isinstance(value, dict) or set(value.keys()) != _TAIL_EVENT_KEYS:
        return f"must be a dict with exactly the keys {sorted(_TAIL_EVENT_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def _exposure_problem(value: Any) -> str | None:
    if not isinstance(value, dict) or set(value.keys()) != _EXPOSURE_KEYS:
        return f"must be a dict with exactly the keys {sorted(_EXPOSURE_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("tail_event_id")):
        return f"tail_event_id must be a non-empty string, got {value.get('tail_event_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def _survivability_assessment_problem(value: Any) -> str | None:
    if not isinstance(value, dict) or set(value.keys()) != _SURVIVABILITY_KEYS:
        return f"must be a dict with exactly the keys {sorted(_SURVIVABILITY_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("exposure_id")):
        return f"exposure_id must be a non-empty string, got {value.get('exposure_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def _hedge_problem(value: Any) -> str | None:
    if not isinstance(value, dict) or set(value.keys()) != _HEDGE_KEYS:
        return f"must be a dict with exactly the keys {sorted(_HEDGE_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("exposure_id")):
        return f"exposure_id must be a non-empty string, got {value.get('exposure_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


# --------------------------------------------------------------------------
# Convenience constructors (NOT the invariant boundary -- generate_black_swan_exercise independently
# re-validates every entry regardless of how it was built, same discipline every sibling module establishes).
# --------------------------------------------------------------------------


def tail_event(event_id: str, description: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_black_swan_exercise``'s own ``tail_events`` parameter."""
    entry = {"id": event_id, "description": description}
    problem = _tail_event_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"BSWAN_INVALID_TAIL_EVENT: {problem}")
    return entry


def exposure(exposure_id: str, tail_event_id: str, description: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_black_swan_exercise``'s own ``exposures`` parameter. Does NOT itself
    check that ``tail_event_id`` resolves to a declared tail event -- that cross-field check happens once, in
    ``generate_black_swan_exercise``, after every entry has been rebuilt."""
    entry = {"id": exposure_id, "tail_event_id": tail_event_id, "description": description}
    problem = _exposure_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"BSWAN_INVALID_EXPOSURE: {problem}")
    return entry


def survivability_assessment(assessment_id: str, exposure_id: str, description: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_black_swan_exercise``'s own ``survivability_assessments`` parameter."""
    entry = {"id": assessment_id, "exposure_id": exposure_id, "description": description}
    problem = _survivability_assessment_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"BSWAN_INVALID_SURVIVABILITY_ASSESSMENT: {problem}")
    return entry


def hedge(hedge_id: str, exposure_id: str, description: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_black_swan_exercise``'s own ``hedges`` parameter."""
    entry = {"id": hedge_id, "exposure_id": exposure_id, "description": description}
    problem = _hedge_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"BSWAN_INVALID_HEDGE: {problem}")
    return entry


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_black_swan_exercise(
    record_id: str,
    tail_events: list[dict[str, Any]],
    exposures: list[dict[str, Any]],
    survivability_assessments: list[dict[str, Any]],
    hedges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/black-swan-exercise.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then tail_events
    (non-empty, well-shaped, unique ids), then exposures (well-shaped, unique ids, every tail_event_id
    resolves), then survivability_assessments (well-shaped, unique ids, every exposure_id resolves), then
    hedges (well-shaped, unique ids, every exposure_id resolves), and only THEN the two real cross-array
    coverage invariants this method exists to enforce -- every tail event covered by >=1 exposure, every
    exposure covered by >=1 survivability assessment (Atlas L679's own chain completeness).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BSWAN_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BSWAN_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BSWAN_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(tail_events, list) or not tail_events:
        raise InvariantViolation(f"BSWAN_EMPTY_TAIL_EVENTS: tail_events must be a non-empty list (Atlas L679 stage 1: 'tail events'), got {_shallow_describe(tail_events)}")
    tail_event_problems = [f"tail_events[{i}]: {p}" for i, p in ((i, _tail_event_problem(e)) for i, e in enumerate(tail_events)) if p]
    if tail_event_problems:
        raise InvariantViolation(f"BSWAN_INVALID_TAIL_EVENT_ENTRY: {tail_event_problems}")
    tail_event_ids = [e["id"] for e in tail_events]
    duplicate_tail_event_ids = sorted({tid for tid in tail_event_ids if tail_event_ids.count(tid) > 1})
    if duplicate_tail_event_ids:
        raise InvariantViolation(f"BSWAN_DUPLICATE_TAIL_EVENT_ID: tail_events id(s) {duplicate_tail_event_ids} appear more than once")

    if not isinstance(exposures, list):
        raise InvariantViolation(f"BSWAN_INVALID_EXPOSURES: exposures must be a list, got {_shallow_describe(exposures)}")
    exposure_problems = [f"exposures[{i}]: {p}" for i, p in ((i, _exposure_problem(e)) for i, e in enumerate(exposures)) if p]
    if exposure_problems:
        raise InvariantViolation(f"BSWAN_INVALID_EXPOSURE_ENTRY: {exposure_problems}")
    exposure_ids = [e["id"] for e in exposures]
    duplicate_exposure_ids = sorted({eid for eid in exposure_ids if exposure_ids.count(eid) > 1})
    if duplicate_exposure_ids:
        raise InvariantViolation(f"BSWAN_DUPLICATE_EXPOSURE_ID: exposures id(s) {duplicate_exposure_ids} appear more than once")
    tail_event_id_set = set(tail_event_ids)
    dangling_tail_event_refs = sorted({e["tail_event_id"] for e in exposures} - tail_event_id_set)
    if dangling_tail_event_refs:
        raise InvariantViolation(f"BSWAN_EXPOSURE_UNKNOWN_TAIL_EVENT: exposures[] tail_event_id {dangling_tail_event_refs} do not reference any tail_events[] id in this record")

    if not isinstance(survivability_assessments, list):
        raise InvariantViolation(f"BSWAN_INVALID_SURVIVABILITY_ASSESSMENTS: survivability_assessments must be a list, got {_shallow_describe(survivability_assessments)}")
    survivability_problems = [f"survivability_assessments[{i}]: {p}" for i, p in ((i, _survivability_assessment_problem(a)) for i, a in enumerate(survivability_assessments)) if p]
    if survivability_problems:
        raise InvariantViolation(f"BSWAN_INVALID_SURVIVABILITY_ASSESSMENT_ENTRY: {survivability_problems}")
    survivability_ids = [a["id"] for a in survivability_assessments]
    duplicate_survivability_ids = sorted({aid for aid in survivability_ids if survivability_ids.count(aid) > 1})
    if duplicate_survivability_ids:
        raise InvariantViolation(f"BSWAN_DUPLICATE_SURVIVABILITY_ASSESSMENT_ID: survivability_assessments id(s) {duplicate_survivability_ids} appear more than once")
    exposure_id_set = set(exposure_ids)
    dangling_exposure_refs_from_survivability = sorted({a["exposure_id"] for a in survivability_assessments} - exposure_id_set)
    if dangling_exposure_refs_from_survivability:
        raise InvariantViolation(f"BSWAN_SURVIVABILITY_ASSESSMENT_UNKNOWN_EXPOSURE: survivability_assessments[] exposure_id {dangling_exposure_refs_from_survivability} do not reference any exposures[] id in this record")

    if not isinstance(hedges, list):
        raise InvariantViolation(f"BSWAN_INVALID_HEDGES: hedges must be a list, got {_shallow_describe(hedges)}")
    hedge_problems = [f"hedges[{i}]: {p}" for i, p in ((i, _hedge_problem(h)) for i, h in enumerate(hedges)) if p]
    if hedge_problems:
        raise InvariantViolation(f"BSWAN_INVALID_HEDGE_ENTRY: {hedge_problems}")
    hedge_ids = [h["id"] for h in hedges]
    duplicate_hedge_ids = sorted({hid for hid in hedge_ids if hedge_ids.count(hid) > 1})
    if duplicate_hedge_ids:
        raise InvariantViolation(f"BSWAN_DUPLICATE_HEDGE_ID: hedges id(s) {duplicate_hedge_ids} appear more than once")
    dangling_exposure_refs_from_hedges = sorted({h["exposure_id"] for h in hedges} - exposure_id_set)
    if dangling_exposure_refs_from_hedges:
        raise InvariantViolation(f"BSWAN_HEDGE_UNKNOWN_EXPOSURE: hedges[] exposure_id {dangling_exposure_refs_from_hedges} do not reference any exposures[] id in this record")

    # THE real invariants (Atlas L679's own chain completeness) -- checked LAST, after every other shape/
    # reference check has already passed, so the error message below is always about genuinely well-formed
    # entries that simply fail to cover each other, never a symptom of a malformed entry upstream.
    exposed_tail_event_ids = {e["tail_event_id"] for e in exposures}
    uncovered_tail_events = sorted(tail_event_id_set - exposed_tail_event_ids)
    if uncovered_tail_events:
        raise InvariantViolation(
            f"BSWAN_UNCOVERED_TAIL_EVENT: tail_events id(s) {uncovered_tail_events} have no traced exposures[] entry -- Atlas L679 stage 1->2 "
            "('tail events→exposure') requires every named tail event to have at least one traced exposure"
        )
    assessed_exposure_ids = {a["exposure_id"] for a in survivability_assessments}
    uncovered_exposures = sorted(exposure_id_set - assessed_exposure_ids)
    if uncovered_exposures:
        raise InvariantViolation(
            f"BSWAN_UNCOVERED_EXPOSURE: exposures id(s) {uncovered_exposures} have no covering survivability_assessments[] entry -- Atlas L679 stage "
            "2->3 ('exposure→survivability') requires every named exposure to have at least one survivability assessment"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "tail_events": [copy.deepcopy(e) for e in tail_events],
        "exposures": [copy.deepcopy(e) for e in exposures],
        "survivability_assessments": [copy.deepcopy(a) for a in survivability_assessments],
        "hedges": [copy.deepcopy(h) for h in hedges],
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_black_swan_exercise -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_black_swan_chain_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_black_swan_exercise``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a covering survivability assessment spliced out after construction) is caught here exactly
    as a builder-refused one would have been. Fails closed on malformed input rather than crashing -- every
    check below is a pure boolean predicate over ``problems``, none raises."""
    if not isinstance(record, dict):
        return _result("black_swan_chain_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    record_id = record.get("id")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a non-empty string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")

    tail_events = record.get("tail_events")
    tail_event_ids: set[Any] = set()
    if isinstance(tail_events, list) and tail_events:
        malformed = [f"tail_events[{i}]: {p}" for i, p in ((i, _tail_event_problem(e)) for i, e in enumerate(tail_events)) if p]
        problems.extend(malformed)
        well_shaped_tail_events = [e for e in tail_events if _tail_event_problem(e) is None]
        tail_event_ids = {e["id"] for e in well_shaped_tail_events}
        duplicate_tail_event_ids = sorted({tid for tid in [e["id"] for e in well_shaped_tail_events] if [e["id"] for e in well_shaped_tail_events].count(tid) > 1}, key=repr)
        if duplicate_tail_event_ids:
            problems.append(f"duplicate tail_events id(s): {duplicate_tail_event_ids}")
    else:
        problems.append("tail_events must be a non-empty list")

    exposures = record.get("exposures")
    exposure_ids: set[Any] = set()
    exposed_tail_event_ids: set[Any] = set()
    if isinstance(exposures, list):
        malformed = [f"exposures[{i}]: {p}" for i, p in ((i, _exposure_problem(e)) for i, e in enumerate(exposures)) if p]
        problems.extend(malformed)
        well_shaped_exposures = [e for e in exposures if _exposure_problem(e) is None]
        exposure_ids = {e["id"] for e in well_shaped_exposures}
        exposed_tail_event_ids = {e["tail_event_id"] for e in well_shaped_exposures}
        eid_list = [e["id"] for e in well_shaped_exposures]
        duplicate_exposure_ids = sorted({eid for eid in eid_list if eid_list.count(eid) > 1}, key=repr)
        if duplicate_exposure_ids:
            problems.append(f"duplicate exposures id(s): {duplicate_exposure_ids}")
        dangling_tail_event_refs = sorted({e["tail_event_id"] for e in well_shaped_exposures} - tail_event_ids, key=repr)
        if dangling_tail_event_refs:
            problems.append(f"exposures[] reference unknown tail_event_id(s): {dangling_tail_event_refs}")
    else:
        problems.append("exposures must be a list")

    survivability_assessments = record.get("survivability_assessments")
    assessed_exposure_ids: set[Any] = set()
    if isinstance(survivability_assessments, list):
        malformed = [f"survivability_assessments[{i}]: {p}" for i, p in ((i, _survivability_assessment_problem(a)) for i, a in enumerate(survivability_assessments)) if p]
        problems.extend(malformed)
        well_shaped_assessments = [a for a in survivability_assessments if _survivability_assessment_problem(a) is None]
        assessed_exposure_ids = {a["exposure_id"] for a in well_shaped_assessments}
        aid_list = [a["id"] for a in well_shaped_assessments]
        duplicate_assessment_ids = sorted({aid for aid in aid_list if aid_list.count(aid) > 1}, key=repr)
        if duplicate_assessment_ids:
            problems.append(f"duplicate survivability_assessments id(s): {duplicate_assessment_ids}")
        dangling_exposure_refs = sorted({a["exposure_id"] for a in well_shaped_assessments} - exposure_ids, key=repr)
        if dangling_exposure_refs:
            problems.append(f"survivability_assessments[] reference unknown exposure_id(s): {dangling_exposure_refs}")
    else:
        problems.append("survivability_assessments must be a list")

    hedges = record.get("hedges")
    if isinstance(hedges, list):
        malformed = [f"hedges[{i}]: {p}" for i, p in ((i, _hedge_problem(h)) for i, h in enumerate(hedges)) if p]
        problems.extend(malformed)
        well_shaped_hedges = [h for h in hedges if _hedge_problem(h) is None]
        hid_list = [h["id"] for h in well_shaped_hedges]
        duplicate_hedge_ids = sorted({hid for hid in hid_list if hid_list.count(hid) > 1}, key=repr)
        if duplicate_hedge_ids:
            problems.append(f"duplicate hedges id(s): {duplicate_hedge_ids}")
        dangling_exposure_refs_from_hedges = sorted({h["exposure_id"] for h in well_shaped_hedges} - exposure_ids, key=repr)
        if dangling_exposure_refs_from_hedges:
            problems.append(f"hedges[] reference unknown exposure_id(s): {dangling_exposure_refs_from_hedges}")
    else:
        problems.append("hedges must be a list")

    if not problems:
        uncovered_tail_events = sorted(tail_event_ids - exposed_tail_event_ids, key=repr)
        if uncovered_tail_events:
            problems.append(f"tail_events with zero traced exposures[]: {uncovered_tail_events}")
        uncovered_exposures = sorted(exposure_ids - assessed_exposure_ids, key=repr)
        if uncovered_exposures:
            problems.append(f"exposures with zero covering survivability_assessments[]: {uncovered_exposures}")

    passed = not problems
    return _result("black_swan_chain_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_black_swan_exercise_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_black_swan_chain_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
