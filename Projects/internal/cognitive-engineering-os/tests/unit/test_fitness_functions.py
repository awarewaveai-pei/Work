"""Mutation-style tests for ``architecture.fitness_functions`` (eighteenth Method Atlas slice, seventh from the
`architecture` family). Same simple-fields shape ``architecture.quality_attribute_scenario`` already established:
no compute layer, no closed enum, no graph invariant."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.fitness_functions import (
    METHOD_ID,
    all_gates_pass,
    evaluate_fitness_function_set_gates,
    evaluate_functions_complete_gate,
    generate_fitness_function_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FFS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/fitness-function-set.schema.yaml"


def _valid_set():
    functions = [
        {"id": "FF1", "invariant": "domain layer imports no provider SDK", "test_or_metric": "AST scan", "ci_gate": "pre-merge lint"},
        {"id": "FF2", "invariant": "compute layer does not depend on modules layer", "test_or_metric": "static dependency graph check", "ci_gate": "pre-merge architecture-check"},
    ]
    return generate_fitness_function_set("FFS-T-001", "ai_lego package", functions, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_set_validates_against_the_real_schema(self):
        self.contracts.validate(FFS_SCHEMA, _valid_set(), "fitness function set")

    def test_no_functions_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FFS_NO_FUNCTIONS"):
            generate_fitness_function_set("FFS-T-002", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_incomplete_function_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FFS_EMPTY_REQUIRED_FIELD"):
            generate_fitness_function_set("FFS-T-003", "x", [{"id": "FF1", "invariant": "x", "test_or_metric": "x", "ci_gate": ""}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_ffs_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_set_passes_both_gates(self):
        results = evaluate_fitness_function_set_gates(_valid_set(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "functions_complete"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_incomplete_function_fails_the_gate(self):
        fn_set = _valid_set()
        fn_set["functions"][0]["ci_gate"] = ""
        gate = evaluate_functions_complete_gate(fn_set, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("FF1", gate["evidence"][0]["incomplete_function_ids"])


if __name__ == "__main__":
    unittest.main()
