"""「大家怎麼看」 (card 21; docs/platform/STEP34_SHARED_RULES.md §8): the pure rule, no database."""

from __future__ import annotations

import itertools
import json
import unittest
from typing import Any

from ai_lego.platform import rulesets
from ai_lego.platform.collab_agreement import INSUFFICIENT, agreement
from ai_lego.platform.rulesets import collab as collab_rules


def said(stance: str, reason: str = "") -> dict[str, str]:
    return {"stance": stance, "reason": reason or f"理由：{stance}"}


def members(*ids: str, held: tuple[str, ...] = ()) -> list[dict[str, str]]:
    return [{"identity_id": member, "review_state": "pending_review" if member in held else "confirmed"} for member in ids]


# Two camps from earlier rounds: a on one side, b and c on the other.
HISTORY = {"a": {"h1": "同意", "h2": "異議"}, "b": {"h1": "異議", "h2": "同意"}, "c": {"h1": "異議", "h2": "同意"}}
NOW = {
    "a": {"both": said("同意"), "one_camp": said("異議", "a 不要"), "blocked": said("同意")},
    "b": {"both": said("同意"), "one_camp": said("同意"), "blocked": said("同意")},
    "c": {"both": said("同意"), "one_camp": said("同意"), "blocked": said("異議", "c 覺得太快")},
}
# Found by search: under input order instead of member-id order, some orderings split these four differently.
TIE = {"m0": {"o0": said("同意"), "o1": said("異議"), "o2": said("異議")}, "m1": {"o0": said("同意"), "o1": said("同意")},
       "m2": {"o0": said("同意"), "o1": said("同意"), "o2": said("異議")}, "m3": {"o1": said("異議"), "o2": said("同意")}}


def numbers(value: Any) -> list[Any]:
    if isinstance(value, dict):
        return [found for item in value.values() for found in numbers(item)]
    if isinstance(value, list):
        return [found for item in value for found in numbers(item)]
    return [value] if isinstance(value, (int, float)) and not isinstance(value, bool) else []


class AgreementTests(unittest.TestCase):
    def test_an_option_both_camps_accept_is_agreed_one_camp_only_is_not_and_one_objection_blocks(self):
        answer = agreement(NOW, HISTORY, members("a", "b", "c"))
        self.assertFalse(answer["insufficient"])
        self.assertEqual({option: row["agreed_across"] for option, row in answer["options"].items()}, {"both": True, "one_camp": False, "blocked": False})
        self.assertEqual(answer["options"]["blocked"]["objections"], ["c 覺得太快"])
        self.assertEqual(answer["options"]["one_camp"]["objections"], ["a 不要"])

    def test_an_objection_never_lets_an_option_show_as_agreed(self):
        now = {member: {"both": said("同意")} for member in "abc"}
        self.assertTrue(agreement(now, HISTORY, members("a", "b", "c"))["options"]["both"]["agreed_across"])
        now["b"]["both"] = said("異議", "b 反對")
        row = agreement(now, HISTORY, members("a", "b", "c"))["options"]["both"]
        self.assertEqual((row["agreed_across"], row["objections"]), (False, ["b 反對"]))

    def test_the_heaviest_raters_are_left_out_of_the_second_table_from_ten_members_on(self):
        ids = [f"m{n}" for n in range(10)]
        history = {member: ({"h1": "同意", "h2": "異議"} if n < 5 else {"h1": "異議", "h2": "同意"}) for n, member in enumerate(ids)}
        history["m9"].update({"e1": "異議", "e2": "異議", "e3": "異議"})   # m9 marked the most
        now = {"m0": {"q": said("同意")}, "m9": {"q": said("同意")}}
        answer = agreement(now, history, members(*ids))
        self.assertTrue(answer["options"]["q"]["agreed_across"])
        self.assertTrue(answer["heaviest_left_out"])
        self.assertFalse(answer["without_heaviest"]["options"]["q"]["agreed_across"])
        nine = agreement({key: value for key, value in now.items()}, history, members(*ids[1:]))   # under ten: nobody is left out
        self.assertFalse(nine["heaviest_left_out"])
        self.assertEqual(nine["without_heaviest"], {key: nine[key] for key in ("insufficient", "options")})

    def test_held_members_are_left_out_and_listed(self):
        now = {**NOW, "d": {"both": said("異議", "d 是新帳號")}}
        answer = agreement(now, {**HISTORY, "d": {"h1": "同意"}}, members("a", "b", "c", "d", held=("d",)))
        self.assertEqual(answer["held"], ["d"])
        self.assertTrue(answer["options"]["both"]["agreed_across"])
        self.assertNotIn("d 是新帳號", json.dumps(answer, ensure_ascii=False))

    def test_too_few_members_or_options_or_no_difference_says_so_and_shows_nothing_agreed(self):
        cases = [
            (NOW, HISTORY, members("a", "b")),                                                    # two members
            ({member: {"x": said("同意")} for member in "abc"}, {}, members("a", "b", "c")),       # one option only
            ({member: {"x": said("同意"), "y": said("同意")} for member in "abc"}, {}, members("a", "b", "c")),   # nobody differs
            (NOW, HISTORY, members("a", "b", "c", held=("b",))),                                   # two counted
        ]
        for now, history, group in cases:
            with self.subTest(group=group):
                answer = agreement(now, history, group)
                self.assertEqual((answer["insufficient"], answer["why"]), (True, INSUFFICIENT))
                self.assertNotIn("options", answer)
                self.assertNotIn("agreed_across", json.dumps(answer))

    def test_the_same_input_gives_the_same_answer_in_any_order(self):
        group = members("m0", "m1", "m2", "m3")
        first = agreement(TIE, {}, group)
        self.assertEqual(first, agreement(TIE, {}, group))
        for order in itertools.permutations(range(4)):
            shuffled_members = [group[index] for index in order]
            shuffled = {f"m{index}": TIE[f"m{index}"] for index in order}
            self.assertEqual(agreement(shuffled, {}, shuffled_members), first, order)

    def test_nothing_numeric_ranks_in_the_answer(self):
        for answer in (agreement(NOW, HISTORY, members("a", "b", "c")), agreement(TIE, {}, members("m0", "m1", "m2", "m3"))):
            self.assertEqual(numbers(answer), [])
            self.assertNotRegex(json.dumps(answer), r"(?i)count|votes?|tally|total|score|rank|percent|majority")

    def test_the_rule_is_a_versioned_ruleset(self):
        rule = rulesets.require("collab.agreement")
        self.assertEqual(rule.version, collab_rules.AGREEMENT.version)
        self.assertIn("還不夠看出誰跟誰不同", json.dumps(rule.items, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
