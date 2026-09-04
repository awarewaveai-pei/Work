"""Consecutive-threshold trigger evaluation -- deterministic compute, backing ``learning.reversal_criteria``.

Same Trusted Compute discipline every other ``ai_lego/compute/`` module
this session built already established: whether a rule fires is DECIDED
here, by real comparison logic against real observations, never asserted.
Atlas §11.33's own worked example ("> 300 USD for 3 consecutive months")
is the literal shape this module evaluates.
"""

from __future__ import annotations

import operator as operator_module
from typing import Callable

from ai_lego.errors import InvariantViolation

_COMPARISONS: dict[str, Callable[[float, float], bool]] = {
    ">": operator_module.gt,
    "<": operator_module.lt,
    ">=": operator_module.ge,
    "<=": operator_module.le,
    "==": operator_module.eq,
}

VALID_OPERATORS = frozenset(_COMPARISONS)


def consecutive_threshold_triggered(observations: list[float], op: str, threshold: float, consecutive_periods: int) -> bool:
    """True iff the LAST ``consecutive_periods`` observations (chronological order, most recent last) ALL satisfy
    ``value <op> threshold``. Atlas's own worked example: '> 300 USD for 3 consecutive months' is exactly
    ``consecutive_threshold_triggered(observations, ">", 300, 3)``.

    Fewer observations than ``consecutive_periods`` available -> False (not enough history to confirm the trend,
    never assumed true)."""
    if op not in _COMPARISONS:
        raise InvariantViolation(f"TRIGGER_UNKNOWN_OPERATOR: {op!r} not one of {sorted(VALID_OPERATORS)}")
    if consecutive_periods < 1:
        raise InvariantViolation(f"TRIGGER_INVALID_CONSECUTIVE_PERIODS: {consecutive_periods} (must be >= 1)")
    if len(observations) < consecutive_periods:
        return False
    window = observations[-consecutive_periods:]
    comparison = _COMPARISONS[op]
    return all(comparison(value, threshold) for value in window)
