"""Mutation-style tests for ``experiment.prototype`` (F15 experiment & validation family, Atlas L738).

Atlas's own "iterate" pipeline stage is proven at BOTH independent layers: the construction-time builder
refuses an iteration tracing to a nonexistent observation, a HIGH fidelity level, and an empty iterations
list, and the independent gates re-derive the same rules directly from a raw (possibly hand-tampered)
dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.prototype import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_fidelity_gate,
    evaluate_iteration_traceability_gate,
    evaluate_prototype_gates,
    evaluate_provenance_required_gate,
    generate_prototype,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PROTOTYPE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/prototype-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        learning_goal_={
            "statement": "使用者能在低保真線框圖上找到『匯出報告』功能",
            "falsifiable_if": "多數受測者在 30 秒內找不到匯出入口",
        },
        fidelity_={"level": "LOW", "rationale": "紙本線框圖，無互動邏輯"},
        user_test_={
            "method": "5-人可用性測試",
            "participant_count": 5,
            "observations": [
                "3/5 受測者先點了右上角選單而非左側工具列",
                "改版後 5/5 受測者在 10 秒內找到匯出入口",
            ],
        },
        iterations=[{"change": "把『匯出』移到右上角選單", "triggered_by_observation_index": 0}],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_prototype(*, record_id: str = "PROTO-T-001", **overrides: object):
    return generate_prototype(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_prototype_validates_against_the_real_schema(self):
        self.contracts.validate(PROTOTYPE_SCHEMA, _valid_prototype(), "prototype")

    def test_minimal_one_observation_one_iteration_is_accepted(self):
        prototype = generate_prototype(
            "PROTO-T-002",
            learning_goal_={"statement": "s", "falsifiable_if": "f"},
            fidelity_={"level": "MEDIUM", "rationale": "clickable mockup"},
            user_test_={"method": "1-人測試", "participant_count": 1, "observations": ["obs 0"]},
            iterations=[{"change": "c", "triggered_by_observation_index": 0}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(PROTOTYPE_SCHEMA, prototype, "minimal prototype")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, prototype = live.invoke(METHOD_ID, generate_prototype, "PROTO-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.prototype.contract.yaml")
        self.assertEqual(prototype["id"], "PROTO-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        prototype = _valid_prototype()
        prototype["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROTOTYPE_SCHEMA, prototype, "prototype with a smuggled top-level key")

    def test_schema_rejects_high_fidelity(self):
        prototype = _valid_prototype()
        prototype["fidelity"]["level"] = "HIGH"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROTOTYPE_SCHEMA, prototype, "prototype with HIGH fidelity")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.prototype.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.prototype contract")


class FidelityTests(unittest.TestCase):
    def test_high_fidelity_is_refused(self):
        kwargs = _kwargs()
        kwargs["fidelity_"] = {"level": "HIGH", "rationale": "全功能可運作的雛形"}
        with self.assertRaisesRegex(InvariantViolation, "PROTO_FIDELITY_TOO_HIGH"):
            generate_prototype("PROTO-T-003", **kwargs)

    def test_low_and_medium_are_both_legal(self):
        for level in ("LOW", "MEDIUM"):
            with self.subTest(level=level):
                kwargs = _kwargs()
                kwargs["fidelity_"] = {"level": level, "rationale": "r"}
                prototype = generate_prototype("PROTO-T-004", **kwargs)
                self.assertEqual(prototype["fidelity"]["level"], level)

    def test_unknown_fidelity_level_is_refused(self):
        kwargs = _kwargs()
        kwargs["fidelity_"] = {"level": "ULTRA", "rationale": "r"}
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_FIDELITY"):
            generate_prototype("PROTO-T-005", **kwargs)


class IterationTraceabilityTests(unittest.TestCase):
    """Atlas L738's own 'iterate' pipeline stage -- every iteration must trace to a real observation."""

    def test_dangling_observation_index_is_refused(self):
        kwargs = _kwargs()
        kwargs["iterations"] = [{"change": "c", "triggered_by_observation_index": 5}]
        with self.assertRaisesRegex(InvariantViolation, "PROTO_DANGLING_OBSERVATION_REF"):
            generate_prototype("PROTO-T-006", **kwargs)

    def test_negative_observation_index_is_refused(self):
        kwargs = _kwargs()
        kwargs["iterations"] = [{"change": "c", "triggered_by_observation_index": -1}]
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_ITERATION"):
            generate_prototype("PROTO-T-007", **kwargs)

    def test_boundary_last_valid_index_is_accepted(self):
        kwargs = _kwargs()
        kwargs["iterations"] = [{"change": "c", "triggered_by_observation_index": 1}]  # 2 observations, index 1 is the last valid one
        prototype = generate_prototype("PROTO-T-008", **kwargs)
        self.assertEqual(prototype["iterations"][0]["triggered_by_observation_index"], 1)

    def test_empty_iterations_is_refused(self):
        kwargs = _kwargs()
        kwargs["iterations"] = []
        with self.assertRaisesRegex(InvariantViolation, "PROTO_TOO_FEW_ITERATIONS"):
            generate_prototype("PROTO-T-009", **kwargs)

    def test_empty_observations_is_refused(self):
        kwargs = _kwargs()
        kwargs["user_test_"] = {"method": "m", "participant_count": 1, "observations": []}
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_USER_TEST"):
            generate_prototype("PROTO-T-010", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        prototype = generate_prototype("PROTO-T-011", **kwargs)
        kwargs["iterations"][0]["change"] = "MUTATED AFTER RETURN"
        self.assertEqual(prototype["iterations"][0]["change"], "把『匯出』移到右上角選單")
        self.assertIsNot(prototype["iterations"], kwargs["iterations"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_prototype(self):
        results = evaluate_prototype_gates(_valid_prototype(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_fidelity_gate_catches_hand_tampered_high_fidelity(self):
        record = copy.deepcopy(_valid_prototype())
        record["fidelity"]["level"] = "HIGH"
        gate = evaluate_fidelity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_iteration_traceability_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_prototype())
        record["iterations"].append({"change": "c", "triggered_by_observation_index": 9})
        gate = evaluate_iteration_traceability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_iteration_traceability_gate_passes_a_genuinely_traceable_record(self):
        gate = evaluate_iteration_traceability_gate(_valid_prototype(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_prototype_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_prototype(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_prototype())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PROTO-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_ID"):
            _valid_prototype(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_VERSION"):
            generate_prototype("PROTO-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROTO_INVALID_PROVENANCE"):
            _valid_prototype(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.prototype")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_prototype_gates(_valid_prototype(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "fidelity", "iteration_traceability"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        prototype = _valid_prototype()
        self.assertEqual(
            set(prototype.keys()),
            {"id", "version", "generated_by_method", "learning_goal", "fidelity", "user_test", "iterations", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13 batch found in 11/14 builders (WORKLOG 2026-09-12 F13 entry) --
    returning the caller's own ``provenance`` dict BY REFERENCE rather than a copy. Guards against regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_prototype()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_prototype(base["id"], base["learning_goal"], base["fidelity"], base["user_test"], base["iterations"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
