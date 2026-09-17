"""``divergent.triz`` -- 創新理論工具 TRIZ: resolve a contradiction with inventive principles.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family; TRIZ's 40 inventive
principles are public domain). Invariants: the contradiction names an improving and a worsening parameter
that differ (normalized) -- "A vs A" is not a contradiction; >= 1 principle with a unique integer number in
1..40 (bool rejected), a name, and how it was applied.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_int_in, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "divergent.triz"
RECORD_ID_PREFIX = "TRIZ-"
PRINCIPLE_MIN, PRINCIPLE_MAX = 1, 40
_C_KEYS = frozenset({"improving_parameter", "worsening_parameter"})
_P_REQUIRED = frozenset({"principle_number", "name", "application"})
_P_CHECKS = {"principle_number": lambda v: is_int_in(v, PRINCIPLE_MIN, PRINCIPLE_MAX), "name": is_nonempty_str, "application": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_triz", "evaluate_triz_gates", "all_gates_pass"]


def _core_problem(problem_statement: Any, contradiction: Any, principles: Any) -> str | None:
    if not is_nonempty_str(problem_statement):
        return "problem_statement missing or empty"
    if not isinstance(contradiction, dict) or set(contradiction.keys()) != _C_KEYS or not all(is_nonempty_str(contradiction[k]) for k in _C_KEYS):
        return "contradiction must be {improving_parameter, worsening_parameter} with non-empty strings"
    if normalize(contradiction["improving_parameter"]) == normalize(contradiction["worsening_parameter"]):
        return "improving and worsening parameters are the same -- not a contradiction"
    problem = entries_problem(principles, _P_REQUIRED, _P_REQUIRED, _P_CHECKS)
    if problem is not None:
        return f"principles {problem}"
    if first_duplicate(p["principle_number"] for p in principles) is not None:
        return "principle numbers must be unique"
    return None


def generate_triz(record_id: str, problem_statement: str, contradiction: dict[str, str], principles: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("TRIZ", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(problem_statement, contradiction, principles)
    require(problem is None, "TRIZ_INVALID_CONTRADICTION", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, problem_statement=problem_statement, contradiction=contradiction, principles=principles)


def evaluate_triz_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("triz_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("problem_statement"), r.get("contradiction"), r.get("principles")), lambda r: {"principle_numbers": sorted(p["principle_number"] for p in r["principles"])}, validator, timestamp),
    ]
