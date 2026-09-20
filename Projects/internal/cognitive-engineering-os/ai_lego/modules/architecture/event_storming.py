"""``architecture.event_storming`` -- thirteenth Method Atlas slice, second from the `architecture` family (F18's
own "Software Architecture Pack", a second member tool built, still not the whole pack).

Atlas §11.36's own causal-flow notation ("Domain Event ← Command ← Actor
← Policy ← External System → Aggregate／Read Model") directly implies a
real structural invariant this module enforces: every ``domain_event``
element must be traceable to at least one causing element -- an orphan
domain event (one nothing points to) contradicts the notation's own
reading that every event is CAUSED BY something. Same "raise before
construction on a real, Atlas-implied structural rule" discipline
``causal.dag``'s own acyclicity check already established for a different
notation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.event_storming"
RECORD_ID_PREFIX = "ES-"
# Value MUST match typed-objects/event-storming-session.schema.yaml's own `id` pattern (`^ES-`), not a
# transliteration of the method name (critic-caught 2026-09-18).
# Prefixes the session_id /methods/{id}/invoke generates when the caller omits it (dispatch.self_id_param).
VALID_ELEMENT_TYPES = frozenset({"domain_event", "command", "actor", "policy", "external_system", "aggregate", "read_model"})


def generate_event_storming_session(
    session_id: str,
    domain_process_description: str,
    elements: list[dict[str, Any]],
    relationships: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/event-storming-session.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed: every
    element has a valid type, every relationship references two real
    elements, and every ``domain_event`` element has at least 1 incoming
    relationship (no orphan events -- Atlas's own notation implies every
    event is caused by something).
    """
    if not elements:
        raise InvariantViolation("EVENTSTORMING_NO_ELEMENTS: at least 1 required")

    element_ids = {e["id"] for e in elements}
    unknown_types = sorted({e["type"] for e in elements} - VALID_ELEMENT_TYPES)
    if unknown_types:
        raise InvariantViolation(f"EVENTSTORMING_INVALID_ELEMENT_TYPE: {unknown_types} not in {sorted(VALID_ELEMENT_TYPES)}")

    for rel in relationships:
        if rel["from_id"] not in element_ids or rel["to_id"] not in element_ids:
            raise InvariantViolation(f"EVENTSTORMING_UNKNOWN_ELEMENT_IN_RELATIONSHIP: {rel['from_id']!r} -> {rel['to_id']!r} references an element not in elements")

    incoming_count: dict[str, int] = {element_id: 0 for element_id in element_ids}
    for rel in relationships:
        incoming_count[rel["to_id"]] = incoming_count.get(rel["to_id"], 0) + 1

    orphan_events = sorted(e["id"] for e in elements if e["type"] == "domain_event" and incoming_count.get(e["id"], 0) == 0)
    if orphan_events:
        raise InvariantViolation(f"EVENTSTORMING_ORPHAN_DOMAIN_EVENT: {orphan_events} has/have no incoming relationship -- Atlas's own notation (§11.36) implies every domain_event is caused by something")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "domain_process_description": domain_process_description,
        "elements": list(elements),
        "relationships": list(relationships),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(session: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    passed = provenance_is_valid(session.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": session.get("provenance")}], validator, timestamp)


def evaluate_no_orphan_domain_events_gate(session: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the orphan-domain-event invariant structurally on any record handed to it -- not just trusting
    that generate_event_storming_session's own construction-time check already ran (a hand-crafted/tampered
    record must still be caught, same discipline every prior slice's own gate-re-derivation already established)."""
    elements = session.get("elements", [])
    relationships = session.get("relationships", [])
    incoming_count: dict[str, int] = {}
    for rel in relationships:
        incoming_count[rel["to_id"]] = incoming_count.get(rel["to_id"], 0) + 1
    orphan_events = sorted(e["id"] for e in elements if e.get("type") == "domain_event" and incoming_count.get(e["id"], 0) == 0)
    return _result("no_orphan_domain_events", not orphan_events, [{"orphan_domain_events": orphan_events}], validator, timestamp)


def evaluate_event_storming_gates(session: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(session, validator, timestamp),
        evaluate_no_orphan_domain_events_gate(session, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
