"""Cross-node safety gate for non-diagnostic art-therapy project workflows."""

from __future__ import annotations

from typing import Any


_EXPECTED_METHODS = (
    "framing.problem_statement",
    "divergent.random_stimulus",
    "association.mind_map",
)
_FORBIDDEN_TERMS = {
    "diagnosis",
    "trauma",
    "treatment_effect",
    "psychological_state",
    "clinical_assessment",
    "risk_state",
}


def _contains_forbidden_key(value: Any) -> bool:
    if isinstance(value, dict):
        if any(key in _FORBIDDEN_TERMS for key in value):
            return True
        return any(_contains_forbidden_key(child) for child in value.values())
    if isinstance(value, list):
        return any(_contains_forbidden_key(child) for child in value)
    return False


def evaluate_art_therapy_project_workflow_gate(
    context: dict[str, Any],
    workflow_ir: dict[str, Any],
    validator: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    """Re-derive the project chain and preserve its non-diagnostic boundary."""
    nodes = workflow_ir.get("nodes", [])
    steps = context.get("steps", {})
    method_ids = [node.get("method_id") for node in nodes if isinstance(node, dict)]
    stimulus_outputs: list[dict[str, Any]] = []
    for index, node in enumerate(nodes if isinstance(nodes, list) else []):
        step = steps.get(str(index)) if isinstance(steps, dict) else None
        if isinstance(node, dict) and node.get("method_id") == "divergent.random_stimulus" and isinstance(step, dict):
            stimulus_outputs.append(step)
    entries = [entry for output in stimulus_outputs for entry in output.get("entries", []) if isinstance(output.get("entries"), list)]
    checks = {
        "declared_method_chain": method_ids == list(_EXPECTED_METHODS),
        "stimulus_output_present": bool(stimulus_outputs) and bool(entries),
        "all_stimuli_remain_not_yet_screened": bool(entries) and all(entry.get("feasibility_status") == "NOT_YET_SCREENED" for entry in entries),
        "no_diagnostic_or_treatment_claim_keys": not _contains_forbidden_key(context.get("outputs", {})),
    }
    return [{
        "gate_id": "art_therapy_project_safety",
        "status": "PASS" if all(checks.values()) else "FAIL",
        "evidence": [checks],
        "validator": validator,
        "timestamp": timestamp,
    }]
