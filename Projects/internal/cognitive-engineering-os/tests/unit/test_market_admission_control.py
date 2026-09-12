"""Mutation-style tests for ``jurisdiction.market_admission_control`` (F23 jurisdiction family, Atlas L942,
§11.54).

Atlas §11.54's own "任一 critical unknown：FAIL CLOSED" rule is proven at
BOTH independent layers: the builder NEVER accepts ``admission_decision``
as a parameter (it is always derived), and the independent gate re-derives
the same rule directly from a raw (possibly hand-tampered) dict, never
trusting that the builder's own computation already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.market_admission_control import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_NAMES,
    all_gates_pass,
    evaluate_admission_decision_gate,
    evaluate_market_admission_gates,
    evaluate_provenance_required_gate,
    evaluate_stage_completeness_gate,
    generate_market_admission,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

MARKET_ADMISSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/market-admission-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _all_pass_stages() -> list[dict]:
    return [{"stage": name, "status": "PASS", "note": f"{name} verified"} for name in STAGE_NAMES]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        market_id="DE",
        stages=_all_pass_stages(),
        human_signoff="legal-reviewer-042",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_admission(*, record_id: str = "MADM-T-001", **overrides: object):
    return generate_market_admission(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_admission_validates_against_the_real_schema(self):
        self.contracts.validate(MARKET_ADMISSION_SCHEMA, _valid_admission(), "market admission record")

    def test_all_pass_with_signoff_is_enable(self):
        record = _valid_admission()
        self.assertEqual(record["admission_decision"], "ENABLE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_market_admission, "MADM-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.market_admission_control.contract.yaml")
        self.assertEqual(record["id"], "MADM-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_admission()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MARKET_ADMISSION_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_invalid_admission_decision_value(self):
        record = _valid_admission()
        record["admission_decision"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MARKET_ADMISSION_SCHEMA, record, "record with an invalid admission_decision enum value")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.market_admission_control.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.market_admission_control contract")


class StageCompletenessTests(unittest.TestCase):
    def test_missing_stage_is_refused(self):
        kwargs = _kwargs()
        kwargs["stages"] = kwargs["stages"][:-1]
        with self.assertRaisesRegex(InvariantViolation, "MADM_MISSING_STAGE"):
            generate_market_admission("MADM-T-002", **kwargs)

    def test_duplicate_stage_is_refused(self):
        kwargs = _kwargs()
        kwargs["stages"].append(dict(kwargs["stages"][0]))
        with self.assertRaisesRegex(InvariantViolation, "MADM_DUPLICATE_STAGE"):
            generate_market_admission("MADM-T-003", **kwargs)

    def test_unknown_stage_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["stages"][0] = {"stage": "not_a_real_stage", "status": "PASS", "note": "x"}
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_STAGES"):
            generate_market_admission("MADM-T-004", **kwargs)

    def test_exactly_seven_stages_required_even_if_extra_added(self):
        kwargs = _kwargs()
        kwargs["stages"].append({"stage": "jurisdiction_pack", "status": "PASS", "note": "extra dup"})
        with self.assertRaisesRegex(InvariantViolation, "MADM_DUPLICATE_STAGE"):
            generate_market_admission("MADM-T-005", **kwargs)


class DerivedDecisionTests(unittest.TestCase):
    """Atlas §11.54's own 'FAIL CLOSED' rule -- admission_decision is always derived, never asserted."""

    def test_generate_market_admission_accepts_no_admission_decision_parameter(self):
        import inspect

        sig = inspect.signature(generate_market_admission)
        self.assertNotIn("admission_decision", sig.parameters)

    def test_one_failed_stage_forces_fail_closed(self):
        kwargs = _kwargs()
        kwargs["stages"][0]["status"] = "FAIL"
        record = generate_market_admission("MADM-T-006", **kwargs)
        self.assertEqual(record["admission_decision"], "FAIL_CLOSED")

    def test_one_unknown_stage_forces_fail_closed(self):
        kwargs = _kwargs()
        kwargs["stages"][2]["status"] = "UNKNOWN"
        record = generate_market_admission("MADM-T-007", **kwargs)
        self.assertEqual(record["admission_decision"], "FAIL_CLOSED")

    def test_missing_human_signoff_forces_fail_closed_even_with_all_pass(self):
        kwargs = _kwargs(human_signoff=None)
        record = generate_market_admission("MADM-T-008", **kwargs)
        self.assertEqual(record["admission_decision"], "FAIL_CLOSED")

    def test_empty_string_human_signoff_is_refused_not_treated_as_signed(self):
        kwargs = _kwargs(human_signoff="")
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_HUMAN_SIGNOFF"):
            generate_market_admission("MADM-T-009", **kwargs)

    def test_all_pass_and_signoff_is_enable(self):
        record = _valid_admission()
        self.assertEqual(record["admission_decision"], "ENABLE")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_market_admission("MADM-T-010", **kwargs)
        kwargs["stages"][0]["status"] = "FAIL"
        self.assertEqual(record["stages"][0]["status"], "PASS")
        self.assertIsNot(record["stages"], kwargs["stages"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_admission(self):
        results = evaluate_market_admission_gates(_valid_admission(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_stage_completeness_gate_catches_hand_tampered_missing_stage(self):
        record = copy.deepcopy(_valid_admission())
        record["stages"] = record["stages"][:-1]
        gate = evaluate_stage_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_admission_decision_gate_catches_hand_tampered_enable_with_unknown_stage(self):
        record = copy.deepcopy(_valid_admission())
        record["stages"][2]["status"] = "UNKNOWN"
        gate = evaluate_admission_decision_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_admission_decision_gate_catches_hand_tampered_enable_with_no_signoff(self):
        record = copy.deepcopy(_valid_admission())
        record["human_signoff"] = None
        gate = evaluate_admission_decision_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_admission_decision_gate_passes_a_genuinely_consistent_record(self):
        gate = evaluate_admission_decision_gate(_valid_admission(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_market_admission_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_admission(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_admission())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "MADM-")

    def test_stage_names_constant_has_7_members(self):
        self.assertEqual(len(STAGE_NAMES), 7)
        self.assertEqual(len(set(STAGE_NAMES)), 7)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_ID"):
            _valid_admission(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_VERSION"):
            generate_market_admission("MADM-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_PROVENANCE"):
            _valid_admission(provenance={"epistemic_type": "NOT_REAL"})

    def test_invalid_market_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MADM_INVALID_MARKET_ID"):
            _valid_admission(market_id="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.market_admission_control")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_market_admission_gates(_valid_admission(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "stage_completeness", "admission_decision_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_admission()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "market_id", "stages", "human_signoff", "admission_decision", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Recurring bug class across F10/F13/F15/F22: builders returning the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy, so mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too. Fixed by ``copy.deepcopy``ing provenance at the
    return statement; this test proves the fix and guards against a 5th recurrence."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_admission()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_market_admission(base["id"], base["market_id"], base["stages"], base["human_signoff"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
