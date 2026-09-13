"""Mutation-style tests for ``feasibility.irr`` (F14 feasibility family, Atlas L730).

IRR is the real root of ``sum(cf.amount/(1+r)**cf.period) == 0``, solved by
bisection -- proven at BOTH independent layers: the construction-time
builder refuses malformed/same-sign cash_flows, and the gate independently
RE-SOLVES from a raw (possibly hand-tampered) record's own stored
cash_flows, never trusting that the builder's own computation already ran.
The solver's own output is cross-checked against a hand-derived closed-form
IRR, not merely trusted.
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
from ai_lego.modules.feasibility.irr import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    cash_flow,
    compute_irr,
    evaluate_irr_content_integrity_gate,
    evaluate_irr_gates,
    evaluate_provenance_required_gate,
    generate_irr_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

IRR_SCHEMA = "ai-lego://specs/cognitive/typed-objects/irr-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")

_CLOSED_FORM_CASH_FLOWS = [{"period": 0, "amount": -1000}, {"period": 1, "amount": 1200}]
_CLOSED_FORM_IRR = 0.2  # -1000 + 1200/(1+r) = 0 -> 1+r = 1.2 -> r = 0.2, exact


def _cash_flows() -> list[dict]:
    return [{"period": 0, "amount": -1000}, {"period": 1, "amount": 400}, {"period": 2, "amount": 400}, {"period": 3, "amount": 400}]


def _kwargs(**overrides: object) -> dict:
    base = dict(subject_ref="測試投資案", cash_flows=_cash_flows(), hurdle_rate=0.05, provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "IRR-T-001", **overrides: object):
    return generate_irr_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(IRR_SCHEMA, _valid_record(), "irr analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_irr_analysis, "IRR-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.irr.contract.yaml")
        self.assertEqual(record["id"], "IRR-T-INVOKE")

    def test_empty_catalog_blocks_irr_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IRR_SCHEMA, record, "irr analysis with a smuggled top-level key")

    def test_schema_rejects_fewer_than_two_cash_flows(self):
        record = _valid_record()
        record["cash_flows"] = [{"period": 0, "amount": -1000}]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IRR_SCHEMA, record, "irr analysis with 1 cash flow")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.irr.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.irr contract")


class GenuineComputeTests(unittest.TestCase):
    """irr/meets_hurdle are GENUINE_COMPUTE -- never accepted as builder parameters."""

    def test_builder_has_no_irr_parameter(self):
        params = inspect.signature(generate_irr_analysis).parameters
        self.assertNotIn("irr", params)

    def test_builder_has_no_meets_hurdle_parameter(self):
        params = inspect.signature(generate_irr_analysis).parameters
        self.assertNotIn("meets_hurdle", params)

    def test_calling_with_irr_keyword_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_irr_analysis("IRR-T-002", **_kwargs(), irr=0.5)  # type: ignore[call-arg]


class ClosedFormCrossCheckTests(unittest.TestCase):
    """The bisection solver's own output, independently cross-checked against a hand-derived closed-form root
    -- never merely trusted as its own ground truth."""

    def test_two_cash_flow_case_matches_the_hand_derived_closed_form_irr(self):
        solved = compute_irr(_CLOSED_FORM_CASH_FLOWS)
        self.assertAlmostEqual(solved, _CLOSED_FORM_IRR, delta=1e-6)

    def test_multi_period_case_satisfies_the_defining_npv_equation_at_the_solved_rate(self):
        """Independent verification via the defining equation itself (NPV(irr) ~= 0), not the solver's own
        internal trace -- proves the returned root is a genuine root, not merely "whatever the solver returned"."""
        cash_flows = _cash_flows()
        solved = compute_irr(cash_flows)
        npv_at_solved_rate = sum(cf["amount"] / (1.0 + solved) ** cf["period"] for cf in cash_flows)
        self.assertAlmostEqual(npv_at_solved_rate, 0.0, delta=1e-4)

    def test_record_built_from_the_closed_form_cash_flows_stores_the_expected_irr(self):
        record = _valid_record(cash_flows=_CLOSED_FORM_CASH_FLOWS, hurdle_rate=0.1)
        self.assertAlmostEqual(record["irr"], _CLOSED_FORM_IRR, delta=1e-6)
        self.assertTrue(record["meets_hurdle"])


class SameSignRefusalTests(unittest.TestCase):
    """IRR is mathematically undefined for an all-same-sign cash flow series -- Atlas L730's own core precondition."""

    def test_all_negative_cash_flows_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS"):
            _valid_record(cash_flows=[{"period": 0, "amount": -1000}, {"period": 1, "amount": -500}])

    def test_all_positive_cash_flows_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS"):
            _valid_record(cash_flows=[{"period": 0, "amount": 1000}, {"period": 1, "amount": 500}])

    def test_compute_irr_directly_refuses_same_sign(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS"):
            compute_irr([{"period": 0, "amount": -1000}, {"period": 1, "amount": -500}])


class CashFlowShapeTests(unittest.TestCase):
    def test_cash_flow_helper_constructs_a_well_formed_entry(self):
        built = cash_flow(0, -1000)
        self.assertEqual(built, {"period": 0, "amount": -1000})

    def test_cash_flow_helper_refuses_negative_period(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_CASH_FLOW"):
            cash_flow(-1, 1000)

    def test_cash_flow_helper_refuses_bool_period(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_CASH_FLOW"):
            cash_flow(True, 1000)

    def test_cash_flow_helper_refuses_bool_amount(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_CASH_FLOW"):
            cash_flow(0, True)

    def test_cash_flow_helper_refuses_non_finite_amount(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_CASH_FLOW"):
            cash_flow(0, float("inf"))

    def test_fewer_than_two_cash_flows_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INSUFFICIENT_CASH_FLOWS"):
            _valid_record(cash_flows=[{"period": 0, "amount": -1000}])

    def test_duplicate_period_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_DUPLICATE_PERIOD"):
            _valid_record(cash_flows=[{"period": 0, "amount": -1000}, {"period": 0, "amount": 1200}])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "IRR-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_VERSION"):
            generate_irr_analysis("IRR-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_blank_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_SUBJECT_REF"):
            _valid_record(subject_ref="   ")

    def test_hurdle_rate_at_or_below_negative_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_HURDLE_RATE"):
            _valid_record(hurdle_rate=-1)

    def test_hurdle_rate_bool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IRR_INVALID_HURDLE_RATE"):
            _valid_record(hurdle_rate=True)

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.irr")

    def test_evaluate_irr_gates_returns_two_gates_in_order(self):
        results = evaluate_irr_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "irr_content_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "subject_ref", "cash_flows", "hurdle_rate", "irr", "meets_hurdle", "provenance"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates RE-SOLVE from raw fields rather than trusting the builder's own computation."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_irr_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_integrity_gate_catches_hand_tampered_wrong_irr(self):
        record = copy.deepcopy(_valid_record())
        record["irr"] = 0.999
        gate = evaluate_irr_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_integrity_gate_catches_hand_tampered_wrong_meets_hurdle(self):
        record = copy.deepcopy(_valid_record())
        record["meets_hurdle"] = not record["meets_hurdle"]
        gate = evaluate_irr_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_integrity_gate_catches_hand_tampered_duplicate_period(self):
        record = copy.deepcopy(_valid_record())
        record["cash_flows"][1]["period"] = record["cash_flows"][0]["period"]
        gate = evaluate_irr_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_integrity_gate_catches_hand_tampered_same_sign_cash_flows(self):
        record = copy.deepcopy(_valid_record())
        for cf in record["cash_flows"]:
            cf["amount"] = abs(cf["amount"])
        gate = evaluate_irr_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_integrity_gate_passes_a_genuinely_valid_record(self):
        gate = evaluate_irr_content_integrity_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_content_integrity_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42, True, 3.14, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_irr_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42, True, 3.14, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_irr_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_malformed_cash_flow_entry_inside_list_fails_closed(self):
        record = copy.deepcopy(_valid_record())
        record["cash_flows"].append("not-a-dict")
        gate = evaluate_irr_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Guards the corpus-wide defect class (11 of 14 F13 builders returned provenance by reference) --
    ``provenance`` must be ``copy.deepcopy``d at the return statement."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_irr_analysis("IRR-T-004", "測試", _cash_flows(), 0.05, provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
