"""Mutation-style tests for ``experiment.ab_test`` (F15 experiment & validation family, Atlas L746,
§12.30). Atlas §12.30's own "avoid peeking" warning is proven at BOTH independent layers: the
construction-time builder refuses a post-analysis registration, an invalid sample size, or a
primary-metric/guardrail collision, and the independent gates re-derive the same rules directly from a
raw (possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.ab_test import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_ab_test_gates,
    evaluate_preregistration_gate,
    evaluate_primary_metric_isolation_gate,
    evaluate_provenance_required_gate,
    generate_ab_test_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

AB_TEST_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ab-test-record.schema.yaml"
PROVENANCE = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        hypothesis="新結帳流程（單頁式）能提升轉換率",
        primary_metric="checkout_conversion_rate",
        guardrail_metrics=["cart_abandonment_rate", "avg_page_load_ms"],
        sample_size_per_arm=5000,
        randomization_unit="user_id",
        registered_at="2026-08-01T00:00:00Z",
        analyzed_at="2026-08-22T00:00:00Z",
        decision="SHIP",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_experiment(*, record_id: str = "ABTEST-T-001", **overrides: object):
    return generate_ab_test_experiment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_experiment_validates_against_the_real_schema(self):
        self.contracts.validate(AB_TEST_SCHEMA, _valid_experiment(), "ab test experiment")

    def test_empty_guardrail_metrics_is_a_legal_minimal_case(self):
        experiment = generate_ab_test_experiment("ABTEST-T-002", **_kwargs(guardrail_metrics=[]))
        self.contracts.validate(AB_TEST_SCHEMA, experiment, "ab test experiment with no guardrails")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, experiment = live.invoke(METHOD_ID, generate_ab_test_experiment, "ABTEST-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.ab_test.contract.yaml")
        self.assertEqual(experiment["id"], "ABTEST-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        experiment = _valid_experiment()
        experiment["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AB_TEST_SCHEMA, experiment, "experiment with a smuggled top-level key")

    def test_schema_rejects_an_illegal_decision_value(self):
        experiment = _valid_experiment()
        experiment["decision"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AB_TEST_SCHEMA, experiment, "experiment with an illegal decision value")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.ab_test.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.ab_test contract")


class PreregistrationTests(unittest.TestCase):
    """Atlas §12.30's own explicit 'avoid peeking' warning -- pre-registered, not post-hoc."""

    def test_registered_after_analyzed_at_is_refused(self):
        kwargs = _kwargs(registered_at="2026-08-23T00:00:00Z")  # after analyzed_at 08-22
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_NOT_PREREGISTERED"):
            generate_ab_test_experiment("ABTEST-T-003", **kwargs)

    def test_registered_at_the_same_instant_as_analyzed_at_is_refused(self):
        """Strict ordering -- simultaneous is not 'before'."""
        kwargs = _kwargs(registered_at="2026-08-22T00:00:00Z", analyzed_at="2026-08-22T00:00:00Z")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_NOT_PREREGISTERED"):
            generate_ab_test_experiment("ABTEST-T-004", **kwargs)

    def test_unparseable_registered_at_is_refused(self):
        kwargs = _kwargs(registered_at="not-a-timestamp")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_NOT_PREREGISTERED"):
            generate_ab_test_experiment("ABTEST-T-005", **kwargs)

    def test_unparseable_analyzed_at_is_refused(self):
        kwargs = _kwargs(analyzed_at="not-a-timestamp")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_NOT_PREREGISTERED"):
            generate_ab_test_experiment("ABTEST-T-006", **kwargs)

    def test_genuinely_preregistered_experiment_is_accepted(self):
        experiment = _valid_experiment()
        self.assertEqual(experiment["registered_at"], "2026-08-01T00:00:00Z")


class SampleSizeTests(unittest.TestCase):
    def test_zero_sample_size_is_refused(self):
        kwargs = _kwargs(sample_size_per_arm=0)
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_SAMPLE_SIZE"):
            generate_ab_test_experiment("ABTEST-T-007", **kwargs)

    def test_negative_sample_size_is_refused(self):
        kwargs = _kwargs(sample_size_per_arm=-100)
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_SAMPLE_SIZE"):
            generate_ab_test_experiment("ABTEST-T-008", **kwargs)

    def test_boolean_sample_size_is_refused_not_silently_coerced(self):
        kwargs = _kwargs(sample_size_per_arm=True)
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_SAMPLE_SIZE"):
            generate_ab_test_experiment("ABTEST-T-009", **kwargs)


class PrimaryMetricIsolationTests(unittest.TestCase):
    """The decisive metric cannot double as a guardrail -- guards against multiple-testing ambiguity."""

    def test_exact_duplicate_primary_metric_in_guardrails_is_refused(self):
        kwargs = _kwargs(guardrail_metrics=["checkout_conversion_rate"])
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_PRIMARY_METRIC_IS_A_GUARDRAIL"):
            generate_ab_test_experiment("ABTEST-T-010", **kwargs)

    def test_case_and_whitespace_variant_collision_is_refused(self):
        kwargs = _kwargs(guardrail_metrics=["  Checkout_Conversion_Rate  "])
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_PRIMARY_METRIC_IS_A_GUARDRAIL"):
            generate_ab_test_experiment("ABTEST-T-011", **kwargs)

    def test_distinct_metrics_are_accepted(self):
        experiment = _valid_experiment()
        self.assertNotIn(experiment["primary_metric"], experiment["guardrail_metrics"])


class FieldCompletenessTests(unittest.TestCase):
    def test_empty_hypothesis_is_refused(self):
        kwargs = _kwargs(hypothesis="")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_EMPTY_HYPOTHESIS"):
            generate_ab_test_experiment("ABTEST-T-012", **kwargs)

    def test_empty_primary_metric_is_refused(self):
        kwargs = _kwargs(primary_metric="")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_EMPTY_PRIMARY_METRIC"):
            generate_ab_test_experiment("ABTEST-T-013", **kwargs)

    def test_empty_randomization_unit_is_refused(self):
        kwargs = _kwargs(randomization_unit="")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_EMPTY_RANDOMIZATION_UNIT"):
            generate_ab_test_experiment("ABTEST-T-014", **kwargs)

    def test_guardrail_metrics_with_an_empty_string_entry_is_refused(self):
        kwargs = _kwargs(guardrail_metrics=["cart_abandonment_rate", ""])
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_GUARDRAIL_METRICS"):
            generate_ab_test_experiment("ABTEST-T-015", **kwargs)

    def test_non_list_guardrail_metrics_is_refused(self):
        kwargs = _kwargs(guardrail_metrics="not-a-list")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_GUARDRAIL_METRICS"):
            generate_ab_test_experiment("ABTEST-T-016", **kwargs)

    def test_illegal_decision_value_is_refused(self):
        kwargs = _kwargs(decision="MAYBE")
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_DECISION"):
            generate_ab_test_experiment("ABTEST-T-017", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_guardrail_metrics_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        experiment = generate_ab_test_experiment("ABTEST-T-018", **kwargs)
        kwargs["guardrail_metrics"].append("mutated_after_return")
        self.assertNotIn("mutated_after_return", experiment["guardrail_metrics"])
        self.assertIsNot(experiment["guardrail_metrics"], kwargs["guardrail_metrics"])

    def test_mutating_caller_provenance_after_construction_does_not_affect_the_returned_record(self):
        provenance = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")
        experiment = generate_ab_test_experiment("ABTEST-T-019", **_kwargs(provenance=provenance))
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(experiment["provenance"]["epistemic_type"], "SOURCE_FACT")
        self.assertIsNot(experiment["provenance"], provenance)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_experiment(self):
        results = evaluate_ab_test_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_preregistration_gate_catches_hand_tampered_post_analysis_registration(self):
        record = copy.deepcopy(_valid_experiment())
        record["registered_at"] = "2026-08-23T00:00:00Z"
        gate = evaluate_preregistration_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_preregistration_gate_catches_hand_tampered_zero_sample_size(self):
        record = copy.deepcopy(_valid_experiment())
        record["sample_size_per_arm"] = 0
        gate = evaluate_preregistration_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_preregistration_gate_passes_a_genuinely_preregistered_record(self):
        gate = evaluate_preregistration_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_primary_metric_isolation_gate_catches_hand_tampered_guardrail_collision(self):
        record = copy.deepcopy(_valid_experiment())
        record["guardrail_metrics"][0] = "  Checkout_Conversion_Rate  "
        gate = evaluate_primary_metric_isolation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_primary_metric_isolation_gate_passes_a_genuinely_isolated_record(self):
        gate = evaluate_primary_metric_isolation_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_ab_test_gates(bad, "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "ABTEST-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_ID"):
            _valid_experiment(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_VERSION"):
            generate_ab_test_experiment("ABTEST-T-020", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ABTEST_INVALID_PROVENANCE"):
            _valid_experiment(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.ab_test")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_ab_test_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "preregistration", "primary_metric_isolation"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        experiment = _valid_experiment()
        self.assertEqual(
            set(experiment.keys()),
            {
                "id", "version", "generated_by_method", "hypothesis", "primary_metric", "guardrail_metrics",
                "sample_size_per_arm", "randomization_unit", "registered_at", "analyzed_at", "decision", "provenance",
            },
        )


if __name__ == "__main__":
    unittest.main()
