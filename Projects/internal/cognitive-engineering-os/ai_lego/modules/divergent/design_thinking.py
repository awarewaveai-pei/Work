"""``divergent.design_thinking`` -- 設計思考: empathize -> define -> ideate -> prototype -> test, as one integrated record.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family; stage-level siblings exist in
insight/framing/divergent/experiment, this is the single integrated pass). Invariants: exactly the five stages,
each with a summary; ``ideate.items`` >= 2 (one idea is not ideation); ``test.items`` >= 1 (a test that
learned nothing did not happen); ``define.summary`` is the problem statement the later stages answer.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, integrity_gate, is_nonempty_str, is_nonempty_str_list, provenance_required_gate, require, require_header

METHOD_ID = "divergent.design_thinking"
RECORD_ID_PREFIX = "DTHINK-"
STAGES = ("empathize", "define", "ideate", "prototype", "test")
MIN_ITEMS = {"ideate": 2, "test": 1}
_STAGE_KEYS = frozenset({"summary", "items"})

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "STAGES", "generate_design_thinking", "evaluate_design_thinking_gates", "all_gates_pass"]


def _stage_problem(name: str, stage: Any) -> str | None:
    if not isinstance(stage, dict) or set(stage.keys()) != _STAGE_KEYS:
        return f"stages.{name} must be {{summary, items}}"
    if not is_nonempty_str(stage["summary"]):
        return f"stages.{name}.summary missing or empty"
    items = stage["items"]
    if not isinstance(items, list) or not all(is_nonempty_str(i) for i in items):
        return f"stages.{name}.items must be a list of non-empty strings"
    if len(items) < MIN_ITEMS.get(name, 0):
        return f"stages.{name}.items needs at least {MIN_ITEMS[name]} item(s), got {len(items)}"
    return None


def _core_problem(challenge: Any, stages: Any) -> str | None:
    if not is_nonempty_str(challenge):
        return "challenge missing or empty"
    if not isinstance(stages, dict) or set(stages.keys()) != set(STAGES):
        return f"stages must have exactly the keys {list(STAGES)}"
    for name in STAGES:
        problem = _stage_problem(name, stages[name])
        if problem is not None:
            return problem
    return None


def generate_design_thinking(record_id: str, challenge: str, stages: dict[str, dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("DTHINK", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(challenge, stages)
    require(problem is None, "DTHINK_INVALID_STAGES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, challenge=challenge, stages=stages)


def evaluate_design_thinking_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("design_thinking_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("challenge"), r.get("stages")), lambda r: {name: len(r["stages"][name]["items"]) for name in STAGES}, validator, timestamp),
    ]
