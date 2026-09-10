"""Mutation-style tests for ``framing.how_might_we`` (F01 framing family, Atlas F01 table row L342 + Sec12.3
L2575-2580).

Four real invariants beyond per-field completeness, exercised at BOTH layers: construction-time refusal
(``generate_how_might_we`` raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_how_might_we_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder entirely,
never calling the builder itself). Schema conformance is checked against the real spec-root schema this same
slice added (``typed-objects/how-might-we-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.how_might_we import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_how_might_we_gates,
    evaluate_how_might_we_integrity_gate,
    evaluate_provenance_required_gate,
    generate_how_might_we,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

HMW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/how-might-we-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "HMW-T-001",
    pain_point: str = "first-time users cannot find the correct information and give up",
    hmw_question: str = "how might we help first-time users find the correct information within 3 minutes?",
):
    return generate_how_might_we(
        record_id,
        pain_point,
        hmw_question,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(HMW_SCHEMA, _valid_record(), "how might we record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_how_might_we_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_INVALID_VERSION"):
            generate_how_might_we("HMW-T-002", "p", "how might we p?", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["pain_point"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HMW_SCHEMA, tampered, "tampered record")
        gate = evaluate_how_might_we_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """Same discipline as framing.north_star_metric's own test, added from the start (not retrofitted
        after a critic finding): additionalProperties:false must reject a smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HMW_SCHEMA, record, "record with a smuggled top-level authority-style key")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_pain_point_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_PAIN_POINT"):
            _valid_record(pain_point="")

    def test_whitespace_only_pain_point_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_PAIN_POINT"):
            _valid_record(pain_point="   ")

    def test_non_string_pain_point_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_PAIN_POINT"):
            _valid_record(pain_point=123)

    def test_empty_hmw_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_HMW_QUESTION"):
            _valid_record(hmw_question="")

    def test_whitespace_only_hmw_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_HMW_QUESTION"):
            _valid_record(hmw_question="   ")

    def test_missing_hmw_question_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_EMPTY_HMW_QUESTION"):
            _valid_record(hmw_question=None)


class QuestionEchoesPainPointTests(unittest.TestCase):
    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT"):
            _valid_record(pain_point="users cannot check out", hmw_question="users cannot check out")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT"):
            _valid_record(pain_point="Users Cannot Check Out", hmw_question="users cannot check out")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT"):
            _valid_record(pain_point="users cannot check out", hmw_question="  users   cannot   check   out  ")

    def test_genuinely_different_hmw_question_is_accepted(self):
        record = _valid_record(pain_point="users cannot check out", hmw_question="how might we help users check out faster?")
        self.assertNotEqual(record["pain_point"], record["hmw_question"])


class QuestionFormTests(unittest.TestCase):
    """The structural 'must not presuppose a solution' proxy: an Atlas-cited stem plus a trailing question
    mark. Both halves checked independently."""

    def test_missing_stem_declarative_solution_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_MISSING_STEM"):
            _valid_record(pain_point="churn is too high", hmw_question="we should build a loyalty program to retain users?")

    def test_missing_stem_unsupported_synonym_how_can_we_is_refused(self):
        """Deliberate scope decision (see contract compilation_decisions): 'how can we'/'how could we' are
        NOT accepted synonyms, only the 2 literal Atlas-cited stems are."""
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_MISSING_STEM"):
            _valid_record(pain_point="churn is too high", hmw_question="how can we reduce churn?")

    def test_missing_question_mark_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HOWMIGHTWE_QUESTION_MISSING_QUESTION_MARK"):
            _valid_record(pain_point="churn is too high", hmw_question="how might we reduce churn")

    def test_english_stem_case_insensitive_is_accepted(self):
        record = _valid_record(pain_point="churn is too high", hmw_question="HOW MIGHT WE reduce churn?")
        self.assertTrue(record["hmw_question"].lower().startswith("how might we"))

    def test_chinese_stem_is_accepted(self):
        record = _valid_record(pain_point="流失率過高", hmw_question="我們可以如何降低流失率？")
        self.assertEqual(record["hmw_question"], "我們可以如何降低流失率？")

    def test_fullwidth_question_mark_is_accepted(self):
        record = _valid_record(pain_point="流失率過高", hmw_question="我們可以如何降低流失率？")
        self.assertTrue(record["hmw_question"].endswith("？"))

    def test_ascii_question_mark_is_accepted(self):
        record = _valid_record(pain_point="churn is too high", hmw_question="how might we reduce churn?")
        self.assertTrue(record["hmw_question"].endswith("?"))


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_how_might_we_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_pain_point(self):
        record = copy.deepcopy(_valid_record())
        record["pain_point"] = ""
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_hmw_question(self):
        record = copy.deepcopy(_valid_record())
        record["hmw_question"] = ""
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_question_echoes_pain_point(self):
        record = copy.deepcopy(_valid_record())
        record["hmw_question"] = record["pain_point"]
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_stem(self):
        record = copy.deepcopy(_valid_record())
        record["hmw_question"] = "we will just build a chatbot?"
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_question_mark(self):
        record = copy.deepcopy(_valid_record())
        record["hmw_question"] = "how might we fix this"
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_how_might_we_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_how_might_we_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_how_might_we_gates_returns_two_gates_in_order(self):
        results = evaluate_how_might_we_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "how_might_we_integrity"])

    def test_evaluate_how_might_we_gates_all_pass_on_a_valid_record(self):
        results = evaluate_how_might_we_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "HMW-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.how_might_we")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "pain_point", "hmw_question", "provenance"},
        )

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        # NFKC normalization (critic finding, 2026-09-10 F01 closeout batch review): a pure ASCII/full-width
        # punctuation variant must not be treated as genuinely distinct by the echo-invariant comparison key.
        # (A full end-to-end echo bypass is not separately constructible here -- hmw_question always carries
        # an Atlas-cited stem prefix pain_point lacks -- so this tests the helper directly rather than
        # asserting an unreachable end-to-end attack; see test_frame_storming.py for the reachable end-to-end
        # case, where two full candidate framings differing only by punctuation width previously slipped
        # past the duplicate-frame-text invariant.)
        self.assertEqual(_normalize("users cannot check out?"), _normalize("users cannot check out？"))


if __name__ == "__main__":
    unittest.main()
