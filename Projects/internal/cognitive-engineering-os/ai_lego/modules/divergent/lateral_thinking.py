"""``divergent.lateral_thinking`` -- 水平思考: break a dominant assumption with a provocation, then "move" to an idea.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: the dominant
assumption being escaped is named; >= 1 provocation with unique ids and a technique from the closed set; each
provocation's ``movement`` (the idea reached FROM it) differs from the provocation statement itself -- a
provocation without movement is a joke, not lateral thinking.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "divergent.lateral_thinking"
RECORD_ID_PREFIX = "LATERAL-"
TECHNIQUES = frozenset({"PROVOCATION_PO", "REVERSAL", "RANDOM_ENTRY", "ESCAPE", "DISTORTION", "WISHFUL_THINKING"})
_P_REQUIRED = frozenset({"id", "technique", "statement", "movement"})
_P_CHECKS = {"id": is_nonempty_str, "technique": lambda v: is_one_of(v, TECHNIQUES), "statement": is_nonempty_str, "movement": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "TECHNIQUES", "generate_lateral_thinking", "evaluate_lateral_thinking_gates", "all_gates_pass"]


def _core_problem(problem_statement: Any, dominant_assumption: Any, provocations: Any) -> str | None:
    if not is_nonempty_str(problem_statement):
        return "problem_statement missing or empty"
    if not is_nonempty_str(dominant_assumption):
        return "dominant_assumption missing or empty"
    problem = entries_problem(provocations, _P_REQUIRED, _P_REQUIRED, _P_CHECKS)
    if problem is not None:
        return f"provocations {problem}"
    if first_duplicate(p["id"] for p in provocations) is not None:
        return "provocation ids must be unique"
    for p in provocations:
        if normalize(p["movement"]) == normalize(p["statement"]):
            return f"provocation {p['id']!r} has no movement beyond its own statement"
    return None


def generate_lateral_thinking(record_id: str, problem_statement: str, dominant_assumption: str, provocations: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("LATERAL", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(problem_statement, dominant_assumption, provocations)
    require(problem is None, "LATERAL_INVALID_PROVOCATIONS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, problem_statement=problem_statement, dominant_assumption=dominant_assumption, provocations=provocations)


def evaluate_lateral_thinking_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("lateral_thinking_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("problem_statement"), r.get("dominant_assumption"), r.get("provocations")), lambda r: {"provocation_count": len(r["provocations"]), "techniques": sorted({p["technique"] for p in r["provocations"]})}, validator, timestamp),
    ]
