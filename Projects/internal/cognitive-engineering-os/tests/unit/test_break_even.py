"""Mutation-style tests for ``feasibility.break_even`` (F14 feasibility & economics family, first of two members
built this batch).

THE real invariant (fixed_cost/contribution_margin_per_unit ratio, ``break_even_volume_units`` GENUINE_COMPUTE,
the non-positive-contribution-margin trap) plus the structural invariants supporting it (real finite numbers
excluding bool, non-empty subject_ref, id/version/provenance shape), exercised at BOTH layers: construction-time
refusal (``generate_break_even_analysis`` raising a specific ``InvariantViolation`` code, or a plain ``TypeError``
for the GENUINE_COMPUTE smuggling attempt) and independent gate re-derivation
(``evaluate_break_even_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema this
same batch added (``typed-objects/break-even-analysis.schema.yaml``). Includes a hand-computed worked example
(fixed_cost=120000, contribution_margin_per_unit=15 -> break_even_volume_units=8000) and provenance/cash_flows
deep-copy-at-return-site regression coverage.
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
from ai_lego.modules.feasibility.break_even import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_break_even_volume,
    evaluate_break_even_content_integrity_gate,
    evaluate_break_even_gates,
    evaluate_provenance_required_gate,
    generate_break_even_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BREAK_EVEN_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/break-even-analysis.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject_ref="新產品線 X 的第一年定價方案",
        fixed_cost=120000,
        contribution_margin_per_unit=15,
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "BEVEN-T-001", **overrides: object):
    return generate_break_even_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(BREAK_EVEN_ANALYSIS_SCHEMA, _valid_analysis(), "break-even analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_break_even_analysis, "BEVEN-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.break_even.contract.yaml")
        self.assertEqual(analysis["id"], "BEVEN-T-INVOKE")

    def test_empty_catalog_blocks_break_even_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["contribution_margin_per_unit"] = "fifteen"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BREAK_EVEN_ANALYSIS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_break_even_content_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BREAK_EVEN_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_missing_subject_ref(self):
        analysis = _valid_analysis()
        del analysis["subject_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BREAK_EVEN_ANALYSIS_SCHEMA, analysis, "analysis with subject_ref removed")

    def test_schema_rejects_negative_fixed_cost(self):
        analysis = _valid_analysis()
        analysis["fixed_cost"] = -1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BREAK_EVEN_ANALYSIS_SCHEMA, analysis, "analysis with negative fixed_cost")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own claim of validity true going forward, same live check every
        sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.break_even.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.break_even contract")


class GenuineComputeTests(unittest.TestCase):
    """break_even_volume_units is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_break_even_volume_units_parameter(self):
        params = inspect.signature(generate_break_even_analysis).parameters
        self.assertNotIn("break_even_volume_units", params)

    def test_caller_supplied_break_even_volume_units_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_break_even_analysis("BEVEN-T-002", **_kwargs(), break_even_volume_units=1)  # type: ignore[call-arg]

    def test_generated_volume_matches_the_pure_function(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["break_even_volume_units"], compute_break_even_volume(120000, 15))


class HandComputedWorkedExampleTests(unittest.TestCase):
    def test_volume_matches_the_hand_computed_ratio(self):
        self.assertEqual(compute_break_even_volume(120000, 15), 8000.0)

    def test_built_analysis_carries_the_hand_computed_volume(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["break_even_volume_units"], 8000.0)

    def test_fractional_result_is_rounded_to_eight_decimal_places(self):
        # 100 / 3 = 33.333333333... -> round(., 8) = 33.33333333
        self.assertEqual(compute_break_even_volume(100, 3), round(100 / 3, 8))


class NonPositiveContributionMarginTests(unittest.TestCase):
    """THE real invariant: a non-positive per-unit contribution margin means no finite volume ever breaks even."""

    def test_zero_contribution_margin_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN"):
            compute_break_even_volume(120000, 0)

    def test_negative_contribution_margin_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN"):
            compute_break_even_volume(120000, -5)

    def test_builder_refuses_a_nonpositive_margin_analysis(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin_per_unit=0)

    def test_nonpositive_margin_does_not_crash_with_zero_division_error(self):
        try:
            compute_break_even_volume(120000, 0)
        except ZeroDivisionError:
            self.fail("compute_break_even_volume raised ZeroDivisionError instead of a fail-closed InvariantViolation")
        except InvariantViolation:
            pass


class NumericValidationTests(unittest.TestCase):
    """fixed_cost/contribution_margin_per_unit must each be a genuine finite real number, bool excluded (Python's
    bool is an int subclass -- isinstance(True, int) is True, the same documented trap
    epistemic.bayesian_updating's own _is_valid_probability guards against)."""

    def test_negative_fixed_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_FIXED_COST"):
            _valid_analysis(fixed_cost=-1)

    def test_boolean_fixed_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_FIXED_COST"):
            _valid_analysis(fixed_cost=True)

    def test_boolean_contribution_margin_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin_per_unit=True)

    def test_string_fixed_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_FIXED_COST"):
            _valid_analysis(fixed_cost="120000")

    def test_nan_fixed_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_FIXED_COST"):
            _valid_analysis(fixed_cost=float("nan"))

    def test_infinite_contribution_margin_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin_per_unit=float("inf"))

    def test_zero_fixed_cost_is_accepted(self):
        analysis = _valid_analysis(fixed_cost=0)
        self.assertEqual(analysis["break_even_volume_units"], 0.0)

    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_SUBJECT_REF"):
            _valid_analysis(subject_ref="   ")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BEVEN-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_VERSION"):
            generate_break_even_analysis("BEVEN-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BREAKEVEN_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class ProvenanceAliasingTests(unittest.TestCase):
    """provenance must be deep-copied at the return site -- never returned by reference."""

    def test_mutating_the_original_provenance_after_construction_does_not_change_the_record(self):
        original_provenance = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")
        analysis = generate_break_even_analysis("BEVEN-T-ALIAS-001", **{**_kwargs(), "provenance": original_provenance})
        original_provenance["epistemic_type"] = "TAMPERED"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "HYPOTHESIS")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_break_even_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_volume(self):
        record = copy.deepcopy(_valid_analysis())
        record["break_even_volume_units"] = 1  # true value for (120000, 15) is 8000
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_whose_stored_margin_is_nonpositive(self):
        record = copy.deepcopy(_valid_analysis())
        record["contribution_margin_per_unit"] = 0
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_fixed_cost(self):
        record = copy.deepcopy(_valid_analysis())
        record["fixed_cost"] = True
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        del record["subject_ref"]
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_break_even_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_analysis())
        record["break_even_volume_units"] = 8000.0 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_content_gate_catches_tamper_beyond_tolerance(self):
        record = copy.deepcopy(_valid_analysis())
        record["break_even_volume_units"] = 8000.0 + 1e-6  # well beyond the 1e-9 tolerance
        gate = evaluate_break_even_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
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

    def test_evaluate_break_even_gates_returns_two_gates_in_order(self):
        results = evaluate_break_even_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "break_even_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.break_even")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "subject_ref", "fixed_cost", "contribution_margin_per_unit", "break_even_volume_units", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
