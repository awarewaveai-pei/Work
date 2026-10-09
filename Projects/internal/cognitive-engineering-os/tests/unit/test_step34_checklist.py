"""Every line of the five step 3+4 cards is in docs/platform/STEP34_CHECKLIST.md, verbatim, built (with a file:line) or NOT YET
(with a reason). A line that only states background is `context:`, allowed only where the card itself is not asking for anything:
a heading, the opening lines, 解決什麼問題 and 現在有沒有."""

from __future__ import annotations

import re
import unittest

from ai_lego import PRODUCT_ROOT

CARDS = PRODUCT_ROOT / "docs/platform/step34-cards"
CHECKLIST = PRODUCT_ROOT / "docs/platform/STEP34_CHECKLIST.md"
SECTION = "## Card lines (card 80)"
HEADINGS = ("解決什麼問題", "使用者做什麼", "系統做什麼", "AI 能做什麼", "AI 不准做什麼", "讀什麼、絕不讀什麼", "寫什麼", "產出給誰", "來源與不確定性", "人怎麼控制", "資料與版本", "現在有沒有")
CONTEXT_OK = ("", "解決什麼問題", "現在有沒有")   # "" = the opening lines before the first heading
WHERE = re.compile(r"[\w./-]+\.(?:py|tsx?|ya?ml|json|md|mjs):\d+")


def card_lines(text: str) -> list[str]:
    return [line.strip() for line in text.split("\n") if line.strip() and not line.startswith("#")]


def entries(checklist: str, block: str) -> dict[str, str]:
    """card line -> its status, from the `### BLOCK` part of the card-lines section."""
    section = checklist.split(SECTION, 1)[1]
    part = re.split(rf"^### {block}\n", section, maxsplit=1, flags=re.M)[1]
    part = re.split(r"^##+ ", part, maxsplit=1, flags=re.M)[0]
    found = {}
    for line in part.split("\n"):
        if line.startswith("- ") and " => " in line:
            card_line, status = line[2:].rsplit(" => ", 1)
            found[card_line] = status
    return found


def problems(cards: dict[str, str], checklist: str) -> list[str]:
    """What is wrong with the checklist against the card texts ({block: card text}); empty = every line accounted for."""
    wrong = []
    for block, text in cards.items():
        found, section = entries(checklist, block), ""
        for line in card_lines(text):
            status = found.get(line)
            if line in HEADINGS:
                section = line
            if status is None:
                wrong.append(f"{block}: missing from the checklist: {line[:60]}")
            elif status.startswith("built: "):
                if not WHERE.search(status):
                    wrong.append(f"{block}: built without a file:line: {line[:60]}")
            elif status.startswith("NOT YET: "):
                if len(status) < 20:
                    wrong.append(f"{block}: NOT YET without a reason: {line[:60]}")
            elif status.startswith("context: "):
                if section not in CONTEXT_OK and line not in HEADINGS:
                    wrong.append(f"{block}: context outside the places a card only states background ({section}): {line[:60]}")
            else:
                wrong.append(f"{block}: status is none of built / NOT YET / context: {line[:60]}")
        wrong += [f"{block}: the checklist holds a line the card does not: {line[:60]}" for line in found if line not in card_lines(text)]
    return wrong


class Step34ChecklistTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cards = {path.name.removesuffix(".card.txt"): path.read_text(encoding="utf-8") for path in sorted(CARDS.glob("*.card.txt"))}
        self.checklist = CHECKLIST.read_text(encoding="utf-8")

    def test_every_card_line_is_in_the_checklist_built_or_listed(self):
        self.assertEqual(sorted(self.cards), ["COLLAB", "EXPRESS", "FACILITATE", "GOVERN", "TEACH"])
        self.assertEqual(problems(self.cards, self.checklist), [])

    def test_a_copy_missing_one_card_line_fails(self):
        victim = card_lines(self.cards["EXPRESS"])[21]
        copy = "\n".join(line for line in self.checklist.split("\n") if not line.startswith(f"- {victim} => "))
        self.assertNotEqual(copy, self.checklist)
        self.assertEqual(problems(self.cards, copy), [f"EXPRESS: missing from the checklist: {victim[:60]}"])

    def test_a_built_line_without_a_place_and_a_context_line_where_the_card_asks_fail(self):
        asked = card_lines(self.cards["EXPRESS"])[25]   # 「AI 照大綱起草。」 sits under 「AI 能做什麼」
        bare = re.sub(rf"^(- {re.escape(asked)}) => built: .*$", r"\1 => built: nowhere", self.checklist, flags=re.M)
        self.assertEqual(problems(self.cards, bare), [f"EXPRESS: built without a file:line: {asked[:60]}"])
        quiet = re.sub(rf"^(- {re.escape(asked)}) => built: .*$", r"\1 => context: background", self.checklist, flags=re.M)
        self.assertEqual(len(problems(self.cards, quiet)), 1)


if __name__ == "__main__":
    unittest.main()
