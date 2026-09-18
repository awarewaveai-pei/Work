"""``architecture.system_context_model`` -- sixteenth Method Atlas slice, fifth from the `architecture` family
(F18's own "Software Architecture Pack"). Real-world method name is "C4 Model"; machine_id/type-name use
"system_context_model" instead because ``method.schema.yaml``'s own id/family pattern (``^[a-z_]+\\.[a-z_]+$``)
admits no digits -- disclosed in the method contract's own description, not a silent rename.

Enforces the structurally-necessary (not literally Atlas-cited) cross-
reference every 4-level hierarchy implies: a component belongs to a real
container, code belongs to a real component.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.system_context_model"
RECORD_ID_PREFIX = "C4-"
# "C4-" not "SYSCONTEXTMODEL-": this constant is a record_id PREFIX, a free-text field with no
# grammar restriction -- unlike METHOD_ID/family, which this module's own docstring already
# explains cannot contain a digit. Not load-bearing for API auto-injection (identity param is the
# domain-specific model_id, not `record_id`) -- exists only for the dashboard's opt-in id-suggest
# button. See atam.py's own RECORD_ID_PREFIX comment for the full rationale (2026-09-18).


def generate_system_context_model(
    model_id: str,
    system_context: str,
    containers: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    components: list[dict[str, Any]] | None = None,
    code: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/system-context-model.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: at least 1 container, every component references a real container, every code
    element (if any) references a real component."""
    components = components or []
    code = code or []

    if not containers:
        raise InvariantViolation("SCM_NO_CONTAINERS: at least 1 required")

    container_ids = {c["id"] for c in containers}
    unknown_containers = sorted({c["container_id"] for c in components} - container_ids)
    if unknown_containers:
        raise InvariantViolation(f"SCM_UNKNOWN_CONTAINER_IN_COMPONENT: {unknown_containers} not in containers")

    component_ids = {c["id"] for c in components}
    unknown_components = sorted({c["component_id"] for c in code} - component_ids)
    if unknown_components:
        raise InvariantViolation(f"SCM_UNKNOWN_COMPONENT_IN_CODE: {unknown_components} not in components")

    return {
        "id": model_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_context": system_context,
        "containers": list(containers),
        "components": list(components),
        "code": list(code),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(model: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(model.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": model.get("provenance")}], validator, timestamp)


def evaluate_hierarchy_integrity_gate(model: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the container/component/code cross-reference invariant structurally on any record handed to it --
    not just trusting the builder's own construction-time check already ran."""
    container_ids = {c["id"] for c in model.get("containers", [])}
    component_ids = {c["id"] for c in model.get("components", [])}
    unknown_containers = sorted({c["container_id"] for c in model.get("components", [])} - container_ids)
    unknown_components = sorted({c["component_id"] for c in model.get("code", [])} - component_ids)
    passed = not unknown_containers and not unknown_components
    return _result("hierarchy_integrity", passed, [{"unknown_containers_referenced": unknown_containers, "unknown_components_referenced": unknown_components}], validator, timestamp)


def evaluate_system_context_model_gates(model: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(model, validator, timestamp),
        evaluate_hierarchy_integrity_gate(model, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
