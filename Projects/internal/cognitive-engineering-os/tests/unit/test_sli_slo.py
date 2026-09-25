"""Mutation-style tests for ``devops_sre.sli_slo`` (twentieth Method Atlas slice, first from the `devops_sre`
family -- a second pack this session opens after F18). The SLA-requires-terms invariant (Atlas's own SLI-then-SLO-
then-SLA precedence principle) is proven at construction time and at gate re-derivation."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.sli_slo import (
    METHOD_ID,
    all_gates_pass,
    evaluate_sla_terms_present_gate,
    evaluate_sli_slo_set_gates,
    generate_sli_slo_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SLISLO_SCHEMA = "ai-lego://specs/cognitive/typed-objects/sli-slo-set.schema.yaml"


def _valid_set():
    indicators = [
        {"id": "IND1", "metric_type": "latency", "sli_description": "p99 response time", "slo_target": "p99 < 300ms", "sla_required": False},
        {"id": "IND2", "metric_type": "availability", "sli_description": "success ratio", "slo_target": "99.9%", "sla_required": True, "sla_terms": "10% credit if below 99.5%"},
    ]
    return generate_sli_slo_set("SLO-T-001", "Checkout API", indicators, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_set_validates_against_the_real_schema(self):
        self.contracts.validate(SLISLO_SCHEMA, _valid_set(), "sli slo set")

    def test_all_five_metric_types_are_accepted(self):
        for metric_type in ("availability", "latency", "correctness", "durability", "freshness"):
            with self.subTest(metric_type=metric_type):
                sli_set = generate_sli_slo_set("SLO-T-002", "x", [{"id": "IND1", "metric_type": metric_type, "sli_description": "x", "slo_target": "x", "sla_required": False}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
                self.contracts.validate(SLISLO_SCHEMA, sli_set, f"metric_type={metric_type}")

    def test_no_indicators_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SLISLO_NO_INDICATORS"):
            generate_sli_slo_set("SLO-T-003", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_metric_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SLISLO_INVALID_METRIC_TYPE"):
            generate_sli_slo_set("SLO-T-004", "x", [{"id": "IND1", "metric_type": "throughput", "sli_description": "x", "slo_target": "x", "sla_required": False}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_sla_required_without_terms_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SLISLO_SLA_REQUIRED_WITHOUT_TERMS"):
            generate_sli_slo_set("SLO-T-005", "x", [{"id": "IND1", "metric_type": "durability", "sli_description": "x", "slo_target": "x", "sla_required": True}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_sla_required_with_whitespace_only_terms_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SLISLO_SLA_REQUIRED_WITHOUT_TERMS"):
            generate_sli_slo_set("SLO-T-006", "x", [{"id": "IND1", "metric_type": "durability", "sli_description": "x", "slo_target": "x", "sla_required": True, "sla_terms": "   "}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_slislo_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_set_passes_both_gates(self):
        results = evaluate_sli_slo_set_gates(_valid_set(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "sla_terms_present"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_removed_terms_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. sla_terms
        stripped after construction) must still be caught by the gate re-derivation."""
        sli_set = _valid_set()
        sli_set["indicators"][1]["sla_terms"] = ""
        gate = evaluate_sla_terms_present_gate(sli_set, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("IND2", gate["evidence"][0]["missing_sla_terms"])


if __name__ == "__main__":
    unittest.main()
