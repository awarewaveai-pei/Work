"""Mutation-style tests for ``feasibility.cost_effectiveness`` (F14 feasibility/economics family, third member
built this batch).

THE real invariant (``cost_per_unit`` GENUINE_COMPUTE = cost / effectiveness_outcome_units, the zero/negative
effectiveness_outcome_units trap refused with its own distinct ``CE_ZERO_EFFECTIVENESS`` code) plus the
structural invariants supporting it (real finite cost/effectiveness ranges, id shape/uniqueness), exercised at
BOTH layers: construction-time refusal and independent gate re-derivation (``evaluate_alternative_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same batch added
(``typed-objects/cost-effectiveness-analysis.schema.yaml``).
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
from ai_lego.modules.feasibility.cost_effectiveness import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    alternative,
    compute_cost_per_unit,
    evaluate_alternative_integrity_gate,
    evaluate_cost_effectiveness_gates,
    evaluate_provenance_required_gate,
    generate_cost_effectiveness_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

COST_EFFECTIVENESS_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cost-effectiveness-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _raw_alternative(**overrides: object) -> dict:
    base = dict(id="ALT-A", cost=480000, effectiveness_outcome_units=12000)
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(alternatives=[_raw_alternative()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "CE-T-001", **overrides: object):
    return generate_cost_effectiveness_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(COST_EFFECTIVENESS_ANALYSIS_SCHEMA, _valid_analysis(), "cost effectiveness analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_cost_effectiveness_analysis, "CE-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.cost_effectiveness.contract.yaml")
        self.assertEqual(analysis["id"], "CE-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_analysis())
        tampered["alternatives"][0]["cost_per_unit"] = -5.0
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COST_EFFECTIVENESS_ANALYSIS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_alternative_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COST_EFFECTIVENESS_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.cost_effectiveness.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.cost_effectiveness contract")


class GenuineComputeTests(unittest.TestCase):
    """cost_per_unit is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_cost_per_unit_parameter(self):
        params = inspect.signature(alternative).parameters
        self.assertNotIn("cost_per_unit", params)

    def test_caller_supplied_cost_per_unit_raises_type_error(self):
        with self.assertRaises(TypeError):
            alternative("ALT-A", 480000, 12000, cost_per_unit=999.0)  # type: ignore[call-arg]

    def test_generated_cost_per_unit_matches_the_pure_function(self):
        alt = alternative("ALT-A", 480000, 12000)
        self.assertEqual(alt["cost_per_unit"], compute_cost_per_unit(480000, 12000))

    def test_hand_computed_ratio(self):
        self.assertEqual(compute_cost_per_unit(480000, 12000), 40.0)


class ZeroEffectivenessTests(unittest.TestCase):
    """THE degenerate case this method exists to guard against -- effectiveness_outcome_units <= 0 must be
    refused with a distinct error code, never a ZeroDivisionError crash, never a silent inf/None."""

    def test_zero_effectiveness_is_refused_with_distinct_code(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            alternative("ALT-A", 100.0, 0)

    def test_negative_effectiveness_is_refused_with_distinct_code(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            alternative("ALT-A", 100.0, -5)

    def test_zero_effectiveness_does_not_crash_with_zero_division_error(self):
        try:
            alternative("ALT-A", 100.0, 0)
        except ZeroDivisionError:
            self.fail("alternative() raised ZeroDivisionError instead of a fail-closed InvariantViolation")
        except InvariantViolation:
            pass

    def test_compute_cost_per_unit_itself_guards_its_own_degenerate_input(self):
        """Independent of alternative()'s own guard -- the pure function fails closed even if reached directly."""
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            compute_cost_per_unit(100.0, 0)

    def test_generate_analysis_refuses_zero_effectiveness_through_the_full_builder(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            generate_cost_effectiveness_analysis("CE-T-002", alternatives=[_raw_alternative(effectiveness_outcome_units=0)], provenance=PROVENANCE)


class CostAndEffectivenessValidationTests(unittest.TestCase):
    def test_negative_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_COST"):
            alternative("ALT-A", -1.0, 100)

    def test_zero_cost_is_accepted(self):
        alt = alternative("ALT-A", 0.0, 100)
        self.assertEqual(alt["cost_per_unit"], 0.0)

    def test_boolean_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_COST"):
            alternative("ALT-A", True, 100)

    def test_boolean_effectiveness_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            alternative("ALT-A", 100.0, True)

    def test_nan_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_COST"):
            alternative("ALT-A", float("nan"), 100)

    def test_infinite_effectiveness_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_ZERO_EFFECTIVENESS"):
            alternative("ALT-A", 100.0, float("inf"))

    def test_empty_alternative_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_ALTERNATIVE_ID"):
            alternative("   ", 100.0, 10)


class DuplicateIdTests(unittest.TestCase):
    """Duplicate-id checks re-derived independently by the gate -- the exact defect class (3 of 14 sibling
    gates never re-deriving their own builder's duplicate-id check) the most recent critic pass found."""

    def test_duplicate_alternative_id_across_alternatives_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_DUPLICATE_ALTERNATIVE_ID"):
            generate_cost_effectiveness_analysis("CE-T-003", alternatives=[_raw_alternative(id="ALT-X"), _raw_alternative(id="ALT-X", cost=1)], provenance=PROVENANCE)

    def test_gate_catches_a_hand_tampered_duplicate_alternative_id_bypassing_the_builder(self):
        analysis = copy.deepcopy(_valid_analysis())
        second = copy.deepcopy(analysis["alternatives"][0])
        analysis["alternatives"].append(second)  # same id as alternatives[0]
        gate = evaluate_alternative_integrity_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        analysis = generate_cost_effectiveness_analysis("CE-T-004", **kwargs)
        kwargs["alternatives"].append(_raw_alternative(id="SMUGGLED"))
        self.assertEqual(len(analysis["alternatives"]), 1)
        self.assertIsNot(analysis["alternatives"], kwargs["alternatives"])


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of a sibling batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        analysis = generate_cost_effectiveness_analysis("CE-T-005", alternatives=[_raw_alternative()], provenance=provenance)
        self.assertIsNot(analysis["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_cost_effectiveness_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_cost_per_unit(self):
        record = copy.deepcopy(_valid_analysis())
        record["alternatives"][0]["cost_per_unit"] = 999.0  # true value for (480000, 12000) is 40.0
        gate = evaluate_alternative_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_whose_stored_effectiveness_is_zero(self):
        record = copy.deepcopy(_valid_analysis())
        record["alternatives"][0]["effectiveness_outcome_units"] = 0
        gate = evaluate_alternative_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_analysis())
        record["alternatives"][0]["cost_per_unit"] = 40.0 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_alternative_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_cost_effectiveness_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_malformed_entry_inside_alternatives_fails_closed_not_a_crash(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["alternatives"].append("not-a-dict")
        gate = evaluate_alternative_integrity_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evaluate_cost_effectiveness_gates_returns_two_gates_in_order(self):
        results = evaluate_cost_effectiveness_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "alternative_integrity"])


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["provenance"] = None
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CE-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_no_alternatives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_NO_ALTERNATIVES"):
            generate_cost_effectiveness_analysis("CE-T-006", alternatives=[], provenance=PROVENANCE)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CE_INVALID_VERSION"):
            generate_cost_effectiveness_analysis("CE-T-007", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.cost_effectiveness")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "alternatives", "provenance"})


if __name__ == "__main__":
    unittest.main()
