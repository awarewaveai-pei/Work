"""Port of the non-ignored #[test]s for Respace in OwnVoice Meet gemini.rs."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.respace import Respace  # noqa: E402


class RespaceTests(unittest.TestCase):
    def test_glued_words_in_the_live_hypothesis_are_spaced_again(self):
        # Gemini's interim text for one line, as it arrived (OWNVOICE_DEBUG log, 2026-10-17).
        arrived = [
            "and then retire the old built servers",
            "and then retire the old built servers once",
            "and then retire the oldbuild servers once every single",
            "and then retire the oldbuild servers onceevery single team has",
            "and then retire the oldbuild servers once every single team has signed",
            "and then retire the oldbuild servers onceevery single team has signed off on the",
            "and then retire the oldbuild servers onceevery single team has signedoff on the migration checklist",
            "and then retire the oldbuild servers onceevery single team has signedoff on the migrationchecklist that we shared last week.",
        ]
        r = Respace()
        shown = [r.fix(t) for t in arrived]
        self.assertEqual(shown[-1], "and then retire the old build servers once every single team has signed off on the migration checklist that we shared last week.")
        self.assertEqual(shown[2], "and then retire the old build servers once every single")

    def test_ordinary_words_are_not_split(self):
        r = Respace()
        r.fix("they said an other")
        # "an other" stood somewhere else in the line: "another" here is a word of its own.
        self.assertEqual(r.fix("another day, they said an other"), "another day, they said an other")
        self.assertEqual(r.fix("the theory is"), "the theory is")
        r.reset()
        self.assertEqual(r.prev, [])


if __name__ == "__main__":
    unittest.main()
