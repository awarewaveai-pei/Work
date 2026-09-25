"""Mutation-style tests for ``experiment.smoke_test`` (F15 experiment & validation family, Atlas L745).

Atlas's own "threshold" pipeline stage is proven at BOTH independent layers: the construction-time
builder refuses a post-hoc-declared threshold, an invalid threshold, or an inconsistent decision, and
the independent gates re-derive the same rules directly from a raw (possibly hand-tampered) dict,
never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.smoke_test import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_decision_consistency_gate,
    evaluate_preregistration_gate,
    evaluate_provenance_required_gate,
    evaluate_smoke_test_gates,
    generate_smoke_test_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SMOKE_TEST_SCHEMA = "ai-lego://specs/cognitive/typed-objects/smoke-test-record.schema.yaml"
PROVENANCE = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        offer_description="「AI 週報自動生成」預售頁，Facebook 廣告導流",
        signup_or_preorder_threshold=100,
        threshold_declared_at="2026-09-01T00:00:00Z",
        measured_signups=143,
        measured_at="2026-09-08T00:00:00Z",
        decision="GO",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_experiment(*, record_id: str = "SMOKETEST-T-001", **overrides: object):
    return generate_smoke_test_experiment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_experiment_validates_against_the_real_schema(self):
        self.contracts.validate(SMOKE_TEST_SCHEMA, _valid_experiment(), "smoke test experiment")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, experiment = live.invoke(METHOD_ID, generate_smoke_test_experiment, "SMOKETEST-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.smoke_test.contract.yaml")
        self.assertEqual(experiment["id"], "SMOKETEST-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        experiment = _valid_experiment()
        experiment["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SMOKE_TEST_SCHEMA, experiment, "experiment with a smuggled top-level key")

    def test_schema_rejects_an_illegal_decision_value(self):
        experiment = _valid_experiment()
        experiment["decision"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SMOKE_TEST_SCHEMA, experiment, "experiment with an illegal decision value")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.smoke_test.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.smoke_test contract")


class PreregistrationTests(unittest.TestCase):
    """Atlas L745's own 'threshold' pipeline stage -- a pre-declared bar, not a post-hoc rationalization."""

    def test_threshold_declared_after_measured_at_is_refused(self):
        kwargs = _kwargs(threshold_declared_at="2026-09-09T00:00:00Z")  # after measured_at 09-08
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_THRESHOLD_NOT_PREREGISTERED"):
            generate_smoke_test_experiment("SMOKETEST-T-002", **kwargs)

    def test_threshold_declared_at_the_same_instant_as_measured_at_is_refused(self):
        """Strict ordering -- simultaneous is not 'before'."""
        kwargs = _kwargs(threshold_declared_at="2026-09-08T00:00:00Z", measured_at="2026-09-08T00:00:00Z")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_THRESHOLD_NOT_PREREGISTERED"):
            generate_smoke_test_experiment("SMOKETEST-T-003", **kwargs)

    def test_unparseable_threshold_declared_at_is_refused(self):
        kwargs = _kwargs(threshold_declared_at="not-a-timestamp")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_THRESHOLD_NOT_PREREGISTERED"):
            generate_smoke_test_experiment("SMOKETEST-T-004", **kwargs)

    def test_unparseable_measured_at_is_refused(self):
        kwargs = _kwargs(measured_at="not-a-timestamp")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_THRESHOLD_NOT_PREREGISTERED"):
            generate_smoke_test_experiment("SMOKETEST-T-005", **kwargs)

    def test_genuinely_preregistered_threshold_is_accepted(self):
        experiment = _valid_experiment()
        self.assertEqual(experiment["threshold_declared_at"], "2026-09-01T00:00:00Z")


class ThresholdValidityTests(unittest.TestCase):
    def test_zero_threshold_is_refused(self):
        kwargs = _kwargs(signup_or_preorder_threshold=0)
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_THRESHOLD"):
            generate_smoke_test_experiment("SMOKETEST-T-006", **kwargs)

    def test_negative_threshold_is_refused(self):
        kwargs = _kwargs(signup_or_preorder_threshold=-5)
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_THRESHOLD"):
            generate_smoke_test_experiment("SMOKETEST-T-007", **kwargs)

    def test_boolean_threshold_is_refused_not_silently_coerced(self):
        kwargs = _kwargs(signup_or_preorder_threshold=True)
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_THRESHOLD"):
            generate_smoke_test_experiment("SMOKETEST-T-008", **kwargs)


class DecisionConsistencyTests(unittest.TestCase):
    def test_go_decision_below_threshold_is_refused(self):
        kwargs = _kwargs(measured_signups=99, signup_or_preorder_threshold=100, decision="GO")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_DECISION_INCONSISTENT"):
            generate_smoke_test_experiment("SMOKETEST-T-009", **kwargs)

    def test_no_go_decision_above_threshold_is_refused(self):
        kwargs = _kwargs(measured_signups=143, signup_or_preorder_threshold=100, decision="NO_GO")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_DECISION_INCONSISTENT"):
            generate_smoke_test_experiment("SMOKETEST-T-010", **kwargs)

    def test_illegal_decision_value_is_refused(self):
        kwargs = _kwargs(decision="MAYBE")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_DECISION_INCONSISTENT"):
            generate_smoke_test_experiment("SMOKETEST-T-011", **kwargs)

    def test_measured_signups_exactly_equal_to_threshold_is_go(self):
        """Boundary: >= threshold means GO, not strictly >."""
        kwargs = _kwargs(measured_signups=100, signup_or_preorder_threshold=100, decision="GO")
        experiment = generate_smoke_test_experiment("SMOKETEST-T-012", **kwargs)
        self.assertEqual(experiment["decision"], "GO")

    def test_measured_signups_one_below_threshold_is_no_go(self):
        kwargs = _kwargs(measured_signups=99, signup_or_preorder_threshold=100, decision="NO_GO")
        experiment = generate_smoke_test_experiment("SMOKETEST-T-013", **kwargs)
        self.assertEqual(experiment["decision"], "NO_GO")


class FieldCompletenessTests(unittest.TestCase):
    def test_empty_offer_description_is_refused(self):
        kwargs = _kwargs(offer_description="")
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_EMPTY_OFFER_DESCRIPTION"):
            generate_smoke_test_experiment("SMOKETEST-T-014", **kwargs)

    def test_negative_measured_signups_is_refused(self):
        kwargs = _kwargs(measured_signups=-1)
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_MEASURED_SIGNUPS"):
            generate_smoke_test_experiment("SMOKETEST-T-015", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_provenance_after_construction_does_not_affect_the_returned_record(self):
        provenance = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")
        experiment = generate_smoke_test_experiment("SMOKETEST-T-016", **_kwargs(provenance=provenance))
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(experiment["provenance"]["epistemic_type"], "SOURCE_FACT")
        self.assertIsNot(experiment["provenance"], provenance)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_experiment(self):
        results = evaluate_smoke_test_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_preregistration_gate_catches_hand_tampered_post_hoc_threshold(self):
        record = copy.deepcopy(_valid_experiment())
        record["threshold_declared_at"] = "2026-09-09T00:00:00Z"
        gate = evaluate_preregistration_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_preregistration_gate_catches_hand_tampered_zero_threshold(self):
        record = copy.deepcopy(_valid_experiment())
        record["signup_or_preorder_threshold"] = 0
        gate = evaluate_preregistration_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_preregistration_gate_passes_a_genuinely_preregistered_record(self):
        gate = evaluate_preregistration_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_decision_consistency_gate_catches_hand_tampered_go_against_below_threshold_signups(self):
        record = copy.deepcopy(_valid_experiment())
        record["measured_signups"] = record["signup_or_preorder_threshold"] - 1
        gate = evaluate_decision_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_consistency_gate_passes_a_genuinely_consistent_record(self):
        gate = evaluate_decision_consistency_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_smoke_test_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_experiment())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SMOKETEST-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_ID"):
            _valid_experiment(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_VERSION"):
            generate_smoke_test_experiment("SMOKETEST-T-017", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMOKETEST_INVALID_PROVENANCE"):
            _valid_experiment(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.smoke_test")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_smoke_test_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "preregistration", "decision_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        experiment = _valid_experiment()
        self.assertEqual(
            set(experiment.keys()),
            {"id", "version", "generated_by_method", "offer_description", "signup_or_preorder_threshold", "threshold_declared_at", "measured_signups", "measured_at", "decision", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
