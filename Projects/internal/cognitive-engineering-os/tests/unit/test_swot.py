"""Mutation-style tests for ``strategy.swot`` (third Method Atlas slice, F08 context/strategy family).

Schema conformance is checked against the real spec-root schema this same
session added (``typed-objects/swot-analysis.schema.yaml``) -- not a schema
this test file invents. The forbidden-transition guard is proven both ways:
against the live catalog (genuinely blocked today) AND against a
deliberately constructed rogue catalog that DOES carry an ACTIVE contract
for the hazard id, proving the check is not a tautology that always reports
"blocked" regardless of catalog state.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.swot import (
    AUTOMATIC_DEPLOYMENT_HAZARD_ID,
    METHOD_ID,
    all_gates_pass,
    assert_forbidden_deployment_path_blocked,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    evaluate_swot_gates,
    generate_swot_analysis,
    is_internal,
    swot_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

EVIDENCE_SCHEMA = "ai-lego://specs/evidence/evidence.schema.yaml"
SWOT_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/swot-analysis.schema.yaml"


def _knowledge_set():
    return [evidence_record("E-301", "some observation", "SRC-1", make_provenance("EVIDENCE", "HUMAN_APPROVED"))]


def _factors():
    return [
        swot_factor("SWOT-T-001-F1", "STRENGTH", "loyal customer base", "TW", "2026-Q3", "internal report", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-301"]),
        swot_factor("SWOT-T-001-F2", "OPPORTUNITY", "adjacent market opened up", "SG", "2026-Q3", "field note", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _valid_analysis():
    return generate_swot_analysis("SWOT-T-001", "KS-T-001", _knowledge_set(), _factors())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_swot_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(SWOT_ANALYSIS_SCHEMA, _valid_analysis(), "swot analysis")

    def test_knowledge_set_items_validate_against_the_real_evidence_schema(self):
        for record in _knowledge_set():
            self.contracts.validate(EVIDENCE_SCHEMA, record, record["evidence_id"])

    def test_empty_knowledge_set_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "SWOT_PRECONDITION_FAILED"):
            generate_swot_analysis("SWOT-T-002", "KS-T-002", [], _factors())

    def test_empty_factors_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "SWOT_EMPTY_FACTOR_SET"):
            generate_swot_analysis("SWOT-T-003", "KS-T-003", _knowledge_set(), [])

    def test_invalid_category_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "SWOT_INVALID_CATEGORY"):
            swot_factor("SWOT-T-004-F1", "POLITICAL", "statement", "TW", "2026-Q3", "note", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_is_internal_matches_atlas_l1327_split(self):
        self.assertTrue(is_internal("STRENGTH"))
        self.assertTrue(is_internal("WEAKNESS"))
        self.assertFalse(is_internal("OPPORTUNITY"))
        self.assertFalse(is_internal("THREAT"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_swot_analysis, "SWOT-T-INVOKE", "KS-T-INVOKE", _knowledge_set(), _factors())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.swot.contract.yaml")
        self.assertEqual(analysis["id"], "SWOT-T-INVOKE")

    def test_empty_catalog_blocks_swot_the_same_way_it_blocks_the_other_two_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_both_gates(self):
        results = evaluate_swot_gates(_valid_analysis(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        analysis = _valid_analysis()
        analysis["factors"][0] = {**analysis["factors"][0], "provenance": None}
        provenance_gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(provenance_gate["status"], "FAIL")
        self.assertIn("SWOT-T-001-F1", provenance_gate["evidence"][0]["invalid_provenance_ids"])

    def test_evidence_labeled_factor_with_no_supporting_refs_fails_evidence_labeling_gate(self):
        """Atlas L1347's own named misuse: writing 'strong brand'/'large market' without evidence."""
        analysis = _valid_analysis()
        fabricated = swot_factor("SWOT-T-001-F3", "STRENGTH", "brand is strong", "TW", "2026-Q3", "note", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        analysis["factors"].append(fabricated)
        gate = evaluate_evidence_labeling_required_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["id"] == "SWOT-T-001-F3" for p in gate["evidence"][0]["problems"]))


class ForbiddenDeploymentPathTests(unittest.TestCase):
    """Atlas L3550-3552: SWOTAnalysis -> AutomaticProductionDeployment (direct) is FORBIDDEN."""

    def test_live_catalog_already_blocks_the_hazard_id_today(self):
        live = shared_method_catalog(resolve_spec_root())
        resolution = assert_forbidden_deployment_path_blocked(live)
        self.assertEqual(resolution["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)

    def test_empty_catalog_also_blocks_it(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        resolution = assert_forbidden_deployment_path_blocked(empty)
        self.assertEqual(resolution["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)

    def test_a_rogue_active_contract_for_the_hazard_id_makes_the_guard_raise_instead_of_lying(self):
        """Mutation-style: proves this check is not a tautology. If a future session ever adds a real ACTIVE
        contract shaped like an automatic-deployment method, this function must surface that as a regression,
        not silently keep reporting success."""
        rogue = MethodCatalog(
            label="test:rogue-catalog",
            contracts={AUTOMATIC_DEPLOYMENT_HAZARD_ID: {"path": "methods/contracts/fake.contract.yaml", "status": "ACTIVE", "version": "1.0.0", "content_sha256": "0" * 64}},
        )
        with self.assertRaisesRegex(InvariantViolation, "FORBIDDEN_TRANSITION_GUARD_DID_NOT_FIRE"):
            assert_forbidden_deployment_path_blocked(rogue)


if __name__ == "__main__":
    unittest.main()
