"""``learning.prediction_tracking`` -- Method Atlas slice, ninth and LAST member of the `learning` family
(F17) -- CLOSES F17 9/9. Builds instances of ``typed-objects/prediction-tracking-record.schema.yaml``.

Atlas F17 table row (L809): "Prediction Tracking | 預測 vs 實際 |
prediction→horizon→actual→error | 改善 calibration" -- the only citation
(grep-confirmed across the whole spec root; no dedicated section exists,
same "one table row only" scope `root_cause.fault_tree`'s own docstring
already establishes for a different F05 method).

DUE DILIGENCE (`learning.decision_journal` read in full before writing any
new mechanism, per this session's own brief -- see also
`decision-journal-entry.schema.yaml`'s own OQ-DECISIONJOURNAL-2 and
compilation_decisions L45-52, both of which already flag this exact Atlas
row as decision_journal's forecast/confidence "lighter-weight instance"
sibling):

* decision_journal is a >=2-OPTION CHOICE record (its own invariant #1:
  `options` plural, exactly one `chosen`) -- there was something to choose
  between. This method has NO options structure at all: a bare `statement`
  + `prediction_type` + (`predicted_probability` XOR `predicted_value`),
  one forecasted value, nothing chosen among alternatives. Genuinely
  distinct shape, not a duplicate.
* decision_journal's stated benefit is "防 hindsight bias" (protect ONE
  decision's own record from being retroactively flattered). This method's
  own stated benefit is "改善 calibration" (Atlas L809) -- but Atlas ALSO
  names a SEPARATE, dedicated F10 row for the actual cross-record
  aggregation ("Confidence Calibration", L578: "predictions→actuals→
  calibration curve", plural, "降低 overconfidence", not yet built). That
  cross-record concern is explicitly OUT OF SCOPE here -- see
  OQ-PREDICTIONTRACKING-2 -- this method stays one record at a time, same
  scope discipline decision_journal itself keeps for its own
  calibration-adjacent benefit.
* `kill_criteria.py`/`reversal_criteria.py` (both grepped for
  record_outcome/record_actual/actual_result -- zero hits in either) are
  purely ex-ante: they define criteria and evaluate threshold breaches
  against live observations, but never attach a recorded "actual" to a
  constructed record. This method is the SECOND two-stage
  (commit-then-later-complete) F17 member, after decision_journal, not a
  third copy of an existing mechanism.

DESIGN (two real, independently-enforced invariants, construction AND gate,
same "raise before any downstream write" / "re-derive, don't trust"
two-layer discipline every prior module in this package uses):

1. **Prediction commitment integrity** (`PREDICTIONTRACKING_STAGE1_HASH_MISMATCH`):
   Atlas's own `horizon` element is the stated future check-in point --
   `statement`/`prediction_type`/`predicted_probability`/`predicted_value`/
   `horizon` must all be fixed BEFORE `actual` is known, the same
   "commit before you know the outcome" discipline `decision_journal`'s own
   `stage1_integrity_hash` enforces. REUSES that exact mechanism
   (`sha256_json` over a snapshot of the stage-1 fields, re-derived and
   compared by an independent gate on every call) -- a disclosed choice,
   NOT a lighter substitute: only a re-derivable hash catches a
   hand-edited dict that skips the sanctioned
   `generate_prediction_tracking_record`/`record_actual` API entirely
   (e.g. `record["predicted_value"] = 42` after the actual is already
   known) -- the identical risk decision_journal's own module docstring
   already establishes a hash is required to catch.

   ONE hash only, not decision_journal's two (`stage1_integrity_hash` +
   `outcome_integrity_hash`) -- a disclosed SIMPLIFICATION, not a lesser
   standard: decision_journal's SECOND hash exists because its own
   `actual_result` is free-text prose with no independent
   recomputability (a hash is the ONLY way to detect it was edited after
   recording). This method's `actual` feeds directly into `error`, which
   invariant #2 below already re-derives independently on every gate
   call -- editing `actual` without a matching, consistent `error` edit is
   caught immediately by that recompute, so a second hash would add no
   coverage a determined tamperer's own consistent edit would not also
   defeat (`sha256_json` is unkeyed and re-computable by anyone reading
   this module's own source -- tamper EVIDENCE against naive/incomplete
   edits, same as decision_journal's own two hashes, never cryptographic
   security against a fully sophisticated insider).

2. **Genuinely-computed error** (`PREDICTIONTRACKING_ERROR_MISMATCH` --
   surfaced as `genuine_compute` gate evidence, not a raise code, since
   `error` is never a caller-suppliable parameter to begin with):
   `error` is never a `record_actual()` parameter -- always computed
   internally by
   `ai_lego.compute.prediction_tracking.error.compute_prediction_error`
   from `prediction` vs `actual` (Brier score for PROBABILITY, absolute/
   relative error for POINT_ESTIMATE), and independently RE-DERIVED by
   `evaluate_genuine_compute_gate` from the record's own raw fields on
   every call -- same GENUINE_COMPUTE discipline `decision.mcda`/
   `computation.monte_carlo` establish via their own
   `computation_provenance_ref`/`engine` trail (both fields kept here
   too, for the same auditable-trail reason), EXTENDED here with an
   actual recompute-and-compare (stronger than either sibling's own
   ref-resolves-only check -- see the method contract's own
   compilation_decisions for why both layers are kept rather than
   picking one). Unlike mcda/monte_carlo, this gate does NOT additionally
   check `provenance.epistemic_type == CALCULATED_RESULT`: this record's
   top-level `provenance` describes the STATEMENT (stage 1, a
   HYPOTHESIS-typed forecast), not the computed error -- checking it
   against CALCULATED_RESULT would be a category error for this
   record's own two-stage shape (see contract compilation_decisions).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.prediction_tracking.error import compute_prediction_error
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import sha256_json
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.prediction_tracking"
RECORD_ID_PREFIX = "PREDICT-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.prediction_tracking.error.compute_prediction_error"

VALID_PREDICTION_TYPES = frozenset({"PROBABILITY", "POINT_ESTIMATE"})
VALID_ERROR_METRICS = frozenset({"BRIER_SCORE", "ABSOLUTE_ERROR"})

# Atlas L809's own 2 pre-outcome named elements (prediction, horizon), expanded to the 5 concrete fields
# that together represent them -- exactly the fields a hindsight-biased actor could retroactively edit to
# make a forecast look better once the actual is known. Mirrors decision_journal.STAGE1_HASHED_FIELDS.
STAGE1_HASHED_FIELDS = ("statement", "prediction_type", "predicted_probability", "predicted_value", "horizon")

_KNOWN_ACTUAL_KEYS = frozenset({"observed_value", "observed_outcome", "provenance", "recorded_at"})
_KNOWN_ERROR_KEYS = frozenset({"metric", "value", "relative_value"})
_KNOWN_RECORD_KEYS = frozenset(
    {
        "id",
        "version",
        "generated_by_method",
        "statement",
        "prediction_type",
        "predicted_probability",
        "predicted_value",
        "horizon",
        "provenance",
        "stage1_integrity_hash",
        "actual",
        "error",
        "engine",
        "computation_provenance_ref",
    }
)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a raw recursive ``repr()`` over caller-
    supplied input of unknown size, same DoS-avoidance discipline every sibling module's own
    ``_shallow_describe`` establishes (e.g. ``decision_journal._shallow_describe``,
    ``fault_tree._shallow_describe``)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_valid_probability(value: Any) -> bool:
    return _is_finite_number(value) and 0 <= value <= 1


# --------------------------------------------------------------------------
# Shape validators -- same division of labor fault_tree/decision_journal already establish: shape checked
# here, invariant-specific checks (hash match, error recompute) separately below.
# --------------------------------------------------------------------------


def _prediction_fields_are_valid(prediction_type: Any, predicted_probability: Any, predicted_value: Any) -> bool:
    """Exactly one of predicted_probability/predicted_value is set, matching prediction_type -- the other
    is structurally None, never merely 'unused but present'."""
    if prediction_type not in VALID_PREDICTION_TYPES:
        return False
    if prediction_type == "PROBABILITY":
        return _is_valid_probability(predicted_probability) and predicted_value is None
    return _is_finite_number(predicted_value) and predicted_probability is None


def _actual_shape_is_valid(actual: Any, prediction_type: Any) -> bool:
    if not isinstance(actual, dict) or set(actual.keys()) != _KNOWN_ACTUAL_KEYS:
        return False
    if not isinstance(actual.get("provenance"), dict):
        # Same "reject non-dict provenance at shape-check time, don't wait for the dedicated provenance gate
        # to eventually run" discipline decision_journal's own _evidence_shape_is_valid establishes.
        return False
    if not _is_nonempty_str(actual.get("recorded_at")):
        return False
    if prediction_type == "PROBABILITY":
        return isinstance(actual.get("observed_outcome"), bool) and actual.get("observed_value") is None
    if prediction_type == "POINT_ESTIMATE":
        return _is_finite_number(actual.get("observed_value")) and actual.get("observed_outcome") is None
    return False


def _error_shape_is_valid(error: Any) -> bool:
    if not isinstance(error, dict) or set(error.keys()) != _KNOWN_ERROR_KEYS:
        return False
    if error.get("metric") not in VALID_ERROR_METRICS:
        return False
    value = error.get("value")
    if not (_is_finite_number(value) and value >= 0):
        return False
    relative = error.get("relative_value")
    if relative is not None and not (_is_finite_number(relative) and relative >= 0):
        return False
    if error["metric"] == "BRIER_SCORE" and relative is not None:
        return False
    return True


# --------------------------------------------------------------------------
# Invariant #1 (prediction commitment integrity): the tamper-evidence hash primitives.
# --------------------------------------------------------------------------


def _stage1_snapshot(record: dict[str, Any]) -> dict[str, Any]:
    return {field: record.get(field) for field in STAGE1_HASHED_FIELDS}


def _compute_stage1_hash(record: dict[str, Any]) -> str:
    return sha256_json(_stage1_snapshot(record))


def _safe_compute_stage1_hash(record: dict[str, Any]) -> str | None:
    """Fail-closed wrapper for GATE use only -- same discipline decision_journal's own
    ``_safe_compute_hash`` establishes (a gate re-derives from RAW, potentially hand-tampered fields with
    no upstream-validation guarantee; returns ``None``, never a valid hash, on serialization failure)."""
    try:
        return _compute_stage1_hash(record)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Invariant #2 (genuinely-computed error): the recompute-and-compare primitive.
# --------------------------------------------------------------------------


def _safe_recompute_error(record: dict[str, Any]) -> dict[str, Any] | None:
    """Fail-closed wrapper for GATE use only -- re-derives ``error`` fresh from the record's own raw
    prediction/actual fields via the SAME pure compute function ``record_actual`` uses. Returns ``None``
    (never a value that could accidentally compare equal to a malformed stored error) on any failure, same
    discipline ``_safe_compute_stage1_hash`` above and decision_journal's own ``_safe_compute_hash``
    establish."""
    actual = record.get("actual")
    if not isinstance(actual, dict):
        return None
    try:
        return compute_prediction_error(
            record.get("prediction_type"),
            record.get("predicted_probability"),
            record.get("predicted_value"),
            actual.get("observed_outcome"),
            actual.get("observed_value"),
        )
    except InvariantViolation:
        return None


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def generate_prediction_tracking_record(
    record_id: str,
    statement: str,
    prediction_type: str,
    horizon: str,
    provenance: dict[str, Any],
    *,
    predicted_probability: float | None = None,
    predicted_value: float | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/prediction-tracking-record.schema.yaml``, STAGE 1 (before ``actual`` is
    known). Enforces the predicted_probability/predicted_value XOR pairing fail-closed, then computes and
    stores ``stage1_integrity_hash`` over exactly this record's own 5 stage-1 fields -- the tamper-evidence
    checkpoint ``record_actual``/``evaluate_prediction_commitment_integrity_gate`` both build on. ``actual``/
    ``error``/``engine``/``computation_provenance_ref`` all start ``None``; there is deliberately NO
    parameter here to set any of them -- see module docstring's DESIGN section."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"PREDICTIONTRACKING_EMPTY_STATEMENT: statement must be a non-empty string, got {statement!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(horizon):
        raise InvariantViolation(f"PREDICTIONTRACKING_EMPTY_HORIZON: horizon must be a non-empty string, got {horizon!r}")
    if prediction_type not in VALID_PREDICTION_TYPES:
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_PREDICTION_TYPE: prediction_type must be one of {sorted(VALID_PREDICTION_TYPES)}, got {prediction_type!r}")
    if not _prediction_fields_are_valid(prediction_type, predicted_probability, predicted_value):
        raise InvariantViolation(
            f"PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS: prediction_type={prediction_type!r} requires exactly one of "
            f"predicted_probability (finite, [0,1]) / predicted_value (finite number) set, matching prediction_type, the other None -- "
            f"got predicted_probability={predicted_probability!r}, predicted_value={predicted_value!r}"
        )
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "statement": statement,
        "prediction_type": prediction_type,
        "predicted_probability": predicted_probability,
        "predicted_value": predicted_value,
        "horizon": horizon,
        "provenance": provenance,
        "actual": None,
        "error": None,
        "engine": None,
        "computation_provenance_ref": None,
    }
    try:
        record["stage1_integrity_hash"] = _compute_stage1_hash(record)
    except (TypeError, ValueError) as error:
        # Residual defense-in-depth: shape checks above already reject the common non-serializable cases;
        # this closes any other pathological content, converting a raw json.dumps crash into a clean,
        # catchable InvariantViolation -- same fail-closed guarantee decision_journal's own equivalent
        # branch provides.
        raise InvariantViolation(f"PREDICTIONTRACKING_UNHASHABLE_CONTENT: could not compute stage1_integrity_hash ({error})") from error
    return record


def record_actual(
    entry: dict[str, Any],
    provenance: dict[str, Any],
    recorded_at: str,
    *,
    observed_outcome: bool | None = None,
    observed_value: float | None = None,
) -> dict[str, Any]:
    """STAGE 2: attaches ``actual`` (and computes ``error``) onto an already-constructed stage-1 record.
    Deliberately has NO parameter for statement/prediction_type/predicted_probability/predicted_value/
    horizon -- it copies ``entry``'s own stored stage-1 values forward verbatim into a freshly-built dict,
    so the returned record's stage-1 fields are, BY CONSTRUCTION, exactly what this function received them
    as (a caller cannot pass a different value for them; there is no argument to pass one through). Enforces
    invariant #1 fail-closed: refuses to attach anything to an entry whose stage-1 hash no longer matches
    its own raw fields (tampered before this call), and refuses a second ``actual`` (write-once, no revising
    after the fact). ``error`` is computed HERE, internally, via ``compute_prediction_error`` -- there is no
    parameter to pass a caller-supplied error through either (invariant #2)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_RECORD_KEYS:
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_ENTRY: entry must be a dict with exactly the expected top-level keys {sorted(_KNOWN_RECORD_KEYS)}, got {_shallow_describe(entry)}")

    prediction_type = entry.get("prediction_type")
    if not _prediction_fields_are_valid(prediction_type, entry.get("predicted_probability"), entry.get("predicted_value")):
        raise InvariantViolation(f"PREDICTIONTRACKING_STAGE1_INVALID: entry's own prediction fields are malformed: {_shallow_describe(entry)}")
    if not _is_nonempty_str(entry.get("statement")) or not _is_nonempty_str(entry.get("horizon")):
        raise InvariantViolation("PREDICTIONTRACKING_STAGE1_INVALID: entry's own statement/horizon no longer pass stage-1 shape validation")

    try:
        recomputed_stage1_hash = _compute_stage1_hash(entry)
    except (TypeError, ValueError) as error:
        raise InvariantViolation(f"PREDICTIONTRACKING_UNHASHABLE_CONTENT: could not recompute entry {entry.get('id')!r}'s stage1_integrity_hash ({error})") from error
    if entry.get("stage1_integrity_hash") != recomputed_stage1_hash:
        raise InvariantViolation(
            f"PREDICTIONTRACKING_STAGE1_HASH_MISMATCH: entry {entry.get('id')!r}'s stage1_integrity_hash does not match a fresh hash of its own "
            f"statement/prediction_type/predicted_probability/predicted_value/horizon -- stage-1 fields were altered after construction"
        )
    if entry.get("actual") is not None:
        raise InvariantViolation(f"PREDICTIONTRACKING_ACTUAL_ALREADY_RECORDED: entry {entry.get('id')!r} already has an actual; actual is write-once, never revised")

    if not _is_nonempty_str(recorded_at):
        raise InvariantViolation(f"PREDICTIONTRACKING_EMPTY_RECORDED_AT: recorded_at must be a non-empty string, got {recorded_at!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PREDICTIONTRACKING_INVALID_OUTCOME_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    actual: dict[str, Any] = {
        "observed_value": observed_value,
        "observed_outcome": observed_outcome,
        "provenance": provenance,
        "recorded_at": recorded_at,
    }
    if not _actual_shape_is_valid(actual, prediction_type):
        raise InvariantViolation(
            f"PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS: prediction_type={prediction_type!r} requires exactly one of "
            f"observed_outcome (bool) / observed_value (finite number) set, matching prediction_type, the other None -- "
            f"got observed_outcome={observed_outcome!r}, observed_value={observed_value!r}"
        )

    error = compute_prediction_error(prediction_type, entry.get("predicted_probability"), entry.get("predicted_value"), observed_outcome, observed_value)

    return {
        "id": entry["id"],
        "version": entry["version"],
        "generated_by_method": entry["generated_by_method"],
        "statement": entry["statement"],
        "prediction_type": entry["prediction_type"],
        "predicted_probability": entry["predicted_probability"],
        "predicted_value": entry["predicted_value"],
        "horizon": entry["horizon"],
        "provenance": entry["provenance"],
        "stage1_integrity_hash": entry["stage1_integrity_hash"],
        "actual": actual,
        "error": error,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance, and (if ``actual`` has
    been attached) the actual's own provenance, are both schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    overall_valid = provenance_is_valid(record.get("provenance"))
    actual = record.get("actual")
    actual_provenance_valid = True if actual is None else (isinstance(actual, dict) and provenance_is_valid(actual.get("provenance")))
    passed = overall_valid and actual_provenance_valid
    return _result("provenance_required", passed, [{"overall_provenance_valid": overall_valid, "actual_provenance_valid": actual_provenance_valid}], validator, timestamp)


def evaluate_prediction_tracking_structure_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Shape check for id/version/statement/prediction_type/predicted_probability/predicted_value/horizon --
    re-derived independently from the record's own raw fields, same discipline
    ``evaluate_options_integrity_gate``/``evaluate_fault_tree_integrity_gate`` already establish (a
    hand-crafted/tampered record must still be caught, not just whatever the builder happened to produce)."""
    if not isinstance(record, dict):
        return _result("prediction_tracking_structure", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("prediction_tracking_structure", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("prediction_tracking_structure", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("statement")):
        return _result("prediction_tracking_structure", False, [{"reason": "statement missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("horizon")):
        return _result("prediction_tracking_structure", False, [{"reason": "horizon missing or empty"}], validator, timestamp)
    if not _prediction_fields_are_valid(record.get("prediction_type"), record.get("predicted_probability"), record.get("predicted_value")):
        return _result(
            "prediction_tracking_structure",
            False,
            [{"reason": "prediction_type/predicted_probability/predicted_value malformed or mismatched pairing", "prediction_type": record.get("prediction_type")}],
            validator,
            timestamp,
        )
    return _result("prediction_tracking_structure", True, [{"prediction_type": record["prediction_type"]}], validator, timestamp)


def evaluate_prediction_commitment_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently: recomputes ``stage1_integrity_hash`` from the record's own
    CURRENT statement/prediction_type/predicted_probability/predicted_value/horizon and compares to the
    stored value -- this is what catches ANY direct hand-edit of those fields (e.g.
    ``record["predicted_value"] = 42``), whether or not ``actual`` has been attached, since there is no
    second construction call to intercept it. FAILS CLOSED on malformed input rather than crashing, same
    discipline every gate in this package uses."""
    if not isinstance(record, dict):
        return _result("prediction_commitment_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stored_hash = record.get("stage1_integrity_hash")
    if not _is_nonempty_str(stored_hash):
        return _result("prediction_commitment_integrity", False, [{"reason": "stage1_integrity_hash missing or empty"}], validator, timestamp)
    recomputed_hash = _safe_compute_stage1_hash(record)
    passed = recomputed_hash is not None and stored_hash == recomputed_hash
    return _result("prediction_commitment_integrity", passed, [{"stage1_hash_match": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: when ``actual`` is present, recomputes ``error`` fresh via
    ``compute_prediction_error`` from the record's own raw prediction/actual fields and compares to the
    stored value (catches a hand-tampered ``actual`` and/or ``error`` -- PREDICTIONTRACKING_ERROR_MISMATCH
    class), AND checks the ``computation_provenance_ref``/``engine`` trail -- same
    ``decision.mcda``/``computation.monte_carlo`` GENUINE_COMPUTE fields, extended here with the actual
    recompute (see module docstring's DESIGN section #2). PASSES vacuously (nothing to verify yet) when
    ``actual`` is still ``None`` -- same 'stage 2 not reached yet' shape decision_journal's own
    ``evaluate_hindsight_bias_integrity_gate`` already establishes for its own outcome field. FAILS CLOSED
    on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    actual = record.get("actual")
    if actual is None:
        return _result("genuine_compute", True, [{"actual_present": False}], validator, timestamp)
    if not isinstance(actual, dict):
        return _result("genuine_compute", False, [{"reason": "actual present but not a dict"}], validator, timestamp)

    stored_error = record.get("error")
    if not _error_shape_is_valid(stored_error):
        return _result("genuine_compute", False, [{"reason": f"error malformed: {_shallow_describe(stored_error)}"}], validator, timestamp)
    recomputed_error = _safe_recompute_error(record)
    error_match = recomputed_error is not None and recomputed_error == stored_error

    ref = record.get("computation_provenance_ref", "")
    resolvable = False
    if isinstance(ref, str) and ref.startswith("ai_lego.compute."):
        import importlib

        module_name, _, attr = ref.rpartition(".")
        try:
            resolvable = callable(getattr(importlib.import_module(module_name), attr))
        except Exception:
            resolvable = False

    checks = {
        "error_recompute_matches_stored_value": error_match,
        "computation_provenance_ref_resolves": resolvable,
        "engine_is_deterministic_compute_not_llm": record.get("engine") == "local_python_deterministic_compute",
    }
    return _result("genuine_compute", all(checks.values()), [checks], validator, timestamp)


def evaluate_prediction_tracking_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_prediction_tracking_structure_gate(record, validator, timestamp),
        evaluate_prediction_commitment_integrity_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
