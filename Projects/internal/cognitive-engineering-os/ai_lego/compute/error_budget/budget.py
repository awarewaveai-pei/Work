"""Error budget arithmetic -- deterministic compute, backing ``devops_sre.error_budget``.

Atlas §11.40's own formula (F19 tool table, L851: "1-SLO→budget→burn
rate→release policy") is the whole shape of this method: an SLO target
implies an allowed failure budget, an observed failure rate burns that
budget at some rate, and the burn rate gates release policy. Same Trusted
Compute discipline every prior genuine-compute module in this package
already established (Master Plan §39: an LLM must never "mentally
calculate" a value and label it CALCULATED_RESULT) -- the two functions
here are pure arithmetic, hand-verified against known cases (see this
module's own unit tests) before ``ai_lego/modules/devops_sre/error_budget
.py`` calls them.

Both return values are rounded (12 / 10 decimal places respectively) --
same float-noise discipline ``ai_lego/compute/pareto/ranking.py``'s own
``round(share, 8)`` already established for this class of problem.
Real execution surfaced why this matters here specifically: Atlas's own
worked example (§11.40 L2151, SLO 99.9% -> 0.1% budget) computed
UNROUNDED lands burn_rate at ``0.9999999999999991`` for an
exactly-consumed budget -- just under the ``>= 1.0`` exhaustion
threshold this module exists to compute, silently defeating the one
invariant the caller relies on it for. Rounding first is not cosmetic.
"""

from __future__ import annotations

import math

from ai_lego.errors import InvariantViolation


def calculate_error_budget_ratio(slo_target_ratio: float) -> float:
    """Atlas L851 step 1: ``1 - SLO``, rounded to 12 decimal places to absorb float noise.

    ``slo_target_ratio`` must be strictly between 0 and 1. A target of
    exactly 1.0 (100%) would yield a zero budget -- an unrepresentable
    "any single failure exhausts it instantly" edge case this function
    refuses outright. The rounded result is also re-checked against the
    same (0, 1) bound: an SLO target with enough nines of precision that
    ``1 - slo_target_ratio`` rounds to exactly 0.0 (verified: 13+ nines)
    is refused rather than silently returning a zero budget that would
    make every downstream ``calculate_burn_rate`` call divide by zero.
    """
    if not (0 < slo_target_ratio < 1):
        raise InvariantViolation(f"ERRORBUDGET_SLO_OUT_OF_RANGE: slo_target_ratio must be strictly between 0 and 1, got {slo_target_ratio!r}")
    ratio = round(1 - slo_target_ratio, 12)
    if not (0 < ratio < 1):
        raise InvariantViolation(f"ERRORBUDGET_SLO_OUT_OF_RANGE: slo_target_ratio {slo_target_ratio!r} produced a degenerate error_budget_ratio {ratio!r} after rounding (too many nines of precision to represent as a non-zero budget)")
    return ratio


def calculate_burn_rate(observed_failure_rate: float, error_budget_ratio: float) -> float:
    """Atlas L851 steps 2-3: budget -> burn rate, rounded to 10 decimal places to absorb float noise.

    ``burn_rate`` is the observed failure rate expressed as a fraction of
    the allowed budget: 1.0 means the budget is exactly fully consumed,
    values above 1.0 mean it has been exceeded, values below 1.0 mean
    budget remains. Both arguments are required to be finite: NaN/inf are
    realistic outputs of a ``failures / total`` metrics pipeline with a
    degenerate denominator, not contrived inputs, and neither is a
    legitimate rate.
    """
    if not math.isfinite(observed_failure_rate) or observed_failure_rate < 0:
        raise InvariantViolation(f"ERRORBUDGET_INVALID_FAILURE_RATE: observed_failure_rate must be a finite number >= 0, got {observed_failure_rate!r}")
    if not (math.isfinite(error_budget_ratio) and error_budget_ratio > 0):
        raise InvariantViolation(f"ERRORBUDGET_ZERO_BUDGET: error_budget_ratio must be a finite number > 0, got {error_budget_ratio!r}")
    return round(observed_failure_rate / error_budget_ratio, 10)
