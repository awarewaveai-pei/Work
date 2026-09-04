"""Multi-Criteria Decision Analysis -- deterministic compute, backing ``decision.mcda``.

Same Trusted Compute discipline every prior genuine-compute module this
session established (``compute/statistics/reliability.py``,
``compute/pareto/ranking.py``, ``compute/graph/dag.py``,
``compute/ahp/weights.py``, ``compute/monitoring/triggers.py``):
normalization is DECIDED here, by a real deterministic algorithm, never
asserted by an LLM.

Only ``normalize_scores`` is new in this module -- the Score stage
(Atlas §11.32 L1953, weighted-sum ranking) reuses
``ai_lego.compute.ahp.weights.rank_options`` UNCHANGED. That function has
nothing AHP-specific in its own implementation (a plain criterion-weight
dict plus a plain per-option-per-criterion score list -> sorted ranking);
see ``specs/cognitive/typed-objects/mcda-analysis.schema.yaml``'s own
``compilation_decisions`` for why it is imported as-is rather than
relocated or duplicated.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

VALID_DIRECTIONS = frozenset({"maximize", "minimize"})


def normalize_scores(raw_scores: list[dict[str, Any]], criteria: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Direction-aware min-max normalization per criterion, Atlas §11.32's own 'Normalize' pipeline stage
    (L1952). ``raw_scores``: ``[{option_id, criterion_id, raw_value}, ...]`` (arbitrary scale). ``criteria``:
    ``[{id, label, direction}, ...]`` where ``direction`` is ``maximize`` or ``minimize``.

    When every raw value for a criterion is identical (max == min), that criterion draws no distinction between
    options -- normalized to 1.0 for all (a tied criterion fully, equally satisfies every option; a documented
    compilation decision, not an Atlas-cited edge case -- see the typed-object schema's own examples)."""
    direction_by_criterion: dict[str, str] = {}
    for criterion in criteria:
        direction = criterion["direction"]
        if direction not in VALID_DIRECTIONS:
            raise InvariantViolation(f"MCDA_INVALID_DIRECTION: {direction!r} for criterion {criterion['id']!r} (must be one of {sorted(VALID_DIRECTIONS)})")
        direction_by_criterion[criterion["id"]] = direction

    unknown = {entry["criterion_id"] for entry in raw_scores} - set(direction_by_criterion)
    if unknown:
        raise InvariantViolation(f"MCDA_UNKNOWN_CRITERION_IN_RAW_SCORE: {sorted(unknown)} not in criteria")

    by_criterion: dict[str, list[dict[str, Any]]] = {}
    for entry in raw_scores:
        by_criterion.setdefault(entry["criterion_id"], []).append(entry)

    normalized: list[dict[str, Any]] = []
    for criterion_id, entries in by_criterion.items():
        values = [entry["raw_value"] for entry in entries]
        lo, hi = min(values), max(values)
        direction = direction_by_criterion[criterion_id]
        for entry in entries:
            if hi == lo:
                normalized_value = 1.0
            elif direction == "maximize":
                normalized_value = (entry["raw_value"] - lo) / (hi - lo)
            else:
                normalized_value = (hi - entry["raw_value"]) / (hi - lo)
            normalized.append({"option_id": entry["option_id"], "criterion_id": criterion_id, "normalized_value": round(normalized_value, 8)})
    return normalized


def validate_weights_sum_to_one(weights: list[dict[str, Any]], criteria_ids: list[str], *, tolerance: float = 1e-6) -> None:
    """Method contract precondition: weights are non-negative and sum to 1.0 (tolerance 1e-6)."""
    unknown = {entry["criterion_id"] for entry in weights} - set(criteria_ids)
    if unknown:
        raise InvariantViolation(f"MCDA_UNKNOWN_CRITERION_IN_WEIGHTS: {sorted(unknown)} not in criteria")
    negative = [entry for entry in weights if entry["weight"] < 0]
    if negative:
        raise InvariantViolation(f"MCDA_NEGATIVE_WEIGHT: {negative}")
    total = sum(entry["weight"] for entry in weights)
    if abs(total - 1.0) > tolerance:
        raise InvariantViolation(f"MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE: sum={total!r}, expected 1.0 (tolerance {tolerance})")
