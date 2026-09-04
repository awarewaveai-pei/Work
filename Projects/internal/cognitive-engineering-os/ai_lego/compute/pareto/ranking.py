"""Pareto (cumulative-share) ranking -- deterministic compute, backing ``root_cause.pareto``.

Same Trusted Compute discipline ``compute/statistics/reliability.py``
already established (Master Plan §39: an LLM must never "mentally
calculate" a value and label it CALCULATED_RESULT): the ranking is computed
here, by code, and the result record says so via ``engine``/
``computation_provenance_ref``. Atlas §11.6's own caution (L1320, "80/20
不是自然法則；真正比例由資料決定") is why this module never picks a
threshold itself -- ``pareto_ranking`` returns the full sorted, cumulative-
share ranking; deciding which prefix counts as the "vital few" is the
caller's own, explicit, operator-set decision (``ai_lego/modules/root_cause/pareto.py``).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from ai_lego.errors import InvariantViolation


def pareto_ranking(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """``records``: ``[{hypothesis_id, metric_value}, ...]``. Same ``hypothesis_id`` may repeat (summed).

    Returns the ranking sorted descending by summed ``metric_value``, each
    entry carrying ``share_of_total_percent`` and a running
    ``cumulative_share_percent`` -- Atlas §11.6 steps 3-4 (L1309-1310).
    """
    if not records:
        raise InvariantViolation("PARETO_RANKING_EMPTY_INPUT: at least one record required")
    totals: dict[str, float] = defaultdict(float)
    for record in records:
        value = record["metric_value"]
        if value < 0:
            raise InvariantViolation(f"PARETO_RANKING_NEGATIVE_VALUE: {record['hypothesis_id']!r} has metric_value {value} (must be >= 0)")
        totals[record["hypothesis_id"]] += value
    grand_total = sum(totals.values())
    if grand_total <= 0:
        raise InvariantViolation("PARETO_RANKING_ZERO_TOTAL: sum of all metric_value is zero; no ranking is meaningful")
    ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ranking: list[dict[str, Any]] = []
    cumulative = 0.0
    for hypothesis_id, value in ordered:
        share = (value / grand_total) * 100
        cumulative += share
        ranking.append(
            {
                "hypothesis_id": hypothesis_id,
                "metric_value": value,
                "share_of_total_percent": round(share, 8),
                "cumulative_share_percent": round(min(cumulative, 100.0), 8),
            }
        )
    return ranking


def vital_few(ranking: list[dict[str, Any]], threshold_percent: float) -> list[str]:
    """The prefix of ``ranking`` (already sorted descending) whose cumulative share FIRST reaches
    ``threshold_percent`` -- inclusive of the entry that crosses it. Pure function over an explicit,
    caller-supplied threshold; never invents one (see module docstring)."""
    if not 0 < threshold_percent <= 100:
        raise InvariantViolation(f"PARETO_THRESHOLD_OUT_OF_RANGE: {threshold_percent} (must be in (0, 100])")
    selected: list[str] = []
    for entry in ranking:
        selected.append(entry["hypothesis_id"])
        if entry["cumulative_share_percent"] >= threshold_percent:
            break
    return selected
