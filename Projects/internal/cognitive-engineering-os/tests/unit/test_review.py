import unittest

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.modules.research.review import DEFINITION_PROMPT, fixture_primary_review, fixture_review, locked_definition_from_review, review_code_interactively, reviewed_codebook_definitions
from ai_lego.modules.research.synthetic_fixtures import CODEBOOK_DEFINITIONS, SUGGESTED_LABEL


def _scripted(answers):
    queue = iter(answers)
    return lambda _prompt: next(queue)


class ReviewTests(unittest.TestCase):
    def test_edit_without_locking_is_a_plain_edit(self):
        output = []
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["e", "human_refined_label", "n", ""]), output.append)
        self.assertEqual(review["action"], "EDIT")
        self.assertIsNone(review["definition"])
        self.assertEqual(review["result_label"], "human_refined_label")
        self.assertFalse(review["locked"])
        self.assertIsNone(review["asserted_epistemic_type"])
        self.assertTrue(output)

    def test_edit_then_lock_as_source_fact_produces_accept_and_lock(self):
        """Regression: the prototype's 'l' could only lock the AI-suggested label verbatim; an edited label could not be locked."""
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["e", "human_refined_label", "y", "y", "  what the  participant refined: this  "]), lambda _: None)
        self.assertEqual(review["action"], "ACCEPT_AND_LOCK")
        self.assertEqual(review["definition"], "what the participant refined - this")  # one line, no ': ' (the prompt separator)
        self.assertEqual(review["result_label"], "human_refined_label")
        self.assertTrue(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "SOURCE_FACT")

    def test_lock_without_source_fact_assertion_downgrades_to_accept(self):
        """Locking requires an explicit SOURCE_FACT assertion; declining it must not silently lock anyway."""
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["l", "n", "a definition"]), lambda _: None)
        self.assertEqual(review["action"], "ACCEPT")
        self.assertEqual(review["definition"], "a definition")
        self.assertFalse(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "AI_INFERENCE")

    def test_invalid_and_empty_answers_are_re_prompted(self):
        output = []
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["x", "e", "", "l", "y", ""]), output.append)
        self.assertEqual(review["action"], "ACCEPT_AND_LOCK")
        self.assertEqual(review["result_label"], "suggested_label")
        self.assertTrue(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "SOURCE_FACT")
        self.assertIn("Invalid choice. Enter a, e, l, or r.", output)
        self.assertIn("Replacement label cannot be empty.", output)

    def test_reject_carries_no_label(self):
        prompts = []

        def scripted(prompt):
            prompts.append(prompt)
            return "r"

        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", scripted, lambda _: None)
        self.assertEqual(review["action"], "REJECT")
        self.assertIsNone(review["result_label"])
        self.assertIsNone(review["definition"])
        self.assertNotIn(DEFINITION_PROMPT, prompts)  # a rejected label has no codebook entry to define

    def test_reviewed_codebook_definitions_keeps_only_defined_kept_labels_first_wins(self):
        reviews = [
            {"result_label": "a_b", "definition": "first"},
            {"result_label": "a_b", "definition": "second"},
            {"result_label": "c_d", "definition": None},
            {"result_label": None, "definition": "rejected anyway"},
            {"result_label": "e_f", "definition": "kept"},
        ]
        self.assertEqual(reviewed_codebook_definitions(reviews), {"a_b": "first", "e_f": "kept"})

    def test_fixture_reviewer_defines_only_labels_it_authored(self):
        locked, suggestion = fixture_review({"SRC-1": "models_own_label", "SRC-2": "another_model_label"})
        primary = fixture_primary_review({"SRC-1": "models_own_label"})
        self.assertIsNone(primary["definition"])  # a model's novel label is locked without prose the fixture never wrote
        self.assertEqual(suggestion["definition"], CODEBOOK_DEFINITIONS[SUGGESTED_LABEL])
        self.assertEqual(reviewed_codebook_definitions([primary, suggestion]), {SUGGESTED_LABEL: CODEBOOK_DEFINITIONS[SUGGESTED_LABEL]})
        default_primary = fixture_primary_review()
        self.assertEqual(default_primary["definition"], CODEBOOK_DEFINITIONS[SUGGESTED_LABEL])
        self.assertNotIn("definition", locked)  # the ledger-bound locked code shape is unchanged

    def test_locked_definition_from_review_locks_as_decision_never_as_source_fact(self):
        # Round 14: a definition is the reviewer's own analytic decision about what a label covers, not a
        # claim about the source -- LOCKED_DECISION / DECISION, never LOCKED_FACT / SOURCE_FACT, even though
        # the SAME review locked its code as SOURCE_FACT (asserted_epistemic_type is irrelevant here).
        default_primary = fixture_primary_review()
        record = locked_definition_from_review(default_primary, "DEF-TEST-001")
        self.assertEqual(record, {"definition_id": "DEF-TEST-001", "coder_id": "CODER-1", "label": SUGGESTED_LABEL, "definition": CODEBOOK_DEFINITIONS[SUGGESTED_LABEL], "provenance": {"epistemic_type": "DECISION", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_DECISION"}, "human_action": "ACCEPT_AND_LOCK"})
        self.assertTrue(provenance_is_valid(record["provenance"]))

    def test_locked_definition_from_review_is_none_without_a_definition_or_a_kept_label(self):
        no_definition = fixture_primary_review({"SRC-1": "models_own_label"})
        self.assertIsNone(locked_definition_from_review(no_definition, "DEF-X"))
        rejected = {"result_label": None, "definition": "should never happen but must not crash"}
        self.assertIsNone(locked_definition_from_review(rejected, "DEF-Y"))

    def test_fixture_review_locks_a_source_fact(self):
        locked, suggestion = fixture_review()
        self.assertEqual(locked["provenance"], {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"})
        self.assertEqual(suggestion["action"], "EDIT")


if __name__ == "__main__":
    unittest.main()
