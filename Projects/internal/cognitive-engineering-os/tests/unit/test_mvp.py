"""Mutation-style tests for ``experiment.mvp`` (F15 experiment & validation family, Atlas L739, §12.29).

§12.29's own "足以改變決策的 evidence" requirement is proven at BOTH independent layers: the
construction-time builder refuses a threshold whose met/not-met decision arms are identical, and
mechanically DERIVES (never accepts) the outcome from real_usage_result against decision_threshold; the
independent gates re-derive the same rules directly from a raw (possibly hand-tampered) dict, never
trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.mvp import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_decision_changing_gate,
    evaluate_decision_consistency_gate,
    evaluate_mvp_gates,
    evaluate_provenance_required_gate,
    generate_mvp,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

MVP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mvp-record.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        critical_assumption_={
            "statement": "使用者願意為『一鍵報稅摘要』功能付費",
            "falsifiable_if": "付費轉換率低於 5%",
        },
        decision_threshold_={
            "metric": "付費轉換率",
            "target_value": 0.05,
            "comparison": "GTE",
            "decision_if_met": "投入完整開發",
            "decision_if_not_met": "砍掉此功能方向",
        },
        real_usage_result_={"actual_value": 0.08, "real_users_count": 120, "usage_context": "真實付費牆，120 位候補名單使用者"},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_mvp(*, record_id: str = "MVP-T-001", **overrides: object):
    return generate_mvp(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_mvp_validates_against_the_real_schema(self):
        self.contracts.validate(MVP_SCHEMA, _valid_mvp(), "mvp record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, mvp = live.invoke(METHOD_ID, generate_mvp, "MVP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.mvp.contract.yaml")
        self.assertEqual(mvp["id"], "MVP-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        mvp = _valid_mvp()
        mvp["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MVP_SCHEMA, mvp, "mvp with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.mvp.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.mvp contract")


class DecisionChangingThresholdTests(unittest.TestCase):
    """§12.29's own '正確問題' -- a threshold that cannot change any decision is not real evidence."""

    def test_identical_decision_arms_is_refused(self):
        kwargs = _kwargs()
        kwargs["decision_threshold_"]["decision_if_not_met"] = kwargs["decision_threshold_"]["decision_if_met"]
        with self.assertRaisesRegex(InvariantViolation, "MVP_THRESHOLD_NOT_DECISION_CHANGING"):
            generate_mvp("MVP-T-002", **kwargs)

    def test_distinct_decision_arms_is_accepted(self):
        mvp = _valid_mvp()
        self.assertNotEqual(mvp["decision_threshold"]["decision_if_met"], mvp["decision_threshold"]["decision_if_not_met"])


class DecisionConsistencyTests(unittest.TestCase):
    """The recorded outcome must equal the mechanical recomputation, not a narrative override."""

    def test_metric_met_when_usage_meets_gte_threshold(self):
        mvp = _valid_mvp()
        self.assertTrue(mvp["outcome"]["metric_met"])
        self.assertEqual(mvp["outcome"]["decision_taken"], "投入完整開發")

    def test_metric_not_met_when_usage_misses_gte_threshold(self):
        kwargs = _kwargs()
        kwargs["real_usage_result_"] = {"actual_value": 0.02, "real_users_count": 120, "usage_context": "c"}
        mvp = generate_mvp("MVP-T-003", **kwargs)
        self.assertFalse(mvp["outcome"]["metric_met"])
        self.assertEqual(mvp["outcome"]["decision_taken"], "砍掉此功能方向")

    def test_boundary_exact_equal_to_target_counts_as_met_for_gte(self):
        kwargs = _kwargs()
        kwargs["real_usage_result_"] = {"actual_value": 0.05, "real_users_count": 1, "usage_context": "c"}
        mvp = generate_mvp("MVP-T-004", **kwargs)
        self.assertTrue(mvp["outcome"]["metric_met"])

    def test_lte_comparison_recomputes_correctly(self):
        kwargs = _kwargs()
        kwargs["decision_threshold_"] = {
            "metric": "延遲",
            "target_value": 100,
            "comparison": "LTE",
            "decision_if_met": "上線",
            "decision_if_not_met": "優化後再測",
        }
        kwargs["real_usage_result_"] = {"actual_value": 80, "real_users_count": 50, "usage_context": "c"}
        mvp = generate_mvp("MVP-T-005", **kwargs)
        self.assertTrue(mvp["outcome"]["metric_met"])
        self.assertEqual(mvp["outcome"]["decision_taken"], "上線")

    def test_eq_comparison_recomputes_correctly(self):
        kwargs = _kwargs()
        kwargs["decision_threshold_"] = {
            "metric": "版本號",
            "target_value": 3,
            "comparison": "EQ",
            "decision_if_met": "符合",
            "decision_if_not_met": "不符合",
        }
        kwargs["real_usage_result_"] = {"actual_value": 3, "real_users_count": 1, "usage_context": "c"}
        mvp = generate_mvp("MVP-T-006", **kwargs)
        self.assertTrue(mvp["outcome"]["metric_met"])

    def test_invalid_comparison_string_is_refused(self):
        kwargs = _kwargs()
        kwargs["decision_threshold_"]["comparison"] = "APPROX"
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_THRESHOLD"):
            generate_mvp("MVP-T-007", **kwargs)


class NumericValidationTests(unittest.TestCase):
    def test_nan_actual_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["real_usage_result_"]["actual_value"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_REAL_USAGE_RESULT"):
            generate_mvp("MVP-T-008", **kwargs)

    def test_boolean_target_value_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["decision_threshold_"]["target_value"] = True
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_THRESHOLD"):
            generate_mvp("MVP-T-009", **kwargs)

    def test_zero_real_users_count_is_refused(self):
        kwargs = _kwargs()
        kwargs["real_usage_result_"]["real_users_count"] = 0
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_REAL_USAGE_RESULT"):
            generate_mvp("MVP-T-010", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        mvp = generate_mvp("MVP-T-011", **kwargs)
        kwargs["decision_threshold_"]["metric"] = "MUTATED AFTER RETURN"
        self.assertEqual(mvp["decision_threshold"]["metric"], "付費轉換率")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_mvp(self):
        results = evaluate_mvp_gates(_valid_mvp(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_decision_changing_gate_catches_hand_tampered_identical_arms(self):
        record = copy.deepcopy(_valid_mvp())
        record["decision_threshold"]["decision_if_not_met"] = record["decision_threshold"]["decision_if_met"]
        gate = evaluate_decision_changing_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_consistency_gate_catches_hand_tampered_decision_taken(self):
        record = copy.deepcopy(_valid_mvp())
        record["outcome"]["decision_taken"] = record["decision_threshold"]["decision_if_not_met"]
        gate = evaluate_decision_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_consistency_gate_catches_hand_tampered_metric_met(self):
        record = copy.deepcopy(_valid_mvp())
        record["outcome"]["metric_met"] = False
        gate = evaluate_decision_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_consistency_gate_passes_a_genuinely_consistent_record(self):
        gate = evaluate_decision_consistency_gate(_valid_mvp(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_mvp_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_mvp(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_mvp())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "MVP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_ID"):
            _valid_mvp(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_VERSION"):
            generate_mvp("MVP-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MVP_INVALID_PROVENANCE"):
            _valid_mvp(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.mvp")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_mvp_gates(_valid_mvp(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "decision_changing_threshold", "decision_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        mvp = _valid_mvp()
        self.assertEqual(
            set(mvp.keys()),
            {"id", "version", "generated_by_method", "critical_assumption", "decision_threshold", "real_usage_result", "outcome", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13 batch found in 11/14 builders (WORKLOG 2026-09-12 F13 entry) --
    returning the caller's own ``provenance`` dict BY REFERENCE rather than a copy. Guards against regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_mvp()
        provenance = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        record = generate_mvp(base["id"], base["critical_assumption"], base["decision_threshold"], base["real_usage_result"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")


if __name__ == "__main__":
    unittest.main()
