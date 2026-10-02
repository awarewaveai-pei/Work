"""``art_therapy.personal_swot`` -- 個人 SWOT: one's own strengths, weaknesses, opportunities and threats, and one move.

GROUNDED ORIGINAL DESIGN (operator 54-item list, Personal SWOT row; client version chosen over strategy.swot, whose
factors need geography/time/source and whose input is a KnowledgeSet). Invariants, re-derived by the gate: >= 1 factor in every
quadrant (three quadrants is not a SWOT); unique ids; each factor names one concrete ``moment`` it showed up; the
``action`` pairs an id that IS a STRENGTH with an id that IS an OPPORTUNITY and names a ``first_step``.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, is_one_of, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.personal_swot"
RECORD_ID_PREFIX = "PSWOT-"
CATEGORIES = ("STRENGTH", "WEAKNESS", "OPPORTUNITY", "THREAT")
MAX_FACTORS = 40
_F_REQUIRED = frozenset({"id", "category", "statement", "moment"})
_F_CHECKS = {"id": is_nonempty_str, "category": lambda v: is_one_of(v, CATEGORIES), "statement": is_nonempty_str, "moment": is_nonempty_str}
_ACTION_KEYS = frozenset({"strength_id", "opportunity_id", "first_step"})

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_personal_swot", "evaluate_personal_swot_gates", "all_gates_pass"]


def _core_problem(subject: Any, factors: Any, action: Any) -> str | None:
    if not is_nonempty_str(subject):
        return "subject missing or empty"
    problem = entries_problem(factors, _F_REQUIRED, _F_REQUIRED, _F_CHECKS, min_items=4)
    if problem is not None:
        return f"factors {problem}"
    if len(factors) > MAX_FACTORS:
        return f"at most {MAX_FACTORS} factors, got {len(factors)}"
    dup = first_duplicate(f["id"] for f in factors)
    if dup is not None:
        return f"duplicate factor id {dup!r}"
    missing = [c for c in CATEGORIES if not any(f["category"] == c for f in factors)]
    if missing:
        return f"every quadrant needs at least one factor; missing {missing}"
    if not isinstance(action, dict) or set(action) != _ACTION_KEYS or not all(is_nonempty_str(action[k]) for k in _ACTION_KEYS):
        return f"action must have exactly {sorted(_ACTION_KEYS)}, each a non-empty string"
    category_of = {f["id"]: f["category"] for f in factors}
    if category_of.get(action["strength_id"]) != "STRENGTH":
        return f"action.strength_id {action['strength_id']!r} is not a STRENGTH factor"
    if category_of.get(action["opportunity_id"]) != "OPPORTUNITY":
        return f"action.opportunity_id {action['opportunity_id']!r} is not an OPPORTUNITY factor"
    return None


def generate_personal_swot(record_id: str, subject: str, factors: list[dict[str, Any]], action: dict[str, Any], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("PSWOT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(subject, factors, action)
    require(problem is None, "PSWOT_INVALID", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, subject=subject, factors=factors, action=action)


def evaluate_personal_swot_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    def evidence(r: dict[str, Any]) -> dict[str, Any]:
        return {"quadrant_counts": {c: sum(f["category"] == c for f in r["factors"]) for c in CATEGORIES}, "action": [r["action"]["strength_id"], r["action"]["opportunity_id"]]}

    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("personal_swot_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("subject"), r.get("factors"), r.get("action")), evidence, validator, timestamp),
    ]
