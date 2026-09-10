"""Mutation-style tests for ``framing.frame_storming`` (F01 framing family, Atlas F01 table row L343 + §28
quick-tool table L4468).

Three real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_frame_storming_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_frame_storming_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real,
newly-minted spec-root schema (``typed-objects/frame-storming-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.frame_storming import (
    METHOD_ID,
    MIN_CANDIDATE_FRAMINGS,
    MIN_FRAME_TEXT_LENGTH,
    RECORD_ID_PREFIX,
    all_gates_pass,
    candidate_framing,
    evaluate_evidence_labeling_required_gate,
    evaluate_frame_storming_gates,
    evaluate_frame_storming_integrity_gate,
    evaluate_provenance_required_gate,
    generate_frame_storming_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FRAME_STORMING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/frame-storming-record.schema.yaml"


def _candidates(*, texts=None):
    texts = texts if texts is not None else ["為什麼轉換率下降？", "是不是介面文案讓人誤解？", "會不會是結帳流程步驟太多？"]
    return [candidate_framing(f"F{i + 1}", text, make_provenance("HYPOTHESIS", "AI_SUGGESTED")) for i, text in enumerate(texts)]


def _valid_record(
    *,
    record_id: str = "FS-T-001",
    phenomenon: str = "轉換率上月下降 5 個百分點",
    candidate_framings=None,
    selected_frame_ref: str = "F1",
    provenance=None,
    version: str = "1.0.0",
    informs_boundary_critique_ref=None,
):
    return generate_frame_storming_record(
        record_id,
        phenomenon,
        candidate_framings if candidate_framings is not None else _candidates(),
        selected_frame_ref,
        provenance if provenance is not None else make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        version=version,
        informs_boundary_critique_ref=informs_boundary_critique_ref,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(FRAME_STORMING_SCHEMA, _valid_record(), "frame storming record")

    def test_valid_record_with_all_optional_fields_validates(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降？", make_provenance("EVIDENCE", "HUMAN_APPROVED"), cluster="root-cause", supporting_evidence_refs=["E-960"]),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), cluster="ux"),
        ]
        record = _valid_record(candidate_framings=candidates, selected_frame_ref="F1", informs_boundary_critique_ref="BC-001")
        self.contracts.validate(FRAME_STORMING_SCHEMA, record, "frame storming record with all optional fields")
        self.assertEqual(record["candidate_framings"][0]["cluster"], "root-cause")
        self.assertEqual(record["informs_boundary_critique_ref"], "BC-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_frame_storming_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_VERSION"):
            generate_frame_storming_record("FS-T-002", "p", _candidates(), "F1", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRAME_STORMING_SCHEMA, record, "record with a smuggled top-level authority-style key")

    def test_schema_rejects_an_unknown_candidate_key(self):
        record = _valid_record()
        record["candidate_framings"][0]["smuggled"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRAME_STORMING_SCHEMA, record, "record with a smuggled candidate key")

    def test_schema_rejects_a_single_candidate_array(self):
        """Regression test for minItems:2 -- a record hand-crafted with only 1 candidate must fail real schema
        validation too, not just the runtime gate."""
        record = _valid_record()
        record["candidate_framings"] = [record["candidate_framings"][0]]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRAME_STORMING_SCHEMA, record, "record with a single candidate")

    def test_schema_rejects_a_stub_frame_text(self):
        """Regression test for frame_text minLength:6 -- a 1-character stub must fail real schema validation."""
        record = _valid_record()
        record["candidate_framings"][0]["frame_text"] = "?"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRAME_STORMING_SCHEMA, record, "record with a stub frame_text")


class TooFewCandidatesTests(unittest.TestCase):
    def test_single_candidate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_TOO_FEW_CANDIDATES"):
            _valid_record(candidate_framings=[_candidates()[0]], selected_frame_ref="F1")

    def test_empty_candidate_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_TOO_FEW_CANDIDATES"):
            _valid_record(candidate_framings=[], selected_frame_ref="F1")

    def test_non_list_candidates_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_TOO_FEW_CANDIDATES"):
            _valid_record(candidate_framings="not-a-list", selected_frame_ref="F1")

    def test_min_candidate_framings_constant(self):
        self.assertEqual(MIN_CANDIDATE_FRAMINGS, 2)

    def test_exactly_two_candidates_is_accepted(self):
        record = _valid_record(candidate_framings=_candidates()[:2], selected_frame_ref="F1")
        self.assertEqual(len(record["candidate_framings"]), 2)


class DuplicateCandidateTests(unittest.TestCase):
    def test_duplicate_candidate_id_is_refused(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F1", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_DUPLICATE_CANDIDATE_ID"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F1")

    def test_duplicate_frame_text_exact_match_is_refused(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_DUPLICATE_FRAME_TEXT"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F1")

    def test_duplicate_frame_text_case_and_whitespace_insensitive_is_refused(self):
        candidates = [
            candidate_framing("F1", "Why Now?", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "  why   now?  ", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_DUPLICATE_FRAME_TEXT"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F1")

    def test_genuinely_distinct_frame_text_is_accepted(self):
        record = _valid_record()
        texts = [c["frame_text"] for c in record["candidate_framings"]]
        self.assertEqual(len(set(texts)), len(texts))

    def test_duplicate_frame_text_full_width_punctuation_variant_is_refused(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降?", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_DUPLICATE_FRAME_TEXT"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F1")


class StubFrameTextTests(unittest.TestCase):
    def test_min_frame_text_length_constant(self):
        self.assertEqual(MIN_FRAME_TEXT_LENGTH, 6)

    def test_stub_frame_text_is_refused(self):
        candidates = [
            candidate_framing("F1", "?", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_CANDIDATE_SHAPE"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F2")

    def test_whitespace_only_frame_text_is_refused(self):
        candidates = [
            candidate_framing("F1", "      ", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_CANDIDATE_SHAPE"):
            _valid_record(candidate_framings=candidates, selected_frame_ref="F2")

    def test_exactly_min_length_frame_text_is_accepted(self):
        candidates = [
            candidate_framing("F1", "六個字元剛剛好", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        record = _valid_record(candidate_framings=candidates, selected_frame_ref="F1")
        self.assertEqual(record["candidate_framings"][0]["frame_text"], "六個字元剛剛好")


class SelectedFrameRefTests(unittest.TestCase):
    """The core invariant: the selection must be traceable to a generated candidate."""

    def test_selection_naming_a_never_generated_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND"):
            _valid_record(selected_frame_ref="F-NEVER-GENERATED")

    def test_empty_selection_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND"):
            _valid_record(selected_frame_ref="")

    def test_selection_matching_a_real_candidate_id_is_accepted(self):
        record = _valid_record(selected_frame_ref="F2")
        self.assertEqual(record["selected_frame_ref"], "F2")
        candidate_ids = {c["id"] for c in record["candidate_framings"]}
        self.assertIn(record["selected_frame_ref"], candidate_ids)


class OptionalFieldValidationTests(unittest.TestCase):
    def test_empty_phenomenon_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_EMPTY_PHENOMENON"):
            _valid_record(phenomenon="")

    def test_whitespace_only_phenomenon_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_EMPTY_PHENOMENON"):
            _valid_record(phenomenon="   ")

    def test_informs_boundary_critique_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FRAMESTORMING_INVALID_INFORMS_BOUNDARY_CRITIQUE_REF"):
            _valid_record(informs_boundary_critique_ref="")

    def test_informs_boundary_critique_ref_absent_by_default(self):
        record = _valid_record()
        self.assertNotIn("informs_boundary_critique_ref", record)

    def test_informs_boundary_critique_ref_present_when_given(self):
        record = _valid_record(informs_boundary_critique_ref="BC-001")
        self.assertEqual(record["informs_boundary_critique_ref"], "BC-001")

    def test_cluster_optional_and_absent_by_default(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        record = _valid_record(candidate_framings=candidates, selected_frame_ref="F1")
        for c in record["candidate_framings"]:
            self.assertNotIn("cluster", c)

    def test_builder_copies_candidate_list_not_aliasing_caller_list(self):
        candidates = _candidates()
        record = _valid_record(candidate_framings=candidates)
        candidates.append(candidate_framing("F-MUTATED", "此為事後追加的候選框架文字", make_provenance("HYPOTHESIS", "AI_SUGGESTED")))
        self.assertEqual(len(record["candidate_framings"]), 3)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_frame_storming_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_ungrounded_selected_frame_ref(self):
        record = copy.deepcopy(_valid_record())
        record["selected_frame_ref"] = "F-NEVER-GENERATED"
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND")

    def test_gate_catches_hand_tampered_too_few_candidates(self):
        record = copy.deepcopy(_valid_record())
        record["candidate_framings"] = [record["candidate_framings"][0]]
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_frame_text(self):
        record = copy.deepcopy(_valid_record())
        record["candidate_framings"][1]["frame_text"] = record["candidate_framings"][0]["frame_text"]
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_stub_frame_text(self):
        record = copy.deepcopy(_valid_record())
        record["candidate_framings"][0]["frame_text"] = "?"
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_phenomenon(self):
        record = copy.deepcopy(_valid_record())
        record["phenomenon"] = ""
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_invalid_informs_boundary_critique_ref(self):
        record = copy.deepcopy(_valid_record())
        record["informs_boundary_critique_ref"] = ""
        gate = evaluate_frame_storming_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_frame_storming_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_a_candidate_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["candidate_framings"][0]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    def test_gate_passes_when_no_candidate_claims_evidence(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_passes_when_evidence_labeled_candidate_cites_refs(self):
        candidates = [
            candidate_framing("F1", "為什麼轉換率下降？", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-960"]),
            candidate_framing("F2", "是不是介面文案讓人誤解？", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        record = _valid_record(candidate_framings=candidates, selected_frame_ref="F1")
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_when_evidence_labeled_candidate_cites_no_refs(self):
        record = copy.deepcopy(_valid_record())
        record["candidate_framings"][0]["provenance"]["epistemic_type"] = "EVIDENCE"
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_on_empty_candidates(self):
        gate = evaluate_evidence_labeling_required_gate({"candidate_framings": []}, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_frame_storming_gates_returns_three_gates_in_order(self):
        results = evaluate_frame_storming_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "frame_storming_integrity"])

    def test_evaluate_frame_storming_gates_all_pass_on_a_valid_record(self):
        results = evaluate_frame_storming_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FS-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.frame_storming")

    def test_candidate_framing_helper_omits_absent_optional_keys(self):
        entry = candidate_framing("F1", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("cluster", entry)
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_candidate_framing_helper_includes_present_optional_keys(self):
        entry = candidate_framing("F1", "為什麼轉換率下降？", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), cluster="root-cause", supporting_evidence_refs=["E-960"])
        self.assertEqual(entry["cluster"], "root-cause")
        self.assertEqual(entry["supporting_evidence_refs"], ["E-960"])


if __name__ == "__main__":
    unittest.main()
