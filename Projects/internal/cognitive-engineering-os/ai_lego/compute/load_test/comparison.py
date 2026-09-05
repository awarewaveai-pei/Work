"""Load-test comparison arithmetic -- deterministic compute, backing ``devops_sre.load_test``.

Atlas's own formula (F19 tool table, L853: "baseline->target
load->latency/errors/resources") is a COMPARISON of two measurements:
how much p95 latency moved relative to the baseline, how much the error
rate moved, and which resource is most saturated at the target load
(the benefit column's own "find the performance bottleneck"). Same
Trusted Compute discipline every prior genuine-compute module in this
package already established -- the two functions here are pure
arithmetic, hand-verified against known cases (see this module's own
unit tests) before ``ai_lego/modules/devops_sre/load_test.py`` calls
them.

Uses ``decimal.Decimal`` for the ratio and the delta so that e.g.
``0.004 - 0.001`` lands exactly on ``0.003`` rather than the
``0.0030000000000000005`` raw ``float`` subtraction produces -- the same
narrow-but-real benefit ``ai_lego.compute.capacity_model.projection``'s
own module docstring already discloses honestly (this module's public
signature accepts ``float``, so it does NOT protect against precision
already lost before the value arrives).

Every ``isinstance``/finiteness/range guard is applied on ENTRY (bool
excluded from numbers, NaN/inf rejected, ranges enforced) and every
OUTPUT is checked for finiteness -- all three failure classes a critic
review caught in ``projection.py``'s own first draft, applied here from
this module's own first draft.
"""

from __future__ import annotations

import math
from decimal import Decimal, DecimalException
from typing import Any

from ai_lego.errors import InvariantViolation


def _is_real_number(value: object) -> bool:
    """``bool`` is a subclass of ``int`` in Python -- excluded explicitly."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_fraction(value: object) -> bool:
    return _is_real_number(value) and math.isfinite(value) and 0 <= value <= 1


def compare_load_measurements(
    baseline_latency_p95_ms: float,
    target_latency_p95_ms: float,
    baseline_error_rate: float,
    target_error_rate: float,
) -> dict[str, float]:
    """Atlas's own 'latency/errors' observations compared across 'baseline->target load':
    ``latency_ratio = target_latency_p95_ms / baseline_latency_p95_ms`` and
    ``error_rate_delta = target_error_rate - baseline_error_rate``, both via ``Decimal``.

    Both latencies must be finite and STRICTLY positive (the baseline is a divisor; a zero or negative p95 is
    not a real latency). Both error rates must be finite fractions in [0, 1].
    """
    if not (_is_real_number(baseline_latency_p95_ms) and math.isfinite(baseline_latency_p95_ms) and baseline_latency_p95_ms > 0):
        raise InvariantViolation(f"LOADTEST_INVALID_LATENCY: baseline_latency_p95_ms must be a finite number > 0, got {baseline_latency_p95_ms!r}")
    if not (_is_real_number(target_latency_p95_ms) and math.isfinite(target_latency_p95_ms) and target_latency_p95_ms > 0):
        raise InvariantViolation(f"LOADTEST_INVALID_LATENCY: target_latency_p95_ms must be a finite number > 0, got {target_latency_p95_ms!r}")
    if not _is_fraction(baseline_error_rate):
        raise InvariantViolation(f"LOADTEST_INVALID_ERROR_RATE: baseline_error_rate must be a finite fraction in [0, 1], got {baseline_error_rate!r}")
    if not _is_fraction(target_error_rate):
        raise InvariantViolation(f"LOADTEST_INVALID_ERROR_RATE: target_error_rate must be a finite fraction in [0, 1], got {target_error_rate!r}")
    try:
        ratio = Decimal(str(target_latency_p95_ms)) / Decimal(str(baseline_latency_p95_ms))
        delta = Decimal(str(target_error_rate)) - Decimal(str(baseline_error_rate))
    except DecimalException as error:
        raise InvariantViolation(f"LOADTEST_COMPARISON_OVERFLOW: could not compare baseline/target ({baseline_latency_p95_ms!r}, {target_latency_p95_ms!r}, {baseline_error_rate!r}, {target_error_rate!r}): {error}") from error
    ratio_float = float(ratio)
    delta_float = float(delta)
    if not (math.isfinite(ratio_float) and math.isfinite(delta_float)):
        raise InvariantViolation(f"LOADTEST_COMPARISON_OVERFLOW: latency_ratio/error_rate_delta not finite ({ratio_float!r}/{delta_float!r})")
    return {"latency_ratio": ratio_float, "error_rate_delta": delta_float}


def find_bottleneck(target_resource_utilization: dict[str, Any]) -> dict[str, Any]:
    """Atlas's own benefit column ('find the performance bottleneck'): the resource with the HIGHEST utilization
    fraction at target load. Ties resolve to the lexicographically smallest resource name -- deterministic, so
    an independent recomputation (the gate) reproduces the builder's own answer regardless of dict insertion
    order (see the method contract's own compilation_decisions).

    ``target_resource_utilization`` must be a non-empty mapping of non-empty string names to finite fractions in
    [0, 1].
    """
    if not isinstance(target_resource_utilization, dict) or not target_resource_utilization:
        raise InvariantViolation(f"LOADTEST_INVALID_UTILIZATION: resource_utilization must be a non-empty mapping, got {target_resource_utilization!r}")
    for name, value in target_resource_utilization.items():
        if not (isinstance(name, str) and name.strip()):
            raise InvariantViolation(f"LOADTEST_INVALID_UTILIZATION: resource name must be a non-empty string, got {name!r}")
        if not _is_fraction(value):
            raise InvariantViolation(f"LOADTEST_INVALID_UTILIZATION: utilization for {name!r} must be a finite fraction in [0, 1], got {value!r}")
    # max() over (utilization, name) would pick the LARGEST name on ties; sort by (-utilization, name) instead so
    # the tie-break is the SMALLEST name, as the contract states.
    resource, utilization = sorted(target_resource_utilization.items(), key=lambda item: (-item[1], item[0]))[0]
    return {"resource": resource, "utilization": utilization}
