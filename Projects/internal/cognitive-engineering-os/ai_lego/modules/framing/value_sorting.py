"""``framing.value_sorting`` -- 價值觀排序: rank a set of candidate values.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: >= 2 candidates
with unique ids and unique normalized names; ``ranking`` is a PERMUTATION of the candidate ids (every candidate
placed exactly once, nothing extra) -- a partial or padded ranking silently drops or invents a value.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "framing.value_sorting"
RECORD_ID_PREFIX = "VSORT-"
MIN_CANDIDATES = 2
_C_REQUIRED = frozenset({"id", "value"})
_C_CHECKS = {"id": is_nonempty_str, "value": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_value_sorting", "evaluate_value_sorting_gates", "top_values", "all_gates_pass"]


def _core_problem(context: Any, candidate_values: Any, ranking: Any) -> str | None:
    if not is_nonempty_str(context):
        return "context missing or empty"
    problem = entries_problem(candidate_values, _C_REQUIRED, _C_REQUIRED, _C_CHECKS, min_items=MIN_CANDIDATES)
    if problem is not None:
        return f"candidate_values {problem}"
    if first_duplicate(c["id"] for c in candidate_values) is not None or first_duplicate(normalize(c["value"]) for c in candidate_values) is not None:
        return "candidate_values must have unique ids and unique (normalized) names"
    if not isinstance(ranking, list) or not all(isinstance(r, str) for r in ranking):
        return "ranking must be a list of candidate ids"
    ids = [c["id"] for c in candidate_values]
    if sorted(ranking) != sorted(ids):
        return f"ranking must be a permutation of candidate ids {sorted(ids)}, got {sorted(ranking)}"
    return None


def generate_value_sorting(record_id: str, context: str, candidate_values: list[dict[str, Any]], ranking: list[str], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("VSORT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(context, candidate_values, ranking)
    require(problem is None, "VSORT_INVALID_RANKING", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, context=context, candidate_values=candidate_values, ranking=ranking)


def top_values(record: dict[str, Any], n: int = 3) -> list[str]:
    """Derived view: the value names in ranking order, first ``n``."""
    by_id = {c["id"]: c["value"] for c in record["candidate_values"]}
    return [by_id[i] for i in record["ranking"][:n]]


def evaluate_value_sorting_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("value_sorting_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("context"), r.get("candidate_values"), r.get("ranking")), lambda r: {"candidate_count": len(r["candidate_values"]), "top_3": top_values(r)}, validator, timestamp),
    ]
