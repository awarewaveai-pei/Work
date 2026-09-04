"""``causal.dag`` -- sixth Method Atlas slice, third real validation path for fishbone's CauseHypothesisSet, first
method from a family other than ``root_cause``/``strategy``.

Structurally a THIRD shape after narrative (``root_cause.five_whys``) and
calculated-result (``root_cause.pareto``): a GRAPH -- nodes carrying a
causal role and directed edges between them. The method's own name
(Directed ACYCLIC Graph) asserts a structural property that is
independently, mechanically verifiable, so ``acyclic_verified`` is checked
twice, belt-and-suspenders, same discipline every prior slice this session
established: the runtime raises BEFORE constructing a record for a cyclic
graph (this module), and the schema's own ``const: true`` refuses one that
bypasses this module (``typed-objects/causal-dag-analysis.schema.yaml``).
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.graph.dag import is_acyclic
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.dag"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.graph.dag.is_acyclic"
VALID_ROLES = frozenset({"TREATMENT", "OUTCOME", "CONFOUNDER", "MEDIATOR", "COLLIDER"})


def dag_node(node_id: str, label: str, role: str) -> dict[str, Any]:
    """One item of ``typed-objects/causal-dag-analysis.schema.yaml#/properties/nodes``."""
    if role not in VALID_ROLES:
        raise InvariantViolation(f"CAUSALDAG_INVALID_ROLE: {role!r} is not one of {sorted(VALID_ROLES)} (Atlas L1679 causal-role vocabulary)")
    return {"id": node_id, "label": label, "role": role}


def dag_edge(from_node_id: str, to_node_id: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/causal-dag-analysis.schema.yaml#/properties/edges``."""
    record: dict[str, Any] = {"from_node_id": from_node_id, "to_node_id": to_node_id, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_causal_dag_analysis(
    analysis_id: str,
    cause_hypothesis_set: dict[str, Any],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/causal-dag-analysis.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed: every
    edge must reference real node ids (``ai_lego.compute.graph.dag``
    raises ``DAG_EDGE_REFERENCES_UNKNOWN_NODE`` if not -- propagated here,
    not re-implemented), and the graph must be genuinely acyclic
    (``CAUSALDAG_CYCLE_DETECTED`` raised before any record is constructed
    if not).
    """
    if len(nodes) < 2:
        raise InvariantViolation("CAUSALDAG_TOO_FEW_NODES: causal-dag-analysis.schema.yaml requires nodes minItems:2")
    if not edges:
        raise InvariantViolation("CAUSALDAG_EMPTY_EDGES: causal-dag-analysis.schema.yaml requires edges minItems:1")
    if not is_acyclic(nodes, edges):
        raise InvariantViolation(
            "CAUSALDAG_CYCLE_DETECTED: the supplied edges form a cycle -- a graph containing a cycle is not a "
            "Directed Acyclic Graph, refusing to construct a CausalDagAnalysis record that would fail its own "
            "schema's acyclic_verified const:true gate"
        )

    return {
        "id": analysis_id,
        "version": version,
        "cause_hypothesis_set_ref": cause_hypothesis_set["id"],
        "generated_by_method": generated_by_method,
        "nodes": list(nodes),
        "edges": list(edges),
        "acyclic_verified": True,
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every edge carries a schema-valid provenance_record."""
    edges = analysis.get("edges", [])
    invalid = [f"{e['from_node_id']}->{e['to_node_id']}" for e in edges if not provenance_is_valid(e.get("provenance"))]
    passed = bool(edges) and not invalid
    return _result("provenance_required", passed, [{"edges_checked": len(edges), "invalid_provenance_edges": invalid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- Atlas L1683: don't silently write correlation as
    causation. An edge claiming the EVIDENCE label must actually cite evidence, same real structural check every
    prior slice's identical gate uses."""
    edges = analysis.get("edges", [])
    problems: list[dict[str, Any]] = []
    for e in edges:
        epistemic_type = (e.get("provenance") or {}).get("epistemic_type")
        edge_key = f"{e.get('from_node_id')}->{e.get('to_node_id')}"
        if epistemic_type is None:
            problems.append({"edge": edge_key, "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not e.get("supporting_evidence_refs"):
            problems.append({"edge": edge_key, "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(edges) and not problems
    return _result("evidence_labeling_required", passed, [{"edges_checked": len(edges), "problems": problems}], validator, timestamp)


def evaluate_dag_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_evidence_labeling_required_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
