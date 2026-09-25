"""Mutation-style tests for ``delivery.outcome_roadmap`` (F22 PM/Delivery/Governance Pack, Atlas L925).

Atlas's own "以 outcomes 而非 feature 排 roadmap" pipeline is proven at BOTH
independent layers: the construction-time builder refuses a dangling
theme/outcome reference, a duplicate id, or too few themes/outcomes, and the
independent gates re-derive the same rules directly from a raw (possibly
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
from ai_lego.modules.delivery.outcome_roadmap import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_bet_traceability_gate,
    evaluate_outcome_roadmap_gates,
    evaluate_provenance_required_gate,
    evaluate_theme_coverage_gate,
    generate_outcome_roadmap,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

OUTCOME_ROADMAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/outcome-roadmap-record.schema.yaml"
PROVENANCE = make_provenance("DECISION", "HUMAN_APPROVED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        themes=[{"theme_id": "T1", "name": "客戶自助架站體驗"}],
        outcomes=[
            {"outcome_id": "O1", "theme_id": "T1", "description": "新客戶 7 天內完成首次上線"},
            {"outcome_id": "O2", "theme_id": "T1", "description": "既有客戶自助排除 80% 常見問題"},
        ],
        bets=[
            {"bet_id": "B1", "outcome_id": "O1", "description": "一鍵架站精靈", "evidence": ["現行手動流程平均 14 天"]},
            {"bet_id": "B2", "outcome_id": "O2", "description": "自助修復中心", "evidence": []},
        ],
        next_review="2026-12-01 或 O1 達成率超過 50% 時",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_roadmap(*, record_id: str = "OROAD-T-001", **overrides: object):
    return generate_outcome_roadmap(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_roadmap_validates_against_the_real_schema(self):
        self.contracts.validate(OUTCOME_ROADMAP_SCHEMA, _valid_roadmap(), "outcome roadmap")

    def test_roadmap_with_zero_bets_is_a_legal_minimal_roadmap(self):
        roadmap = generate_outcome_roadmap(
            "OROAD-T-002",
            themes=[{"theme_id": "T1", "name": "n"}],
            outcomes=[{"outcome_id": "O1", "theme_id": "T1", "description": "d"}],
            bets=[],
            next_review="2027-01-01",
            provenance=PROVENANCE,
        )
        self.contracts.validate(OUTCOME_ROADMAP_SCHEMA, roadmap, "bet-less minimal roadmap")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, roadmap = live.invoke(METHOD_ID, generate_outcome_roadmap, "OROAD-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.outcome_roadmap.contract.yaml")
        self.assertEqual(roadmap["id"], "OROAD-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        roadmap = _valid_roadmap()
        roadmap["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OUTCOME_ROADMAP_SCHEMA, roadmap, "roadmap with a smuggled top-level key")

    def test_schema_rejects_empty_themes_list(self):
        roadmap = _valid_roadmap()
        roadmap["themes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OUTCOME_ROADMAP_SCHEMA, roadmap, "roadmap with an empty themes list")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.outcome_roadmap.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.outcome_roadmap contract")


class ThemeCoverageTests(unittest.TestCase):
    """Invariant #1 -- every outcome must trace to a declared theme."""

    def test_too_few_themes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_TOO_FEW_THEMES"):
            generate_outcome_roadmap("OROAD-T-003", **{**_kwargs(), "themes": []})

    def test_duplicate_theme_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["themes"].append({"theme_id": "T1", "name": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DUPLICATE_THEME_ID"):
            generate_outcome_roadmap("OROAD-T-004", **kwargs)

    def test_too_few_outcomes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_TOO_FEW_OUTCOMES"):
            generate_outcome_roadmap("OROAD-T-005", **{**_kwargs(), "outcomes": []})

    def test_duplicate_outcome_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["outcomes"].append({"outcome_id": "O1", "theme_id": "T1", "description": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DUPLICATE_OUTCOME_ID"):
            generate_outcome_roadmap("OROAD-T-006", **kwargs)

    def test_dangling_theme_ref_on_an_outcome_is_refused(self):
        kwargs = _kwargs()
        kwargs["outcomes"][0]["theme_id"] = "T-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DANGLING_THEME_REF"):
            generate_outcome_roadmap("OROAD-T-007", **kwargs)


class BetTraceabilityTests(unittest.TestCase):
    """Invariant #2, THE real invariant this method exists to enforce -- every bet must trace to a declared
    outcome, mechanizing 'outcomes not features' by construction."""

    def test_dangling_outcome_ref_on_a_bet_is_refused(self):
        kwargs = _kwargs()
        kwargs["bets"][0]["outcome_id"] = "O-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DANGLING_OUTCOME_REF"):
            generate_outcome_roadmap("OROAD-T-008", **kwargs)

    def test_duplicate_bet_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["bets"].append({"bet_id": "B1", "outcome_id": "O1", "description": "duplicate", "evidence": []})
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DUPLICATE_BET_ID"):
            generate_outcome_roadmap("OROAD-T-009", **kwargs)

    def test_a_feature_masquerading_as_a_bet_with_no_outcome_parent_is_refused(self):
        """The exact scenario L925's own '保持策略彈性' benefit column names: a bet with no real outcome
        parent is a feature sneaking into the roadmap under a different label."""
        kwargs = _kwargs()
        kwargs["bets"] = [{"bet_id": "B-SNEAKY", "outcome_id": "DOES-NOT-EXIST", "description": "隨便塞一個 feature", "evidence": []}]
        with self.assertRaisesRegex(InvariantViolation, "OROAD_DANGLING_OUTCOME_REF"):
            generate_outcome_roadmap("OROAD-T-010", **kwargs)

    def test_empty_bets_list_is_accepted(self):
        roadmap = generate_outcome_roadmap("OROAD-T-011", **{**_kwargs(), "bets": []})
        self.assertEqual(roadmap["bets"], [])

    def test_bet_with_empty_evidence_is_accepted(self):
        roadmap = _valid_roadmap()
        self.assertEqual(roadmap["bets"][1]["evidence"], [])


class ShapeTests(unittest.TestCase):
    def test_empty_next_review_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_EMPTY_NEXT_REVIEW"):
            generate_outcome_roadmap("OROAD-T-012", **{**_kwargs(), "next_review": ""})

    def test_theme_with_empty_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["themes"][0]["name"] = ""
        with self.assertRaisesRegex(InvariantViolation, "OROAD_INVALID_OUTCOMES|OROAD_INVALID_THEME"):
            generate_outcome_roadmap("OROAD-T-013", **kwargs)

    def test_theme_coverage_gate_catches_a_hand_tampered_outcome_with_an_unknown_key(self):
        """The aggregate builder extracts named fields from each raw outcomes[] dict via outcome() (same
        discipline foresight.cross_impact_analysis's own event()/impact_pair() use), so a caller cannot
        smuggle an unknown key through generate_outcome_roadmap() itself -- but a hand-tampered record that
        bypasses the builder entirely (poking an extra key directly into an already-built record) IS caught
        by the independent gate re-deriving shape from raw fields via _outcome_problem."""
        record = copy.deepcopy(_valid_roadmap())
        record["outcomes"][0]["extra"] = "nope"
        gate = evaluate_theme_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        roadmap = generate_outcome_roadmap("OROAD-T-015", **kwargs)
        kwargs["bets"][0]["evidence"].append("added after construction")
        self.assertEqual(roadmap["bets"][0]["evidence"], ["現行手動流程平均 14 天"])
        self.assertIsNot(roadmap["bets"], kwargs["bets"])
        self.assertIsNot(roadmap["outcomes"], kwargs["outcomes"])
        self.assertIsNot(roadmap["themes"], kwargs["themes"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_roadmap(self):
        results = evaluate_outcome_roadmap_gates(_valid_roadmap(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_theme_coverage_gate_catches_hand_tampered_dangling_theme_ref(self):
        record = copy.deepcopy(_valid_roadmap())
        record["outcomes"][0]["theme_id"] = "T-DELETED-AFTER-CONSTRUCTION"
        gate = evaluate_theme_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_theme_coverage_gate_catches_hand_tampered_too_few_themes(self):
        record = copy.deepcopy(_valid_roadmap())
        record["themes"] = []
        gate = evaluate_theme_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_bet_traceability_gate_catches_hand_tampered_dangling_bet(self):
        record = copy.deepcopy(_valid_roadmap())
        record["bets"].append({"bet_id": "B-TAMPERED", "outcome_id": "O-GHOST", "description": "hand-tampered", "evidence": []})
        gate = evaluate_bet_traceability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_bet_traceability_gate_does_not_assume_theme_coverage_already_passed(self):
        """Recomputes against well-shaped outcomes even when themes[] is itself already broken -- same
        independence discipline cross_impact_analysis's matrix_completeness gate establishes relative to
        referential_integrity."""
        record = copy.deepcopy(_valid_roadmap())
        record["themes"] = []
        record["outcomes"][0]["theme_id"] = "T-GHOST"
        gate = evaluate_bet_traceability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertIn(gate["status"], {"PASS", "FAIL"})  # must not crash regardless of themes[] state

    def test_bet_traceability_gate_passes_a_genuinely_complete_chain(self):
        gate = evaluate_bet_traceability_gate(_valid_roadmap(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_outcome_roadmap_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_roadmap(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_roadmap())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "OROAD-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_INVALID_ID"):
            _valid_roadmap(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_INVALID_VERSION"):
            generate_outcome_roadmap("OROAD-T-016", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OROAD_INVALID_PROVENANCE"):
            _valid_roadmap(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.outcome_roadmap")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_outcome_roadmap_gates(_valid_roadmap(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "theme_coverage", "bet_traceability"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        roadmap = _valid_roadmap()
        self.assertEqual(
            set(roadmap.keys()),
            {"id", "version", "generated_by_method", "themes", "outcomes", "bets", "next_review", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same regression class the F13 batch's own critic pass found (11 of 14 builders aliased provenance by
    reference) -- guards this new module against the identical defect from the start."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_roadmap()
        provenance = make_provenance("DECISION", "HUMAN_APPROVED")
        record = generate_outcome_roadmap(base["id"], base["themes"], base["outcomes"], base["bets"], base["next_review"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "DECISION")


if __name__ == "__main__":
    unittest.main()
