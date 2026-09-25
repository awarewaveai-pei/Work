"""Mutation-style tests for ``devops_sre.blue_green_deployment`` (twenty-third Method Atlas slice, fourth from the
`devops_sre` family). Atlas's own explicit rule (Green verified before cutover) is proven at BOTH independent
layers -- construction-time and gate re-derivation -- same discipline every prior forbidden-state guard this
session built already established."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.blue_green_deployment import (
    METHOD_ID,
    all_gates_pass,
    evaluate_blue_green_deployment_plan_gates,
    evaluate_cutover_requires_verification_gate,
    generate_blue_green_deployment_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BLUEGREEN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/blue-green-deployment-plan.schema.yaml"


def _valid_plan():
    return generate_blue_green_deployment_plan(
        "BLUEGREEN-T-001", "v2.3.1 production", "v2.4.0, fully deployed", True, "cut_over",
        make_provenance("AI_INFERENCE", "AI_GENERATED"), blue_retained=True,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_plan_validates_against_the_real_schema(self):
        self.contracts.validate(BLUEGREEN_SCHEMA, _valid_plan(), "blue-green deployment plan")

    def test_not_cut_over_while_unverified_is_legal(self):
        plan = generate_blue_green_deployment_plan("BLUEGREEN-T-002", "v2.3.1", "v2.4.0 in progress", False, "not_cut_over", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(BLUEGREEN_SCHEMA, plan, "not-yet-verified plan")

    def test_empty_blue_environment_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEGREEN_EMPTY_BLUE_ENVIRONMENT"):
            generate_blue_green_deployment_plan("BLUEGREEN-T-003", "", "x", False, "not_cut_over", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_cutover_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEGREEN_INVALID_CUTOVER_STATUS"):
            generate_blue_green_deployment_plan("BLUEGREEN-T-004", "x", "x", True, "in_progress", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_cutover_without_verification_is_refused_at_construction(self):
        """Atlas's own rule (§11.42): Green fully deployed and verified before traffic cutover."""
        with self.assertRaisesRegex(InvariantViolation, "BLUEGREEN_CUTOVER_WITHOUT_VERIFICATION"):
            generate_blue_green_deployment_plan("BLUEGREEN-T-005", "x", "x", False, "cut_over", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_bluegreen_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_plan_passes_both_gates(self):
        results = evaluate_blue_green_deployment_plan_gates(_valid_plan(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "cutover_requires_verification"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_unverified_cutover_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. green_verified
        flipped to false after construction) must still be caught by the gate re-derivation."""
        plan = _valid_plan()
        plan["green_verified"] = False
        gate = evaluate_cutover_requires_verification_gate(plan, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
