"""Mutation-style tests for ``systems.leverage_point_analysis`` (F09 systems-thinking family, first built
member).

THE real invariant (``tier`` is a closed 5-value chain, ``tier_rank`` is GENUINE_COMPUTE mechanically derived
from ``tier`` and never caller-supplied) plus the structural invariants supporting it (non-empty
intervention_points, unique ids, well-shaped entries), exercised at BOTH layers: construction-time refusal
(``generate_leverage_point_analysis`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_leverage_point_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/leverage-point-analysis.schema.yaml``).
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
from ai_lego.modules.systems.leverage_point_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_TIERS,
    all_gates_pass,
    derive_tier_rank,
    evaluate_leverage_point_analysis_gates,
    evaluate_leverage_point_integrity_gate,
    evaluate_provenance_required_gate,
    generate_leverage_point_analysis,
    intervention_point,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

LEVERAGE_POINT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/leverage-point-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _intervention_points() -> list[dict]:
    return [
        {"id": "LP-001", "description": "調高客服工單佇列上限的緩衝參數", "tier": "PARAMETERS"},
        {"id": "LP-002", "description": "改變團隊對『客服』角色的根本典範", "tier": "PARADIGM"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(intervention_points=_intervention_points(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "LPA-T-001", **overrides: object):
    return generate_leverage_point_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(LEVERAGE_POINT_SCHEMA, _valid_analysis(), "leverage point analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_leverage_point_analysis, "LPA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.leverage_point_analysis.contract.yaml")
        self.assertEqual(analysis["id"], "LPA-T-INVOKE")

    def test_empty_catalog_blocks_leverage_point_analysis_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_analysis())
        tampered["intervention_points"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LEVERAGE_POINT_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_leverage_point_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LEVERAGE_POINT_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_out_of_vocabulary_tier(self):
        analysis = _valid_analysis()
        analysis["intervention_points"][0]["tier"] = "MINDSET"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LEVERAGE_POINT_SCHEMA, analysis, "analysis with an invalid tier")

    def test_schema_rejects_tier_rank_disagreeing_with_tier(self):
        analysis = _valid_analysis()
        analysis["intervention_points"][0]["tier_rank"] = 99
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LEVERAGE_POINT_SCHEMA, analysis, "analysis with tier_rank out of schema range")

    def test_id_is_distinct_from_a_sibling_f09_machine_id(self):
        self.assertEqual(METHOD_ID, "systems.leverage_point_analysis")
        self.assertNotEqual(METHOD_ID, "systems.agent_based_modeling")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.leverage_point_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.leverage_point_analysis contract")


class TierRankDerivationTests(unittest.TestCase):
    """GENUINE_COMPUTE: `tier_rank` is a total mapping over the 5-value tier chain, never a builder parameter."""

    def test_all_five_tiers_produce_a_deterministic_rank(self):
        expected = {"PARAMETERS": 1, "FEEDBACK": 2, "RULES": 3, "GOALS": 4, "PARADIGM": 5}
        for tier, rank in expected.items():
            with self.subTest(tier=tier):
                self.assertEqual(derive_tier_rank(tier), rank)

    def test_invalid_tier_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_TIER"):
            derive_tier_rank("MINDSET")

    def test_builder_has_no_tier_rank_parameter(self):
        """Verified via inspect.signature, not just by reading the source -- `tier_rank` must never be an
        accepted constructor parameter anywhere in this method's own public surface."""
        self.assertNotIn("tier_rank", inspect.signature(generate_leverage_point_analysis).parameters)

    def test_intervention_point_convenience_constructor_has_no_tier_rank_parameter(self):
        self.assertNotIn("tier_rank", inspect.signature(intervention_point).parameters)

    def test_stored_point_tier_rank_matches_its_own_tier(self):
        analysis = _valid_analysis()
        for entry in analysis["intervention_points"]:
            self.assertEqual(entry["tier_rank"], derive_tier_rank(entry["tier"]))
        lp001 = next(e for e in analysis["intervention_points"] if e["id"] == "LP-001")
        self.assertEqual(lp001["tier_rank"], 1)  # PARAMETERS
        lp002 = next(e for e in analysis["intervention_points"] if e["id"] == "LP-002")
        self.assertEqual(lp002["tier_rank"], 5)  # PARADIGM

    def test_caller_supplied_tier_rank_key_on_a_hand_built_point_dict_is_refused(self):
        """A hand-crafted dict smuggling a `tier_rank` key past `intervention_point()` must still be refused by
        the builder's own input-shape check (exactly the input keys, no more)."""
        bad_points = _intervention_points()
        bad_points[0] = {**bad_points[0], "tier_rank": 99}
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_POINT_ENTRY"):
            _valid_analysis(intervention_points=bad_points)


class InterventionPointsTests(unittest.TestCase):
    def test_empty_intervention_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_EMPTY_POINTS"):
            _valid_analysis(intervention_points=[])

    def test_non_list_intervention_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_EMPTY_POINTS"):
            _valid_analysis(intervention_points="not-a-list")

    def test_out_of_vocabulary_tier_is_refused(self):
        bad_points = _intervention_points()
        bad_points[0] = {**bad_points[0], "tier": "MINDSET"}
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_POINT_ENTRY"):
            _valid_analysis(intervention_points=bad_points)

    def test_empty_description_is_refused(self):
        bad_points = _intervention_points()
        bad_points[0] = {**bad_points[0], "description": "   "}
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_POINT_ENTRY"):
            _valid_analysis(intervention_points=bad_points)

    def test_duplicate_point_id_is_refused(self):
        bad_points = _intervention_points()
        bad_points[1] = {**bad_points[1], "id": "LP-001"}
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_DUPLICATE_POINT_ID"):
            _valid_analysis(intervention_points=bad_points)

    def test_single_intervention_point_is_accepted(self):
        analysis = _valid_analysis(intervention_points=[_intervention_points()[0]])
        self.assertEqual(len(analysis["intervention_points"]), 1)

    def test_all_five_tiers_are_accepted_in_one_analysis(self):
        points = [{"id": f"LP-{tier}", "description": f"{tier} 層級的介入點", "tier": tier} for tier in sorted(VALID_TIERS)]
        analysis = _valid_analysis(intervention_points=points)
        self.assertEqual({e["tier"] for e in analysis["intervention_points"]}, VALID_TIERS)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LPA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_VERSION"):
            generate_leverage_point_analysis("LPA-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class ConvenienceConstructorTests(unittest.TestCase):
    def test_intervention_point_builds_a_well_formed_input_entry(self):
        entry = intervention_point("LP-010", "描述", "RULES")
        self.assertEqual(entry, {"id": "LP-010", "description": "描述", "tier": "RULES"})

    def test_intervention_point_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_POINT"):
            intervention_point("LP-010", "", "RULES")

    def test_intervention_point_rejects_invalid_tier(self):
        with self.assertRaisesRegex(InvariantViolation, "LEVERAGEPOINT_INVALID_TIER"):
            intervention_point("LP-010", "描述", "MINDSET")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis' raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_leverage_point_analysis_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_tier_rank(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to splice
        in a wrong tier_rank) must be caught by the independent gate, not just the builder."""
        record = copy.deepcopy(_valid_analysis())
        record["intervention_points"][0]["tier_rank"] = 99  # was 1 for PARAMETERS
        gate = evaluate_leverage_point_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        with self.assertRaises(SchemaValidationError):
            contracts.validate(LEVERAGE_POINT_SCHEMA, record, "record with a smuggled top-level key")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_leverage_point_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_leverage_point_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_leverage_point_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_point_id(self):
        record = copy.deepcopy(_valid_analysis())
        record["intervention_points"][1]["id"] = record["intervention_points"][0]["id"]
        gate = evaluate_leverage_point_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_intervention_points(self):
        record = copy.deepcopy(_valid_analysis())
        record["intervention_points"] = []
        gate = evaluate_leverage_point_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    def test_builder_does_not_alias_the_callers_supplied_point_dicts(self):
        points = _intervention_points()
        analysis = _valid_analysis(intervention_points=points)
        points[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(analysis["intervention_points"][0]["description"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_leverage_point_analysis_gates_returns_two_gates_in_order(self):
        results = evaluate_leverage_point_analysis_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "leverage_point_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.leverage_point_analysis")

    def test_valid_tiers_constant(self):
        self.assertEqual(VALID_TIERS, frozenset({"PARAMETERS", "FEEDBACK", "RULES", "GOALS", "PARADIGM"}))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "intervention_points", "provenance"})


if __name__ == "__main__":
    unittest.main()
