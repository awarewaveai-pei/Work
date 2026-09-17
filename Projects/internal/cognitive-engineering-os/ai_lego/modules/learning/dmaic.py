"""``learning.dmaic`` -- DMAIC: Define, Measure, Analyze, Improve, Control for a recurring trouble.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: exactly the five
phases, each with a summary; ``measure.items`` >= 1 (a metric with a baseline -- without a measure nothing
can be shown to improve); ``control.items`` >= 1 (a control that keeps the gain); items are non-empty strings.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, integrity_gate, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "learning.dmaic"
RECORD_ID_PREFIX = "DMAIC-"
PHASES = ("define", "measure", "analyze", "improve", "control")
MIN_ITEMS = {"measure": 1, "control": 1}
_PHASE_KEYS = frozenset({"summary", "items"})

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "PHASES", "generate_dmaic", "evaluate_dmaic_gates", "all_gates_pass"]


def _phase_problem(name: str, phase: Any) -> str | None:
    if not isinstance(phase, dict) or set(phase.keys()) != _PHASE_KEYS:
        return f"phases.{name} must be {{summary, items}}"
    if not is_nonempty_str(phase["summary"]):
        return f"phases.{name}.summary missing or empty"
    items = phase["items"]
    if not isinstance(items, list) or not all(is_nonempty_str(i) for i in items):
        return f"phases.{name}.items must be a list of non-empty strings"
    if len(items) < MIN_ITEMS.get(name, 0):
        return f"phases.{name}.items needs at least {MIN_ITEMS[name]} item(s), got {len(items)}"
    return None


def _core_problem(problem_statement: Any, phases: Any) -> str | None:
    if not is_nonempty_str(problem_statement):
        return "problem_statement missing or empty"
    if not isinstance(phases, dict) or set(phases.keys()) != set(PHASES):
        return f"phases must have exactly the keys {list(PHASES)}"
    for name in PHASES:
        problem = _phase_problem(name, phases[name])
        if problem is not None:
            return problem
    return None


def generate_dmaic(record_id: str, problem_statement: str, phases: dict[str, dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("DMAIC", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(problem_statement, phases)
    require(problem is None, "DMAIC_INVALID_PHASES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, problem_statement=problem_statement, phases=phases)


def evaluate_dmaic_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("dmaic_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("problem_statement"), r.get("phases")), lambda r: {name: len(r["phases"][name]["items"]) for name in PHASES}, validator, timestamp),
    ]
