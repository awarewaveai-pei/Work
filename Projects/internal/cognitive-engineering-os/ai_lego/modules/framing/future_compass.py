"""``framing.future_compass`` -- 未來羅盤: a desired destination, the current position, bearings, and the next waypoint.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: destination and
current_position non-empty and different (normalized) -- already there means no compass is needed; >= 1
bearing with unique ids; ``next_waypoint.bearing_ref`` resolves to a declared bearing.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "framing.future_compass"
RECORD_ID_PREFIX = "FCOMPASS-"
_B_REQUIRED = frozenset({"id", "direction_label", "meaning"})
_B_CHECKS = {k: is_nonempty_str for k in _B_REQUIRED}
_W_KEYS = frozenset({"description", "bearing_ref"})

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_future_compass", "evaluate_future_compass_gates", "all_gates_pass"]


def _core_problem(destination: Any, current_position: Any, bearings: Any, next_waypoint: Any) -> str | None:
    if not is_nonempty_str(destination):
        return "destination missing or empty"
    if not is_nonempty_str(current_position):
        return "current_position missing or empty"
    if normalize(destination) == normalize(current_position):
        return "destination equals current_position -- nothing to navigate"
    problem = entries_problem(bearings, _B_REQUIRED, _B_REQUIRED, _B_CHECKS)
    if problem is not None:
        return f"bearings {problem}"
    if first_duplicate(b["id"] for b in bearings) is not None:
        return "bearing ids must be unique"
    if not isinstance(next_waypoint, dict) or set(next_waypoint.keys()) != _W_KEYS or not is_nonempty_str(next_waypoint["description"]):
        return "next_waypoint must be {description, bearing_ref}"
    if not is_one_of(next_waypoint["bearing_ref"], {b["id"] for b in bearings}):
        return f"next_waypoint.bearing_ref {next_waypoint['bearing_ref']!r} is not a declared bearing"
    return None


def generate_future_compass(record_id: str, destination: str, current_position: str, bearings: list[dict[str, Any]], next_waypoint: dict[str, str], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("FCOMPASS", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(destination, current_position, bearings, next_waypoint)
    require(problem is None, "FCOMPASS_INVALID_COMPASS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, destination=destination, current_position=current_position, bearings=bearings, next_waypoint=next_waypoint)


def evaluate_future_compass_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("future_compass_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("destination"), r.get("current_position"), r.get("bearings"), r.get("next_waypoint")), lambda r: {"bearing_count": len(r["bearings"]), "next": r["next_waypoint"]["bearing_ref"]}, validator, timestamp),
    ]
