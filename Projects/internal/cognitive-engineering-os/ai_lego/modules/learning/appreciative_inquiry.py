"""``learning.appreciative_inquiry`` -- 欣賞式探詢: Discover, Dream, Design, Destiny around an affirmative topic.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: the affirmative
topic is stated positively (non-empty); ``discover`` >= 1 peak experience ("what worked"); ``dream`` non-empty;
``design`` >= 1 commitment; ``destiny`` >= 1 first action -- the 4-D cycle is only complete when every D has
content, otherwise it is a wish list.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, integrity_gate, is_nonempty_str, is_nonempty_str_list, provenance_required_gate, require, require_header

METHOD_ID = "learning.appreciative_inquiry"
RECORD_ID_PREFIX = "AI4D-"
LIST_STAGES = ("discover", "design", "destiny")

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_appreciative_inquiry", "evaluate_appreciative_inquiry_gates", "all_gates_pass"]


def _core_problem(affirmative_topic: Any, discover: Any, dream: Any, design: Any, destiny: Any) -> str | None:
    if not is_nonempty_str(affirmative_topic):
        return "affirmative_topic missing or empty"
    for label, items in (("discover", discover), ("design", design), ("destiny", destiny)):
        if not is_nonempty_str_list(items):
            return f"{label} must be a non-empty list of non-empty strings"
    if not is_nonempty_str(dream):
        return "dream missing or empty"
    return None


def generate_appreciative_inquiry(record_id: str, affirmative_topic: str, discover: list[str], dream: str, design: list[str], destiny: list[str], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("AI4D", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(affirmative_topic, discover, dream, design, destiny)
    require(problem is None, "AI4D_INVALID_CYCLE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, affirmative_topic=affirmative_topic, discover=discover, dream=dream, design=design, destiny=destiny)


def evaluate_appreciative_inquiry_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("appreciative_inquiry_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("affirmative_topic"), r.get("discover"), r.get("dream"), r.get("design"), r.get("destiny")), lambda r: {stage: len(r[stage]) for stage in LIST_STAGES}, validator, timestamp),
    ]
