"""``delivery.dependency_graph`` -- F22 PM/Delivery/Governance Pack (Atlas L920).

Atlas's own table row (L920, verbatim): "Dependency Graph | 顯式建模依賴 |
nodes→edges→critical edges→owner→fallback | 降隱性 blocker" (explicitly
model dependencies, via nodes, edges, critical edges, owner, fallback;
reduce hidden blockers). Table-row-only citation, no dedicated §12.x
section (grepped exhaustively). Distinct from the pre-existing
``architecture.dependency_mapping`` (F18) -- that method maps software/
service/vendor/data dependencies (node_type service/vendor/data); this
method maps TASK/DELIVERABLE/MILESTONE dependencies for project delivery
(node_type task/deliverable/milestone).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``DEPGRAPH_DANGLING_NODE_REF``) -- every
   ``edges[].from_node_id``/``to_node_id`` must resolve to a declared
   ``nodes[]`` entry. A dangling edge reference is a broken dependency
   link masquerading as a real one, same class as ``foresight.
   cross_impact_analysis``'s own dangling-event-ref check.
2. **Critical edge completeness, THE real invariant this method exists
   to enforce** (``DEPGRAPH_CRITICAL_EDGE_INCOMPLETE``) -- Atlas's own
   arrow sequence reads "critical edges→owner→fallback"; an edge marked
   ``critical: true`` with an empty ``owner`` or empty ``fallback`` IS
   exactly the "隱性 blocker" (hidden blocker) this method's own benefit
   column names -- a label is not a mitigation.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"dependency-graph"/"dependency_graph" before writing any of this method's
own files: zero pre-existing implementation or schema title overlap.
Separately confirmed ``architecture.dependency_mapping`` (F18) and the
``database_data.*`` family (F21) are genuinely distinct domains, not a
naming collision with this method.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.dependency_graph"
RECORD_ID_PREFIX = "DEPGRAPH-"
_NODE_TYPES = frozenset({"task", "deliverable", "milestone"})
_NODE_KEYS = frozenset({"node_id", "node_type", "description"})
_EDGE_KEYS = frozenset({"from_node_id", "to_node_id", "critical", "owner", "fallback"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _node_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped nodes[] entry". Both ``node()`` (construction layer)
    and the gate (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``foresight.cross_impact_analysis``'s own ``_event_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _NODE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _NODE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_NODE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("node_id")):
        return f"node_id must be a non-empty string, got {value.get('node_id')!r}"
    if value.get("node_type") not in _NODE_TYPES:
        return f"node_type must be one of {sorted(_NODE_TYPES)}, got {value.get('node_type')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def node(node_id: str, node_type: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/dependency-graph-record.schema.yaml#/properties/nodes``."""
    record = {"node_id": node_id, "node_type": node_type, "description": description}
    problem = _node_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DEPGRAPH_INVALID_NODE: {problem}")
    return record


def _edge_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped edges[] entry" -- shape/type AND critical edge
    completeness, NOT referential integrity against ``nodes[]``, which needs the sibling array and is checked
    once in ``generate_dependency_graph``/the referential integrity gate (same division of labor ``epistemic.
    evidence_matrix``'s ``link()``/``generate_evidence_matrix`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _EDGE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _EDGE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_EDGE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("from_node_id")):
        return f"from_node_id must be a non-empty string, got {value.get('from_node_id')!r}"
    if not _is_nonempty_str(value.get("to_node_id")):
        return f"to_node_id must be a non-empty string, got {value.get('to_node_id')!r}"
    critical = value.get("critical")
    if not isinstance(critical, bool):
        return f"critical must be a bool, got {critical!r}"
    owner = value.get("owner")
    fallback = value.get("fallback")
    if not isinstance(owner, str):
        return f"owner must be a string, got {owner!r}"
    if not isinstance(fallback, str):
        return f"fallback must be a string, got {fallback!r}"
    if critical and not (_is_nonempty_str(owner) and _is_nonempty_str(fallback)):
        return (
            f"critical edge {value.get('from_node_id')!r}->{value.get('to_node_id')!r} must carry a non-empty "
            f"owner AND a non-empty fallback (Atlas L920's own 'critical edges->owner->fallback' pipeline), got "
            f"owner={owner!r}, fallback={fallback!r}"
        )
    return None


def edge(from_node_id: str, to_node_id: str, critical: bool, owner: str, fallback: str) -> dict[str, Any]:
    """One item of ``typed-objects/dependency-graph-record.schema.yaml#/properties/edges``. Does NOT itself
    check referential integrity against a declared ``nodes[]`` list -- that cross-field check happens once, in
    ``generate_dependency_graph``, after every edge has been rebuilt."""
    record = {"from_node_id": from_node_id, "to_node_id": to_node_id, "critical": critical, "owner": owner, "fallback": fallback}
    problem = _edge_problem(record)
    if problem is not None:
        # ``_edge_problem`` checks critical-edge-completeness LAST -- tagging the code purely off
        # ``critical is True`` (without confirming every earlier-checked field is ALSO individually valid)
        # would mislabel an unrelated failure (e.g. a non-string from_node_id) as
        # DEPGRAPH_CRITICAL_EDGE_INCOMPLETE whenever critical also happens to be True. Same bug class this
        # corpus's ``experiment.mvp`` documents (2026-09-12 critic finding) for its own ``decision_threshold``.
        other_fields_valid = _is_nonempty_str(from_node_id) and _is_nonempty_str(to_node_id) and isinstance(critical, bool) and isinstance(owner, str) and isinstance(fallback, str)
        code = "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE" if other_fields_valid and critical is True and not (_is_nonempty_str(owner) and _is_nonempty_str(fallback)) else "DEPGRAPH_INVALID_EDGE"
        raise InvariantViolation(f"{code}: {problem}")
    return record


def generate_dependency_graph(
    record_id: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/dependency-graph-record.schema.yaml``.

    Rebuilds every ``nodes[]``/``edges[]`` entry via ``node()``/``edge()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, >=1 distinct node declared, every edge well-shaped (including critical edge
    completeness, enforced inside ``edge()`` itself) -- and, the invariant Atlas's own "nodes→edges→critical
    edges" pipeline exists to enforce, every edge resolves to real nodes in both directions -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DEPGRAPH_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DEPGRAPH_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("DEPGRAPH_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(nodes, list):
        raise InvariantViolation(f"DEPGRAPH_INVALID_NODES: nodes must be a list, got {type(nodes).__name__}")
    rebuilt_nodes: list[dict[str, Any]] = []
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            raise InvariantViolation(f"DEPGRAPH_INVALID_NODES: nodes[{i}] must be a dict, got {n!r}")
        rebuilt_nodes.append(node(n.get("node_id"), n.get("node_type"), n.get("description")))
    node_ids = [n["node_id"] for n in rebuilt_nodes]
    if len(node_ids) != len(set(node_ids)):
        duplicate = sorted({n for n in node_ids if node_ids.count(n) > 1})
        raise InvariantViolation(f"DEPGRAPH_DUPLICATE_NODE_ID: node_id(s) {duplicate} declared more than once")
    if len(rebuilt_nodes) < 1:
        raise InvariantViolation("DEPGRAPH_TOO_FEW_NODES: at least 1 node is required")

    if not isinstance(edges, list):
        raise InvariantViolation(f"DEPGRAPH_INVALID_EDGES: edges must be a list, got {type(edges).__name__}")
    rebuilt_edges: list[dict[str, Any]] = []
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            raise InvariantViolation(f"DEPGRAPH_INVALID_EDGES: edges[{i}] must be a dict, got {e!r}")
        try:
            rebuilt_edges.append(edge(e.get("from_node_id"), e.get("to_node_id"), e.get("critical"), e.get("owner"), e.get("fallback")))
        except InvariantViolation as error:
            raise InvariantViolation(f"DEPGRAPH_INVALID_EDGES: edges[{i}]: {error}") from error

    node_id_set = set(node_ids)
    dangling = sorted({nid for e in rebuilt_edges for nid in (e["from_node_id"], e["to_node_id"])} - node_id_set)
    if dangling:
        raise InvariantViolation(f"DEPGRAPH_DANGLING_NODE_REF: edges[] reference node_id(s) {dangling} not present in nodes[]")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "nodes": rebuilt_nodes,
        "edges": rebuilt_edges,
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
    """Re-derives nodes/edges shape, node-count minimum, and referential integrity directly from raw fields
    using the SAME ``_node_problem``/``_edge_problem`` predicates the builder uses -- without this the gate
    could pass records the builder refuses. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    nodes = record.get("nodes")
    node_id_set: set[Any] = set()
    if isinstance(nodes, list):
        malformed_nodes = [f"nodes[{i}]: {problem}" for i, problem in ((i, _node_problem(n)) for i, n in enumerate(nodes)) if problem]
        problems.extend(malformed_nodes)
        well_shaped_nodes = [n for n in nodes if _node_problem(n) is None]
        node_ids = [n["node_id"] for n in well_shaped_nodes]
        node_id_set = set(node_ids)
        if not malformed_nodes and len(node_id_set) < 1:
            problems.append("fewer than 1 distinct node")
        if len(node_ids) != len(node_id_set):
            problems.append(f"duplicate node_id in nodes[]: {node_ids!r}")
    else:
        problems.append("nodes must be a list")

    edges = record.get("edges")
    if isinstance(edges, list):
        malformed = [f"edges[{i}]: {problem}" for i, problem in ((i, _edge_problem(e)) for i, e in enumerate(edges)) if problem]
        problems.extend(malformed)
        well_shaped_edges = [e for e in edges if _edge_problem(e) is None]
        dangling = sorted({nid for e in well_shaped_edges for nid in (e["from_node_id"], e["to_node_id"])} - node_id_set, key=repr)
        if dangling:
            problems.append(f"dangling node_id ref(s) in edges[]: {dangling}")
    else:
        problems.append("edges must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_critical_edge_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L920's own 'critical edges->owner->fallback' requirement directly from raw fields --
    every edge with critical=True must carry a non-empty owner AND fallback. Fails closed on malformed
    entries rather than crashing, and does NOT trust that the builder's own check already ran (a
    hand-tampered record can clear owner/fallback on an already-constructed critical edge)."""
    if not isinstance(record, dict):
        return _result("critical_edge_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    edges = record.get("edges")
    if not isinstance(edges, list):
        return _result("critical_edge_completeness", False, [{"reason": "edges must be a list"}], validator, timestamp)

    problems: list[str] = []
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            problems.append(f"edges[{i}] is not a dict")
            continue
        if e.get("critical") is not True:
            continue
        owner = e.get("owner")
        fallback = e.get("fallback")
        if not (_is_nonempty_str(owner) and _is_nonempty_str(fallback)):
            problems.append(f"edges[{i}] ({e.get('from_node_id')!r}->{e.get('to_node_id')!r}) is critical but owner={owner!r}, fallback={fallback!r}")

    passed = not problems
    return _result("critical_edge_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_dependency_graph_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_critical_edge_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
