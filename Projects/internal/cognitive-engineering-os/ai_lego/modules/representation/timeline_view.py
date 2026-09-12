"""``representation.timeline_view`` -- F24 representation/cognitive-preference/collaboration family (Atlas
L959-973), 1 of 4 concurrent agents opening F24 in this same parallel batch, this agent covering Concept
Graph View + Timeline View.

Atlas cites this method ONCE: the F24 tool table row (L968, verbatim: "Timeline View | 按時間呈現事件 |
events->time->decision/change markers | 找時間關係"). Grep-confirmed the only real hit case-insensitively
across the whole Atlas file -- no dedicated section, same thin-citation class ``delivery.risk_register``/
``experiment.mvp`` already establish.

**Structural law shared by every F24 View method (Atlas §9 Representation Contract, L1053, verbatim): "View
只保存 layout / filters / visible_fields / presentation_preferences，不得複製 Knowledge 本體"** -- enforced here
structurally: ``ordered_event_refs[]`` entries are a closed key set of a bare event reference plus a closed
marker classification; the ground-truth ``events[]`` (with each event's own ``event_time``) a rendered
ordering must stay faithful to is passed to the builder/gate as a SEPARATE parameter (modeling what would, in
production, be a live query against the Knowledge Object store), never persisted onto the returned record --
``event_time`` itself never appears anywhere on ``TimelineView``.

**Real invariant, THE one this method exists to enforce, enforced at TWO independent layers, same "derived,
not asserted" discipline this corpus's ``jurisdiction.compliance_gap_analysis``/``jurisdiction.
market_admission_control`` already establish** (``TLVIEW_ORDER_MISMATCH``): the ``event_id`` sequence of
``ordered_event_refs`` must equal the source events sorted by their own declared ``event_time``, exactly -- a
caller-proposed order that disagrees with the real chronology is refused, never silently accepted. A timeline
that is not genuinely sorted by time actively misleads about "找時間關係" (finding temporal relationships)
rather than helping -- worse than useless.

Second invariant (``TLVIEW_MISSING_EVENT_REF`` / ``TLVIEW_DANGLING_EVENT_REF``): every declared source event
must appear in ``ordered_event_refs`` exactly once (referential integrity + completeness).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "timeline view"/"timeline-view"/"TLVIEW-"/"representation\\." before writing any of
this method's own files: zero pre-existing implementation or schema title overlap (only the pre-existing
generic ``specs/cognitive/representation.schema.yaml``, a different, broader dimension-H View contract this
method's record does not redefine). Read ``ai_lego/modules/jurisdiction/compliance_gap_analysis.py`` in full
for the exact "derived, never accepted from the caller" convention this method's ``ordered_event_refs`` field
applies.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.timeline_view"
RECORD_ID_PREFIX = "TLVIEW-"
_MARKER_TYPES = frozenset({"event", "decision", "change"})
_ORDERED_REF_KEYS = frozenset({"event_id", "marker_type"})
_SOURCE_EVENT_KEYS = frozenset({"event_id", "event_time"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _ordered_ref_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped ordered_event_refs[] entry" -- shape only, NOT
    chronological derivation (whether this is actually the correct position for this event), which needs the
    sibling events[] array and is checked once in ``generate_timeline_view``/the gate (same division of labor
    ``jurisdiction.compliance_gap_analysis``'s ``gap_annotation()``/``generate_compliance_gap_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ORDERED_REF_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)} -- Atlas L1053 permits only a reference id plus a closed marker classification on a View entry"
    if not _ORDERED_REF_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ORDERED_REF_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("event_id")):
        return f"event_id must be a non-empty string, got {value.get('event_id')!r}"
    if value.get("marker_type") not in _MARKER_TYPES:
        return f"marker_type must be one of {sorted(_MARKER_TYPES)}, got {value.get('marker_type')!r}"
    return None


def ordered_event_ref(event_id: str, marker_type: str) -> dict[str, Any]:
    """One item of ``typed-objects/timeline-view-record.schema.yaml#/properties/ordered_event_refs``. Does NOT
    itself check chronological derivation against a declared ``events[]`` list -- that cross-array check
    happens once, in ``generate_timeline_view``, after every entry has been rebuilt."""
    record = {"event_id": event_id, "marker_type": marker_type}
    problem = _ordered_ref_problem(record)
    if problem is not None:
        raise InvariantViolation(f"TLVIEW_INVALID_ORDERED_REF: {problem}")
    return record


def _source_event_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _SOURCE_EVENT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _SOURCE_EVENT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_SOURCE_EVENT_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("event_id")):
        return f"event_id must be a non-empty string, got {value.get('event_id')!r}"
    if not _is_number(value.get("event_time")):
        return f"event_time must be a real number (bool excluded), got {value.get('event_time')!r}"
    return None


def _correct_order(events: list[dict[str, Any]]) -> list[str]:
    """The single definition of "the real chronological order" -- sorted by event_time, ties broken by
    event_id for determinism. Both the builder and the gate call this SAME function, same single-shared-
    predicate discipline this corpus's ``foresight.cross_impact_analysis``/``_event_problem`` establishes."""
    return [e["event_id"] for e in sorted(events, key=lambda e: (e["event_time"], e["event_id"]))]


def generate_timeline_view(
    record_id: str,
    knowledge_ref: str,
    events: list[dict[str, Any]],
    ordered_event_refs: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/timeline-view-record.schema.yaml``.

    ``events`` is the ground truth (what would, in production, be a live query against the Knowledge Object
    store) the proposed ``ordered_event_refs`` must stay faithful to -- ``event_time`` is NEVER persisted onto
    the returned record (Atlas L1053's no-duplication law); only the verified ``event_id`` order plus each
    entry's ``marker_type`` survive.

    Rebuilds every ``ordered_event_refs[]`` entry via ``ordered_event_ref()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, knowledge_ref non-empty, events well-shaped with unique event_id, every ordered-ref
    entry well-shaped, every event referenced exactly once (referential integrity + completeness), and -- the
    invariant Atlas's own "events->time" pipeline stage exists to enforce -- the event_id SEQUENCE of
    ordered_event_refs equals the real chronological order computed independently from events[].event_time,
    exactly -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TLVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TLVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TLVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(knowledge_ref):
        raise InvariantViolation(f"TLVIEW_INVALID_KNOWLEDGE_REF: knowledge_ref must be a non-empty string, got {knowledge_ref!r}")

    if not isinstance(events, list) or not events:
        raise InvariantViolation(f"TLVIEW_EMPTY_EVENTS: events must be a non-empty list, got {events!r}")
    for i, e in enumerate(events):
        problem = _source_event_problem(e)
        if problem is not None:
            raise InvariantViolation(f"TLVIEW_INVALID_EVENTS: events[{i}]: {problem}")
    event_ids = [e["event_id"] for e in events]
    if len(event_ids) != len(set(event_ids)):
        duplicate = sorted({eid for eid in event_ids if event_ids.count(eid) > 1})
        raise InvariantViolation(f"TLVIEW_DUPLICATE_EVENT_ID: event_id(s) {duplicate} declared more than once in events")

    if not isinstance(ordered_event_refs, list):
        raise InvariantViolation(f"TLVIEW_INVALID_ORDERED_REFS: ordered_event_refs must be a list, got {type(ordered_event_refs).__name__}")
    rebuilt_refs: list[dict[str, Any]] = []
    for i, r in enumerate(ordered_event_refs):
        if not isinstance(r, dict):
            raise InvariantViolation(f"TLVIEW_INVALID_ORDERED_REFS: ordered_event_refs[{i}] must be a dict, got {r!r}")
        try:
            rebuilt_refs.append(ordered_event_ref(r.get("event_id"), r.get("marker_type")))
        except InvariantViolation as error:
            raise InvariantViolation(f"TLVIEW_INVALID_ORDERED_REFS: ordered_event_refs[{i}]: {error}") from error
    ref_ids = [r["event_id"] for r in rebuilt_refs]
    if len(ref_ids) != len(set(ref_ids)):
        duplicate = sorted({eid for eid in ref_ids if ref_ids.count(eid) > 1})
        raise InvariantViolation(f"TLVIEW_DUPLICATE_EVENT_REF: event_id(s) {duplicate} referenced more than once in ordered_event_refs")

    event_id_set = set(event_ids)
    ref_id_set = set(ref_ids)
    dangling = sorted(ref_id_set - event_id_set)
    if dangling:
        raise InvariantViolation(f"TLVIEW_DANGLING_EVENT_REF: ordered_event_refs[] reference event_id(s) {dangling} not present in events[]")
    missing = sorted(event_id_set - ref_id_set)
    if missing:
        raise InvariantViolation(f"TLVIEW_MISSING_EVENT_REF: events[] declared event_id(s) {missing} are not referenced in ordered_event_refs -- the timeline is incomplete")

    expected_order = _correct_order(events)
    if ref_ids != expected_order:
        raise InvariantViolation(
            f"TLVIEW_ORDER_MISMATCH: ordered_event_refs is not genuinely sorted by event_time. "
            f"asserted order {ref_ids}, real chronological order {expected_order}. "
            "Atlas L968's own 'events->time' pipeline stage requires the timeline to be mechanically derived, never independently asserted"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "knowledge_ref": knowledge_ref,
        "ordered_event_refs": rebuilt_refs,
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


def evaluate_referential_integrity_gate(record: dict[str, Any], events: list[dict[str, Any]], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives, directly from raw fields using the SAME ``_ordered_ref_problem``/``_source_event_problem``
    predicates the builder uses, that every ordered_event_refs[] entry is well-shaped, unique, and resolves to
    a real declared event, and that every declared event is referenced exactly once. Fails closed on malformed
    entries rather than crashing; given a FRESH ``events`` ground truth (never trusts a copy embedded on the
    record itself -- there is none, by design)."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    refs = record.get("ordered_event_refs")
    if not isinstance(refs, list) or not isinstance(events, list) or not events:
        return _result("referential_integrity", False, [{"reason": "ordered_event_refs must be a list and events must be a non-empty list"}], validator, timestamp)

    well_shaped_events = [e for e in events if _source_event_problem(e) is None]
    event_id_set = {e["event_id"] for e in well_shaped_events}
    well_shaped_refs = [r for r in refs if _ordered_ref_problem(r) is None]

    problems: list[str] = []
    if len(well_shaped_events) != len(events) or len(event_id_set) != len(well_shaped_events):
        problems.append("one or more events[] entries are malformed or duplicated")
    if len(well_shaped_refs) != len(refs):
        problems.append("one or more ordered_event_refs[] entries are malformed")
    ref_ids = [r["event_id"] for r in well_shaped_refs]
    if len(ref_ids) != len(set(ref_ids)):
        problems.append(f"duplicate event_id ref(s) in ordered_event_refs[]: {sorted({rid for rid in ref_ids if ref_ids.count(rid) > 1})}")
    ref_id_set = set(ref_ids)
    dangling = sorted(ref_id_set - event_id_set)
    if dangling:
        problems.append(f"dangling event_id ref(s): {dangling}")
    missing = sorted(event_id_set - ref_id_set)
    if missing:
        problems.append(f"missing event_id ref(s): {missing}")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_chronological_order_gate(record: dict[str, Any], events: list[dict[str, Any]], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L968's own 'events->time' requirement directly from raw fields -- the event_id
    sequence of ordered_event_refs must equal a FRESH, independently-recomputed chronological order from a
    given ``events`` ground truth. Fails closed on malformed entries rather than crashing; does NOT assume
    referential integrity already passed (recomputes against well-shaped events/refs only)."""
    if not isinstance(record, dict):
        return _result("chronological_order", False, [{"reason": "record is not a dict"}], validator, timestamp)
    refs = record.get("ordered_event_refs")
    if not isinstance(refs, list) or not isinstance(events, list) or not events:
        return _result("chronological_order", False, [{"reason": "ordered_event_refs must be a list and events must be a non-empty list"}], validator, timestamp)

    well_shaped_events = [e for e in events if _source_event_problem(e) is None]
    if len(well_shaped_events) != len(events):
        return _result("chronological_order", False, [{"reason": "one or more events[] entries are malformed"}], validator, timestamp)
    well_shaped_refs = [r for r in refs if _ordered_ref_problem(r) is None]
    if len(well_shaped_refs) != len(refs):
        return _result("chronological_order", False, [{"reason": "one or more ordered_event_refs[] entries are malformed"}], validator, timestamp)

    actual_order = [r["event_id"] for r in well_shaped_refs]
    expected_order = _correct_order(well_shaped_events)
    passed = actual_order == expected_order
    evidence = [{"actual_order": actual_order, "expected_order": expected_order}]
    return _result("chronological_order", passed, evidence, validator, timestamp)


def evaluate_timeline_view_gates(record: dict[str, Any], events: list[dict[str, Any]], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, events, validator, timestamp),
        evaluate_chronological_order_gate(record, events, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
