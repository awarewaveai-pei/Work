"""Mutation-style tests for ``learning.prediction_tracking`` (F17 learning family, 9th and LAST concrete
entry after reversal_criteria/kill_criteria/decision_journal/pdca/ooda/build_measure_learn/
after_action_review/post_mortem -- CLOSES F17 9/9).

Covers: construction happy path for both prediction_type branches (PROBABILITY/POINT_ESTIMATE); the
predicted_probability/predicted_value XOR-pairing invariant at construction, violated every way (both set,
neither set, wrong type, out of range, bool-as-number, non-finite); record_actual's own invariants (stage1
hash re-check, write-once, actual field pairing, entry shape); invariant #1 (prediction_commitment_integrity)
hand-tamper mutation tests mirroring decision_journal's own hindsight-bias gate test style; invariant #2
(genuine_compute) recompute-and-compare mutation tests, INCLUDING an explicit test of the disclosed
sophisticated-tamper limitation (consistently editing actual+error together evades detection -- same
tamper-EVIDENCE-not-cryptographic-security scope decision_journal's own hashes share); fail-closed behavior
on malformed input across all four gates; direct unit tests of the pure
``compute_prediction_error`` function (Brier score, absolute/relative error, zero-observed-value undefined
relative, invalid inputs); spec conformance against the real schema, including both worked examples.
"""

from __future__ import annotations

import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.prediction_tracking.error import compute_prediction_error
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.prediction_tracking import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE1_HASHED_FIELDS,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_prediction_commitment_integrity_gate,
    evaluate_prediction_tracking_gates,
    evaluate_prediction_tracking_structure_gate,
    evaluate_provenance_required_gate,
    generate_prediction_tracking_record,
    record_actual,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PREDICTION_TRACKING_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/prediction-tracking-record.schema.yaml"
PROV = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")
ACTUAL_PROV = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")


def _build_probability(**overrides):
    kwargs = dict(
        record_id="PREDICT-T-001",
        statement="the deploy will succeed on the first attempt",
        prediction_type="PROBABILITY",
        horizon="2026-12-31",
        provenance=PROV,
        predicted_probability=0.7,
        predicted_value=None,
        version="1.0.0",
    )
    kwargs.update(overrides)
    return generate_prediction_tracking_record(
        kwargs["record_id"],
        kwargs["statement"],
        kwargs["prediction_type"],
        kwargs["horizon"],
        kwargs["provenance"],
        predicted_probability=kwargs["predicted_probability"],
        predicted_value=kwargs["predicted_value"],
        version=kwargs["version"],
    )


def _build_point_estimate(**overrides):
    kwargs = dict(
        record_id="PREDICT-T-002",
        statement="the migration will take this many hours",
        prediction_type="POINT_ESTIMATE",
        horizon="end of sprint",
        provenance=PROV,
        predicted_probability=None,
        predicted_value=10.0,
        version="1.0.0",
    )
    kwargs.update(overrides)
    return generate_prediction_tracking_record(
        kwargs["record_id"],
        kwargs["statement"],
        kwargs["prediction_type"],
        kwargs["horizon"],
        kwargs["provenance"],
        predicted_probability=kwargs["predicted_probability"],
        predicted_value=kwargs["predicted_value"],
        version=kwargs["version"],
    )


class ConstructionHappyPathTests(unittest.TestCase):
    def test_probability_entry_constructs(self):
        record = _build_probability()
        self.assertEqual(record["id"], "PREDICT-T-001")
        self.assertEqual(record["prediction_type"], "PROBABILITY")
        self.assertEqual(record["predicted_probability"], 0.7)
        self.assertIsNone(record["predicted_value"])

    def test_point_estimate_entry_constructs(self):
        record = _build_point_estimate()
        self.assertEqual(record["prediction_type"], "POINT_ESTIMATE")
        self.assertEqual(record["predicted_value"], 10.0)
        self.assertIsNone(record["predicted_probability"])

    def test_actual_and_error_and_engine_and_ref_are_none_initially(self):
        record = _build_probability()
        self.assertIsNone(record["actual"])
        self.assertIsNone(record["error"])
        self.assertIsNone(record["engine"])
        self.assertIsNone(record["computation_provenance_ref"])

    def test_entry_has_a_nonempty_stage1_integrity_hash(self):
        record = _build_probability()
        self.assertTrue(record["stage1_integrity_hash"])
        self.assertEqual(len(record["stage1_integrity_hash"]), 64)

    def test_stage1_hash_is_a_real_sha256_over_exactly_the_five_fields(self):
        from ai_lego.core.support import sha256_json

        record = _build_probability()
        expected = sha256_json({field: record[field] for field in STAGE1_HASHED_FIELDS})
        self.assertEqual(record["stage1_integrity_hash"], expected)

    def test_stage1_hash_does_not_cover_id_or_version(self):
        record_a = _build_probability(record_id="PREDICT-AAA")
        record_b = _build_probability(record_id="PREDICT-BBB")
        self.assertEqual(record_a["stage1_integrity_hash"], record_b["stage1_integrity_hash"])

    def test_stage1_hash_changes_when_horizon_changes(self):
        record_a = _build_probability(horizon="2026-12-31")
        record_b = _build_probability(horizon="2027-01-01")
        self.assertNotEqual(record_a["stage1_integrity_hash"], record_b["stage1_integrity_hash"])

    def test_generated_by_method_defaults_to_method_id(self):
        record = _build_probability()
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_version_defaults_to_1_0_0(self):
        record = generate_prediction_tracking_record("PREDICT-T-003", "s", "PROBABILITY", "h", PROV, predicted_probability=0.5)
        self.assertEqual(record["version"], "1.0.0")

    def test_probability_boundary_zero_is_legal(self):
        record = _build_probability(predicted_probability=0.0)
        self.assertEqual(record["predicted_probability"], 0.0)

    def test_probability_boundary_one_is_legal(self):
        record = _build_probability(predicted_probability=1.0)
        self.assertEqual(record["predicted_probability"], 1.0)

    def test_point_estimate_negative_value_is_legal(self):
        record = _build_point_estimate(predicted_value=-5.0)
        self.assertEqual(record["predicted_value"], -5.0)

    def test_point_estimate_zero_value_is_legal(self):
        record = _build_point_estimate(predicted_value=0.0)
        self.assertEqual(record["predicted_value"], 0.0)


class PredictionFieldsInvariantConstructionTests(unittest.TestCase):
    """The XOR-pairing invariant between prediction_type and predicted_probability/predicted_value."""

    def test_both_probability_and_value_set_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=0.5, predicted_value=1.0)

    def test_neither_set_for_probability_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=None)

    def test_neither_set_for_point_estimate_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_point_estimate(predicted_value=None)

    def test_point_estimate_with_stray_probability_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_point_estimate(predicted_value=1.0, predicted_probability=0.2)

    def test_probability_above_one_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=1.5)

    def test_probability_below_zero_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=-0.1)

    def test_probability_as_bool_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=True)

    def test_probability_nan_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=float("nan"))

    def test_probability_infinite_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability=float("inf"))

    def test_probability_string_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_probability(predicted_probability="0.5")

    def test_point_estimate_value_as_bool_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_point_estimate(predicted_value=False)

    def test_point_estimate_value_nan_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_point_estimate(predicted_value=float("nan"))

    def test_point_estimate_value_infinite_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_FIELDS"):
            _build_point_estimate(predicted_value=float("inf"))

    def test_invalid_prediction_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_TYPE"):
            _build_probability(prediction_type="MAYBE")

    def test_none_prediction_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PREDICTION_TYPE"):
            _build_probability(prediction_type=None)


class Stage1FieldValidationTests(unittest.TestCase):
    def test_empty_record_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_RECORD_ID"):
            _build_probability(record_id="")

    def test_record_id_without_prefix_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_RECORD_ID"):
            _build_probability(record_id="NOTPREFIXED-001")

    def test_non_string_record_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_RECORD_ID"):
            _build_probability(record_id=123)

    def test_empty_statement_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_STATEMENT"):
            _build_probability(statement="")

    def test_whitespace_statement_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_STATEMENT"):
            _build_probability(statement="   ")

    def test_non_string_version_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_VERSION"):
            _build_probability(version=1.0)

    def test_empty_horizon_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_HORIZON"):
            _build_probability(horizon="")

    def test_whitespace_horizon_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_HORIZON"):
            _build_probability(horizon="   ")

    def test_non_string_horizon_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_HORIZON"):
            _build_probability(horizon=20261231)

    def test_invalid_provenance_missing_epistemic_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PROVENANCE"):
            _build_probability(provenance={"authorship_state": "HUMAN_ORIGINAL"})

    def test_invalid_provenance_bad_epistemic_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PROVENANCE"):
            _build_probability(provenance={"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_ORIGINAL", "locked": None})

    def test_invalid_provenance_non_dict_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PROVENANCE"):
            _build_probability(provenance="not-a-dict")

    def test_invalid_provenance_locked_epistemic_mismatch_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_PROVENANCE"):
            _build_probability(provenance={"epistemic_type": "HYPOTHESIS", "authorship_state": "HUMAN_ORIGINAL", "locked": "LOCKED_FACT"})


class RecordActualConstructionTests(unittest.TestCase):
    def test_probability_happy_path_attaches_actual_and_error(self):
        entry = _build_probability(predicted_probability=0.7)
        record = record_actual(entry, ACTUAL_PROV, "2026-09-08T00:00:00Z", observed_outcome=True)
        self.assertIsNotNone(record["actual"])
        self.assertEqual(record["actual"]["observed_outcome"], True)
        self.assertIsNone(record["actual"]["observed_value"])
        self.assertEqual(record["error"]["metric"], "BRIER_SCORE")
        self.assertAlmostEqual(record["error"]["value"], (0.7 - 1.0) ** 2)
        self.assertIsNone(record["error"]["relative_value"])

    def test_probability_false_outcome_brier_score(self):
        entry = _build_probability(predicted_probability=0.7)
        record = record_actual(entry, ACTUAL_PROV, "t", observed_outcome=False)
        self.assertAlmostEqual(record["error"]["value"], 0.7**2)

    def test_point_estimate_happy_path_attaches_actual_and_error(self):
        entry = _build_point_estimate(predicted_value=10.0)
        record = record_actual(entry, ACTUAL_PROV, "2026-09-08T00:00:00Z", observed_value=12.0)
        self.assertEqual(record["actual"]["observed_value"], 12.0)
        self.assertIsNone(record["actual"]["observed_outcome"])
        self.assertEqual(record["error"]["metric"], "ABSOLUTE_ERROR")
        self.assertAlmostEqual(record["error"]["value"], 2.0)
        self.assertAlmostEqual(record["error"]["relative_value"], 2.0 / 12.0)

    def test_point_estimate_zero_observed_value_yields_null_relative_error(self):
        entry = _build_point_estimate(predicted_value=5.0)
        record = record_actual(entry, ACTUAL_PROV, "t", observed_value=0.0)
        self.assertEqual(record["error"]["value"], 5.0)
        self.assertIsNone(record["error"]["relative_value"])

    def test_engine_and_computation_provenance_ref_set_on_completion(self):
        entry = _build_probability()
        record = record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)
        self.assertEqual(record["engine"], "local_python_deterministic_compute")
        self.assertEqual(record["computation_provenance_ref"], "ai_lego.compute.prediction_tracking.error.compute_prediction_error")

    def test_stage1_fields_copied_forward_verbatim(self):
        """record_actual has no parameter for statement/prediction_type/predicted_probability/
        predicted_value/horizon -- a caller cannot pass a different value for them even by trying to."""
        import inspect

        signature = inspect.signature(record_actual)
        self.assertNotIn("statement", signature.parameters)
        self.assertNotIn("prediction_type", signature.parameters)
        self.assertNotIn("predicted_probability", signature.parameters)
        self.assertNotIn("predicted_value", signature.parameters)
        self.assertNotIn("horizon", signature.parameters)

        entry = _build_probability(statement="original statement", horizon="original horizon")
        record = record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)
        self.assertEqual(record["statement"], "original statement")
        self.assertEqual(record["horizon"], "original horizon")

    def test_double_recording_refused(self):
        entry = _build_probability()
        record = record_actual(entry, ACTUAL_PROV, "t1", observed_outcome=True)
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_ACTUAL_ALREADY_RECORDED"):
            record_actual(record, ACTUAL_PROV, "t2", observed_outcome=False)

    def test_tampered_predicted_probability_before_record_actual_is_refused(self):
        entry = _build_probability()
        tampered = dict(entry)
        tampered["predicted_probability"] = 0.99
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_STAGE1_HASH_MISMATCH"):
            record_actual(tampered, ACTUAL_PROV, "t", observed_outcome=True)

    def test_tampered_horizon_before_record_actual_is_refused(self):
        entry = _build_probability()
        tampered = dict(entry)
        tampered["horizon"] = "a different horizon entirely"
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_STAGE1_HASH_MISMATCH"):
            record_actual(tampered, ACTUAL_PROV, "t", observed_outcome=True)

    def test_tampered_statement_before_record_actual_is_refused(self):
        entry = _build_probability()
        tampered = dict(entry)
        tampered["statement"] = "a different statement entirely"
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_STAGE1_HASH_MISMATCH"):
            record_actual(tampered, ACTUAL_PROV, "t", observed_outcome=True)

    def test_entry_non_dict_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ENTRY"):
            record_actual("not-a-dict", ACTUAL_PROV, "t", observed_outcome=True)

    def test_entry_missing_keys_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ENTRY"):
            record_actual({"id": "PREDICT-X"}, ACTUAL_PROV, "t", observed_outcome=True)

    def test_entry_with_extra_unknown_key_refused(self):
        entry = _build_probability()
        entry["extra_field"] = "unexpected"
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ENTRY"):
            record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)

    def test_wrong_pairing_observed_value_for_probability_entry_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS"):
            record_actual(entry, ACTUAL_PROV, "t", observed_value=1.0)

    def test_wrong_pairing_observed_outcome_for_point_estimate_entry_refused(self):
        entry = _build_point_estimate()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS"):
            record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)

    def test_neither_observed_field_set_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS"):
            record_actual(entry, ACTUAL_PROV, "t")

    def test_both_observed_fields_set_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS"):
            record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True, observed_value=1.0)

    def test_observed_outcome_non_bool_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_ACTUAL_FIELDS"):
            record_actual(entry, ACTUAL_PROV, "t", observed_outcome=1)

    def test_empty_recorded_at_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_EMPTY_RECORDED_AT"):
            record_actual(entry, ACTUAL_PROV, "", observed_outcome=True)

    def test_invalid_outcome_provenance_refused(self):
        entry = _build_probability()
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_INVALID_OUTCOME_PROVENANCE"):
            record_actual(entry, {"epistemic_type": "NOT_REAL"}, "t", observed_outcome=True)

    def test_builder_rebuilds_not_aliases_the_actual_dict(self):
        entry = _build_probability()
        record = record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)
        record["actual"]["observed_outcome"] = False
        # Recomputing from the entry again (fresh call) must not be polluted by mutating a prior result.
        record2 = record_actual(entry, ACTUAL_PROV, "t", observed_outcome=True)
        self.assertTrue(record2["actual"]["observed_outcome"])


class PredictionCommitmentIntegrityGateTests(unittest.TestCase):
    """Invariant #1, re-derived independently on every call."""

    def test_stage1_only_entry_passes(self):
        record = _build_probability()
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "PASS")

    def test_completed_entry_passes(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_predicted_probability_on_stage1_only_fails(self):
        record = _build_probability()
        record["predicted_probability"] = 0.01
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_statement_on_stage1_only_fails(self):
        record = _build_probability()
        record["statement"] = "a rewritten statement"
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_horizon_on_stage1_only_fails(self):
        record = _build_probability()
        record["horizon"] = "a rewritten horizon"
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_prediction_type_on_stage1_only_fails(self):
        record = _build_probability()
        record["prediction_type"] = "POINT_ESTIMATE"
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_predicted_value_on_point_estimate_fails(self):
        record = _build_point_estimate()
        record["predicted_value"] = 999.0
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_predicted_probability_after_actual_attached_fails(self):
        """The hash catches retroactive tampering EVEN AFTER actual is known -- exactly the scenario this
        invariant exists to prevent (making the original prediction look better in hindsight)."""
        record = record_actual(_build_probability(predicted_probability=0.2), ACTUAL_PROV, "t", observed_outcome=True)
        record["predicted_probability"] = 0.99  # retroactively "improve" the forecast after knowing it occurred
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_missing_stage1_integrity_hash_fails_closed(self):
        record = _build_probability()
        del record["stage1_integrity_hash"]
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_stage1_integrity_hash_not_a_string_fails_closed(self):
        record = _build_probability()
        record["stage1_integrity_hash"] = 12345
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_empty_stage1_integrity_hash_fails_closed(self):
        record = _build_probability()
        record["stage1_integrity_hash"] = ""
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        for malformed in (None, [], "not-a-dict", 42):
            self.assertEqual(evaluate_prediction_commitment_integrity_gate(malformed, "test", "t")["status"], "FAIL")

    def test_hand_tampered_non_serializable_field_fails_closed_not_crashes(self):
        record = _build_probability()
        record["predicted_value"] = {1, 2, 3}  # a set is not JSON-serializable
        result = evaluate_prediction_commitment_integrity_gate(record, "test", "t")
        self.assertEqual(result["status"], "FAIL")


class GenuineComputeGateTests(unittest.TestCase):
    """Invariant #2, re-derived independently on every call."""

    def test_stage1_only_entry_passes_vacuously(self):
        record = _build_probability()
        result = evaluate_genuine_compute_gate(record, "test", "t")
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["actual_present"], False)

    def test_completed_probability_entry_passes(self):
        record = record_actual(_build_probability(predicted_probability=0.7), ACTUAL_PROV, "t", observed_outcome=True)
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "PASS")

    def test_completed_point_estimate_entry_passes(self):
        record = record_actual(_build_point_estimate(predicted_value=10.0), ACTUAL_PROV, "t", observed_value=12.0)
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_observed_outcome_without_matching_error_update_fails(self):
        record = record_actual(_build_probability(predicted_probability=0.2), ACTUAL_PROV, "t", observed_outcome=False)
        record["actual"] = {**record["actual"], "observed_outcome": True}  # error still says brier for outcome=False
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_observed_value_without_matching_error_update_fails(self):
        record = record_actual(_build_point_estimate(predicted_value=10.0), ACTUAL_PROV, "t", observed_value=12.0)
        record["actual"] = {**record["actual"], "observed_value": 50.0}
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_error_value_alone_fails(self):
        record = record_actual(_build_probability(predicted_probability=0.7), ACTUAL_PROV, "t", observed_outcome=True)
        record["error"] = {**record["error"], "value": 0.0001}
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_error_metric_fails(self):
        record = record_actual(_build_probability(predicted_probability=0.7), ACTUAL_PROV, "t", observed_outcome=True)
        record["error"] = {**record["error"], "metric": "ABSOLUTE_ERROR"}
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_consistently_tampered_actual_and_error_together_evades_detection_disclosed_limitation(self):
        """DISCLOSED, not silently dropped (module docstring DESIGN #1): sha256_json/the recompute check are
        tamper EVIDENCE against naive/incomplete edits, never cryptographic security against a
        sophisticated tamperer who edits actual AND recomputes a self-consistent error the same way this
        module itself does. This test proves and documents that limitation exists, matching this package's
        own house style of disclosing, not hiding, a known scope boundary (e.g. fault_tree's own
        OQ-FAULTTREE-3 performance disclosure)."""
        record = record_actual(_build_probability(predicted_probability=0.7), ACTUAL_PROV, "t", observed_outcome=True)
        tampered_actual = {**record["actual"], "observed_outcome": False}
        consistent_error = compute_prediction_error("PROBABILITY", 0.7, None, False, None)
        record["actual"] = tampered_actual
        record["error"] = consistent_error
        # The genuine_compute gate CANNOT tell this apart from an honest record -- the recompute matches.
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "PASS")
        # Invariant #1 (prediction_commitment_integrity) is UNTOUCHED by this mutation and still passes --
        # this tamper only affects stage 2, which is exactly the scope this test documents as uncovered.
        self.assertEqual(evaluate_prediction_commitment_integrity_gate(record, "test", "t")["status"], "PASS")

    def test_malformed_error_shape_fails_closed(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["error"] = {"metric": "BRIER_SCORE"}  # missing value/relative_value
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_error_present_but_actual_deleted_fails(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["actual"] = None
        # actual_present False makes this vacuously PASS again (nothing to check) -- error is now orphaned
        # but genuine_compute only concerns itself with actual<->error consistency, not orphan detection.
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "PASS")

    def test_actual_present_but_not_a_dict_fails_closed(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["actual"] = "not-a-dict"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_wrong_computation_provenance_ref_fails(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["computation_provenance_ref"] = "ai_lego.compute.nonexistent.module.fn"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_wrong_engine_string_fails(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["engine"] = "llm_generated"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", "t")["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        for malformed in (None, [], "not-a-dict", 42):
            self.assertEqual(evaluate_genuine_compute_gate(malformed, "test", "t")["status"], "FAIL")


class ProvenanceRequiredGateTests(unittest.TestCase):
    def test_stage1_only_passes(self):
        record = _build_probability()
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "t")["status"], "PASS")

    def test_completed_passes(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_top_level_provenance_fails(self):
        record = _build_probability()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "t")["status"], "FAIL")

    def test_hand_tampered_actual_provenance_fails(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["actual"] = {**record["actual"], "provenance": {"epistemic_type": "NOT_REAL"}}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "t")["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        self.assertEqual(evaluate_provenance_required_gate(None, "test", "t")["status"], "FAIL")


class StructureGateTests(unittest.TestCase):
    def test_probability_entry_passes(self):
        record = _build_probability()
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "PASS")

    def test_point_estimate_entry_passes(self):
        record = _build_point_estimate()
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "PASS")

    def test_missing_id_fails(self):
        record = _build_probability()
        del record["id"]
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_wrong_prefix_id_fails(self):
        record = _build_probability()
        record["id"] = "WRONG-001"
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_non_string_version_fails(self):
        record = _build_probability()
        record["version"] = 1
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_empty_statement_fails(self):
        record = _build_probability()
        record["statement"] = ""
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_empty_horizon_fails(self):
        record = _build_probability()
        record["horizon"] = "   "
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_mismatched_pairing_fails(self):
        record = _build_probability()
        record["predicted_value"] = 5.0  # both now set -- PROBABILITY should have predicted_value None
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_invalid_prediction_type_fails(self):
        record = _build_probability()
        record["prediction_type"] = "MAYBE"
        self.assertEqual(evaluate_prediction_tracking_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        for malformed in (None, [], "not-a-dict", 42):
            self.assertEqual(evaluate_prediction_tracking_structure_gate(malformed, "test", "t")["status"], "FAIL")


class AllGatesAndAggregateTests(unittest.TestCase):
    def test_stage1_only_probability_passes_all_four_gates(self):
        results = evaluate_prediction_tracking_gates(_build_probability(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(
            {r["gate_id"] for r in results},
            {"provenance_required", "prediction_tracking_structure", "prediction_commitment_integrity", "genuine_compute"},
        )
        self.assertTrue(all_gates_pass(results))

    def test_completed_probability_passes_all_four_gates(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        results = evaluate_prediction_tracking_gates(record, "test", "2026-09-08T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_completed_point_estimate_passes_all_four_gates(self):
        record = record_actual(_build_point_estimate(), ACTUAL_PROV, "t", observed_value=11.0)
        results = evaluate_prediction_tracking_gates(record, "test", "2026-09-08T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_returns_false_when_one_gate_fails(self):
        record = _build_probability()
        record["horizon"] = ""
        results = evaluate_prediction_tracking_gates(record, "test", "t")
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_true_for_not_applicable_status(self):
        synthetic = [{"gate_id": "x", "status": "NOT_APPLICABLE", "evidence": [], "validator": "t", "timestamp": "t"}]
        self.assertTrue(all_gates_pass(synthetic))

    def test_all_gates_pass_false_when_any_status_is_blocked(self):
        synthetic = [{"gate_id": "x", "status": "BLOCKED", "evidence": [], "validator": "t", "timestamp": "t"}]
        self.assertFalse(all_gates_pass(synthetic))


class ComputePredictionErrorUnitTests(unittest.TestCase):
    """Direct tests of the pure compute function, independent of the method module."""

    def test_brier_score_perfect_prediction_true_outcome(self):
        result = compute_prediction_error("PROBABILITY", 1.0, None, True, None)
        self.assertEqual(result, {"metric": "BRIER_SCORE", "value": 0.0, "relative_value": None})

    def test_brier_score_perfect_prediction_false_outcome(self):
        result = compute_prediction_error("PROBABILITY", 0.0, None, False, None)
        self.assertEqual(result["value"], 0.0)

    def test_brier_score_worst_case_is_one(self):
        result = compute_prediction_error("PROBABILITY", 1.0, None, False, None)
        self.assertEqual(result["value"], 1.0)

    def test_brier_score_midpoint(self):
        result = compute_prediction_error("PROBABILITY", 0.5, None, True, None)
        self.assertAlmostEqual(result["value"], 0.25)

    def test_absolute_error_basic(self):
        result = compute_prediction_error("POINT_ESTIMATE", None, 10.0, None, 7.0)
        self.assertEqual(result["metric"], "ABSOLUTE_ERROR")
        self.assertEqual(result["value"], 3.0)
        self.assertAlmostEqual(result["relative_value"], 3.0 / 7.0)

    def test_absolute_error_over_prediction_and_under_prediction_symmetric(self):
        over = compute_prediction_error("POINT_ESTIMATE", None, 10.0, None, 7.0)
        under = compute_prediction_error("POINT_ESTIMATE", None, 7.0, None, 10.0)
        self.assertEqual(over["value"], under["value"])

    def test_absolute_error_negative_values_handled_by_abs(self):
        result = compute_prediction_error("POINT_ESTIMATE", None, -5.0, None, -3.0)
        self.assertEqual(result["value"], 2.0)

    def test_absolute_error_zero_observed_value_yields_null_relative(self):
        result = compute_prediction_error("POINT_ESTIMATE", None, 5.0, None, 0.0)
        self.assertEqual(result["value"], 5.0)
        self.assertIsNone(result["relative_value"])

    def test_absolute_error_exact_match_is_zero(self):
        result = compute_prediction_error("POINT_ESTIMATE", None, 10.0, None, 10.0)
        self.assertEqual(result["value"], 0.0)
        self.assertEqual(result["relative_value"], 0.0)

    def test_invalid_prediction_type_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_PREDICTION_TYPE"):
            compute_prediction_error("NOPE", None, None, None, None)

    def test_probability_out_of_range_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_PROBABILITY"):
            compute_prediction_error("PROBABILITY", 1.5, None, True, None)

    def test_probability_non_finite_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_PROBABILITY"):
            compute_prediction_error("PROBABILITY", float("nan"), None, True, None)

    def test_observed_outcome_non_bool_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_OUTCOME"):
            compute_prediction_error("PROBABILITY", 0.5, None, "yes", None)

    def test_predicted_value_non_finite_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_PREDICTED_VALUE"):
            compute_prediction_error("POINT_ESTIMATE", None, float("inf"), None, 1.0)

    def test_observed_value_non_finite_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "PREDICTIONTRACKING_COMPUTE_INVALID_OBSERVED_VALUE"):
            compute_prediction_error("POINT_ESTIMATE", None, 1.0, None, math.nan)

    def test_result_is_rounded_to_eight_decimal_places(self):
        result = compute_prediction_error("POINT_ESTIMATE", None, 1.0, None, 3.0)
        self.assertEqual(result["value"], round(result["value"], 8))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_stage1_only_record_validates_against_the_real_schema(self):
        self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, _build_probability(), "stage1-only record")

    def test_completed_probability_record_validates_against_the_real_schema(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "completed probability record")

    def test_completed_point_estimate_record_validates_against_the_real_schema(self):
        record = record_actual(_build_point_estimate(), ACTUAL_PROV, "t", observed_value=11.0)
        self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "completed point estimate record")

    def test_schema_own_worked_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "prediction-tracking-record.schema.yaml"
        doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = doc["examples"]
        self.assertEqual(len(examples), 2)
        for example in examples:
            record = example["value"]
            self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, f"schema example {record['id']}")
            gate_results = evaluate_prediction_tracking_gates(record, "spec-conformance-test", "2026-09-08T00:00:00Z")
            self.assertTrue(all_gates_pass(gate_results), f"example {record['id']} failed a gate: {gate_results}")

    def test_schema_rejects_malformed_stage1_integrity_hash(self):
        record = _build_probability()
        record["stage1_integrity_hash"] = "not-a-hex-hash"
        with self.assertRaises(Exception):
            self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "malformed hash")

    def test_schema_rejects_probability_above_one(self):
        record = _build_probability()
        record["predicted_probability"] = 1.5
        with self.assertRaises(Exception):
            self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "probability out of range")

    def test_schema_rejects_mismatched_prediction_type_pairing_via_conditional(self):
        record = _build_probability()
        record["predicted_value"] = 5.0  # PROBABILITY type but predicted_value also set -- allOf/if/then should reject
        with self.assertRaises(Exception):
            self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "mismatched pairing")

    def test_schema_rejects_missing_required_error_key(self):
        record = record_actual(_build_probability(), ACTUAL_PROV, "t", observed_outcome=True)
        record["error"] = {"metric": "BRIER_SCORE", "value": 0.1}  # missing relative_value
        with self.assertRaises(Exception):
            self.contracts.validate(PREDICTION_TRACKING_RECORD_SCHEMA, record, "incomplete error object")

    def test_mutating_the_callers_own_provenance_dict_is_the_same_object_by_design(self):
        """provenance is stored BY REFERENCE, same family-wide convention decision_journal/fault_tree/
        post_mortem all already follow (not rebuilt as a defensive copy)."""
        prov = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")
        record = _build_probability(provenance=prov)
        self.assertIs(record["provenance"], prov)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_prediction_tracking_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_record_id_prefix_constant_matches_the_schema_pattern(self):
        self.assertEqual(RECORD_ID_PREFIX, "PREDICT-")


if __name__ == "__main__":
    unittest.main()
