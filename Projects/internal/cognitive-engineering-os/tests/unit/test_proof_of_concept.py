"""Mutation-style tests for ``experiment.proof_of_concept`` (F15 experiment & validation family, Atlas L740).

Atlas's own "isolated implementation" pipeline stage is proven at BOTH independent layers: the
construction-time builder refuses an implementation with production_integration=true, and mechanically
DERIVES (never accepts) feasibility_verdict from benchmark_result against success_criteria; the
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
from ai_lego.modules.experiment.proof_of_concept import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_isolation_gate,
    evaluate_proof_of_concept_gates,
    evaluate_provenance_required_gate,
    evaluate_verdict_consistency_gate,
    generate_proof_of_concept,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

POC_SCHEMA = "ai-lego://specs/cognitive/typed-objects/proof-of-concept-record.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        technical_unknown_={"statement": "向量檢索能否在 50ms 內回應 100 萬筆 embedding 的 top-10 查詢"},
        success_criteria_={"metric": "p95 延遲 (ms)", "threshold": 50, "comparison": "LTE"},
        implementation_={
            "description": "獨立沙盒服務，讀唯讀快照，未接任何 production 流量",
            "isolated": True,
            "production_integration": False,
        },
        benchmark_result_={"measured_value": 38, "environment": "沙盒 VM, 1M 筆合成 embedding", "methodology": "1000 次查詢取 p95"},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_poc(*, record_id: str = "POC-T-001", **overrides: object):
    return generate_proof_of_concept(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_poc_validates_against_the_real_schema(self):
        self.contracts.validate(POC_SCHEMA, _valid_poc(), "proof of concept")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, poc = live.invoke(METHOD_ID, generate_proof_of_concept, "POC-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.proof_of_concept.contract.yaml")
        self.assertEqual(poc["id"], "POC-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        poc = _valid_poc()
        poc["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(POC_SCHEMA, poc, "poc with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.proof_of_concept.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.proof_of_concept contract")


class IsolationTests(unittest.TestCase):
    """Atlas L740's own 'isolated implementation' pipeline stage -- a PoC wired into production defeats
    '先去除技術未知'."""

    def test_production_integration_true_is_refused(self):
        kwargs = _kwargs()
        kwargs["implementation_"] = {"description": "d", "isolated": True, "production_integration": True}
        with self.assertRaisesRegex(InvariantViolation, "POC_NOT_ISOLATED"):
            generate_proof_of_concept("POC-T-002", **kwargs)

    def test_isolated_false_is_refused(self):
        kwargs = _kwargs()
        kwargs["implementation_"] = {"description": "d", "isolated": False, "production_integration": False}
        with self.assertRaisesRegex(InvariantViolation, "POC_NOT_ISOLATED"):
            generate_proof_of_concept("POC-T-003", **kwargs)

    def test_both_flags_wrong_is_refused(self):
        kwargs = _kwargs()
        kwargs["implementation_"] = {"description": "d", "isolated": False, "production_integration": True}
        with self.assertRaisesRegex(InvariantViolation, "POC_NOT_ISOLATED"):
            generate_proof_of_concept("POC-T-004", **kwargs)

    def test_correctly_isolated_implementation_is_accepted(self):
        poc = _valid_poc()
        self.assertTrue(poc["implementation"]["isolated"])
        self.assertFalse(poc["implementation"]["production_integration"])


class VerdictConsistencyTests(unittest.TestCase):
    def test_feasible_when_benchmark_beats_lte_threshold(self):
        poc = _valid_poc()
        self.assertTrue(poc["feasibility_verdict"])

    def test_infeasible_when_benchmark_misses_lte_threshold(self):
        kwargs = _kwargs()
        kwargs["benchmark_result_"] = {"measured_value": 90, "environment": "e", "methodology": "m"}
        poc = generate_proof_of_concept("POC-T-005", **kwargs)
        self.assertFalse(poc["feasibility_verdict"])

    def test_boundary_exact_equal_to_threshold_counts_as_feasible_for_lte(self):
        kwargs = _kwargs()
        kwargs["benchmark_result_"] = {"measured_value": 50, "environment": "e", "methodology": "m"}
        poc = generate_proof_of_concept("POC-T-006", **kwargs)
        self.assertTrue(poc["feasibility_verdict"])

    def test_gte_comparison_recomputes_correctly(self):
        kwargs = _kwargs()
        kwargs["success_criteria_"] = {"metric": "throughput", "threshold": 1000, "comparison": "GTE"}
        kwargs["benchmark_result_"] = {"measured_value": 1200, "environment": "e", "methodology": "m"}
        poc = generate_proof_of_concept("POC-T-007", **kwargs)
        self.assertTrue(poc["feasibility_verdict"])

    def test_invalid_comparison_string_is_refused(self):
        kwargs = _kwargs()
        kwargs["success_criteria_"]["comparison"] = "APPROX"
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_SUCCESS_CRITERIA"):
            generate_proof_of_concept("POC-T-008", **kwargs)


class NumericValidationTests(unittest.TestCase):
    def test_nan_measured_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["benchmark_result_"]["measured_value"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_BENCHMARK_RESULT"):
            generate_proof_of_concept("POC-T-009", **kwargs)

    def test_boolean_threshold_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["success_criteria_"]["threshold"] = True
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_SUCCESS_CRITERIA"):
            generate_proof_of_concept("POC-T-010", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        poc = generate_proof_of_concept("POC-T-011", **kwargs)
        kwargs["implementation_"]["description"] = "MUTATED AFTER RETURN"
        self.assertEqual(poc["implementation"]["description"], "獨立沙盒服務，讀唯讀快照，未接任何 production 流量")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_poc(self):
        results = evaluate_proof_of_concept_gates(_valid_poc(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_isolation_gate_catches_hand_tampered_production_integration(self):
        record = copy.deepcopy(_valid_poc())
        record["implementation"]["production_integration"] = True
        gate = evaluate_isolation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_verdict_consistency_gate_catches_hand_tampered_verdict(self):
        record = copy.deepcopy(_valid_poc())
        record["feasibility_verdict"] = not record["feasibility_verdict"]
        gate = evaluate_verdict_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_verdict_consistency_gate_passes_a_genuinely_consistent_record(self):
        gate = evaluate_verdict_consistency_gate(_valid_poc(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_proof_of_concept_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_poc(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_poc())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "POC-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_ID"):
            _valid_poc(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_VERSION"):
            generate_proof_of_concept("POC-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POC_INVALID_PROVENANCE"):
            _valid_poc(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.proof_of_concept")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_proof_of_concept_gates(_valid_poc(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "isolation", "verdict_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        poc = _valid_poc()
        self.assertEqual(
            set(poc.keys()),
            {"id", "version", "generated_by_method", "technical_unknown", "success_criteria", "implementation", "benchmark_result", "feasibility_verdict", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13 batch found in 11/14 builders (WORKLOG 2026-09-12 F13 entry) --
    returning the caller's own ``provenance`` dict BY REFERENCE rather than a copy. Guards against regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_poc()
        provenance = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        record = generate_proof_of_concept(base["id"], base["technical_unknown"], base["success_criteria"], base["implementation"], base["benchmark_result"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")


if __name__ == "__main__":
    unittest.main()
