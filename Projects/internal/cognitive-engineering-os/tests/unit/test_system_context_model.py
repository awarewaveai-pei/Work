"""Mutation-style tests for ``architecture.system_context_model`` (sixteenth Method Atlas slice, fifth from the
`architecture` family -- real-world method name "C4 Model", see that module's own docstring for the digit-free
machine_id substitution). The hierarchy-integrity invariant (a component must reference a real container, code must
reference a real component) is proven at construction time and at gate re-derivation."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.system_context_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_hierarchy_integrity_gate,
    evaluate_system_context_model_gates,
    generate_system_context_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SCM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/system-context-model.schema.yaml"


def _valid_model():
    return generate_system_context_model(
        "SCM-T-001", "order service", [{"id": "CT1", "label": "Order API"}], make_provenance("AI_INFERENCE", "AI_GENERATED"),
        components=[{"id": "CP1", "container_id": "CT1", "label": "OrderController"}],
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_model_validates_against_the_real_schema(self):
        self.contracts.validate(SCM_SCHEMA, _valid_model(), "system context model")

    def test_containers_only_no_components_is_legal(self):
        model = generate_system_context_model("SCM-T-002", "high-level view only", [{"id": "CT1", "label": "Monolith"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(SCM_SCHEMA, model, "containers-only model")

    def test_no_containers_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_NO_CONTAINERS"):
            generate_system_context_model("SCM-T-003", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_component_referencing_unknown_container_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_UNKNOWN_CONTAINER_IN_COMPONENT"):
            generate_system_context_model("SCM-T-004", "x", [{"id": "CT1", "label": "x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"), components=[{"id": "CP1", "container_id": "GHOST", "label": "x"}])

    def test_code_referencing_unknown_component_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_UNKNOWN_COMPONENT_IN_CODE"):
            generate_system_context_model(
                "SCM-T-005", "x", [{"id": "CT1", "label": "x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"),
                components=[{"id": "CP1", "container_id": "CT1", "label": "x"}],
                code=[{"id": "CD1", "component_id": "GHOST", "label": "x"}],
            )

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_scm_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_model_passes_both_gates(self):
        results = evaluate_system_context_model_gates(_valid_model(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "hierarchy_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_dangling_component_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. a container
        removed after construction) must still be caught by the gate re-derivation."""
        model = _valid_model()
        model["containers"] = []
        gate = evaluate_hierarchy_integrity_gate(model, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("CT1", gate["evidence"][0]["unknown_containers_referenced"])


if __name__ == "__main__":
    unittest.main()
