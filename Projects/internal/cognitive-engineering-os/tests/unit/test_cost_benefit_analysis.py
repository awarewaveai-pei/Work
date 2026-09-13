"""Mutation-style tests for ``feasibility.cost_benefit_analysis`` (F14 feasibility/economics family, second
member built this batch).

Atlas §12.25's own two verbatim rules are proven at BOTH independent layers: (1) discounting/sensitivity/
distributional-effects are required per alternative (L2850), and (2) the non_monetizable/value coupling refuses a
fake precise price on a flagged-non-monetizable item (L2852). Also proves the duplicate-id-gate-re-derivation
requirement (per-alternative id uniqueness AND per-item id uniqueness within costs[]/benefits[]) and the
provenance-deepcopy requirement -- the exact two defect classes the most recent critic pass on this corpus found.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.feasibility.cost_benefit_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    alternative,
    cost_benefit_item,
    evaluate_alternative_integrity_gate,
    evaluate_cost_benefit_analysis_gates,
    evaluate_provenance_required_gate,
    generate_cost_benefit_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

COST_BENEFIT_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cost-benefit-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _raw_alternative(**overrides: object) -> dict:
    base = dict(
        id="ALT-A",
        costs=[{"id": "C1", "description": "cost one", "value": 100.0, "non_monetizable": False}],
        benefits=[
            {"id": "B1", "description": "benefit one", "value": 200.0, "non_monetizable": False},
            {"id": "B2", "description": "non-monetizable benefit", "value": None, "non_monetizable": True},
        ],
        discount_rate=0.08,
        sensitivity_analysis="if cost rises 10%, net benefit stays positive",
        distributional_effects="costs borne by engineering, benefits by customers",
    )
    base.update(overrides)
    return base


def _build_alternative(raw: dict):
    """``alternative()``'s first parameter is named ``alt_id`` (not ``id``, matching this corpus's own
    ``item_id``/``claim_id`` convention of avoiding a builtin-shadowing parameter name) -- this helper bridges a
    raw ``{"id": ..., ...}`` dict (the schema's own field name) to that call shape."""
    return alternative(raw["id"], raw["costs"], raw["benefits"], raw["discount_rate"], raw["sensitivity_analysis"], raw["distributional_effects"])


def _kwargs(**overrides: object) -> dict:
    base = dict(alternatives=[_raw_alternative()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "CBA-T-001", **overrides: object):
    return generate_cost_benefit_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(COST_BENEFIT_ANALYSIS_SCHEMA, _valid_analysis(), "cost benefit analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_cost_benefit_analysis, "CBA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.cost_benefit_analysis.contract.yaml")
        self.assertEqual(analysis["id"], "CBA-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COST_BENEFIT_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.cost_benefit_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.cost_benefit_analysis contract")


class NonMonetizableValueCouplingTests(unittest.TestCase):
    """Atlas §12.25 (L2852): non-monetizable factors must not be forced into a fake precise price."""

    def test_non_monetizable_item_with_a_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ITEM"):
            cost_benefit_item("B9", "x", 100.0, True)

    def test_monetizable_item_with_null_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ITEM"):
            cost_benefit_item("C9", "x", None, False)

    def test_non_monetizable_item_with_null_value_is_accepted(self):
        item = cost_benefit_item("B9", "x", None, True)
        self.assertIsNone(item["value"])

    def test_monetizable_item_with_a_real_value_is_accepted(self):
        item = cost_benefit_item("C9", "x", 42.0, False)
        self.assertEqual(item["value"], 42.0)

    def test_non_monetizable_must_be_a_bool(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ITEM"):
            cost_benefit_item("C9", "x", None, 1)  # int, not bool

    def test_alternative_with_smuggled_value_on_non_monetizable_item_is_refused_at_construction(self):
        alt = _raw_alternative()
        alt["benefits"][1]["value"] = 999.0  # B2 is non_monetizable:true
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(alt)


class DiscountingSensitivityDistributionalTests(unittest.TestCase):
    """Atlas §12.25 (L2850): 需 discounting、sensitivity、distributional effects."""

    def test_missing_sensitivity_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(sensitivity_analysis=""))

    def test_missing_distributional_effects_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(distributional_effects="   "))

    def test_discount_rate_at_or_below_negative_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(discount_rate=-1.0))

    def test_discount_rate_above_negative_one_is_accepted(self):
        alt = _build_alternative(_raw_alternative(discount_rate=-0.5))
        self.assertEqual(alt["discount_rate"], -0.5)

    def test_boolean_discount_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(discount_rate=True))

    def test_nan_discount_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(discount_rate=float("nan")))


class DuplicateIdTests(unittest.TestCase):
    """Duplicate-id checks re-derived independently by the gate -- the exact defect class (3 of 14 sibling
    gates never re-deriving their own builder's duplicate-id check) the most recent critic pass found."""

    def test_duplicate_cost_id_within_one_alternative_is_refused_at_construction(self):
        alt = _raw_alternative(costs=[{"id": "C1", "description": "a", "value": 1.0, "non_monetizable": False}, {"id": "C1", "description": "b", "value": 2.0, "non_monetizable": False}])
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(alt)

    def test_duplicate_benefit_id_within_one_alternative_is_refused_at_construction(self):
        alt = _raw_alternative(benefits=[{"id": "B1", "description": "a", "value": 1.0, "non_monetizable": False}, {"id": "B1", "description": "b", "value": 2.0, "non_monetizable": False}])
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(alt)

    def test_duplicate_alternative_id_across_alternatives_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_DUPLICATE_ALTERNATIVE_ID"):
            generate_cost_benefit_analysis("CBA-T-DUP", alternatives=[_raw_alternative(id="ALT-X"), _raw_alternative(id="ALT-X")], provenance=PROVENANCE)

    def test_gate_catches_a_hand_tampered_duplicate_cost_id_bypassing_the_builder(self):
        """The gate must re-derive the duplicate-id check from raw fields -- never trust that the builder ran."""
        analysis = copy.deepcopy(_valid_analysis())
        analysis["alternatives"][0]["costs"].append({"id": "C1", "description": "smuggled duplicate", "value": 5.0, "non_monetizable": False})
        gate = evaluate_alternative_integrity_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_hand_tampered_duplicate_alternative_id_bypassing_the_builder(self):
        analysis = copy.deepcopy(_valid_analysis())
        second = copy.deepcopy(analysis["alternatives"][0])
        analysis["alternatives"].append(second)  # same id as alternatives[0]
        gate = evaluate_alternative_integrity_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_empty_costs_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(costs=[]))

    def test_empty_benefits_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ALTERNATIVE"):
            _build_alternative(_raw_alternative(benefits=[]))


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        analysis = generate_cost_benefit_analysis("CBA-T-002", **kwargs)
        kwargs["alternatives"][0]["costs"].append({"id": "SMUGGLED", "description": "x", "value": 1.0, "non_monetizable": False})
        self.assertEqual(len(analysis["alternatives"][0]["costs"]), 1)
        self.assertIsNot(analysis["alternatives"][0]["costs"], kwargs["alternatives"][0]["costs"])


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of a sibling batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        analysis = generate_cost_benefit_analysis("CBA-T-003", alternatives=[_raw_alternative()], provenance=provenance)
        self.assertIsNot(analysis["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_cost_benefit_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_cost_benefit_analysis_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_malformed_entry_inside_alternatives_fails_closed_not_a_crash(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["alternatives"].append("not-a-dict")
        gate = evaluate_alternative_integrity_gate(analysis, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evaluate_cost_benefit_analysis_gates_returns_two_gates_in_order(self):
        results = evaluate_cost_benefit_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "CBA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_no_alternatives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_NO_ALTERNATIVES"):
            generate_cost_benefit_analysis("CBA-T-004", alternatives=[], provenance=PROVENANCE)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CBA_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.cost_benefit_analysis")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "alternatives", "provenance"})


if __name__ == "__main__":
    unittest.main()
