"""Soak-test degradation-detection arithmetic -- deterministic compute, backing ``devops_sre.soak_test``.

Atlas's own formula (F19 tool table, L855: "持續負載→memory/resource
leak→degradation") asks a COMPARISON question between the first and
last of a time-ordered measurement series held at one constant load:
did latency grow, did the error rate grow, and which resources grew
their own utilization beyond a caller-supplied budget? Same Trusted
Compute discipline every prior genuine-compute module in this package
already established -- the function here is pure, comparing exactly
two already-validated measurements (the caller's own first and last
samples), hand-verified against known cases (see this module's own
unit tests) before ``ai_lego/modules/devops_sre/soak_test.py`` calls
it.

Deliberately does NOT consume any intermediate sample -- see the method
contract's own compilation_decisions and OQ-SOAKTEST-2 for why a
first-vs-last delta was chosen over an invented trend/regression
statistic.

Uses ``decimal.Decimal`` for every increase computed here (latency,
error rate, each resource's own utilization), not raw ``float``
subtraction -- caught during this module's own first draft, before any
critic review, by a boundary test whose two inputs were 0.10 apart:
``0.40 - 0.30`` is ``0.10000000000000003`` in raw Python ``float``,
which silently exceeds a threshold of exactly ``0.10`` and would flag a
resource as leaking that had not moved beyond its own stated budget.
Same honest limit every prior ``Decimal``-using compute module in this
package already discloses: because this module's own public signature
accepts ``float`` parameters, ``Decimal`` here does not protect against
precision already lost before a value arrives -- it protects against
the ACCUMULATED subtraction error a boundary-exact caller-supplied
threshold can otherwise trip on.
"""

from __future__ import annotations

import math
from decimal import Decimal, DecimalException
from typing import Any


def _increase(later: float, earlier: float) -> float:
    """``later - earlier`` via ``Decimal``, returned as ``float`` -- see this module's own docstring for why."""
    try:
        result = Decimal(str(later)) - Decimal(str(earlier))
    except DecimalException as error:
        raise ValueError(f"SOAKTEST_ANALYSIS_OVERFLOW: could not compute an increase for later={later!r}, earlier={earlier!r}: {error}") from error
    result_float = float(result)
    if not math.isfinite(result_float):
        raise ValueError(f"SOAKTEST_ANALYSIS_OVERFLOW: increase is not finite ({result_float!r}) for later={later!r}, earlier={earlier!r}")
    return result_float


def detect_degradation(first: dict[str, Any], last: dict[str, Any], thresholds: dict[str, Any]) -> dict[str, Any]:
    """Atlas's own 'observe degradation' formula step: compares ``first`` (samples[0].measurement) against
    ``last`` (samples[-1].measurement) -- both already-validated load measurements sharing the SAME resource
    name set -- against ``thresholds`` (latency_p95_increase_ms_max/error_rate_increase_max/
    resource_increase_max). Returns ``{"latency_degraded": bool, "error_rate_degraded": bool,
    "degraded_resources": sorted [str], "overall_degraded": bool}``.

    ``degraded_resources`` names every resource whose own utilization INCREASED by more than
    ``resource_increase_max`` -- an INCREASE, not an absolute level (see method contract compilation_decisions
    on why a resource already busy at t=0 that stays flat is not a leak). Sorted so the result is
    deterministic regardless of the caller's own dict insertion order.

    ``first``/``last`` are assumed already validated by the caller's own shared predicates (same resource-name
    KEY SET on both sides) -- this function iterates ``first``'s own keys and looks each up in ``last``, so a
    caller violating that precondition directly raises a bare ``KeyError``, not a domain exception; the
    runtime module's own gate never reaches that path because it re-validates resource-set uniformity first.
    """
    if not isinstance(first, dict) or not isinstance(last, dict):
        raise ValueError(f"SOAKTEST_ANALYSIS_INVALID_MEASUREMENT: first/last must both be dicts, got {first!r}/{last!r}")
    if not isinstance(thresholds, dict):
        raise ValueError(f"SOAKTEST_ANALYSIS_INVALID_THRESHOLDS: thresholds must be a dict, got {thresholds!r}")
    for key in ("latency_p95_increase_ms_max", "error_rate_increase_max", "resource_increase_max"):
        value = thresholds.get(key)
        if not (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0):
            raise ValueError(f"SOAKTEST_ANALYSIS_INVALID_THRESHOLDS: {key} must be a finite number >= 0, got {value!r}")

    latency_increase = _increase(last["latency_p95_ms"], first["latency_p95_ms"])
    error_rate_increase = _increase(last["error_rate"], first["error_rate"])
    latency_degraded = latency_increase > thresholds["latency_p95_increase_ms_max"]
    error_rate_degraded = error_rate_increase > thresholds["error_rate_increase_max"]

    degraded_resources = sorted(
        name
        for name in first["resource_utilization"]
        if _increase(last["resource_utilization"][name], first["resource_utilization"][name]) > thresholds["resource_increase_max"]
    )

    overall_degraded = latency_degraded or error_rate_degraded or bool(degraded_resources)
    return {
        "latency_degraded": latency_degraded,
        "error_rate_degraded": error_rate_degraded,
        "degraded_resources": degraded_resources,
        "overall_degraded": overall_degraded,
    }
