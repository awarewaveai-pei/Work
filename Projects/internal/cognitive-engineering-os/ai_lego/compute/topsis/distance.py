"""TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution, Hwang & Yoon 1981) --
deterministic compute, backing ``decision.topsis``.

Same Trusted Compute discipline every prior genuine-compute module in this
package establishes (``compute/mcda/scoring.py``, ``compute/ahp/weights.py``,
``compute/rice/scoring.py``): ideal/anti-ideal points and the closeness
coefficient are DECIDED here, by a real deterministic algorithm, never
asserted by an LLM or trusted as a caller-supplied stored value.

Atlas F16 tool table (L769) cites the pipeline "normalize→ideal points→
distance" -- three stages, no worked formula. This module implements stages
2-3 (ideal points, distance); stage 1 (normalize) REUSES
``ai_lego.compute.mcda.scoring.normalize_scores`` UNCHANGED, not
reimplemented here -- see ``ai_lego/modules/decision/topsis.py``'s own
module docstring for the full due-diligence trail against ``decision.mcda``.

DISCLOSED METHODOLOGY CHOICE: classic TOPSIS (Hwang & Yoon 1981) normalizes
via VECTOR normalization (``r_ij = x_ij / sqrt(sum_i x_ij^2)``), not min-max.
This implementation reuses ``normalize_scores``'s direction-aware MIN-MAX
normalization instead -- a deliberate substitution, not an oversight: Atlas's
own L769 citation names no specific normalization technique (same "table row
names the stage, not the formula" situation ``decision.rice``'s own module
docstring already establishes for its own citation), and reusing MCDA's
existing, already-hand-verified, direction-aware normalization avoids a
SECOND independent implementation of "maximize vs minimize" semantics inside
this package (one clear owner per concern). The real, useful consequence:
because ``normalize_scores`` already flips a minimize criterion so a higher
normalized_value is always better, every function below can treat "higher is
better" as UNIVERSALLY true post-normalization -- the positive ideal is
always the per-criterion MAX and the negative ideal always the per-criterion
MIN of the WEIGHTED normalized value, with no per-criterion direction branch
anywhere in this module. This is mathematically equivalent to classic
TOPSIS's own direction-aware ideal-point selection (max for a benefit
criterion / min for a cost criterion) applied BEFORE a direction flip -- same
destination, disclosed different route. Weights are applied BEFORE ideal
points and distances are computed (the "weighted normalized matrix" v_ij =
w_j * r_ij), matching classic TOPSIS's own methodology, not this package's
own choice (see method contract compilation_decisions).

HAND-VERIFIED (see ``tests/unit/test_topsis.py``'s own
``ComputeLayerTests.test_hand_verified_three_option_two_criterion_example``
and ``ai_lego/apps/cli/run_topsis_slice.py``, which runs the identical
scenario live): a 3-option, 2-criterion (COST minimize, QUALITY maximize)
vendor-selection scenario, weights COST=0.6/QUALITY=0.4, worked by hand to
closeness_coefficient = {V1: 0.6, V2: 0.5, V3: 0.4} before being wired in
here:

    normalized: V1=(COST 1.0, QUALITY 0.0), V2=(0.5, 0.5), V3=(0.0, 1.0)
    weighted:   V1=(0.6, 0.0), V2=(0.3, 0.2), V3=(0.0, 0.4)
    ideal (max per criterion): (COST 0.6, QUALITY 0.4)
    anti-ideal (min per criterion): (COST 0.0, QUALITY 0.0)
    V1: dist_ideal=sqrt(0^2+0.4^2)=0.4, dist_anti=sqrt(0.6^2+0^2)=0.6, closeness=0.6/1.0=0.6
    V2: dist_ideal=sqrt(0.3^2+0.2^2)=sqrt(0.13), dist_anti=sqrt(0.3^2+0.2^2)=sqrt(0.13), closeness=0.5
        (V2's own weighted vector is exactly the midpoint between the anti-ideal (0,0) and the
        ideal (0.6,0.4) -- a real symmetry check, not a coincidence: (0.3,0.2) = 0.5 * (0.6,0.4))
    V3: dist_ideal=sqrt(0.6^2+0^2)=0.6, dist_anti=sqrt(0^2+0.4^2)=0.4, closeness=0.4/1.0=0.4
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation


def compute_weighted_normalized_values(normalized_scores: list[dict[str, Any]], weights: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """``weighted_value = weight * normalized_value`` per (option_id, criterion_id) -- the "weighted
    normalized matrix" (v_ij) classic TOPSIS computes ideal points and distances against, never the bare
    unweighted ``normalized_value``. ``weights`` is NOT re-validated here (sums-to-1.0/non-negative is
    ``ai_lego.compute.mcda.scoring.validate_weights_sum_to_one``'s own job, already run by the builder
    before this function is ever reached) -- only that every ``normalized_scores`` entry's own
    ``criterion_id`` has a matching weight, so a caller cannot silently drop a criterion's contribution."""
    weight_by_criterion = {entry["criterion_id"]: entry["weight"] for entry in weights}
    result: list[dict[str, Any]] = []
    for entry in normalized_scores:
        criterion_id = entry["criterion_id"]
        weight = weight_by_criterion.get(criterion_id)
        if weight is None:
            raise InvariantViolation(f"TOPSIS_UNKNOWN_CRITERION_IN_WEIGHTS: {criterion_id!r} (from normalized_scores) has no matching weights[] entry")
        result.append({"option_id": entry["option_id"], "criterion_id": criterion_id, "weighted_value": round(weight * entry["normalized_value"], 8)})
    return result


def compute_ideal_points(weighted_values: list[dict[str, Any]], criteria_ids: list[str]) -> list[dict[str, Any]]:
    """Positive ideal (per-criterion MAX of ``weighted_value``) and negative ideal (per-criterion MIN) --
    see module docstring for why no direction parameter is needed here (direction was already absorbed
    upstream by ``normalize_scores``'s own direction-aware flip, before weighting)."""
    by_criterion: dict[str, list[float]] = {}
    for entry in weighted_values:
        by_criterion.setdefault(entry["criterion_id"], []).append(entry["weighted_value"])
    missing = [criterion_id for criterion_id in criteria_ids if not by_criterion.get(criterion_id)]
    if missing:
        raise InvariantViolation(f"TOPSIS_INCOMPLETE_WEIGHTED_VALUES: no weighted_value entries for criteria {missing}")
    return [{"criterion_id": criterion_id, "positive_ideal": max(by_criterion[criterion_id]), "negative_ideal": min(by_criterion[criterion_id])} for criterion_id in criteria_ids]


def compute_topsis_ranking(normalized_scores: list[dict[str, Any]], weights: list[dict[str, Any]], option_ids: list[str], criteria_ids: list[str]) -> dict[str, Any]:
    """Full pipeline stages 2-3: weighted normalized matrix -> ideal points -> per-option Euclidean distance
    -> closeness coefficient. ``closeness_coefficient = distance_to_anti_ideal / (distance_to_ideal +
    distance_to_anti_ideal)`` -- classic TOPSIS's own C_i formula (Hwang & Yoon 1981); higher is better
    (closer to the positive ideal), so ``ranking`` sorts DESCENDING by it, mirroring
    ``decision.mcda``/``decision.ahp``'s own ``ranking[]`` descending-by-score convention.

    ``option_ids``/``criteria_ids`` are explicit parameters, not inferred from ``normalized_scores`` itself
    -- inferring them would let an option with ZERO raw_scores entries silently vanish from the ranking
    instead of being caught (``TOPSIS_INCOMPLETE_SCORES`` below), the same "silent omission is worse than a
    loud failure" reasoning ``root_cause.fault_tree``'s own duplicate-id check already applies to a
    different structural gap.

    This is the SAME function both ``ai_lego.modules.decision.topsis.generate_topsis_analysis`` (builds)
    and ``evaluate_genuine_compute_gate`` (re-derives and compares) call -- one algorithm, never a second,
    drift-prone reimplementation at the gate layer (same discipline ``compute_rice_score``/
    ``compute_prediction_error`` already establish for their own single-stage siblings)."""
    weighted_values = compute_weighted_normalized_values(normalized_scores, weights)
    ideal_points = compute_ideal_points(weighted_values, criteria_ids)
    positive_ideal = {entry["criterion_id"]: entry["positive_ideal"] for entry in ideal_points}
    negative_ideal = {entry["criterion_id"]: entry["negative_ideal"] for entry in ideal_points}

    by_option: dict[str, dict[str, float]] = {}
    for entry in weighted_values:
        by_option.setdefault(entry["option_id"], {})[entry["criterion_id"]] = entry["weighted_value"]

    ranking: list[dict[str, Any]] = []
    for option_id in option_ids:
        values = by_option.get(option_id, {})
        missing_criteria = sorted(set(criteria_ids) - set(values))
        if missing_criteria:
            raise InvariantViolation(f"TOPSIS_INCOMPLETE_SCORES: option {option_id!r} is missing a weighted value for criteria {missing_criteria} (raw_scores must cover every option x every criterion)")
        distance_to_ideal = math.sqrt(sum((values[criterion_id] - positive_ideal[criterion_id]) ** 2 for criterion_id in criteria_ids))
        distance_to_anti_ideal = math.sqrt(sum((values[criterion_id] - negative_ideal[criterion_id]) ** 2 for criterion_id in criteria_ids))
        denominator = distance_to_ideal + distance_to_anti_ideal
        # denominator == 0 only when THIS option's weighted values equal BOTH the positive and negative
        # ideal on every criterion simultaneously -- which (since positive_ideal/negative_ideal are
        # themselves the max/min ACROSS all options) is only possible when every option is tied on every
        # criterion (a fully-degenerate all-identical dataset). 0.5 (equidistant / no discrimination
        # possible), not 0.0 or 1.0 -- same "pick a principled constant for a degenerate case, don't
        # silently zero or crash" discipline ``normalize_scores``'s own hi==lo -> 1.0 convention already
        # establishes for a different degenerate case.
        closeness_coefficient = (distance_to_anti_ideal / denominator) if denominator > 0 else 0.5
        ranking.append(
            {
                "option_id": option_id,
                "distance_to_ideal": round(distance_to_ideal, 8),
                "distance_to_anti_ideal": round(distance_to_anti_ideal, 8),
                "closeness_coefficient": round(closeness_coefficient, 8),
            }
        )
    ranking.sort(key=lambda entry: entry["closeness_coefficient"], reverse=True)
    return {"weighted_normalized_scores": weighted_values, "ideal_points": ideal_points, "ranking": ranking}
