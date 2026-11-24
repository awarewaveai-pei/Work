"""Ported from OwnVoice Meet src-tauri/src/gloss.rs tests (Apache-2.0); the `#[ignore]`d live-API test is left out."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.gloss import is_chinese, merge, parse_answers, plan  # noqa: E402
from lib.live.translate import TranslateError  # noqa: E402

SCRIPT = "# Pitch\n! cue stays\nHello everyone.\n> 大家好。\nThis has no meaning yet.\n我們下週上線。\n```copy:link\nhttps://example.com\nnot a line\n```\nQ: 怎麼貢獻？\n"


class GlossTests(unittest.TestCase):
    def test_plan_finds_only_lines_missing_their_other_half(self):
        n = plan(SCRIPT)
        self.assertEqual(len(n), 3, n)
        self.assertEqual((n[0].text, n[0].to_zh), ("This has no meaning yet.", True))
        self.assertEqual((n[1].text, n[1].to_zh), ("我們下週上線。", False))
        self.assertEqual((n[2].prefix, n[2].text, n[2].to_zh), ("Q: ", "怎麼貢獻？", False))

    def test_merge_keeps_everything_else_and_fills_both_directions(self):
        n = plan(SCRIPT)
        out = merge(SCRIPT, n, ["這還沒有意思。", "We launch next week.", "How do I contribute?"])
        self.assertEqual(
            out,
            "# Pitch\n! cue stays\nHello everyone.\n> 大家好。\nThis has no meaning yet.\n> 這還沒有意思。\nWe launch next week.\n> 我們下週上線。\n```copy:link\nhttps://example.com\nnot a line\n```\nQ: How do I contribute?\n> 怎麼貢獻？\n",
        )
        self.assertEqual(plan(out), [], "nothing left to fill")

    def test_answers_must_match_the_items(self):
        self.assertEqual(parse_answers('```json\n["a","b"]\n```', 2), ["a", "b"])
        with self.assertRaises(TranslateError):
            parse_answers('["a"]', 2)
        with self.assertRaises(TranslateError):
            parse_answers("not json", 1)

    def test_an_answer_is_squeezed_to_one_line(self):
        self.assertEqual(parse_answers('["a\\nb  c", "d"]', 2), ["a b c", "d"])

    def test_english_that_starts_like_script_syntax_fails_the_batch(self):
        for bad in ("# Title", "> quoted", "Q: what", "! cue", "```x"):
            with self.assertRaises(TranslateError, msg=bad):
                parse_answers(f'["{bad}"]', 1, [False])
        self.assertEqual(parse_answers('["# 標題"]', 1, [True]), ["# 標題"])

    def test_mixed_lines_go_by_their_main_language(self):
        self.assertTrue(is_chinese("我們用 Claude Code 安裝"))
        self.assertFalse(is_chinese("Install it in Claude Code, 很快"))


if __name__ == "__main__":
    unittest.main()
