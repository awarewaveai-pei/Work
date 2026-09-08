"""RICE prioritization -- deterministic compute, backing ``decision.rice``.

Same Trusted Compute discipline every prior genuine-compute module in this
package establishes (``compute/mcda/scoring.py``, ``compute/ahp/weights.py``,
``compute/pareto/ranking.py``, ``compute/graph/dag.py``): the formula is
DECIDED here, by a real deterministic function, never asserted by an LLM or
trusted as a caller-supplied stored value.

Atlas F16 tool table (L762) and Sec.12.32 (L2955-2966) both cite the SAME
formula: "Reach x Impact x Confidence / Effort". Unlike every other
decision-family compute function in this package (``mcda/scoring.py``'s
``normalize_scores`` + reused ``ahp/weights.py``'s ``rank_options``, both
WEIGHTED-SUM aggregations over an arbitrary number of criteria/options),
this is a fixed 4-factor MULTIPLY-multiply-multiply-DIVIDE formula --
``rank_options`` (ai_lego/compute/ahp/weights.py:102-112) has no division
operator anywhere in its own implementation (a plain
``totals[option_id] += weight * entry["score"]`` accumulate-and-sum loop)
and structurally cannot express Effort as a divisor; see
``ai_lego/modules/decision/rice.py``'s own module docstring for the full
due-diligence record against ``decision.mcda``.
"""

from __future__ import annotations

import math

from ai_lego.errors import InvariantViolation


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compute_rice_score(reach_value: float, impact: float, confidence: float, effort: float) -> float:
    """``(reach_value * impact * confidence) / effort`` -- Atlas F16 table (L762) / Sec.12.32 (L2960)'s own
    cited formula, computed fresh every call (GENUINE compute, never a stored/asserted field --
    ``ai_lego/modules/decision/rice.py::evaluate_rice_genuine_compute_gate`` calls this SAME function
    against a record's own raw fields and compares the result to whatever ``rice_score`` the record
    claims, rather than ever trusting that stored value).

    Effort is a DIVISOR -- the one genuine numerical-stability invariant this formula has that a
    weighted-sum model (``mcda/scoring.py``, ``ahp/weights.py``) structurally cannot: division by a
    non-positive effort is undefined (zero) or sign-inverting (negative), so it is REJECTED explicitly,
    never silently floored to a small epsilon (a silent floor would let an unrealistically-tiny effort
    estimate produce an artificially inflated score with no visible trace that a floor was ever applied)."""
    for name, value in (("reach_value", reach_value), ("impact", impact), ("confidence", confidence), ("effort", effort)):
        if not _is_finite_number(value):
            raise InvariantViolation(f"RICE_INVALID_{name.upper()}: must be a finite number, got {value!r}")
    if reach_value < 0:
        raise InvariantViolation(f"RICE_NEGATIVE_REACH: reach_value must be >= 0, got {reach_value!r}")
    if impact < 0:
        raise InvariantViolation(f"RICE_NEGATIVE_IMPACT: impact must be >= 0, got {impact!r}")
    if not (0 <= confidence <= 1):
        raise InvariantViolation(f"RICE_CONFIDENCE_OUT_OF_RANGE: confidence must be in [0, 1], got {confidence!r}")
    if effort <= 0:
        raise InvariantViolation(f"RICE_NONPOSITIVE_EFFORT: effort must be > 0 (division by zero/negative is undefined), got {effort!r}")
    result = (reach_value * impact * confidence) / effort
    if not math.isfinite(result):
        # Every individual input above already passed a finite/range check, but their COMBINATION can still
        # overflow float64 (e.g. reach_value=1e200, impact=1e200 -> product alone exceeds ~1.8e308). JSON has
        # no Infinity/NaN literal, so an overflowed score would violate rice-score-record.schema.yaml's own
        # `rice_score: {type: number}` the moment this record is serialized -- rejected here explicitly rather
        # than silently emitted and only caught later by whatever happens to serialize it next.
        raise InvariantViolation(f"RICE_SCORE_OVERFLOW: computed rice_score is not finite ({result!r}) from reach_value={reach_value!r}, impact={impact!r}, confidence={confidence!r}, effort={effort!r}")
    return round(result, 8)
