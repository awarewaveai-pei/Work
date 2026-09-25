"""Mutation-style tests for ``architecture.atam`` (fourteenth Method Atlas slice, third from the `architecture`
family). Same findings+closed-category-enum shape ``test_red_team.py`` already exercises, reused as a pattern for
a different subject matter."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.atam import (
    METHOD_ID,
    all_gates_pass,
    evaluate_atam_gates,
    evaluate_findings_present_gate,
    generate_atam_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ATAM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/atam-analysis.schema.yaml"


def _valid_analysis():
    findings = [
        {"id": "F1", "category": "tradeoff_point", "description": "encryption improves security but raises latency"},
        {"id": "F2", "category": "risk", "description": "cache improves performance but adds consistency complexity"},
    ]
    return generate_atam_analysis("ATAM-T-001", "API layer decision", findings, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_atam_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(ATAM_SCHEMA, _valid_analysis(), "atam analysis")

    def test_all_four_categories_are_accepted(self):
        for category in ("sensitivity_point", "tradeoff_point", "risk", "non_risk"):
            with self.subTest(category=category):
                analysis = generate_atam_analysis("ATAM-T-002", "x", [{"id": "F1", "category": category, "description": "x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
                self.contracts.validate(ATAM_SCHEMA, analysis, f"atam category={category}")

    def test_zero_findings_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ATAM_NO_FINDINGS"):
            generate_atam_analysis("ATAM-T-003", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_category_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ATAM_INVALID_CATEGORY"):
            generate_atam_analysis("ATAM-T-004", "x", [{"id": "F1", "category": "concern", "description": "x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_atam_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_both_gates(self):
        results = evaluate_atam_gates(_valid_analysis(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "findings_present"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_empty_findings_fails_the_gate(self):
        analysis = _valid_analysis()
        analysis["findings"] = []
        gate = evaluate_findings_present_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
