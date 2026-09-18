"""``architecture.dependency_mapping`` -- seventeenth Method Atlas slice, sixth from the `architecture` family
(F18's own "Software Architecture Pack"). Third graph-shaped typed object this session builds (after
``causal.dag``/``architecture.event_storming``), enforcing a different invariant: every edge marked a critical
dependency must carry a non-empty fallback -- directly implied by Atlas's own arrow sequence ("critical
dependency→fallback"), the same "read the diagram literally, enforce what it implies" discipline
``causal.dag``'s acyclicity check and ``architecture.event_storming``'s orphan-event check already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.dependency_mapping"
RECORD_ID_PREFIX = "DEPMAP-"
# Not load-bearing for API auto-injection (identity param is the domain-specific map_id, not
# `record_id`) -- exists only for the dashboard's opt-in id-suggest button. See atam.py's own
# RECORD_ID_PREFIX comment for the full rationale (2026-09-18), not repeated in every sibling file.
VALID_NODE_TYPES = frozenset({"service", "vendor", "data"})


def generate_dependency_map(
    map_id: str,
    system_under_mapping: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/dependency-map.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed: at least 1 node and 1 edge, every node_type valid, every is_critical edge carries a non-empty
    fallback."""
    if not nodes or not edges:
        raise InvariantViolation("DEPMAP_EMPTY_MAP: at least 1 node and 1 edge required")
    invalid_types = sorted({n["node_type"] for n in nodes} - VALID_NODE_TYPES)
    if invalid_types:
        raise InvariantViolation(f"DEPMAP_INVALID_NODE_TYPE: {invalid_types} not in {sorted(VALID_NODE_TYPES)}")

    missing_fallback = sorted(f"{e['from_id']}->{e['to_id']}" for e in edges if e.get("is_critical") and not (e.get("fallback") or "").strip())
    if missing_fallback:
        raise InvariantViolation(f"DEPMAP_CRITICAL_EDGE_MISSING_FALLBACK: {missing_fallback} -- Atlas's own arrow sequence (critical dependency→fallback) requires one")

    return {
        "id": map_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_mapping": system_under_mapping,
        "nodes": list(nodes),
        "edges": list(edges),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(dep_map: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(dep_map.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": dep_map.get("provenance")}], validator, timestamp)


def evaluate_critical_edges_have_fallback_gate(dep_map: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the fallback invariant structurally on any record handed to it -- not just trusting the builder's
    own construction-time check already ran."""
    missing = sorted(f"{e['from_id']}->{e['to_id']}" for e in dep_map.get("edges", []) if e.get("is_critical") and not (e.get("fallback") or "").strip())
    return _result("critical_edges_have_fallback", not missing, [{"missing_fallback_edges": missing}], validator, timestamp)


def evaluate_dependency_map_gates(dep_map: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(dep_map, validator, timestamp),
        evaluate_critical_edges_have_fallback_gate(dep_map, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
