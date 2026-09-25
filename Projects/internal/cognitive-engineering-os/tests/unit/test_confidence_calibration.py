"""Mutation-style tests for ``epistemic.confidence_calibration`` (F10 epistemic quality family, quantitative pair
member 2/2 built this batch).

THE real invariant (``brier_score`` GENUINE_COMPUTE -- the disclosed, standard proper-scoring-rule formula, see
module docstring) plus the structural invariants supporting it (>=2 predictions, well-formed
{id, stated_confidence, actual_outcome} items, stated_confidence a real finite [0,1] number excluding bool,
actual_outcome a real bool excluding int, unique prediction ids), exercised at BOTH layers: construction-time
refusal (``generate_confidence_calibration`` raising a specific ``InvariantViolation`` code, or a plain
``TypeError`` for the GENUINE_COMPUTE smuggling attempt) and independent gate re-derivation
(``evaluate_confidence_calibration_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same batch added (``typed-objects/confidence-calibration.schema.yaml``). Includes a hand-computed
worked example (3 predictions -> brier_score=0.62/3~=0.20666667) and boundary cases (all-correct, all-wrong).
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.confidence_calibration import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_brier_score,
    evaluate_confidence_calibration_content_integrity_gate,
    evaluate_confidence_calibration_gates,
    evaluate_provenance_required_gate,
    generate_confidence_calibration,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CONFIDENCE_CALIBRATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/confidence-calibration.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _predictions() -> list[dict]:
    return [
        {"id": "P1", "stated_confidence": 0.9, "actual_outcome": True},
        {"id": "P2", "stated_confidence": 0.6, "actual_outcome": False},
        {"id": "P3", "stated_confidence": 0.5, "actual_outcome": True},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(predictions=_predictions(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_calibration(*, record_id: str = "CALIB-T-001", **overrides: object):
    return generate_confidence_calibration(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_calibration_validates_against_the_real_schema(self):
        self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, _valid_calibration(), "confidence calibration")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, calibration = live.invoke(METHOD_ID, generate_confidence_calibration, "CALIB-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.confidence_calibration.contract.yaml")
        self.assertEqual(calibration["id"], "CALIB-T-INVOKE")

    def test_empty_catalog_blocks_confidence_calibration_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_calibration())
        tampered["predictions"] = [tampered["predictions"][0]]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, tampered, "tampered calibration")
        gate = evaluate_confidence_calibration_content_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        calibration = _valid_calibration()
        calibration["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, calibration, "calibration with a smuggled top-level key")

    def test_schema_rejects_missing_brier_score(self):
        calibration = _valid_calibration()
        del calibration["brier_score"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, calibration, "calibration with brier_score removed")

    def test_schema_rejects_int_actual_outcome(self):
        calibration = _valid_calibration()
        calibration["predictions"][0]["actual_outcome"] = 1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, calibration, "calibration with an int actual_outcome")

    def test_schema_rejects_smuggled_key_on_a_prediction_item(self):
        calibration = _valid_calibration()
        calibration["predictions"][0]["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFIDENCE_CALIBRATION_SCHEMA, calibration, "calibration with a smuggled prediction key")

    def test_id_is_distinct_from_a_sibling_f10_machine_id(self):
        self.assertEqual(METHOD_ID, "epistemic.confidence_calibration")
        self.assertNotEqual(METHOD_ID, "epistemic.bayesian_updating")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.confidence_calibration.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.confidence_calibration contract")


class GenuineComputeTests(unittest.TestCase):
    """brier_score is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_brier_score_parameter(self):
        params = inspect.signature(generate_confidence_calibration).parameters
        self.assertNotIn("brier_score", params)

    def test_caller_supplied_brier_score_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_confidence_calibration("CALIB-T-002", **_kwargs(), brier_score=0.0)  # type: ignore[call-arg]

    def test_caller_supplied_brier_score_on_a_prediction_item_is_refused(self):
        bad_predictions = [{**_predictions()[0], "brier_score": 0.0}, _predictions()[1]]
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=bad_predictions)

    def test_generated_brier_score_matches_the_pure_function(self):
        calibration = _valid_calibration()
        self.assertEqual(calibration["brier_score"], compute_brier_score(_predictions()))


class HandComputedWorkedExampleTests(unittest.TestCase):
    """mean((stated_confidence - (1.0 if actual_outcome else 0.0))**2) applied by hand."""

    def test_brier_score_matches_the_hand_computed_mean(self):
        # (0.9-1)^2=0.01, (0.6-0)^2=0.36, (0.5-1)^2=0.25 -> mean = 0.62/3 = 0.206666... -> round(., 8) = 0.20666667
        self.assertEqual(compute_brier_score(_predictions()), round(0.62 / 3, 8))
        self.assertEqual(compute_brier_score(_predictions()), 0.20666667)

    def test_built_calibration_carries_the_hand_computed_brier_score(self):
        calibration = _valid_calibration()
        self.assertEqual(calibration["brier_score"], 0.20666667)


class BoundaryTests(unittest.TestCase):
    def test_all_correct_predictions_score_zero(self):
        all_correct = [
            {"id": "P1", "stated_confidence": 1.0, "actual_outcome": True},
            {"id": "P2", "stated_confidence": 1.0, "actual_outcome": True},
        ]
        self.assertEqual(compute_brier_score(all_correct), 0.0)
        calibration = _valid_calibration(predictions=all_correct)
        self.assertEqual(calibration["brier_score"], 0.0)

    def test_all_wrong_predictions_score_one(self):
        all_wrong = [
            {"id": "P1", "stated_confidence": 1.0, "actual_outcome": False},
            {"id": "P2", "stated_confidence": 1.0, "actual_outcome": False},
        ]
        self.assertEqual(compute_brier_score(all_wrong), 1.0)
        calibration = _valid_calibration(predictions=all_wrong)
        self.assertEqual(calibration["brier_score"], 1.0)

    def test_exactly_two_predictions_is_the_minimum_accepted(self):
        calibration = _valid_calibration(predictions=_predictions()[:2])
        self.assertEqual(len(calibration["predictions"]), 2)

    def test_single_prediction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_TOO_FEW_PREDICTIONS"):
            _valid_calibration(predictions=[_predictions()[0]])

    def test_zero_predictions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_TOO_FEW_PREDICTIONS"):
            _valid_calibration(predictions=[])

    def test_non_list_predictions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_TOO_FEW_PREDICTIONS"):
            _valid_calibration(predictions="not-a-list")


class PredictionValidationTests(unittest.TestCase):
    """stated_confidence must be a real finite [0,1] number (bool excluded, same trap
    stakeholders.game_theory's own _is_number_excluding_bool guards against). actual_outcome must be a genuine
    bool -- NOT an int 0/1, the OPPOSITE direction of the usual bool-excluded-from-numeric guard."""

    def test_stated_confidence_above_one_is_refused(self):
        bad = {**_predictions()[0], "stated_confidence": 1.1}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_boolean_stated_confidence_is_refused(self):
        bad = {**_predictions()[0], "stated_confidence": True}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_nan_stated_confidence_is_refused(self):
        bad = {**_predictions()[0], "stated_confidence": float("nan")}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_int_actual_outcome_is_refused(self):
        """Silently accepting an int would still numerically compute a score (Python 0/1 behaves like
        False/True arithmetically) but is a category error this method must refuse, not tolerate."""
        bad = {**_predictions()[0], "actual_outcome": 1}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_string_actual_outcome_is_refused(self):
        bad = {**_predictions()[0], "actual_outcome": "true"}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_empty_prediction_id_is_refused(self):
        bad = {**_predictions()[0], "id": "   "}
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_missing_required_key_on_prediction_is_refused(self):
        bad = dict(_predictions()[0])
        del bad["actual_outcome"]
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=[bad, _predictions()[1]])

    def test_duplicate_prediction_id_is_refused(self):
        dup = [_predictions()[0], {**_predictions()[1], "id": _predictions()[0]["id"]}]
        with self.assertRaisesRegex(InvariantViolation, "CALIB_DUPLICATE_PREDICTION_ID"):
            _valid_calibration(predictions=dup)

    def test_non_dict_prediction_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PREDICTION"):
            _valid_calibration(predictions=["not-a-dict", _predictions()[1]])


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CALIB-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_ID"):
            _valid_calibration(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_ID"):
            _valid_calibration(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_VERSION"):
            generate_confidence_calibration("CALIB-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CALIB_INVALID_PROVENANCE"):
            _valid_calibration(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID calibration's raw dict directly (never going through the builder again), then call
    the gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_calibration(self):
        results = evaluate_confidence_calibration_gates(_valid_calibration(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_brier_score(self):
        record = copy.deepcopy(_valid_calibration())
        record["brier_score"] = 0.0  # true brier_score for these 3 predictions is 0.20666667
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_int_actual_outcome(self):
        record = copy.deepcopy(_valid_calibration())
        record["predictions"][0]["actual_outcome"] = 1
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_calibration())
        record["extra_field"] = "smuggled"
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_calibration())
        del record["predictions"]
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_smuggled_key_on_a_prediction_item(self):
        record = copy.deepcopy(_valid_calibration())
        record["predictions"][0]["approved"] = True
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_duplicate_prediction_id(self):
        record = copy.deepcopy(_valid_calibration())
        record["predictions"][1]["id"] = record["predictions"][0]["id"]
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_too_few_predictions(self):
        record = copy.deepcopy(_valid_calibration())
        record["predictions"] = [record["predictions"][0]]
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_confidence_calibration_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_calibration())
        record["id"] = "WRONG-001"
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_calibration())
        record["version"] = 1
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_calibration())
        record["brier_score"] = 0.20666667 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_confidence_calibration_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_calibration(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_calibration())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """Mirrors challenge.fmea's own aliasing test class -- mutating the caller's own input list/dicts after
    construction must not silently rewrite a gate-passed record. A per-item dict(item) shallow copy does NOT
    copy nested list fields -- there are none here (each prediction is flat), but the per-item dict itself must
    still be freshly built, not the caller's own object."""

    def test_builder_does_not_alias_the_callers_supplied_prediction_dicts(self):
        predictions = _predictions()
        calibration = _valid_calibration(predictions=predictions)
        predictions[0]["stated_confidence"] = 0.01
        stored_p1 = next(p for p in calibration["predictions"] if p["id"] == "P1")
        self.assertNotEqual(stored_p1["stated_confidence"], 0.01)
        self.assertEqual(stored_p1["stated_confidence"], 0.9)

    def test_builder_does_not_alias_the_callers_supplied_predictions_list(self):
        predictions = _predictions()
        calibration = _valid_calibration(predictions=predictions)
        predictions.append({"id": "P4", "stated_confidence": 0.1, "actual_outcome": False})
        self.assertEqual(len(calibration["predictions"]), 3)


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_confidence_calibration_gates_returns_two_gates_in_order(self):
        results = evaluate_confidence_calibration_gates(_valid_calibration(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "confidence_calibration_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.confidence_calibration")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        calibration = _valid_calibration()
        self.assertEqual(set(calibration.keys()), {"id", "version", "generated_by_method", "predictions", "brier_score", "provenance"})

    def test_builder_does_not_leak_extra_prediction_keys(self):
        calibration = _valid_calibration()
        for prediction in calibration["predictions"]:
            self.assertEqual(set(prediction.keys()), {"id", "stated_confidence", "actual_outcome"})


if __name__ == "__main__":
    unittest.main()
