"""``divergent.six_thinking_hats`` -- 六頂思考帽: one topic viewed through all six hats in turn.

GROUNDED ORIGINAL DESIGN (operator 54-item art-therapy list; general method, placed in its natural family).
Invariant: exactly the six hats (WHITE facts, RED feelings, BLACK caution, YELLOW benefits, GREEN creativity,
BLUE process), each worn exactly once with >= 1 statement -- skipping a hat is the failure mode the method
exists to prevent, so a partial set is refused rather than tolerated.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, is_nonempty_str_list, provenance_required_gate, require, require_header

METHOD_ID = "divergent.six_thinking_hats"
RECORD_ID_PREFIX = "SIXHATS-"
HATS = ("WHITE", "RED", "BLACK", "YELLOW", "GREEN", "BLUE")
_H_REQUIRED = frozenset({"hat", "statements"})
_H_CHECKS = {"hat": lambda v: is_one_of(v, HATS), "statements": is_nonempty_str_list}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "HATS", "generate_six_thinking_hats", "evaluate_six_thinking_hats_gates", "all_gates_pass"]


def _core_problem(topic: Any, hats: Any) -> str | None:
    if not is_nonempty_str(topic):
        return "topic missing or empty"
    problem = entries_problem(hats, _H_REQUIRED, _H_REQUIRED, _H_CHECKS, min_items=len(HATS))
    if problem is not None:
        return f"hats {problem}"
    if first_duplicate(h["hat"] for h in hats) is not None:
        return "each hat may be worn only once"
    missing = set(HATS) - {h["hat"] for h in hats}
    if missing:
        return f"missing hat(s) {sorted(missing)} -- all six are required"
    return None


def generate_six_thinking_hats(record_id: str, topic: str, hats: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("SIXHATS", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(topic, hats)
    require(problem is None, "SIXHATS_INVALID_HATS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, topic=topic, hats=hats)


def evaluate_six_thinking_hats_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("six_thinking_hats_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("topic"), r.get("hats")), lambda r: {"statement_count": sum(len(h["statements"]) for h in r["hats"])}, validator, timestamp),
    ]
