"""The ten process indicators (card 70; docs/platform/STEP34_SHARED_RULES.md §14; platform/indicators.py): presence facts with
pointers, never a grade. The pure functions on documents of real kinds (a present and an absent case each, the evidence
resolving to a record that exists), the shapes that must never appear (a source scan and a scan of every answer), and the
two read routes on PostgreSQL: only an owner or a current member reads, and a group's list leaves out what its reader has
not unlocked."""

from __future__ import annotations

import ast
import inspect
import itertools
import json
import re
import unittest
import uuid
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain import evidence_words as words
from ai_lego.core.domain.kinds import collab as collab_kinds
from ai_lego.core.domain.kinds.assembler import PACKAGES
from ai_lego.data.events import record_log
from ai_lego.platform import indicators
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.indicators import DERIVED, INDICATORS, LEDGER, PROPOSALS, READS, SCOPES, claims_with_source_share, describe
from tests.unit.test_collab_ai import CollabAiCase
from tests.unit.test_step2_foundation import Step2Case

CARD_ORDER = ["dissent_kept", "reopen_condition_written", "review_held_after_decision", "positions_restated_correctly", "claims_with_source_share",
              "facts_law_values_separate", "assumptions_stated", "evidence_conditions_stated", "ai_trust_calibrated", "modules_chosen_adjusted_or_off_with_reason"]
CASE_OWNER, GROUP_OWNER = "case:p1", "group:g1"
SHORT, LONG = "甲", "我完全不同意這個結論，我認為它一定是錯的，而且大家都該反對它。" * 4
_clock = itertools.count(1)


def doc(kind: str, content: dict[str, Any], *, owner: str = CASE_OWNER, author: str = "user", written_by: str | None = None) -> dict[str, Any]:
    """A document of a real kind as CaseDocs returns it (content checked by the kind's own rules), later than every one made before."""
    n = next(_clock)
    when = f"2026-10-09T{n // 3600:02d}:{n // 60 % 60:02d}:{n % 60:02d}.000000Z"
    return {"doc_id": f"{kind}#{n}", "kind": kind, "version": 1, "content": doc_kinds.validate(kind, content, author), "author": author,
            "block": doc_kinds.require(kind).block, "at": when, "created_at": when, "deleted": False, "owner": owner, **({"written_by": written_by} if written_by else {})}


def records(*docs: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    found: dict[str, list[dict[str, Any]]] = {}
    for item in docs:
        found.setdefault(PROPOSALS if item["kind"].startswith("assembler.proposal.") else item["kind"], []).append(item)
    return found


def line(sentence: str = words.CHECKABLE, *, law: bool = False, support: tuple[str, ...] = (), oppose: tuple[str, ...] = ()) -> dict[str, Any]:
    """One line of the claim ledger as evidence.checked_claims gives it."""
    n = next(_clock)
    return {"claim_id": f"claim{n}", "version": 1, "text": SHORT, "sentence": sentence, "law": law, "state": "查不到", "support": list(support), "oppose": list(oppose),
            "stale": 0, "few": True, "verdict": None, "usable": False}


def ledger(*lines: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return {LEDGER: indicators.stamped_ledger(CASE_OWNER, lines)}


class Reads(dict):
    """The records, noting which kinds a function asked for."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.asked: set[str] = set()

    def get(self, key, default=None):
        self.asked.add(key)
        return super().get(key, default)


def cases(say: str) -> dict[str, tuple[list[dict], list[dict]]]:
    """name -> (records that show it, near misses that do not), every free text being ``say``."""
    g = {"owner": GROUP_OWNER}
    stance = doc("collab.stance", {"option": "o1", "stance": "異議", "reason": say}, written_by="b", **g)
    dissent = doc("collab.dissent", {"option": "o1", "stance_id": stance["doc_id"], "stance_version": 1}, author="system", written_by="b", **g)
    closing = doc("collab.closing", {"why_end": say, "reopen_if": say, "review_on": "2026-12-01", "owner": say}, written_by="a", **g)
    unwritten_closing = doc("collab.closing", {"why_end": say, "reopen_if": "   ", "review_on": "2026-12-01", "owner": say}, written_by="a", **g)
    early_review = doc("collab.review", {"text": say}, written_by="c", **g)
    late_closing = doc("collab.closing", {"why_end": say, "reopen_if": say, "review_on": "2026-12-01", "owner": say}, written_by="a", **g)
    group_decision = doc("collab.closing", {"why_end": say, "reopen_if": say, "review_on": "2026-12-01", "owner": say}, written_by="a", **g)
    group_review = doc("collab.review", {"text": say}, written_by="c", **g)
    judgment = doc("decide.judgment", {"uncertainty": say, "change_condition": say, "confidence": 50, "intensity_now": "中"})
    calibration = doc("learn.calibration", {"judgment_version": 1, "outcome": say})
    old_calibration = doc("learn.calibration", {"judgment_version": 1, "outcome": say})
    late_judgment = doc("decide.judgment", {"uncertainty": say, "change_condition": say, "confidence": 50, "intensity_now": "中"})
    restatement = doc("collab.restatement", {"about": "b", "position": "p1", "text": say}, author="ai", written_by="b", **g)
    right = doc("collab.confirm", {"restatement": restatement["doc_id"], "verdict": "說得對"}, written_by="b", **g)
    wrong = doc("collab.confirm", {"restatement": restatement["doc_id"], "verdict": "說錯了"}, written_by="b", **g)
    by_other = doc("collab.confirm", {"restatement": restatement["doc_id"], "verdict": "說得對"}, written_by="a", **g)
    bare_judgment = doc("decide.judgment", {"uncertainty": say, "change_condition": "沒有", "confidence": 50, "intensity_now": "中"})
    blank_assumption = doc("decide.judgment", {"uncertainty": say, "change_condition": say, "assumptions": "   ", "confidence": 50, "intensity_now": "中"})
    with_assumption = doc("decide.judgment", {"uncertainty": say, "change_condition": say, "assumptions": say, "confidence": 50, "intensity_now": "中"})
    mapped = doc("map.map", {"assumptions": [{"text": say, "by": "user"}]})
    ai_mapped = doc("map.map", {"assumptions": [{"text": say, "by": "ai"}]})
    own_assumption = doc("think.round", {"problem": say, "own": [f"假設或替代解釋：{say}"]})
    label_only = doc("think.round", {"problem": say, "own": ["假設或替代解釋：", "會改變判斷的證據條件：", f"觀察：{say}"]})
    own_condition = doc("think.round", {"problem": say, "own": [f"會改變判斷的證據條件：{say}"]})
    reading = doc("verify.reading", {"readings": [{"claim": "c1", "card": "k1"}]}, author="ai")
    reasoned = doc("verify.stance", {"claim": "c1", "claim_version": 1, "card": "k1", "snapshot": "s1", "stance": "反對", "reading": reading["doc_id"], "reason": say})
    unreasoned = doc("verify.stance", {"claim": "c1", "claim_version": 1, "card": "k1", "snapshot": "s1", "stance": "反對", "reading": reading["doc_id"]})
    ai_card = doc("think.card", {"claim": say, "round": "r1"}, author="ai")
    own_card = doc("think.card", {"claim": say, "round": "r1"})
    reaction = doc("think.reaction", {"card": ai_card["doc_id"], "reaction": "反感", "reason": say})
    reaction_to_own = doc("think.reaction", {"card": own_card["doc_id"], "reaction": "共鳴", "reason": say})
    reaction_nowhere = doc("think.reaction", {"card": "nobody", "reaction": "共鳴", "reason": say})
    adjusted = doc("assembler.intake", {"purpose": "複雜決策", "question": say, "package": "個人複雜決策", "blocks": ["SENSE", "MAP", "DECIDE", "LEARN"]})
    default = doc("assembler.intake", {"purpose": "複雜決策", "question": say, "package": "個人複雜決策", "blocks": list(PACKAGES["個人複雜決策"])})
    unlisted = doc("assembler.intake", {"purpose": "複雜決策", "question": say, "package": "個人複雜決策"})
    proposal = doc("assembler.proposal.decide", {"propose": "COLLAB", "why": "有別人也有決定權"}, author="system")
    answer = doc("assembler.answer", {"proposal": proposal["doc_id"], "answer": "declined"})
    answer_nowhere = doc("assembler.answer", {"proposal": "nobody", "answer": "accepted"})
    fact, law, value = line(), line(law=True), line(words.SENTENCE_KINDS[2])
    return {
        "dissent_kept": ([records(stance, dissent)], [records(dissent), records(stance), records()]),
        "reopen_condition_written": ([records(closing)], [records(unwritten_closing), records()]),
        "review_held_after_decision": ([records(group_decision, group_review), records(judgment, calibration)],
                                       [records(early_review, late_closing), records(closing), records(group_review), records(judgment), records(old_calibration, late_judgment)]),
        "positions_restated_correctly": ([records(restatement, right)], [records(restatement, wrong), records(restatement, by_other), records(restatement), records(right)]),
        "claims_with_source_share": ([ledger(line(support=("o:1",)), line(), line(words.SENTENCE_KINDS[2])), ledger(line(oppose=("o:1",)))], [ledger(line(), line(words.SENTENCE_KINDS[2])), ledger()]),
        "facts_law_values_separate": ([ledger(fact, law, value)], [ledger(fact, law), ledger(fact, value), ledger(law, value), ledger(line(words.SENTENCE_KINDS[1]), fact, law), ledger()]),
        "assumptions_stated": ([records(with_assumption), records(mapped), records(own_assumption)], [records(blank_assumption), records(ai_mapped), records(label_only), records()]),
        "evidence_conditions_stated": ([records(judgment), records(own_condition)], [records(bare_judgment), records(label_only), records()]),
        "ai_trust_calibrated": ([records(reading, reasoned), records(ai_card, reaction)], [records(reading, unreasoned), records(own_card, reaction_to_own), records(reaction_nowhere), records()]),
        "modules_chosen_adjusted_or_off_with_reason": ([records(adjusted), records(proposal, answer)], [records(default), records(unlisted), records(answer_nowhere), records()]),
    }


def pointers(value: Any) -> list[dict[str, str]]:
    return value["evidence"]


def resolves(pointer: dict[str, str], found: dict[str, list[dict[str, Any]]]) -> bool:
    return any(pointer == {"kind": item["kind"], "doc_id": item["doc_id"], "owner": item["owner"]} for items in found.values() for item in items)


class EachIndicatorTests(unittest.TestCase):
    def test_the_ten_are_the_cards_in_its_order_and_each_has_a_present_and_an_absent_case(self):
        self.assertEqual(list(INDICATORS), CARD_ORDER)
        self.assertEqual(list(cases(SHORT)), CARD_ORDER)
        self.assertEqual(words.SENTENCE_KINDS[2], "價值判斷")   # the value sentence the ledger test builds by position
        self.assertEqual(sorted(set(SCOPES["case"]) | set(SCOPES["group"])), sorted(CARD_ORDER))
        self.assertEqual(sorted(kind for kinds in READS.values() for kind in kinds if kind not in DERIVED and kind not in doc_kinds.kinds()), [])

    def test_present_with_pointers_that_resolve_and_absent_without(self):
        for name, (shown, missed) in cases(SHORT).items():
            for found in shown:
                with self.subTest(name=name, case="present"):
                    spy = Reads(found)
                    result = INDICATORS[name](spy)
                    self.assertTrue(result["present"], found)
                    self.assertTrue(pointers(result))
                    self.assertTrue(all(resolves(pointer, found) and set(pointer) == {"kind", "doc_id", "owner"} for pointer in pointers(result)), result)
                    self.assertLessEqual(spy.asked, set(READS[name]))
            for found in missed:
                with self.subTest(name=name, case="absent"):
                    result = INDICATORS[name](found)
                    self.assertEqual((result["present"], result["evidence"]), (False, []))

    def test_claims_with_source_share_is_two_whole_numbers_and_no_percentage(self):
        a, b, c = line(support=("o:1",)), line(oppose=("o:2",)), line(words.SENTENCE_KINDS[2])
        for lines, counts in (((a, b, c), (2, 3)), ((c,), (0, 1)), ((), (0, 0))):
            with self.subTest(counts=counts):
                result = claims_with_source_share(ledger(*lines))
                self.assertEqual((result["with_source"], result["claims"]), counts)
                self.assertTrue(all(type(result[key]) is int for key in ("with_source", "claims")))
                self.assertEqual(set(result), {"present", "evidence", "with_source", "claims"})
        said = describe("case", ledger(a, b, c))
        self.assertIn("3 個主張裡，2 個有來源", [item["sentence"] for item in said["indicators"]])

    def test_the_case_list_and_the_group_list_stay_apart(self):
        for kind in indicators.reads("group"):
            self.assertEqual(doc_kinds.require(kind).owner, "group")
        self.assertTrue(all(kind in DERIVED or doc_kinds.require(kind).owner == "case" for kind in indicators.reads("case")))
        self.assertEqual(sorted(item["id"] for item in describe("group", {})["indicators"]), sorted(SCOPES["group"]))


class ForbiddenShapeTests(unittest.TestCase):
    NAME = re.compile(r"(?<![a-z])(score|rank|ranking|rating|index|grade|overall|percent|percentage|ratio|average|total)s?(?![a-z])", re.I)   # whole words: "calibration" is not "ratio"
    BELIEF = {*collab_kinds.STANCES, *words.STANCES, *words.VERDICTS}

    def source_tree(self) -> ast.Module:
        return ast.parse(Path(indicators.__file__).read_text(encoding="utf-8"))

    def test_the_source_has_no_grade_no_overall_and_never_looks_at_agreement_or_belief(self):
        tree = self.source_tree()
        docstrings = {id(node.body[0].value) for node in ast.walk(tree) if isinstance(node, (ast.Module, ast.FunctionDef)) and node.body
                      and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant)}
        names = []
        for node in ast.walk(tree):
            names += [getattr(node, field) for field in ("id", "arg", "attr", "name") if isinstance(getattr(node, field, None), str)]
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                names.append(node.value)
                self.assertNotIn(node.value, self.BELIEF, "an indicator never reads a stance, a verdict or an agreement")
        self.assertEqual([name for name in names if self.NAME.search(name)], [])
        self.assertNotIn("STANCES", names)

    def test_no_function_takes_a_person_so_no_one_is_compared_with_anyone(self):
        for name, function in INDICATORS.items():
            self.assertEqual(list(inspect.signature(function).parameters), ["records"], name)
        for node in ast.walk(self.source_tree()):
            if isinstance(node, ast.FunctionDef):
                self.assertFalse([arg.arg for arg in node.args.args if re.search(r"identity|viewer|person|member|user|other|who", arg.arg)], node.name)

    def test_every_answer_has_only_facts_pointers_and_no_float(self):
        def walk(value: Any):
            if isinstance(value, dict):
                for key, item in value.items():
                    self.assertIsNone(self.NAME.search(key), key)
                    yield from walk(item)
            elif isinstance(value, list):
                for item in value:
                    yield from walk(item)
            else:
                yield value

        answers = [INDICATORS[name](found) for name, (shown, missed) in cases(SHORT).items() for found in [*shown, *missed]]
        answers += [describe(scope, found) for scope in ("case", "group") for found in ({}, *(found for name, (shown, _) in cases(SHORT).items() for found in shown))]
        for answer in answers:
            leaves = list(walk(answer))
            self.assertFalse([leaf for leaf in leaves if isinstance(leaf, float)])
            self.assertFalse([leaf for leaf in leaves if isinstance(leaf, str) and "%" in leaf])

    def test_wording_changes_nothing_only_whether_something_was_written(self):
        short, long = cases(SHORT), cases(LONG)

        def facts(result: dict[str, Any]) -> tuple:
            return (result["present"], len(result["evidence"]), result.get("with_source"), result.get("claims"))

        for name in CARD_ORDER:
            for (a, b) in zip(short[name][0] + short[name][1], long[name][0] + long[name][1]):
                with self.subTest(name=name):
                    self.assertEqual(facts(INDICATORS[name](a)), facts(INDICATORS[name](b)))


class CaseRouteTests(Step2Case):
    def put(self, kind: str, content: dict[str, Any], author: str = "user") -> str:
        block = doc_kinds.require(kind).block
        writer = {"user": record_log.user(self.identity["identity_id"], block), "ai": record_log.ai(block), "system": record_log.system(block)}[author]
        return self.docs.save(self.tenant_id, self.owner, kind, content, writer)["doc_id"]

    def listed(self, client: TestClient | None = None) -> dict[str, dict[str, Any]]:
        response = (client or self.client).get(f"/projects/{self.pid}/indicators")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["scope"], "case")
        return {item["id"]: item for item in response.json()["indicators"]}

    def test_a_case_with_nothing_written_has_every_fact_absent(self):
        found = self.listed()
        self.assertEqual(list(found), list(SCOPES["case"]))
        self.assertEqual([item["present"] for item in found.values()], [False] * 7)
        self.assertEqual((found["claims_with_source_share"]["with_source"], found["claims_with_source_share"]["claims"]), (0, 0))
        self.assertEqual(found["claims_with_source_share"]["sentence"], indicators.NO_CLAIMS)

    def test_a_case_written_through_the_real_kinds_shows_each_fact_with_pointers_that_resolve(self):
        self.put("decide.judgment", {"uncertainty": "客人會不會續訂還不知道", "change_condition": "三個月後訂閱不到一百人就停", "assumptions": "客人願意先試用", "confidence": 60, "intensity_now": "中"})
        self.put("learn.calibration", {"judgment_version": 1, "outcome": "三個月後有一百二十人訂閱"})
        fact = self.put("verify.claim", {"text": "央行沒有宣布提款上限", "sentence": words.CHECKABLE, "from": "我加的"})
        self.put("verify.claim", {"text": "提款上限依銀行法第 45 條", "sentence": words.CHECKABLE, "law": True, "from": "我加的"})
        self.put("verify.claim", {"text": "不該亂轉傳", "sentence": words.SENTENCE_KINDS[2], "from": "我加的"})
        card = self.card(url="https://a")
        self.group([card])
        reading = self.put("verify.reading", {"readings": [{"claim": fact, "claim_version": 1, "card": card, "reads_as": "支持"}]}, "ai")
        self.put("verify.stance", {"claim": fact, "claim_version": 1, "card": card, "snapshot": self.sha(card), "stance": "支持", "reading": reading, "reason": "原文寫得很清楚"})
        self.put("assembler.intake", {"purpose": "複雜決策", "question": "要不要開第二間店", "package": "個人複雜決策", "blocks": ["SENSE", "MAP", "DECIDE", "LEARN"]})
        response = self.client.get(f"/projects/{self.pid}/indicators")
        found = {item["id"]: item for item in response.json()["indicators"]}
        self.assertEqual({name: item["present"] for name, item in found.items()}, {name: True for name in SCOPES["case"]})
        self.assertEqual((found["claims_with_source_share"]["with_source"], found["claims_with_source_share"]["claims"]), (1, 3))
        for item in found.values():
            for pointer in item["evidence"]:
                self.assertEqual(pointer["owner"], f"case:{self.pid}")
                self.assertIn(pointer["doc_id"], [stored["doc_id"] for stored in self.docs.current(self.tenant_id, self.owner, pointer["kind"])], pointer)
        self.assertNotIn(self.identity["identity_id"], response.text)
        self.assertNotIn("三個月後訂閱不到一百人就停", response.text)   # a pointer, never the person's words

    def test_a_case_that_is_not_yours_answers_as_a_case_that_is_not_there(self):
        self.put("decide.judgment", {"uncertainty": "還不知道", "change_condition": "看三個月", "confidence": 60, "intensity_now": "中"})
        email = f"{uuid.uuid4().hex[:8]}@example.com"
        IdentityStore(self.databases).create_identity(str(uuid.uuid4()), self.tenant_id, email, "另一個人", "correct-horse-battery")
        other = TestClient(api_main.app, base_url="https://testserver")
        self.assertEqual(other.post("/auth/login", json={"tenant_id": self.tenant_id, "email": email, "password": "correct-horse-battery"}).status_code, 200)
        missing = str(uuid.uuid4())
        theirs, nothing = other.get(f"/projects/{self.pid}/indicators"), other.get(f"/projects/{missing}/indicators")
        self.assertEqual((theirs.status_code, nothing.status_code), (404, 404))
        self.assertEqual(theirs.json()["detail"].replace(self.pid, "X"), nothing.json()["detail"].replace(missing, "X"))


class GroupRouteTests(CollabAiCase):
    def listed(self, who: str) -> dict[str, dict[str, Any]]:
        response = self.as_(who).get(f"/groups/{self.group}/indicators")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["scope"], "group")
        return {item["id"]: item for item in response.json()["indicators"]}

    def present(self, who: str) -> dict[str, bool]:
        return {name: item["present"] for name, item in self.listed(who).items()}

    def test_someone_outside_the_group_or_who_left_gets_the_missing_groups_answer(self):
        outsider = self.person("丁")
        missing = str(uuid.uuid4())
        theirs, nothing = self.as_(outsider).get(f"/groups/{self.group}/indicators"), self.as_(outsider).get(f"/groups/{missing}/indicators")
        self.assertEqual((theirs.status_code, nothing.status_code), (404, 404))
        self.assertEqual(theirs.json()["detail"].replace(self.group, "X"), nothing.json()["detail"].replace(missing, "X"))
        self.assertEqual(self.as_(self.c).post(f"/groups/{self.group}/leave").status_code, 200)
        self.assertEqual(self.as_(self.c).get(f"/groups/{self.group}/indicators").status_code, 404)

    def test_a_round_or_an_option_not_unlocked_is_not_counted_for_the_member(self):
        ids = self.positions((self.a, "甲：先做再說"), (self.b, "乙：先談錢"))
        self.turn(self.a, "restate_positions", position=ids[self.b])
        [restated] = self.get(self.b, "collab.restatement")
        self.assertEqual([self.present(who)["positions_restated_correctly"] for who in (self.a, self.b, self.c)], [False, False, False])   # the subject has not answered
        self.post(self.b, "collab.confirm", restatement=restated["doc_id"], verdict="說得對")
        self.assertEqual([self.present(who)["positions_restated_correctly"] for who in (self.a, self.b, self.c)], [True, True, False])   # c wrote no position of that round
        self.post(self.c, "collab.position", round=1, text="丙")
        self.assertTrue(self.present(self.c)["positions_restated_correctly"])
        option = self.option()   # an objection stops the AI's turns until the page shows it, so this part comes second
        self.post(self.b, "collab.stance", option=option, stance="異議", reason="乙反對的理由")
        self.assertEqual([self.present(who)["dissent_kept"] for who in (self.a, self.b, self.c)], [False, True, False])   # a and c have not marked the option
        self.post(self.a, "collab.stance", option=option, stance="同意", reason="甲同意")
        self.assertEqual([self.present(who)["dissent_kept"] for who in (self.a, self.b, self.c)], [True, True, False])

    def test_pointers_resolve_through_the_readers_own_route_and_carry_no_identity_or_words(self):
        option = self.option()
        self.post(self.b, "collab.stance", option=option, stance="異議", reason="乙反對的理由")
        self.post(self.a, "collab.stance", option=option, stance="同意", reason="甲同意")
        self.post(self.a, "collab.closing", why_end="夠了", reopen_if="三個月後數字沒到就重開", review_on="2026-12-01", owner="甲")
        self.post(self.b, "collab.review", text="三個月後回頭看")
        for who in (self.a, self.b):
            response = self.as_(who).get(f"/groups/{self.group}/indicators")
            found = {item["id"]: item for item in response.json()["indicators"]}
            self.assertTrue(all(found[name]["present"] for name in ("dissent_kept", "reopen_condition_written", "review_held_after_decision")))
            for item in found.values():
                for pointer in item["evidence"]:
                    self.assertEqual(pointer["owner"], f"group:{self.group}")
                    self.assertIn(pointer["doc_id"], [stored["doc_id"] for stored in self.get(who, pointer["kind"])], pointer)
            for secret in (self.a, self.b, self.c, "乙反對的理由", "三個月後數字沒到就重開", "三個月後回頭看"):
                self.assertNotIn(secret, response.text)

    def test_the_closing_and_the_review_after_it_show_for_every_member(self):
        self.assertEqual([self.present(who)["reopen_condition_written"] for who in (self.a, self.b, self.c)], [False] * 3)
        self.post(self.a, "collab.closing", why_end="夠了", reopen_if="三個月後數字沒到就重開", review_on="2026-12-01", owner="甲")
        self.assertEqual([(found["reopen_condition_written"], found["review_held_after_decision"]) for found in map(self.present, (self.a, self.b, self.c))], [(True, False)] * 3)
        self.post(self.b, "collab.review", text="三個月後回頭看")
        self.assertEqual([self.present(who)["review_held_after_decision"] for who in (self.a, self.b, self.c)], [True] * 3)


if __name__ == "__main__":
    unittest.main()
