"""Provider-neutral integrity gates for completed Workflow IR runs."""

from __future__ import annotations

from typing import Any, Mapping


def evaluate_workflow_completion_gate(
    context: Mapping[str, Any],
    workflow_ir: Mapping[str, Any],
    validator: str,
    timestamp: str,
) -> dict[str, Any]:
    """Re-derive that every declared node committed an output before success.

    This gate is deliberately domain-neutral: method semantics and capability
    freshness belong to their own gates.  It protects the platform invariant
    that a successful workflow is complete and did not silently skip a required
    capability.
    """
    nodes = workflow_ir.get("nodes")
    steps = context.get("steps")
    checks: dict[str, Any] = {
        "workflow_nodes_are_declared": isinstance(nodes, list) and bool(nodes),
        "committed_step_indexes": [],
        "missing_step_indexes": [],
        "required_capabilities_not_invoked": [],
    }
    if not isinstance(nodes, list) or not isinstance(steps, Mapping):
        checks["workflow_nodes_are_declared"] = False
    else:
        for index, node in enumerate(nodes):
            if not isinstance(node, Mapping) or str(index) not in steps:
                checks["missing_step_indexes"].append(index)
                continue
            checks["committed_step_indexes"].append(index)
            output = steps[str(index)]
            if node.get("node_kind") == "capability" and str(node.get("necessity", "RECOMMENDED")).startswith("REQUIRED_") and isinstance(output, Mapping) and output.get("status") == "NOT_INVOKED":
                checks["required_capabilities_not_invoked"].append(node.get("ref"))
    passed = (
        checks["workflow_nodes_are_declared"]
        and not checks["missing_step_indexes"]
        and not checks["required_capabilities_not_invoked"]
    )
    return {
        "gate_id": "workflow_execution_integrity",
        "status": "PASS" if passed else "FAIL",
        "evidence": [checks],
        "validator": validator,
        "timestamp": timestamp,
    }
