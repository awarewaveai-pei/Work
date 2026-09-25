"""Mutation-style tests for ``foresight.adjacent_discipline_search`` (F13 family).

Real invariant: ``adjacent_fields[]`` must be disjoint from
``current_disciplines[]`` (normalized), and every ``imported_models[].field_ref``
must resolve to a declared adjacent field -- proven at BOTH independent layers
(construction-time raise + independent gate re-derivation).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.foresight.adjacent_discipline_search import (
    METHOD_ID,
    all_gates_pass,
    evaluate_adjacent_discipline_search_gates,
    evaluate_disjointness_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_adjacent_discipline_search,
    imported_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ADJACENT_DISCIPLINE_SEARCH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/adjacent-discipline-search.schema.yaml"


def _valid_record():
    return generate_adjacent_discipline_search(
        "ADJDISC-T-001",
        ["distributed systems", "database engineering"],
        ["epidemiology", "ecology"],
        [{"id": "IM-1", "field_ref": "epidemiology", "model_description": "SIR R0 concept"}],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_adjacent_discipline_search_validates_against_the_real_schema(self):
        self.contracts.validate(ADJACENT_DISCIPLINE_SEARCH_SCHEMA, _valid_record(), "adjacent discipline search")

    def test_zero_imported_models_is_legal(self):
        record = generate_adjacent_discipline_search(
            "ADJDISC-T-002", ["distributed systems"], ["epidemiology"], [], make_provenance("AI_INFERENCE", "AI_GENERATED")
        )
        self.contracts.validate(ADJACENT_DISCIPLINE_SEARCH_SCHEMA, record, "adjacent discipline search with zero imported models")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_adjacent_discipline_search_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class ConstructionInvariantTests(unittest.TestCase):
    def test_adjacent_field_already_in_current_disciplines_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_NOT_ADJACENT"):
            generate_adjacent_discipline_search(
                "ADJDISC-BAD-001", ["distributed systems"], ["distributed systems"], [], make_provenance("AI_INFERENCE", "AI_GENERATED")
            )

    def test_overlap_refused_even_with_different_casing_and_whitespace(self):
        """Normalized comparison -- 'Distributed Systems' and '  distributed systems ' are the same field."""
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_NOT_ADJACENT"):
            generate_adjacent_discipline_search(
                "ADJDISC-BAD-002", ["distributed systems"], ["Distributed Systems"], [], make_provenance("AI_INFERENCE", "AI_GENERATED")
            )

    def test_dangling_field_ref_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_DANGLING_FIELD_REF"):
            generate_adjacent_discipline_search(
                "ADJDISC-BAD-003",
                ["distributed systems"],
                ["epidemiology"],
                [{"id": "IM-1", "field_ref": "ecology", "model_description": "not actually declared as adjacent"}],
                make_provenance("AI_INFERENCE", "AI_GENERATED"),
            )

    def test_zero_current_disciplines_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_NO_CURRENT_DISCIPLINES"):
            generate_adjacent_discipline_search("ADJDISC-T-003", [], ["epidemiology"], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_zero_adjacent_fields_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_NO_ADJACENT_FIELDS"):
            generate_adjacent_discipline_search("ADJDISC-T-004", ["distributed systems"], [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_INVALID_ID"):
            generate_adjacent_discipline_search("WRONG-001", ["distributed systems"], ["epidemiology"], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_returned_record_does_not_alias_the_callers_nested_lists(self):
        """Nested-container aliasing regression: mutating the caller's own list after return must not silently
        invalidate the already-returned record."""
        current = ["distributed systems"]
        adjacent = ["epidemiology"]
        record = generate_adjacent_discipline_search("ADJDISC-T-005", current, adjacent, [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertIsNot(record["current_disciplines"], current)
        self.assertIsNot(record["adjacent_fields"], adjacent)
        current.append("mutated after return")
        adjacent.append("mutated after return")
        self.assertEqual(record["current_disciplines"], ["distributed systems"])
        self.assertEqual(record["adjacent_fields"], ["epidemiology"])


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_adjacent_discipline_search_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "disjointness", "referential_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_disjointness_gate_catches_a_hand_tampered_overlap_that_bypassed_the_builder(self):
        """The gate re-derives the invariant independently -- it must never call the builder, and must catch a
        hand-tampered record that skipped it entirely."""
        tampered = copy.deepcopy(_valid_record())
        tampered["adjacent_fields"].append("distributed systems")
        gate = evaluate_disjointness_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_a_hand_tampered_dangling_ref(self):
        tampered = copy.deepcopy(_valid_record())
        tampered["imported_models"][0]["field_ref"] = "some field never declared as adjacent"
        gate = evaluate_referential_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_every_gate_fails_closed_not_crashed_on_non_dict_top_level_input(self):
        for bad_record in (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1}):
            with self.subTest(bad_record=bad_record):
                results = evaluate_adjacent_discipline_search_gates(bad_record, "test", "2026-09-12T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_referential_integrity_gate_fails_closed_on_malformed_entries_inside_imported_models(self):
        for bad_entry in (None, "not-a-dict", 42, [], {}, {"junk": 1}):
            with self.subTest(bad_entry=bad_entry):
                tampered = copy.deepcopy(_valid_record())
                tampered["imported_models"] = [bad_entry]
                gate = evaluate_referential_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_imported_model_builder_refuses_malformed_shape(self):
        with self.assertRaisesRegex(InvariantViolation, "ADJDISC_INVALID_MODEL"):
            imported_model("IM-BAD", "", "some model")


if __name__ == "__main__":
    unittest.main()
