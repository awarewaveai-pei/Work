"""Monte Carlo simulation -- deterministic, seeded compute, backing ``computation.monte_carlo``.

Same Trusted Compute discipline every prior genuine-compute module this
session established. Uses the same ``random.Random(seed)`` seeded-
pseudo-random-sequence convention ``compute/statistics/reliability.py``'s
own bootstrap confidence interval already established -- "stochastic
subject matter, deterministic COMPUTATION of it" is not a new pattern in
this codebase, just the first time it backs a whole method's own primary
output rather than a confidence-interval side calculation.

Percentiles use the same "nearest-rank on a sorted sample" style
``reliability.py``'s own bootstrap CI already uses (``values[int(fraction
* len(values))]``), not a fully-interpolated estimator -- consistent with,
not a departure from, this codebase's existing percentile convention.
"""

from __future__ import annotations

import random
import statistics
from typing import Any

from ai_lego.errors import InvariantViolation

PERCENTILES = (5, 50, 95)
TAIL_PERCENTILE = 95


def _sample_one(rng: random.Random, distribution_type: str, params: dict[str, Any]) -> float:
    if distribution_type == "normal":
        return rng.gauss(params["mean"], params["std_dev"])
    if distribution_type == "uniform":
        return rng.uniform(params["min"], params["max"])
    if distribution_type == "triangular":
        return rng.triangular(params["min"], params["max"], params["mode"])
    raise InvariantViolation(f"MONTECARLO_UNKNOWN_DISTRIBUTION_TYPE: {distribution_type!r} (must be one of normal, uniform, triangular)")


def _percentile(sorted_values: list[float], p: int) -> float:
    """Nearest-rank percentile on an already-sorted sample -- same style reliability.py's own bootstrap CI uses."""
    index = min(int((p / 100) * len(sorted_values)), len(sorted_values) - 1)
    return sorted_values[index]


def run_simulation(
    input_distributions: list[dict[str, Any]],
    combine_mode: str,
    random_seed: int,
    num_runs: int,
    *,
    success_threshold: float | None = None,
    success_direction: str | None = None,
) -> dict[str, Any]:
    """Draws ``num_runs`` samples from each of ``input_distributions`` (independently -- see method contract's own
    disclosed no-correlation-modeling scope limit), combines them per-run via ``combine_mode`` (only ``sum`` is
    supported in v1), and returns computed summary statistics -- never the raw per-run sample array (see typed-
    object schema's own compilation_decisions for why).

    ``input_distributions``: ``[{id, label, distribution_type, params}, ...]`` -- ``distribution_type`` one of
    ``normal``/``uniform``/``triangular``, ``params`` the type-appropriate parameter dict.
    """
    if combine_mode != "sum":
        raise InvariantViolation(f"MONTECARLO_UNSUPPORTED_COMBINE_MODE: {combine_mode!r} (v1 supports only 'sum', see method contract OQ-MONTECARLO-1)")
    if not input_distributions:
        raise InvariantViolation("MONTECARLO_NO_INPUT_DISTRIBUTIONS: at least 1 required")
    if num_runs < 2:
        raise InvariantViolation(f"MONTECARLO_TOO_FEW_RUNS: {num_runs} (minimum 2 -- a single draw cannot describe a distribution)")
    if (success_threshold is None) != (success_direction is None):
        raise InvariantViolation("MONTECARLO_SUCCESS_CRITERION_INCOMPLETE: success_threshold and success_direction must be supplied together or not at all")
    if success_direction is not None and success_direction not in {"at_least", "at_most"}:
        raise InvariantViolation(f"MONTECARLO_INVALID_SUCCESS_DIRECTION: {success_direction!r} (must be 'at_least' or 'at_most')")

    rng = random.Random(random_seed)
    outcomes: list[float] = []
    for _ in range(num_runs):
        outcomes.append(sum(_sample_one(rng, d["distribution_type"], d["params"]) for d in input_distributions))
    outcomes.sort()

    mean = statistics.fmean(outcomes)
    std_dev = statistics.pstdev(outcomes)
    percentiles = [{"p": p, "value": _percentile(outcomes, p)} for p in PERCENTILES]
    tail_value = _percentile(outcomes, TAIL_PERCENTILE)

    success_probability: float | None = None
    if success_threshold is not None:
        if success_direction == "at_least":
            hits = sum(1 for value in outcomes if value >= success_threshold)
        else:
            hits = sum(1 for value in outcomes if value <= success_threshold)
        success_probability = hits / num_runs

    return {
        "outcome_distribution": {"mean": mean, "std_dev": std_dev, "percentiles": percentiles},
        "tail_risk": {"tail_percentile": TAIL_PERCENTILE, "tail_value": tail_value},
        "success_probability": success_probability,
    }
