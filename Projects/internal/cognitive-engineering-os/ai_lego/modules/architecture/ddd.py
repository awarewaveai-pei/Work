"""``architecture.ddd`` -- ninth Method Atlas slice from the `architecture` family (F18's own "Software Architecture
Pack"). Real-world method name "Domain-Driven Design"; Atlas's own F18 table row (L818) gives it a real worked
pipeline ("subdomain→bounded context→context map") even though its neighboring §11.35 section is a bare 6-concept
list with no pipeline -- the table row is the grounding this module builds on (see the method contract's own
description for why `architecture.event_storming` chose the OTHER neighbor over DDD in an earlier slice, and why
this slice now builds DDD anyway on the table row's own strength).

Enforces two real, DDD-standard structural invariants, both re-derived
independently at construction time and at gate time (never trusting a
stored flag): (1) every bounded_context must carry lineage to at least
one REAL subdomain -- a context claiming to be carved from nothing, or
from a subdomain id that does not exist, is meaningless; (2) every
context_map relationship must reference two bounded_contexts that
actually exist in the record -- a relationship pointing at a phantom
context is a real integrity bug, not a style nit. The 9-value
context_map pattern enum (Partnership, Shared Kernel, Customer-Supplier,
Conformist, Anticorruption Layer, Open Host Service, Published Language,
Separate Ways, Big Ball of Mud) is real, standard DDD vocabulary (Evans
2003; Vernon 2013), not an Atlas citation -- disclosed as such in the
method contract's own compilation_decisions.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.ddd"
RECORD_ID_PREFIX = "BCM-"
# Value MUST match typed-objects/bounded-context-map.schema.yaml's own `id` pattern (`^BCM-`), not a
# transliteration of the method name (critic-caught 2026-09-18).
# Prefixes the map_id /methods/{id}/invoke generates when the caller omits it (dispatch.self_id_param).
VALID_SUBDOMAIN_TYPES = frozenset({"core", "supporting", "generic"})
VALID_CONTEXT_MAP_PATTERNS = frozenset(
    {
        "partnership",
        "shared_kernel",
        "customer_supplier",
        "conformist",
        "anticorruption_layer",
        "open_host_service",
        "published_language",
        "separate_ways",
        "big_ball_of_mud",
    }
)


def generate_bounded_context_map(
    map_id: str,
    domain_description: str,
    subdomains: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    bounded_contexts: list[dict[str, Any]] | None = None,
    context_map: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/bounded-context-map.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed: at
    least 1 subdomain, every bounded_context has real (non-empty, all-
    existing) subdomain lineage, every context_map entry's pattern is one
    of the 9 standard DDD patterns, and every context_map entry
    references two bounded_contexts that actually exist.
    """
    bounded_contexts = bounded_contexts or []
    context_map = context_map or []

    if not subdomains:
        raise InvariantViolation("DDD_NO_SUBDOMAINS: at least 1 required")

    unknown_subdomain_types = sorted({s["type"] for s in subdomains if "type" in s} - VALID_SUBDOMAIN_TYPES)
    if unknown_subdomain_types:
        raise InvariantViolation(f"DDD_INVALID_SUBDOMAIN_TYPE: {unknown_subdomain_types} not in {sorted(VALID_SUBDOMAIN_TYPES)}")

    subdomain_ids = {s["id"] for s in subdomains}

    contexts_with_no_lineage = sorted(bc["id"] for bc in bounded_contexts if not bc.get("subdomain_ids"))
    if contexts_with_no_lineage:
        raise InvariantViolation(f"DDD_BOUNDED_CONTEXT_NO_SUBDOMAIN_LINEAGE: {contexts_with_no_lineage} has/have empty subdomain_ids -- a bounded_context carved from nothing is meaningless")

    contexts_with_unknown_subdomain = {
        bc["id"]: sorted(set(bc["subdomain_ids"]) - subdomain_ids) for bc in bounded_contexts if set(bc["subdomain_ids"]) - subdomain_ids
    }
    if contexts_with_unknown_subdomain:
        raise InvariantViolation(f"DDD_BOUNDED_CONTEXT_UNKNOWN_SUBDOMAIN: {contexts_with_unknown_subdomain} reference(s) a subdomain id not present in subdomains")

    invalid_patterns = sorted({cm["pattern"] for cm in context_map} - VALID_CONTEXT_MAP_PATTERNS)
    if invalid_patterns:
        raise InvariantViolation(f"DDD_INVALID_CONTEXT_MAP_PATTERN: {invalid_patterns} not in {sorted(VALID_CONTEXT_MAP_PATTERNS)}")

    bounded_context_ids = {bc["id"] for bc in bounded_contexts}
    unknown_context_refs = [
        {"from_context_id": cm["from_context_id"], "to_context_id": cm["to_context_id"], "missing": sorted({cm["from_context_id"], cm["to_context_id"]} - bounded_context_ids)}
        for cm in context_map
        if {cm["from_context_id"], cm["to_context_id"]} - bounded_context_ids
    ]
    if unknown_context_refs:
        raise InvariantViolation(f"DDD_CONTEXT_MAP_UNKNOWN_BOUNDED_CONTEXT: {unknown_context_refs} reference(s) a bounded_context id not present in bounded_contexts")

    return {
        "id": map_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "domain_description": domain_description,
        "subdomains": list(subdomains),
        "bounded_contexts": list(bounded_contexts),
        "context_map": list(context_map),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record.
    FAILS CLOSED on malformed input rather than crashing (matches every sibling F05/F18 gate's contract)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def evaluate_subdomain_lineage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the first real invariant (plus its own DDD_NO_SUBDOMAINS precondition) structurally on any record
    handed to it -- not just trusting that generate_bounded_context_map's own construction-time check already ran
    (a hand-crafted/tampered record, e.g. one where a subdomain was removed after construction, must still be
    caught by this independent re-derivation). FAILS CLOSED on malformed input (non-dict record, or a
    bounded_context/subdomain entry that is itself not a dict) rather than crashing -- a record missing the exact
    ``id`` this gate exists to name is precisely the malformed case it must not KeyError on."""
    if not isinstance(record, dict):
        return _result("subdomain_lineage_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    subdomains = record.get("subdomains") or []
    has_no_subdomains = not subdomains
    subdomain_ids = {s.get("id") for s in subdomains if isinstance(s, dict)}
    bounded_contexts = [bc for bc in (record.get("bounded_contexts") or []) if isinstance(bc, dict)]
    contexts_with_no_lineage = sorted(bc.get("id", "<missing id>") for bc in bounded_contexts if not bc.get("subdomain_ids"))
    contexts_with_unknown_subdomain = {
        bc.get("id", "<missing id>"): sorted(set(bc.get("subdomain_ids") or []) - subdomain_ids)
        for bc in bounded_contexts
        if set(bc.get("subdomain_ids") or []) - subdomain_ids
    }
    passed = not has_no_subdomains and not contexts_with_no_lineage and not contexts_with_unknown_subdomain
    return _result(
        "subdomain_lineage_integrity",
        passed,
        [{
            "has_no_subdomains": has_no_subdomains,
            "contexts_with_no_subdomain_lineage": contexts_with_no_lineage,
            "contexts_referencing_unknown_subdomains": contexts_with_unknown_subdomain,
        }],
        validator,
        timestamp,
    )


def evaluate_context_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the second real invariant (plus its own DDD_INVALID_CONTEXT_MAP_PATTERN precondition)
    structurally on any record handed to it -- not just trusting the builder's own construction-time check already
    ran (e.g. a bounded_context removed after construction, leaving a dangling context_map entry, must still be
    caught). FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("context_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    bounded_context_ids = {bc.get("id") for bc in (record.get("bounded_contexts") or []) if isinstance(bc, dict)}
    context_map = [cm for cm in (record.get("context_map") or []) if isinstance(cm, dict)]
    invalid_patterns = sorted({cm.get("pattern") for cm in context_map} - VALID_CONTEXT_MAP_PATTERNS)
    unknown_context_refs = []
    for cm in context_map:
        missing = sorted({cm.get("from_context_id"), cm.get("to_context_id")} - bounded_context_ids)
        if missing:
            unknown_context_refs.append({"from_context_id": cm.get("from_context_id"), "to_context_id": cm.get("to_context_id"), "missing": missing})
    passed = not invalid_patterns and not unknown_context_refs
    return _result(
        "context_map_integrity",
        passed,
        [{"invalid_context_map_patterns": invalid_patterns, "unknown_bounded_context_references": unknown_context_refs}],
        validator,
        timestamp,
    )


def evaluate_ddd_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_subdomain_lineage_gate(record, validator, timestamp),
        evaluate_context_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
