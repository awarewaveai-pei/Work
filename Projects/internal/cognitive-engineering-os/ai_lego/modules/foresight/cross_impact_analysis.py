"""``foresight.cross_impact_analysis`` -- F13 unknown-unknowns/foresight family (Atlas L668-685).

Atlas's own table row (L685, verbatim): "Cross-impact Analysis | 分析事件互
相改變機率 | event pair matrix->scenario consistency | 避免把趨勢當獨立"
(analyze how events mutually change each other's probability, via an event
pair matrix, checked for scenario consistency; avoid treating trends as
independent).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``XIMPACT_DANGLING_EVENT_REF``) -- every
   ``impact_pairs[].event_a_id``/``event_b_id`` must resolve to a declared
   ``events[]`` entry.
2. **No self-pair** (``XIMPACT_SELF_PAIR``) -- an event cannot have a
   cross-impact relationship with itself.
3. **Matrix completeness, THE real invariant this method exists to
   enforce** (``XIMPACT_MISSING_PAIR`` / ``XIMPACT_DUPLICATE_PAIR``) --
   Atlas's own pipeline says "event pair matrix"; a matrix silently
   missing a pair (or asserting the same unordered pair twice, e.g. once
   as {A,B} and once as {B,A}) lets exactly the "把趨勢當獨立" (treat
   trends as independent) assumption this method's own benefit column
   names back in through the gap. Every unordered pair of declared events
   must be present exactly once.
4. **Valid shift range** (``XIMPACT_INVALID_SHIFT``) -- every
   ``conditional_probability_shift`` must be a real, finite number in
   [-1, 1] (``bool`` excluded -- Python's ``bool`` is an ``int`` subclass,
   the same documented trap ``epistemic.bayesian_updating``'s own
   ``_is_valid_probability`` guards against).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"cross-impact"/"cross impact"/"event pair matrix" before writing any of
this method's own files: zero pre-existing implementation or schema title
overlap.
"""

from __future__ import annotations

import copy
import itertools
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.cross_impact_analysis"
RECORD_ID_PREFIX = "XIMPACT-"
_EVENT_KEYS = frozenset({"event_id", "description"})
_PAIR_KEYS = frozenset({"event_a_id", "event_b_id", "conditional_probability_shift"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_shift(value: Any) -> bool:
    """A conditional_probability_shift must be a real, finite number in [-1, 1]. ``bool`` excluded (Python's
    ``bool`` is an ``int`` subclass -- see this corpus's own ``epistemic.bayesian_updating`` documented trap).
    ``int`` is unconditionally finite in Python and is range-checked directly rather than passed through
    ``math.isfinite`` (that function raises ``OverflowError`` on a huge ``int``, a trap only reachable via the
    ``float`` branch below)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return -1 <= value <= 1
    if isinstance(value, float):
        return math.isfinite(value) and -1.0 <= value <= 1.0
    return False


def _event_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped events[] entry". Both ``event()`` (construction layer)
    and the gate (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _EVENT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _EVENT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_EVENT_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("event_id")):
        return f"event_id must be a non-empty string, got {value.get('event_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def event(event_id: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/cross-impact-analysis.schema.yaml#/properties/events``."""
    record = {"event_id": event_id, "description": description}
    problem = _event_problem(record)
    if problem is not None:
        raise InvariantViolation(f"XIMPACT_INVALID_EVENT: {problem}")
    return record


def _pair_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped impact_pairs[] entry" -- shape/range/self-pair only, NOT
    referential integrity against ``events[]`` or matrix completeness, which need the sibling array and are
    checked once in ``generate_cross_impact_analysis``/the gate (same division of labor ``epistemic.
    evidence_matrix``'s ``link()``/``generate_evidence_matrix`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _PAIR_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _PAIR_KEYS <= value.keys():
        return f"missing key(s) {sorted(_PAIR_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("event_a_id")):
        return f"event_a_id must be a non-empty string, got {value.get('event_a_id')!r}"
    if not _is_nonempty_str(value.get("event_b_id")):
        return f"event_b_id must be a non-empty string, got {value.get('event_b_id')!r}"
    if value.get("event_a_id") == value.get("event_b_id"):
        return f"event_a_id and event_b_id must differ, both are {value.get('event_a_id')!r} -- an event cannot have a cross-impact relationship with itself"
    if not _is_valid_shift(value.get("conditional_probability_shift")):
        return f"conditional_probability_shift must be a real finite number in [-1, 1] (bool excluded), got {value.get('conditional_probability_shift')!r}"
    return None


def impact_pair(event_a_id: str, event_b_id: str, conditional_probability_shift: float) -> dict[str, Any]:
    """One item of ``typed-objects/cross-impact-analysis.schema.yaml#/properties/impact_pairs``. Does NOT itself
    check referential integrity against a declared ``events[]`` list or matrix completeness -- those cross-field
    checks happen once, in ``generate_cross_impact_analysis``, after every pair has been rebuilt."""
    record = {"event_a_id": event_a_id, "event_b_id": event_b_id, "conditional_probability_shift": conditional_probability_shift}
    problem = _pair_problem(record)
    if problem is not None:
        raise InvariantViolation(f"XIMPACT_INVALID_PAIR: {problem}")
    return record


def generate_cross_impact_analysis(
    record_id: str,
    events: list[dict[str, Any]],
    impact_pairs: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cross-impact-analysis.schema.yaml``.

    Rebuilds every ``events[]``/``impact_pairs[]`` entry via ``event()``/``impact_pair()`` (never trusting the
    caller's raw dicts), then enforces the method contract's own real invariants fail-closed, in order: id/
    version/provenance shape, >=2 distinct events declared, every pair resolves to real events (both directions)
    with no self-pair, and -- the invariant Atlas's own "event pair matrix" pipeline stage exists to enforce --
    every unordered pair of declared events is present EXACTLY ONCE (no missing pair, no duplicate unordered
    pair) -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"XIMPACT_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"XIMPACT_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("XIMPACT_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(events, list):
        raise InvariantViolation(f"XIMPACT_INVALID_EVENTS: events must be a list, got {type(events).__name__}")
    rebuilt_events: list[dict[str, Any]] = []
    for i, e in enumerate(events):
        if not isinstance(e, dict):
            raise InvariantViolation(f"XIMPACT_INVALID_EVENTS: events[{i}] must be a dict, got {e!r}")
        rebuilt_events.append(event(e.get("event_id"), e.get("description")))
    event_ids = [e["event_id"] for e in rebuilt_events]
    if len(event_ids) != len(set(event_ids)):
        duplicate = sorted({e for e in event_ids if event_ids.count(e) > 1})
        raise InvariantViolation(f"XIMPACT_DUPLICATE_EVENT_ID: event_id(s) {duplicate} declared more than once")
    if len(rebuilt_events) < 2:
        raise InvariantViolation(f"XIMPACT_TOO_FEW_EVENTS: at least 2 events are required, got {len(rebuilt_events)} -- a cross-impact matrix over fewer than 2 events has no pairs to analyze")

    if not isinstance(impact_pairs, list):
        raise InvariantViolation(f"XIMPACT_INVALID_IMPACT_PAIRS: impact_pairs must be a list, got {type(impact_pairs).__name__}")
    rebuilt_pairs: list[dict[str, Any]] = []
    for i, p in enumerate(impact_pairs):
        if not isinstance(p, dict):
            raise InvariantViolation(f"XIMPACT_INVALID_IMPACT_PAIRS: impact_pairs[{i}] must be a dict, got {p!r}")
        try:
            rebuilt_pairs.append(impact_pair(p.get("event_a_id"), p.get("event_b_id"), p.get("conditional_probability_shift")))
        except InvariantViolation as error:
            raise InvariantViolation(f"XIMPACT_INVALID_IMPACT_PAIRS: impact_pairs[{i}]: {error}") from error

    event_id_set = set(event_ids)
    dangling = sorted({eid for p in rebuilt_pairs for eid in (p["event_a_id"], p["event_b_id"])} - event_id_set)
    if dangling:
        raise InvariantViolation(f"XIMPACT_DANGLING_EVENT_REF: impact_pairs[] reference event_id(s) {dangling} not present in events[]")

    expected_pairs = {frozenset(pair) for pair in itertools.combinations(event_ids, 2)}
    actual_pair_keys = [frozenset({p["event_a_id"], p["event_b_id"]}) for p in rebuilt_pairs]
    duplicate_pairs = sorted({repr(sorted(k, key=repr)) for k in actual_pair_keys if actual_pair_keys.count(k) > 1})
    if duplicate_pairs:
        raise InvariantViolation(f"XIMPACT_DUPLICATE_PAIR: the same unordered event pair is asserted more than once: {duplicate_pairs}")
    missing_pairs = sorted((sorted(pair, key=repr) for pair in expected_pairs - set(actual_pair_keys)), key=repr)
    if missing_pairs:
        raise InvariantViolation(
            f"XIMPACT_MISSING_PAIR: the event pair matrix is incomplete -- missing pair(s) {missing_pairs}. "
            "Atlas L685's own 'event pair matrix' pipeline stage requires every unordered pair of declared events to be present"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "events": rebuilt_events,
        "impact_pairs": rebuilt_pairs,
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


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives events/pairs shape, event-count minimum, referential integrity, and no-self-pair directly from
    raw fields using the SAME ``_event_problem``/``_pair_problem`` predicates the builder uses -- without this
    the gate could pass records the builder refuses. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    events = record.get("events")
    event_id_set: set[Any] = set()
    if isinstance(events, list):
        malformed_events = [f"events[{i}]: {problem}" for i, problem in ((i, _event_problem(e)) for i, e in enumerate(events)) if problem]
        problems.extend(malformed_events)
        well_shaped_events = [e for e in events if _event_problem(e) is None]
        event_ids = [e["event_id"] for e in well_shaped_events]
        event_id_set = set(event_ids)
        if not malformed_events and len(event_id_set) < 2:
            problems.append(f"fewer than 2 distinct events: {event_ids!r}")
        if len(event_ids) != len(event_id_set):
            problems.append(f"duplicate event_id in events[]: {event_ids!r}")
    else:
        problems.append("events must be a list")

    impact_pairs = record.get("impact_pairs")
    if isinstance(impact_pairs, list):
        malformed = [f"impact_pairs[{i}]: {problem}" for i, problem in ((i, _pair_problem(p)) for i, p in enumerate(impact_pairs)) if problem]
        problems.extend(malformed)
        well_shaped_pairs = [p for p in impact_pairs if _pair_problem(p) is None]
        dangling = sorted({eid for p in well_shaped_pairs for eid in (p["event_a_id"], p["event_b_id"])} - event_id_set, key=repr)
        if dangling:
            problems.append(f"dangling event_id ref(s) in impact_pairs[]: {dangling}")
    else:
        problems.append("impact_pairs must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_matrix_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L685's own 'event pair matrix' requirement directly from raw fields -- every unordered
    pair of declared events present exactly once. Fails closed on malformed entries rather than crashing, and
    does NOT assume referential integrity already passed (recomputes against well-shaped events/pairs only)."""
    if not isinstance(record, dict):
        return _result("matrix_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    events = record.get("events")
    impact_pairs = record.get("impact_pairs")
    if not isinstance(events, list) or not isinstance(impact_pairs, list):
        return _result("matrix_completeness", False, [{"reason": "events and impact_pairs must both be lists"}], validator, timestamp)

    well_shaped_events = [e for e in events if _event_problem(e) is None]
    event_ids = [e["event_id"] for e in well_shaped_events]
    if len(set(event_ids)) < 2 or len(event_ids) != len(set(event_ids)):
        return _result("matrix_completeness", False, [{"reason": "events[] must be >= 2 distinct well-shaped entries to evaluate matrix completeness"}], validator, timestamp)

    well_shaped_pairs = [p for p in impact_pairs if _pair_problem(p) is None]
    event_id_set = set(event_ids)
    referentially_valid_pairs = [p for p in well_shaped_pairs if p["event_a_id"] in event_id_set and p["event_b_id"] in event_id_set]

    expected_pairs = {frozenset(pair) for pair in itertools.combinations(event_ids, 2)}
    actual_pair_keys = [frozenset({p["event_a_id"], p["event_b_id"]}) for p in referentially_valid_pairs]
    problems: list[str] = []
    if len(well_shaped_pairs) != len(impact_pairs):
        problems.append("one or more impact_pairs[] entries are malformed")
    duplicate_pairs = sorted({repr(sorted(k, key=repr)) for k in actual_pair_keys if actual_pair_keys.count(k) > 1})
    if duplicate_pairs:
        problems.append(f"duplicate unordered pair(s): {duplicate_pairs}")
    missing_pairs = sorted((sorted(pair, key=repr) for pair in expected_pairs - set(actual_pair_keys)), key=repr)
    if missing_pairs:
        problems.append(f"missing pair(s): {missing_pairs}")
    passed = not problems
    return _result("matrix_completeness", passed, [{"expected_pair_count": len(expected_pairs), "actual_pair_count": len(actual_pair_keys), "problems": problems}], validator, timestamp)


def evaluate_cross_impact_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_matrix_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
