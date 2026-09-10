"""Mutation-style tests for ``framing.five_w_one_h`` (F01 framing family, Atlas F01 table row L340 + §12.1).

Three real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_five_w1h_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_five_w1h_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/5w1h-record.schema.yaml``), including an
``additionalProperties: false`` top-level rejection check.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.five_w_one_h import (
    DIMENSION_ORDER,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    dimension_entry,
    evaluate_evidence_labeling_required_gate,
    evaluate_five_w1h_gates,
    evaluate_five_w1h_integrity_gate,
    evaluate_provenance_required_gate,
    generate_five_w1h_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FIVEW1H_SCHEMA = "ai-lego://specs/cognitive/typed-objects/5w1h-record.schema.yaml"


def _known(dimension: str, answer: str = "an answer", refs: list[str] | None = ("E-1",)) -> dict:
    return dimension_entry(dimension, "KNOWN", make_provenance("EVIDENCE", "HUMAN_APPROVED"), answer=answer, supporting_evidence_refs=list(refs) if refs else None)


def _unknown(dimension: str, gap_note: str | None = "not yet known") -> dict:
    return dimension_entry(dimension, "UNKNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), gap_note=gap_note)


def _all_known_dimensions() -> list[dict]:
    return [_known(d) for d in DIMENSION_ORDER]


def _mixed_dimensions() -> list[dict]:
    # WHO/WHAT/WHEN/WHERE known, WHY/HOW unknown -- matches the CLI demo's own real shape.
    return [_known("WHO"), _known("WHAT"), _known("WHEN"), _known("WHERE"), _unknown("WHY"), _unknown("HOW")]


def _valid_record(*, dimensions=None, record_id: str = "5W1H-T-001", topic: str = "test topic", informs_problem_statement_ref=None):
    return generate_five_w1h_record(
        record_id,
        topic,
        dimensions if dimensions is not None else _mixed_dimensions(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        informs_problem_statement_ref=informs_problem_statement_ref,
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(FIVEW1H_SCHEMA, _valid_record(), "5w1h record")

    def test_valid_record_with_informs_problem_statement_ref_validates(self):
        record = _valid_record(informs_problem_statement_ref="PROB-2026-09-10-001")
        self.contracts.validate(FIVEW1H_SCHEMA, record, "5w1h record with forward link")
        self.assertEqual(record["informs_problem_statement_ref"], "PROB-2026-09-10-001")

    def test_all_known_record_has_empty_information_gaps_and_validates(self):
        record = _valid_record(dimensions=_all_known_dimensions())
        self.contracts.validate(FIVEW1H_SCHEMA, record, "5w1h record, zero gaps")
        self.assertEqual(record["information_gaps"], [])

    def test_all_unknown_record_has_all_six_gaps_and_validates(self):
        record = _valid_record(dimensions=[_unknown(d) for d in DIMENSION_ORDER])
        self.contracts.validate(FIVEW1H_SCHEMA, record, "5w1h record, all gaps")
        self.assertEqual(record["information_gaps"], list(DIMENSION_ORDER))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_5w1h_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_VERSION"):
            generate_five_w1h_record("5W1H-T-002", "topic", _mixed_dimensions(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_empty_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_EMPTY_TOPIC"):
            _valid_record(topic="   ")

    def test_invalid_informs_problem_statement_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_INFORMS_PROBLEM_STATEMENT_REF"):
            _valid_record(informs_problem_statement_ref="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: an UNKNOWN dimension hand-tampered to carry an answer fails BOTH the runtime
        gate and the real JSON schema's own if/then/not branch independently."""
        tampered = copy.deepcopy(_valid_record())
        tampered["dimensions"][4]["answer"] = "smuggled in"  # WHY is UNKNOWN in _mixed_dimensions()
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FIVEW1H_SCHEMA, tampered, "tampered record")
        gate = evaluate_five_w1h_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        """additionalProperties: false top-level check -- present from the start per this task's own
        mandate (a prior session's critic found 2 sibling schemas missing this)."""
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FIVEW1H_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_dimension_entry_key(self):
        record = _valid_record()
        record["dimensions"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FIVEW1H_SCHEMA, record, "record with unknown dimension key")


class DimensionShapeTests(unittest.TestCase):
    def test_dimensions_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=_mixed_dimensions()[:5])

    def test_dimensions_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=_mixed_dimensions() + [_known("WHO")])

    def test_dimensions_wrong_order_is_refused(self):
        dims = _mixed_dimensions()
        dims[0], dims[1] = dims[1], dims[0]
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=dims)

    def test_dimensions_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions="not-a-list")

    def test_dimension_entry_missing_required_key_is_refused(self):
        dims = _mixed_dimensions()
        del dims[0]["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=dims)

    def test_dimension_entry_unknown_extra_key_is_refused(self):
        dims = _mixed_dimensions()
        dims[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=dims)

    def test_dimension_entry_wrong_dimension_name_is_refused(self):
        dims = _mixed_dimensions()
        dims[0]["dimension"] = "IDENTITY"
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=dims)

    def test_invalid_status_value_is_refused(self):
        dims = _mixed_dimensions()
        dims[0]["status"] = "MAYBE"
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_STATUS"):
            _valid_record(dimensions=dims)


class KnownUnknownCoherenceTests(unittest.TestCase):
    """The core invariant this method exists for: a genuinely unanswered dimension is a first-class state,
    never a silently-coerced empty-string 'answer'."""

    def test_known_missing_answer_entirely_is_refused(self):
        dims = _mixed_dimensions()
        dims[0] = dimension_entry("WHO", "KNOWN", make_provenance("EVIDENCE", "HUMAN_APPROVED"))  # no answer at all
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_KNOWN_MISSING_ANSWER"):
            _valid_record(dimensions=dims)

    def test_known_with_whitespace_only_answer_is_refused(self):
        dims = _mixed_dimensions()
        dims[0]["answer"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_KNOWN_MISSING_ANSWER"):
            _valid_record(dimensions=dims)

    def test_known_with_gap_note_is_refused(self):
        """A KNOWN dimension carrying a gap_note is internally incoherent -- gap_note is UNKNOWN-only."""
        dims = _mixed_dimensions()
        dims[0]["gap_note"] = "should not be here"
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_KNOWN_HAS_GAP_NOTE"):
            _valid_record(dimensions=dims)

    def test_unknown_carrying_an_answer_is_refused(self):
        """THE core invariant: an UNKNOWN dimension must not carry an answer key at all, even a real one --
        that is exactly the 'silently reads as answered: nothing' trap this design forbids."""
        dims = _mixed_dimensions()
        dims[4] = dimension_entry("WHY", "UNKNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), answer="smuggled in")
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_UNKNOWN_HAS_ANSWER"):
            _valid_record(dimensions=dims)

    def test_unknown_carrying_an_empty_string_answer_is_also_refused(self):
        """Even an EMPTY-string answer under UNKNOWN must be refused -- presence of the key itself is the
        violation, not merely its content."""
        dims = _mixed_dimensions()
        dims[4]["answer"] = ""
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_UNKNOWN_HAS_ANSWER"):
            _valid_record(dimensions=dims)

    def test_unknown_with_no_gap_note_is_legal(self):
        dims = _mixed_dimensions()
        dims[4] = dimension_entry("WHY", "UNKNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))  # no gap_note
        record = _valid_record(dimensions=dims)
        self.assertNotIn("gap_note", record["dimensions"][4])

    def test_unknown_with_explicit_blank_gap_note_is_refused(self):
        """An explicit blank gap_note is malformed, not the same as omitting the field -- same discipline
        root_cause.kepner_tregoe's own 'explicit empty is_not is malformed' check already establishes."""
        dims = _mixed_dimensions()
        dims[4]["gap_note"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "FIVEWONEH_INVALID_DIMENSION_SET"):
            _valid_record(dimensions=dims)


class InformationGapsComputeTests(unittest.TestCase):
    """GENUINE_COMPUTE: information_gaps is derived, never caller-supplied, verified re-derivable."""

    def test_mixed_record_gaps_are_exactly_why_and_how_in_order(self):
        record = _valid_record()
        self.assertEqual(record["information_gaps"], ["WHY", "HOW"])

    def test_generate_five_w1h_record_accepts_no_information_gaps_parameter(self):
        """The builder signature itself has no information_gaps parameter -- there is no code path for a
        caller to inject a mismatched value at construction time."""
        import inspect

        sig = inspect.signature(generate_five_w1h_record)
        self.assertNotIn("information_gaps", sig.parameters)

    def test_zero_gaps_when_all_known(self):
        record = _valid_record(dimensions=_all_known_dimensions())
        self.assertEqual(record["information_gaps"], [])

    def test_all_six_gaps_when_all_unknown(self):
        record = _valid_record(dimensions=[_unknown(d) for d in DIMENSION_ORDER])
        self.assertEqual(record["information_gaps"], list(DIMENSION_ORDER))

    def test_single_gap_in_the_middle_of_the_order(self):
        dims = _all_known_dimensions()
        dims[2] = _unknown("WHEN")
        record = _valid_record(dimensions=dims)
        self.assertEqual(record["information_gaps"], ["WHEN"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_information_gaps_claiming_fewer_gaps_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["information_gaps"] = []  # lies -- WHY/HOW are still UNKNOWN in dimensions
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "FIVEWONEH_INFORMATION_GAPS_MISMATCH")

    def test_gate_catches_hand_tampered_information_gaps_claiming_more_gaps_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["information_gaps"] = ["WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"]  # lies -- 4 are KNOWN
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "FIVEWONEH_INFORMATION_GAPS_MISMATCH")

    def test_gate_catches_hand_tampered_information_gaps_wrong_order(self):
        record = copy.deepcopy(_valid_record())
        record["information_gaps"] = ["HOW", "WHY"]  # right set, wrong order vs DIMENSION_ORDER
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_unknown_with_answer(self):
        record = copy.deepcopy(_valid_record())
        record["dimensions"][4]["answer"] = "smuggled in directly on the raw dict"
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_dimension_order(self):
        record = copy.deepcopy(_valid_record())
        record["dimensions"][0], record["dimensions"][1] = record["dimensions"][1], record["dimensions"][0]
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_five_w1h_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_topic(self):
        record = copy.deepcopy(_valid_record())
        record["topic"] = ""
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_dimension_count(self):
        record = copy.deepcopy(_valid_record())
        record["dimensions"] = record["dimensions"][:4]
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_blank_informs_problem_statement_ref(self):
        record = copy.deepcopy(_valid_record())
        record["informs_problem_statement_ref"] = "   "
        gate = evaluate_five_w1h_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_dimension_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["dimensions"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_known_dimensions_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_known_dimension_cites_no_refs(self):
        dims = _mixed_dimensions()
        dims[0] = dimension_entry("WHO", "KNOWN", make_provenance("EVIDENCE", "HUMAN_APPROVED"), answer="x")  # no refs
        record = _valid_record(dimensions=dims)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_ignores_unknown_dimensions_regardless_of_label(self):
        """An UNKNOWN dimension has no answer to label evidence for -- must not be penalized for citing no
        supporting_evidence_refs."""
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        problems = gate["evidence"][0]["problems"]
        self.assertFalse(any(p["dimension"] in ("WHY", "HOW") for p in problems))

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_known_dimension_without_refs(self):
        dims = _mixed_dimensions()
        dims[0] = dimension_entry("WHO", "KNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), answer="x")  # no refs, not EVIDENCE
        record = _valid_record(dimensions=dims)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_dimension_entry_helper_omits_answer_and_gap_note_when_none(self):
        entry = dimension_entry("WHO", "UNKNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("answer", entry)
        self.assertNotIn("gap_note", entry)

    def test_dimension_entry_helper_includes_answer_when_given(self):
        entry = dimension_entry("WHO", "KNOWN", make_provenance("EVIDENCE", "HUMAN_APPROVED"), answer="x")
        self.assertEqual(entry["answer"], "x")

    def test_dimension_entry_helper_includes_gap_note_when_given(self):
        entry = dimension_entry("WHO", "UNKNOWN", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), gap_note="why unknown")
        self.assertEqual(entry["gap_note"], "why unknown")

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_five_w1h_gates_returns_three_gates_in_order(self):
        results = evaluate_five_w1h_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "five_w1h_integrity"])

    def test_evaluate_five_w1h_gates_all_pass_on_a_valid_record(self):
        results = evaluate_five_w1h_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_dimension_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(DIMENSION_ORDER, ("WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "5W1H-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) forced the spelled-out form -- verify
        the constant itself actually conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "framing.five_w_one_h")
        self.assertRegex(METHOD_ID, r"^[a-z_]+\.[a-z_]+$")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
