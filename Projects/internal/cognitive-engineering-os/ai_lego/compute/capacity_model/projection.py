"""Capacity projection arithmetic -- deterministic compute, backing ``devops_sre.capacity_model``.

Atlas's own formula (F19 tool table, L852: "workload->growth->resource
coefficients->headroom") is the whole shape of this method: a current
workload compounds forward by a growth rate over some number of
periods, the projected workload implies a required resource quantity
via a per-unit coefficient, and comparing that against currently
provisioned capacity yields a headroom ratio. Same Trusted Compute
discipline every prior genuine-compute module in this package already
established -- the two functions here are pure arithmetic, hand-
verified against known cases (see this module's own unit tests) before
``ai_lego/modules/devops_sre/capacity_model.py`` calls them.

Uses ``decimal.Decimal`` for the compounding and division steps, not
raw ``float`` arithmetic. NOTE the honest limit this buys, given this
module's own public signature accepts ``float`` parameters (not the
``str`` parameters ``ai_lego.compute.reconciliation.compare`` accepts
specifically to preserve arbitrary-precision input): any precision
beyond a Python ``float``'s own 53-bit mantissa is already lost before
this module ever sees the value, so ``Decimal`` here does NOT protect
against the huge-integer class of bug a critic review caught in
``database_data.reconciliation``'s own first draft (values this large
are not a realistic capacity-planning magnitude in the first place --
workload counts and resource coefficients live in normal operational
ranges, never anywhere near 2^53). What ``Decimal`` DOES buy here:
numerically stable compounding across many periods and an exact
division at the end, avoiding the small but real ACCUMULATED rounding
error repeated ``float`` multiplication/division can introduce -- a
narrower, still genuine benefit, not the same guarantee as the
string-input design.

A critic review of this module's first draft found: (1) every
``isinstance`` guard was missing except ``periods_ahead``'s own,
so a non-numeric ``resource_name``/``current_workload``/etc. escaped
as a raw ``AttributeError``/``TypeError`` instead of failing closed --
the exact bug class two immediately-prior slices had already fixed
elsewhere in this package; (2) ``Decimal.__pow__`` can raise
``decimal.Overflow`` for a large-but-schema-legal ``periods_ahead``
(the ``try`` block only caught ``InvalidOperation``, and the
exponentiation itself was OUTSIDE that block); (3) neither function
checked its own OUTPUT for finiteness, so an in-range input could
still produce a silent ``inf``/``-inf`` result. All three fixed below.
"""

from __future__ import annotations

import math
from decimal import Decimal, DecimalException

from ai_lego.errors import InvariantViolation


def _is_real_number(value: object) -> bool:
    """``bool`` is a subclass of ``int`` in Python -- excluded explicitly, the same guard
    ``periods_ahead``'s own check already used, now applied to every numeric parameter this module accepts."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def project_workload(current_workload: float, growth_rate_per_period: float, periods_ahead: int) -> float:
    """Atlas's own 'workload->growth' step: compound ``current_workload`` forward by
    ``growth_rate_per_period`` for ``periods_ahead`` periods -- ``current_workload * (1 + growth_rate_per_period)
    ** periods_ahead``, computed via ``Decimal`` for exactness.

    ``current_workload`` must be finite and >= 0 (a workload cannot be negative). ``growth_rate_per_period``
    must be finite and strictly greater than -1 (a period-over-period SHRINK of 100% or more is not a
    representable multiplicative rate -- it would drive the projection to zero or negative, which is not a
    legitimate workload). ``periods_ahead`` must be a non-negative integer (projecting a negative number of
    periods into the future is not a well-defined question this formula answers).
    """
    if not (isinstance(periods_ahead, int) and not isinstance(periods_ahead, bool) and periods_ahead >= 0):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_PERIODS: periods_ahead must be a non-negative integer, got {periods_ahead!r}")
    if not (_is_real_number(current_workload) and math.isfinite(current_workload) and current_workload >= 0):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_WORKLOAD: current_workload must be a finite number >= 0, got {current_workload!r}")
    if not (_is_real_number(growth_rate_per_period) and math.isfinite(growth_rate_per_period) and growth_rate_per_period > -1):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_GROWTH_RATE: growth_rate_per_period must be finite and > -1, got {growth_rate_per_period!r}")
    try:
        workload = Decimal(str(current_workload))
        rate = Decimal(str(growth_rate_per_period))
        projected = workload * (Decimal(1) + rate) ** periods_ahead
    except DecimalException as error:
        raise InvariantViolation(f"CAPACITYMODEL_PROJECTION_OVERFLOW: could not compute a projection for current_workload={current_workload!r}, growth_rate_per_period={growth_rate_per_period!r}, periods_ahead={periods_ahead!r}: {error}") from error
    result = float(projected)
    if not math.isfinite(result):
        raise InvariantViolation(f"CAPACITYMODEL_PROJECTION_OVERFLOW: projected workload is not finite ({result!r}) for current_workload={current_workload!r}, growth_rate_per_period={growth_rate_per_period!r}, periods_ahead={periods_ahead!r}")
    return result


def compute_headroom_ratio(projected_workload: float, resource_coefficient: float, current_capacity: float) -> dict[str, float]:
    """Atlas's own 'resource coefficients->headroom' step: ``required_resources = projected_workload *
    resource_coefficient``, then ``headroom_ratio = (current_capacity - required_resources) / current_capacity``.

    A positive ``headroom_ratio`` means capacity exceeds the projected requirement by that fraction (e.g. 0.2
    means 20% spare capacity); zero means exactly enough; negative means the projected requirement EXCEEDS
    current capacity (a real capacity risk). ``resource_coefficient`` must be finite and > 0 (a non-positive
    coefficient is not a legitimate per-unit resource requirement). ``current_capacity`` must be finite and >
    0 (dividing by a zero or negative capacity is not a well-defined ratio).
    """
    if not (_is_real_number(projected_workload) and math.isfinite(projected_workload) and projected_workload >= 0):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_PROJECTED_WORKLOAD: projected_workload must be a finite number >= 0, got {projected_workload!r}")
    if not (_is_real_number(resource_coefficient) and math.isfinite(resource_coefficient) and resource_coefficient > 0):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_COEFFICIENT: resource_coefficient must be a finite number > 0, got {resource_coefficient!r}")
    if not (_is_real_number(current_capacity) and math.isfinite(current_capacity) and current_capacity > 0):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_CAPACITY: current_capacity must be a finite number > 0, got {current_capacity!r}")
    try:
        workload = Decimal(str(projected_workload))
        coefficient = Decimal(str(resource_coefficient))
        capacity = Decimal(str(current_capacity))
        required = workload * coefficient
        headroom_ratio = (capacity - required) / capacity
    except DecimalException as error:
        raise InvariantViolation(f"CAPACITYMODEL_HEADROOM_OVERFLOW: could not compute headroom for projected_workload={projected_workload!r}, resource_coefficient={resource_coefficient!r}, current_capacity={current_capacity!r}: {error}") from error
    required_float = float(required)
    headroom_float = float(headroom_ratio)
    if not (math.isfinite(required_float) and math.isfinite(headroom_float)):
        raise InvariantViolation(f"CAPACITYMODEL_HEADROOM_OVERFLOW: required_resources/headroom_ratio not finite ({required_float!r}/{headroom_float!r})")
    return {"required_resources": required_float, "headroom_ratio": headroom_float}
