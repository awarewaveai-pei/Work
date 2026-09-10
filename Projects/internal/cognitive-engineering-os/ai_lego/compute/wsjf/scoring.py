"""WSJF (Weighted Shortest Job First) prioritization -- deterministic compute, backing ``decision.wsjf``.

Same Trusted Compute discipline every prior genuine-compute module in this
package establishes (``compute/rice/scoring.py``, ``compute/mcda/scoring.py``,
``compute/ahp/weights.py``): the formula is DECIDED here, by a real
deterministic function, never asserted by an LLM or trusted as a
caller-supplied stored value.

Atlas F16 tool table (L764) cites "Cost of Delay / Job Size" -- the method's
ONLY citation, no field-level shape. Cost of Delay is modeled as the
3-factor SAFe-convention sum (business_value + time_criticality +
risk_reduction_opportunity_enablement) -- external convention, disclosed as
such, not Atlas-invented; see ``ai_lego/modules/decision/wsjf.py``'s own
module docstring for the full due-diligence record, including why this is a
SUM-over-divisor shape, distinct from ``decision.rice``'s own
PRODUCT-over-divisor shape (``compute/rice/scoring.py::compute_rice_score``)
despite both being ratio methods with a size/effort-like divisor.

Two functions, not one: ``compute_cost_of_delay`` is a real, independently
re-derivable step in its own right (not just an internal helper) because the
intermediate sum being genuinely computed and later gate-verified is the
concrete mechanism that satisfies Atlas's own cited benefit for this row
("突出延遲成本" -- spotlight/foreground cost of delay); collapsing straight
to one ratio would make Cost of Delay just as opaque as any other value/cost
heuristic.
"""

from __future__ import annotations

import math

from ai_lego.errors import InvariantViolation

_COST_OF_DELAY_FACTORS = ("business_value", "time_criticality", "risk_reduction_opportunity_enablement")


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compute_cost_of_delay(business_value: float, time_criticality: float, risk_reduction_opportunity_enablement: float) -> float:
    """``business_value + time_criticality + risk_reduction_opportunity_enablement`` -- the external
    SAFe-convention 3-factor Cost of Delay sum (disclosed, not Atlas-cited; Atlas L764 names only the
    aggregate "Cost of Delay", not its sub-factors). Computed fresh every call (GENUINE compute), same
    "never a stored/asserted field" discipline ``compute_wsjf_score`` below and
    ``ai_lego/modules/decision/wsjf.py::evaluate_wsjf_genuine_compute_gate`` both already apply to it: the
    gate re-invokes this SAME function against a record's own raw stored sub-factors and compares the
    result to whatever ``cost_of_delay_total`` the record claims, rather than ever trusting that stored
    value. Each factor is REJECTED (not floored/clamped) if negative or non-finite."""
    values = (business_value, time_criticality, risk_reduction_opportunity_enablement)
    for name, value in zip(_COST_OF_DELAY_FACTORS, values):
        if not _is_finite_number(value):
            raise InvariantViolation(f"WSJF_INVALID_{name.upper()}: must be a finite number, got {value!r}")
        if value < 0:
            raise InvariantViolation(f"WSJF_NEGATIVE_{name.upper()}: must be >= 0, got {value!r}")
    result = business_value + time_criticality + risk_reduction_opportunity_enablement
    if not math.isfinite(result):
        # Every individual factor above already passed a finite/range check, but their SUM can still overflow
        # float64 at extreme magnitudes (e.g. three ~1e308 factors). Rejected here explicitly rather than
        # silently emitted as a non-JSON-representable Infinity.
        raise InvariantViolation(
            f"WSJF_COST_OF_DELAY_OVERFLOW: computed cost_of_delay is not finite ({result!r}) from "
            f"business_value={business_value!r}, time_criticality={time_criticality!r}, "
            f"risk_reduction_opportunity_enablement={risk_reduction_opportunity_enablement!r}"
        )
    return round(result, 8)


def compute_wsjf_score(business_value: float, time_criticality: float, risk_reduction_opportunity_enablement: float, job_size: float) -> float:
    """``compute_cost_of_delay(...) / job_size`` -- Atlas F16 table (L764)'s own cited formula, computed
    fresh every call. Job Size is a DIVISOR -- the one genuine numerical-stability invariant this formula
    has that mirrors ``decision.rice``'s own Effort divisor: division by a non-positive job_size is
    undefined (zero) or sign-inverting (negative), so it is REJECTED explicitly, never silently floored to
    a small epsilon (a silent floor would let an unrealistically-tiny size estimate produce an artificially
    inflated score with no visible trace that a floor was ever applied)."""
    cost_of_delay = compute_cost_of_delay(business_value, time_criticality, risk_reduction_opportunity_enablement)
    if not _is_finite_number(job_size):
        raise InvariantViolation(f"WSJF_INVALID_JOB_SIZE: must be a finite number, got {job_size!r}")
    if job_size <= 0:
        raise InvariantViolation(f"WSJF_NONPOSITIVE_JOB_SIZE: job_size must be > 0 (division by zero/negative is undefined), got {job_size!r}")
    result = cost_of_delay / job_size
    if not math.isfinite(result):
        # cost_of_delay is already finite (compute_cost_of_delay's own overflow check) and job_size is
        # already a finite positive number, but the DIVISION can still overflow float64 when job_size is
        # extremely small relative to cost_of_delay -- rejected here explicitly, same class of
        # combination-overflow ``compute_rice_score`` already guards for its own multiply/divide chain.
        raise InvariantViolation(
            f"WSJF_SCORE_OVERFLOW: computed wsjf_score is not finite ({result!r}) from cost_of_delay={cost_of_delay!r}, job_size={job_size!r}"
        )
    return round(result, 8)
