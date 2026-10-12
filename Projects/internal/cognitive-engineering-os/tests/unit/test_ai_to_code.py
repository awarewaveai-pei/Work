"""Twelve block AI actions are plain code since 2026-10-12 (docs/platform/AI_TO_CODE_AUDIT.md §1, class A): the gate no longer lists them,
no page asks for one, and what they saved before stays a kind the case holds. The code results themselves are tested where the code is:
tests/unit/test_block_verify.py (ledger sentences), test_block_map.py (category -> layer), test_block_govern.py (settings), and in the web
app lib/act.test.ts, components/blocks/ComputePage.test.tsx (explainRun), lib/think.test.ts, mapMethods.test.ts."""

from __future__ import annotations

import re
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.core.domain import doc_kinds
from ai_lego.platform import ai_gate

# (block, action) -> the kind its answers were saved as; the kind stays, so a record saved before still displays
TURNED_INTO_CODE = {
    ("ACT", "trend"): "act.trend", ("ACT", "flag"): "act.flag", ("GOVERN", "explain"): "govern.explanation", ("VERIFY", "summary"): "verify.summary",
    ("VERIFY", "next"): "verify.next", ("MAP", "method"): "map.method_pick", ("MAP", "place"): "map.placement", ("COMPUTE", "explain"): "compute.explanation",
    ("LEARN", "compare"): "learn.compare", ("LEARN", "mirror"): "learn.daily_mirror", ("THINK", "ask_conclusion"): "think.reply", ("THINK", "look_back"): "think.reply",
}
WEB = PRODUCT_ROOT / "apps" / "cognitive-web"


def web_sources():
    return [path for root in ("components", "lib", "app") for path in (WEB / root).rglob("*.ts*") if ".test." not in path.name and "node_modules" not in path.parts]


class TheTwelveAreCodeTests(unittest.TestCase):
    def test_the_gate_lists_none_of_the_twelve_and_the_rest_are_still_there(self):
        listed = ai_gate.actions()
        self.assertEqual(sorted(set(TURNED_INTO_CODE) & set(listed)), [])
        self.assertEqual(len(TURNED_INTO_CODE), 12)
        self.assertEqual(len(listed), 29)   # 41 before

    def test_what_they_saved_before_is_still_a_kind_only_the_ai_wrote(self):
        for key, kind in TURNED_INTO_CODE.items():
            self.assertEqual(doc_kinds.require(kind).authors, frozenset({"ai"}), key)

    def test_no_page_asks_the_ai_for_one_of_them(self):
        for path in web_sources():
            text = path.read_text(encoding="utf-8")
            for block, action in TURNED_INTO_CODE:
                self.assertNotRegex(text, rf'"{block}",\s*"{action}"', f"{path.name} asks for {block}.{action}")
                self.assertNotIn(f"/ai/{block}/{action}", text, path.name)

    def test_every_action_a_page_names_is_one_the_gate_lists(self):
        asked = set()
        for path in web_sources():
            asked |= set(re.findall(r'\bai(?:<[^()]*>)?\((?:null|projectId),\s*"([A-Z_]+)",\s*"(\w+)"', path.read_text(encoding="utf-8")))
        self.assertGreaterEqual(len(asked), 10, asked)   # the scan reads the pages: a pattern that found nothing would pass for nothing
        self.assertEqual(sorted(asked - set(ai_gate.actions())), [])


if __name__ == "__main__":
    unittest.main()
