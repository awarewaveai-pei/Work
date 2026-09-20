"""``architecture.fitness_functions`` -- eighteenth Method Atlas slice, seventh from the `architecture` family
(F18's own "Software Architecture Pack"). Simplest builder shape this session has repeated (same class as
``architecture.quality_attribute_scenario``): a set of records each with 3 required free-text fields, no compute
layer, no closed enum, no graph invariant.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.fitness_functions"
RECORD_ID_PREFIX = "FFS-"
# Value MUST match typed-objects/fitness-function-set.schema.yaml's own `id` pattern (`^FFS-`), not a
# transliteration of the method name (critic-caught 2026-09-18).
# Prefixes the set_id /methods/{id}/invoke generates when the caller omits it (dispatch.self_id_param).


def generate_fitness_function_set(
    set_id: str,
    architecture_under_governance: str,
    functions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/fitness-function-set.schema.yaml``. Enforces the method contract's own
    precondition fail-closed: at least 1 fitness function, each with a non-empty invariant/test_or_metric/ci_gate."""
    if not functions:
        raise InvariantViolation("FFS_NO_FUNCTIONS: at least 1 required")
    for fn in functions:
        empty = sorted(name for name in ("invariant", "test_or_metric", "ci_gate") if not fn.get(name) or not str(fn[name]).strip())
        if empty:
            raise InvariantViolation(f"FFS_EMPTY_REQUIRED_FIELD: function {fn.get('id')!r} missing {empty}")

    return {
        "id": set_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "architecture_under_governance": architecture_under_governance,
        "functions": list(functions),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(fn_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(fn_set.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": fn_set.get("provenance")}], validator, timestamp)


def evaluate_functions_complete_gate(fn_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the method contract's own precondition structurally on any record handed to it."""
    functions = fn_set.get("functions", [])
    incomplete = [fn.get("id") for fn in functions if not all((fn.get(name) or "").strip() for name in ("invariant", "test_or_metric", "ci_gate"))]
    passed = bool(functions) and not incomplete
    return _result("functions_complete", passed, [{"count": len(functions), "incomplete_function_ids": incomplete}], validator, timestamp)


def evaluate_fitness_function_set_gates(fn_set: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(fn_set, validator, timestamp),
        evaluate_functions_complete_gate(fn_set, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
