"""GATHER 蒐集來源 (contract card): a source card for every stored page and every page set aside, every cell one of three
states with why; the grouping into origins and the rule it used; channels and the place's language (管道不足, the system
asks); the person's marks, splits, changes and take-backs (one live record per key); the AI's four turns and what it may
not do. Registry and archive facts come from collect (specs/wire/lookup.v1.json): a fake client answers from the
spec's own examples; nothing reaches outside."""

from __future__ import annotations

import copy
import datetime
import json
import re
import urllib.parse
import uuid
from unittest import mock

import yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import evidence_words as words
from ai_lego.core.domain.kinds.assembler import PURPOSE_PACKAGE, PURPOSES
from ai_lego.core.domain.source import COLLECTED_PROVENANCE, source_record
from ai_lego.data.events import record_log
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, block_hooks, evidence
from ai_lego.platform.block_hooks import gather as hooks
from ai_lego.platform.net import collect_lookups
from ai_lego.platform.net.egress import EGRESS_ALLOWLIST_ENV, egress_allowlist
from ai_lego.platform.rulesets import require
from tests.unit.test_block_foundation import MirrorProvider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

SPEC = json.loads((PRODUCT_ROOT / "specs" / "wire" / "lookup.v1.json").read_text(encoding="utf-8"))
FOUND_ITEM, UNLISTED_ITEM = SPEC["examples"]["describe"]["answer"]["items"]

COMMON = "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家電力裡如水化高自二理起小物現實加量都兩體制機當使點從業本去把性好應開它合還因由其些然前外天政四日那社義事平形相全表間樣與關各重新線內數正心反你明看原又麼利比或但質氣第向道命此變條只沒結解問意建月公無系軍很情者最立代想已通並提直題黨程展五果料象員革位入常文總次品式活設及管特件長求老頭基資邊流路級少圖山統接知較將組見計別她手角期根論運農指幾九區強放決西被幹做必戰先回則任取據處府研"
ZH_SAYS = "公會公告：自二〇一九年起，合約範本第七條改為按月結算。"


def zh(seed: int, length: int = 400) -> str:
    """Chinese-looking text that shares almost no five-character piece with another seed's."""
    return "".join(COMMON[(seed * 7919 + index * 104729 + index * index * seed) % len(COMMON)] for index in range(length))


EN = ("The association said on Monday that the standard contract will be settled every month from next year. "
      "It is the first change to the template since it was written, and members were told in a letter. ") * 3


class FakeCollect:
    """collect's lookups endpoint as the spec shows it: by default every URL gets the spec's found registry record and
    its no-capture archive cell; ``answers`` sets one URL's whole item, ``captures`` its first capture date."""

    def __init__(self):
        self.calls: list[tuple[str, list[dict]]] = []
        self.answers: dict[str, dict] = {}
        self.captures: dict[str, str] = {}
        self.down = False
        self.before = None   # runs at the start of a call (in the hook's thread)

    def lookup(self, project_id, kind, items, timeout):
        self.calls.append((kind, items))
        if self.before:
            self.before()
        if self.down:
            raise InvariantViolation("COLLECT_LOOKUP_UNAVAILABLE: HTTP 503 from app.aware-wave.com")
        return {"kind": kind, "items": [self.item(entry["url"]) for entry in items]}

    def item(self, url):
        if url in self.answers:
            return copy.deepcopy(self.answers[url])
        host = (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.")
        archived = {"state": "查到", "value": self.captures[url]} if url in self.captures else copy.deepcopy(UNLISTED_ITEM["first_archived"])
        return {"url": url, "site": ".".join(host.split(".")[-2:]), "registered": copy.deepcopy(FOUND_ITEM["registered"]),
                "country": copy.deepcopy(FOUND_ITEM["country"]), "first_archived": archived}


class GatherCase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"
        self.docs = CaseDocs(self._repo)
        self.tenant_id = self.tenant["tenant_id"]
        self.owner = record_log.case(self.pid)
        self.collect = FakeCollect()
        patcher = mock.patch.object(collect_lookups, "collection_service_from_env", lambda: self.collect)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.provider = MirrorProvider({})
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider

    def collected(self, url: str, text: str, *, title: str | None = None, published_at: str | None = None, **relevance) -> str:
        """A page the collector stored (same URL + new text = its new version, as ingest does)."""
        content = text.encode("utf-8")
        source_id = str(uuid.uuid4())
        cas_path = TenantScopedCas.cas_path_for(self.tenant_id, content)
        now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        record = source_record(source_id, self.pid, self.tenant_id, title or url, "text/plain", "Confidential", cas_path["hash"], len(content),
                               TenantScopedCas.artifact_uri(self.tenant_id, self.pid, source_id, cas_path), self.identity["identity_id"], now,
                               published_at=published_at, canonical_url=url, source_uri=url, fetched_at=now, provenance=COLLECTED_PROVENANCE,
                               relevance={"searchProvider": "serper", "searchLang": "zh", **relevance})
        [result] = self._repo.ingest_batch(self.tenant_id, self.pid, [(record, cas_path)], put_content=lambda path: self._source_cas.put(self.tenant_id, content))
        return result["source_id"]

    def pasted(self, text: str, title: str = "公會公告") -> str:
        response = self.client.post(f"{self.base}/sources", json={"title": title, "media_type": "text/plain", "data_classification": "Confidential", "content": text})
        self.assertEqual(response.status_code, 200, response.text)
        block_hooks.wait_idle()
        return response.json()["source_id"]

    def arrive(self, aside=None, channels=None, run=None):
        block_hooks.after_sources(self.docs, self.tenant_id, self.owner, {"run": run, "source_ids": None, "aside": aside or [], "channels": channels or [], "pasted": False})
        block_hooks.wait_idle()

    def cards(self):
        return self.docs.current(self.tenant_id, self.owner, "gather.source")

    def card(self, url: str):
        return next(doc for doc in self.cards() if doc["content"].get("url") == url)

    def cell(self, url: str, key: str):
        return self.card(url)["content"]["cells"][key]

    def origins(self):
        return evidence.origins(self.docs, self.tenant_id, self.owner)

    def origin_of(self, card_id: str):
        return next(origin for origin in self.origins() if card_id in [item["card"] for item in origin["cards"]])

    def grouping(self):
        return {frozenset(group["cards"]): group["how"] for group in self.docs.current(self.tenant_id, self.owner, "gather.origins")[-1]["content"]["groups"]}

    def intake(self, *places):
        purpose = PURPOSES[1]
        self.docs.save(self.tenant_id, self.owner, "assembler.intake", {"purpose": purpose, "question": "要不要續約", "package": PURPOSE_PACKAGE[purpose], "happened_in": list(places)},
                       record_log.user(self.identity["identity_id"], "ASSEMBLER"))

    def grant(self, *permissions):
        self.assertEqual(self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": list(permissions)}}).status_code, 200)


class CardTests(GatherCase):
    def test_a_collected_page_gets_one_card_with_every_cell_said_and_a_second_run_adds_nothing(self):
        url = "https://news.example.com/a"
        self.collect.captures[url] = "2025-12-01"
        source_id = self.collected(url, zh(1), published_at="2026-01-02", searchQuery="公會 合約", searchAngle="primary")
        self.arrive()
        [card] = self.cards()
        content = card["content"]
        self.assertEqual(words.cell_errors(content["cells"]), [])   # 每一格都寫三種之一，不留空白
        self.assertEqual(content["found_by"], {"by": "系統找的", "provider": "serper", "lang": "zh", "query": "公會 合約", "angle": "primary"})
        row = self._repo.get_source(self.tenant_id, self.pid, source_id)
        self.assertEqual((content["source_id"], content["snapshot"]["sha256"]), (source_id, row["content_sha256"]))
        self.assertEqual((content["cells"]["registered"], content["cells"]["language"]["value"]), (FOUND_ITEM["registered"], "中文"))
        self.assertEqual((content["cells"]["first_seen"]["value"], content["cells"]["first_seen"]["why"]), ("2025-12-01", "網頁封存館最早存到的日期"))
        self.assertEqual(set(content["rules"]), set(hooks.CARD_RULES))
        self.assertEqual(content["rules"]["gather.grouping"], {"version": require("gather.grouping").version, "fingerprint": require("gather.grouping").fingerprint()})
        self.arrive()
        self.arrive()
        self.assertEqual([(doc["doc_id"], doc["version"]) for doc in self.cards()], [(card["doc_id"], 1)])
        self.assertEqual(self.docs.versions(self.tenant_id, self.owner, "gather.origins", self.docs.current(self.tenant_id, self.owner, "gather.origins")[0]["doc_id"])[-1]["version"], 1)

    def test_a_pasted_file_is_mine_and_says_what_it_cannot_check(self):
        self.pasted(ZH_SAYS + "\n© 2024 某產業公會 版權所有")
        [card] = self.cards()
        cells = card["content"]["cells"]
        self.assertEqual(card["content"]["found_by"], {"by": "我貼的"})
        self.assertEqual((cells["registered"]["state"], cells["first_seen"]["state"], cells["outlet_exists"]["state"]), ("無法檢查", "無法檢查", "無法檢查"))
        self.assertEqual((cells["operator"]["state"], cells["operator"]["value"]), ("查到", "© 2024 某產業公會 版權所有"))
        self.assertEqual(self.collect.calls, [])   # no address: collect is not asked

    def test_a_url_the_person_pasted_is_marked_mine(self):
        self.collected("https://acme.example.com/about", zh(2), pasted=True)
        self.arrive()
        self.assertEqual(self.cards()[0]["content"]["found_by"], {"by": "我貼的"})

    def test_a_page_that_changed_is_a_new_version_of_its_card(self):
        url = "https://news.example.com/a"
        first = self.collected(url, zh(1))
        self.arrive()
        second = self.collected(url, zh(1) + "（更正）")
        self.arrive()
        [card] = self.cards()
        self.assertEqual((card["version"], card["content"]["source_id"]), (2, second))
        old = self.docs.versions(self.tenant_id, self.owner, "gather.source", card["doc_id"])[0]["content"]
        self.assertEqual(old["source_id"], first)
        self.assertNotEqual(old["snapshot"]["sha256"], card["content"]["snapshot"]["sha256"])   # 網頁之後被改過，核對碼會不一樣

    def test_pages_set_aside_get_cards_count_for_nothing_and_can_be_taken_back(self):
        self.collected("https://a.example.com/x", zh(3), aside="講的不是這件事")
        self.arrive(aside=[{"url": "https://b.example.com/y", "title": "B", "reason": "抓不到內文"}])
        self.arrive(aside=[{"url": "https://b.example.com/y", "title": "B", "reason": "抓不到內文"}])
        self.assertEqual(len(self.cards()), 2)
        empty = self.card("https://b.example.com/y")
        self.assertEqual((empty["content"].get("source_id"), empty["content"]["aside"], empty["content"]["cells"]["language"]["state"]), (None, "抓不到內文", "無法檢查"))
        self.assertEqual([origin["counts"] for origin in self.origins()], [False, False])
        aside = self.card("https://a.example.com/x")
        self.assertEqual(self.client.post(f"{self.base}/docs/gather.takeback", json={"content": {"card": aside["doc_id"], "reason": "我看過，是同一件事"}}).status_code, 200)
        self.assertTrue(self.origin_of(aside["doc_id"])["counts"])
        again = self.client.post(f"{self.base}/docs/gather.takeback", json={"content": {"card": aside["doc_id"]}})
        self.assertEqual((again.status_code, again.json()["detail"].split(":")[0]), (409, "GATHER_TAKEBACK_ALREADY_GIVEN"))

    def test_a_page_not_set_aside_cannot_be_taken_back(self):
        self.collected("https://a.example.com/x", zh(3))
        self.arrive()
        response = self.client.post(f"{self.base}/docs/gather.takeback", json={"content": {"card": self.cards()[0]["doc_id"]}})
        self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (400, "GATHER_NOT_ASIDE"))

    def test_a_name_like_an_outlet_on_another_domain_is_said(self):
        self.collected("https://bbc-news-today.xyz/a", zh(4), title="震撼消息 | BBC News")
        self.collected("https://www.bbc.com/zhongwen/b", zh(5), title="報導 - BBC News 中文")
        self.collected("https://dailytruth.example.com/c", zh(6), title="消息 | Daily Truth News")
        self.collected("https://shop.example.com/d", zh(7), title="店家公告")
        self.arrive()
        self.assertEqual(self.cell("https://bbc-news-today.xyz/a", "outlet_exists")["value"], "名字像BBC，但不是BBC的網域")
        self.assertEqual(self.cell("https://www.bbc.com/zhongwen/b", "outlet_exists")["value"], "是BBC的網域")
        self.assertEqual((self.cell("https://www.bbc.com/zhongwen/b", "operator")["value"], self.cell("https://www.bbc.com/zhongwen/b", "country")["value"]), ("BBC", "英國"))
        self.assertEqual(self.cell("https://dailytruth.example.com/c", "outlet_exists")["state"], "無法檢查")
        self.assertEqual(self.cell("https://shop.example.com/d", "outlet_exists")["state"], "查不到")

    def test_a_list_names_its_maintainer_and_version_and_an_empty_list_says_why(self):
        self.collected("https://www.mol.gov.tw/news/1", zh(8))
        self.arrive()
        card = self.card("https://www.mol.gov.tw/news/1")["content"]
        [listed] = card["lists"]
        self.assertEqual((listed["list"], listed["category"], listed["version"]), ("政府網域", "官方", "2026-10"))
        self.assertTrue(listed["maintainer"])
        self.assertEqual((card["cells"]["country"]["value"], card["cells"]["affiliation"]["value"]), ("台灣", "政府機關"))
        for item in require("gather.source_lists").items:
            self.assertTrue(item.get("suffixes") or item.get("domains") or item["empty_because"], item["list"])

    def test_the_language_is_read_from_the_text(self):
        self.assertEqual(hooks._language(zh(1))["value"], "中文")
        self.assertEqual(hooks._language(EN)["value"], "英文")
        self.assertEqual(hooks._language("これは日本語の文章です。東京で会議がありました。" * 3)["value"], "日文")
        self.assertEqual(hooks._language("한국어 문장입니다. 서울에서 회의가 있었습니다." * 3)["value"], "韓文")
        self.assertEqual(hooks._language("Der Verband teilte am Montag mit, dass der Vertrag monatlich abgerechnet wird. " * 3)["state"], "無法檢查")
        self.assertEqual(hooks._language(None)["state"], "無法檢查")


class CollectLookupTests(GatherCase):
    def test_the_spec_examples_fill_the_registry_and_first_seen_cells(self):
        found, unlisted = FOUND_ITEM["url"], UNLISTED_ITEM["url"]
        self.collect.answers = {found: FOUND_ITEM, unlisted: UNLISTED_ITEM}
        self.collected(found, zh(1))
        self.collected(unlisted, zh(2))
        self.arrive()
        self.assertEqual((self.cell(found, "registered"), self.cell(found, "country")), (FOUND_ITEM["registered"], FOUND_ITEM["country"]))
        self.assertEqual(self.cell(found, "first_seen"), {"state": "查到", "value": "2005-01-02", "why": "網頁封存館最早存到的日期"})
        self.assertEqual(self.cell(unlisted, "registered"), UNLISTED_ITEM["registered"])
        self.assertEqual(self.cell(unlisted, "first_seen"), {"state": "查不到", "why": "網頁沒寫日期；網頁封存館沒有存過這一頁"})

    def test_when_collect_does_not_answer_every_lookup_cell_says_so(self):
        self.collect.down = True
        self.collected("https://a.example.com/1", zh(1))
        self.collected("https://b.example.com/2", zh(2), published_at="2026-01-02")
        self.arrive()
        down = SPEC["examples"]["collect_down"]["engine_describe_cell"]
        for url in ("https://a.example.com/1", "https://b.example.com/2"):
            self.assertEqual((self.cell(url, "registered"), self.cell(url, "country")), (down, down))
        self.assertEqual(self.cell("https://a.example.com/1", "first_seen"), {"state": "無法檢查", "why": "網頁沒寫日期；蒐集器這次沒有回應"})
        self.assertEqual(self.cell("https://b.example.com/2", "first_seen"), {"state": "查到", "value": "2026-01-02", "why": "網頁自己寫的日期；網頁封存館：蒐集器這次沒有回應"})

    def test_a_malformed_cell_from_collect_is_uncheckable(self):
        url = "https://a.example.com/1"
        self.collect.answers[url] = {**copy.deepcopy(FOUND_ITEM), "url": url, "country": {"state": "查到"}, "first_archived": {"state": "查到", "value": "去年"}}
        self.collected(url, zh(1))
        self.arrive()
        self.assertEqual(self.cell(url, "country"), {"state": "無法檢查", "why": "蒐集器的回答格式不對"})
        self.assertEqual(self.cell(url, "first_seen"), {"state": "無法檢查", "why": "網頁沒寫日期；蒐集器的回答格式不對"})   # a value that is no date
        self.assertEqual(self.cell(url, "registered"), FOUND_ITEM["registered"])

    def test_ten_pages_of_one_site_ask_collect_once_per_run(self):
        for index in range(10):
            self.collected(f"https://news.example.com/{index}", zh(60 + index))
        self.arrive()
        self.arrive()
        self.assertEqual([(kind, len(items)) for kind, items in self.collect.calls], [("describe", 10)])

    def test_the_earliest_of_the_pages_date_and_the_archive_is_first_seen(self):
        self.collected("https://a.example.com/1", zh(1), published_at="2026-01-02")
        self.collect.captures["https://a.example.com/1"] = "2027-01-01"
        self.arrive()
        self.assertEqual((self.cell("https://a.example.com/1", "first_seen")["value"], self.cell("https://a.example.com/1", "first_seen")["why"]), ("2026-01-02", "網頁自己寫的日期"))

    def test_a_lookalike_name_is_found_in_the_registry_name_or_without_collect_in_the_host(self):
        self.collect.answers["https://bbc.fakehost.xyz/a"] = {**copy.deepcopy(FOUND_ITEM), "url": "https://bbc.fakehost.xyz/a", "site": "fakehost.xyz"}
        self.collected("https://bbc.fakehost.xyz/a", zh(1), title="店家公告")
        self.arrive()
        self.assertEqual(self.cell("https://bbc.fakehost.xyz/a", "outlet_exists")["value"], "名字像BBC，但不是BBC的網域")
        self.collect.down = True
        self.collected("https://bbcnews-today.example.com/b", zh(2), title="店家公告")
        self.arrive()
        self.assertEqual(self.cell("https://bbcnews-today.example.com/b", "outlet_exists")["value"], "名字像BBC，但不是BBC的網域")
        self.assertEqual((hooks._name_tokens("a.b.example.com.tw", "example.com.tw"), hooks._name_tokens("x.example.com", "")), (["a", "b", "example"], ["x", "example", "com"]))

    def test_the_engine_reaches_nothing_outside_itself(self):
        """lookups v1 R9: no registry, archive or fact-check host is the engine's; every outside question goes to collect."""
        found = [f"{path.relative_to(PRODUCT_ROOT)}:{number}" for path in sorted((PRODUCT_ROOT / "ai_lego").rglob("*.py"))
                 for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1) if re.search(r"rdap|wayback|archive\.org", line, re.I)]
        self.assertEqual(found, [])
        compose = yaml.safe_load((PRODUCT_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
        env = dict(entry.split("=", 1) for entry in compose["services"]["cognitive-os-api"]["environment"] if "=" in entry)
        self.assertEqual(egress_allowlist({EGRESS_ALLOWLIST_ENV: env[EGRESS_ALLOWLIST_ENV]}), {"api.anthropic.com", "app.aware-wave.com"})
        policy = yaml.safe_load((resolve_spec_root() / "policies" / "ai-execution" / "network-egress.yaml").read_text(encoding="utf-8"))
        [rule] = [rule for rule in policy["seed_content"]["rules"] if rule["rule_id"] == "EGRESS-EC99-2"]
        self.assertEqual([host for host in rule["allowlist"] if re.search(r"rdap|archive\.org|registry\.google", host)], [])


class GroupingTests(GatherCase):
    def test_copies_of_one_article_are_one_origin_and_the_earliest_is_the_original(self):
        base = zh(10)
        self.collected("https://a.example.com/1", base, published_at="2026-01-01")
        self.collected("https://b.example.org/2", base[:380] + zh(11, 20), published_at="2026-01-05")
        self.collected("https://c.example.net/3", zh(12))
        self.arrive()
        a, b, c = (self.card(url)["doc_id"] for url in ("https://a.example.com/1", "https://b.example.org/2", "https://c.example.net/3"))
        self.assertEqual(self.grouping(), {frozenset({a, b}): "同一篇", frozenset({c}): "單獨"})
        self.assertEqual(sum(origin["counts"] for origin in self.origins()), 2)   # 多不等於真: three pages, two origins
        self.assertEqual((self.cell("https://a.example.com/1", "original")["value"], self.cell("https://b.example.org/2", "original")["value"]), ("原始的", "轉貼的"))
        self.assertEqual(self.cell("https://c.example.net/3", "original")["state"], "查不到")

    def test_a_rewrite_the_system_is_unsure_of_is_marked_may_share_an_origin(self):
        base = zh(20)
        self.collected("https://a.example.com/1", base)
        self.collected("https://b.example.com/2", base[:300] + zh(21, 100))
        self.arrive()
        self.assertEqual(list(self.grouping().values()), ["可能同出處"])
        self.assertEqual(self.cell("https://b.example.com/2", "original")["state"], "查不到")

    def test_pages_with_the_same_main_image_are_one_origin(self):
        self.collected("https://a.example.com/1", zh(30), imageUrl="https://img.example.com/fire.jpg")
        self.collected("https://b.example.com/2", zh(31), imageUrl="https://img.example.com/fire.jpg")
        self.arrive()
        self.assertEqual(list(self.grouping().values()), ["同一張圖"])

    def test_sites_that_only_cite_each_other_are_one_origin_even_when_another_page_cites_them(self):
        self.collected("https://a.example.com/1", zh(40), outlinks=["b.example.net", "c.example.org"])
        self.collected("https://b.example.net/2", zh(41), outlinks=["a.example.com"])
        self.collected("https://c.example.org/3", zh(42), outlinks=["www.a.example.com", "b.example.net"])
        self.collected("https://d.example.info/4", zh(43), outlinks=["a.example.com", "wikipedia.org"])
        self.arrive()
        a, b, c, d = (self.card(url)["doc_id"] for url in ("https://a.example.com/1", "https://b.example.net/2", "https://c.example.org/3", "https://d.example.info/4"))
        self.assertEqual(self.grouping(), {frozenset({a, b, c}): "只互相引用", frozenset({d}): "單獨"})
        self.assertEqual(self.cell("https://a.example.com/1", "original")["value"], "只互相引用，沒有別的依據")

    def test_the_grouping_rule_is_shown_with_its_version(self):
        overview = self.client.get(f"{self.base}/gather").json()
        [rule] = [item for item in overview["rules"] if item["name"] == "gather.grouping"]
        self.assertEqual((rule["title"], rule["version"]), ("分組規則", require("gather.grouping").version))
        self.assertTrue(any("同一篇" in sentence for sentence in rule["items"]["rules"]))


class ChannelTests(GatherCase):
    CHANNELS = [{"provider": "serper", "lang": "zh", "state": "ok"}, {"provider": "serper", "lang": "en", "state": "ok"},
                {"provider": "brave", "lang": "zh", "state": "no_key", "why": "BRAVE_API_KEY unset"}]

    def test_one_engine_is_too_few_and_a_channel_with_no_key_is_said(self):
        self.collected("https://a.example.com/1", zh(1))
        self.arrive(channels=self.CHANNELS, run="r1")
        self.arrive(channels=self.CHANNELS, run="r1")
        [doc] = self.docs.current(self.tenant_id, self.owner, "gather.channels")
        self.assertEqual((doc["content"]["run"], doc["version"], len(doc["content"]["channels"])), ("r1", 1, 3))
        state = self.client.get(f"{self.base}/gather").json()["channels"]
        self.assertEqual([language["key"] for language in state["languages"]], ["en", "zh"])
        self.assertEqual(state["short"], ["只用了 1 家搜尋引擎（Serper（Google 的結果））"])
        self.assertEqual([item["says"] for item in state["blocked"]], ["平台還沒有Brave的金鑰"])

    def test_the_places_language_not_searched_is_too_few_and_none_found_in_it_is_asked(self):
        self.collected("https://a.example.com/1", EN, searchLang="en")
        self.intake("日本", "台北")
        self.arrive(channels=self.CHANNELS, run="r1")
        state = self.client.get(f"{self.base}/gather").json()["channels"]
        self.assertIn("「日本」用日文，平台只用中文和英文找", state["short"])
        self.assertEqual(state["ask"], ["「台北」的語言（中文）一筆都沒找到"])

    def test_nothing_searched_is_not_too_few(self):
        self.pasted(ZH_SAYS)
        state = self.client.get(f"{self.base}/gather").json()["channels"]
        self.assertEqual((state["looked"], state["short"]), (False, []))


class PersonSaveTests(GatherCase):
    def setUp(self):
        super().setUp()
        base = zh(50)
        self.collected("https://a.example.com/1", base)
        self.collected("https://b.example.com/2", base[:390] + zh(51, 10))
        self.collected("https://c.example.com/3", zh(52))
        self.arrive()
        self.a, self.b, self.c = (self.card(url)["doc_id"] for url in ("https://a.example.com/1", "https://b.example.com/2", "https://c.example.com/3"))

    def post(self, kind, content):
        return self.client.post(f"{self.base}/docs/{kind}", json={"content": content})

    def code(self, response):
        return (response.status_code, response.json()["detail"].split(":")[0])

    def test_one_mark_per_origin_on_exactly_its_pages(self):
        origin = self.origin_of(self.a)
        mark = {"origin": origin["origin_id"], "cards": [self.a, self.b], "mark": "存疑", "reason": "兩頁都沒寫誰辦的"}
        first = self.post("gather.mark", mark)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.code(self.post("gather.mark", mark)), (409, "GATHER_MARK_ALREADY_GIVEN"))
        self.assertEqual(self.code(self.post("gather.mark", {**mark, "cards": [self.a]})), (400, "GATHER_MARK_CARDS_MISMATCH"))
        self.assertEqual(self.code(self.post("gather.mark", {**mark, "origin": "o:nothere"})), (404, "GATHER_ORIGIN_NOT_FOUND"))
        moved = self.client.put(f"{self.base}/docs/gather.mark/{first.json()['doc_id']}", json={"content": {**mark, "origin": self.origin_of(self.c)["origin_id"], "cards": [self.c]}, "base_version": 1})
        self.assertEqual(self.code(moved), (400, "GATHER_MARK_ORIGIN_FIXED"))
        changed = self.client.put(f"{self.base}/docs/gather.mark/{first.json()['doc_id']}", json={"content": {**mark, "mark": "不用", "reason": "查到是內容農場"}, "base_version": 1})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertFalse(self.origin_of(self.a)["counts"])

    def test_a_page_still_being_grouped_cannot_be_marked(self):
        card = self.docs.save(self.tenant_id, self.owner, "gather.source", {"url": "https://late.example.com", "found_by": {"by": "系統找的"},
                                                                         "cells": {key: words.cell("查不到", why="x") for key in words.CARD_CELL_KEYS}}, record_log.system("GATHER"))
        origin = self.origin_of(card["doc_id"])
        self.assertEqual(self.code(self.post("gather.mark", {"origin": origin["origin_id"], "cards": [card["doc_id"]], "mark": "採用", "reason": "r"})), (400, "GATHER_ORIGIN_PENDING"))

    def test_one_change_per_card_and_cell_that_stays_with_them(self):
        change = {"card": self.a, "key": "operator", "value": "某產業公會", "reason": "官網頁尾寫的"}
        first = self.post("gather.override", change)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.code(self.post("gather.override", change)), (409, "GATHER_OVERRIDE_ALREADY_GIVEN"))
        self.assertEqual(self.post("gather.override", {**change, "key": "stance"}).status_code, 200)
        self.assertEqual(self.code(self.post("gather.override", {**change, "card": "nope"})), (404, "GATHER_CARD_NOT_FOUND"))
        moved = self.client.put(f"{self.base}/docs/gather.override/{first.json()['doc_id']}", json={"content": {**change, "key": "country"}, "base_version": 1})
        self.assertEqual(self.code(moved), (400, "GATHER_OVERRIDE_FIXED"))
        mine = next(card for card in self.origin_of(self.a)["cards"] if card["card"] == self.a)["mine"]
        self.assertEqual(mine["operator"], {"value": "某產業公會", "reason": "官網頁尾寫的"})

    def test_a_split_takes_part_of_one_group(self):
        self.assertEqual(self.code(self.post("gather.split", {"cards": [self.a, self.b], "reason": "整組"})), (400, "GATHER_SPLIT_INVALID"))
        self.assertEqual(self.code(self.post("gather.split", {"cards": [self.a, self.c], "reason": "跨組"})), (400, "GATHER_SPLIT_INVALID"))
        split = self.post("gather.split", {"cards": [self.b], "reason": "改寫過，不是同一篇"})
        self.assertEqual(split.status_code, 200, split.text)
        self.assertEqual(sum(origin["counts"] for origin in self.origins()), 3)
        moved = self.client.put(f"{self.base}/docs/gather.split/{split.json()['doc_id']}", json={"content": {"cards": [self.a], "reason": "x"}, "base_version": 1})
        self.assertEqual(self.code(moved), (400, "GATHER_SPLIT_FIXED"))
        self.arrive()   # a regroup does not undo the person's split
        self.assertEqual(sum(origin["counts"] for origin in self.origins()), 3)

    def test_a_source_card_is_never_deleted_and_never_written_by_the_person_or_the_ai(self):
        self.assertEqual(self.code(self.client.delete(f"{self.base}/docs/gather.source/{self.a}")), (400, "DOC_NOT_DELETABLE"))
        card = {"url": "https://x", "found_by": {"by": "系統找的"}, "cells": {key: words.cell("查不到", why="x") for key in words.CARD_CELL_KEYS}}
        self.assertEqual(self.code(self.post("gather.source", card)), (403, "RECORD_AUTHOR_NOT_ALLOWED"))
        for kind, content in (("gather.source", card), ("gather.mark", {"origin": "o:1", "cards": [self.a], "mark": "不用", "reason": "AI 說的"}),
                              ("gather.origins", {"groups": [{"cards": [self.a], "how": "單獨"}], "rules_version": "1"})):
            with self.assertRaises(InvariantViolation, msg=kind):
                self.docs.save(self.tenant_id, self.owner, kind, content, record_log.ai("GATHER"))

    def test_my_own_words_are_kept_apart_and_never_become_a_source(self):
        own = self.post("gather.own", {"text": "我聽同業說公會要改合約"})
        self.assertEqual(own.status_code, 200, own.text)
        self.arrive()
        self.assertEqual((len(self._repo.list_sources(self.tenant_id, self.pid)), len(self.cards())), (3, 3))
        self.assertEqual(self.client.get(f"{self.base}/gather").json()["words"]["own"], words.OWN_WORDS)


class AiTests(GatherCase):
    def turn(self, action, context=None, answer=None):
        self.provider.answer = answer or {}
        self.provider.calls.clear()
        return self.client.post(f"{self.base}/ai/GATHER/{action}", json={"context": context or {}})

    def one_source(self):
        sid = self.collected("https://a.example.com/1", ZH_SAYS)
        self.arrive()
        return sid, self.card("https://a.example.com/1")["doc_id"]

    def test_the_ai_never_reads_feelings_or_judgments(self):
        actions = [action for (block, _), action in ai_gate.actions().items() if block == "GATHER"]
        self.assertEqual(len(actions), 4)
        for action in actions:
            self.assertEqual([kind for kind in action.reads if kind.startswith(("sense.", "decide."))], [], action.name)

    def test_the_turns_that_use_outside_sources_need_the_contracts_grant(self):
        self.one_source()
        for action in ("queries", "summarise", "compare"):
            self.assertEqual(self.turn(action, {"go_on": True}).status_code, 403, action)

    def test_under_two_origins_or_too_few_channels_the_summary_hands_back_before_any_model_call(self):
        sid, card = self.one_source()
        self.grant("search_external")
        result = self.turn("summarise").json()
        self.assertIn("獨立出處只有 1 個，不到 2 個", result["handback"])
        self.assertIn("管道不足：只用了 1 家搜尋引擎", result["handback"])
        self.assertEqual(self.provider.calls, [])
        saved = self.turn("summarise", {"go_on": True}, {"items": [{"card": card, "says": "公會把第七條改成按月結算。", "quote": "合約範本第七條改為按月結算", "citations": [f"source:{sid}"]}]})
        self.assertEqual(saved.status_code, 200, saved.text)
        [item] = saved.json()["saved"]["content"]["items"]
        self.assertEqual((item["says"], saved.json()["saved"]["author"]), ("這個來源說：公會把第七條改成按月結算。", "ai"))

    def test_a_summary_that_names_no_source_or_misquotes_is_not_saved(self):
        sid, card = self.one_source()
        self.grant("search_external")
        for item in ({"card": card, "says": "公會改了合約。", "quote": "公會說同業都這樣改", "citations": [f"source:{sid}"]}, {"says": "公會改了合約。"}):
            response = self.turn("summarise", {"go_on": True}, {"items": [item]})
            self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (502, "AI_ANSWER_UNCITED"))
        self.assertEqual(self.docs.current(self.tenant_id, self.owner, "gather.ai_says"), [])

    def test_two_sources_that_contradict_stand_side_by_side(self):
        a = self.collected("https://a.example.com/1", ZH_SAYS)
        b = self.collected("https://b.example.com/2", "工會聲明：合約範本第七條沒有改，仍然按件結算。")
        self.arrive()
        self.grant("search_external")
        side = lambda sid, url, quote: {"card": self.card(url)["doc_id"], "quote": quote, "citations": [f"source:{sid}"]}   # noqa: E731
        answer = {"conflicts": [{"about": "第七條有沒有改", "a": side(a, "https://a.example.com/1", "第七條改為按月結算"), "b": side(b, "https://b.example.com/2", "第七條沒有改，仍然按件結算"), "winner": "a"}],
                  "missing": [{"side": "會員自己", "why": "兩個來源都是組織的聲明"}]}
        saved = self.turn("compare", {"go_on": True}, answer)
        self.assertEqual(saved.status_code, 200, saved.text)
        [conflict] = saved.json()["saved"]["content"]["conflicts"]
        self.assertEqual(set(conflict), {"about", "a", "b"})   # 不選邊: nothing that picks one is kept

    def test_without_the_grant_the_ai_organises_only_what_i_pasted(self):
        searched_sid, searched = self.one_source()
        pasted_sid = self.pasted(ZH_SAYS + "（會員信）", "會員信")
        pasted = next(doc["doc_id"] for doc in self.cards() if doc["content"].get("source_id") == pasted_sid)
        refused = self.turn("organize", {"cards": [pasted, searched]})
        self.assertEqual((refused.status_code, refused.json()["detail"].split(":")[0]), (400, "GATHER_ORGANIZE_PASTED_ONLY"))
        self.assertEqual(self.turn("organize", {}).status_code, 400)
        saved = self.turn("organize", {"cards": [pasted]}, {"items": [{"card": pasted, "says": "會員信說第七條改了。", "quote": "合約範本第七條改為按月結算", "citations": [f"source:{pasted_sid}"]}], "question": "這封信是誰寄的？"})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertNotIn(f"source:{searched_sid}", self.provider.calls[0][1])

    def test_suggested_queries_are_ones_the_platform_can_run(self):
        self.post_ask("公會有沒有改合約範本")
        self.grant("search_external")
        answer = {"queries": [{"text": "公會 合約範本 第七條", "lang": "zh", "angle": "primary"}, {"text": "guild contract template", "lang": "en", "angle": "news"},
                              {"text": "x", "lang": "ja", "angle": "news"}, {"text": "y", "lang": "zh", "angle": "rumour"}]}
        saved = self.turn("queries", {}, answer)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual([(query["lang"], query["angle"]) for query in saved.json()["saved"]["content"]["queries"]], [("zh", "primary"), ("en", "news")])

    def test_a_crisis_word_in_what_i_look_for_stops_the_ai(self):
        self.post_ask("我不想活了，查一下怎麼辦")
        self.grant("search_external")
        self.assertEqual(self.turn("queries").json().get("stopped"), "crisis")
        self.assertEqual(self.provider.calls, [])

    def post_ask(self, text):
        response = self.client.post(f"{self.base}/docs/gather.ask", json={"content": {"text": text, "angles": ["primary", "news"]}})
        self.assertEqual(response.status_code, 200, response.text)


class RouteAndEgressTests(GatherCase):
    def test_only_the_cases_owner_reads_its_overview(self):
        self.collected("https://a.example.com/1", zh(1))
        self.arrive()
        body = self.client.get(f"{self.base}/gather").json()
        self.assertEqual((body["counted"], body["min_origins"], body["aside"], body["data_classification"]), (1, words.MIN_ORIGINS, 0, "Confidential"))
        self.assertEqual(body["distribution"]["engine"], {"Serper（Google 的結果）": 1})
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"{self.base}/gather").status_code, 404)

    def test_erasing_the_case_erases_its_cards_and_stored_pages(self):
        self.collected("https://a.example.com/1", zh(1))
        self.arrive()
        self.assertEqual(self.client.delete(self.base).status_code, 200)
        self.assertEqual((self.cards(), self._repo.list_sources(self.tenant_id, self.pid)), ([], []))

    def test_a_case_erased_while_its_pages_are_looked_up_gets_nothing_written_back(self):
        self.collected("https://a.example.com/1", zh(1))
        erased = []
        self.collect.before = lambda: erased.append(self.client.delete(self.base).status_code)   # the hook's thread: record, assert here
        self.arrive()
        self.assertEqual((erased, self.cards()), ([200], []))


if __name__ == "__main__":
    import unittest

    unittest.main()
