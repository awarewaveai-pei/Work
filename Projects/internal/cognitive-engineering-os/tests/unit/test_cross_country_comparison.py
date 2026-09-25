"""Mutation-style tests for ``foresight.cross_country_comparison`` (F13 foresight family, Atlas L676).

Atlas's own "normalize" pipeline stage is proven at BOTH independent layers:
the construction-time builder refuses a comparison with an empty
normalization_basis or a dangling jurisdiction reference, and the
independent gate re-derives the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.cross_country_comparison import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_comparison_integrity_gate,
    evaluate_cross_country_comparison_gates,
    evaluate_provenance_required_gate,
    generate_cross_country_comparison,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CROSS_COUNTRY_COMPARISON_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cross-country-comparison.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        jurisdictions=["TW", "JP", "KR"],
        comparisons=[
            {
                "metric": "minimum_wage_to_median_income_ratio",
                "normalization_basis": "PPP-adjusted, 2025 OECD basis",
                "values": [
                    {"jurisdiction": "TW", "value": 0.42},
                    {"jurisdiction": "JP", "value": 0.38},
                    {"jurisdiction": "KR", "value": 0.45},
                ],
            }
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_comparison(*, record_id: str = "XCOUNTRY-T-001", **overrides: object):
    return generate_cross_country_comparison(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_comparison_validates_against_the_real_schema(self):
        self.contracts.validate(CROSS_COUNTRY_COMPARISON_SCHEMA, _valid_comparison(), "cross country comparison")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, comparison = live.invoke(METHOD_ID, generate_cross_country_comparison, "XCOUNTRY-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.cross_country_comparison.contract.yaml")
        self.assertEqual(comparison["id"], "XCOUNTRY-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        comparison = _valid_comparison()
        comparison["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CROSS_COUNTRY_COMPARISON_SCHEMA, comparison, "comparison with a smuggled top-level key")

    def test_schema_rejects_non_number_value(self):
        comparison = _valid_comparison()
        comparison["comparisons"][0]["values"][0]["value"] = "not-a-number"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CROSS_COUNTRY_COMPARISON_SCHEMA, comparison, "comparison with a non-number value")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.cross_country_comparison.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.cross_country_comparison contract")


class JurisdictionCountTests(unittest.TestCase):
    """Atlas L676: a comparison of one jurisdiction is not a comparison."""

    def test_two_jurisdictions_is_legal(self):
        comparison = generate_cross_country_comparison(
            "XCOUNTRY-T-002",
            jurisdictions=["TW", "JP"],
            comparisons=[{"metric": "m", "normalization_basis": "b", "values": [{"jurisdiction": "TW", "value": 1}, {"jurisdiction": "JP", "value": 2}]}],
            provenance=PROVENANCE,
        )
        self.assertEqual(len(comparison["jurisdictions"]), 2)

    def test_one_jurisdiction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_TOO_FEW_JURISDICTIONS"):
            generate_cross_country_comparison(
                "XCOUNTRY-T-003",
                jurisdictions=["TW"],
                comparisons=[{"metric": "m", "normalization_basis": "b", "values": [{"jurisdiction": "TW", "value": 1}]}],
                provenance=PROVENANCE,
            )

    def test_zero_jurisdictions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_TOO_FEW_JURISDICTIONS"):
            generate_cross_country_comparison("XCOUNTRY-T-004", jurisdictions=[], comparisons=[], provenance=PROVENANCE)

    def test_duplicate_jurisdiction_declaration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_DUPLICATE_JURISDICTION"):
            _valid_comparison(jurisdictions=["TW", "TW", "JP"])


class NormalizationBasisTests(unittest.TestCase):
    """Atlas L676's own middle pipeline stage: comparable jurisdictions -> NORMALIZE -> compare."""

    def test_empty_normalization_basis_is_refused(self):
        kwargs = _kwargs()
        kwargs["comparisons"][0]["normalization_basis"] = ""
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_COMPARISON"):
            generate_cross_country_comparison("XCOUNTRY-T-005", **kwargs)

    def test_missing_normalization_basis_key_is_refused(self):
        kwargs = _kwargs()
        del kwargs["comparisons"][0]["normalization_basis"]
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_COMPARISON"):
            generate_cross_country_comparison("XCOUNTRY-T-006", **kwargs)

    def test_no_comparisons_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_NO_COMPARISONS"):
            generate_cross_country_comparison("XCOUNTRY-T-007", jurisdictions=["TW", "JP"], comparisons=[], provenance=PROVENANCE)


class ReferentialIntegrityTests(unittest.TestCase):
    """Every values[].jurisdiction must resolve to a declared jurisdictions[] entry; no duplicate jurisdiction
    within one comparison's values[]."""

    def test_dangling_jurisdiction_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["comparisons"][0]["values"][0]["jurisdiction"] = "US"
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_DANGLING_JURISDICTION_REF"):
            generate_cross_country_comparison("XCOUNTRY-T-008", **kwargs)

    def test_duplicate_value_jurisdiction_is_refused(self):
        kwargs = _kwargs()
        kwargs["comparisons"][0]["values"].append({"jurisdiction": "TW", "value": 0.99})
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_DUPLICATE_VALUE_JURISDICTION"):
            generate_cross_country_comparison("XCOUNTRY-T-009", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    """A shallow ``dict(item)``/``list(item)`` copy does not copy a NESTED list/dict field -- regression must
    mutate a nested container, not merely a scalar, or it passes against the broken shallow-copy defect."""

    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        comparison = generate_cross_country_comparison("XCOUNTRY-T-010", **kwargs)
        kwargs["comparisons"][0]["values"].append({"jurisdiction": "US", "value": 99})
        self.assertEqual(len(comparison["comparisons"][0]["values"]), 3)
        self.assertIsNot(comparison["comparisons"][0]["values"], kwargs["comparisons"][0]["values"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID comparison's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_comparison(self):
        results = evaluate_cross_country_comparison_gates(_valid_comparison(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_dangling_jurisdiction(self):
        record = copy.deepcopy(_valid_comparison())
        record["comparisons"][0]["values"][0]["jurisdiction"] = "US"
        gate = evaluate_comparison_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_value_jurisdiction(self):
        record = copy.deepcopy(_valid_comparison())
        record["comparisons"][0]["values"].append({"jurisdiction": "TW", "value": 0.1})
        gate = evaluate_comparison_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_normalization_basis(self):
        record = copy.deepcopy(_valid_comparison())
        record["comparisons"][0]["normalization_basis"] = ""
        gate = evaluate_comparison_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_single_jurisdiction(self):
        record = copy.deepcopy(_valid_comparison())
        record["jurisdictions"] = ["TW"]
        gate = evaluate_comparison_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_every_non_dict_top_level_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_comparison_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertIn(gate["status"], {"FAIL"})

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14):
            with self.subTest(bad=bad):
                results = evaluate_cross_country_comparison_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_comparison(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_comparison())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "XCOUNTRY-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_ID"):
            _valid_comparison(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_VERSION"):
            generate_cross_country_comparison("XCOUNTRY-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_PROVENANCE"):
            _valid_comparison(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.cross_country_comparison")

    def test_evaluate_gates_returns_two_gates_in_order(self):
        results = evaluate_cross_country_comparison_gates(_valid_comparison(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "comparison_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        comparison = _valid_comparison()
        self.assertEqual(
            set(comparison.keys()),
            {"id", "version", "generated_by_method", "jurisdictions", "comparisons", "provenance"},
        )

    def test_boolean_value_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["comparisons"][0]["values"][0]["value"] = True
        with self.assertRaisesRegex(InvariantViolation, "XCOUNTRY_INVALID_COMPARISON"):
            generate_cross_country_comparison("XCOUNTRY-T-012", **kwargs)



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_comparison()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_cross_country_comparison(base["id"], base["jurisdictions"], base["comparisons"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
