"""Mutation-style tests for ``architecture.dependency_mapping`` (seventeenth Method Atlas slice, sixth from the
`architecture` family). The fallback-required-for-critical-edges invariant is proven at construction time and at
gate re-derivation, same discipline every prior forbidden-state guard this session built already established."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.dependency_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_critical_edges_have_fallback_gate,
    evaluate_dependency_map_gates,
    generate_dependency_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DEPMAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/dependency-map.schema.yaml"


def _valid_map():
    nodes = [
        {"id": "N1", "node_type": "service", "label": "Checkout API"},
        {"id": "N2", "node_type": "vendor", "label": "payment vendor"},
        {"id": "N3", "node_type": "data", "label": "inventory snapshot"},
    ]
    edges = [
        {"from_id": "N1", "to_id": "N2", "is_critical": True, "fallback": "switch to backup vendor"},
        {"from_id": "N1", "to_id": "N3", "is_critical": False},
    ]
    return generate_dependency_map("DEPMAP-T-001", "checkout flow", nodes, edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_map_validates_against_the_real_schema(self):
        self.contracts.validate(DEPMAP_SCHEMA, _valid_map(), "dependency map")

    def test_noncritical_edge_needs_no_fallback(self):
        nodes = [{"id": "N1", "node_type": "service", "label": "x"}, {"id": "N2", "node_type": "data", "label": "x"}]
        edges = [{"from_id": "N1", "to_id": "N2", "is_critical": False}]
        dep_map = generate_dependency_map("DEPMAP-T-002", "x", nodes, edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(DEPMAP_SCHEMA, dep_map, "noncritical-only map")

    def test_empty_map_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPMAP_EMPTY_MAP"):
            generate_dependency_map("DEPMAP-T-003", "x", [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_node_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPMAP_INVALID_NODE_TYPE"):
            generate_dependency_map("DEPMAP-T-004", "x", [{"id": "N1", "node_type": "database", "label": "x"}], [{"from_id": "N1", "to_id": "N1", "is_critical": False}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_critical_edge_with_no_fallback_is_refused_at_construction(self):
        nodes = [{"id": "N1", "node_type": "service", "label": "x"}, {"id": "N2", "node_type": "vendor", "label": "x"}]
        edges = [{"from_id": "N1", "to_id": "N2", "is_critical": True}]
        with self.assertRaisesRegex(InvariantViolation, "DEPMAP_CRITICAL_EDGE_MISSING_FALLBACK"):
            generate_dependency_map("DEPMAP-T-005", "x", nodes, edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_critical_edge_with_whitespace_only_fallback_is_refused_at_construction(self):
        nodes = [{"id": "N1", "node_type": "service", "label": "x"}, {"id": "N2", "node_type": "vendor", "label": "x"}]
        edges = [{"from_id": "N1", "to_id": "N2", "is_critical": True, "fallback": "   "}]
        with self.assertRaisesRegex(InvariantViolation, "DEPMAP_CRITICAL_EDGE_MISSING_FALLBACK"):
            generate_dependency_map("DEPMAP-T-006", "x", nodes, edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_depmap_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_map_passes_both_gates(self):
        results = evaluate_dependency_map_gates(_valid_map(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "critical_edges_have_fallback"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_removed_fallback_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. fallback text
        stripped after construction) must still be caught by the gate re-derivation."""
        dep_map = _valid_map()
        dep_map["edges"][0]["fallback"] = ""
        gate = evaluate_critical_edges_have_fallback_gate(dep_map, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("N1->N2", gate["evidence"][0]["missing_fallback_edges"])


if __name__ == "__main__":
    unittest.main()
