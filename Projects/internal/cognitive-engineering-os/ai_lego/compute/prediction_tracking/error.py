"""Deterministic prediction-error compute, backing ``learning.prediction_tracking``.

Same Trusted Compute discipline every genuine-compute module in this package
establishes (``compute/mcda/scoring.py``, ``compute/montecarlo/simulation.py``,
``compute/ahp/weights.py``, ...): the error number is DECIDED here, by a
real deterministic formula, never asserted by an LLM or a caller.

Two formulas, selected by ``prediction_type`` (Atlas L809 gives no formula of
its own -- these are the two standard, well-documented forecast-calibration
metrics matching the two prediction shapes this method supports):

* PROBABILITY -- Brier score: ``(predicted_probability - actual_as_float) ** 2``
  where ``actual_as_float`` is 1.0 if the predicted event occurred, else 0.0.
  Range [0, 1], lower is better calibrated on this single prediction.
* POINT_ESTIMATE -- absolute error ``abs(predicted_value - observed_value)``,
  plus relative error (``absolute / abs(observed_value)``) when
  ``observed_value != 0`` -- undefined (returned as ``None``, never inf/nan)
  when the observed value is exactly zero.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

VALID_PREDICTION_TYPES = frozenset({"PROBABILITY", "POINT_ESTIMATE"})


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compute_prediction_error(
    prediction_type: str,
    predicted_probability: float | None,
    predicted_value: float | None,
    observed_outcome: bool | None,
    observed_value: float | None,
) -> dict[str, Any]:
    """Pure, deterministic. Precondition: the caller (``learning.prediction_tracking``'s own
    ``record_actual``/gate) already validated shape/pairing -- this function still defends its own inputs
    (fail-closed, not a crash) since it is ALSO called directly by the gate's re-derivation path against
    potentially hand-tampered raw record fields, same discipline ``mcda.scoring.normalize_scores`` already
    establishes for its own direction/value validation rather than blindly trusting upstream."""
    if prediction_type == "PROBABILITY":
        if not _is_finite_number(predicted_probability) or not (0 <= predicted_probability <= 1):
            raise InvariantViolation(f"PREDICTIONTRACKING_COMPUTE_INVALID_PROBABILITY: predicted_probability must be a finite number in [0,1], got {predicted_probability!r}")
        if not isinstance(observed_outcome, bool):
            raise InvariantViolation(f"PREDICTIONTRACKING_COMPUTE_INVALID_OUTCOME: observed_outcome must be a bool, got {observed_outcome!r}")
        actual_as_float = 1.0 if observed_outcome else 0.0
        brier = (predicted_probability - actual_as_float) ** 2
        return {"metric": "BRIER_SCORE", "value": round(brier, 8), "relative_value": None}

    if prediction_type == "POINT_ESTIMATE":
        if not _is_finite_number(predicted_value):
            raise InvariantViolation(f"PREDICTIONTRACKING_COMPUTE_INVALID_PREDICTED_VALUE: predicted_value must be a finite number, got {predicted_value!r}")
        if not _is_finite_number(observed_value):
            raise InvariantViolation(f"PREDICTIONTRACKING_COMPUTE_INVALID_OBSERVED_VALUE: observed_value must be a finite number, got {observed_value!r}")
        absolute = abs(predicted_value - observed_value)
        relative = (absolute / abs(observed_value)) if observed_value != 0 else None
        return {"metric": "ABSOLUTE_ERROR", "value": round(absolute, 8), "relative_value": (round(relative, 8) if relative is not None else None)}

    raise InvariantViolation(f"PREDICTIONTRACKING_COMPUTE_INVALID_PREDICTION_TYPE: prediction_type must be one of {sorted(VALID_PREDICTION_TYPES)}, got {prediction_type!r}")
