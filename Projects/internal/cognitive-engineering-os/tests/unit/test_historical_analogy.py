"""Mutation-style tests for ``foresight.historical_analogy`` (F13 family).

Real invariant: every ``analogies[]`` item requires >=1 similarity AND >=1
difference AND a non-empty ``extracted_mechanism`` AND a non-empty
``analogy_limits`` -- proven at BOTH independent layers (construction-time
raise + independent gate re-derivation via the shared ``_analogy_problem``
predicate).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.historical_analogy import (
    METHOD_ID,
    all_gates_pass,
    analogy,
    evaluate_historical_analogy_gates,
    evaluate_min_analogies_gate,
    evaluate_no_surface_level_analogy_gate,
    evaluate_provenance_required_gate,
    generate_historical_analogy_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

HISTORICAL_ANALOGY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/historical-analogy.schema.yaml"


def _analogy(a_id: str = "HA-1"):
    return analogy(a_id, "歷史案例", ["相似點"], ["差異點"], "抽出的機制", "類比限制")


def _valid_record():
    return generate_historical_analogy_set("HANALOGY-T-001", "PROP-T-001", [_analogy()], make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_historical_analogy_set_validates_against_the_real_schema(self):
        self.contracts.validate(HISTORICAL_ANALOGY_SCHEMA, _valid_record(), "historical analogy set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_historical_analogy_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class ConstructionInvariantTests(unittest.TestCase):
    def test_analogy_with_no_differences_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_ANALOGY"):
            analogy("HA-BAD", "歷史案例", ["相似點"], [], "機制", "限制")

    def test_analogy_with_no_similarities_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_ANALOGY"):
            analogy("HA-BAD", "歷史案例", [], ["差異點"], "機制", "限制")

    def test_analogy_with_empty_extracted_mechanism_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_ANALOGY"):
            analogy("HA-BAD", "歷史案例", ["相似點"], ["差異點"], "", "限制")

    def test_analogy_with_empty_analogy_limits_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_ANALOGY"):
            analogy("HA-BAD", "歷史案例", ["相似點"], ["差異點"], "機制", "")

    def test_zero_analogies_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_NO_ANALOGIES"):
            generate_historical_analogy_set("HANALOGY-T-002", "PROP-T-002", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_analogy_ids_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_DUPLICATE_ANALOGY_ID"):
            generate_historical_analogy_set("HANALOGY-T-003", "PROP-T-003", [_analogy("HA-1"), _analogy("HA-1")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_ID"):
            generate_historical_analogy_set("WRONG-001", "PROP-T-004", [_analogy()], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HANALOGY_INVALID_SUBJECT_REF"):
            generate_historical_analogy_set("HANALOGY-T-005", "", [_analogy()], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_returned_record_does_not_alias_the_callers_nested_lists(self):
        """Nested-container aliasing regression: a returned 'validated' record must not share mutable list
        objects with the caller's own input -- mutating the caller's list after the fact must not silently
        invalidate the already-returned record."""
        similarities = ["相似點"]
        differences = ["差異點"]
        a = analogy("HA-1", "歷史案例", similarities, differences, "機制", "限制")
        self.assertIsNot(a["similarities"], similarities)
        self.assertIsNot(a["differences"], differences)
        similarities.append("mutated after return")
        self.assertEqual(a["similarities"], ["相似點"])

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        """Same aliasing class as above, applied to `provenance`: mutating the caller's own provenance dict
        after construction must not silently change the already-returned 'validated' record."""
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_historical_analogy_set("HANALOGY-T-006", "PROP-T-006", [_analogy("HA-1")], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_historical_analogy_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "no_surface_level_analogy", "min_analogies_examined"})
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_a_hand_tampered_record_that_bypassed_the_builder(self):
        """The gate re-derives the invariant independently -- it must never call the builder, and must catch a
        hand-tampered record that skipped it entirely."""
        tampered = copy.deepcopy(_valid_record())
        tampered["analogies"][0]["differences"] = []
        gate = evaluate_no_surface_level_analogy_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_analogy_limits_on_a_tampered_record(self):
        tampered = copy.deepcopy(_valid_record())
        tampered["analogies"][0]["analogy_limits"] = ""
        gate = evaluate_no_surface_level_analogy_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_duplicate_analogy_id_on_a_record_that_bypassed_the_builder(self):
        """A critic pass found this gate returned all-PASS on two analogies sharing an id, even though the
        builder (HANALOGY_DUPLICATE_ANALOGY_ID) refuses it -- the gate must independently re-derive this too."""
        tampered = copy.deepcopy(_valid_record())
        tampered["analogies"].append(copy.deepcopy(tampered["analogies"][0]))
        results = evaluate_historical_analogy_gates(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertFalse(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_zero_analogies_on_a_tampered_record_fails_min_analogies_gate(self):
        tampered = copy.deepcopy(_valid_record())
        tampered["analogies"] = []
        gate = evaluate_min_analogies_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_every_gate_fails_closed_not_crashed_on_non_dict_top_level_input(self):
        for bad_record in (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1}):
            with self.subTest(bad_record=bad_record):
                results = evaluate_historical_analogy_gates(bad_record, "test", "2026-09-12T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_gate_fails_closed_on_malformed_entries_inside_analogies(self):
        for bad_entry in (None, "not-a-dict", 42, [], {}, {"junk": 1}):
            with self.subTest(bad_entry=bad_entry):
                tampered = copy.deepcopy(_valid_record())
                tampered["analogies"] = [bad_entry]
                gate = evaluate_no_surface_level_analogy_gate(tampered, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["analogies"][0]["differences"] = []
        with self.assertRaises(SchemaValidationError):
            contracts.validate(HISTORICAL_ANALOGY_SCHEMA, tampered, "hand-crafted bypass")


if __name__ == "__main__":
    unittest.main()
