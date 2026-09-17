"""``database_data.data_lineage`` -- twenty-eighth Method Atlas slice, SECOND from the `database_data` family
(F21).

Atlas §11.48's own benefit bullet (L2327, "一個數字可以回到原始來源" -- a
number can trace back to its original source) directly implies a real
invariant this module enforces: every non-SOURCE node's own upstream
chain must actually terminate at a real SOURCE node -- not merely claim
one. ``traces_to_source`` (``ai_lego/compute/lineage/traversal.py``) is
genuine deterministic compute (iterative forward reachability, order-
independent, no recursion), never caller-asserted, the same Trusted
Compute discipline every prior CALCULATED_RESULT method in this package
already established.

``evaluate_structural_integrity_gate`` RECOMPUTES ``traces_to_source``
fresh from the record's own raw ``nodes[]`` field rather than trusting
the stored per-node value -- a critic review of a sibling slice
(``challenge.independent_judge``, WORKLOG continuation 40) found that a
gate which only re-reads a stored computed value is not an independent
check. A SECOND critic review of THIS slice's own first draft found
that sharing a predicate between builder and gate removes DRIFT between
the two layers, but does not make either layer independently correct if
the SHARED predicate itself has a real bug -- ``_duplicate_node_ids``
below exists because the first draft had no guard against duplicate
node ids anywhere (builder, gate, or schema), which let a genuine
orphan silently collapse onto a valid decoy's id and be certified
``traces_to_source: true`` at every layer, including schema validation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.lineage.traversal import traces_to_source
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "database_data.data_lineage"
RECORD_ID_PREFIX = "DLR-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.lineage.traversal.traces_to_source"
VALID_STAGES = frozenset({"SOURCE", "INGEST", "TRANSFORM", "DATASET", "ANALYSIS_RUN", "RESULT", "CLAIM", "PAPER_OR_DECISION"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _duplicate_node_ids(nodes: list[Any]) -> list[str]:
    """Shared predicate: which ids (if any) appear more than once among well-shaped node dicts? Called by
    BOTH the builder's construction-time check and the gate's independent re-derivation -- one definition,
    two callers. A collision is dangerous specifically because ``traces_to_source`` keys its own result
    dict by id: a duplicate silently collapses to whichever node happened to be processed last, so a real
    orphan sharing an id with a valid decoy can be certified traced when it is not."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in nodes:
        node_id = item.get("id") if isinstance(item, dict) else None
        if not isinstance(node_id, str):
            continue
        if node_id in seen:
            duplicates.add(node_id)
        seen.add(node_id)
    return sorted(duplicates)


def node(node_id: str, stage: str, description: str, provenance: dict[str, Any], *, upstream_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/data-lineage-record.schema.yaml#/properties/nodes``, WITHOUT
    ``traces_to_source`` populated -- that field is always computed by ``generate_data_lineage_record`` over
    the FULL node set, never by this per-node builder alone (one node's own traceability depends on the
    entire record's graph, not just itself)."""
    if stage not in VALID_STAGES:
        raise InvariantViolation(f"DATALINEAGE_INVALID_STAGE: {stage!r} is not one of {sorted(VALID_STAGES)} (Atlas §11.48 flow diagram, L2315-2321)")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"DATALINEAGE_EMPTY_NODE_DESCRIPTION: node {node_id!r} must have a non-empty description")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DATALINEAGE_NODE_MISSING_PROVENANCE: node {node_id!r} must carry a valid provenance_record")
    refs = list(upstream_refs) if upstream_refs else []
    if stage == "SOURCE" and refs:
        raise InvariantViolation(f"DATALINEAGE_SOURCE_HAS_UPSTREAM: node {node_id!r} is stage:SOURCE but declares upstream_refs {refs!r} -- a source has no upstream by definition")
    return {"id": node_id, "stage": stage, "description": description, "upstream_refs": refs, "provenance": provenance}


def generate_data_lineage_record(
    record_id: str,
    dataset_ref: str,
    nodes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/data-lineage-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: at least one node, every id unique, every node well-shaped (valid stage,
    non-empty description, valid provenance), every SOURCE node has empty upstream_refs, at least one SOURCE
    node, and -- computed here via ``ai_lego.compute.lineage.traversal.traces_to_source``, never
    caller-asserted -- every non-SOURCE node's own upstream chain actually resolves to a real SOURCE.
    Accepts hand-built node dicts (not just ones produced by ``node()``) as a legitimate input shape,
    validated here rather than assumed."""
    if not isinstance(nodes, list) or not nodes:
        raise InvariantViolation("DATALINEAGE_NO_NODES: methods/contracts/database_data.data_lineage.contract.yaml requires at least one node")
    for item in nodes:
        if not isinstance(item, dict) or not _is_nonempty_str(item.get("id")):
            raise InvariantViolation(f"DATALINEAGE_INVALID_NODE_SHAPE: each node must be a dict with a non-empty id, got {item!r}")
    duplicates = _duplicate_node_ids(nodes)
    if duplicates:
        raise InvariantViolation(f"DATALINEAGE_DUPLICATE_NODE_ID: {duplicates} appear more than once -- traces_to_source keys its own result by id, so a duplicate can silently hide a real orphan behind a valid decoy")
    for item in nodes:
        if item.get("stage") not in VALID_STAGES:
            raise InvariantViolation(f"DATALINEAGE_INVALID_STAGE: {item.get('stage')!r} is not one of {sorted(VALID_STAGES)}")
        if not _is_nonempty_str(item.get("description")):
            raise InvariantViolation(f"DATALINEAGE_EMPTY_NODE_DESCRIPTION: node {item.get('id')!r} must have a non-empty description")
        if not provenance_is_valid(item.get("provenance")):
            raise InvariantViolation(f"DATALINEAGE_NODE_MISSING_PROVENANCE: node {item.get('id')!r} must carry a valid provenance_record")
        if item.get("stage") == "SOURCE" and item.get("upstream_refs"):
            raise InvariantViolation(f"DATALINEAGE_SOURCE_HAS_UPSTREAM: node {item.get('id')!r} is stage:SOURCE but declares upstream_refs {item.get('upstream_refs')!r}")

    if not any(item.get("stage") == "SOURCE" for item in nodes):
        raise InvariantViolation("DATALINEAGE_NO_SOURCE_NODE: at least one node must be stage:SOURCE -- a lineage record with nothing to trace back to cannot satisfy Atlas's own benefit bullet (§11.48 L2327)")

    traced = traces_to_source(nodes)
    unresolved = [item["id"] for item in nodes if item.get("stage") != "SOURCE" and not traced.get(item["id"], False)]
    if unresolved:
        raise InvariantViolation(f"DATALINEAGE_NODE_DOES_NOT_TRACE_TO_SOURCE: {unresolved} -- Atlas's own benefit bullet (§11.48 L2327: 一個數字可以回到原始來源) requires every non-SOURCE node's own upstream chain to actually resolve to a real SOURCE, not merely claim one")

    record_nodes: list[dict[str, Any]] = []
    for item in nodes:
        record_nodes.append(
            {
                "id": item["id"],
                "stage": item["stage"],
                "description": item["description"],
                "upstream_refs": list(item.get("upstream_refs") or []),
                "traces_to_source": traced.get(item["id"], False),
                "provenance": item["provenance"],
            }
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "dataset_ref": dataset_ref,
        "nodes": record_nodes,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every node and the overall record carry a
    schema-valid provenance_record. FAILS CLOSED on a malformed node rather than crashing. Also guards
    ``isinstance(record, dict)`` itself -- the per-node check below only protects a malformed ENTRY inside
    ``nodes``, not a ``record`` argument that is not a dict at all."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    nodes = record.get("nodes") or []
    invalid: list[Any] = []
    for item in nodes:
        if not isinstance(item, dict):
            invalid.append(repr(item))
            continue
        if not provenance_is_valid(item.get("provenance")):
            invalid.append(item.get("id", repr(item)))
    overall_valid = provenance_is_valid(record.get("provenance"))
    passed = not invalid and overall_valid
    return _result("provenance_required", passed, [{"nodes_checked": len(nodes), "invalid_provenance_ids": invalid, "overall_provenance_valid": overall_valid}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which DataLineageRecord also carries at the top
    level. Fifth reuse of this gate this session (after root_cause.pareto/decision.ahp/decision.mcda/
    devops_sre.error_budget). Guards ``isinstance(record, dict)`` itself before delegating -- a non-dict
    record must fail closed, not crash with AttributeError (``dict.get`` called on a non-dict), the same fix
    every sibling reuse of this gate now also applies."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_structural_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw nodes[] field -- well-shaped ids,
    no duplicate ids, valid stage, non-empty description, SOURCE-has-no-upstream, at-least-one-SOURCE -- AND
    RECOMPUTES traces_to_source fresh, comparing against the stored per-node value. Does not trust any
    stored value. FAILS CLOSED at every step on malformed input.

    A critic review of this slice's own first draft found that sharing ``traces_to_source`` between the
    builder and this gate removed drift between the two layers, but a real bug in the shared traversal
    function itself (order-dependence from an unsound backward-DFS, since fixed) was faithfully reproduced
    at both layers -- "recomputed independently" is not the same claim as "computed correctly". The
    duplicate-id check added here after that review is a second, previously entirely absent, structural
    precondition, not a re-statement of the traversal fix.
    """
    if not isinstance(record, dict):
        return _result("structural_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    nodes = record.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return _result("structural_integrity", False, [{"reason": "nodes missing, not a list, or empty"}], validator, timestamp)
    if not all(isinstance(item, dict) and _is_nonempty_str(item.get("id")) for item in nodes):
        return _result("structural_integrity", False, [{"reason": "one or more nodes is not a well-shaped dict with a real id"}], validator, timestamp)
    duplicates = _duplicate_node_ids(nodes)
    if duplicates:
        return _result("structural_integrity", False, [{"reason": "duplicate node ids", "duplicate_ids": duplicates}], validator, timestamp)
    invalid_stage = [item["id"] for item in nodes if item.get("stage") not in VALID_STAGES]
    empty_description = [item["id"] for item in nodes if not _is_nonempty_str(item.get("description"))]
    if invalid_stage or empty_description:
        return _result("structural_integrity", False, [{"invalid_stage_ids": invalid_stage, "empty_description_ids": empty_description}], validator, timestamp)
    if not any(item.get("stage") == "SOURCE" for item in nodes):
        return _result("structural_integrity", False, [{"reason": "no SOURCE-stage node present"}], validator, timestamp)
    source_with_upstream = [item["id"] for item in nodes if item.get("stage") == "SOURCE" and item.get("upstream_refs")]
    if source_with_upstream:
        return _result("structural_integrity", False, [{"reason": "SOURCE node(s) declare upstream_refs", "node_ids": source_with_upstream}], validator, timestamp)

    recomputed = traces_to_source(nodes)
    mismatched = [item["id"] for item in nodes if bool(item.get("traces_to_source")) != recomputed.get(item["id"], False)]
    unresolved = [item["id"] for item in nodes if item.get("stage") != "SOURCE" and not recomputed.get(item["id"], False)]
    passed = not mismatched and not unresolved
    return _result("structural_integrity", passed, [{"recomputed_mismatched_ids": mismatched, "unresolved_non_source_ids": unresolved}], validator, timestamp)


def evaluate_data_lineage_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_structural_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
