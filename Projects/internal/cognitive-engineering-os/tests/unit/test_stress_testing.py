"""Mutation-style tests for ``challenge.stress_testing`` (tenth and FINAL Method Atlas slice from the ``challenge``
family, F12).

THE real invariant (every scenario's ``extreme_value`` must fall STRICTLY outside its own ``normal_range`` --
Atlas L652's own "極端" qualifier mechanized, not left as a prose caution) plus the structural invariants
supporting it (normal_range not inverted, outcome required from a closed set with no default, no duplicate
scenario id, every numeric field a genuine number excluding Python's bool-is-int-subclass trap), exercised at
BOTH layers: construction-time refusal (``generate_stress_test_scenario_set`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_stress_testing_content_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/stress-test-scenario-set.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.stress_testing import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_OUTCOMES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_stress_testing_content_integrity_gate,
    evaluate_stress_testing_gates,
    generate_stress_test_scenario_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SCENARIO_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stress-test-scenario-set.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _scenarios() -> list[dict]:
    return [
        {
            "id": "S1",
            "description": "黑色星期五流量暴衝：尖峰負載達到平日的 6 倍",
            "normal_range": {"min": 50, "max": 200},
            "extreme_value": 1200,
            "outcome": "DEGRADED",
        },
        {
            "id": "S2",
            "description": "上游銀行 API 同時延遲 3 秒且錯誤率升至 20%",
            "normal_range": {"min": 0, "max": 0.02},
            "extreme_value": 0.20,
            "outcome": "BROKEN",
        },
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        proposal_ref="PROP-T-001: 新支付閘道上線計畫",
        scenarios=_scenarios(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_set(*, record_id: str = "STSS-T-001", **overrides: object):
    return generate_stress_test_scenario_set(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_scenario_set_validates_against_the_real_schema(self):
        self.contracts.validate(SCENARIO_SET_SCHEMA, _valid_set(), "stress test scenario set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, model = live.invoke(METHOD_ID, generate_stress_test_scenario_set, "STSS-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.stress_testing.contract.yaml")
        self.assertEqual(model["id"], "STSS-T-INVOKE")

    def test_empty_catalog_blocks_stress_testing_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_set())
        tampered["scenarios"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, tampered, "tampered scenario set")
        gate = evaluate_stress_testing_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        model = _valid_set()
        model["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, model, "scenario set with a smuggled top-level key")

    def test_schema_rejects_missing_proposal_ref(self):
        model = _valid_set()
        del model["proposal_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, model, "scenario set with proposal_ref removed")

    def test_schema_rejects_non_numeric_extreme_value(self):
        model = _valid_set()
        model["scenarios"][0]["extreme_value"] = "huge"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCENARIO_SET_SCHEMA, model, "scenario set with a non-numeric extreme_value")

    def test_id_is_distinct_from_the_f19_near_name_collision(self):
        self.assertEqual(METHOD_ID, "challenge.stress_testing")
        self.assertNotEqual(METHOD_ID, "devops_sre.stress_test")
        self.assertEqual(RECORD_ID_PREFIX, "STSS-")
        self.assertNotEqual(RECORD_ID_PREFIX, "STRESSTEST-")  # devops_sre.stress_test's own prefix

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.stress_testing.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.stress_testing contract")


class ExtremeValueInvariantTests(unittest.TestCase):
    """THE real invariant (module docstring): extreme_value must fall STRICTLY outside normal_range -- Atlas
    L652's own '極端' qualifier mechanized, not left as a prose caution."""

    def test_well_formed_scenario_set_is_accepted(self):
        model = _valid_set()
        self.assertEqual(len(model["scenarios"]), 2)

    def test_extreme_value_inside_normal_range_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": 150}  # inside [50, 200]
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_EXTREME_VALUE_NOT_EXTREME"):
            _valid_set(scenarios=bad_scenarios)

    def test_extreme_value_exactly_at_min_boundary_is_refused(self):
        """The boundary itself is still 'normal', not extreme -- a value AT the edge of normal operation has not
        crossed it."""
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": 50}  # == min
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_EXTREME_VALUE_NOT_EXTREME"):
            _valid_set(scenarios=bad_scenarios)

    def test_extreme_value_exactly_at_max_boundary_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": 200}  # == max
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_EXTREME_VALUE_NOT_EXTREME"):
            _valid_set(scenarios=bad_scenarios)

    def test_extreme_value_below_min_is_accepted(self):
        scenarios = _scenarios()
        scenarios[0] = {**scenarios[0], "normal_range": {"min": 50, "max": 200}, "extreme_value": 1}
        model = _valid_set(scenarios=scenarios)
        self.assertEqual(model["scenarios"][0]["extreme_value"], 1)

    def test_extreme_value_above_max_is_accepted(self):
        model = _valid_set()  # scenarios()[0] already has extreme_value=1200 > max=200
        self.assertEqual(model["scenarios"][0]["extreme_value"], 1200)


class NormalRangeTests(unittest.TestCase):
    def test_inverted_normal_range_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "normal_range": {"min": 200, "max": 50}, "extreme_value": 1000}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVERTED_NORMAL_RANGE"):
            _valid_set(scenarios=bad_scenarios)

    def test_degenerate_normal_range_min_equals_max_is_legal(self):
        """min == max is a legal (if unusual) single-point normal operating range -- only an INVERTED range
        (min > max) is malformed."""
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "normal_range": {"min": 100, "max": 100}, "extreme_value": 500}
        model = _valid_set(scenarios=bad_scenarios)
        self.assertEqual(model["scenarios"][0]["normal_range"], {"min": 100, "max": 100})

    def test_non_numeric_normal_range_min_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "normal_range": {"min": "low", "max": 200}}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_NORMAL_RANGE"):
            _valid_set(scenarios=bad_scenarios)

    def test_boolean_normal_range_max_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, (int, float)) would silently accept
        True/False as normal_range bounds 1/0. Must be explicitly refused."""
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "normal_range": {"min": 0, "max": True}}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_NORMAL_RANGE"):
            _valid_set(scenarios=bad_scenarios)

    def test_normal_range_missing_a_key_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "normal_range": {"min": 0}}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_NORMAL_RANGE"):
            _valid_set(scenarios=bad_scenarios)


class ExtremeValueNumericTests(unittest.TestCase):
    def test_boolean_extreme_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": True}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_EXTREME_VALUE"):
            _valid_set(scenarios=bad_scenarios)

    def test_false_extreme_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": False}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_EXTREME_VALUE"):
            _valid_set(scenarios=bad_scenarios)

    def test_non_numeric_extreme_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": "very high"}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_EXTREME_VALUE"):
            _valid_set(scenarios=bad_scenarios)

    def test_nan_extreme_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": float("nan")}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_EXTREME_VALUE"):
            _valid_set(scenarios=bad_scenarios)

    def test_infinite_extreme_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "extreme_value": float("inf")}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_EXTREME_VALUE"):
            _valid_set(scenarios=bad_scenarios)

    def test_huge_int_extreme_value_does_not_crash_on_overflow(self):
        """Regression guard for the exact OverflowError trap stakeholders.game_theory's own second critic pass
        found: a huge int must not crash math.isfinite via implicit float conversion."""
        scenarios = _scenarios()
        scenarios[0] = {**scenarios[0], "normal_range": {"min": 0, "max": 100}, "extreme_value": 10**400}
        model = _valid_set(scenarios=scenarios)
        self.assertEqual(model["scenarios"][0]["extreme_value"], 10**400)


class OutcomeTests(unittest.TestCase):
    def test_missing_outcome_is_refused(self):
        bad_scenarios = [dict(_scenarios()[0]), _scenarios()[1]]
        del bad_scenarios[0]["outcome"]
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_SCENARIO"):
            _valid_set(scenarios=bad_scenarios)

    def test_none_outcome_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "outcome": None}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_OUTCOME"):
            _valid_set(scenarios=bad_scenarios)

    def test_unknown_outcome_value_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "outcome": "CATASTROPHIC"}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_OUTCOME"):
            _valid_set(scenarios=bad_scenarios)

    def test_non_string_outcome_does_not_crash_on_unhashable_value(self):
        """outcome must be checked with isinstance BEFORE the `in VALID_OUTCOMES` membership test -- an
        unhashable value (e.g. a list) would raise TypeError from a bare `x not in frozenset(...)`, not a
        fail-closed InvariantViolation."""
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "outcome": ["BROKEN"]}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_OUTCOME"):
            _valid_set(scenarios=bad_scenarios)

    def test_all_three_valid_outcomes_are_accepted(self):
        for outcome in sorted(VALID_OUTCOMES):
            with self.subTest(outcome=outcome):
                scenarios = _scenarios()
                scenarios[0] = {**scenarios[0], "outcome": outcome}
                model = _valid_set(scenarios=scenarios)
                self.assertEqual(model["scenarios"][0]["outcome"], outcome)


class ScenarioStructureTests(unittest.TestCase):
    def test_empty_scenarios_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_SCENARIOS"):
            _valid_set(scenarios=[])

    def test_non_list_scenarios_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_SCENARIOS"):
            _valid_set(scenarios="not-a-list")

    def test_scenario_missing_description_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "description": ""}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_SCENARIO"):
            _valid_set(scenarios=bad_scenarios)

    def test_scenario_with_extra_key_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[0] = {**bad_scenarios[0], "notes": "smuggled"}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_SCENARIO"):
            _valid_set(scenarios=bad_scenarios)

    def test_duplicate_scenario_id_is_refused(self):
        bad_scenarios = _scenarios()
        bad_scenarios[1] = {**bad_scenarios[1], "id": bad_scenarios[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_DUPLICATE_SCENARIO_ID"):
            _valid_set(scenarios=bad_scenarios)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STSS-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_ID"):
            _valid_set(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_ID"):
            _valid_set(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_VERSION"):
            generate_stress_test_scenario_set("STSS-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_empty_proposal_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_PROPOSAL_REF"):
            _valid_set(proposal_ref="   ")

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTESTING_INVALID_PROVENANCE"):
            _valid_set(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID scenario set's raw dict directly (never going through the builder again), then call
    the gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_set(self):
        results = evaluate_stress_testing_gates(_valid_set(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_extreme_value_moved_inside_range(self):
        """THE required test: a hand-tampered record with extreme_value edited back inside normal_range
        (constructed directly, bypassing the builder) must also be caught by the independent gate."""
        record = copy.deepcopy(_valid_set())
        record["scenarios"][0]["extreme_value"] = 150  # was 1200, now inside [50, 200]
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(all_gates_pass(evaluate_stress_testing_gates(record, "test", "2026-09-11T00:00:00Z")))

    def test_content_gate_catches_hand_tampered_boolean_extreme_value(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"][0]["extreme_value"] = False
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_missing_outcome(self):
        record = copy.deepcopy(_valid_set())
        del record["scenarios"][0]["outcome"]
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_inverted_range(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"][0]["normal_range"] = {"min": 200, "max": 50}
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_set())
        record["extra_field"] = "smuggled"
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_set())
        del record["proposal_ref"]
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_stress_testing_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_set())
        record["id"] = "WRONG-001"
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_set())
        record["version"] = 1
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_duplicate_scenario_id(self):
        record = copy.deepcopy(_valid_set())
        record["scenarios"][1]["id"] = record["scenarios"][0]["id"]
        gate = evaluate_stress_testing_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_set(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_set())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """The exact aliasing gap a critic pass found in stakeholders.game_theory.py (2026-09-11): the builder must
    rebuild each scenario (and its nested normal_range) element-by-element, not share the caller's own nested
    dicts."""

    def test_builder_does_not_alias_the_callers_supplied_scenario_dicts(self):
        scenarios = _scenarios()
        model = _valid_set(scenarios=scenarios)
        scenarios[0]["extreme_value"] = 999999
        self.assertNotEqual(model["scenarios"][0]["extreme_value"], 999999)

    def test_builder_does_not_alias_the_callers_supplied_normal_range_dicts(self):
        scenarios = _scenarios()
        model = _valid_set(scenarios=scenarios)
        scenarios[0]["normal_range"]["max"] = -1
        self.assertNotEqual(model["scenarios"][0]["normal_range"]["max"], -1)


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_stress_testing_gates_returns_two_gates_in_order(self):
        results = evaluate_stress_testing_gates(_valid_set(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "stress_testing_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.stress_testing")

    def test_valid_outcomes_constant(self):
        self.assertEqual(VALID_OUTCOMES, frozenset({"WITHIN_TOLERANCE", "DEGRADED", "BROKEN"}))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        model = _valid_set()
        self.assertEqual(
            set(model.keys()),
            {"id", "version", "generated_by_method", "proposal_ref", "scenarios", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
