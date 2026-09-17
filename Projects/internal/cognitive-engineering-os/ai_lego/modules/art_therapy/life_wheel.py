"""``art_therapy.life_wheel`` -- 生命之輪 (Life Wheel): rate each life dimension 0-10 to see balance.

Operator's therapeutic use (ART_THERAPY_METHOD_ATLAS_GAP_LIST.md): 評估生活各面向的平衡狀態. Not in the Method
Atlas mother document; GROUNDED ORIGINAL DESIGN, disclosed in the contract.

Real invariants (builder raises; gate re-derives from raw fields):
1. >= 4 dimensions, each with a unique (normalized) name and a real number score in [0, 10] (bool rejected).
2. ``balance_gap`` is never stored -- ``balance_summary()`` recomputes max-min fresh so a tampered score cannot
   carry a stale "balanced" claim.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import (
    all_gates_pass,
    base_record,
    entries_problem,
    first_duplicate,
    integrity_gate,
    is_nonempty_str,
    is_number_in,
    normalize,
    provenance_required_gate,
    require,
    require_header,
)

METHOD_ID = "art_therapy.life_wheel"
RECORD_ID_PREFIX = "LWHEEL-"
MIN_DIMENSIONS = 4
SCORE_MIN, SCORE_MAX = 0, 10

_DIM_REQUIRED = frozenset({"id", "name", "score"})
_DIM_ALLOWED = _DIM_REQUIRED | frozenset({"note"})
_DIM_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "score": lambda v: is_number_in(v, SCORE_MIN, SCORE_MAX), "note": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_life_wheel", "evaluate_life_wheel_gates", "balance_summary", "all_gates_pass"]


def _dimensions_problem(dimensions: Any) -> str | None:
    problem = entries_problem(dimensions, _DIM_REQUIRED, _DIM_ALLOWED, _DIM_CHECKS, min_items=MIN_DIMENSIONS)
    if problem is not None:
        return f"dimensions {problem}"
    duplicate_id = first_duplicate(d["id"] for d in dimensions)
    if duplicate_id is not None:
        return f"duplicate dimension id {duplicate_id!r}"
    duplicate_name = first_duplicate(normalize(d["name"]) for d in dimensions)
    if duplicate_name is not None:
        return f"duplicate dimension name {duplicate_name!r} (normalized)"
    return None


def generate_life_wheel(record_id: str, subject: str, dimensions: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("LWHEEL", record_id, RECORD_ID_PREFIX, version, provenance)
    require(is_nonempty_str(subject), "LWHEEL_INVALID_SUBJECT", "subject must be a non-empty string")
    problem = _dimensions_problem(dimensions)
    require(problem is None, "LWHEEL_INVALID_DIMENSIONS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, subject=subject, dimensions=dimensions)


def balance_summary(record: dict[str, Any]) -> dict[str, Any]:
    """Derived view, recomputed every call: lowest/highest dimension and the gap between them."""
    scored = sorted(record["dimensions"], key=lambda d: d["score"])
    return {"lowest": scored[0]["name"], "highest": scored[-1]["name"], "balance_gap": scored[-1]["score"] - scored[0]["score"], "mean": sum(d["score"] for d in scored) / len(scored)}


def _record_problem(record: dict[str, Any]) -> str | None:
    if not is_nonempty_str(record.get("subject")):
        return "subject missing or empty"
    return _dimensions_problem(record.get("dimensions"))


def evaluate_life_wheel_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("life_wheel_integrity", record, RECORD_ID_PREFIX, _record_problem, lambda r: {"dimension_count": len(r["dimensions"]), **balance_summary(r)}, validator, timestamp),
    ]
