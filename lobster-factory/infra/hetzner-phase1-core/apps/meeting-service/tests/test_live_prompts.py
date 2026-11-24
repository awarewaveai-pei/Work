"""Port of the #[test]s in OwnVoice Meet prompts.rs."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.prompts import listen_user, parse_glossary, system_blocks  # noqa: E402


class PromptsTests(unittest.TestCase):
    def test_an_unfinished_utterance_is_marked_as_such(self):
        self.assertIn("stops mid-sentence", listen_user([], "so the plan is", True))
        self.assertNotIn("mid-sentence", listen_user([], "So the plan is set.", False))

    def test_glossary_skips_comments_and_blanks(self):
        g = parse_glossary("# terms\n季度營收 = quarterly revenue\n\nbad line\n = x\n")
        self.assertEqual(g, [("季度營收", "quarterly revenue")])

    def test_script_is_a_separate_cached_block_only_when_present(self):
        self.assertEqual(len(system_blocks("I", [], "  ")), 1)
        b = system_blocks("I", [], "# Pitch")
        self.assertEqual(len(b), 2)
        self.assertEqual(b[1]["cache_control"]["type"], "ephemeral")


if __name__ == "__main__":
    unittest.main()
