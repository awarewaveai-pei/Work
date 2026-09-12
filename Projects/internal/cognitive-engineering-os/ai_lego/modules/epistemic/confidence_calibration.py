"""``epistemic.confidence_calibration`` -- F10 epistemic quality family (Atlas L566-609), quantitative pair
member 2/2 built this batch (with ``epistemic.bayesian_updating``, the other quantitative F10 row).

Atlas F10 table row, read directly at L578: "Confidence Calibration｜檢查信心是否準確｜predictions→actuals→
calibration curve｜降低 overconfidence". Atlas names the technique and its purpose but gives NO formula -- unlike
``epistemic.bayesian_updating``'s own Bayes' rule (a real textbook citation), the Brier score here is a
DISCLOSED COMPILATION DECISION, not an Atlas citation: the standard proper scoring rule for exactly this
purpose (mean squared error between a stated probability and the realised {0,1} outcome), same class of
supplementation ``challenge.hazop``'s own guide-word vocabulary already establishes for this corpus (Atlas
names the technique, the concrete vocabulary/formula is compiled in and labelled as such)::

    brier_score = mean((stated_confidence - (1.0 if actual_outcome else 0.0)) ** 2)

``brier_score`` is GENUINE_COMPUTE, same idiom as ``epistemic.bayesian_updating``'s own ``posterior``:
``generate_confidence_calibration`` has no ``brier_score`` parameter (verified via ``inspect.signature`` --
a caller attempting a ``brier_score=`` keyword argument gets a plain ``TypeError``), and
``evaluate_confidence_calibration_content_integrity_gate`` independently recomputes it from the record's own
stored ``predictions[]`` and FAILs on any mismatch beyond the same ``1e-9`` tolerance
``epistemic.bayesian_updating`` documents (same ``round(x, 8)`` storage convention -- see that module's
docstring for the full rationale, not duplicated here).

Atlas's own pipeline is explicitly PLURAL ("predictions→actuals") -- a single (stated_confidence, actual_outcome)
pair cannot draw a calibration curve at all (that needs a distribution of predictions compared against a
distribution of outcomes). ``predictions`` therefore requires at least ``_MIN_PREDICTIONS`` (2) entries
(``CALIB_TOO_FEW_PREDICTIONS``), each ``{id, stated_confidence, actual_outcome}`` well-formed (exact key set, no
smuggled per-item field -- same ``_FAILURE_MODE_INPUT_KEYS``-style check ``challenge.fmea``'s own
``_build_failure_mode`` establishes) with a unique ``id``.

``stated_confidence`` must be a real finite number in [0,1], bool excluded -- the same numeric trap every prior
module in this corpus guards against, deliberately re-implemented here rather than imported cross-module (no
shared numeric-validation utility exists in this corpus; every module keeps its own copy, e.g.
``stakeholders.game_theory``'s ``_is_number_excluding_bool`` vs ``challenge.fmea``'s ``_is_valid_score`` are
each independently defined for their own method's own value domain). ``actual_outcome`` runs the OPPOSITE check:
it must genuinely BE a ``bool`` (``isinstance(value, bool)`` True), NOT an ``int`` 0/1 -- silently accepting an
int would still numerically compute a score (Python's ``0``/``1`` behave like ``False``/``True`` in arithmetic)
but represents a category error this method refuses rather than silently tolerates. Be careful not to conflate
this with the OTHER numeric guards in this corpus that EXCLUDE bool from a numeric field -- here the direction is
reversed by design (see module-level note on ``_is_valid_probability`` below).

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "bayes"/"posterior"/"calibration"/
"brier" before writing any of this method's own files: hits only in ``prediction-tracking-record.schema.yaml``/
``learning.prediction_tracking.contract.yaml`` (a SINGLE PROBABILITY-type prediction's own Brier score against
ONE later-observed outcome -- that file's own OQ-PREDICTIONTRACKING-2 explicitly defers cross-record
calibration-curve aggregation, i.e. this Atlas F10 row, to a future method: THIS one) and this file's own sibling
``epistemic.bayesian_updating`` (the OTHER F10 quantitative row -- a genuinely different single-belief-update
method). No duplicate aggregate-calibration implementation found.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.confidence_calibration"
RECORD_ID_PREFIX = "CALIB-"

# Compilation decision (disclosed, module docstring, same value epistemic.bayesian_updating's own posterior
# uses): storage rounds to 8dp, so a 1e-9 gate tolerance is one order of magnitude tighter than that unit --
# absorbs float round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9
_MIN_PREDICTIONS = 2

_PREDICTION_KEYS = frozenset({"id", "stated_confidence", "actual_outcome"})
_STORED_KEYS = frozenset({"id", "version", "generated_by_method", "predictions", "brier_score", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_probability(value: Any) -> bool:
    """A ``stated_confidence`` must be a real, finite number in [0,1]. ``bool`` excluded (Python's ``bool`` is an
    ``int`` subclass -- a bare ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as
    1/0, the same documented trap ``stakeholders.game_theory``'s own corrected ``_is_number_excluding_bool``
    guards against). Deliberately NOT the ``actual_outcome`` check below -- that field must genuinely BE a bool,
    the opposite requirement (see module docstring)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= 1
    if isinstance(value, float):
        return math.isfinite(value) and 0.0 <= value <= 1.0
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def compute_brier_score(predictions: list[dict[str, Any]]) -> float:
    """GENUINE_COMPUTE: mean squared error between ``stated_confidence`` and the realised {0,1} outcome -- the
    standard proper scoring rule (disclosed compilation decision, not an Atlas citation -- see module
    docstring). Never accepted as an input -- always derived here from an already-validated ``predictions``
    list (each item MUST already carry real ``stated_confidence``/``actual_outcome`` values -- this function
    does not itself validate, mirroring ``challenge.fmea``'s own ``compute_rpn``'s "pure compute, validated
    inputs only" boundary). Result rounded to 8 decimal places (module docstring)."""
    squared_errors = [(prediction["stated_confidence"] - (1.0 if prediction["actual_outcome"] else 0.0)) ** 2 for prediction in predictions]
    return round(sum(squared_errors) / len(squared_errors), 8)


def _build_prediction(spec: Any, index: int) -> dict[str, Any]:
    """Validates one caller-supplied prediction spec (exactly ``_PREDICTION_KEYS`` -- ``brier_score`` is a
    RECORD-level field, never accepted per-item either, so any smuggled key here is refused, the same
    "additionalProperties"-style exact-key-set check ``challenge.fmea``'s own ``_build_failure_mode`` already
    uses) and returns a freshly-constructed dict (never the caller's own dict object -- no aliasing). Raises
    ``InvariantViolation`` fail-closed on any structural defect; never returns a partial/best-effort result."""
    if not isinstance(spec, dict) or set(spec.keys()) - _PREDICTION_KEYS or not _PREDICTION_KEYS <= spec.keys():
        raise InvariantViolation(
            f"CALIB_INVALID_PREDICTION: predictions[{index}] must be a dict with exactly keys {sorted(_PREDICTION_KEYS)}, got {_shallow_describe(spec)}"
        )
    if not _is_nonempty_str(spec.get("id")):
        raise InvariantViolation(f"CALIB_INVALID_PREDICTION: predictions[{index}].id must be a non-empty string, got {spec.get('id')!r}")
    stated_confidence = spec.get("stated_confidence")
    if not _is_valid_probability(stated_confidence):
        raise InvariantViolation(
            f"CALIB_INVALID_PREDICTION: predictions[{index}].stated_confidence must be a real finite number in [0,1] (bool excluded), got {stated_confidence!r}"
        )
    actual_outcome = spec.get("actual_outcome")
    if not isinstance(actual_outcome, bool):
        raise InvariantViolation(f"CALIB_INVALID_PREDICTION: predictions[{index}].actual_outcome must be a real bool (not an int 0/1), got {actual_outcome!r}")
    return {"id": spec["id"], "stated_confidence": stated_confidence, "actual_outcome": actual_outcome}


def _validate_predictions(predictions: Any) -> list[dict[str, Any]]:
    """Returns the fully-built list of stored prediction dicts, or raises. Never returns a partial/best-effort
    result -- fail-closed, mirroring ``challenge.fmea``'s own ``_validate_failure_modes`` shape."""
    if not isinstance(predictions, list) or len(predictions) < _MIN_PREDICTIONS:
        raise InvariantViolation(
            f"CALIB_TOO_FEW_PREDICTIONS: predictions must be a list of at least {_MIN_PREDICTIONS} entries "
            f"(Atlas L578's own 'predictions→actuals→calibration curve' -- a single point cannot draw a curve), got {_shallow_describe(predictions)}"
        )
    built = [_build_prediction(spec, index) for index, spec in enumerate(predictions)]
    ids = [prediction["id"] for prediction in built]
    duplicates = sorted({prediction_id for prediction_id in ids if ids.count(prediction_id) > 1})
    if duplicates:
        raise InvariantViolation(f"CALIB_DUPLICATE_PREDICTION_ID: prediction id(s) {duplicates} appear more than once")
    return built


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_confidence_calibration(
    record_id: str,
    predictions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/confidence-calibration.schema.yaml``.

    Deliberately has NO ``brier_score`` parameter -- both ``rpn``/``action_priority`` in ``challenge.fmea`` and
    ``posterior`` in ``epistemic.bayesian_updating`` establish this same idiom: GENUINE_COMPUTE, derived per
    invocation by ``compute_brier_score``, never accepted from a caller (verified by
    ``tests/unit/test_confidence_calibration.py`` via ``inspect.signature``). Enforces all real invariants
    fail-closed, in order: id/version/provenance shape, then ``predictions`` (well-formed specs, valid [0,1]
    probabilities, real bool outcomes, unique ids, at least 2 entries).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CALIB_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CALIB_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"CALIB_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    built_predictions = _validate_predictions(predictions)
    brier_score = compute_brier_score(built_predictions)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "predictions": built_predictions,
        "brier_score": brier_score,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_confidence_calibration -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_confidence_calibration_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_confidence_calibration``, so a hand-tampered record (e.g. a spliced-in wrong
    ``brier_score``, or an ``actual_outcome`` silently swapped to an int) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("confidence_calibration_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("confidence_calibration_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("confidence_calibration_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = (_STORED_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "confidence_calibration_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    predictions = record.get("predictions")
    problems: list[str] = []
    if not isinstance(predictions, list) or len(predictions) < _MIN_PREDICTIONS:
        problems.append(f"predictions missing, not a list, or has fewer than {_MIN_PREDICTIONS} entries")
        return _result("confidence_calibration_content_integrity", not problems, [{"problems": problems}], validator, timestamp)

    ids: list[str] = []
    all_items_valid = True
    for index, prediction in enumerate(predictions):
        if not isinstance(prediction, dict) or set(prediction.keys()) - _PREDICTION_KEYS or not _PREDICTION_KEYS <= prediction.keys():
            problems.append(f"predictions[{index}] key set mismatch or not a dict: {_shallow_describe(prediction)}")
            all_items_valid = False
            continue
        ids.append(prediction.get("id") if isinstance(prediction.get("id"), str) else f"<non-str id at index {index}>")
        if not _is_nonempty_str(prediction.get("id")):
            problems.append(f"predictions[{index}].id missing or empty")
            all_items_valid = False
        if not _is_valid_probability(prediction.get("stated_confidence")):
            problems.append(f"predictions[{index}].stated_confidence is not a valid finite [0,1] number (bool excluded): {prediction.get('stated_confidence')!r}")
            all_items_valid = False
        if not isinstance(prediction.get("actual_outcome"), bool):
            problems.append(f"predictions[{index}].actual_outcome is not a real bool: {prediction.get('actual_outcome')!r}")
            all_items_valid = False

    duplicates = sorted({prediction_id for prediction_id in ids if ids.count(prediction_id) > 1})
    if duplicates:
        problems.append(f"duplicate prediction id(s): {duplicates}")

    if not all_items_valid:
        # cannot safely recompute brier_score from a malformed item (missing/mistyped keys)
        return _result("confidence_calibration_content_integrity", not problems, [{"problems": problems}], validator, timestamp)

    expected_brier_score = compute_brier_score(predictions)
    stored_brier_score = record.get("brier_score")
    if not isinstance(stored_brier_score, (int, float)) or isinstance(stored_brier_score, bool) or abs(stored_brier_score - expected_brier_score) > _FLOAT_TOLERANCE:
        problems.append(f"brier_score={stored_brier_score!r} does not match recomputed {expected_brier_score!r} (tolerance {_FLOAT_TOLERANCE})")

    return _result("confidence_calibration_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_confidence_calibration_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_confidence_calibration_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
