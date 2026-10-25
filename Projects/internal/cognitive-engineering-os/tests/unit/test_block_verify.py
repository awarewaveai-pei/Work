"""VERIFY 查證主張 (contract card; docs/platform/STEP2_SHARED_RULES.md): a pasted message waits for the person's first
reaction; claims are the person's (the AI proposes); only the person's stance counts; fact-check databases are sources,
never the platform's verdict, and collect asks them (the engine reaches nothing outside); 「去查」 is one collection run
per claim; the AI stops under two independent origins."""

from __future__ import annotations

import hashlib
import json
import re
import unittest
import uuid
from unittest import mock

import psycopg

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.apps.api.blocks import docs as docs_route
from ai_lego.apps.api.blocks import verify as verify_route
from ai_lego.core.domain import doc_kinds, evidence_words as words
from ai_lego.core.domain.kinds import verify as kinds_verify
from ai_lego.core.domain.kinds.verify import SEARCH_ANGLES, SPREAD_KEYS, claim_key
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, block_hooks, integrity
from ai_lego.platform.block_hooks import verify as hooks
from ai_lego.apps.api.blocks.verify import NO_ATTRIBUTION
from ai_lego.platform.block_hooks.verify import hit_address
from ai_lego.core.domain.source import COLLECTED_PROVENANCE, source_record
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.platform.net import collect_lookups
from ai_lego.platform.rulesets.verify import TECHNIQUES
from tests.unit.test_api_collections import REPORT, CollectionApiTestCase
from tests.unit.test_api_ingest import c1
from tests.unit.test_block_foundation import MirrorProvider
from tests.pg import PgTestCase
from tests.unit.test_step2_foundation import Step2Case

MESSAGE = "【緊急】央行宣布下週起每天只能領一萬元！不轉就來不及，快轉給家人！"
CLAIM = "央行宣布下週起每天只能領一萬元"
PAGE = "央行新聞稿：本行從未宣布每日提款上限，下週起提款規定不變。"
CHECKABLE = words.CHECKABLE


# Collect's lookups (specs/wire/lookup.v1.json): the engine's tests read the same examples next-admin answers with.
CONTRACT = json.loads((PRODUCT_ROOT / "specs" / "wire" / "lookup.v1.json").read_text(encoding="utf-8"))
SPEC_ANSWER = CONTRACT["examples"]["factcheck"]["answer"]
COFACTS_ATTRIBUTION = SPEC_ANSWER["items"][0]["dbs"][1]["attribution"]
CLAIMREVIEW_ATTRIBUTION = SPEC_ANSWER["items"][0]["dbs"][0]["attribution"]
HIT_CLAIM = SPEC_ANSWER["items"][0]["dbs"][0]["hits"][0]["claim"]   # the claim the checker reviewed: read from the contract, never retyped
COFACTS_FOUND = {"db": "cofacts", "state": "查到", "attribution": COFACTS_ATTRIBUTION, "hits": [
    {"article_id": "a1", "url": "https://cofacts.tw/article/a1", "date": "2026-09-30",
     "replies": [{"judged_as": "含有不實訊息", "text": "央行澄清：沒有每日提款上限。", "reference": "https://www.cbc.gov.tw/news/1", "date": "2026-09-30"}]},
    {"article_id": "a2", "url": "https://cofacts.tw/article/a2", "date": "2026-09-30", "replies": []}]}
NOTHING_FOUND = {"kind": "factcheck", "items": [{"text": "", "dbs": [
    {"db": "claimreview", "state": "查不到", "why": "資料檔裡沒有相近的查核", "attribution": CLAIMREVIEW_ATTRIBUTION, "hits": []},
    {"db": "cofacts", "state": "查不到", "why": "Cofacts 沒有相近的訊息", "attribution": COFACTS_ATTRIBUTION, "hits": []}]}]}


def channels(**states):
    """Every channel 「去查」 plans (serper and brave, zh and en) as the run's end reports it: ok unless named."""
    return [{"provider": provider, "lang": lang, "state": states.get(provider, "ok"), "why": ""} for provider in ("serper", "brave") for lang in ("zh", "en")]


def answer_with(**entries):
    """The spec's factcheck answer with some databases' entries replaced."""
    answer = json.loads(json.dumps(SPEC_ANSWER))
    answer["items"][0]["dbs"] = [entries.get(entry["db"], entry) for entry in answer["items"][0]["dbs"]]
    return answer


class Lookups:
    """Collect's lookups endpoint as a fake ``CollectionServiceClient.lookup``: answers with the asked text echoed and,
    when the request names databases (``dbs``), only those (lookup.v1)."""

    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.calls, self.dbs = answer, error, [], []

    def lookup(self, project_id, kind, items, timeout, dbs=None):
        self.calls.append((project_id, kind, items))
        self.dbs.append(dbs)
        if self.error:
            raise self.error
        answer = json.loads(json.dumps(self.answer))
        for item, asked in zip(answer.get("items") or [], items):
            item["text"] = asked["text"]
            if dbs is not None:
                item["dbs"] = [entry for db in dbs for entry in item["dbs"] if entry["db"] == db]
        return answer


class VerifyCase(Step2Case):
    def setUp(self):
        super().setUp()
        self.provider = MirrorProvider({})
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self.base = f"/projects/{self.pid}"
        self.lookups = Lookups(NOTHING_FOUND)
        api_main.app.dependency_overrides[api_main.get_collection_service] = lambda: self.lookups

    def post(self, path, body, status=200):
        response = self.client.post(f"{self.base}{path}", json=body)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def message(self, text=MESSAGE, form="訊息", url=None):
        return self.post("/verify/messages", {"text": text, "form": form, **({"url": url} if url else {})})

    def first(self, message, reaction="有點慌", confidence=60):
        return self.post("/docs/verify.first", {"content": {"message": message, "reaction": reaction, "confidence": confidence}})

    def opened(self):
        mid = self.message()["doc_id"]
        self.first(mid)
        return mid

    def claim(self, text=CLAIM, sentence=CHECKABLE, message=None, source="我加的", **more):
        content = {"text": text, "sentence": sentence, "from": "訊息" if message else source, **({"message": message} if message else {}), **more}
        return self.post("/docs/verify.claim", {"content": content})

    def ai(self, action, context, answer=None, status=200):
        self.provider.answer = answer or {}
        return self.post(f"/ai/VERIFY/{action}", {"context": context}, status)

    def grant(self, *permissions):
        self.post("/docs/collab_contract.terms", {"content": {"permissions": list(permissions)}})

    def current(self, kind):
        return self.docs.current(self.tenant_id, self.owner, kind)

    def ledger(self):
        return {line["claim_id"]: line for line in self.client.get(f"{self.base}/verify/ledger").json()["claims"]}

    def page(self, text=PAGE):
        """A stored page and GATHER's card for it -- one card per stored page; a second, made-up card would be a state the
        system never reaches (it made AI citations fail against the other card once GATHER ran on arrival)."""
        sid = self.source(text, "央行新聞稿")
        [card] = [doc["doc_id"] for doc in self.docs.current(self.tenant_id, self.owner, "gather.source") if doc["content"]["source_id"] == sid]
        return sid, card

    def a_rumour_is_quoted_not_a_crisis(self, action, answer, kind):
        """P1 (Codex, an earlier pass, F2): a pasted rumour that mentions 自殺 is someone else's words -- the gate quotes the
        stored message after its crisis check (AiAction.quoted), fenced; the person's own words still stop the turn."""
        rumour = "網傳：有人因為提款限制自殺了，快轉給家人！"
        mid = self.message(rumour)["doc_id"]
        self.first(mid)
        saved = self.ai(action, {"message": mid}, answer)
        self.assertEqual((saved.get("saved") or {}).get("kind"), kind, saved)
        self.assertRegex(self.provider.calls[-1][1], r"<<<QUOTED 1 BEGIN (\w{16,})>>>\n\[1\] 要查的訊息\n---\n" + re.escape(rumour) + r"\n<<<QUOTED 1 END \1>>>")
        self.assertEqual(self.current("govern.stop"), [])
        self.post("/docs/collab_contract.terms", {"content": {"basis": "我不想活了"}})
        calls = len(self.provider.calls)
        self.assertEqual((self.ai(action, {"message": mid}, answer)["stopped"], len(self.provider.calls)), ("crisis", calls))


class FirstReactionTests(VerifyCase):
    def test_nothing_about_a_message_is_looked_up_shown_or_asked_before_the_first_reaction(self):
        """寫完第一反應，才看系統查到什麼: every result route and AI turn of that message is refused until it exists."""
        mid = self.message()["doc_id"]
        refused = [
            self.client.post(f"{self.base}/verify/factcheck", json={"message": mid}),
            self.client.post(f"{self.base}/ai/VERIFY/split", json={"context": {"message": mid}}),
            self.client.post(f"{self.base}/ai/VERIFY/techniques", json={"context": {"message": mid}}),
            self.client.post(f"{self.base}/docs/verify.claim", json={"content": {"text": CLAIM, "sentence": CHECKABLE, "from": "訊息", "message": mid}}),
            self.client.post(f"{self.base}/docs/verify.seen", json={"content": {"message": mid, "about": "spread", "text": "家族群組裡看到"}}),
        ]
        self.assertEqual([(response.status_code, "VERIFY_FIRST_REACTION_REQUIRED" in response.text) for response in refused], [(400, True)] * len(refused))
        self.assertEqual((self.provider.calls, self.lookups.calls, self.current("verify.factcheck"), self.current("verify.spread")), ([], [], [], []))
        self.first(mid)
        saved = self.ai("split", {"message": mid}, {"claims": [{"text": CLAIM, "sentence": CHECKABLE}]})["saved"]
        self.assertEqual(saved["kind"], "verify.split")
        self.assertEqual(self.post("/verify/factcheck", {"message": mid})["kind"], "verify.factcheck")

    def test_a_claim_of_a_message_without_a_first_reaction_reaches_no_turn(self):
        """A claim slipped in before the gate existed still gates every turn about it."""
        mid = self.message()["doc_id"]
        self.docs.save(self.tenant_id, self.owner, "verify.claim", {"text": CLAIM, "sentence": CHECKABLE, "from": "訊息", "message": mid}, record_log.user(self.identity["identity_id"], "VERIFY"))
        self.grant("search_external")
        for action in ("read",):
            response = self.client.post(f"{self.base}/ai/VERIFY/{action}", json={"context": {}})
            self.assertIn("VERIFY_FIRST_REACTION_REQUIRED", response.text, action)
        self.assertEqual(self.provider.calls, [])

    def test_a_claim_of_a_message_without_a_first_reaction_reaches_no_route_either(self):
        """The claim's own routes re-check the message's first reaction: look-up, 「去查」, a stance, a verdict."""
        mid = self.message()["doc_id"]
        cid = self.docs.save(self.tenant_id, self.owner, "verify.claim", {"text": CLAIM, "sentence": CHECKABLE, "from": "訊息", "message": mid}, record_log.user(self.identity["identity_id"], "VERIFY"))["doc_id"]
        card = self.card()
        refused = [
            self.client.post(f"{self.base}/verify/factcheck", json={"claim": cid}),
            self.client.post(f"{self.base}/verify/claims/{cid}/search", json={"confirm": False}),
            self.client.post(f"{self.base}/verify/stances", json={"content": {"claim": cid, "claim_version": 1, "card": card, "snapshot": self.sha(card), "stance": "反對"}}),
            self.client.post(f"{self.base}/docs/verify.verdict", json={"content": {"claim": cid, "claim_version": 1, "verdict": "存疑", "reason": "x"}}),
        ]
        self.assertEqual([(response.status_code, "VERIFY_FIRST_REACTION_REQUIRED" in response.text) for response in refused], [(400, True)] * 4)
        self.assertEqual(self.lookups.calls, [])

    def test_the_first_reaction_is_written_once_and_kept(self):
        mid = self.message()["doc_id"]
        first = self.first(mid)
        again = self.client.post(f"{self.base}/docs/verify.first", json={"content": {"message": mid, "reaction": "其實還好", "confidence": 20}})
        changed = self.client.put(f"{self.base}/docs/verify.first/{first['doc_id']}", json={"content": {"message": mid, "reaction": "其實還好", "confidence": 20}, "base_version": 1})
        gone = self.client.delete(f"{self.base}/docs/verify.first/{first['doc_id']}")
        self.assertEqual((again.status_code, changed.status_code, gone.status_code), (409, 400, 400))
        self.assertIn("VERIFY_FIRST_REACTION_FIXED", changed.text)
        self.assertEqual(self.client.post(f"{self.base}/docs/verify.first", json={"content": {"message": "nope", "reaction": "x", "confidence": 1}}).status_code, 404)

    def test_the_first_reaction_writes_what_the_platform_cannot_check_about_how_it_spread(self):
        mid = self.opened()
        [spread] = self.current("verify.spread")
        self.assertEqual((spread["author"], sorted(spread["content"]["cells"])), ("system", sorted(SPREAD_KEYS)))
        self.assertEqual({cell["state"] for cell in spread["content"]["cells"].values()}, {words.UNCHECKABLE})
        self.assertEqual(spread["content"]["cells"]["coordinated"]["why"], "平台沒有接社群平台的資料")
        hooks._first_saved(self.docs, self.tenant_id, self.owner, self.current("verify.first")[0])
        self.assertEqual(len(self.current("verify.spread")), 1)
        seen = self.post("/docs/verify.seen", {"content": {"message": mid, "about": "coordinated", "text": "兩小時內好幾個群組都在傳"}})
        self.assertEqual(seen["author"], "user")


class MessageTests(VerifyCase):
    def test_a_message_is_stamped_and_kept_as_it_was(self):
        saved = self.message()
        self.assertEqual(saved["content"]["sha256"], hashlib.sha256(MESSAGE.encode("utf-8")).hexdigest())
        forged = self.client.post(f"{self.base}/docs/verify.message", json={"content": {"text": MESSAGE, "form": "訊息", "sha256": "0" * 64}})
        edited = self.client.put(f"{self.base}/docs/verify.message/{saved['doc_id']}", json={"content": {**saved["content"], "text": "改過"}, "base_version": 1})
        link = self.client.post(f"{self.base}/verify/messages", json={"text": "看這個", "form": "連結"})
        self.assertEqual([(response.status_code, code in response.text) for response, code in ((forged, "VERIFY_MESSAGE_STAMP_INVALID"), (edited, "VERIFY_MESSAGE_FIXED"), (link, "VERIFY_MESSAGE_LINK_REQUIRED"))],
                         [(400, True)] * 3)
        self.assertEqual(self.message("看這個", "連結", "https://example.org/x")["content"]["url"], "https://example.org/x")

    def test_a_crisis_word_in_a_pasted_message_brings_help(self):
        self.assertEqual([notice["type"] for notice in self.message("他說他不想活了，大家快轉")["notices"]][:1], ["crisis"])

    def test_the_message_is_never_a_source(self):
        """A message stored as a source would support itself with an exact quote (rules §4)."""
        mid = self.opened()
        self.client.post("/me/docs/govern.location", json={"content": {"where": "台北"}})
        self.lookups.answer = answer_with(cofacts=COFACTS_FOUND)
        with mock.patch.object(block_hooks, "after_sources"):
            self.post("/verify/factcheck", {"message": mid})
        sources = self._repo.list_sources(self.tenant_id, self.pid)
        self.assertEqual(len(sources), 2)   # the TFC review and the answered Cofacts article; the message is none of them
        self.assertNotIn(hashlib.sha256(MESSAGE.encode("utf-8")).hexdigest(), {source["content_sha256"] for source in sources})
        for source in sources:
            text = self._source_cas.read(self.tenant_id, self._repo.get_source_content_reference(self.tenant_id, self.pid, source["source_id"])).decode("utf-8")
            self.assertNotIn("不轉就來不及", text)


class SplitAndClaimTests(VerifyCase):
    def test_a_claim_is_the_messages_own_words_the_ais_remark_never_enters_its_text(self):
        """2026-10-12 walk: claims came back as 「…（未註明出處，無可查來源，法律內容需由律師確認）」 and every web query carried the note. A bracketed
        group the message does not contain is the AI's remark: cut from the text (a note field is where it may go, and it is not kept)."""
        mid = self.opened()
        remark = "（未註明出處，無可查來源，法律內容需由律師確認）"
        split = self.ai("split", {"message": mid}, {"claims": [
            {"text": CLAIM + remark, "sentence": CHECKABLE, "law": True, "note": "法律內容需由律師確認"},
            {"text": "【緊急】央行宣布下週起每天只能領一萬元", "sentence": CHECKABLE},   # brackets the message itself has stay
            {"text": "快轉給家人 [註: 無來源] (AI 提醒)", "sentence": "叫你去做的事"},
            {"text": "央行宣布,下週起每天只能領一萬元", "sentence": CHECKABLE},   # the message's own punctuation is not re-typeset
            {"text": remark, "sentence": CHECKABLE},   # nothing left once the remark is cut: no claim
            {"text": "此訊息聲稱" + CLAIM, "sentence": CHECKABLE},   # no bracket, but words of the AI's own: not the message's claim
            {"text": "央行下週起每天限領一萬元", "sentence": CHECKABLE}]})["saved"]   # reworded: not as the message states it
        self.assertEqual([item["text"] for item in split["content"]["claims"]], [CLAIM, "【緊急】央行宣布下週起每天只能領一萬元", "快轉給家人", "央行宣布,下週起每天只能領一萬元"])
        self.assertTrue(all(set(item) == {"text", "sentence", "law"} for item in split["content"]["claims"]))
        action = ai_gate.actions()[("VERIFY", "split")]
        self.assertIn("note", action.output_schema["properties"]["claims"]["items"]["properties"])
        self.assertIn("text is copied from the message", action.instructions)

    def test_the_ai_proposes_a_split_and_only_my_confirmation_makes_a_claim(self):
        mid = self.opened()
        split = self.ai("split", {"message": mid}, {"message": "someone-else", "claims": [
            {"text": CLAIM, "sentence": CHECKABLE, "law": False}, {"text": "快轉給家人", "sentence": "叫你去做的事"}, {"text": "亂寫的", "sentence": "不存在"}]})["saved"]
        self.assertEqual((split["author"], split["content"]["message"], [item["sentence"] for item in split["content"]["claims"]]), ("ai", mid, [CHECKABLE, "叫你去做的事"]))
        self.assertEqual(self.current("verify.claim"), [])
        claim = self.claim(message=mid, proposal=f"{split['doc_id']}#0")
        self.assertEqual((claim["author"], claim["content"]["proposal"]), ("user", f"{split['doc_id']}#0"))
        wrong = self.client.post(f"{self.base}/docs/verify.claim", json={"content": {"text": CLAIM, "sentence": CHECKABLE, "from": "訊息", "message": mid, "proposal": f"{split['doc_id']}#9"}})
        self.assertIn("VERIFY_CLAIM_FROM_INVALID", wrong.text)
        other = self.message("另一則：銀行下週停止營業")["doc_id"]
        self.first(other)
        borrowed = self.client.post(f"{self.base}/docs/verify.claim", json={"content": {"text": CLAIM, "sentence": CHECKABLE, "from": "訊息", "message": other, "proposal": f"{split['doc_id']}#0"}})
        self.assertIn("VERIFY_CLAIM_FROM_INVALID", borrowed.text)   # a proposal of another message's split

    def test_a_claim_from_map_names_a_fact_or_law_claim_of_the_map(self):
        self.post("/docs/map.map", {"content": {"claims": [{"id": "c1", "text": "公會改了合約範本", "kind": "事實", "by": "user"}, {"id": "c2", "text": "公會不該這樣", "kind": "價值", "by": "user"}]}})
        self.assertEqual(self.claim("公會改了合約範本", source="MAP", map_claim="c1")["content"]["from"], "MAP")
        for map_claim in ("c2", "c9"):
            response = self.client.post(f"{self.base}/docs/verify.claim", json={"content": {"text": "x", "sentence": CHECKABLE, "from": "MAP", "map_claim": map_claim}})
            self.assertIn("VERIFY_CLAIM_FROM_INVALID", response.text, map_claim)

    def test_changing_a_claim_says_why_and_keeps_where_it_came_from(self):
        """你可以改拆法、補主張；你改的時候，要留下理由."""
        claim = self.claim()
        put = lambda content, version: self.client.put(f"{self.base}/docs/verify.claim/{claim['doc_id']}", json={"content": content, "base_version": version})   # noqa: E731
        self.assertIn("VERIFY_CLAIM_REASON_REQUIRED", put({**claim["content"], "text": "央行宣布每天只能領兩萬元"}, 1).text)
        self.assertEqual(put({**claim["content"], "text": "央行宣布每天只能領兩萬元", "reason": "原文是兩萬"}, 1).status_code, 200)
        self.assertIn("VERIFY_CLAIM_REASON_REQUIRED", put({**claim["content"], "text": "央行宣布每天只能領三萬元", "reason": "原文是兩萬"}, 2).text)
        self.assertIn("VERIFY_CLAIM_FIXED", put({**claim["content"], "from": "MAP", "reason": "x"}, 2).text)

    def test_changing_a_claims_law_details_or_other_reading_says_why_too(self):
        """Unticking 法律 would drop 未確認 silently; writing the other reading changes what the claim stands for."""
        claim = self.claim("提款上限依銀行法", law=True, jurisdiction="台灣")
        put = lambda content: self.client.put(f"{self.base}/docs/verify.claim/{claim['doc_id']}", json={"content": content, "base_version": 1})   # noqa: E731
        for change in ({"law": False}, {"jurisdiction": "日本"}, {"law_source": "銀行法第 45 條"}, {"alternative": "可能只是一家銀行的規定"}):
            self.assertIn("VERIFY_CLAIM_REASON_REQUIRED", put({**claim["content"], **change}).text, change)
        self.assertEqual(put({**claim["content"], "law_source": "銀行法第 45 條", "reason": "補上條文"}).status_code, 200)

    def test_a_rumour_mentioning_suicide_is_split_and_my_own_words_still_stop_it(self):
        self.a_rumour_is_quoted_not_a_crisis("split", {"claims": [{"text": "有人因為提款限制自殺了", "sentence": CHECKABLE}]}, "verify.split")


class TechniquesTests(VerifyCase):
    def test_a_technique_is_named_only_with_the_messages_own_words(self):
        mid = self.opened()
        saved = self.ai("techniques", {"message": mid}, {"techniques": [{"name": "情緒勒索", "quote": "不轉就來不及", "why": "用時間壓力逼你"}, {"name": "不在清單上", "quote": "不轉就來不及", "why": "x"}],
                                                         "asks": [{"what": "轉傳", "quote": "不轉就來不及，快轉給家人"}]})["saved"]
        self.assertEqual([item["name"] for item in saved["content"]["techniques"]], ["情緒勒索"])
        self.assertEqual((saved["content"]["asks"][0]["what"], saved["content"]["rules"]), ("轉傳", TECHNIQUES.stamp()))
        self.provider.answer = {"techniques": [{"name": "冒充來源", "quote": "央行總裁親口說的", "why": "x"}], "asks": []}
        response = self.client.post(f"{self.base}/ai/VERIFY/techniques", json={"context": {"message": mid}})
        self.assertEqual(response.status_code, 422)
        self.assertIn("AI_ANSWER_INVALID", response.text)
        self.assertEqual(len(self.current("verify.techniques")), 1)   # a made-up quote saves nothing
        self.provider.answer = {"techniques": [], "asks": [{"what": "捐款", "quote": "請大家捐款給央行"}]}
        self.assertIn("AI_ANSWER_INVALID", self.client.post(f"{self.base}/ai/VERIFY/techniques", json={"context": {"message": mid}}).text)
        short = self.ai("techniques", {"message": mid}, {"techniques": [{"name": "情緒勒索", "quote": "不轉就來不及", "why": "x"}], "asks": [{"what": "轉傳", "quote": "快轉給"}]})["saved"]
        self.assertEqual(([item["name"] for item in short["content"]["techniques"]], short["content"].get("asks")), (["情緒勒索"], None))   # 3 characters prove nothing; the rest is kept

    def test_a_rumour_mentioning_suicide_is_read_for_techniques_and_my_own_words_still_stop_it(self):
        self.a_rumour_is_quoted_not_a_crisis("techniques", {"techniques": [], "asks": [{"what": "轉傳", "quote": "快轉給家人！"}]}, "verify.techniques")


class ReadingTests(VerifyCase):
    def setUp(self):
        super().setUp()
        self.mid = self.opened()
        self.cid = self.claim(message=self.mid)["doc_id"]
        self.sid, self.cardid = self.page()
        self.group([self.cardid])

    def reading(self, **changes):
        return {"claim": self.cid, "card": self.cardid, "reads_as": "反對", "quote": "本行從未宣布每日提款上限", "citations": [f"source:{self.sid}"], **changes}

    def test_reading_sources_needs_the_grant_and_takes_versions_from_the_records(self):
        self.assertEqual(self.ai("read", {}, {"readings": [self.reading()]}, 403)["detail"].split(":")[0], "AI_PERMISSION_DENIED")
        self.grant("search_external")
        saved = self.ai("read", {}, {"readings": [self.reading(claim_version=99, snapshot="x")]})["saved"]
        [entry] = saved["content"]["readings"]
        self.assertEqual((entry["claim_version"], entry["snapshot"], saved["author"]), (1, self.sha(self.cardid), "ai"))
        self.assertEqual(self.ledger()[self.cid]["oppose"], [])   # a reading never counts by itself
        self.assertEqual(self.ai("read", {}, {"readings": [self.reading(claim="made-up")]}, 422)["detail"].split(":")[0], "AI_ANSWER_INVALID")
        self.assertEqual(self.ai("read", {}, {"readings": [self.reading(quote="央行說可以領兩萬元")]}, 422)["detail"].split(":")[0], "AI_ANSWER_UNCITED")
        unquoted = {key: value for key, value in self.reading().items() if key != "quote"}
        self.assertEqual(self.ai("read", {}, {"readings": [unquoted]}, 422)["detail"].split(":")[0], "AI_ANSWER_INVALID")   # an unquoted 反對 cannot be checked
        self.assertIn("saved", self.ai("read", {}, {"readings": [{**unquoted, "reads_as": "無關"}]}))

    def edit_claim(self):
        claim = self.current("verify.claim")[0]
        response = self.client.put(f"{self.base}/docs/verify.claim/{claim['doc_id']}", json={"content": {**claim["content"], "text": "央行宣布下週起每天只能領兩萬元", "reason": "原文是兩萬"},
                                                                                         "base_version": claim["version"]})
        self.assertEqual(response.status_code, 200, response.text)

    def test_after_the_claim_changes_old_readings_are_skipped_and_a_new_one_replaces_my_old_stance(self):
        """A stance from an older claim version no longer counts: re-confirming for the new version edits it (one live per
        claim and card), never blocks on it; a reading of the old version is never confirmed for the new one."""
        self.grant("search_external")
        old = self.ai("read", {}, {"readings": [self.reading()]})["saved"]
        self.post("/verify/stances/confirm", {"reading": old["doc_id"], "claim": self.cid})
        self.edit_claim()
        stale = self.post("/verify/stances/confirm", {"reading": old["doc_id"], "claim": self.cid})
        self.assertEqual((stale["saved"], stale["skipped"]), (0, 1))
        named = {"claim": self.cid, "claim_version": 2, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "反對", "reading": old["doc_id"]}
        mine = self.current("verify.stance")[0]
        refused = self.client.post(f"{self.base}/verify/stances", json={"content": named, "doc_id": mine["doc_id"], "base_version": mine["version"]})
        self.assertIn("VERIFY_READING_NOT_FOUND", refused.text)   # the reading named was of version 1
        new = self.ai("read", {}, {"readings": [self.reading()]})["saved"]
        done = self.post("/verify/stances/confirm", {"reading": new["doc_id"], "claim": self.cid})
        [stance] = self.current("verify.stance")
        self.assertEqual((done["saved"], stance["version"], stance["content"]["claim_version"], stance["content"]["reading"]), (1, 2, 2, new["doc_id"]))
        self.assertEqual(len(self.ledger()[self.cid]["oppose"]), 1)

    def test_confirming_one_claims_readings_at_once_is_my_save_and_then_they_count(self):
        self.grant("search_external")
        reading = self.ai("read", {}, {"readings": [self.reading()]})["saved"]
        done = self.post("/verify/stances/confirm", {"reading": reading["doc_id"], "claim": self.cid})
        self.assertEqual((done["saved"], done["skipped"]), (1, 0))
        [stance] = self.current("verify.stance")
        self.assertEqual((stance["author"], stance["content"]["reading"], stance["content"]["stance"]), ("user", reading["doc_id"], "反對"))
        line = self.ledger()[self.cid]
        self.assertEqual((len(line["oppose"]), line["few"], line["three"]["found"], line["three"]["independent_enough"]), (1, True, True, False))
        self.assertEqual(self.post("/verify/stances/confirm", {"reading": reading["doc_id"], "claim": self.cid})["skipped"], 1)

    def test_one_live_stance_per_claim_and_card_and_reading_it_differently_says_why(self):
        self.grant("search_external")
        reading = self.ai("read", {}, {"readings": [self.reading()]})["saved"]
        content = {"claim": self.cid, "claim_version": 1, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "支持", "reading": reading["doc_id"]}
        self.assertIn("VERIFY_STANCE_REASON_REQUIRED", self.client.post(f"{self.base}/verify/stances", json={"content": content}).text)
        mine = self.post("/verify/stances", {"content": {**content, "reason": "它講的是別家銀行"}})
        again = self.client.post(f"{self.base}/verify/stances", json={"content": {**content, "stance": "看不出", "reason": "重讀"}})
        self.assertEqual(again.status_code, 409)
        self.assertIn("VERIFY_STANCE_ALREADY_GIVEN", again.text)
        moved = self.client.post(f"{self.base}/verify/stances", json={"content": {**content, "card": self.card(), "reason": "x"}, "doc_id": mine["doc_id"], "base_version": 1})
        self.assertIn("VERIFY_STANCE_FIXED", moved.text)

    def test_a_quote_i_type_is_the_cards_own_stored_words(self):
        content = {"claim": self.cid, "claim_version": 1, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "反對"}
        self.assertIn("VERIFY_QUOTE_NOT_IN_SOURCE", self.client.post(f"{self.base}/verify/stances", json={"content": {**content, "quote": "央行說可以領兩萬元"}}).text)
        self.assertIn("VERIFY_QUOTE_UNCHECKED", self.client.post(f"{self.base}/docs/verify.stance", json={"content": {**content, "quote": "本行從未宣布每日提款上限"}}).text)
        saved = self.post("/verify/stances", {"content": {**content, "quote": "本行從未宣布每日\n提款上限"}})
        self.assertEqual(saved["content"]["quote"], "本行從未宣布每日\n提款上限")

    def test_a_quote_is_the_named_cards_own_words_even_when_two_sources_are_cited(self):
        """Codex round 4 F1: an answer citing two sources passed with the other page's words quoted for the card it names;
        「全部照這樣記」 trusts a reading's quote (the gate checked it), so those words counted as this page's support."""
        other = self.source("財經週刊：央行宣布下週起每天只能領一萬元，民眾一早排隊。", "財經週刊")
        self.grant("search_external")
        borrowed = self.reading(reads_as="支持", quote="央行宣布下週起每天只能領一萬元，民眾一早排隊", citations=[f"source:{self.sid}", f"source:{other}"])
        self.assertEqual(self.ai("read", {}, {"readings": [borrowed]}, 422)["detail"].split(":")[0], "AI_ANSWER_UNCITED")
        self.assertEqual(self.current("verify.reading"), [])

    def test_confirming_all_of_a_claims_readings_saves_every_stance_or_none(self):
        """Codex round 4 F7: the batch saved stance by stance, so a claim edited between two of them left the first saved
        and the second refused -- half a confirmation. Every stance is checked and written under one write lock now."""
        sid, card = self.page("央行另一份說明：提款規定和以前一樣，沒有上限。")
        self.group([self.cardid], [card])
        self.grant("search_external")
        unrelated = [{key: value for key, value in self.reading(card=item, citations=[f"source:{source}"], reads_as="無關").items() if key != "quote"}
                     for item, source in ((self.cardid, self.sid), (card, sid))]
        reading = self.ai("read", {}, {"readings": unrelated})["saved"]
        real, calls = hooks._claim_now, []

        def edited_after_the_first(*args):
            calls.append(args)
            if len(calls) == 2:
                raise InvariantViolation("VERIFY_CLAIM_VERSION_STALE: the claim is at version 2; read it again")
            return real(*args)

        with mock.patch.object(hooks, "_claim_now", side_effect=edited_after_the_first):
            refused = self.client.post(f"{self.base}/verify/stances/confirm", json={"reading": reading["doc_id"], "claim": self.cid})
        self.assertEqual((refused.status_code, self.current("verify.stance")), (409, []))
        done = self.post("/verify/stances/confirm", {"reading": reading["doc_id"], "claim": self.cid})
        self.assertEqual((done["saved"], len(self.current("verify.stance"))), (2, 2))

    def test_save_many_writes_every_item_or_none(self):
        """F7's primitive: one repository transaction for every item; the second item stale -> the first is not written."""
        me = record_log.user(self.identity["identity_id"], "VERIFY")
        seen = self.docs.save(self.tenant_id, self.owner, "verify.seen", {"message": self.mid, "about": "spread", "text": "家族群組"}, me)
        self.docs.save(self.tenant_id, self.owner, "verify.seen", {**seen["content"], "text": "兩個家族群組"}, me, doc_id=seen["doc_id"], base_version=1)
        items = [{"kind": "verify.seen", "content": {"message": self.mid, "about": "earliest", "text": "最早是阿姨傳的"}},
                 {"kind": "verify.seen", "content": {**seen["content"], "text": "三個群組"}, "doc_id": seen["doc_id"], "base_version": 1}]
        with self.assertRaisesRegex(InvariantViolation, "DOC_STALE"):
            self.docs.save_many(self.tenant_id, self.owner, items, me)
        self.assertEqual([doc["content"]["text"] for doc in self.current("verify.seen")], ["兩個家族群組"])
        items[1]["base_version"] = 2
        self.assertEqual([doc["version"] for doc in self.docs.save_many(self.tenant_id, self.owner, items, me)], [1, 3])

    def test_one_card_read_two_ways_for_one_claim_is_refused_and_the_same_reading_twice_is_one(self):
        """Codex VERIFY r5 (class of F1): a repeated (claim, card) kept the first reading silently, whatever the second said;
        「全部照這樣記」 would then count the one the model may not have meant. Two different readings refuse the answer."""
        self.grant("search_external")
        unrelated = {key: value for key, value in self.reading(reads_as="無關").items() if key != "quote"}
        self.assertEqual(self.ai("read", {}, {"readings": [self.reading(), unrelated]}, 422)["detail"].split(":")[0], "AI_ANSWER_INVALID")
        same = self.ai("read", {}, {"readings": [self.reading(), self.reading(quote="本行從未宣布每日提款上限 ")]})["saved"]
        self.assertEqual(len(same["content"]["readings"]), 1)

    def test_every_save_checks_the_claim_version_under_its_own_write_lock(self):
        """Codex VERIFY r5 F2 (class): BEFORE_SAVE ran before the save's transaction, so a claim edited between the check and
        the write left a stance or verdict filed against a version that was no longer current. The check now runs with
        the case lock held exclusive (CaseDocs.save_many): another writer of the case cannot start until the save is done."""
        held, real = [], docs_route.before_save

        def probe(*args):
            with psycopg.connect(self.url, autocommit=True) as other:   # another writer: the case lock shared, first
                try:
                    with other.transaction():
                        other.execute("SET LOCAL lock_timeout = '200ms'")
                        db.owner_lock(other, "case", self.tenant_id, self.pid)
                    held.append(False)
                except psycopg.errors.LockNotAvailable:
                    held.append(True)
            return real(*args)

        with mock.patch.object(docs_route, "before_save", side_effect=probe):
            self.post("/docs/verify.verdict", {"content": {"claim": self.cid, "claim_version": 1, "verdict": "存疑", "reason": "只有一個出處"}})
            self.post("/verify/stances", {"content": {"claim": self.cid, "claim_version": 1, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "反對",
                                                      "quote": "本行從未宣布每日提款上限"}})
        self.assertEqual(held, [True, True])

    def test_a_stance_is_for_the_claims_current_version_and_the_cards_current_page(self):
        content = {"claim": self.cid, "claim_version": 2, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "反對"}
        self.assertIn("VERIFY_CLAIM_VERSION_STALE", self.client.post(f"{self.base}/verify/stances", json={"content": content}).text)
        self.assertIn("VERIFY_SNAPSHOT_STALE", self.client.post(f"{self.base}/verify/stances", json={"content": {**content, "claim_version": 1, "snapshot": "0" * 64}}).text)


class VerdictAndLedgerTests(VerifyCase):
    def test_one_live_verdict_per_claim_for_its_current_version(self):
        cid = self.claim()["doc_id"]
        verdict = {"claim": cid, "claim_version": 1, "verdict": "存疑", "reason": "只有一個出處"}
        self.post("/docs/verify.verdict", {"content": verdict})
        self.assertEqual(self.client.post(f"{self.base}/docs/verify.verdict", json={"content": verdict}).status_code, 409)
        self.assertIn("VERIFY_CLAIM_VERSION_STALE", self.client.post(f"{self.base}/docs/verify.verdict", json={"content": {**verdict, "claim_version": 3}}).text)
        held = self.current("verify.verdict")[0]
        other = self.claim("銀行下週停止營業")["doc_id"]
        moved = self.client.put(f"{self.base}/docs/verify.verdict/{held['doc_id']}", json={"content": {**verdict, "claim": other}, "base_version": 1})
        self.assertIn("VERIFY_VERDICT_FIXED", moved.text)

    def test_the_ledger_says_what_one_origin_says_in_the_one_rule(self):
        """One opposing origin is not 「只有一個出處這樣說」; one origin on both sides is not 「還沒有獨立出處」 (kinds.verify.weak_line)."""
        against, both = self.claim()["doc_id"], self.claim("銀行下週停止營業")["doc_id"]
        a, b, c = self.card(url="https://a"), self.card(url="https://b"), self.card(url="https://c")
        self.group([a], [b, c])
        me = record_log.user(self.identity["identity_id"], "VERIFY")
        for claim, card, stance in ((against, a, "反對"), (both, b, "支持"), (both, c, "反對")):
            self.save("verify.stance", {"claim": claim, "claim_version": 1, "card": card, "snapshot": self.sha(card), "stance": stance}, me)
        lines = self.ledger()
        self.assertEqual((lines[against]["weak_line"], lines[both]["weak_line"]), ("只有一個出處說不是這樣", "只有一個出處說到它，裡面兩種說法都有"))

    def test_you_checked_this_before_in_this_case_and_never_across_cases(self):
        first = self.claim("央行宣布下週起每天只能領一萬元！")["doc_id"]
        second = self.claim("央行宣布：下週起，每天只能領 一萬元")["doc_id"]
        self.claim("央行宣布下週起每天只能領兩萬元")
        self.assertEqual((self.ledger()[second]["earlier"], self.ledger()[first]["earlier"]), ([first], []))
        self.assertEqual(claim_key("央行宣布下週起每天只能領一萬元！"), claim_key("央行宣布：下週起，每天只能領 一萬元"))
        other = self._create_project(name="另一個案子")["project_id"]
        theirs = self.client.post(f"/projects/{other}/docs/verify.claim", json={"content": {"text": "央行宣布下週起每天只能領一萬元！", "sentence": CHECKABLE, "from": "我加的"}}).json()["doc_id"]
        self.assertEqual([line["earlier"] for line in self.client.get(f"/projects/{other}/verify/ledger").json()["claims"] if line["claim_id"] == theirs], [[]])

    def test_the_ledger_keeps_the_three_things_apart_and_marks_law_without_its_details(self):
        law = self.claim("提款上限依銀行法第 45 條", law=True, jurisdiction="台灣")["doc_id"]
        reading = self.claim("這代表銀行快倒了", sentence="對事實的解釋")["doc_id"]
        fact = self.claim()["doc_id"]
        a, b = self.card(url="https://a"), self.card(url="https://b")
        self.group([a], [b])
        for card in (a, b):
            self.save("verify.stance", {"claim": fact, "claim_version": 1, "card": card, "snapshot": self.sha(card), "stance": "反對"}, record_log.user(self.identity["identity_id"], "VERIFY"))
        lines = self.ledger()
        self.assertEqual((lines[law]["law_state"], lines[reading]["needs_alternative"], lines[reading]["state"]), ("未確認", True, words.NOT_CHECKABLE))
        three = lines[fact]["three"]
        self.assertEqual((three["found"], three["independent"], three["independent_enough"], len(three["stands"])), (True, 2, True, 2))
        self.assertEqual(three["stands"][0]["cards"][0]["operator"], {"state": "查不到", "why": "沒有寫"})   # only what was found; never a tick


class SummaryAndNextTests(VerifyCase):
    """VERIFY.summary and VERIFY.next are the system's own sentences now, not AI turns (docs/platform/AI_TO_CODE_AUDIT.md §1): the ledger route
    carries each line's sentence and what is still worth checking, and an overview."""

    def setUp(self):
        super().setUp()
        self.cid = self.claim()["doc_id"]
        self.cardid = self.card(url="https://a")
        self.group([self.cardid])
        self.save("verify.stance", {"claim": self.cid, "claim_version": 1, "card": self.cardid, "snapshot": self.sha(self.cardid), "stance": "支持"}, record_log.user(self.identity["identity_id"], "VERIFY"))

    def two_origins(self, claim, stance):
        a, b = self.card(url=f"https://{claim[:6]}-a"), self.card(url=f"https://{claim[:6]}-b")
        self.group([self.cardid], [a], [b])
        for card in (a, b):
            self.save("verify.stance", {"claim": claim, "claim_version": 1, "card": card, "snapshot": self.sha(card), "stance": stance}, record_log.user(self.identity["identity_id"], "VERIFY"))

    def test_the_two_turns_are_gone_and_nothing_is_asked_of_the_ai(self):
        self.assertEqual({name for (block, name) in ai_gate.actions() if block == "VERIFY"}, {"split", "techniques", "read"})
        for action in ("summary", "next"):
            self.assertEqual(self.client.post(f"{self.base}/ai/VERIFY/{action}", json={"context": {}}).status_code, 404, action)
            self.assertIn("ai", doc_kinds.require(f"verify.{action}").authors)   # a record saved before is still a kind the case holds
        self.ledger()
        self.assertEqual(self.provider.calls, [])

    def test_a_claim_under_two_independent_origins_says_how_few_by_the_ledgers_one_rule(self):
        line = self.ledger()[self.cid]
        self.assertEqual(line["said"], "只有一個出處這樣說；獨立出處要 2 個以上才算數")
        self.assertEqual(line["said"].split("；")[0], line["weak_line"])

    def test_a_claim_with_two_origins_says_the_counts_and_a_state_with_none_says_what_was_done(self):
        other = self.claim("銀行下週停止營業")["doc_id"]
        self.two_origins(other, "反對")
        untouched = self.claim("銀行下週不開門")["doc_id"]
        lines = self.ledger()
        self.assertEqual(lines[other]["said"], "有 2 個獨立出處反對它")
        self.assertEqual(lines[untouched]["said"], kinds_verify.LEDGER_SENTENCES[lines[untouched]["state"]])
        self.assertEqual(lines[untouched]["state"], words.NOT_SEARCHED)
        self.assertEqual(lines[untouched]["said"], "系統還沒去找出處")

    def test_a_sentence_that_cannot_be_checked_and_a_law_claim_without_its_details_get_fixed_words(self):
        value = self.claim("提款上限太低了", sentence="價值判斷")["doc_id"]
        law = self.claim("提款上限依銀行法第 45 條", law=True, jurisdiction="台灣")["doc_id"]
        self.two_origins(law, "支持")
        lines = self.ledger()
        self.assertEqual((lines[value]["said"], lines[value]["next"]), ("這是價值判斷，不是查得了的句子，帳本不算它的出處", []))
        self.assertEqual(lines[law]["said"], f"有 2 個獨立出處支持它；{kinds_verify.LAW_UNCONFIRMED_LINE}")
        self.assertEqual(lines[law]["next"][-1], "寫上這句法律的法域、時效、來源")

    def test_what_is_still_worth_checking_lists_the_angles_not_searched_in_the_fixed_order(self):
        self.assertEqual(self.ledger()[self.cid]["next"], [kinds_verify.ANGLE_ASKS[angle] for angle in SEARCH_ANGLES])   # nothing searched yet: all, who said it first before the earliest original
        self.save("verify.lookup", {"claim": self.cid, "claim_version": 1, "run": "run-1", "angles": ["primary", "origin"]}, record_log.system("VERIFY"))
        searched = self.ledger()[self.cid]["next"]
        self.assertEqual(searched, [kinds_verify.ANGLE_ASKS[angle] for angle in ("news", "factcheck", "opposite")])
        self.save("verify.lookup", {"claim": self.cid, "claim_version": 1, "run": "run-2", "angles": list(SEARCH_ANGLES)}, record_log.system("VERIFY"))
        self.assertEqual(self.ledger()[self.cid]["next"], [])

    def test_the_overview_counts_claims_and_says_the_ledger_never_rules_true_or_false(self):
        self.claim("提款上限太低了", sentence="價值判斷")
        overview = self.client.get(f"{self.base}/verify/ledger").json()["overview"]
        self.assertEqual(overview, "帳本上共有 2 個主張，其中 1 個是查得了的事實。這 1 個裡，0 個有 2 個以上的獨立出處，1 個不到。帳本只數出處，不說哪個主張是真的或假的。")


class LedgerWordsTests(unittest.TestCase):
    """kinds/verify.py ledger_sentence, ledger_overview, what_next: pure functions of one ledger line."""

    def line(self, **more):
        return {"sentence": words.CHECKABLE, "state": "有獨立出處支持", "support": ["o:1", "o:2"], "oppose": [], "few": False, "law_state": None, "lookup": None, **more}

    def test_every_state_the_ledger_can_hold_has_its_sentence_and_the_angles_are_the_search_angles(self):
        self.assertEqual(set(kinds_verify.LEDGER_SENTENCES), {*words.CLAIM_STATES, words.NOT_SEARCHED, words.NOT_READ, words.NOT_CHECKABLE})
        self.assertEqual(tuple(kinds_verify.ANGLE_ASKS), SEARCH_ANGLES)

    def test_the_sentence_is_the_states_pattern_with_the_counts(self):
        say = kinds_verify.ledger_sentence
        self.assertEqual(say(self.line()), "有 2 個獨立出處支持它")
        self.assertEqual(say(self.line(state="兩邊都有", support=["o:1", "o:2"], oppose=["o:3", "o:4"])), "有 2 個獨立出處支持它，2 個反對它")
        self.assertEqual(say(self.line(state="查不到", support=[], few=True)), "系統去找過，沒有找到可以算的出處")
        self.assertEqual(say(self.line(state=words.NOT_READ, support=[], few=True)), "找到了來源，還沒有全部讀完")
        self.assertEqual(say(self.line(state="無法檢查", support=[], few=True)), "沒有辦法檢查它")
        self.assertEqual(say(self.line(state=words.NOT_CHECKABLE, sentence="叫你去做的事", support=[])), "這是叫你去做的事，不是查得了的句子，帳本不算它的出處")

    def test_one_origin_gets_the_weak_line_and_never_a_word_on_true_or_false(self):
        say = kinds_verify.ledger_sentence
        self.assertEqual(say(self.line(support=["o:1"], few=True)), "只有一個出處這樣說；獨立出處要 2 個以上才算數")
        self.assertEqual(say(self.line(state="有獨立出處反對", support=[], oppose=["o:1"], few=True)), "只有一個出處說不是這樣；獨立出處要 2 個以上才算數")
        for state in kinds_verify.LEDGER_SENTENCES:
            sentence = say(self.line(state=state, few=state != words.NOT_CHECKABLE))
            self.assertNotRegex(sentence, "是真的|是假的|不要轉|可以轉|相信")

    def test_an_unknown_state_is_said_as_the_ledger_has_it(self):
        self.assertEqual(kinds_verify.ledger_sentence(self.line(state="新的狀態")), "帳本上是「新的狀態」")

    def test_what_next_is_empty_for_a_sentence_that_cannot_be_checked_and_keeps_the_order(self):
        self.assertEqual(kinds_verify.what_next(self.line(sentence="價值判斷")), [])
        self.assertEqual(kinds_verify.what_next(self.line(lookup={"angles": ["news"]})), [kinds_verify.ANGLE_ASKS[a] for a in ("primary", "factcheck", "origin", "opposite")])

    def test_the_overview_of_no_claims_and_of_none_checkable(self):
        self.assertEqual(kinds_verify.ledger_overview([]), "帳本上共有 0 個主張，其中 0 個是查得了的事實。帳本只數出處，不說哪個主張是真的或假的。")
        self.assertEqual(kinds_verify.ledger_overview([self.line(sentence="價值判斷")]), "帳本上共有 1 個主張，其中 0 個是查得了的事實。帳本只數出處，不說哪個主張是真的或假的。")


class FactcheckTests(VerifyCase):
    """系統查別人是不是已經查過這一則: collect asks the databases (specs/wire/lookup.v1.json); VERIFY shows what each said."""

    def setUp(self):
        super().setUp()
        self.mid = self.opened()
        self.client.post("/me/docs/govern.location", json={"content": {"where": "台北"}})

    def check(self, body=None):
        with mock.patch.object(block_hooks, "after_sources") as arrived:
            saved = self.post("/verify/factcheck", body or {"message": self.mid})
        return {item["db"]: item for item in saved["content"]["dbs"]}, saved, arrived

    def text_of(self, address):
        source = self._repo.find_active_source(self.tenant_id, self.pid, address)
        return self._source_cas.read(self.tenant_id, self._repo.get_source_content_reference(self.tenant_id, self.pid, source["source_id"])).decode("utf-8")

    def stored(self, url, text, angle=None):
        """A page the collector stored under its canonical URL (no fragment); ``angle``: the search angle that found it."""
        content, source_id = text.encode("utf-8"), str(uuid.uuid4())
        cas_path = TenantScopedCas.cas_path_for(self.tenant_id, content)
        record = source_record(source_id, self.pid, self.tenant_id, "TFC 報告", "text/plain", "Confidential", cas_path["hash"], len(content),
                               TenantScopedCas.artifact_uri(self.tenant_id, self.pid, source_id, cas_path), self.identity["identity_id"], "2026-10-04T00:00:00Z",
                               canonical_url=url, source_uri=url, fetched_at="2026-10-04T00:00:00Z", provenance=COLLECTED_PROVENANCE,
                               **({"relevance": {"searchProvider": "serper", "searchLang": "zh", "searchAngle": angle, "pasted": False}} if angle else {}))
        self._repo.add_source(record, cas_path, put_content=lambda: self._source_cas.put(self.tenant_id, content), writer=record_log.system("GATHER"))
        return source_id

    def test_each_database_says_what_collect_found_and_a_hit_is_a_source(self):
        self.lookups.answer = SPEC_ANSWER
        dbs, saved, arrived = self.check()
        self.assertEqual(list(dbs), ["cofacts", "claimreview", "google"])   # 台灣: the local database first
        self.assertEqual((dbs["cofacts"]["state"], dbs["cofacts"]["why"]), ("無法檢查", "Cofacts 這次沒有回應"))   # collect's own why
        self.assertEqual((dbs["google"]["state"], dbs["google"]["why"]), ("無法檢查", "平台還沒有這個金鑰"))
        [hit] = dbs["claimreview"]["hits"]
        self.assertEqual((dbs["claimreview"]["state"], hit["publisher"], hit["judged_as"], hit["local"]), ("查到", "台灣事實查核中心", "錯誤", True))
        self.assertEqual(self.lookups.calls, [(self.pid, "factcheck", [{"text": MESSAGE}])])
        [source] = self._repo.list_sources(self.tenant_id, self.pid)
        address = hit_address("claimreview", "https://tfc-taiwan.org.tw/articles/1", HIT_CLAIM)
        self.assertEqual((source["source_class"], source["canonical_url"], source["source_uri"], saved["content"]["rules"]["version"]),
                         ("fact_check", address, "https://tfc-taiwan.org.tw/articles/1", "3"))
        text = self.text_of(address)
        for line in ("查核組織：台灣事實查核中心", "他們的判定：錯誤", "查核報告：https://tfc-taiwan.org.tw/articles/1"):
            self.assertIn(line, text)
        self.assertEqual((hit["claim"], dbs["claimreview"]["attribution"]), (HIT_CLAIM, CLAIMREVIEW_ATTRIBUTION))   # in the record
        for kept_out in (HIT_CLAIM, CLAIMREVIEW_ATTRIBUTION):
            self.assertNotIn(kept_out, text + source["title"])
        [event] = [event for event in self._repo.list_events(self.tenant_id, f"source:{source['source_id']}") if event["event_type"] == "SourceAdded"]
        self.assertEqual((event["author"], event["block"]), ("system", "GATHER"))   # written as GATHER: its slot stays dark
        self.assertEqual(arrived.call_args.args[3]["source_ids"], [source["source_id"]])
        self.assertNotIn("GATHER", CaseDocs(self._repo).blocks_used(self.tenant_id, self.owner))

    def test_collect_down_or_not_set_up_makes_both_databases_uncheckable_never_an_error(self):
        """lookup.v1 R7: no token, unreachable, 5xx -- every fact-check database is 無法檢查 「找資料的服務這次沒有回應」."""
        down = [("claimreview", "無法檢查", collect_lookups.DOWN), ("cofacts", "無法檢查", collect_lookups.DOWN)]
        self.lookups.error = InvariantViolation("COLLECT_LOOKUP_UNAVAILABLE: HTTP 503 from app.aware-wave.com")
        with self.assertLogs("ai_lego.platform.net.collect_lookups", "WARNING"):   # logged, never raised
            dbs, _, arrived = self.check()
        self.assertEqual([(db, dbs[db]["state"], dbs[db]["why"]) for db in ("claimreview", "cofacts")], down)
        api_main.app.dependency_overrides[api_main.get_collection_service] = lambda: None   # COLLECT_RESEARCH_RUNS_TOKEN unset
        with self.assertLogs("ai_lego.platform.net.collect_lookups", "WARNING"):
            dbs, _, _ = self.check()
        self.assertEqual([(db, dbs[db]["state"], dbs[db]["why"]) for db in ("claimreview", "cofacts")], down)
        self.assertEqual((self._repo.list_sources(self.tenant_id, self.pid), arrived.called), ([], False))

    def test_an_answer_not_in_the_spec_shape_is_uncheckable_not_an_error(self):
        """lookup.v1 R8: 查到 with nothing found, 查不到 without why."""
        self.lookups.answer = answer_with(claimreview={"db": "claimreview", "state": "查到", "attribution": "", "hits": []},
                                          cofacts={"db": "cofacts", "state": "查不到", "attribution": "", "hits": []})
        dbs, _, _ = self.check()
        self.assertEqual({dbs[db]["why"] for db in ("claimreview", "cofacts")}, {collect_lookups.MALFORMED})
        self.assertEqual(self._repo.list_sources(self.tenant_id, self.pid), [])

    def test_a_cofacts_article_with_replies_is_a_source_and_one_nobody_answered_is_only_counted(self):
        self.lookups.answer = answer_with(cofacts=COFACTS_FOUND)
        dbs, _, _ = self.check()
        self.assertEqual((dbs["cofacts"]["state"], [hit["judged_as"] for hit in dbs["cofacts"]["hits"]]), ("查到", ["含有不實訊息"]))
        self.assertEqual(dbs["cofacts"]["why"], "另外有 1 則相近的訊息有人問過，還沒有人回應")
        self.assertIsNone(self._repo.find_active_source(self.tenant_id, self.pid, hit_address("cofacts", "https://cofacts.tw/article/a2", "")))
        text = self.text_of(hit_address("cofacts", "https://cofacts.tw/article/a1", ""))
        for line in ("央行澄清：沒有每日提款上限。", "回應 1 的出處：https://www.cbc.gov.tw/news/1"):
            self.assertIn(line, text)
        self.assertNotIn(COFACTS_ATTRIBUTION, text)

    def test_cofacts_with_only_unanswered_articles_is_not_found(self):
        self.lookups.answer = answer_with(cofacts={**COFACTS_FOUND, "hits": COFACTS_FOUND["hits"][1:]})
        dbs, _, _ = self.check()
        self.assertEqual((dbs["cofacts"]["state"], dbs["cofacts"]["why"], dbs["cofacts"]["hits"]), ("查不到", "有 1 則相近的訊息有人問過，還沒有人回應", []))

    def test_a_result_without_its_attribution_is_not_used(self):
        """The data's licence asks for the attribution; a 查到 that comes without it stores nothing."""
        claimreview = {**SPEC_ANSWER["items"][0]["dbs"][0], "attribution": " "}
        self.lookups.answer = answer_with(claimreview=claimreview)
        dbs, _, _ = self.check()
        self.assertEqual((dbs["claimreview"]["state"], dbs["claimreview"]["why"], self._repo.list_sources(self.tenant_id, self.pid)), ("無法檢查", NO_ATTRIBUTION, []))

    def test_a_hit_never_replaces_a_stored_page_and_two_reviews_on_one_report_are_two_sources(self):
        """critic M2: the report page the collector stored keeps its place; a hit has its own address (report URL + fragment)."""
        report = "https://tfc-taiwan.org.tw/articles/1"
        page = self.stored(report, f"台灣事實查核中心報告全文：網傳{HIT_CLAIM}，經查為錯誤訊息。")
        claimreview = json.loads(json.dumps(SPEC_ANSWER["items"][0]["dbs"][0]))
        claimreview["hits"].append({**claimreview["hits"][0], "claim": "銀行下週起停止營業", "judged_as": "錯誤"})
        self.lookups.answer = answer_with(claimreview=claimreview)
        self.check()
        self.check()
        rows = self._repo.list_sources(self.tenant_id, self.pid)
        self.assertEqual((len(rows), {row["status"] for row in rows}), (3, {"active"}))   # nothing superseded, nothing added the second time
        self.assertEqual(self._repo.find_active_source(self.tenant_id, self.pid, report)["source_id"], page)
        self.assertEqual(len({row["canonical_url"] for row in rows}), 3)

    def test_a_fact_check_card_never_enters_the_ai_reading_turn(self):
        """critic round 3 M1: a review rated 錯誤 repeats the claim (「網傳「…」並非事實」) and a review of another claim
        says 「他們的判定：錯誤」 -- quoted, either passes as support or opposition. The AI turn is never given a fact-check
        card, named or not; an answer citing one is refused as uncited; the person sets its stance."""
        self.lookups.answer = SPEC_ANSWER
        cid = self.claim(message=self.mid)["doc_id"]
        self.post("/verify/factcheck", {"message": self.mid})
        block_hooks.wait_idle()
        [source] = self._repo.list_sources(self.tenant_id, self.pid)
        [hit] = [doc["doc_id"] for doc in self.current("gather.source") if doc["content"]["source_id"] == source["source_id"]]
        _, page = self.page()
        self.grant("search_external")
        oppose = {"claim": cid, "card": hit, "reads_as": "反對", "quote": "他們的判定：錯誤", "citations": [f"source:{source['source_id']}"]}
        for context in ({}, {"cards": [hit]}, {"cards": [page, hit]}):
            self.assertIn("VERIFY_FACTCHECK_CARD_NOT_FOR_AI", self.ai("read", context, {"readings": [oppose]}, 400)["detail"], context)
        self.assertEqual(self.provider.calls, [])
        for reading in (oppose, {**oppose, "card": page}):
            self.assertEqual(self.ai("read", {"cards": [page]}, {"readings": [reading]}, 422)["detail"].split(":")[0], "AI_ANSWER_UNCITED")
        self.assertNotIn("他們的判定", self.provider.calls[0][1])   # the hit's text was never sent
        self.assertEqual(self.current("verify.reading"), [])
        mine = self.post("/verify/stances", {"content": {"claim": cid, "claim_version": 1, "card": hit, "snapshot": self.sha(hit), "stance": "反對"}})
        self.assertEqual(mine["author"], "user")

    def test_a_report_the_collector_stored_and_its_fact_check_hit_are_one_origin(self):
        """critic round 3 N1: the hit's address is the report URL + #fragment; both cards read as 反對 are one opposing
        origin, never 「出處彼此獨立」."""
        report = "https://tfc-taiwan.org.tw/articles/1"
        cid = self.claim(message=self.mid)["doc_id"]
        self.stored(report, f"台灣事實查核中心報告全文：網傳{HIT_CLAIM}，經查為錯誤訊息。")
        self.lookups.answer = SPEC_ANSWER
        self.post("/verify/factcheck", {"message": self.mid})
        block_hooks.wait_idle()
        cards = self.current("gather.source")
        self.assertEqual([card["content"]["url"].split("#")[0] for card in cards], [report, report])
        for card in cards:
            self.save("verify.stance", {"claim": cid, "claim_version": 1, "card": card["doc_id"], "snapshot": self.sha(card["doc_id"]), "stance": "反對"},
                      record_log.user(self.identity["identity_id"], "VERIFY"))
        line = self.ledger()[cid]
        self.assertEqual((len(line["oppose"]), line["three"]["independent"], line["three"]["independent_enough"]), (1, 1, False))

    def test_a_copy_of_the_report_joins_the_report_and_its_hit_in_one_origin(self):
        """critic round 3 N1, chained: a mirror with the report's exact text (one snapshot) and the hit (one address) both
        join the report page, so all three are one origin whatever order they came in."""
        report = "https://tfc-taiwan.org.tw/articles/1"
        mirror = self.card(url="https://mirror.example/1", sha="e" * 64)
        hit = self.card(url=hit_address("claimreview", report, CLAIM))
        page = self.card(url=report, sha="e" * 64)
        self.group([mirror], [hit], [page])
        self.assertEqual([sorted(card["card"] for card in origin["cards"]) for origin in self.origins()], [sorted([mirror, hit, page])])

    def test_the_same_report_and_claim_twice_in_one_answer_is_stored_once(self):
        """critic round 3 N3: the second would supersede the first and the record would name a source no longer active."""
        claimreview = json.loads(json.dumps(SPEC_ANSWER["items"][0]["dbs"][0]))
        claimreview["hits"].append({**claimreview["hits"][0], "judged_as": "部分錯誤"})
        self.lookups.answer = answer_with(claimreview=claimreview)
        dbs, _, _ = self.check()
        [hit] = dbs["claimreview"]["hits"]
        rows = self._repo.list_sources(self.tenant_id, self.pid)
        self.assertEqual(([(row["source_id"], row["status"]) for row in rows], hit["judged_as"]), ([(hit["source_id"], "active")], "錯誤"))

    def test_the_same_result_twice_is_one_source(self):
        self.lookups.answer = SPEC_ANSWER
        self.check()
        _, _, arrived = self.check()
        [source] = self._repo.list_sources(self.tenant_id, self.pid)
        self.assertEqual(arrived.call_args.args[3]["source_ids"], [source["source_id"]])   # every hit goes to the (idempotent) hooks, new or not

    def test_elsewhere_only_the_global_databases_are_shown_and_the_local_checker_is_not_first(self):
        self.client.post("/me/docs/govern.location", json={"content": {"where": "東京"}})
        other = {"claim": HIT_CLAIM, "url": "https://example.org/review/1", "publisher": "Other Checker", "publisher_url": "https://example.org",
                 "judged_as": "False", "date": "2026-05-02", "claimant": ""}
        claimreview = json.loads(json.dumps(SPEC_ANSWER["items"][0]["dbs"][0]))
        claimreview["hits"].append(other)
        self.lookups.answer = answer_with(claimreview=claimreview, cofacts=COFACTS_FOUND)
        dbs, saved, _ = self.check()
        self.assertEqual((list(dbs), saved["content"].get("place")), (["claimreview", "google"], None))
        self.assertEqual([(hit["publisher"], hit["local"]) for hit in dbs["claimreview"]["hits"]], [("台灣事實查核中心", False), ("Other Checker", False)])
        self.assertIsNone(self._repo.find_active_source(self.tenant_id, self.pid, "https://cofacts.tw/article/a1"))

    def test_in_taiwan_the_local_checker_comes_first(self):
        other = {"claim": HIT_CLAIM, "url": "https://example.org/review/1", "publisher": "Other Checker", "publisher_url": "https://example.org",
                 "judged_as": "False", "date": "2026-05-02", "claimant": ""}
        claimreview = json.loads(json.dumps(SPEC_ANSWER["items"][0]["dbs"][0]))
        claimreview["hits"].insert(0, other)
        self.lookups.answer = answer_with(claimreview=claimreview)
        dbs, _, _ = self.check()
        self.assertEqual([(hit["publisher"], hit["local"]) for hit in dbs["claimreview"]["hits"]], [("台灣事實查核中心", True), ("Other Checker", False)])

    def test_only_the_databases_of_my_place_are_sent_the_words_and_the_page_is_told_which(self):
        """P2 (critic round 2 m8): collect is asked only the place's databases that collect answers (lookup.v1 dbs), so
        someone outside Taiwan never sends their words to Cofacts; the ledger tells the page which ones, for its notice."""
        self.check()   # 台北
        self.client.post("/me/docs/govern.location", json={"content": {"where": "東京"}})
        dbs, _, _ = self.check()
        self.assertEqual((self.lookups.dbs, list(dbs)), ([["cofacts", "claimreview"], ["claimreview"]], ["claimreview", "google"]))
        self.assertEqual(self.client.get(f"{self.base}/verify/ledger").json()["factcheck_asks"], ["claimreview"])
        self.assertEqual(verify_route.collect_asks({"use": ["google"]}), [])   # a place whose list collect answers none of: nothing is sent

    def test_a_page_found_through_the_fact_check_angle_is_read_by_me_not_the_ai(self):
        """P4: a fact-check article 「去查」 found through its 查核 angle restates the claim it reviewed, like a hit; quoted,
        a 「錯誤」 report reads as support. The AI reading turn is never given it (named or not); the person reads it."""
        cid = self.claim(message=self.mid)["doc_id"]
        article = self.stored("https://factcheck.example/withdrawal", f"查核報告：網傳「{CLAIM}」，經查為錯誤訊息。", angle="factcheck")
        block_hooks.after_sources(self.docs, self.tenant_id, self.owner, {"run": None, "source_ids": [article], "aside": [], "channels": [], "pasted": False})
        block_hooks.wait_idle()
        [card] = [doc["doc_id"] for doc in self.current("gather.source") if doc["content"]["source_id"] == article]
        _, page = self.page()
        self.grant("search_external")
        support = {"claim": cid, "card": card, "reads_as": "支持", "quote": CLAIM, "citations": [f"source:{article}"]}
        for context in ({}, {"cards": [card]}, {"cards": [page, card]}):
            self.assertIn("VERIFY_FACTCHECK_CARD_NOT_FOR_AI", self.ai("read", context, {"readings": [support]}, 400)["detail"], context)
        self.assertEqual((self.provider.calls, self.current("verify.reading")), ([], []))
        self.assertEqual((hooks.usable_cards(self.docs, self.tenant_id, self.owner), self.client.get(f"{self.base}/verify/ledger").json()["person_reads"]), (1, [card]))

    def edit(self, cid):
        held = next(doc for doc in self.current("verify.claim") if doc["doc_id"] == cid)
        edited = self.client.put(f"{self.base}/docs/verify.claim/{cid}", json={"content": {**held["content"], "text": "央行宣布下週起每天只能領兩萬元", "reason": "原文是兩萬"},
                                                                                 "base_version": held["version"]})
        self.assertEqual(edited.status_code, 200, edited.text)

    def test_a_claim_edited_while_collect_answered_gets_no_result_for_its_old_words(self):
        """Codex VERIFY r5 F2: the look-up read version 1, the person saved version 2 meanwhile, and version 1's result and
        hits were filed. The result is now saved only while the claim is still at the version whose words were sent."""
        cid = self.claim(message=self.mid)["doc_id"]
        self.lookups.answer = SPEC_ANSWER
        real = self.lookups.lookup

        def edited_meanwhile(*args, **kwargs):
            self.edit(cid)
            return real(*args, **kwargs)

        with mock.patch.object(self.lookups, "lookup", side_effect=edited_meanwhile):
            stale = self.client.post(f"{self.base}/verify/factcheck", json={"claim": cid})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertIn("VERIFY_CLAIM_VERSION_STALE", stale.text)
        self.assertEqual((self.current("verify.factcheck"), self._repo.list_sources(self.tenant_id, self.pid)), ([], []))

    def test_a_claim_edited_just_before_the_result_is_saved_is_refused_under_the_write_lock(self):
        """The check that holds is the one inside the record's save (same write lock), not the one after collect answered."""
        cid = self.claim(message=self.mid)["doc_id"]
        self.lookups.answer = SPEC_ANSWER
        real = verify_route._store_hit

        def edited_meanwhile(*args, **kwargs):
            stored = real(*args, **kwargs)
            self.edit(cid)
            return stored

        with mock.patch.object(verify_route, "_store_hit", side_effect=edited_meanwhile):
            stale = self.client.post(f"{self.base}/verify/factcheck", json={"claim": cid})
        self.assertEqual((stale.status_code, self.current("verify.factcheck")), (409, []), stale.text)
        self.assertEqual(self.post("/verify/factcheck", {"claim": cid})["content"]["claim_version"], 2)

    def test_a_claim_can_be_looked_up_too(self):
        cid = self.claim(message=self.mid)["doc_id"]
        _, saved, _ = self.check({"claim": cid})
        self.assertEqual((saved["content"]["claim"], saved["content"]["claim_version"], self.lookups.calls[-1][2]), (cid, 1, [{"text": CLAIM}]))
        self.assertEqual(self.client.post(f"{self.base}/verify/factcheck", json={}).status_code, 400)


class SearchTests(CollectionApiTestCase):
    """「去查」: one collection run per checkable claim, plan first; its end writes verify.search for that claim."""

    def setUp(self):
        super().setUp()
        self.pid = self.project["project_id"]
        self.docs, self.tenant_id, self.owner = CaseDocs(self._repo), self.tenant["tenant_id"], record_log.case(self.project["project_id"])

    def claim(self, sentence=CHECKABLE):
        response = self.client.post(f"/projects/{self.pid}/docs/verify.claim", json={"content": {"text": CLAIM, "sentence": sentence, "from": "我加的"}})
        return response.json()["doc_id"]

    def go(self, claim, **body):
        return self.client.post(f"/projects/{self.pid}/verify/claims/{claim}/search", json=body)

    def start_run(self, claim):
        self._collector()
        response = self.go(claim, confirm=True)
        self.assertEqual(response.status_code, 202, response.text)
        token = self._exchange(self.service.calls[-1]["grant_ref"]).json()["grant_token"]
        return response.json()["run_id"], {"Authorization": f"Grant {token}"}

    def searches(self):
        block_hooks.wait_idle()
        return [doc["content"] for doc in self.docs.current(self.tenant_id, self.owner, "verify.search")]

    def test_go_check_shows_the_plan_then_runs_one_claim_seed_of_the_wire(self):
        self.assertIn("VERIFY_CLAIM_NOT_CHECKABLE", self.go(self.claim("價值判斷")).text)
        claim = self.claim()
        plan = self.go(claim)
        self.assertEqual((plan.status_code, plan.json()["confirm_required"], self.service.calls), (200, True, []))
        self.assertIn("VERIFY_SEARCH_ANGLES_INVALID", self.go(claim, angles=["google"]).text)
        run_id, _ = self.start_run(claim)
        [seed] = self.service.calls[0]["seeds"]
        self.assertTrue(seed["uri"].startswith("entity://claim/"))
        self.assertEqual(seed["meta"], {"kind": "claim", "entityName": CLAIM, "angles": list(SEARCH_ANGLES), "languages": ["zh"], "providers": ["serper", "brave"]})   # the claim's own language only
        [lookup] = self.docs.current(self.tenant_id, self.owner, "verify.lookup")
        self.assertEqual((lookup["content"]["claim"], lookup["content"]["run"], lookup["author"]), (claim, run_id, "system"))

    def test_the_runs_end_says_what_was_found_for_that_claim_once(self):
        claim = self.claim()
        run_id, grant = self.start_run(claim)
        ingest = self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": run_id, "sources": [c1("https://acme.example/a", "alpha")]}, headers=grant)
        self.assertEqual((ingest.status_code, self.searches()), (200, []))   # a batch is not the end
        done = self.client.post(f"/projects/{self.pid}/collections/{run_id}/complete", json={"status": "completed", "report": REPORT}, headers=grant)
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(self.searches(), [{"claim": claim, "claim_version": 1, "state": "查到", "why": "找回 3 頁", "run": run_id}])
        hooks._after_sources(self.docs, self.tenant_id, self.owner, {"run": run_id, "channels": []})
        self.assertEqual(len(self.searches()), 1)
        [line] = self.client.get(f"/projects/{self.pid}/verify/ledger").json()["claims"]
        self.assertEqual((line["state"], line["lookup"]["status"], line["search"]["state"]), (words.NOT_READ, "completed", "查到"))
        self.assertNotIn("GATHER", self.docs.blocks_used(self.tenant_id, self.owner))   # the background search lights no GATHER slot

    def test_a_run_that_could_not_look_is_uncheckable_and_one_that_found_nothing_says_so(self):
        self.assertEqual(hooks.search_result({"status": "failed"}, []), ("無法檢查", "這次查詢沒有跑完"))
        self.assertEqual(hooks.search_result({"status": "completed", "report": {**REPORT, "written": 0}}, []), ("無法檢查", "找資料的服務沒有回報搜尋管道"))   # critic M4
        self.assertEqual(hooks.search_result({"status": "completed", "report": REPORT}, [])[0], "查到")
        self.assertEqual(hooks.search_result({"status": "completed", "report": REPORT}, [{"provider": "serper", "lang": "zh", "state": "unreachable"}, {"provider": "brave", "lang": "zh", "state": "no_key"}])[0], "無法檢查")
        self.assertEqual(hooks.search_result({"status": "completed", "report": {**REPORT, "written": 0}}, channels()), ("查不到", "找過，沒有找到相關的網頁"))
        self.assertEqual(hooks.search_result({"status": "completed", "report": None}, [])[0], "無法檢查")

    def test_nothing_found_only_when_every_planned_channel_answered(self):
        """Codex round 4 F5 (decision S): Serper answered, Brave did not, no page -- that is not 「找過，沒有」. 查不到 only
        when every channel the run planned (engines x languages) reported ok; else 無法檢查 naming what each engine said."""
        empty = {"status": "completed", "report": {**REPORT, "written": 0}}
        self.assertEqual(hooks.search_result(empty, channels(brave="unreachable")), ("無法檢查", "Brave：沒有回應；Serper：找過沒有找到"))
        self.assertEqual(hooks.search_result(empty, channels(brave="no_key")), ("無法檢查", "Brave：平台還沒有這個搜尋引擎的金鑰；Serper：找過沒有找到"))
        self.assertEqual(hooks.search_result(empty, channels()[:1]), ("無法檢查", "Serper（英文）：沒有回報；Brave：沒有回報；Serper（中文）：找過沒有找到"))
        self.assertEqual(hooks.search_result({**empty, "report": REPORT}, channels(brave="unreachable")), ("查到", "找回 3 頁"))   # pages came back: found

    def test_a_channel_says_what_happened_not_only_that_it_failed(self):
        """2026-10-12 walk: 「這裡連不上Brave」 for an engine that answered HTTP 422. The collector's own sentence is what the person reads;
        a code is not shown; with no sentence the state's plain words stand."""
        empty = {"status": "completed", "report": {**REPORT, "written": 0}}

        def brave(state, why):
            return [{"provider": provider, "lang": lang, "state": state if provider == "brave" else "ok", "why": why if provider == "brave" else ""}
                    for provider in ("serper", "brave") for lang in ("zh", "en")]

        self.assertEqual(hooks.search_result(empty, brave("unreachable", "這個搜尋引擎回了錯誤（HTTP 422）")), ("無法檢查", "Brave：這個搜尋引擎回了錯誤（HTTP 422）；Serper：找過沒有找到"))
        self.assertEqual(hooks.search_result(empty, brave("unreachable", "連不上這個搜尋引擎"))[1], "Brave：連不上這個搜尋引擎；Serper：找過沒有找到")
        self.assertEqual(hooks.search_result(empty, brave("unreachable", "http_422"))[1], "Brave：沒有回應；Serper：找過沒有找到")
        self.assertEqual(hooks.search_result(empty, brave("no_key", "平台還沒有這個搜尋引擎的金鑰"))[1], "Brave：平台還沒有這個搜尋引擎的金鑰；Serper：找過沒有找到")
        self.assertEqual(hooks.search_result(empty, brave("ok", "每個問題最多查 3 次，這些角度沒有查：新聞"))[1], "找過，沒有找到相關的網頁")   # an engine that looked says nothing of its why
        worse = [{"provider": "brave", "lang": "zh", "state": "ok", "why": ""}, {"provider": "brave", "lang": "zh", "state": "unreachable", "why": "這個搜尋引擎回了錯誤（HTTP 503）"}]
        self.assertEqual(hooks.channel_reports(worse), {("brave", "zh"): ("unreachable", "這個搜尋引擎回了錯誤（HTTP 503）")})   # the worse report brings its own why

    def test_a_channel_reported_twice_reads_as_its_worse_report_never_the_last(self):
        """Codex VERIFY r5 F1: serper/zh 「unreachable」 then a duplicate serper/zh 「ok」, zero pages: the dict kept the last
        row and the ledger said 查不到. A fact from a list of reports is a function of every row."""
        empty = {"status": "completed", "report": {**REPORT, "written": 0}}
        unreachable = {"provider": "serper", "lang": "zh", "state": "unreachable", "why": ""}
        for rows in ([unreachable, *channels()], [*channels(), unreachable]):
            self.assertEqual(hooks.search_result(empty, rows), ("無法檢查", "Serper（中文）：沒有回應；Serper（英文）：找過沒有找到；Brave：找過沒有找到"))
        self.assertEqual(hooks.channel_states([{"provider": "brave", "lang": "en", "state": "no_key"}, {"provider": "brave", "lang": "en", "state": "unreachable"}]),
                         {("brave", "en"): "no_key"})
        self.assertEqual(hooks.channel_states([{"provider": "brave", "lang": "en", "state": "ok"}, {"provider": "brave", "lang": "en", "state": "?"}]), {("brave", "en"): "?"})

    def test_a_completion_that_repeats_a_channel_is_refused_and_never_reads_as_nothing_found(self):
        """The wire's one row per (provider, lang) (collector.v2.json channel_rules): a repeat is malformed -- the run ends
        failed and its claim says 無法檢查 「這次查詢沒有跑完」, never 查不到."""
        claim = self.claim()
        run_id, grant = self.start_run(claim)
        rows = [{"provider": "serper", "lang": "zh", "state": "unreachable", "why": "http_502"}, *channels()]
        done = self.client.post(f"/projects/{self.pid}/collections/{run_id}/complete", json={"status": "completed", "report": {**REPORT, "written": 0, "unchanged": 0}, "channels": rows}, headers=grant)
        self.assertEqual(done.status_code, 400, done.text)
        self.assertIn("channels: each (provider, lang) once", done.text)
        self.client.get(f"/projects/{self.pid}/verify/ledger")
        self.assertEqual([(item["state"], item["why"]) for item in self.searches()], [("無法檢查", "這次查詢沒有跑完")])

    def test_a_claim_edited_before_its_run_is_reserved_sends_nothing(self):
        """Codex VERIFY r5 F2: the route read version 1, the person saved version 2, and the reservation only looked for
        another open run -- version 1's words went out and its result was filed. The reservation (under the write lock)
        now also needs the claim still at the version read: the run fails before collect is asked."""
        claim = self.claim()
        self._collector()
        real = verify_route.refuse_open_search

        def edited_after_the_route_read_it(*args):
            if not edits:
                held = next(doc for doc in self.docs.current(self.tenant_id, self.owner, "verify.claim") if doc["doc_id"] == claim)
                edits.append(self.client.put(f"/projects/{self.pid}/docs/verify.claim/{claim}", json={"content": {**held["content"], "text": "央行宣布下週起每天只能領兩萬元", "reason": "原文是兩萬"},
                                                                                                    "base_version": held["version"]}).status_code)
            return real(*args)

        edits: list[int] = []
        with mock.patch.object(verify_route, "refuse_open_search", side_effect=edited_after_the_route_read_it):
            stale = self.go(claim, confirm=True)
        self.assertEqual((edits, stale.status_code), ([200], 409), stale.text)
        self.assertIn("VERIFY_CLAIM_VERSION_STALE", stale.text)
        with self._repo.transaction(self.tenant_id) as connection:
            statuses = [row[0] for row in connection.execute("SELECT status FROM collection_runs WHERE tenant_id=%s AND project_id=%s", (self.tenant_id, self.pid))]
        self.assertEqual((statuses, self.service.calls, self.docs.current(self.tenant_id, self.owner, "verify.lookup")), (["failed"], [], []))
        self.assertEqual(self.go(claim, confirm=True).status_code, 202)   # read again: version 2 goes out

    def test_a_claims_new_version_shows_no_run_or_result_of_the_old_one(self):
        """Codex round 4 F3/F4: a record about one claim is about one version of it -- the ledger matched 「去查」's run on
        the claim id only, so version 1's run showed on version 2."""
        claim = self.claim()
        run_id, grant = self.start_run(claim)
        self.client.post(f"/projects/{self.pid}/collections/{run_id}/complete", json={"status": "completed", "report": REPORT}, headers=grant)
        self.assertEqual(len(self.searches()), 1)
        held = next(doc for doc in self.docs.current(self.tenant_id, self.owner, "verify.claim") if doc["doc_id"] == claim)
        edited = self.client.put(f"/projects/{self.pid}/docs/verify.claim/{claim}", json={"content": {**held["content"], "text": "央行宣布下週起每天只能領兩萬元", "reason": "原文是兩萬"}, "base_version": 1})
        self.assertEqual(edited.status_code, 200, edited.text)
        [line] = self.client.get(f"/projects/{self.pid}/verify/ledger").json()["claims"]
        self.assertEqual((line["version"], line["lookup"], line["search"], line["state"]), (2, None, None, words.NOT_SEARCHED))

    def test_one_open_go_check_per_claim_version(self):
        """Codex round 4 F6: a second confirm (or a second tab) started another run for the same claim version -- the
        outside queries twice, and two ends writing one claim's result."""
        claim = self.claim()
        self.start_run(claim)
        again = self.go(claim, confirm=True)
        self.assertEqual(again.status_code, 409, again.text)
        self.assertIn("VERIFY_SEARCH_ALREADY_RUNNING", again.text)
        runs = self._sql("SELECT COUNT(*) FROM collection_runs WHERE tenant_id=%s", self.tenant_id)[0][0]
        self.assertEqual((runs, len(self.service.calls), len(self.docs.current(self.tenant_id, self.owner, "verify.lookup"))), (1, 1, 1))   # refused before any run was made

    def test_two_racing_go_checks_start_one_run(self):
        """The check before the run is the quick answer; the one that holds is made under the case's lock, held exclusive
        by the save of the run's verify.lookup, before collect is asked: the loser's run fails there and collect never
        hears of it."""
        claim = self.claim()
        self.start_run(claim)
        real, calls = verify_route.refuse_open_search, []

        def before_the_other_saved(*args):   # the first check runs before the other request's lookup was saved
            calls.append(args)
            if len(calls) > 1:
                real(*args)

        with mock.patch.object(verify_route, "refuse_open_search", side_effect=before_the_other_saved):
            second = self.go(claim, confirm=True)
        self.assertEqual(second.status_code, 409, second.text)
        statuses = sorted(row[0] for row in self._sql("SELECT status FROM collection_runs WHERE tenant_id=%s", self.tenant_id))
        self.assertEqual((statuses, len(self.service.calls), len(self.docs.current(self.tenant_id, self.owner, "verify.lookup"))), (["failed", "running"], 1, 1))


    def test_a_run_that_will_never_call_back_is_settled_on_a_ledger_read_or_the_next_arrival(self):
        """critic m7: past its deadline a run reads as failed and nobody can finish it -- its claim says 無法檢查, not 還沒查."""
        first, second = self.claim(), self.claim()
        self._collector()
        runs = [self.go(claim, confirm=True).json()["run_id"] for claim in (first, second)]
        self._sql("UPDATE collection_runs SET deadline_at='2000-01-01T00:00:00Z' WHERE run_id=%s", runs[0])
        self.client.get(f"/projects/{self.pid}/verify/ledger")
        self.assertEqual([(item["claim"], item["state"], item["why"]) for item in self.searches()], [(first, "無法檢查", "這次查詢沒有跑完")])
        self.client.get(f"/projects/{self.pid}/verify/ledger")
        self.assertEqual(len(self.searches()), 1)   # settled once
        self._sql("UPDATE collection_runs SET deadline_at='2000-01-01T00:00:00Z' WHERE run_id=%s", runs[1])
        hooks._after_sources(self.docs, self.tenant_id, self.owner, {"run": None, "channels": []})   # any arrival in the case
        self.assertEqual(sorted(item["claim"] for item in self.searches()), sorted([first, second]))


class ProposeGatherTests(Step2Case):
    def test_more_cards_than_one_ai_turn_reads_proposes_gather(self):
        for index in range(13):
            self.card(source_id=f"s{index}", url=f"https://p{index}")
        self.docs.save(self.tenant_id, self.owner, "verify.lookup", {"claim": "c", "claim_version": 1, "run": "r1"}, record_log.system("VERIFY"))
        with mock.patch.object(ProjectSourceRepository, "get_collection_run", return_value={"status": "completed", "report": REPORT}):
            hooks._after_sources(self.docs, self.tenant_id, self.owner, {"run": "r1", "channels": []})
        [proposal] = self.docs.current(self.tenant_id, self.owner, "assembler.proposal.verify")
        self.assertEqual((proposal["content"]["propose"], proposal["content"]["why"]), ("GATHER", hooks.WHY_GATHER))

    def test_a_fact_check_card_is_not_one_an_ai_turn_could_read(self):
        for index in range(12):
            self.card(source_id=f"s{index}", url=f"https://p{index}")
        self.card(source_id="s12", url=hit_address("claimreview", "https://tfc-taiwan.org.tw/articles/1", CLAIM))
        self.assertEqual(hooks.usable_cards(self.docs, self.tenant_id, self.owner), 12)


class EngineReachesNothingOutsideTests(unittest.TestCase):
    """lookup.v1 R9 (operator 2026-09-17; why, 2026-10-04: each block is built separately and then chained, collect is
    the searcher): the engine has no fact-check fetch of its own and its allowlist holds only the AI provider and collect."""

    def test_the_engine_package_has_no_fact_check_fetch_and_names_no_such_host(self):
        lego = PRODUCT_ROOT / "ai_lego"
        self.assertEqual([name for name in ("claimreview.py", "cofacts.py", "rdap.py", "wayback.py") if (lego / "platform" / "net" / name).exists()], [])
        banned = ("api.cofacts.tw", "storage.googleapis.com", "datacommons-feeds", "ListArticles", "factchecktools.googleapis.com")
        texts = {path.relative_to(lego).as_posix(): path.read_text(encoding="utf-8") for path in lego.rglob("*.py")}
        self.assertEqual(sorted(f"{name}: {word}" for name, text in texts.items() for word in banned if word in text), [])
        self.assertEqual(sorted(name for name, text in texts.items() if "fetch_json" in text),
                         ["platform/ai_gateway/provider.py", "platform/net/collection_service.py", "platform/net/egress.py",
                          "platform/net/entitlement_issuer.py"])   # ADR 017 §4 permit issuer, same host as collect

    def test_the_allowlist_keeps_only_the_ai_provider_and_collect(self):
        from tests.unit.test_egress_allowlist_parity import _compose_allowlist

        self.assertEqual(_compose_allowlist(), frozenset({"api.anthropic.com", "app.aware-wave.com"}))


class IntegrityTests(PgTestCase):   # the check's real-save rows rehearse on a database
    def test_verify_passes_the_integrity_core(self):
        """結論只收人寫的, no scores, every AI action a visible permission reading only the card's drawers, a crisis stops it,
        high risk recognised on every kind of the person's words, routes keep the save path."""
        rows = {row.block: row for row in integrity.run()}
        self.assertEqual(rows["VERIFY"].failures, [])
        self.assertEqual([failure for failure in rows["PLATFORM"].failures if failure[0] in ("routes_keep_the_save_path", "ai_inputs_are_readable")], [])


if __name__ == "__main__":
    unittest.main()
