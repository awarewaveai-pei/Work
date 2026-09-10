"""Mutation-style tests for ``causal.theory_of_change`` (F11 causal family's 7th member, Atlas F11 table row
L618 + dedicated §11.22, L1689-1711).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_theory_of_change_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_theory_of_change_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/theory-of-change-record.schema.yaml``), including an
``additionalProperties: false`` top-level and nested-$defs rejection check.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.theory_of_change import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_ORDER,
    TRANSITION_STAGE_PAIRS,
    all_gates_pass,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    evaluate_theory_of_change_gates,
    evaluate_theory_of_change_integrity_gate,
    generate_theory_of_change_record,
    stage_entry,
    transition_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

THEORY_OF_CHANGE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/theory-of-change-record.schema.yaml"


def _stage(name: str, description: str = "a description") -> dict:
    return stage_entry(name, description, make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))


def _stages() -> list[dict]:
    return [_stage(s) for s in STAGE_ORDER]


def _transition(from_stage: str, to_stage: str, *, evidence_refs: list[str] | None = ("E-1",)) -> dict:
    return transition_entry(
        from_stage,
        to_stage,
        "an assumption",
        "an evidence basis",
        "an indicator",
        "a risk",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        supporting_evidence_refs=list(evidence_refs) if evidence_refs else None,
    )


def _transitions() -> list[dict]:
    return [_transition(a, b) for a, b in TRANSITION_STAGE_PAIRS]


def _valid_record(*, stages=None, transitions=None, record_id: str = "TOC-T-001", intervention: str = "a test intervention"):
    return generate_theory_of_change_record(
        record_id,
        intervention,
        stages if stages is not None else _stages(),
        transitions if transitions is not None else _transitions(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, _valid_record(), "theory of change record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_theory_of_change_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_VERSION"):
            generate_theory_of_change_record("TOC-T-002", "intervention", _stages(), _transitions(), make_provenance("AI_INFERENCE", "AI_GENERATED"), version=1)

    def test_empty_intervention_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_EMPTY_INTERVENTION"):
            _valid_record(intervention="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: a transition hand-tampered to drop its risk attribute fails BOTH the runtime gate
        and the real JSON schema's own required-field check independently."""
        tampered = copy.deepcopy(_valid_record())
        del tampered["transitions"][0]["risk"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, tampered, "tampered record")
        gate = evaluate_theory_of_change_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_stage_key(self):
        record = _valid_record()
        record["stages"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, record, "record with unknown stage key")

    def test_schema_rejects_unknown_transition_key(self):
        record = _valid_record()
        record["transitions"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, record, "record with unknown transition key")

    def test_schema_rejects_transition_referencing_wrong_stage_pair(self):
        """The schema's own const-locked from_stage/to_stage per position -- independent of the runtime
        module -- must reject a transition naming the wrong adjacent pair for its own array position."""
        record = _valid_record()
        record["transitions"][0]["from_stage"] = "OUTPUTS"
        record["transitions"][0]["to_stage"] = "IMPACT"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THEORY_OF_CHANGE_SCHEMA, record, "record with wrong stage pair at position 0")


class StageShapeTests(unittest.TestCase):
    def test_stages_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=_stages()[:5])

    def test_stages_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=_stages() + [_stage("INPUTS")])

    def test_stages_wrong_order_is_refused(self):
        stages = _stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=stages)

    def test_stages_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages="not-a-list")

    def test_stage_entry_missing_required_key_is_refused(self):
        stages = _stages()
        del stages[0]["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=stages)

    def test_stage_entry_unknown_extra_key_is_refused(self):
        stages = _stages()
        stages[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=stages)

    def test_stage_entry_wrong_stage_name_is_refused(self):
        stages = _stages()
        stages[0]["stage"] = "PREPARATION"
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=stages)

    def test_stage_missing_description_entirely_is_refused(self):
        stages = _stages()
        del stages[0]["description"]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_STAGE_SET"):
            _valid_record(stages=stages)

    def test_stage_with_whitespace_only_description_is_refused(self):
        stages = _stages()
        stages[0]["description"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_STAGE_MISSING_DESCRIPTION"):
            _valid_record(stages=stages)


class TransitionShapeAndPositionalIntegrityTests(unittest.TestCase):
    """The core invariant this method exists for: exactly 5 positionally-ordered transitions, each carrying
    all 4 Atlas-mandated attributes, unconditionally."""

    def test_transitions_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=_transitions()[:4])

    def test_transitions_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=_transitions() + [_transition("INPUTS", "ACTIVITIES")])

    def test_transitions_wrong_order_is_refused(self):
        transitions = _transitions()
        transitions[0], transitions[1] = transitions[1], transitions[0]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transitions_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions="not-a-list")

    def test_transition_wrong_stage_pair_at_correct_position_is_refused(self):
        """THE positional invariant: a transition naming the wrong adjacent pair for its own array index must
        be refused, even though it is otherwise well-shaped."""
        transitions = _transitions()
        transitions[0] = _transition("OUTPUTS", "IMPACT")  # not INPUTS->ACTIVITIES, position 0's own pair
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transition_unknown_extra_key_is_refused(self):
        transitions = _transitions()
        transitions[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transition_with_malformed_evidence_refs_shape_is_refused(self):
        transitions = _transitions()
        transitions[0]["supporting_evidence_refs"] = []  # present but empty -- malformed, not "absent"
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transition_missing_assumption_key_entirely_is_refused(self):
        """A required key absent ENTIRELY is a shape violation (generic code) -- same distinction
        association.concept_map's own relationship_type-missing-vs-blank precedent already establishes."""
        transitions = _transitions()
        del transitions[0]["assumption"]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transition_blank_evidence_is_refused(self):
        transitions = _transitions()
        transitions[0]["evidence"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE"):
            _valid_record(transitions=transitions)

    def test_transition_missing_indicator_key_entirely_is_refused(self):
        transitions = _transitions()
        del transitions[0]["indicator"]
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_INVALID_TRANSITION_SET"):
            _valid_record(transitions=transitions)

    def test_transition_blank_risk_is_refused(self):
        """The exact Atlas §11.22 unconditional requirement, deliberately blanked -- no if/then exception."""
        transitions = _transitions()
        transitions[0]["risk"] = ""
        with self.assertRaisesRegex(InvariantViolation, "THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE"):
            _valid_record(transitions=transitions)

    def test_transition_stage_order_matches_stage_order_pairs(self):
        self.assertEqual(
            TRANSITION_STAGE_PAIRS,
            (
                ("INPUTS", "ACTIVITIES"),
                ("ACTIVITIES", "OUTPUTS"),
                ("OUTPUTS", "SHORT_TERM_OUTCOMES"),
                ("SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES"),
                ("LONG_TERM_OUTCOMES", "IMPACT"),
            ),
        )


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_blank_risk(self):
        record = copy.deepcopy(_valid_record())
        record["transitions"][4]["risk"] = ""  # present but blank -- the Atlas-mandated attribute is empty
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("MISSING_ATTRIBUTE", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_missing_risk_key_entirely(self):
        record = copy.deepcopy(_valid_record())
        del record["transitions"][4]["risk"]
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_swapped_transitions(self):
        record = copy.deepcopy(_valid_record())
        record["transitions"][0], record["transitions"][1] = record["transitions"][1], record["transitions"][0]
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_stage_order(self):
        record = copy.deepcopy(_valid_record())
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_theory_of_change_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_intervention(self):
        record = copy.deepcopy(_valid_record())
        record["intervention"] = ""
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_transition_count(self):
        record = copy.deepcopy(_valid_record())
        record["transitions"] = record["transitions"][:3]
        gate = evaluate_theory_of_change_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_stage_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["stages"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_a_transition_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["transitions"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_transitions_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_transition_cites_no_refs(self):
        transitions = _transitions()
        transitions[0] = _transition("INPUTS", "ACTIVITIES", evidence_refs=None)  # EVIDENCE-labeled, no refs
        record = _valid_record(transitions=transitions)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_ignores_non_evidence_transitions_with_no_refs(self):
        transitions = _transitions()
        transitions[0] = transition_entry("INPUTS", "ACTIVITIES", "a", "b", "c", "d", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        record = _valid_record(transitions=transitions)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_stage_entry_helper_shape(self):
        entry = stage_entry("INPUTS", "x", make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        self.assertEqual(entry["stage"], "INPUTS")
        self.assertEqual(entry["description"], "x")

    def test_transition_entry_helper_omits_supporting_evidence_refs_when_none(self):
        entry = transition_entry("INPUTS", "ACTIVITIES", "a", "b", "c", "d", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_transition_entry_helper_includes_supporting_evidence_refs_when_given(self):
        entry = transition_entry("INPUTS", "ACTIVITIES", "a", "b", "c", "d", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_theory_of_change_gates_returns_three_gates_in_order(self):
        results = evaluate_theory_of_change_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "theory_of_change_integrity"])

    def test_evaluate_theory_of_change_gates_all_pass_on_a_valid_record(self):
        results = evaluate_theory_of_change_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_stage_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(STAGE_ORDER, ("INPUTS", "ACTIVITIES", "OUTPUTS", "SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES", "IMPACT"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TOC-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "causal.theory_of_change")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
