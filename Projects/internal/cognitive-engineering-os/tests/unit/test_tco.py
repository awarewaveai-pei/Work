"""Mutation-style tests for ``feasibility.tco`` (F14 feasibility & economics family, sibling method 1/2 built
this batch).

THE real invariant (all 12 of section 12.26's own cost categories must be explicitly present, ``total_tco``
GENUINE_COMPUTE), plus the structural invariants supporting it (real finite non-negative category values
excluding bool, non-empty subject_ref, id/version/provenance shape), exercised at BOTH layers: construction-time
refusal (``generate_tco`` raising a specific ``InvariantViolation`` code, or a plain ``TypeError`` for the
GENUINE_COMPUTE smuggling attempt) and independent gate re-derivation
(``evaluate_total_tco_integrity_gate``/``evaluate_cost_category_completeness_gate`` catching a hand-tampered
raw dict that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same batch added
(``typed-objects/total-cost-of-ownership.schema.yaml``). Includes a hand-computed worked example (12 categories
summing to 187500.50).
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
from ai_lego.modules.feasibility.tco import (
    COST_CATEGORIES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_total_tco,
    evaluate_cost_category_completeness_gate,
    evaluate_provenance_required_gate,
    evaluate_tco_gates,
    evaluate_total_tco_integrity_gate,
    generate_tco,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

TCO_SCHEMA = "ai-lego://specs/cognitive/typed-objects/total-cost-of-ownership.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _well_formed_categories(**overrides: object) -> dict:
    base = {
        "purchase": 0,
        "implementation": 45000,
        "migration": 32000.5,
        "people": 60000,
        "operation": 28000,
        "support": 9000,
        "security": 6000,
        "compliance": 4000,
        "downtime": 2500,
        "exit": 0,
        "data_egress": 1000,
        "decommission": 0,
    }
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject_ref="遷移現有自架 PostgreSQL 到 Managed Cloud DB 服務（3 年期）",
        cost_categories=_well_formed_categories(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_tco(*, record_id: str = "TCO-T-001", **overrides: object):
    return generate_tco(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_tco_validates_against_the_real_schema(self):
        self.contracts.validate(TCO_SCHEMA, _valid_tco(), "total cost of ownership")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, tco = live.invoke(METHOD_ID, generate_tco, "TCO-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.tco.contract.yaml")
        self.assertEqual(tco["id"], "TCO-T-INVOKE")

    def test_empty_catalog_blocks_tco_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_tco())
        tampered["total_tco"] = -1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TCO_SCHEMA, tampered, "tampered tco")
        gate = evaluate_total_tco_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        tco = _valid_tco()
        tco["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TCO_SCHEMA, tco, "tco with a smuggled top-level key")

    def test_schema_rejects_missing_subject_ref(self):
        tco = _valid_tco()
        del tco["subject_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TCO_SCHEMA, tco, "tco with subject_ref removed")

    def test_schema_rejects_cost_categories_missing_a_key(self):
        tco = _valid_tco()
        del tco["cost_categories"]["exit"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TCO_SCHEMA, tco, "tco with exit category removed")

    def test_schema_rejects_cost_categories_with_an_unknown_key(self):
        tco = _valid_tco()
        tco["cost_categories"]["bribes"] = 500
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TCO_SCHEMA, tco, "tco with a smuggled cost category")

    def test_id_is_distinct_from_a_sibling_f14_machine_id(self):
        self.assertEqual(METHOD_ID, "feasibility.tco")
        self.assertNotEqual(METHOD_ID, "feasibility.unit_economics")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.tco.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.tco contract")


class GenuineComputeTests(unittest.TestCase):
    """total_tco is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_total_tco_parameter(self):
        params = inspect.signature(generate_tco).parameters
        self.assertNotIn("total_tco", params)

    def test_caller_supplied_total_tco_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_tco("TCO-T-002", **_kwargs(), total_tco=1.0)  # type: ignore[call-arg]

    def test_generated_total_tco_matches_the_pure_function(self):
        tco = _valid_tco()
        self.assertEqual(tco["total_tco"], compute_total_tco(_well_formed_categories()))


class HandComputedWorkedExampleTests(unittest.TestCase):
    def test_total_tco_matches_the_hand_computed_sum(self):
        # 0+45000+32000.5+60000+28000+9000+6000+4000+2500+0+1000+0 = 187500.5
        self.assertEqual(compute_total_tco(_well_formed_categories()), 187500.5)

    def test_built_tco_carries_the_hand_computed_total(self):
        tco = _valid_tco()
        self.assertEqual(tco["total_tco"], 187500.5)

    def test_all_zero_categories_yields_zero_total(self):
        tco = _valid_tco(cost_categories=_well_formed_categories(**{key: 0 for key in COST_CATEGORIES}))
        self.assertEqual(tco["total_tco"], 0)


class CostCategoryCompletenessTests(unittest.TestCase):
    """Atlas section 12.26's own real invariant: a missing category is refused (0 is a legal explicit value)."""

    def test_missing_a_category_is_refused(self):
        incomplete = _well_formed_categories()
        del incomplete["exit"]
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=incomplete)

    def test_missing_multiple_categories_is_refused(self):
        incomplete = _well_formed_categories()
        del incomplete["exit"]
        del incomplete["decommission"]
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=incomplete)

    def test_unknown_category_key_is_refused(self):
        smuggled = _well_formed_categories()
        smuggled["bribes"] = 500
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=smuggled)

    def test_all_12_categories_explicitly_present_with_zero_is_legal(self):
        zeroed = _well_formed_categories(**{key: 0 for key in COST_CATEGORIES})
        tco = _valid_tco(cost_categories=zeroed)
        self.assertEqual(set(tco["cost_categories"].keys()), set(COST_CATEGORIES))

    def test_negative_category_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=_well_formed_categories(purchase=-1))

    def test_boolean_category_value_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, int) would silently accept True/False as
        costs 1/0. Must be explicitly refused."""
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=_well_formed_categories(purchase=True))

    def test_string_category_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=_well_formed_categories(purchase="5000"))

    def test_nan_category_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=_well_formed_categories(purchase=float("nan")))

    def test_infinite_category_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=_well_formed_categories(purchase=float("inf")))

    def test_non_dict_cost_categories_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_COST_CATEGORIES"):
            _valid_tco(cost_categories=["not", "a", "dict"])

    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_SUBJECT_REF"):
            _valid_tco(subject_ref="   ")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TCO-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_ID"):
            _valid_tco(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_ID"):
            _valid_tco(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_VERSION"):
            generate_tco("TCO-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TCO_INVALID_PROVENANCE"):
            _valid_tco(provenance={"epistemic_type": "NOT_REAL"})


class ProvenanceAliasingTests(unittest.TestCase):
    """provenance and cost_categories must be deepcopy'd at every return site, never returned by reference."""

    def test_mutating_caller_provenance_after_construction_does_not_affect_the_record(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        tco = _valid_tco(provenance=provenance)
        provenance["epistemic_type"] = "TAMPERED"
        self.assertEqual(tco["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_mutating_caller_cost_categories_after_construction_does_not_affect_the_record(self):
        categories = _well_formed_categories()
        tco = _valid_tco(cost_categories=categories)
        categories["purchase"] = 999999
        self.assertEqual(tco["cost_categories"]["purchase"], 0)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID tco's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_tco(self):
        results = evaluate_tco_gates(_valid_tco(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_total_integrity_gate_catches_hand_tampered_wrong_total(self):
        record = copy.deepcopy(_valid_tco())
        record["total_tco"] = 1.0  # true total is 187500.5
        gate = evaluate_total_tco_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_hand_tampered_missing_category(self):
        record = copy.deepcopy(_valid_tco())
        del record["cost_categories"]["exit"]
        gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_hand_tampered_unknown_category(self):
        record = copy.deepcopy(_valid_tco())
        record["cost_categories"]["bribes"] = 500
        gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_total_integrity_gate_fails_closed_when_categories_are_malformed_not_a_crash(self):
        record = copy.deepcopy(_valid_tco())
        del record["cost_categories"]["exit"]
        gate = evaluate_total_tco_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_hand_tampered_boolean_category(self):
        record = copy.deepcopy(_valid_tco())
        record["cost_categories"]["purchase"] = True
        gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_garbage_input_without_crashing(self):
        for bad in (None, "not-a-dict", [], 42, 3.14, True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_cost_category_completeness_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_total_integrity_gate_catches_garbage_input_without_crashing(self):
        for bad in (None, "not-a-dict", [], 42, 3.14, True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_total_tco_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_malformed_cost_categories_values(self):
        """Malformed entries INSIDE cost_categories, not just at the top level."""
        for bad_cost_categories in (None, "not-a-dict", [], True, {}, {"junk": 1}, _well_formed_categories(purchase="500")):
            with self.subTest(bad_cost_categories=bad_cost_categories):
                record = copy.deepcopy(_valid_tco())
                record["cost_categories"] = bad_cost_categories
                gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_tco())
        record["id"] = "WRONG-001"
        gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_tco())
        record["version"] = 1
        gate = evaluate_cost_category_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_total_integrity_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_tco())
        record["total_tco"] = 187500.5 + 1e-8  # well within the 1e-6 tolerance
        gate = evaluate_total_tco_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_tco(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_tco())
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

    def test_evaluate_tco_gates_returns_three_gates_in_order(self):
        results = evaluate_tco_gates(_valid_tco(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "cost_category_completeness", "total_tco_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.tco")

    def test_cost_categories_constant_has_exactly_12_entries_in_atlas_order(self):
        self.assertEqual(
            COST_CATEGORIES,
            ("purchase", "implementation", "migration", "people", "operation", "support", "security", "compliance", "downtime", "exit", "data_egress", "decommission"),
        )

    def test_builder_does_not_leak_extra_top_level_keys(self):
        tco = _valid_tco()
        self.assertEqual(
            set(tco.keys()),
            {"id", "version", "generated_by_method", "subject_ref", "cost_categories", "total_tco", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
