"""Expected Value -- deterministic, closed-form compute, backing ``decision.expected_value``.

Same Trusted Compute discipline every prior genuine-compute module in this
package establishes (``compute/rice/scoring.py``, ``compute/mcda/scoring.py``,
``compute/ahp/weights.py``): the formula is DECIDED here, by a real
deterministic function, never asserted by an LLM or trusted as a
caller-supplied stored value.

Atlas F16 tool table Expected Value row (L771) cites "機率x結果" (probability
x outcome), pipeline "states->probabilities->outcomes". This computes the
textbook closed-form Sigma(probability_i * outcome_value_i) over a finite,
caller-enumerated, EXHAUSTIVE, MUTUALLY-EXCLUSIVE state list -- NOT a Monte
Carlo sample-mean estimate (see ``ai_lego/modules/decision/expected_value.py``'s
own module docstring for the full due-diligence record against
``computation.monte_carlo``).

The probabilities-sum-to-1.0 tolerance convention (``DEFAULT_PROBABILITY_TOLERANCE
= 1e-6``) mirrors ``ai_lego/compute/mcda/scoring.py::validate_weights_sum_to_one``'s
own tolerance for the identical invariant class (caller-supplied non-negative
fractions must sum to 1.0) -- same value, same category of check, different
domain (probabilities of mutually-exclusive future states, not stakeholder
importance weights across criteria).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

MIN_STATES = 2
# A single-state "distribution" has probability trivially forced to 1.0 -- zero probabilistic content,
# degenerating to a certainty statement, not a decision-under-uncertainty baseline (Atlas's own L771
# pipeline is plural: "states->probabilities->outcomes"). Same class of disclosed cardinality floor
# ai_lego/compute/ahp/weights.py::build_pairwise_matrix (AHP_TOO_FEW_CRITERIA, >=2) and decision.mcda's
# own MCDA_TOO_FEW_OPTIONS (mcda.py:80, >=2) already apply for their own "comparison/distribution needs
# plurality to be meaningful" reasons -- see method contract's own compilation_decisions/open_questions
# for this exact disclosed judgment call.
DEFAULT_PROBABILITY_TOLERANCE = 1e-6


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compute_expected_value(states: list[dict[str, Any]], *, tolerance: float = DEFAULT_PROBABILITY_TOLERANCE) -> float:
    """Sigma(probability_i * outcome_value_i) over ``states`` -- computed fresh every call (GENUINE compute,
    never a stored/asserted field: ``ai_lego/modules/decision/expected_value.py``'s own
    ``evaluate_expected_value_genuine_compute_gate`` calls this SAME function against a record's own raw
    ``states`` and compares the result to whatever ``expected_value`` the record claims, rather than ever
    trusting that stored value -- same discipline ``compute/rice/scoring.py::compute_rice_score`` already
    established for its own single-scalar formula, extended here to a variable-length state list).

    Each ``states[i]`` must carry a finite ``probability`` in [0,1] and a finite ``outcome_value``.
    ``outcome_value`` is intentionally UNBOUNDED (negative allowed) -- unlike RICE's reach/impact (Atlas
    gives no >=0 citation for a generic decision payoff, and a real expected-value calculation routinely
    weighs a probability of LOSS, e.g. "20% chance of losing $10,000", against a probability of gain; a
    ``>= 0`` floor here would silently make this method unable to model loss, which is wrong).

    Two independently-checked invariants, in this order:
    1. ``EXPECTEDVALUE_TOO_FEW_STATES`` / per-state shape errors -- basic input validity.
    2. ``EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE`` -- mutual exclusivity + exhaustiveness (states
       are a discrete probability distribution over the full space of possibilities; basic probability
       theory, not a citation Atlas's own bare table row states numerically). A sum < 1 means some
       possibility is unaccounted for; a sum > 1 means overlapping/double-counted states.

    Returns the rounded (8dp) scalar expected value, matching ``compute_rice_score``'s own rounding
    convention."""
    if not isinstance(states, list) or len(states) < MIN_STATES:
        raise InvariantViolation(f"EXPECTEDVALUE_TOO_FEW_STATES: at least {MIN_STATES} states required, got {len(states) if isinstance(states, list) else 0!r}")

    probabilities: list[float] = []
    for index, state in enumerate(states):
        if not isinstance(state, dict):
            raise InvariantViolation(f"EXPECTEDVALUE_INVALID_STATE_SHAPE: states[{index}] is not a dict, got {type(state).__name__}")
        state_id = state.get("id", f"<index {index}>")
        probability = state.get("probability")
        outcome_value = state.get("outcome_value")
        if not _is_finite_number(probability) or not (0 <= probability <= 1):
            raise InvariantViolation(f"EXPECTEDVALUE_INVALID_PROBABILITY: states[{index}] (id={state_id!r}) probability must be a finite number in [0,1], got {probability!r}")
        if not _is_finite_number(outcome_value):
            raise InvariantViolation(f"EXPECTEDVALUE_INVALID_OUTCOME_VALUE: states[{index}] (id={state_id!r}) outcome_value must be a finite number, got {outcome_value!r}")
        probabilities.append(probability)

    total_probability = sum(probabilities)
    if not math.isclose(total_probability, 1.0, abs_tol=tolerance):
        raise InvariantViolation(
            f"EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE: sum={total_probability!r}, expected 1.0 (tolerance {tolerance}) -- "
            "states must be mutually exclusive and exhaustive (a sum < 1 leaves a possibility unaccounted for; a sum > 1 double-counts)"
        )

    result = sum(state["probability"] * state["outcome_value"] for state in states)
    if not math.isfinite(result):
        # Every individual probability/outcome_value already passed a finite check above, but their
        # COMBINATION can still overflow float64 -- same overflow-after-individually-valid-inputs class
        # ai_lego/compute/rice/scoring.py::compute_rice_score's own RICE_SCORE_OVERFLOW guards against.
        raise InvariantViolation(f"EXPECTEDVALUE_SUM_OVERFLOW: computed expected_value is not finite ({result!r})")
    return round(result, 8)
