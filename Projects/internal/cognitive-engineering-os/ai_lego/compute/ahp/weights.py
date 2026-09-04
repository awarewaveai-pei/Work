"""Analytic Hierarchy Process (Saaty 1980) -- deterministic compute, backing ``decision.ahp``.

Same Trusted Compute discipline ``compute/statistics/reliability.py``,
``compute/pareto/ranking.py`` and ``compute/graph/dag.py`` already
established: pairwise-comparison weight derivation and consistency
checking are DECIDED here, by real published methodology, never asserted.

Weight derivation uses the normalized row-geometric-mean method (a
standard, textbook-valid AHP weight-derivation technique, simpler than
principal-eigenvector computation and equivalent to it for small,
reasonably-consistent matrices) rather than power-iteration eigenvector
estimation -- Atlas §11.31 names the pipeline stage ("Weight calculation")
but not a specific numerical method, so the simpler, exactly-reproducible
technique is used and disclosed as such (same class of methodology choice
``compute/statistics/reliability.py``'s own docstring makes for its
percentile-bootstrap Kappa confidence interval).

The consistency-ratio threshold (CR <= 0.10) is Saaty's own published
acceptance criterion, the same class of external-methodology citation
``landis_koch_band`` already uses for Kappa interpretation -- not invented
by this codebase, and not itself asserted by Atlas (which names the
"Consistency Ratio" pipeline stage, L1925, but not the numeric threshold).
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

# Saaty's Random Index (RI) table, published values for a fully-random matrix of order n (n=1..10).
# n=1,2 are always perfectly consistent (RI=0) -- one or two criteria admit no inconsistency to measure.
RANDOM_INDEX: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}
CONSISTENCY_RATIO_THRESHOLD = 0.10


def build_pairwise_matrix(criteria_ids: list[str], comparisons: list[dict[str, Any]]) -> list[list[float]]:
    """``comparisons``: ``[{criterion_a_id, criterion_b_id, value}, ...]`` -- Saaty 1-9 scale, ``value`` = how many
    times more important ``criterion_a_id`` is than ``criterion_b_id``. Exactly one direction per pair is required;
    the reciprocal is derived, never separately supplied (a caller providing an inconsistent reciprocal would
    silently corrupt the matrix)."""
    n = len(criteria_ids)
    if n < 2:
        raise InvariantViolation("AHP_TOO_FEW_CRITERIA: at least 2 criteria required for a pairwise comparison")
    index = {criterion_id: i for i, criterion_id in enumerate(criteria_ids)}
    matrix = [[1.0] * n for _ in range(n)]
    seen_pairs: set[frozenset[str]] = set()
    for comparison in comparisons:
        a, b, value = comparison["criterion_a_id"], comparison["criterion_b_id"], comparison["value"]
        if a not in index or b not in index:
            raise InvariantViolation(f"AHP_UNKNOWN_CRITERION: comparison references {a!r}/{b!r} not in {criteria_ids}")
        if a == b:
            raise InvariantViolation(f"AHP_SELF_COMPARISON: {a!r} compared to itself")
        if not (1 / 9 <= value <= 9):
            raise InvariantViolation(f"AHP_VALUE_OUT_OF_SAATY_SCALE: {value} for {a}/{b} (must be in [1/9, 9])")
        pair = frozenset((a, b))
        if pair in seen_pairs:
            raise InvariantViolation(f"AHP_DUPLICATE_COMPARISON: {a!r}/{b!r} supplied more than once")
        seen_pairs.add(pair)
        i, j = index[a], index[b]
        matrix[i][j] = value
        matrix[j][i] = 1 / value
    expected_pairs = n * (n - 1) // 2
    if len(seen_pairs) != expected_pairs:
        raise InvariantViolation(f"AHP_INCOMPLETE_COMPARISONS: {len(seen_pairs)} of {expected_pairs} required pairwise comparisons supplied")
    return matrix


def geometric_mean_weights(matrix: list[list[float]]) -> list[float]:
    """Normalized row-geometric-mean weight derivation. See module docstring for why this method, not eigenvector
    power iteration, was chosen."""
    n = len(matrix)
    row_geomeans = [pow(_product(row), 1.0 / n) for row in matrix]
    total = sum(row_geomeans)
    return [value / total for value in row_geomeans]


def _product(values: list[float]) -> float:
    result = 1.0
    for value in values:
        result *= value
    return result


def consistency_ratio(matrix: list[list[float]], weights: list[float]) -> tuple[float, float, float]:
    """Saaty's own consistency check: ``lambda_max`` approximated from the matrix and its own derived weights
    (``sum_j(column_j) * weight_j``, summed), then ``CI = (lambda_max - n) / (n - 1)``, ``CR = CI / RI[n]``.
    Returns ``(lambda_max, consistency_index, consistency_ratio)``. ``CR`` is ``0.0`` for n in {1, 2} (RI is 0 --
    no inconsistency is measurable with fewer than 3 criteria)."""
    n = len(matrix)
    column_sums = [sum(matrix[i][j] for i in range(n)) for j in range(n)]
    lambda_max = sum(column_sums[j] * weights[j] for j in range(n))
    if n <= 2:
        return lambda_max, 0.0, 0.0
    consistency_index = (lambda_max - n) / (n - 1)
    random_index = RANDOM_INDEX.get(n)
    if random_index is None:
        raise InvariantViolation(f"AHP_RANDOM_INDEX_UNDEFINED: no published Saaty Random Index for {n} criteria (table covers 1-10)")
    return lambda_max, consistency_index, consistency_index / random_index


def rank_options(criteria_weights: dict[str, float], option_scores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """``option_scores``: ``[{option_id, criterion_id, score}, ...]`` (score in [0, 1] per criterion). Returns
    options sorted descending by weighted sum, Atlas §11.31's own 'Option scoring' pipeline stage."""
    totals: dict[str, float] = {}
    for entry in option_scores:
        weight = criteria_weights.get(entry["criterion_id"])
        if weight is None:
            raise InvariantViolation(f"AHP_UNKNOWN_CRITERION_IN_SCORE: {entry['criterion_id']!r} has no derived weight")
        totals[entry["option_id"]] = totals.get(entry["option_id"], 0.0) + weight * entry["score"]
    ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    return [{"option_id": option_id, "weighted_score": round(score, 8)} for option_id, score in ordered]
