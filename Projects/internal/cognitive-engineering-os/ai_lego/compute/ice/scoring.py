"""ICE (Impact x Confidence x Ease) scoring -- deterministic compute, backing ``decision.ice``.

Same Trusted Compute discipline every prior genuine-compute module this
session established (``compute/ahp/weights.py``, ``compute/mcda/scoring.py``):
the ICE score is DECIDED here, by one real arithmetic formula, never
asserted by an LLM.

Formula: arithmetic mean of Impact/Confidence/Ease, each independently
rated on a 1-10 scale -- Sean Ellis's own published growth-hacking ICE
framework (GrowthHackers.com; later "Hacking Growth", Ellis & Brown,
2017), the standard formulation across secondary product-management
literature. NOT the product (Impact * Confidence * Ease, range 1-1000)
some looser secondary sources also describe -- the mean is the only
formulation consistent with Atlas's own F16 table benefit text for this
row (L761, "統一尺度評分" -- unified-scale scoring: the output must stay
on the SAME 1-10 scale as the 3 inputs, which only the mean, not the
product, satisfies). Disclosed choice, not Atlas-cited verbatim (Atlas
names no numeric scale or formula beyond the 3 factor names) -- same
class of external, non-invented citation ``compute/ahp/weights.py``'s
own Saaty 1980 threshold already uses.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

DIMENSION_MIN = 1.0
DIMENSION_MAX = 10.0
SCORE_TOLERANCE = 1e-6


def is_valid_dimension_score(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``root_cause.fault_tree``'s own ``_is_valid_probability`` uses:
    a bare ``isinstance(value, (int, float))`` would silently accept ``True`` as 1.0, and NaN/inf are not
    valid RFC 8259 JSON and make no sense on a bounded [1, 10] scale."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and DIMENSION_MIN <= value <= DIMENSION_MAX


def compute_ice_score(impact: Any, confidence: Any, ease: Any) -> float:
    """Arithmetic mean of the 3 fixed, named ICE dimensions -- see module docstring for why mean, not
    product. Raises ``ICE_DIMENSION_OUT_OF_RANGE`` on any dimension outside [1, 10] (or non-numeric/bool/
    NaN/inf) rather than silently clamping. Rounded to 8 decimal places, same convention every genuine-
    compute module in this codebase already uses (``compute/mcda/scoring.py``, ``compute/ahp/weights.py``)."""
    for name, value in (("impact", impact), ("confidence", confidence), ("ease", ease)):
        if not is_valid_dimension_score(value):
            raise InvariantViolation(f"ICE_DIMENSION_OUT_OF_RANGE: {name}={value!r} must be a finite, non-boolean number in [{DIMENSION_MIN}, {DIMENSION_MAX}]")
    return round((impact + confidence + ease) / 3.0, 8)


def score_matches(stored_score: Any, impact: Any, confidence: Any, ease: Any, *, tolerance: float = SCORE_TOLERANCE) -> bool:
    """Re-derivation check for the gate layer: recomputes the mean fresh from the 3 raw dimensions and
    compares to whatever ``stored_score`` claims -- never trusts the stored value (the real
    ``ICE_SCORE_MISMATCH`` invariant). Returns ``False`` (never raises) on any malformed stored_score or
    underlying dimension, so a caller's gate can report a clean FAIL instead of crashing -- same fail-closed
    discipline ``root_cause.fault_tree``'s own gate functions already establish."""
    if not isinstance(stored_score, (int, float)) or isinstance(stored_score, bool) or not math.isfinite(stored_score):
        return False
    try:
        recomputed = compute_ice_score(impact, confidence, ease)
    except InvariantViolation:
        return False
    return abs(stored_score - recomputed) <= tolerance
