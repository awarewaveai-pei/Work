"""Mutation-style tests for ``devops_sre.runbook_execution`` (thirty-third Method Atlas slice, eighth from
the `devops_sre` family). Atlas's own 5-part formula (preconditions->steps->expected output->stop/go->
rollback) is proven at BOTH independent layers -- construction-time and gate re-derivation, the gate
RECOMPUTING every precondition fresh rather than trusting stored values.

This module was written applying every lesson this session's own history established from the first draft
(shared predicates for every precondition including record identity and step key sets, rebuild-not-alias,
evidence-pinned tests) -- this test file verifies that claim held, via the same real mutation/exhaustive
disciplines prior slices' own critic rounds used."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.runbook_execution import (
    METHOD_ID,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_runbook_execution_gates,
    evaluate_runbook_integrity_gate,
    generate_runbook_execution_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/runbook-execution-record.schema.yaml"


def _step(step_number, description, preconditions_met, outcome, decision):
    return {"step_number": step_number, "description": description, "preconditions_met": preconditions_met, "outcome": outcome, "decision": decision}


def _completed_steps():
    return [
        _step(1, "verify replica lag", True, "matched_expected", "go"),
        _step(2, "promote replica", True, "matched_expected", "go"),
        _step(3, "repoint connection string", True, "matched_expected", "go"),
    ]


def _valid_record():
    return generate_runbook_execution_record("RBEXEC-T-001", "test runbook", _completed_steps(), False, make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_completed_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "completed runbook execution record")

    def test_stopped_record_with_rollback_validates(self):
        steps = [_step(1, "verify", True, "matched_expected", "go"), _step(2, "promote", True, "deviated", "stop")]
        record = generate_runbook_execution_record("RBEXEC-T-002", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "stopped runbook execution record")

    def test_single_step_record_validates(self):
        record = generate_runbook_execution_record("RBEXEC-T-003", "x", [_step(1, "only step", True, "matched_expected", "go")], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "single-step record")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_EMPTY_RECORD_FIELD"):
            generate_runbook_execution_record("", "x", _completed_steps(), False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_runbook_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_EMPTY_RECORD_FIELD"):
            generate_runbook_execution_record("RBEXEC-T-004", "", _completed_steps(), False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_zero_steps_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_NO_STEPS"):
            generate_runbook_execution_record("RBEXEC-T-005", "x", [], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_go_with_unmet_preconditions_is_refused(self):
        """The core justification invariant: decision:go requires preconditions_met:true."""
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_UNJUSTIFIED_GO"):
            generate_runbook_execution_record("RBEXEC-T-006", "x", [_step(1, "x", False, "matched_expected", "go")], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_go_with_deviated_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_UNJUSTIFIED_GO"):
            generate_runbook_execution_record("RBEXEC-T-007", "x", [_step(1, "x", True, "deviated", "go")], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_stop_is_legal_even_when_both_checks_pass(self):
        """DELIBERATELY ONE-DIRECTIONAL: a conservative stop is always legal, even when preconditions_met
        and outcome both say the step went fine -- an operator's own judgment call this contract's text
        never forbids."""
        record = generate_runbook_execution_record("RBEXEC-T-008", "x", [_step(1, "x", True, "matched_expected", "stop")], True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["steps"][0]["decision"], "stop")

    def test_duplicate_step_number_is_refused(self):
        steps = [_step(1, "a", True, "matched_expected", "go"), _step(1, "b", True, "matched_expected", "go")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_DUPLICATE_STEP_NUMBER"):
            generate_runbook_execution_record("RBEXEC-T-009", "x", steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_contiguous_step_numbers_is_refused(self):
        """Step numbers 1 and 3, skipping 2 -- must be refused even with no duplicates."""
        steps = [_step(1, "a", True, "matched_expected", "go"), _step(3, "c", True, "matched_expected", "go")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_NONCONTIGUOUS_STEPS"):
            generate_runbook_execution_record("RBEXEC-T-010", "x", steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_numbers_starting_above_one_is_refused(self):
        """Step numbers 2 and 3 (no step 1) -- non-contiguous relative to the required 1..N sequence."""
        steps = [_step(2, "b", True, "matched_expected", "go"), _step(3, "c", True, "matched_expected", "go")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_NONCONTIGUOUS_STEPS"):
            generate_runbook_execution_record("RBEXEC-T-011", "x", steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_steps_supplied_out_of_order_but_contiguous_is_accepted(self):
        steps = [_step(2, "b", True, "matched_expected", "go"), _step(1, "a", True, "matched_expected", "go")]
        record = generate_runbook_execution_record("RBEXEC-T-012", "x", steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(len(record["steps"]), 2)

    def test_step_after_stop_is_refused(self):
        """The core sequencing invariant: no step may follow a stop gate."""
        steps = [_step(1, "a", True, "deviated", "stop"), _step(2, "b", True, "matched_expected", "go")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_STEP_AFTER_STOP"):
            generate_runbook_execution_record("RBEXEC-T-013", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_after_stop_is_refused_even_when_supplied_out_of_numeric_order(self):
        """Regression for a critic-caught Major: _stopped_steps_are_last sorts by step_number internally,
        but nothing previously proved that sort was load-bearing -- a mutation removing it survived the
        whole suite because every other stop test happened to supply steps already in ascending order. This
        test supplies step 3 BEFORE step 1 and step 2 (the stop) in caller order, so only a real internal
        sort catches the violation."""
        steps = [_step(3, "c", True, "matched_expected", "go"), _step(1, "a", True, "matched_expected", "go"), _step(2, "b", True, "deviated", "stop")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_STEP_AFTER_STOP"):
            generate_runbook_execution_record("RBEXEC-T-013B", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_stop_without_rollback_is_refused(self):
        """The core rollback invariant: a stopped execution requires rollback_performed:true."""
        steps = [_step(1, "a", True, "deviated", "stop")]
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_STOP_REQUIRES_ROLLBACK"):
            generate_runbook_execution_record("RBEXEC-T-014", "x", steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_bool_rollback_performed_is_refused_even_when_nothing_stopped(self):
        """Regression for a critic-caught Minor: a non-bool rollback_performed was previously only checked
        on the stopped path, silently accepting e.g. "yes"/1/None when every step went."""
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_STOP_REQUIRES_ROLLBACK"):
            generate_runbook_execution_record("RBEXEC-T-008B", "x", _completed_steps(), "yes", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_rollback_performed_true_is_legal_even_when_every_step_went(self):
        """DELIBERATELY ONE-DIRECTIONAL: a precautionary rollback is always legal, even when nothing
        stopped."""
        record = generate_runbook_execution_record("RBEXEC-T-015", "x", _completed_steps(), True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertTrue(record["rollback_performed"])

    def test_non_dict_step_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_INVALID_STEP"):
            generate_runbook_execution_record("RBEXEC-T-016", "x", ["not-a-dict"], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_with_extra_field_is_refused_at_construction(self):
        """Regression, applying the lesson already established this session: an attacker-controlled extra
        field on a hand-built step must be rejected, not silently stripped OR silently accepted -- unlike
        the release_readiness_review precedent (which strips), this method's own _step_is_valid rejects
        outright since there is no reason a caller would legitimately supply an unknown field."""
        bad_step = dict(_step(1, "x", True, "matched_expected", "go"), attacker_field="y")
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_INVALID_STEP"):
            generate_runbook_execution_record("RBEXEC-T-017", "x", [bad_step], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_missing_a_required_field_is_refused(self):
        bad_step = {"step_number": 1, "description": "x", "preconditions_met": True, "outcome": "matched_expected"}  # missing decision
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_INVALID_STEP"):
            generate_runbook_execution_record("RBEXEC-T-018", "x", [bad_step], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_number_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_INVALID_STEP"):
            generate_runbook_execution_record("RBEXEC-T-019", "x", [_step(0, "x", True, "matched_expected", "go")], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_step_number_as_bool_is_refused(self):
        """bool is a subclass of int in Python -- True/False must be rejected as step_number, not coerced."""
        with self.assertRaisesRegex(InvariantViolation, "RUNBOOKEXEC_INVALID_STEP"):
            generate_runbook_execution_record("RBEXEC-T-020", "x", [_step(True, "x", True, "matched_expected", "go")], False, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_mutating_the_callers_own_list_after_construction_does_not_affect_the_stored_record(self):
        caller_steps = _completed_steps()
        record = generate_runbook_execution_record("RBEXEC-T-021", "x", caller_steps, False, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        caller_steps[0]["decision"] = "stop"
        self.assertEqual(record["steps"][0]["decision"], "go")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_runbook_execution_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_completed_record_passes_both_gates(self):
        results = evaluate_runbook_execution_gates(_valid_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "runbook_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_stopped_record_passes_both_gates(self):
        steps = [_step(1, "a", True, "matched_expected", "go"), _step(2, "b", True, "deviated", "stop")]
        record = generate_runbook_execution_record("RBEXEC-T-022", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        results = evaluate_runbook_execution_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_step_after_stop_fails_the_gate_via_recomputation(self):
        """The critical regression this slice was built to avoid from the start: appending a step after a
        stop gate (itself internally well-shaped and justified) must be caught by the gate's own
        independent re-derivation."""
        steps = [_step(1, "a", True, "matched_expected", "go"), _step(2, "b", True, "deviated", "stop")]
        record = generate_runbook_execution_record("RBEXEC-T-023", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        record["steps"].append(_step(3, "c", True, "matched_expected", "go"))
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "step recorded after a stop gate")
        self.assertIn(3, gate["evidence"][0]["step_numbers_after_stop"])

    def test_hand_tampered_step_inserted_before_stop_in_list_order_still_fails_the_gate(self):
        """Gate-layer companion to the builder's own shuffled-order regression: inserting the post-stop step
        at the FRONT of the stored steps[] list (not appending it) must still be caught -- the gate's own
        internal sort-by-step_number, not list position, is what determines "after the stop"."""
        steps = [_step(1, "a", True, "matched_expected", "go"), _step(2, "b", True, "deviated", "stop")]
        record = generate_runbook_execution_record("RBEXEC-T-023B", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        record["steps"].insert(0, _step(3, "c", True, "matched_expected", "go"))
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "step recorded after a stop gate")
        self.assertIn(3, gate["evidence"][0]["step_numbers_after_stop"])

    def test_hand_tampered_empty_runbook_ref_fails_the_gate(self):
        """Regression for a critic-caught Major: the record-identity gate check must cover BOTH id and
        runbook_ref -- only id had a dedicated test, so a mutation replacing runbook_ref's own re-validation
        with a placeholder would have survived undetected."""
        record = _valid_record()
        record["runbook_ref"] = ""
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/runbook_ref missing or empty")

    def test_hand_tampered_go_with_unmet_preconditions_fails_the_gate(self):
        record = _valid_record()
        record["steps"][0]["preconditions_met"] = False
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "decision:go not justified by preconditions_met/outcome")
        self.assertIn(1, gate["evidence"][0]["unjustified_step_numbers"])

    def test_hand_tampered_rollback_removed_after_stop_fails_the_gate(self):
        steps = [_step(1, "a", True, "deviated", "stop")]
        record = generate_runbook_execution_record("RBEXEC-T-024", "x", steps, True, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        record["rollback_performed"] = False
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stopped execution missing rollback_performed:true")

    def test_hand_tampered_duplicate_step_number_fails_the_gate(self):
        record = _valid_record()
        record["steps"][-1]["step_number"] = record["steps"][0]["step_number"]
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "duplicate step_number")
        self.assertIn(record["steps"][0]["step_number"], gate["evidence"][0]["duplicate_step_numbers"])

    def test_hand_tampered_gap_in_numbering_fails_the_gate(self):
        record = _valid_record()
        record["steps"][-1]["step_number"] = 99
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "non-contiguous step numbering")

    def test_hand_tampered_extra_field_on_a_step_fails_the_gate(self):
        record = _valid_record()
        record["steps"][0]["signed_off_by"] = "nobody"
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more steps is invalid (unknown/missing keys, bad step_number, empty description, or invalid preconditions_met/outcome/decision)")

    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/runbook_ref missing or empty")

    def test_hand_tampered_empty_steps_fails_the_gate(self):
        record = _valid_record()
        record["steps"] = []
        gate = evaluate_runbook_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "steps missing, not a list, or empty")

    def test_non_dict_record_fails_the_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_runbook_integrity_gate(bad_record, "test", "2026-09-05T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")
                provenance_gate = evaluate_provenance_required_gate(bad_record, "test", "2026-09-05T00:00:00Z")
                self.assertEqual(provenance_gate["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
