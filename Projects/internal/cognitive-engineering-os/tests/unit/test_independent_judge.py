"""Mutation-style tests for ``challenge.independent_judge`` (twenty-seventh Method Atlas slice, third and final
from the `challenge` family). The F12 table row's own benefit column ("避免多數決真理" -- avoid
majority-vote-as-truth) is proven at BOTH independent layers -- construction-time and gate re-derivation --
same discipline every prior forbidden-state guard this session built already established.

Includes fixes for a critic review of this slice's first draft: (1) two of the three structural preconditions
(positions, judgment) had NO gate re-derivation at all -- a hand-tampered record with positions_considered or
judgment emptied passed all existing gates (schema validation alone caught it, which is not the same as the
gate layer working); (2) the criteria-required gate was MORE PERMISSIVE than the builder and the schema (any
one valid entry passed the gate, while the builder/schema require every entry valid) -- a mixed
valid/invalid list a real caller could never legally construct still passed the gate untested. Both classes
of bug are covered here with regression tests, applying the same lesson `devops_sre.error_budget`'s own
critic-caught fix (WORKLOG continuation 37) already taught this session: a gate that isn't independently
re-derived from raw fields, or that enforces a looser rule than its own sibling layers, is not a genuine
independent check."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.challenge.independent_judge import (
    METHOD_ID,
    all_gates_pass,
    evaluate_criteria_required_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_independent_judge_gates,
    evaluate_judgment_required_gate,
    evaluate_positions_required_gate,
    evaluate_provenance_required_gate,
    generate_independent_judge_ruling,
    position,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

INDEPENDENT_JUDGE_RULING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/independent-judge-ruling.schema.yaml"


def _position(with_evidence: bool = False):
    refs = ["E-1"] if with_evidence else None
    return position("IJR-T-001-P1", "a position worth weighing", make_provenance("AI_INFERENCE", "AI_GENERATED"), supporting_evidence_refs=refs)


def _valid_ruling():
    return generate_independent_judge_ruling(
        "IJR-T-001", "PROP-T-001", [_position()], ["criterion one"], "approved",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_ruling_validates_against_the_real_schema(self):
        self.contracts.validate(INDEPENDENT_JUDGE_RULING_SCHEMA, _valid_ruling(), "independent judge ruling")

    def test_full_ruling_all_four_output_branches_validates(self):
        ruling = generate_independent_judge_ruling(
            "IJR-T-002", "PROP-T-002", [_position(), _position()], ["criterion a", "criterion b"], "approved with conditions",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            minority_opinion="one dissent noted", unknowns=["one open question"], reversal_conditions=["if X happens, revisit"],
        )
        self.contracts.validate(INDEPENDENT_JUDGE_RULING_SCHEMA, ruling, "full ruling")

    def test_minimal_ruling_no_optional_branches_validates(self):
        """The flow diagram's own 4-branch shape does NOT mean every ruling produces all four -- unanimous,
        fully-resolved, permanently-final rulings are legal (method contract compilation_decisions)."""
        ruling = generate_independent_judge_ruling(
            "IJR-T-003", "PROP-T-003", [_position()], ["criterion one"], "approved",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        self.assertNotIn("minority_opinion", ruling)
        self.assertNotIn("unknowns", ruling)
        self.assertNotIn("reversal_conditions", ruling)
        self.contracts.validate(INDEPENDENT_JUDGE_RULING_SCHEMA, ruling, "minimal ruling")

    def test_explicit_empty_unknowns_and_reversal_conditions_are_preserved_not_dropped(self):
        """unknowns/reversal_conditions use `is not None` (not truthy) checks -- an explicit [] is recorded as
        an empty list, distinct from the field being entirely absent, unlike a critic-caught inconsistency in
        the first draft where truthy checks silently dropped an explicitly-empty list to the same shape as
        'never supplied'. Behaviorally identical to a reader (the schema defaults absent to []), but the
        record itself now honestly reflects what the caller actually passed."""
        ruling = generate_independent_judge_ruling(
            "IJR-T-003B", "PROP-T-003B", [_position()], ["criterion one"], "approved",
            make_provenance("AI_INFERENCE", "AI_GENERATED"), unknowns=[], reversal_conditions=[],
        )
        self.assertIn("unknowns", ruling)
        self.assertIn("reversal_conditions", ruling)
        self.assertEqual(ruling["unknowns"], [])
        self.assertEqual(ruling["reversal_conditions"], [])
        self.contracts.validate(INDEPENDENT_JUDGE_RULING_SCHEMA, ruling, "explicit-empty-branches ruling")

    def test_zero_positions_considered_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_NO_POSITIONS_CONSIDERED"):
            generate_independent_judge_ruling("IJR-T-004", "PROP-T-004", [], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_zero_criteria_used_is_refused(self):
        """Atlas F12 table row (L646): 避免多數決真理 -- a ruling with zero stated criteria is exactly the
        majority-vote-as-truth failure mode this method exists to prevent."""
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_NO_CRITERIA_CITED"):
            generate_independent_judge_ruling("IJR-T-005", "PROP-T-005", [_position()], [], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_criteria_used_with_only_whitespace_entries_is_refused_with_invalid_entry_code(self):
        """A critic-caught error-code precision fix: a list that IS non-empty but every entry is invalid gets
        the distinct INVALID_CRITERION_ENTRY code, not the misleading NO_CRITERIA_CITED (which now means
        'the list itself is empty', not 'the list's entries are bad')."""
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_INVALID_CRITERION_ENTRY"):
            generate_independent_judge_ruling("IJR-T-005B", "PROP-T-005B", [_position()], ["   ", ""], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_criteria_used_mixed_valid_and_invalid_entries_is_refused(self):
        """The critic-caught divergence case itself: one real criterion plus one blank entry -- must be
        refused at construction, not silently accepted because at least one entry looked fine."""
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_INVALID_CRITERION_ENTRY"):
            generate_independent_judge_ruling("IJR-T-005C", "PROP-T-005C", [_position()], ["a real criterion", ""], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_judgment_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_EMPTY_JUDGMENT"):
            generate_independent_judge_ruling("IJR-T-006", "PROP-T-006", [_position()], ["x"], "", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_position_description_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_EMPTY_POSITION_DESCRIPTION"):
            position("IJR-T-007-P1", "", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_position_dict_with_empty_description_is_refused_not_crashed(self):
        """generate_independent_judge_ruling's own re-check must catch a hand-built dict that bypassed
        position() entirely, not just re-validate what position() already validated."""
        hand_built = {"id": "IJR-T-008-P1", "description": "", "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_EMPTY_POSITION_DESCRIPTION"):
            generate_independent_judge_ruling("IJR-T-008", "PROP-T-008", [hand_built], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_dict_position_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_INVALID_POSITION_SHAPE"):
            generate_independent_judge_ruling("IJR-T-009", "PROP-T-009", ["not-a-dict"], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_minority_opinion_is_refused_at_construction(self):
        """A critic-caught gap: minority_opinion was the only optional string field with no emptiness check,
        so the builder could construct a record the schema would then refuse (minLength: 1)."""
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_EMPTY_MINORITY_OPINION"):
            generate_independent_judge_ruling("IJR-T-010", "PROP-T-010", [_position()], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"), minority_opinion="   ")

    def test_invalid_unknowns_entry_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_INVALID_UNKNOWNS_ENTRY"):
            generate_independent_judge_ruling("IJR-T-011", "PROP-T-011", [_position()], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"), unknowns=["real", ""])

    def test_invalid_reversal_conditions_entry_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "INDEPENDENTJUDGE_INVALID_REVERSAL_CONDITIONS_ENTRY"):
            generate_independent_judge_ruling("IJR-T-012", "PROP-T-012", [_position()], ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"), reversal_conditions=["real", "   "])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_independent_judge_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_ruling_passes_all_five_gates(self):
        results = evaluate_independent_judge_gates(_valid_ruling(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required", "positions_required", "criteria_required", "judgment_required"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_emptied_positions_fails_the_gate(self):
        """Regression for the critic-caught gap: NO gate re-derived the at-least-one-position invariant in
        the first draft, so a record with positions_considered emptied after construction passed every
        existing gate (all_gates_pass returned True)."""
        ruling = _valid_ruling()
        ruling["positions_considered"] = []
        gate = evaluate_positions_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        all_results = evaluate_independent_judge_gates(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertFalse(all_gates_pass(all_results))

    def test_hand_tampered_deleted_positions_key_fails_closed(self):
        ruling = _valid_ruling()
        del ruling["positions_considered"]
        gate = evaluate_positions_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_emptied_judgment_fails_the_gate(self):
        """Regression for the critic-caught gap: NO gate re-derived the non-empty-judgment invariant in the
        first draft either."""
        ruling = _valid_ruling()
        ruling["judgment"] = ""
        gate = evaluate_judgment_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        all_results = evaluate_independent_judge_gates(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertFalse(all_gates_pass(all_results))

    def test_hand_tampered_deleted_judgment_key_fails_closed(self):
        ruling = _valid_ruling()
        del ruling["judgment"]
        gate = evaluate_judgment_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_emptied_criteria_fails_the_gate(self):
        ruling = _valid_ruling()
        ruling["criteria_used"] = []
        gate = evaluate_criteria_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criteria_gate_requires_every_entry_valid_not_just_one(self):
        """Regression for the critic-caught divergence: the first draft's gate passed on ANY ONE valid entry,
        more permissive than the builder (which requires every entry valid) and the schema (items minLength:
        1, so a malformed entry would fail schema validation too). A record with one real criterion and one
        blank entry -- a shape the builder itself can never legally produce -- must FAIL this gate."""
        ruling = _valid_ruling()
        ruling["criteria_used"] = ["a real criterion", ""]
        gate = evaluate_criteria_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criteria_tampered_to_a_bare_string_fails_closed_rather_than_counting_characters(self):
        ruling = _valid_ruling()
        ruling["criteria_used"] = "not a list"
        gate = evaluate_criteria_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_criteria_key_fails_closed_rather_than_pass(self):
        ruling = _valid_ruling()
        del ruling["criteria_used"]
        gate = evaluate_criteria_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_position_item_fails_the_provenance_gate_not_a_crash(self):
        ruling = _valid_ruling()
        ruling["positions_considered"] = ["not-a-dict"]
        gate = evaluate_provenance_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_position_missing_id_key_fails_the_provenance_gate_not_a_crash(self):
        ruling = _valid_ruling()
        ruling["positions_considered"] = [{"description": "x", "provenance": None}]
        gate = evaluate_provenance_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_provenance_fails_the_evidence_gate_not_a_crash(self):
        """The evidence-labeling gate's own defensive isinstance(provenance, dict) check -- untested in the
        first draft despite being a genuine hardening over challenge.red_team's own identical (and, until
        this same review, still-crashing) gate."""
        ruling = _valid_ruling()
        ruling["positions_considered"] = [{"id": "P1", "description": "x", "provenance": "EVIDENCE"}]
        gate = evaluate_evidence_labeling_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeled_position_with_refs_passes_the_evidence_gate(self):
        ruling = generate_independent_judge_ruling(
            "IJR-T-010B", "PROP-T-010B", [position("IJR-T-010B-P1", "a claim with real backing", make_provenance("EVIDENCE", "AI_GENERATED"), supporting_evidence_refs=["E-1"])],
            ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        gate = evaluate_evidence_labeling_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeled_position_without_refs_fails_the_evidence_gate(self):
        """Same real risk challenge.red_team's own identical flag covers: an unevidenced EVIDENCE-labeled
        claim is still an ungrounded claim."""
        ruling = generate_independent_judge_ruling(
            "IJR-T-011B", "PROP-T-011B", [position("IJR-T-011B-P1", "unsupported claim", make_provenance("EVIDENCE", "AI_GENERATED"))],
            ["x"], "approved", make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        gate = evaluate_evidence_labeling_required_gate(ruling, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ai_inference_labeled_position_without_refs_still_passes_the_evidence_gate(self):
        """Only EVIDENCE-labeled positions require supporting refs -- an AI_INFERENCE position is legal
        without them, the same distinction challenge.red_team's own identical gate already draws."""
        results = evaluate_independent_judge_gates(_valid_ruling(), "test", "2026-09-05T00:00:00Z")
        by_id = {r["gate_id"]: r["status"] for r in results}
        self.assertEqual(by_id["evidence_labeling_required"], "PASS")


if __name__ == "__main__":
    unittest.main()
