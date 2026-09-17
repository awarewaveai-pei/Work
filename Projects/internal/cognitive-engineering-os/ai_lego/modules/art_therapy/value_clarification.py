"""``art_therapy.value_clarification`` -- 價值澄清: the few core values that remain after a transformation.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "協助案主明確轉化過後最核心的價值與人生方向"). Invariants:
1..5 core values (clarification means few; more than five is a list, not a core) with unique ids and unique
normalized value names; each names why it matters and the life direction it implies.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.value_clarification"
RECORD_ID_PREFIX = "VCLAR-"
MAX_CORE_VALUES = 5
_V_REQUIRED = frozenset({"id", "value", "why_it_matters", "life_direction"})
_V_CHECKS = {k: is_nonempty_str for k in _V_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_value_clarification", "evaluate_value_clarification_gates", "all_gates_pass"]


def _core_problem(transformation_context: Any, core_values: Any) -> str | None:
    if not is_nonempty_str(transformation_context):
        return "transformation_context missing or empty"
    problem = entries_problem(core_values, _V_REQUIRED, _V_REQUIRED, _V_CHECKS)
    if problem is not None:
        return f"core_values {problem}"
    if len(core_values) > MAX_CORE_VALUES:
        return f"at most {MAX_CORE_VALUES} core values (got {len(core_values)}) -- clarification means few"
    if first_duplicate(v["id"] for v in core_values) is not None or first_duplicate(normalize(v["value"]) for v in core_values) is not None:
        return "core_values must have unique ids and unique (normalized) value names"
    return None


def generate_value_clarification(record_id: str, transformation_context: str, core_values: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("VCLAR", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(transformation_context, core_values)
    require(problem is None, "VCLAR_INVALID_VALUES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, transformation_context=transformation_context, core_values=core_values)


def evaluate_value_clarification_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("value_clarification_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("transformation_context"), r.get("core_values")), lambda r: {"value_count": len(r["core_values"]), "values": [v["value"] for v in r["core_values"]]}, validator, timestamp),
    ]
