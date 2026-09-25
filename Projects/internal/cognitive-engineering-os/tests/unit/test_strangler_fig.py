"""Mutation-style tests for ``architecture.strangler_fig`` (nineteenth Method Atlas slice, eighth from the
`architecture` family). The seam-integrity invariant (a slice must reference a real seam) is proven at
construction time and at gate re-derivation, same discipline every prior forbidden-state guard this session
built already established."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.strangler_fig import (
    METHOD_ID,
    all_gates_pass,
    evaluate_slice_seam_integrity_gate,
    evaluate_strangler_fig_plan_gates,
    generate_strangler_fig_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SFP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/strangler-fig-plan.schema.yaml"


def _valid_plan():
    seams = [{"id": "S1", "label": "order query API"}]
    slices = [
        {"id": "SL1", "seam_id": "S1", "label": "order query moved to new service", "status": "expanded"},
        {"id": "SL2", "seam_id": "S1", "label": "order creation moved to new service", "status": "planned"},
    ]
    return generate_strangler_fig_plan("SFP-T-001", "legacy order monolith", seams, slices, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_plan_validates_against_the_real_schema(self):
        self.contracts.validate(SFP_SCHEMA, _valid_plan(), "strangler fig plan")

    def test_all_four_statuses_are_accepted(self):
        for status in ("planned", "verified", "expanded", "retired"):
            with self.subTest(status=status):
                plan = generate_strangler_fig_plan("SFP-T-002", "x", [{"id": "S1", "label": "x"}], [{"id": "SL1", "seam_id": "S1", "label": "x", "status": status}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
                self.contracts.validate(SFP_SCHEMA, plan, f"sfp status={status}")

    def test_no_seams_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SFP_NO_SEAMS"):
            generate_strangler_fig_plan("SFP-T-003", "x", [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_no_slices_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SFP_NO_SLICES"):
            generate_strangler_fig_plan("SFP-T-004", "x", [{"id": "S1", "label": "x"}], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_slice_referencing_unknown_seam_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SFP_UNKNOWN_SEAM_IN_SLICE"):
            generate_strangler_fig_plan("SFP-T-005", "x", [{"id": "S1", "label": "x"}], [{"id": "SL1", "seam_id": "GHOST", "label": "x", "status": "planned"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SFP_INVALID_STATUS"):
            generate_strangler_fig_plan("SFP-T-006", "x", [{"id": "S1", "label": "x"}], [{"id": "SL1", "seam_id": "S1", "label": "x", "status": "in_progress"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_sfp_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_plan_passes_both_gates(self):
        results = evaluate_strangler_fig_plan_gates(_valid_plan(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "slice_seam_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_dangling_slice_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. a seam removed
        after construction) must still be caught by the gate re-derivation."""
        plan = _valid_plan()
        plan["seams"] = []
        gate = evaluate_slice_seam_integrity_gate(plan, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("S1", gate["evidence"][0]["unknown_seams_referenced"])


if __name__ == "__main__":
    unittest.main()
