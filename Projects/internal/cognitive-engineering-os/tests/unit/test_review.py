import unittest

from ai_lego.modules.research.review import fixture_review, review_code_interactively


def _scripted(answers):
    queue = iter(answers)
    return lambda _prompt: next(queue)


class ReviewTests(unittest.TestCase):
    def test_edit_without_locking_is_a_plain_edit(self):
        output = []
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["e", "human_refined_label", "n"]), output.append)
        self.assertEqual(review["action"], "EDIT")
        self.assertEqual(review["result_label"], "human_refined_label")
        self.assertFalse(review["locked"])
        self.assertIsNone(review["asserted_epistemic_type"])
        self.assertTrue(output)

    def test_edit_then_lock_as_source_fact_produces_accept_and_lock(self):
        """Regression: the prototype's 'l' could only lock the AI-suggested label verbatim; an edited label could not be locked."""
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["e", "human_refined_label", "y", "y"]), lambda _: None)
        self.assertEqual(review["action"], "ACCEPT_AND_LOCK")
        self.assertEqual(review["result_label"], "human_refined_label")
        self.assertTrue(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "SOURCE_FACT")

    def test_lock_without_source_fact_assertion_downgrades_to_accept(self):
        """Locking requires an explicit SOURCE_FACT assertion; declining it must not silently lock anyway."""
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["l", "n"]), lambda _: None)
        self.assertEqual(review["action"], "ACCEPT")
        self.assertFalse(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "AI_INFERENCE")

    def test_invalid_and_empty_answers_are_re_prompted(self):
        output = []
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["x", "e", "", "l", "y"]), output.append)
        self.assertEqual(review["action"], "ACCEPT_AND_LOCK")
        self.assertEqual(review["result_label"], "suggested_label")
        self.assertTrue(review["locked"])
        self.assertEqual(review["asserted_epistemic_type"], "SOURCE_FACT")
        self.assertIn("Invalid choice. Enter a, e, l, or r.", output)
        self.assertIn("Replacement label cannot be empty.", output)

    def test_reject_carries_no_label(self):
        review = review_code_interactively("TEST-SUG", "SRC-1", "Synthetic text", "suggested_label", _scripted(["r"]), lambda _: None)
        self.assertEqual(review["action"], "REJECT")
        self.assertIsNone(review["result_label"])

    def test_fixture_review_locks_a_source_fact(self):
        locked, suggestion = fixture_review()
        self.assertEqual(locked["provenance"], {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"})
        self.assertEqual(suggestion["action"], "EDIT")


if __name__ == "__main__":
    unittest.main()
