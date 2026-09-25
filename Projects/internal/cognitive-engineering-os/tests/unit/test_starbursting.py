"""Mutation-style tests for ``divergent.starbursting`` (F03 divergent-ideation family, 1st member).

Three real invariants beyond per-field shape (non-empty question list, category-coverage completeness,
question-mark suffix), exercised at BOTH layers: construction-time refusal
(``generate_starbursting_session`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_starbursting_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/starbursting-session.schema.yaml``). A dedicated
``DifferentiationFromFiveW1HTests`` class proves this method's own question-mark invariant is genuinely
distinct from ``framing.five_w_one_h``'s shape, not merely a naming difference.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.starbursting import (
    CATEGORY_NAMES,
    METHOD_ID,
    QUESTION_MARKS,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_starbursting_gates,
    evaluate_starbursting_integrity_gate,
    generate_starbursting_session,
    question_entry,
)
from ai_lego.modules.framing.five_w_one_h import DIMENSION_ORDER as FIVE_W1H_DIMENSION_ORDER
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

STARBURSTING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/starbursting-session.schema.yaml"
CENTRAL_TOPIC = "為中小企業導入 AI 客服"


def _questions(**overrides: dict) -> list[dict]:
    base = {
        "who_1": dict(category="WHO", question_text="誰是第一批會實際操作這個 AI 客服的內部人員？"),
        "who_2": dict(category="WHO", question_text="哪些客戶群體最可能拒絕與機器人互動？"),
        "what": dict(category="WHAT", question_text="AI 客服需要涵蓋哪些既有人工客服的服務範圍？"),
        "when": dict(category="WHEN", question_text="什麼時間點導入對旺季營運衝擊最小？"),
        "where": dict(category="WHERE", question_text="哪些既有系統或管道需要串接這個 AI 客服？"),
        "why": dict(category="WHY", question_text="為什麼現有人工客服無法滿足現在的需求？"),
        "how": dict(category="HOW", question_text="導入後如何衡量它是否真的降低了客服負擔？"),
    }
    base.update(overrides)
    return [question_entry(v["category"], v["question_text"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "STARBURST-T-001",
    central_topic: str = CENTRAL_TOPIC,
    questions: list[dict] | None = None,
):
    return generate_starbursting_session(
        session_id,
        central_topic,
        questions if questions is not None else _questions(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(STARBURSTING_SCHEMA, _valid_session(), "starbursting session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID, generate_starbursting_session, "STARBURST-T-INVOKE", CENTRAL_TOPIC, _questions(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.starbursting.contract.yaml")
        self.assertEqual(session["id"], "STARBURST-T-INVOKE")

    def test_empty_catalog_blocks_starbursting_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers. Drops 2 categories (WHY and HOW) so the
        resulting 5-item list ALSO violates the schema's own `minItems: 6` (category-set completeness
        alone, e.g. dropping just 1 of 7 items down to 6, is a runtime-only invariant the schema cannot
        express -- see test_gate_catches_hand_tampered_missing_category for that schema-invisible case)."""
        tampered = copy.deepcopy(_valid_session())
        tampered["questions"] = [q for q in tampered["questions"] if q["category"] not in {"WHY", "HOW"}]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STARBURSTING_SCHEMA, tampered, "tampered session (5 items, below minItems:6, also missing WHY/HOW)")
        gate = evaluate_starbursting_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_a_declarative_statement_smuggled_in_as_question_text(self):
        """The '?'/'？' suffix is ALSO a schema-layer pattern (defense-in-depth, see contract's own
        compilation_decisions) -- a smuggled declarative statement fails schema validation directly."""
        session = _valid_session()
        session["questions"][0] = {**session["questions"][0], "question_text": "第一批操作 AI 客服的內部人員是客服主管"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STARBURSTING_SCHEMA, session, "session with a declarative statement smuggled in")

    def test_schema_rejects_fewer_than_6_questions(self):
        session = _valid_session()
        session["questions"] = session["questions"][:5]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STARBURSTING_SCHEMA, session, "session with only 5 questions")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        porter-five-forces-analysis.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STARBURSTING_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_questions_entry(self):
        session = _valid_session()
        session["questions"][0] = {**session["questions"][0], "priority": "HIGH"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STARBURSTING_SCHEMA, session, "session with a smuggled questions[] key")

    def test_id_is_distinct_from_framing_five_w_one_h_machine_id(self):
        self.assertNotEqual(METHOD_ID, "framing.five_w_one_h")
        self.assertEqual(METHOD_ID, "divergent.starbursting")

    def test_starbursting_and_five_w_one_h_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "framing.five_w_one_h"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.starbursting.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.starbursting contract")


class CategoryVocabularyTests(unittest.TestCase):
    def test_category_names_is_exactly_the_atlas_l385_six(self):
        self.assertEqual(CATEGORY_NAMES, frozenset({"WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STARBURST-")

    def test_question_marks_constant_covers_ascii_and_fullwidth(self):
        self.assertEqual(QUESTION_MARKS, ("?", "？"))

    def test_question_entry_rejects_an_unknown_category(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_UNKNOWN_CATEGORY"):
            question_entry("HOW_MUCH", "這個方案要花多少錢？")

    def test_question_entry_accepts_all_6_categories(self):
        for name in sorted(CATEGORY_NAMES):
            entry = question_entry(name, "這是一個測試問題？")
            self.assertEqual(entry["category"], name)

    def test_question_entry_does_not_leak_extra_keys(self):
        entry = question_entry("WHO", "誰？")
        self.assertEqual(set(entry.keys()), {"category", "question_text"})


class CategoryCoverageTests(unittest.TestCase):
    """Invariant 1 (module docstring): questions must collectively cover all 6 CATEGORY_NAMES at least
    once -- unordered, unbounded-count completeness, the core design-shape invariant."""

    def test_valid_7_questions_across_6_categories_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["questions"]), 7)

    def test_valid_questions_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- unlike framing.five_w_one_h's own positional DIMENSION_ORDER."""
        questions = _questions()
        shuffled = [questions[6], questions[2], questions[0], questions[4], questions[1], questions[5], questions[3]]
        session = generate_starbursting_session("STARBURST-T-SHUFFLED", CENTRAL_TOPIC, shuffled, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({q["category"] for q in session["questions"]}, CATEGORY_NAMES)

    def test_more_than_one_question_per_category_is_accepted(self):
        """Unbounded count is the explicit differentiator from porter_five_forces's exactly-5 -- multiple
        questions per category must not be refused."""
        session = _valid_session()
        who_count = sum(1 for q in session["questions"] if q["category"] == "WHO")
        self.assertEqual(who_count, 2)

    def test_missing_one_category_is_refused(self):
        questions = [q for q in _questions() if q["category"] != "HOW"]
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INCOMPLETE_CATEGORY_COVERAGE"):
            generate_starbursting_session("STARBURST-T-MISSING", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_question_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INVALID_QUESTION_SET"):
            generate_starbursting_session("STARBURST-T-EMPTY", CENTRAL_TOPIC, [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_single_category_repeated_many_times_is_still_refused_for_missing_the_other_5(self):
        questions = [question_entry("WHO", f"問題 {i}？") for i in range(10)]
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INCOMPLETE_CATEGORY_COVERAGE"):
            generate_starbursting_session("STARBURST-T-ONLYWHO", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_questions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INVALID_QUESTION_SET"):
            generate_starbursting_session("STARBURST-T-NONLIST", CENTRAL_TOPIC, "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_category_smuggled_in_via_raw_dict_is_refused(self):
        questions = _questions()[:5] + [{"category": "HOW_MUCH", "question_text": "多少錢？"}]
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_UNKNOWN_CATEGORY"):
            generate_starbursting_session("STARBURST-T-UNKNOWNCAT", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class QuestionTextInvariantTests(unittest.TestCase):
    """Invariant 2 (module docstring): every question_text must be non-empty and literally end with
    '?'/'？' -- the method's own real, checkable differentiator from framing.five_w_one_h."""

    def test_empty_question_text_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": ""}
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_QUESTION_TEXT"):
            generate_starbursting_session("STARBURST-T-EMPTYTEXT", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_question_text_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "   "}
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_QUESTION_TEXT"):
            generate_starbursting_session("STARBURST-T-WSTEXT", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_declarative_statement_without_question_mark_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "第一批操作 AI 客服的內部人員是客服主管"}
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_NOT_A_QUESTION"):
            generate_starbursting_session("STARBURST-T-DECLARATIVE", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_ascii_question_mark_is_accepted(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "Who will operate this?"}
        session = generate_starbursting_session("STARBURST-T-ASCIIQ", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertTrue(session["questions"][0]["question_text"].endswith("?"))

    def test_fullwidth_question_mark_is_accepted(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "誰會操作這個？"}
        session = generate_starbursting_session("STARBURST-T-FULLWIDTHQ", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertTrue(session["questions"][0]["question_text"].endswith("？"))

    def test_trailing_whitespace_after_question_mark_is_still_accepted(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "誰會操作這個？  "}
        session = generate_starbursting_session("STARBURST-T-TRAILWS", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(session["questions"][0]["question_text"], "誰會操作這個？  ")

    def test_question_mark_not_at_the_end_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "question_text": "誰？會操作這個系統"}
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_NOT_A_QUESTION"):
            generate_starbursting_session("STARBURST-T-MIDQ", CENTRAL_TOPIC, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class CentralTopicTests(unittest.TestCase):
    def test_empty_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_CENTRAL_TOPIC"):
            _valid_session(central_topic="")

    def test_whitespace_only_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_CENTRAL_TOPIC"):
            _valid_session(central_topic="   ")

    def test_none_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_CENTRAL_TOPIC"):
            _valid_session(central_topic=None)

    def test_a_real_topic_is_accepted_and_stored_verbatim(self):
        session = _valid_session(central_topic="新產品上市前的定價策略")
        self.assertEqual(session["central_topic"], "新產品上市前的定價策略")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_INVALID_VERSION"):
            generate_starbursting_session("STARBURST-T-002", CENTRAL_TOPIC, _questions(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_starbursting_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_category(self):
        session = copy.deepcopy(_valid_session())
        session["questions"] = [q for q in session["questions"] if q["category"] != "WHY"]
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_question_text(self):
        session = copy.deepcopy(_valid_session())
        session["questions"][0]["question_text"] = ""
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_declarative_statement(self):
        session = copy.deepcopy(_valid_session())
        session["questions"][0]["question_text"] = "客服主管會操作這個系統"
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_central_topic(self):
        session = copy.deepcopy(_valid_session())
        session["central_topic"] = ""
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_starbursting_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_starbursting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    """Record-level provenance ONLY -- no per-question provenance field exists in this shape (see module
    docstring), unlike strategy.porter_five_forces's per-force provenance check."""

    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_missing_provenance_key(self):
        gate = evaluate_provenance_required_gate({"id": "STARBURST-X"}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class DifferentiationFromFiveW1HTests(unittest.TestCase):
    """Proves this method's own design is genuinely distinct from framing.five_w_one_h despite sharing all
    6 category names -- not merely a naming difference (task-mandated differentiation check)."""

    def test_shares_the_identical_6_category_names_with_five_w_one_h(self):
        self.assertEqual(CATEGORY_NAMES, frozenset(FIVE_W1H_DIMENSION_ORDER))

    def test_but_method_ids_are_distinct(self):
        self.assertNotEqual(METHOD_ID, "framing.five_w_one_h")

    def test_starbursting_has_no_known_unknown_status_concept_unlike_five_w_one_h(self):
        """5W1H's own dimension_entry() requires a status of KNOWN/UNKNOWN; Starbursting's question_entry()
        has no such parameter at all -- structurally different shapes, not just different field values."""
        entry = question_entry("WHO", "誰？")
        self.assertNotIn("status", entry)
        self.assertNotIn("answer", entry)
        self.assertNotIn("gap_note", entry)

    def test_starbursting_allows_unbounded_count_unlike_five_w_one_hs_fixed_6(self):
        """5W1H requires EXACTLY 6 dimensions, one each, positionally. Starbursting requires AT LEAST 6,
        covering all 6 categories, but allows arbitrarily more (see CategoryCoverageTests)."""
        session = _valid_session()
        self.assertGreater(len(session["questions"]), len(FIVE_W1H_DIMENSION_ORDER))

    def test_starbursting_question_text_must_be_a_question_five_w_one_h_answer_need_not_be(self):
        """The real, mechanically-checkable differentiator disclosed in the module docstring: every
        Starbursting question_text ends in '?'/'？'; nothing in five_w_one_h's own dimension_entry enforces
        that shape on 'answer' (a 5W1H answer is typically declarative, e.g. a stated fact)."""
        for q in _valid_session()["questions"]:
            self.assertTrue(q["question_text"].rstrip().endswith(QUESTION_MARKS))


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_starbursting_gates_returns_two_gates_in_order(self):
        results = evaluate_starbursting_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "starbursting_integrity"])

    def test_evaluate_starbursting_gates_all_pass_on_a_valid_session(self):
        results = evaluate_starbursting_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.starbursting")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "central_topic", "questions", "provenance"})

    def test_question_entry_rejects_empty_question_text(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_EMPTY_QUESTION_TEXT"):
            question_entry("WHO", "   ")

    def test_question_entry_rejects_declarative_text(self):
        with self.assertRaisesRegex(InvariantViolation, "STARBURSTING_NOT_A_QUESTION"):
            question_entry("WHO", "客服主管會操作這個系統")


if __name__ == "__main__":
    unittest.main()
