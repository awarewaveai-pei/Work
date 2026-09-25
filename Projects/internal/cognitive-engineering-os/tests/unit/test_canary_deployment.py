"""Mutation-style tests for ``devops_sre.canary_deployment`` (twenty-first Method Atlas slice, second from the
`devops_sre` family). Atlas's own explicit rule ("any unhealthy stage -> ROLLBACK") is proven at BOTH independent
layers -- construction-time and gate re-derivation -- same discipline every prior forbidden-state guard this
session built already established."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.canary_deployment import (
    METHOD_ID,
    all_gates_pass,
    evaluate_canary_deployment_plan_gates,
    evaluate_unhealthy_forbids_completed_gate,
    generate_canary_deployment_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CANARY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/canary-deployment-plan.schema.yaml"


def _all_healthy_stages():
    return [
        {"id": "ST1", "traffic_percent": 1, "healthy": True},
        {"id": "ST2", "traffic_percent": 5, "healthy": True},
        {"id": "ST3", "traffic_percent": 25, "healthy": True},
        {"id": "ST4", "traffic_percent": 50, "healthy": True},
        {"id": "ST5", "traffic_percent": 100, "healthy": True},
    ]


def _valid_plan():
    return generate_canary_deployment_plan("CANARY-T-001", "checkout-api v2.4.0", _all_healthy_stages(), "completed", make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_plan_validates_against_the_real_schema(self):
        self.contracts.validate(CANARY_SCHEMA, _valid_plan(), "canary deployment plan")

    def test_rolled_back_after_unhealthy_stage_is_legal(self):
        stages = [{"id": "ST1", "traffic_percent": 1, "healthy": True}, {"id": "ST2", "traffic_percent": 5, "healthy": False}]
        plan = generate_canary_deployment_plan("CANARY-T-002", "orders-api v1.9.0", stages, "rolled_back", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(CANARY_SCHEMA, plan, "rolled-back plan")

    def test_no_stages_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CANARY_NO_STAGES"):
            generate_canary_deployment_plan("CANARY-T-003", "x", [], "in_progress", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_traffic_percent_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CANARY_INVALID_TRAFFIC_PERCENT"):
            generate_canary_deployment_plan("CANARY-T-004", "x", [{"id": "ST1", "traffic_percent": 10, "healthy": True}], "in_progress", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_outcome_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CANARY_INVALID_OUTCOME"):
            generate_canary_deployment_plan("CANARY-T-005", "x", [{"id": "ST1", "traffic_percent": 1, "healthy": True}], "paused", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_unhealthy_stage_with_completed_outcome_is_refused_at_construction(self):
        """Atlas's own rule (§11.41): any unhealthy stage -> ROLLBACK, not completed."""
        stages = [{"id": "ST1", "traffic_percent": 1, "healthy": True}, {"id": "ST2", "traffic_percent": 5, "healthy": False}]
        with self.assertRaisesRegex(InvariantViolation, "CANARY_UNHEALTHY_STAGE_CANNOT_COMPLETE"):
            generate_canary_deployment_plan("CANARY-T-006", "x", stages, "completed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_canary_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_plan_passes_both_gates(self):
        results = evaluate_canary_deployment_plan_gates(_valid_plan(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "unhealthy_forbids_completed"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_unhealthy_stage_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. a stage flipped
        to unhealthy after construction) must still be caught by the gate re-derivation."""
        plan = _valid_plan()
        plan["stages"][2]["healthy"] = False
        gate = evaluate_unhealthy_forbids_completed_gate(plan, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
