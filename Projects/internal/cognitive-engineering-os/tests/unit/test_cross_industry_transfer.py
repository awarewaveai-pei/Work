"""Mutation-style tests for ``foresight.cross_industry_transfer`` (F13 family).

Real invariant: every ``transfers[]`` item requires a non-empty
``shared_job_or_constraint`` AND a non-empty ``adaptation`` AND
``source_industry`` != ``target_industry`` (normalized) -- proven at BOTH
independent layers (construction-time raise + independent gate re-derivation
via the shared ``_transfer_problem`` predicate).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.foresight.cross_industry_transfer import (
    METHOD_ID,
    all_gates_pass,
    evaluate_cross_industry_transfer_gates,
    evaluate_min_transfers_gate,
    evaluate_provenance_required_gate,
    evaluate_transfer_completeness_gate,
    generate_cross_industry_transfer_set,
    transfer,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CROSS_INDUSTRY_TRANSFER_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cross-industry-transfer.schema.yaml"


def _transfer(t_id: str = "XT-1"):
    return transfer(t_id, "aviation", "surgery", "shared job", "checklist mechanism", "adapted checklist")


def _valid_record():
    return generate_cross_industry_transfer_set("XIND-T-001", [_transfer()], make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_cross_industry_transfer_set_validates_against_the_real_schema(self):
        self.contracts.validate(CROSS_INDUSTRY_TRANSFER_SCHEMA, _valid_record(), "cross-industry transfer set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_cross_industry_transfer_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class ConstructionInvariantTests(unittest.TestCase):
    def test_same_industry_transfer_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_INVALID_TRANSFER"):
            transfer("XT-BAD", "surgery", "surgery", "shared job", "mechanism", "adaptation")

    def test_same_industry_transfer_is_refused_even_with_different_casing_and_whitespace(self):
        """Normalized comparison -- 'Surgery' and '  surgery ' are the same industry."""
        with self.assertRaisesRegex(InvariantViolation, "XIND_INVALID_TRANSFER"):
            transfer("XT-BAD", "Surgery", "  surgery ", "shared job", "mechanism", "adaptation")

    def test_empty_shared_job_or_constraint_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_INVALID_TRANSFER"):
            transfer("XT-BAD", "aviation", "surgery", "", "mechanism", "adaptation")

    def test_empty_adaptation_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_INVALID_TRANSFER"):
            transfer("XT-BAD", "aviation", "surgery", "shared job", "mechanism", "")

    def test_zero_transfers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_NO_TRANSFERS"):
            generate_cross_industry_transfer_set("XIND-T-002", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_transfer_ids_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_DUPLICATE_TRANSFER_ID"):
            generate_cross_industry_transfer_set("XIND-T-003", [_transfer("XT-1"), _transfer("XT-1")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIND_INVALID_ID"):
            generate_cross_industry_transfer_set("WRONG-001", [_transfer()], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        """Nested-container aliasing regression, applied to `provenance`: mutating the caller's own provenance
        dict after construction must not silently change the already-returned 'validated' record."""
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_cross_industry_transfer_set("XIND-T-004", [_transfer()], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_cross_industry_transfer_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "transfer_completeness", "min_transfers_declared"})
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_a_hand_tampered_same_industry_record_that_bypassed_the_builder(self):
        """The gate re-derives the invariant independently -- it must never call the builder, and must catch a
        hand-tampered record that skipped it entirely."""
        tampered = copy.deepcopy(_valid_record())
        tampered["transfers"][0]["target_industry"] = tampered["transfers"][0]["source_industry"]
        gate = evaluate_transfer_completeness_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_duplicate_transfer_id_on_a_record_that_bypassed_the_builder(self):
        """A critic pass found this gate returned all-PASS on two transfers sharing an id, even though the
        builder (XIND_DUPLICATE_TRANSFER_ID) refuses it -- the gate must independently re-derive this too."""
        tampered = copy.deepcopy(_valid_record())
        tampered["transfers"].append(copy.deepcopy(tampered["transfers"][0]))
        results = evaluate_cross_industry_transfer_gates(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertFalse(all_gates_pass(results))

    def test_gate_catches_missing_adaptation_on_a_tampered_record(self):
        tampered = copy.deepcopy(_valid_record())
        tampered["transfers"][0]["adaptation"] = ""
        gate = evaluate_transfer_completeness_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_zero_transfers_on_a_tampered_record_fails_min_transfers_gate(self):
        tampered = copy.deepcopy(_valid_record())
        tampered["transfers"] = []
        gate = evaluate_min_transfers_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_every_gate_fails_closed_not_crashed_on_non_dict_top_level_input(self):
        for bad_record in (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1}):
            with self.subTest(bad_record=bad_record):
                results = evaluate_cross_industry_transfer_gates(bad_record, "test", "2026-09-12T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_gate_fails_closed_on_malformed_entries_inside_transfers(self):
        for bad_entry in (None, "not-a-dict", 42, [], {}, {"junk": 1}):
            with self.subTest(bad_entry=bad_entry):
                tampered = copy.deepcopy(_valid_record())
                tampered["transfers"] = [bad_entry]
                gate = evaluate_transfer_completeness_gate(tampered, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
