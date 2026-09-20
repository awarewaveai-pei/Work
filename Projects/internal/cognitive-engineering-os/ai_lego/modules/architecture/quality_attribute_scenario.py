"""``architecture.quality_attribute_scenario`` -- fifteenth Method Atlas slice, fourth from the `architecture`
family (F18's own "Software Architecture Pack"). Simplest builder this session has written: no compute layer, no
graph invariant, no closed-category enum -- just 6 required free-text fields transcribed directly from Atlas's own
F18 table row (a thinner citation than any dedicated-section sibling, disclosed as such in the method contract).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.quality_attribute_scenario"
RECORD_ID_PREFIX = "QAS-"
# Prefixes the scenario_id /methods/{id}/invoke generates when the caller omits it (dispatch.self_id_param).
REQUIRED_FIELDS = ("source", "stimulus", "artifact", "environment", "response", "measure")


def generate_quality_attribute_scenario(
    scenario_id: str,
    quality_goal: str,
    source: str,
    stimulus: str,
    artifact: str,
    environment: str,
    response: str,
    measure: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/quality-attribute-scenario.schema.yaml``. Enforces the method contract's own
    precondition fail-closed: all 6 Atlas-cited stage fields non-empty."""
    fields = {"source": source, "stimulus": stimulus, "artifact": artifact, "environment": environment, "response": response, "measure": measure}
    empty = sorted(name for name, value in fields.items() if not value or not value.strip())
    if empty:
        raise InvariantViolation(f"QAS_EMPTY_REQUIRED_FIELD: {empty} must all be non-empty")

    return {
        "id": scenario_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "quality_goal": quality_goal,
        **fields,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(scenario: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(scenario.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": scenario.get("provenance")}], validator, timestamp)


def evaluate_all_fields_present_gate(scenario: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the method contract's own precondition structurally on any record handed to it."""
    empty = sorted(name for name in REQUIRED_FIELDS if not scenario.get(name) or not str(scenario.get(name)).strip())
    return _result("all_fields_present", not empty, [{"empty_fields": empty}], validator, timestamp)


def evaluate_quality_attribute_scenario_gates(scenario: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(scenario, validator, timestamp),
        evaluate_all_fields_present_gate(scenario, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
