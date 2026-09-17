"""``framing.grow_model`` -- GROW 模型: Goal, Reality, Options, Will.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general coaching method, natural family). Invariants: goal and
reality non-empty; >= 2 options with unique ids (one option is not a choice); ``will`` commits to a declared
option (chosen_option_ref resolves), a first step, and an ISO ``by_when`` date -- a will without a date is a wish.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_iso_date, is_one_of, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "framing.grow_model"
RECORD_ID_PREFIX = "GROW-"
MIN_OPTIONS = 2
_O_REQUIRED = frozenset({"id", "description"})
_O_CHECKS = {"id": is_nonempty_str, "description": is_nonempty_str}
_W_KEYS = frozenset({"chosen_option_ref", "first_step", "by_when"})

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_grow_model", "evaluate_grow_model_gates", "all_gates_pass"]


def _core_problem(goal: Any, reality: Any, options: Any, will: Any) -> str | None:
    if not is_nonempty_str(goal):
        return "goal missing or empty"
    if not is_nonempty_str(reality):
        return "reality missing or empty"
    problem = entries_problem(options, _O_REQUIRED, _O_REQUIRED, _O_CHECKS, min_items=MIN_OPTIONS)
    if problem is not None:
        return f"options {problem}"
    if first_duplicate(o["id"] for o in options) is not None:
        return "option ids must be unique"
    if not isinstance(will, dict) or set(will.keys()) != _W_KEYS:
        return "will must be {chosen_option_ref, first_step, by_when}"
    if not is_one_of(will["chosen_option_ref"], {o["id"] for o in options}):
        return f"will.chosen_option_ref {will['chosen_option_ref']!r} is not a declared option"
    if not is_nonempty_str(will["first_step"]):
        return "will.first_step missing or empty"
    if not is_iso_date(will["by_when"]):
        return "will.by_when must be an ISO date"
    return None


def generate_grow_model(record_id: str, goal: str, reality: str, options: list[dict[str, Any]], will: dict[str, str], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("GROW", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(goal, reality, options, will)
    require(problem is None, "GROW_INVALID_PLAN", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, goal=goal, reality=reality, options=options, will=will)


def evaluate_grow_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("grow_model_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("goal"), r.get("reality"), r.get("options"), r.get("will")), lambda r: {"option_count": len(r["options"]), "chosen": r["will"]["chosen_option_ref"], "by_when": r["will"]["by_when"]}, validator, timestamp),
    ]
