"""Mutation-style tests for ``foresight.scenario_planning`` (F13 foresight family, Atlas §11.27).

Atlas §11.27's own nine-required-element list (L1822-1830) and its
two-uncertainty/four-scenario quadrantChart count are proven at BOTH
independent layers: the construction-time builder refuses an incomplete
scenario or a wrong count, and the independent gate re-derives the same
rules directly from a raw (possibly hand-tampered) dict, never trusting
that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.scenario_planning import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    REQUIRED_SCENARIO_COUNT,
    REQUIRED_UNCERTAINTY_COUNT,
    all_gates_pass,
    evaluate_nine_element_completeness_gate,
    evaluate_provenance_required_gate,
    evaluate_scenario_planning_gates,
    evaluate_uncertainty_scenario_count_gate,
    generate_scenario_set,
    scenario,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SCENARIO_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/scenario-set.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _scenario_kwargs(**overrides: object) -> dict:
    base = dict(
        scenario_id="SCEN-T-001-S1",
        drivers=["d1"],
        assumptions=["a1"],
        narrative="n1",
        stakeholder_responses=["sr1"],
        competitor_responses=["cr1"],
        second_third_order_effects=["e1"],
        signposts=["sp1"],
        strategy_performance="perf1",
        reversal_condition="rc1",
    )
    base.update(overrides)
    return base


def _four_scenarios() -> list[dict]:
    return [
        scenario(**_scenario_kwargs(scenario_id=f"SCEN-T-001-S{i}"))
        for i in range(1, REQUIRED_SCENARIO_COUNT + 1)
    ]


def _uncertainties() -> list[str]:
    return ["u1", "u2"][:REQUIRED_UNCERTAINTY_COUNT]


def _valid_set(*, record_id: str = "SCEN-T-001"):
    return generate_scenario_set(record_id, _uncertainties(), _four_scenarios(), PROVENANCE)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_set_validates_against_the_real_schema(self):
        self.contracts.validate(SCENARIO_SET_SCHEMA, _valid_set(), "scenario set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, result = live.invoke(METHOD_ID, generate_scenario_set, "SCEN-T-INVOKE", _uncertainties(), _four_scenarios(), PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.scenario_planning.contract.yaml")
        self.assertEqual(result["id"], "SCEN-T-INVOKE")

    def test_empty_catalog_blocks_scenario_planning_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_set()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_a_scenario_missing_a_required_element(self):
        record = _valid_set()
        del record["scenarios"][0]["narrative"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, record, "record with an incomplete scenario")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.scenario_planning.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.scenario_planning contract")


class NineElementCompletenessTests(unittest.TestCase):
    """Atlas §11.27 (L1822-1830): every scenario requires all nine named elements, non-empty."""

    def test_well_formed_scenario_is_accepted(self):
        s = scenario(**_scenario_kwargs())
        self.assertTrue(all(s[field] for field in ("drivers", "assumptions", "narrative", "stakeholder_responses", "competitor_responses", "second_third_order_effects", "signposts", "strategy_performance", "reversal_condition")))

    def test_missing_required_key_is_refused_at_construction(self):
        kwargs = _scenario_kwargs()
        del kwargs["drivers"]
        with self.assertRaisesRegex(TypeError, "drivers"):
            scenario(**kwargs)  # missing positional arg -- Python's own signature enforcement

    def test_empty_list_element_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_SCENARIO"):
            scenario(**_scenario_kwargs(drivers=[]))

    def test_blank_string_element_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_SCENARIO"):
            scenario(**_scenario_kwargs(narrative="   "))

    def test_non_list_where_list_required_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_SCENARIO"):
            scenario(**_scenario_kwargs(signposts="not-a-list"))

    def test_list_field_does_not_alias_the_callers_own_list(self):
        drivers = ["original"]
        built = scenario(**_scenario_kwargs(drivers=drivers))
        drivers.append("mutated-after-construction")
        self.assertNotIn("mutated-after-construction", built["drivers"])
        self.assertIsNot(built["drivers"], drivers)


class UncertaintyScenarioCountTests(unittest.TestCase):
    """Atlas §11.27's own quadrantChart (L1806-1814): exactly two axes, exactly four worlds."""

    def test_one_critical_uncertainty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_UNCERTAINTY_COUNT"):
            generate_scenario_set("SCEN-T-002", ["only-one"], _four_scenarios(), PROVENANCE)

    def test_three_critical_uncertainties_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_UNCERTAINTY_COUNT"):
            generate_scenario_set("SCEN-T-003", ["u1", "u2", "u3"], _four_scenarios(), PROVENANCE)

    def test_three_scenarios_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_SCENARIO_COUNT"):
            generate_scenario_set("SCEN-T-004", _uncertainties(), _four_scenarios()[:3], PROVENANCE)

    def test_five_scenarios_is_refused(self):
        five = _four_scenarios() + [scenario(**_scenario_kwargs(scenario_id="SCEN-T-005-S5"))]
        with self.assertRaisesRegex(InvariantViolation, "SCEN_SCENARIO_COUNT"):
            generate_scenario_set("SCEN-T-005", _uncertainties(), five, PROVENANCE)

    def test_duplicate_scenario_id_is_refused(self):
        scenarios = _four_scenarios()
        scenarios[1] = scenario(**_scenario_kwargs(scenario_id=scenarios[0]["id"]))
        with self.assertRaisesRegex(InvariantViolation, "SCEN_DUPLICATE_SCENARIO_ID"):
            generate_scenario_set("SCEN-T-006", _uncertainties(), scenarios, PROVENANCE)

    def test_two_and_four_is_accepted(self):
        record = _valid_set()
        self.assertEqual(len(record["critical_uncertainties"]), REQUIRED_UNCERTAINTY_COUNT)
        self.assertEqual(len(record["scenarios"]), REQUIRED_SCENARIO_COUNT)

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        """Nested-container aliasing regression, applied to `provenance`: mutating the caller's own provenance
        dict after construction must not silently change the already-returned 'validated' record."""
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_scenario_set("SCEN-T-007", _uncertainties(), _four_scenarios(), provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_scenario_planning_gates(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_completeness_gate_catches_hand_tampered_missing_element(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"][0]["signposts"] = []
        gate = evaluate_nine_element_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_count_gate_catches_hand_tampered_extra_scenario(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"].append(scenario(**_scenario_kwargs(scenario_id="SCEN-T-EXTRA")))
        gate = evaluate_uncertainty_scenario_count_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_a_duplicate_scenario_id_that_bypassed_the_builder(self):
        """A critic pass found this gate returned all-PASS on a record with two scenarios sharing an id (still
        exactly 4 scenarios, so the count gate alone would not catch it) -- the builder refuses this
        (SCEN_DUPLICATE_SCENARIO_ID) and the gate must independently re-derive it too."""
        record = copy.deepcopy(_valid_set())
        record["scenarios"][1] = copy.deepcopy(record["scenarios"][0])
        self.assertEqual(len(record["scenarios"]), REQUIRED_SCENARIO_COUNT)
        results = evaluate_scenario_planning_gates(record, "test", "2026-09-12T00:00:00Z")
        self.assertFalse(all_gates_pass(results))

    def test_count_gate_catches_hand_tampered_removed_uncertainty(self):
        record = copy.deepcopy(_valid_set())
        record["critical_uncertainties"].pop()
        gate = evaluate_uncertainty_scenario_count_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_fails_closed_on_malformed_top_level(self):
        for bad in (None, "not-a-dict", 42, 3.14, [], True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_nine_element_completeness_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_count_gate_fails_closed_on_malformed_top_level(self):
        for bad in (None, "not-a-dict", 42, 3.14, [], True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_uncertainty_scenario_count_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_fails_closed_on_malformed_scenario_entries(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"] = [None, "not-a-dict", 42, [], True, {}, {"junk": 1}]
        gate = evaluate_nine_element_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42, 3.14, True, {}):
            with self.subTest(bad=bad):
                results = evaluate_scenario_planning_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_invalid(self):
        record = copy.deepcopy(_valid_set())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SCEN-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_ID"):
            generate_scenario_set("WRONG-PREFIX-001", _uncertainties(), _four_scenarios(), PROVENANCE)

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_VERSION"):
            generate_scenario_set("SCEN-T-007", _uncertainties(), _four_scenarios(), PROVENANCE, version=1)  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCEN_INVALID_PROVENANCE"):
            generate_scenario_set("SCEN-T-008", _uncertainties(), _four_scenarios(), {"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.scenario_planning")

    def test_evaluate_scenario_planning_gates_returns_three_gates_in_order(self):
        results = evaluate_scenario_planning_gates(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "nine_element_completeness", "uncertainty_scenario_count"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_set()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "critical_uncertainties", "scenarios", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
