"""Mutation-style tests for ``feasibility.npv`` (F14 feasibility & economics family, second of two members built
this batch).

THE real invariants (textbook NPV formula, ``npv`` GENUINE_COMPUTE, the discount_rate<=-1 undefined-denominator
trap, and cash_flows[].period uniqueness) plus the structural invariants supporting them (real finite numbers
excluding bool, non-negative int periods excluding bool, non-empty subject_ref/cash_flows, id/version/provenance
shape), exercised at BOTH layers: construction-time refusal (``generate_npv_analysis`` raising a specific
``InvariantViolation`` code, or a plain ``TypeError`` for the GENUINE_COMPUTE smuggling attempt) and independent
gate re-derivation (``evaluate_npv_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same batch added (``typed-objects/net-present-value-analysis.schema.yaml``). Includes a hand-computed
worked example (cash_flows=[{0,-1000},{1,600},{2,600}], discount_rate=0.1 -> npv=41.32231405, independently
cross-checked via ``fractions.Fraction`` rather than trusting ``compute_npv``'s own arithmetic) and explicit
proof, in both directions, that the gate's ``1e-9`` tolerance absorbs float noise but not a real tamper.
"""

from __future__ import annotations

import copy
import inspect
import math
import unittest
from fractions import Fraction

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.feasibility.npv import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_npv,
    evaluate_npv_content_integrity_gate,
    evaluate_npv_gates,
    evaluate_provenance_required_gate,
    generate_npv_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

NPV_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/net-present-value-analysis.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")
_CASH_FLOWS = [{"period": 0, "amount": -1000}, {"period": 1, "amount": 600}, {"period": 2, "amount": 600}]


def _hand_computed_npv_via_fraction() -> float:
    """Independent hand-computation via ``fractions.Fraction`` -- never calls ``compute_npv``."""
    rate = Fraction(11, 10)
    total = Fraction(-1000, 1) + Fraction(600, 1) / rate + Fraction(600, 1) / (rate * rate)
    return round(float(total), 8)


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject_ref="設備汰換投資案 -- 兩年回收期評估",
        cash_flows=[dict(cf) for cf in _CASH_FLOWS],
        discount_rate=0.1,
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "NPV-T-001", **overrides: object):
    return generate_npv_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(NPV_ANALYSIS_SCHEMA, _valid_analysis(), "npv analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_npv_analysis, "NPV-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.npv.contract.yaml")
        self.assertEqual(analysis["id"], "NPV-T-INVOKE")

    def test_empty_catalog_blocks_npv_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_analysis())
        tampered["discount_rate"] = "ten percent"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NPV_ANALYSIS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_npv_content_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NPV_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_cash_flow_entry_key(self):
        analysis = _valid_analysis()
        analysis["cash_flows"][0]["note"] = "smuggled"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NPV_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled cash_flows[] key")

    def test_schema_rejects_discount_rate_of_exactly_negative_one(self):
        analysis = _valid_analysis()
        analysis["discount_rate"] = -1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NPV_ANALYSIS_SCHEMA, analysis, "analysis with discount_rate=-1")

    def test_schema_rejects_empty_cash_flows(self):
        analysis = _valid_analysis()
        analysis["cash_flows"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NPV_ANALYSIS_SCHEMA, analysis, "analysis with empty cash_flows")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.npv.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.npv contract")


class GenuineComputeTests(unittest.TestCase):
    """npv is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_npv_parameter(self):
        params = inspect.signature(generate_npv_analysis).parameters
        self.assertNotIn("npv", params)

    def test_caller_supplied_npv_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_npv_analysis("NPV-T-002", **_kwargs(), npv=999.0)  # type: ignore[call-arg]

    def test_generated_npv_matches_the_pure_function(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["npv"], compute_npv([dict(cf) for cf in _CASH_FLOWS], 0.1))


class HandComputedWorkedExampleTests(unittest.TestCase):
    """NPV applied by hand via fractions.Fraction, never calling compute_npv -- a genuine independent
    cross-check, not merely trusting the implementation's own arithmetic."""

    def test_npv_matches_the_hand_computed_fraction(self):
        expected = _hand_computed_npv_via_fraction()
        self.assertEqual(compute_npv([dict(cf) for cf in _CASH_FLOWS], 0.1), expected)
        self.assertEqual(expected, 41.32231405)

    def test_built_analysis_carries_the_hand_computed_npv(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["npv"], 41.32231405)

    def test_single_zero_period_flow_equals_its_own_amount(self):
        # A lone period-0 flow is undiscounted: (1+r)**0 == 1 for any r.
        self.assertEqual(compute_npv([{"period": 0, "amount": 500}], 0.25), 500.0)


class DiscountRateInvariantTests(unittest.TestCase):
    """THE real invariant: discount_rate<=-1 makes the formula's own denominator zero (or the base negative),
    an undefined NPV, not a valid answer."""

    def test_discount_rate_of_exactly_negative_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_DISCOUNT_RATE"):
            compute_npv([dict(cf) for cf in _CASH_FLOWS], -1.0)

    def test_discount_rate_below_negative_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_DISCOUNT_RATE"):
            compute_npv([dict(cf) for cf in _CASH_FLOWS], -1.5)

    def test_builder_refuses_a_discount_rate_of_negative_one(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_DISCOUNT_RATE"):
            _valid_analysis(discount_rate=-1.0)

    def test_discount_rate_does_not_crash_with_zero_division_error(self):
        try:
            compute_npv([dict(cf) for cf in _CASH_FLOWS], -1.0)
        except ZeroDivisionError:
            self.fail("compute_npv raised ZeroDivisionError instead of a fail-closed InvariantViolation")
        except InvariantViolation:
            pass

    def test_discount_rate_just_above_negative_one_is_accepted(self):
        # -0.99: (1 + -0.99) = 0.01, a tiny but nonzero, positive denominator -- a legal (if extreme) rate.
        result = compute_npv([{"period": 0, "amount": 100}, {"period": 1, "amount": 100}], -0.99)
        self.assertTrue(math.isfinite(result))

    def test_negative_discount_rate_above_negative_one_is_accepted(self):
        analysis = _valid_analysis(discount_rate=-0.05)
        self.assertTrue(math.isfinite(analysis["npv"]))


class CashFlowShapeTests(unittest.TestCase):
    def test_empty_cash_flows_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[])

    def test_non_list_cash_flows_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows="not-a-list")

    def test_duplicate_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS.*duplicates"):
            _valid_analysis(cash_flows=[{"period": 0, "amount": -1000}, {"period": 0, "amount": 600}])

    def test_negative_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": -1, "amount": -1000}])

    def test_float_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": 0.5, "amount": -1000}])

    def test_boolean_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": True, "amount": -1000}])

    def test_boolean_amount_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": 0, "amount": True}])

    def test_nan_amount_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": 0, "amount": float("nan")}])

    def test_non_dict_cash_flow_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=["not-a-dict"])

    def test_cash_flow_entry_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": 0, "amount": -1000, "note": "smuggled"}])

    def test_cash_flow_entry_missing_amount_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_CASH_FLOWS"):
            _valid_analysis(cash_flows=[{"period": 0}])


class OtherValidationTests(unittest.TestCase):
    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_SUBJECT_REF"):
            _valid_analysis(subject_ref="   ")

    def test_boolean_discount_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_DISCOUNT_RATE"):
            _valid_analysis(discount_rate=True)

    def test_nan_discount_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_DISCOUNT_RATE"):
            _valid_analysis(discount_rate=float("nan"))


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "NPV-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_VERSION"):
            generate_npv_analysis("NPV-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NPV_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class AliasingTests(unittest.TestCase):
    """provenance and cash_flows must be deep-copied at the return site -- never returned by reference."""

    def test_mutating_the_original_provenance_after_construction_does_not_change_the_record(self):
        original_provenance = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")
        analysis = generate_npv_analysis("NPV-T-ALIAS-001", **{**_kwargs(), "provenance": original_provenance})
        original_provenance["epistemic_type"] = "TAMPERED"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "HYPOTHESIS")

    def test_mutating_the_original_cash_flows_list_after_construction_does_not_change_the_record(self):
        original_cash_flows = [dict(cf) for cf in _CASH_FLOWS]
        analysis = generate_npv_analysis("NPV-T-ALIAS-002", **{**_kwargs(), "cash_flows": original_cash_flows})
        original_cash_flows[0]["amount"] = -999999
        original_cash_flows.append({"period": 99, "amount": 1})
        self.assertEqual(analysis["cash_flows"][0]["amount"], -1000)
        self.assertEqual(len(analysis["cash_flows"]), 3)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_npv_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_analysis())
        record["npv"] = 41.32231405 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_content_gate_catches_a_tamper_of_one_percent_of_true_value(self):
        record = copy.deepcopy(_valid_analysis())
        true_npv = 41.32231405
        record["npv"] = round(true_npv * 1.01, 8)  # 1% off -- far beyond the 1e-9 tolerance
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_whose_stored_discount_rate_is_at_the_undefined_boundary(self):
        record = copy.deepcopy(_valid_analysis())
        record["discount_rate"] = -1.0
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_with_a_duplicate_period(self):
        record = copy.deepcopy(_valid_analysis())
        record["cash_flows"][1]["period"] = 0  # now duplicates cash_flows[0]'s period
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_period(self):
        record = copy.deepcopy(_valid_analysis())
        record["cash_flows"][0]["period"] = True
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        del record["subject_ref"]
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_npv_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_cash_flow_entry_in_a_hand_tampered_record(self):
        record = copy.deepcopy(_valid_analysis())
        record["cash_flows"] = ["not-a-dict"]
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_npv_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_npv_gates_returns_two_gates_in_order(self):
        results = evaluate_npv_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "npv_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.npv")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "subject_ref", "cash_flows", "discount_rate", "npv", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
