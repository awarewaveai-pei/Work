"""``systems.force_field_analysis`` -- 推力與阻力分析: forces driving and restraining a change, each weighed.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: >= 1 driving and
>= 1 restraining force, ids unique ACROSS both lists, integer strength 1..5 (bool rejected). The net score is a
derived view recomputed on read -- never a stored "go/no-go".
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_int_in, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "systems.force_field_analysis"
RECORD_ID_PREFIX = "FFA-"
_F_REQUIRED = frozenset({"id", "description", "strength"})
_F_CHECKS = {"id": is_nonempty_str, "description": is_nonempty_str, "strength": lambda v: is_int_in(v, 1, 5)}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_force_field_analysis", "evaluate_force_field_analysis_gates", "net_force", "all_gates_pass"]


def _core_problem(change_goal: Any, driving_forces: Any, restraining_forces: Any) -> str | None:
    if not is_nonempty_str(change_goal):
        return "change_goal missing or empty"
    for label, forces in (("driving_forces", driving_forces), ("restraining_forces", restraining_forces)):
        problem = entries_problem(forces, _F_REQUIRED, _F_REQUIRED, _F_CHECKS)
        if problem is not None:
            return f"{label} {problem}"
    dup = first_duplicate([f["id"] for f in driving_forces] + [f["id"] for f in restraining_forces])
    if dup is not None:
        return f"force id {dup!r} is not unique across driving and restraining forces"
    return None


def generate_force_field_analysis(record_id: str, change_goal: str, driving_forces: list[dict[str, Any]], restraining_forces: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("FFA", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(change_goal, driving_forces, restraining_forces)
    require(problem is None, "FFA_INVALID_FORCES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, change_goal=change_goal, driving_forces=driving_forces, restraining_forces=restraining_forces)


def net_force(record: dict[str, Any]) -> dict[str, int]:
    driving = sum(f["strength"] for f in record["driving_forces"])
    restraining = sum(f["strength"] for f in record["restraining_forces"])
    return {"driving_total": driving, "restraining_total": restraining, "net": driving - restraining}


def evaluate_force_field_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("force_field_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("change_goal"), r.get("driving_forces"), r.get("restraining_forces")), net_force, validator, timestamp),
    ]
