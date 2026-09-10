"""Mutation-style tests for ``strategy.value_chain`` (7th F08 `context/strategy` family member,
after ``strategy.swot``, ``strategy.pestel``, ``strategy.steepv``, ``strategy.three_c``,
``strategy.tows``, ``strategy.porter_five_forces``).

Three real invariants (category coverage across PRIMARY/SUPPORT; every activity discloses
>=1 of cost_driver/value_driver; non-empty ``leverage_points``), exercised at THREE layers:
construction-time refusal (``generate_value_chain_analysis``/``value_chain_activity`` raising a
specific ``InvariantViolation`` code), independent gate re-derivation
(``evaluate_category_coverage_gate``/``evaluate_driver_disclosed_gate``/
``evaluate_leverage_points_disclosed_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely), and the real JSON Schema itself (``allOf`` contains/minContains + item-level
``anyOf``, checked against the spec-root schema this same slice added
(``typed-objects/value-chain-analysis.schema.yaml``), not a schema this test file invents).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.value_chain import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_CATEGORIES,
    all_gates_pass,
    evaluate_category_coverage_gate,
    evaluate_driver_disclosed_gate,
    evaluate_leverage_points_disclosed_gate,
    evaluate_provenance_required_gate,
    evaluate_value_chain_gates,
    generate_value_chain_analysis,
    value_chain_activity,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

VALUE_CHAIN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/value-chain-analysis.schema.yaml"


def _activities():
    return [
        value_chain_activity(
            "VC-T-001-A1",
            "PRIMARY",
            "outbound shipping operations",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            cost_driver="manual pick-and-pack time scales linearly with order volume",
            value_driver="shipping speed drives repeat purchase rate",
        ),
        value_chain_activity(
            "VC-T-001-A2",
            "SUPPORT",
            "checkout frontend development",
            make_provenance("SOURCE_FACT", "HUMAN_APPROVED"),
            value_driver="existing A/B framework is directly reusable",
        ),
    ]


def _valid_analysis(analysis_id="VALUECHAIN-T-001", activities=None, leverage_points="reusable frontend framework leverages shipping-speed-driven repeat purchases"):
    return generate_value_chain_analysis(analysis_id, activities if activities is not None else _activities(), leverage_points)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(VALUE_CHAIN_SCHEMA, _valid_analysis(), "value chain analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_value_chain_analysis, "VALUECHAIN-T-INVOKE", _activities(), "leverage found")
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.value_chain.contract.yaml")
        self.assertEqual(analysis["id"], "VALUECHAIN-T-INVOKE")

    def test_empty_catalog_blocks_value_chain_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_INVALID_ID"):
            _valid_analysis(analysis_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_INVALID_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_INVALID_VERSION"):
            generate_value_chain_analysis("VALUECHAIN-T-002", _activities(), "leverage found", version=1)

    def test_id_is_distinct_from_sibling_family_machine_ids(self):
        self.assertNotIn(METHOD_ID, {"strategy.swot", "strategy.three_c", "strategy.porter_five_forces"})
        self.assertEqual(METHOD_ID, "strategy.value_chain")

    def test_value_chain_and_three_c_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.three_c"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        strategy.three_c.contract.yaml's own test suite already establishes -- not just a one-time
        manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.value_chain.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.value_chain contract")


class CategoryEnumTests(unittest.TestCase):
    def test_invalid_category_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_INVALID_CATEGORY"):
            value_chain_activity("VC-T-BAD-001", "TERTIARY", "statement", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="x")

    def test_empty_activity_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_ACTIVITY_NAME"):
            value_chain_activity("VC-T-BAD-002", "PRIMARY", "", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="x")

    def test_whitespace_only_activity_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_ACTIVITY_NAME"):
            value_chain_activity("VC-T-BAD-003", "PRIMARY", "   ", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="x")

    def test_valid_categories_constant_matches_atlas_l522_split(self):
        self.assertEqual(VALID_CATEGORIES, frozenset({"PRIMARY", "SUPPORT"}))


class DriverInvariantTests(unittest.TestCase):
    """Atlas's own 'cost/value drivers' (F08 L522): an activity analysis that names neither has not
    actually been analyzed."""

    def test_activity_with_neither_driver_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_DRIVER"):
            value_chain_activity("VC-T-BAD-004", "PRIMARY", "some activity", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_activity_with_whitespace_only_drivers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_DRIVER"):
            value_chain_activity("VC-T-BAD-005", "PRIMARY", "some activity", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="   ", value_driver="   ")

    def test_activity_with_only_cost_driver_is_accepted(self):
        activity = value_chain_activity("VC-T-006", "PRIMARY", "some activity", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="labor time")
        self.assertEqual(activity["cost_driver"], "labor time")
        self.assertNotIn("value_driver", activity)

    def test_activity_with_only_value_driver_is_accepted(self):
        activity = value_chain_activity("VC-T-007", "SUPPORT", "some activity", make_provenance("HYPOTHESIS", "AI_GENERATED"), value_driver="reusable framework")
        self.assertEqual(activity["value_driver"], "reusable framework")
        self.assertNotIn("cost_driver", activity)

    def test_activity_with_both_drivers_stores_both(self):
        activity = value_chain_activity("VC-T-008", "PRIMARY", "some activity", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="labor", value_driver="speed")
        self.assertEqual(activity["cost_driver"], "labor")
        self.assertEqual(activity["value_driver"], "speed")

    def test_builder_refuses_analysis_with_one_driverless_activity_among_valid_ones(self):
        # value_chain_activity itself already refuses a driverless activity at construction, so proving
        # generate_value_chain_analysis's OWN independent check requires a hand-built raw dict that
        # bypassed value_chain_activity entirely (same "bypass the item builder" shape the gate tests
        # below exercise for the record-level builder).
        activities = _activities() + [{"id": "VC-T-009-A3", "category": "SUPPORT", "activity_name": "no driver disclosed", "provenance": make_provenance("HYPOTHESIS", "AI_GENERATED")}]
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_DRIVER"):
            generate_value_chain_analysis("VALUECHAIN-T-009", activities, "leverage found")


class CategoryCoverageInvariantTests(unittest.TestCase):
    """Atlas's own 'primary/support' (F08 L522): a record missing a whole category has not actually
    decomposed the value chain."""

    def test_empty_activities_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_ACTIVITIES_SET"):
            generate_value_chain_analysis("VALUECHAIN-T-003", [], "leverage found")

    def test_missing_support_category_is_refused(self):
        activities = [a for a in _activities() if a["category"] != "SUPPORT"]
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_CATEGORY_COVERAGE"):
            generate_value_chain_analysis("VALUECHAIN-T-004", activities, "leverage found")

    def test_missing_primary_category_is_refused(self):
        activities = [a for a in _activities() if a["category"] != "PRIMARY"]
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_CATEGORY_COVERAGE"):
            generate_value_chain_analysis("VALUECHAIN-T-005", activities, "leverage found")

    def test_only_one_category_present_is_refused(self):
        activities = [
            value_chain_activity("VC-T-006-A1", "PRIMARY", "a", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="x"),
            value_chain_activity("VC-T-006-A2", "PRIMARY", "b", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="y"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_MISSING_CATEGORY_COVERAGE"):
            generate_value_chain_analysis("VALUECHAIN-T-006", activities, "leverage found")

    def test_extra_activities_in_one_category_is_accepted_coverage_is_uncapped(self):
        """See value-chain-analysis.schema.yaml OQ-VALUECHAINANALYSIS-1: category coverage is >=1 per
        category, not exactly 1."""
        activities = _activities() + [value_chain_activity("VC-T-007-A3", "PRIMARY", "a second primary activity", make_provenance("HYPOTHESIS", "AI_GENERATED"), cost_driver="z")]
        analysis = generate_value_chain_analysis("VALUECHAIN-T-007", activities, "leverage found")
        self.assertEqual(len(analysis["activities"]), 3)


class LeveragePointsInvariantTests(unittest.TestCase):
    """Atlas's own '→找高槓桿點' (F08 L522): Value Chain's whole stated benefit is finding leverage
    points."""

    def test_empty_leverage_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_LEVERAGE_POINTS"):
            _valid_analysis(leverage_points="")

    def test_whitespace_only_leverage_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_LEVERAGE_POINTS"):
            _valid_analysis(leverage_points="   ")

    def test_none_leverage_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VALUECHAIN_EMPTY_LEVERAGE_POINTS"):
            _valid_analysis(leverage_points=None)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then
    call the gates. These prove the gates re-derive from raw fields rather than trusting the builder's
    own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_value_chain_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_missing_category(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["activities"][1]["category"] = "PRIMARY"  # was SUPPORT -- now zero SUPPORT activities remain
        gate = evaluate_category_coverage_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("SUPPORT", gate["evidence"][0]["missing_categories"])

    def test_gate_catches_hand_tampered_missing_driver(self):
        analysis = copy.deepcopy(_valid_analysis())
        del analysis["activities"][0]["cost_driver"]
        del analysis["activities"][0]["value_driver"]
        gate = evaluate_driver_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("VC-T-001-A1", gate["evidence"][0]["missing_driver_ids"])

    def test_gate_catches_hand_tampered_empty_leverage_points(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["leverage_points"] = ""
        gate = evaluate_leverage_points_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_provenance(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["activities"][0] = {**analysis["activities"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("VC-T-001-A1", gate["evidence"][0]["invalid_provenance_ids"])

    def test_category_coverage_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_category_coverage_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_driver_disclosed_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_driver_disclosed_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_leverage_points_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_leverage_points_disclosed_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_catches_non_dict_analysis(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_analysis_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_analysis())
        tampered["activities"][1]["category"] = "PRIMARY"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(VALUE_CHAIN_SCHEMA, tampered, "tampered analysis missing SUPPORT")
        gate = evaluate_category_coverage_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelCoverageTests(unittest.TestCase):
    """Proves the schema's own allOf contains/minContains constraint and item-level anyOf driver
    constraint are real, not just the runtime gate."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_fewer_than_two_activities(self):
        analysis = {
            "id": "VALUECHAIN-T-SCHEMA-001",
            "version": "1.0.0",
            "generated_by_method": "strategy.value_chain",
            "activities": _activities()[:1],
            "leverage_points": "leverage found",
        }
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VALUE_CHAIN_SCHEMA, analysis, "analysis with only 1 activity")

    def test_schema_rejects_an_activity_with_neither_driver(self):
        analysis = copy.deepcopy(_valid_analysis())
        del analysis["activities"][0]["cost_driver"]
        del analysis["activities"][0]["value_driver"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VALUE_CHAIN_SCHEMA, analysis, "analysis with a driverless activity")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as three-c-analysis.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key."""
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VALUE_CHAIN_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_activity_item_key(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["activities"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VALUE_CHAIN_SCHEMA, analysis, "analysis with a smuggled activity-item key")

    def test_schema_rejects_primary_only_activities(self):
        activities = [
            {"id": "VC-T-SCHEMA-002-A1", "category": "PRIMARY", "activity_name": "a", "cost_driver": "x", "provenance": make_provenance("HYPOTHESIS", "AI_GENERATED")},
            {"id": "VC-T-SCHEMA-002-A2", "category": "PRIMARY", "activity_name": "b", "cost_driver": "y", "provenance": make_provenance("HYPOTHESIS", "AI_GENERATED")},
        ]
        analysis = {"id": "VALUECHAIN-T-SCHEMA-002", "version": "1.0.0", "generated_by_method": "strategy.value_chain", "activities": activities, "leverage_points": "x"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VALUE_CHAIN_SCHEMA, analysis, "analysis with PRIMARY-only activities")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_value_chain_gates_returns_four_gates_in_order(self):
        results = evaluate_value_chain_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "category_coverage", "driver_disclosed", "leverage_points_disclosed"])

    def test_evaluate_value_chain_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_value_chain_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "VALUECHAIN-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.value_chain")

    def test_builder_does_not_leak_extra_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "activities", "leverage_points"})


if __name__ == "__main__":
    unittest.main()
