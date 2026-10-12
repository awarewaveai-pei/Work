"""GOVERN (build step 1): crisis and high-risk detection, the guardrail hook, export, account deletion, version records,
the AI that explains a setting, and the rule that GOVERN moves data without reading it into any AI."""

from __future__ import annotations

import ast
import base64
import json
import os
import re
import unittest
import uuid
from pathlib import Path
from unittest import mock

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.apps.recipe_runtime import persist_artifact_output
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.blocks import ALL_CODES
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.rulesets import rulesets
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from tests.unit.case_fixture import a_case
from ai_lego.errors import InvariantViolation
from ai_lego.platform import safety
from ai_lego.platform.ai_actions.govern import TOPICS
from ai_lego.platform.block_hooks import after_save
from ai_lego.platform.block_hooks.govern import _recognise, written
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.safety import risk
from ai_lego.platform.workflow.run_lock import acquire_run_lock, lock_path_for
from tests.pg import PgTestCase, add_tenant, dump, empty_tables
from tests.unit.test_block_foundation import MirrorProvider
from tests.unit.test_business_plan_full_recipe import full_source
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

HIGH_RISK_NAMES = {"健康", "法律", "金錢", "人身安全", "急性心理危機", "要公開散布"}


class CrisisDetectionTests(unittest.TestCase):
    def test_a_signal_is_not_missed_because_of_how_it_was_typed(self):
        for text in ("I don’t want to live anymore", "ｋｉｌｌ ｍｙｓｅｌｆ", "我 不 想 活 了", "我想自杀", "最近總是想輕生", "他每天都打我", "I want to die", "he keeps hitting me",
                     "self‑harm", "我想跳樓", "kill​ myself", "最近真的不想活了", "我想結束自己", "my dad beat me up", "she punched me", "he chokes me", "he kicked me"):
            self.assertTrue(safety.crisis_signal(text), text)

    def test_the_same_characters_inside_another_word_are_not_a_signal(self):
        for text in ("他總是被打斷", "我被打擊得很慘", "跳樓大拍賣", "I have a skill here", "I want to diet", "我被打動了", "請打我電話", "beats me", "他被打敗了", "合夥人又改條件",
                     "我想死你了", "I need to cut myself some slack", "he kicked me out", "my boyfriend hit me up", "my brother beats me at chess"):
            self.assertFalse(safety.crisis_signal(text), text)

    def test_only_text_is_read(self):
        self.assertFalse(safety.crisis_signal(None, 3, ["想死"]))
        self.assertTrue(safety.crisis_signal(None, "想死"))

    def test_places_get_their_own_lines_and_every_other_place_gets_the_international_ones(self):
        for place in ("台北", "Kaohsiung", "我在台灣", "臺中市"):
            self.assertTrue(safety.covers(place), place)
            self.assertIn("1925", [item["contact"] for item in safety.resources(place)])
        for place in (None, "", "Paris", "紐約"):
            self.assertFalse(safety.covers(place), place)
            self.assertEqual(safety.resources(place), list(safety.INTERNATIONAL_RESOURCES))

    def test_the_version_of_a_list_is_what_the_list_says(self):
        before, words = safety.fingerprint(), risk.fingerprint()
        with mock.patch.object(safety, "SIGNALS", safety.SIGNALS + ("zzz",)):
            self.assertNotEqual(safety.fingerprint(), before)
        with mock.patch.object(risk, "WORDS", {**risk.WORDS, "法律": risk.WORDS["法律"] + ("zzz",)}):
            self.assertNotEqual(risk.fingerprint(), words)
        self.assertEqual((safety.fingerprint(), risk.fingerprint()), (before, words))


class HighRiskDetectionTests(unittest.TestCase):
    def test_each_category_is_found_in_the_words_that_carry_it(self):
        found = {
            "健康": "我爸生病要開刀手術", "法律": "對方說要找律師提告", "金錢": "要不要借錢投資", "人身安全": "他一直威脅我", "要公開散布": "我想在社群媒體發文",
            "急性心理危機": "我想結束自己",
        }
        self.assertEqual(set(found), HIGH_RISK_NAMES)
        for category, text in found.items():
            self.assertIn(category, risk.high_risk_categories(text), text)

    def test_a_common_word_in_its_everyday_sense_is_not_a_risk(self):
        for text in ("我想維持健康的關係", "非暴力溝通", "他花太多時間在社群媒體", "保險起見我再確認一次", "investigate the matter", "I feel pressure", "個人 SWOT 的 threats",
                     "stock of ideas", "healthy boundaries", "有錢包", "基金會的活動", "這個藝術治療的活動", "我常常有不安全感", "多媒體簡報"):
            self.assertEqual(risk.high_risk_categories(text), [], text)

    def test_the_categories_come_in_the_lists_order_and_only_from_text(self):
        self.assertEqual(risk.high_risk_categories("合約和錢", "要不要續約", None, 5), ["法律", "金錢"])
        self.assertEqual(risk.high_risk_categories("我想結束自己，也想找律師"), ["法律", "急性心理危機"])
        self.assertEqual(risk.high_risk_categories(), [])


class RecognitionHookTests(PgTestCase):
    def setUp(self):
        empty_tables(self.databases)   # a fresh database per test, as the temp file was
        self.repo = ProjectSourceRepository(self.databases)
        self.docs = CaseDocs(self.repo)
        self.owner = a_case(self.repo, add_tenant(self.databases, "t"), "C1")

    def _card(self, text, writer=None):
        doc = self.docs.save("t", self.owner, "sense.card", {"category": "事件", "text": text}, writer or record_log.user("me", "SENSE"))
        return after_save(self.docs, "t", self.owner, doc)

    def _guardrails(self):
        return sorted((doc["content"]["category"], doc["content"]["guardrail"], doc["content"]["found_by"]) for doc in self.docs.current("t", self.owner, "govern.guardrail"))

    def test_words_in_a_card_add_the_guardrails_and_name_the_block_that_found_them(self):
        notices = [notice for notice in self._card("醫生說要手術，我也怕公司的合約") if notice["type"] == "guardrail"]   # 醫生說 is also SENSE's VERIFY proposal
        self.assertEqual([(notice["type"], notice["category"], notice["found_by"]) for notice in notices], [("guardrail", "健康", "SENSE"), ("guardrail", "法律", "SENSE")])
        self.assertEqual(self._guardrails(), [(category, guardrail, "SENSE") for category in ("健康", "法律") for guardrail in ("professional", "require_sources", "wait_or_review")])

    def test_a_category_already_guarded_is_not_added_again(self):
        self._card("要手術")
        self.assertEqual([notice for notice in self._card("又要檢查，醫生說的") if notice["type"] == "guardrail"], [])
        self.assertEqual(len(self._guardrails()), 3)

    def test_the_guardrail_keeps_the_category_never_the_words(self):
        marker = "ZQX-HOSPITAL-NOTE"
        self._card(f"{marker} 要手術")
        govern_rows = [row for row in dump(self.databases) if row.startswith("events:") and "govern.guardrail" in row]
        self.assertEqual(len(govern_rows), 3)
        self.assertFalse(any(marker in row for row in govern_rows))

    def test_only_what_the_person_wrote_counts(self):
        mirror = self.docs.save("t", self.owner, "sense.mirror", {"summary": "你提到手術和律師。"}, record_log.ai("SENSE"))
        self.assertEqual(after_save(self.docs, "t", self.owner, mirror), [])
        self.assertEqual(self._guardrails(), [])
        joint = self.docs.save("t", self.owner, "sense.mirror", {"summary": "你提到手術和律師，我改成：要手術。"}, record_log.user("me", "SENSE"), doc_id=mirror["doc_id"], base_version=1)
        self.assertEqual(joint["author"], "joint")
        self.assertEqual([notice["category"] for notice in after_save(self.docs, "t", self.owner, joint)], ["健康", "法律"])

    def test_a_choice_the_system_offered_is_not_the_persons_words(self):
        doc = self.docs.save("t", self.owner, "sense.card", {"category": "恐懼", "text": "我怕"}, record_log.user("me", "SENSE"))
        self.assertEqual(after_save(self.docs, "t", self.owner, doc), [])

    def test_with_no_case_the_person_is_told_to_open_one_and_nothing_is_added(self):
        doc = {"doc_id": "d", "kind": "sense.card", "version": 1, "content": {"category": "事件", "text": "要開刀手術"}, "author": "user", "block": "SENSE", "at": ""}
        from ai_lego.platform.block_hooks.govern import OPEN_A_CASE
        self.assertEqual(_recognise(self.docs, "t", record_log.person("me"), doc), [{"type": "suggest_case", "categories": ["健康"], "notice": OPEN_A_CASE}])
        self.assertEqual(self.docs.current("t", record_log.person("me"), "govern.guardrail"), [])

    def _intake(self, **fields):
        content = {"purpose": "複雜決策", "question": "要不要換工作", "package": "個人複雜決策", **fields}
        doc = self.docs.save("t", self.owner, "assembler.intake", content, record_log.user("me", "ASSEMBLER"))
        return after_save(self.docs, "t", self.owner, doc), doc

    def test_the_places_in_an_intake_are_not_what_happened(self):
        notices, doc = self._intake(you_are_in="台大醫院旁邊", happened_in=["法院路"], others_in=["警察局對面"], field_contact="醫生的朋友")
        self.assertEqual((notices, self._guardrails()), ([], []))
        self.assertEqual(written(doc), ["要不要換工作"])

    def test_the_risk_written_in_an_intake_still_adds_the_guardrails_once(self):
        notices, _ = self._intake(risk="對方可能提告", you_are_in="台北")
        self.assertEqual([(notice["category"], notice["found_by"]) for notice in notices], [("法律", "ASSEMBLER")])
        self.assertEqual(len(self._guardrails()), 3)

    def test_what_the_system_listed_is_not_scanned_and_its_own_labels_are_not_the_persons_words(self):
        """Each kind says it on its fields (doc_kinds.Field scan / labels): places and what the system listed are not read;
        a facet name or a claim kind the system offers is a label, a facet the person names is their words."""
        self.assertFalse(doc_kinds.require("assembler.intake").fields["you_are_in"].scan)
        self.assertFalse(doc_kinds.require("decide.judgment").fields["influences_listed"].scan)
        self.assertEqual(written({"kind": "sense.card", "content": {"category": "事件", "text": "他被打斷"}}), ["他被打斷"])
        self.assertEqual(written({"kind": "context.notes", "content": {"facets": [{"facet": "法律", "relevant": True}, {"facet": "合約糾紛", "custom": True}]}}), ["合約糾紛"])
        self.assertEqual(written({"kind": "map.map", "content": {"claims": [{"id": "c1", "text": "同業的做法", "kind": "法律", "by": "user"}]}}), ["c1", "同業的做法", "user"])

    def test_where_you_are_is_not_scanned(self):
        saved = self.docs.save("t", record_log.person("me"), "govern.location", {"where": "在醫院的律師事務所"}, record_log.user("me", "GOVERN"))
        self.assertEqual(after_save(self.docs, "t", record_log.person("me"), saved), [])


class TwoAnswerProvider(MirrorProvider):
    """Answers a SENSE mirror turn and a GOVERN explain turn each with what it asks for."""
    EXPLAIN = {"explanation": "你在哪裡：這一項可以不填。"}

    def __init__(self):
        super().__init__()
        self.mirror = dict(self.answer)

    def complete_json(self, system, user, *, max_tokens, **options):
        self.answer = self.EXPLAIN if "Explain one setting" in system else self.mirror
        return super().complete_json(system, user, max_tokens=max_tokens, **options)


class GovernApiTestCase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.workflows = CustomWorkflowRepository(self.databases)
        api_main.app.dependency_overrides[api_main.get_custom_workflow_repository] = lambda: self.workflows
        patcher = mock.patch.object(api_main, "PRODUCT_ROOT", Path(self._proj_tmpdir.name))   # recipe-run files go to this test's folder
        patcher.start()
        self.addCleanup(patcher.stop)
        self.provider = TwoAnswerProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def _card(self, text, pid=None):
        response = self.client.post(f"/projects/{pid or self.pid}/docs/sense.card", json={"content": {"category": "事件", "text": text}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _login_as(self, email):
        store = api_main.app.dependency_overrides[api_main.get_store]()
        if store._find_identity_by_email(self.tenant["tenant_id"], email) is None:
            store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], email, email.split("@")[0], "correct-horse-battery")
        self.assertEqual(self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": email, "password": "correct-horse-battery"}).status_code, 200)

    def _run(self, identity_id, run_id, project_id=None, text="RUN-OUTPUT", sidecar=True):
        """A recipe run's files: a journal that names the artifact its step stored and the sidecar the server writes beside every
        run (``sidecar=False``: a run from before it was written for runs on no case)."""
        tenant_id = self.tenant["tenant_id"]
        reference = api_main.app.dependency_overrides[api_main.get_artifact_store]().put(tenant_id, "ProposalDraft", {"content": f"{text} {run_id}"})
        journal = api_main.workflow_journal_path(tenant_id, run_id, identity_id)
        journal.parent.mkdir(parents=True, exist_ok=True)
        journal.write_text(json.dumps({"status": "SUCCEEDED", "context": {"outputs": {"step-1": {"artifact": {"cas_reference": reference}}}}}), encoding="utf-8")
        if sidecar:
            api_main._run_case_path(journal).write_text(json.dumps({"project_id": project_id, "artifacts": [reference]}), encoding="utf-8")
        return journal, reference

    def _stored_run(self, identity_id, run_id, project_id=None, content="SAME-CHART-BYTES"):
        """A run as the server really leaves it: the artifact stored by the runtime, recorded beside the journal by the server's own function."""
        tenant_id = self.tenant["tenant_id"]
        journal = api_main.workflow_journal_path(tenant_id, run_id, identity_id)
        journal.parent.mkdir(parents=True, exist_ok=True)
        sidecar = api_main._run_case_path(journal)
        sidecar.write_text(json.dumps({"project_id": project_id, "artifacts": []}), encoding="utf-8")
        stored = persist_artifact_output(tenant_id, api_main.app.dependency_overrides[api_main.get_artifact_store](), {"artifact": {"artifact_type": "image/png", "content": content}})
        output = api_main._record_run_artifact(sidecar, stored)
        journal.write_text(json.dumps({"status": "SUCCEEDED", "context": {"outputs": {"chart": output}}}), encoding="utf-8")
        return journal, output["artifact"]["cas_reference"]

    def _workflow(self, identity_id, title="Mine"):
        self.workflows.create({"workflow_id": str(uuid.uuid4()), "tenant_id": self.tenant["tenant_id"], "title": title, "method_ids": ["a.b"], "created_by_identity_id": identity_id,
                               "created_at": "2026-10-03T00:00:00Z", "updated_at": "2026-10-03T00:00:00Z"})


class HelpTests(GovernApiTestCase):
    def test_help_needs_no_session_and_gives_the_international_lines(self):
        self.client.cookies.clear()
        body = self.client.get("/govern/help").json()
        self.assertEqual((body["notice"], body["covered"], body["where"]), (safety.NOT_THERAPY, False, None))
        self.assertEqual(body["resources"], list(safety.INTERNATIONAL_RESOURCES))

    def test_help_follows_the_place_asked_for_or_the_one_saved_in_the_account(self):
        self.assertEqual(self.client.get("/govern/help").json()["covered"], False)
        self.client.post("/me/docs/govern.location", json={"content": {"where": "高雄"}})
        saved = self.client.get("/govern/help").json()
        self.assertEqual((saved["where"], saved["covered"]), ("高雄", True))
        self.assertEqual(self.client.get("/govern/help", params={"where": "Paris"}).json()["covered"], False)
        self.assertEqual(self.client.get("/govern/help", params={"where": "x" * 201}).status_code, 422)


class GovernRecordsTests(GovernApiTestCase):
    """The platform's own records are the system's: a person reads them, never writes or removes them."""

    def test_a_person_cannot_write_a_guardrail_a_stop_or_a_version_record(self):
        for kind, content in (("govern.guardrail", {"guardrail": "require_sources", "category": "法律", "found_by": "SENSE"}),
                              ("govern.stop", {"reason": "crisis", "block": "SENSE"}),
                              ("govern.ai_call", {"block": "SENSE", "action": "mirror", "model": "m", "instructions_sha256": "0" * 64})):
            response = self.client.post(f"{self.base}/docs/{kind}", json={"content": content})
            self.assertEqual(response.status_code, 403, kind)
            self.assertIn("RECORD_AUTHOR_NOT_ALLOWED", response.text)
            self.assertEqual(self.client.get(f"{self.base}/docs/{kind}").json(), [], kind)

    def test_a_guardrail_cannot_be_taken_off_by_deleting_it(self):
        self._card("要手術")
        guardrails = self.client.get(f"{self.base}/docs/govern.guardrail").json()
        self.assertEqual(len(guardrails), 3)
        response = self.client.delete(f"{self.base}/docs/govern.guardrail/{guardrails[0]['doc_id']}")
        self.assertEqual(response.status_code, 400)
        self.assertIn("DOC_NOT_DELETABLE", response.text)
        self.assertEqual(len(self.client.get(f"{self.base}/docs/govern.guardrail").json()), 3)

    def test_the_guardrails_the_person_reads_are_the_systems_and_name_the_block_and_the_category(self):
        self._card("要手術")
        for doc in self.client.get(f"{self.base}/docs/govern.guardrail").json():
            self.assertEqual((doc["author"], doc["block"], doc["content"]["category"], doc["content"]["found_by"]), ("system", "GOVERN", "健康", "SENSE"))
            self.assertEqual(set(doc["content"]), {"guardrail", "category", "found_by"})


class ExportTests(GovernApiTestCase):
    def _history(self):
        card = self._card("合夥人第三次改條件")
        for text in ("他第三次改條件", "他第三次又改條件"):
            card = self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": text}, "base_version": card["version"]}).json()
        gone = self._card("寫完又刪掉的秘密")
        self.assertEqual(self.client.delete(f"{self.base}/docs/sense.card/{gone['doc_id']}").status_code, 200)
        self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}})
        return card

    def test_a_case_exports_every_version_with_its_author_and_block(self):
        card = self._history()
        response = self.client.get(f"{self.base}/govern/export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["content-disposition"])
        data = response.json()
        self.assertEqual((data["format"], data["scope"], len(data["cases"])), ("cognitive-os-export/1", "case", 1))
        records = data["cases"][0]["records"]
        mine = [record for record in records if record["aggregate_id"] == f"doc:{card['doc_id']}"]
        self.assertEqual([(record["payload"]["version"], record["author"], record["block"]) for record in mine], [(1, "user", "SENSE"), (2, "user", "SENSE"), (3, "user", "SENSE")])
        self.assertEqual([record["payload"]["content"]["text"] for record in mine][0], "合夥人第三次改條件")
        self.assertIn(("ai", "SENSE"), {(record["author"], record["block"]) for record in records if record["payload"].get("kind") == "sense.mirror"})
        self.assertTrue(all(record["author"] and record["block"] for record in records))
        self.assertNotIn("寫完又刪掉的秘密", response.text)
        self.assertEqual([record["type"] for record in records if record["payload"].get("kind") == "sense.card" and record["payload"]["doc_id"] != card["doc_id"]], ["DocDeleted"])

    def test_a_run_on_the_case_and_its_artifact_are_exported_with_the_case_and_a_run_on_no_case_with_the_account(self):
        me = self.identity["identity_id"]
        self._run(me, "run-on-case", self.pid, "CASE-RUN")
        self._run(me, "run-on-nothing", None, "LOOSE-RUN")
        self._run("SOMEONE-ELSE", "run-of-another", None, "OTHERS-RUN")
        case = self.client.get(f"{self.base}/govern/export").json()["cases"][0]
        self.assertEqual([(run["run_id"], run["project_id"]) for run in case["runs"]], [("run-on-case", self.pid)])
        self.assertEqual([artifact["value"] for artifact in case["runs"][0]["artifacts"]], [{"content": "CASE-RUN run-on-case"}])
        response = self.client.get("/govern/export")
        data = response.json()
        self.assertEqual([run["run_id"] for run in data["person"]["runs"]], ["run-on-nothing"])
        self.assertEqual([run["run_id"] for run in data["cases"][0]["runs"]], ["run-on-case"])
        self.assertEqual(data["person"]["runs"][0]["artifacts"][0]["value"], {"content": "LOOSE-RUN run-on-nothing"})
        self.assertNotIn("OTHERS-RUN", response.text)
        markdown = self.client.get("/govern/export", params={"format": "md"}).text
        self.assertIn("### 工作流執行：run-on-nothing", markdown)
        self.assertIn("### 工作流執行：run-on-case", markdown)
        self.assertEqual(len([line for line in markdown.split("\n") if line.startswith("```")]) % 2, 0)

    def test_the_markdown_is_readable_and_has_the_same_content(self):
        self._history()
        self.client.post(f"{self.base}/sources", json={"title": "Note", "media_type": "text/plain", "data_classification": "Confidential", "content": "來源的原文 hello"})
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        reference = artifacts.put(self.tenant["tenant_id"], "TestArtifact", {"結果": "AI 的分析"})
        repo.save_interpretation(self.tenant["tenant_id"], self.pid, "I-1", reference, "2026-10-03T00:00:00Z", block="MAP")
        response = self.client.get(f"{self.base}/govern/export", params={"format": "md"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/markdown"))
        text = response.text
        for expected in ("# 認知作業系統：資料匯出", "## 案子：EdD study", "外化卡（sense.card）", "**第 3 版** · 你寫的 · SENSE", "他第三次又改條件", "AI 寫的 · SENSE",
                         "### 來源：Note", "來源的原文 hello", "AI 產出：TestArtifact", "AI 的分析"):
            self.assertIn(expected, text)
        self.assertNotIn("寫完又刪掉的秘密", text)
        self.assertEqual(len([line for line in text.split("\n") if line.startswith("```")]) % 2, 0)
        self.assertEqual(self.client.get(f"{self.base}/govern/export", params={"format": "pdf"}).status_code, 422)

    def test_a_text_that_holds_a_code_fence_does_not_break_the_markdown(self):
        self.client.post(f"{self.base}/sources", json={"title": "Fence", "media_type": "text/plain", "data_classification": "Confidential", "content": "before\n```\ninside\n```\nafter"})
        text = self.client.get(f"{self.base}/govern/export", params={"format": "md"}).text
        self.assertIn("````\nbefore\n```\ninside\n```\nafter\n````", text)

    def test_nobody_else_gets_my_case_and_a_signed_out_caller_gets_nothing(self):
        self._card("只有我看得到")
        self._login_as("colleague@example.com")
        self.assertEqual(self.client.get(f"{self.base}/govern/export").status_code, 404)
        self.client.cookies.clear()
        self.assertEqual(self.client.get(f"{self.base}/govern/export").status_code, 401)
        self.assertEqual(self.client.get("/govern/export").status_code, 401)

    def test_the_account_export_is_everything_i_own_and_nothing_of_anyone_elses(self):
        self._card("我的卡")
        self.client.post("/me/docs/govern.location", json={"content": {"where": "台北"}})
        self._workflow(self.identity["identity_id"], "我的工作流")
        self._login_as("colleague@example.com")
        other = self._create_project(name="Colleague case")["project_id"]
        self._card("COLLEAGUE-SECRET", other)
        self.client.post("/me/docs/govern.location", json={"content": {"where": "COLLEAGUE-PLACE"}})
        self._workflow(store_identity(self, "colleague@example.com"), "COLLEAGUE-FLOW")
        self._login_as("user@example.com")
        response = self.client.get("/govern/export")
        data = response.json()
        self.assertEqual(data["identity"]["email"], "user@example.com")
        self.assertEqual([case["project"]["name"] for case in data["cases"]], ["EdD study"])
        self.assertEqual([record["payload"]["content"]["where"] for record in data["person"]["records"]], ["台北"])
        self.assertEqual([item["title"] for item in data["person"]["workflows"]], ["我的工作流"])
        for secret in ("COLLEAGUE-SECRET", "COLLEAGUE-PLACE", "COLLEAGUE-FLOW", "Colleague case"):
            self.assertNotIn(secret, response.text)
        self.assertNotIn("password", response.text)
        markdown = self.client.get("/govern/export", params={"format": "md"}).text
        self.assertIn("## 你個人的紀錄（不屬於任何案子）", markdown)
        self.assertIn("- 我的工作流（1 個工具）", markdown)


def store_identity(case, email):
    return api_main.app.dependency_overrides[api_main.get_store]()._find_identity_by_email(case.tenant["tenant_id"], email)["identity_id"]


class AccountErasureTests(GovernApiTestCase):
    PHRASE = "刪除我的帳號"
    FRESH_TABLES = True   # its tests read the whole database for what must be gone

    def setUp(self):
        super().setUp()
        self.me = self.identity["identity_id"]
        self.tenant_id = self.tenant["tenant_id"]
        self.second = self._create_project(name="Second case")["project_id"]
        self._card("PRIVATE-CARD-ONE")
        self._card("PRIVATE-CARD-TWO", self.second)
        self.client.post("/me/docs/govern.location", json={"content": {"where": "PRIVATE-PLACE"}})
        self._workflow(self.me, "PRIVATE-FLOW")
        self.store = api_main.app.dependency_overrides[api_main.get_store]()

    def _everyone_elses(self):
        self._login_as("colleague@example.com")
        other = self._create_project(name="Colleague case")["project_id"]
        self._card("COLLEAGUE-CARD", other)
        self.client.post("/me/docs/govern.location", json={"content": {"where": "COLLEAGUE-PLACE"}})
        self._login_as("user@example.com")
        return other

    def test_the_summary_says_what_goes_and_what_stays(self):
        gone = self.client.post("/me/docs/govern.location", json={"content": {"where": "寫了又刪掉的地方"}}).json()
        self.assertEqual(self.client.delete(f"/me/docs/govern.location/{gone['doc_id']}").status_code, 200)   # a removed card is not a record you still hold
        summary = self.client.get("/govern/account").json()
        self.assertEqual([case["name"] for case in summary["cases"]], ["EdD study", "Second case"])
        self.assertEqual((summary["personal_records"], summary["workflows"], summary["phrase"]), (1, 1, self.PHRASE))
        self.assertEqual(len(summary["keeps"]), 4)
        self.assertIn("2026-10-03 以前跑的工作流執行", summary["keeps"][3])

    def test_without_the_exact_phrase_nothing_is_deleted(self):
        for confirm in ("", "刪除", "DELETE"):
            self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": confirm}).status_code, 400)
        self.assertEqual(len(self.client.get("/projects").json()), 2)
        self.assertEqual(self.store.get_identity(self.me)["status"], "active")

    def test_everything_of_mine_goes_and_only_markers_with_no_content_stay(self):
        other = self._everyone_elses()
        response = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["cases"], response.json()["records"], response.json()["workflows"], response.json()["tombstone"]), (2, 1, 1, True))
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        self.assertEqual([p["project_id"] for p in repo.list_projects(self.tenant_id)], [other])
        everything = "\n".join(dump(self.databases))
        for secret in ("PRIVATE-CARD-ONE", "PRIVATE-CARD-TWO", "PRIVATE-PLACE", "PRIVATE-FLOW"):
            self.assertNotIn(secret, everything)
        with self.databases.for_tenant(self.tenant_id) as connection:
            stays = [row[0] for row in connection.execute("SELECT payload_json FROM events WHERE tenant_id=%s AND event_type='ProjectErased'", (self.tenant_id,))]
            mine_left = connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND ((owner_kind='person' AND owner_id=%s) OR (owner_kind='case' AND owner_id IN (%s, %s)))",
                                           (self.tenant_id, self.me, self.pid, self.second)).fetchone()[0]
        self.assertEqual(len(stays), 2)
        self.assertTrue(all(set(item) <= {"project_id", "erased_by_identity_id", "sources", "blobs_unlinked", "artifacts_deleted", "events_deleted"} for item in stays))
        self.assertEqual(mine_left, 0)
        self.assertEqual(self.workflows.list(self.tenant_id, self.me), [])

    def test_the_identity_is_an_empty_marker_nobody_can_sign_in_as_and_the_address_is_free(self):
        self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        marker = self.store.get_identity(self.me)
        self.assertEqual((marker["status"], marker["display_name"]), ("deleted", "（已刪除）"))
        self.assertNotIn("user@example.com", json.dumps(marker))
        self.assertIsNone(self.store.authenticate(self.tenant_id, "user@example.com", "correct-horse-battery"))
        self.assertEqual(self.client.get("/projects").status_code, 401)
        self.assertIsNone(self.store.issue_password_reset_token(self.tenant_id, "user@example.com"))
        again = self.store.create_identity(str(uuid.uuid4()), self.tenant_id, "user@example.com", "New", "correct-horse-battery")
        self.assertNotEqual(again["identity_id"], self.me)
        self._login()
        self.assertEqual(self.client.get("/projects").json(), [])

    def test_what_is_still_being_worked_on_stops_it_and_a_retry_finishes_it(self):
        from ai_lego.platform.workflow.run_lock import acquire_run_lock
        lock = acquire_run_lock(api_main._synthesis_lock_path(self.tenant_id, self.second), tag="SYN-RUNNING")
        try:
            blocked = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
            self.assertEqual(blocked.status_code, 409)
        finally:
            lock.release()
        self.assertEqual(self.store.get_identity(self.me)["status"], "active")
        self.assertEqual([case["name"] for case in self.client.get("/govern/account").json()["cases"]], ["EdD study", "Second case"])   # nothing was deleted
        self.assertEqual(self.client.get(f"/projects/{self.pid}/docs/sense.card").json()[0]["content"]["text"], "PRIVATE-CARD-ONE")
        self.assertEqual(len(self.client.get("/me/docs/govern.location").json()), 1)
        self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")

    def test_a_run_on_a_case_that_is_still_going_stops_the_deletion_before_anything_goes(self):
        journal, _ = self._run(self.me, "run-on-second", self.second)
        lock = acquire_run_lock(lock_path_for(journal), tag="recipe")
        try:
            self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 409)
        finally:
            lock.release()
        self.assertEqual(len(self.client.get("/govern/account").json()["cases"]), 2)
        self.assertTrue(journal.is_file())

    def test_nobody_elses_data_is_touched(self):
        other = self._everyone_elses()
        colleague = store_identity(self, "colleague@example.com")
        self._workflow(colleague, "COLLEAGUE-FLOW")
        their_journal, their_artifact = self._run(colleague, "colleague-run")
        self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        self._login_as("colleague@example.com")
        self.assertEqual(self.client.get(f"/projects/{other}/docs/sense.card").json()[0]["content"]["text"], "COLLEAGUE-CARD")
        self.assertEqual(self.client.get("/me/docs/govern.location").json()[0]["content"]["where"], "COLLEAGUE-PLACE")
        self.assertEqual([item["title"] for item in self.workflows.list(self.tenant_id, colleague)], ["COLLEAGUE-FLOW"])
        self.assertEqual(self.store.get_identity(colleague)["status"], "active")
        self.assertTrue(their_journal.is_file())
        self.assertEqual(api_main.app.dependency_overrides[api_main.get_artifact_store]().read(self.tenant_id, their_artifact), {"content": "RUN-OUTPUT colleague-run"})
        self.assertEqual(len(self.client.get("/projects").json()), 1)

    def test_the_runs_go_with_the_account_the_ones_on_a_case_with_the_case_and_the_rest_with_it(self):
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        on_case, case_artifact = self._run(self.me, "run-on-case", self.pid)
        loose, loose_artifact = self._run(self.me, "run-on-nothing")
        self.assertEqual(self.client.get("/govern/account").json()["runs"], 2)
        response = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        self.assertEqual((response.status_code, response.json()["runs"]), (200, 1))
        self.assertFalse(on_case.exists() or loose.exists() or api_main._run_case_path(on_case).exists())
        self.assertFalse(loose.parent.exists())
        for artifact in (case_artifact, loose_artifact):
            with self.assertRaises(InvariantViolation):
                artifacts.read(self.tenant_id, artifact)

    def test_a_run_that_is_still_going_stops_the_deletion_and_a_retry_finishes_it(self):
        loose, _ = self._run(self.me, "run-still-going")
        lock = acquire_run_lock(lock_path_for(loose), tag="recipe")
        try:
            self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 409)
        finally:
            lock.release()
        self.assertEqual(self.store.get_identity(self.me)["status"], "active")
        self.assertEqual(len(self.client.get("/govern/account").json()["cases"]), 2)   # the cases were not touched either
        self.assertTrue(loose.is_file())
        self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        self.assertFalse(loose.exists() or lock_path_for(loose).exists())

    # -- a blob is never shared between two people --------------------------------------------------------------------

    def test_the_same_output_written_twice_is_two_blobs_and_deleting_one_leaves_the_other(self):
        tenant_id = self.tenant_id
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        made = [persist_artifact_output(tenant_id, artifacts, {"artifact": {"artifact_type": "image/png", "content": "SAME"}})["artifact"] for _ in range(2)]
        first, second = made[0]["cas_reference"], made[1]["cas_reference"]
        self.assertNotEqual(first["cas_path"], second["cas_path"])
        self.assertTrue(artifacts.delete_if_present(tenant_id, first))
        self.assertEqual(artifacts.read(tenant_id, second)["content"], "SAME")

    def test_my_account_deletion_leaves_a_colleagues_identical_output_and_their_export_still_has_it(self):
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        self._login_as("colleague@example.com")
        colleague = store_identity(self, "colleague@example.com")
        _, theirs = self._stored_run(colleague, "colleague-chart")
        self._login_as("user@example.com")
        _, mine = self._stored_run(self.me, "my-chart", self.pid)
        self.assertNotEqual(mine["cas_path"], theirs["cas_path"])
        self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        with self.assertRaises(InvariantViolation):
            artifacts.read(self.tenant_id, mine)
        self._login_as("colleague@example.com")
        self.assertEqual(artifacts.read(self.tenant_id, theirs)["content"], "SAME-CHART-BYTES")
        exported = self.client.get("/govern/export").json()["person"]["runs"]
        self.assertEqual([item["value"]["content"] for run in exported for item in run["artifacts"]], ["SAME-CHART-BYTES"])

    def _recipe_run(self, run_id):
        response = self.client.post("/recipes/business-plan-full-v1/run", json={"source": full_source(), "run_id": run_id})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["workflow"]["context"]["outputs"]["proposal"]["artifact"]["cas_reference"]

    def test_a_real_run_on_no_case_is_recorded_by_the_server_and_two_people_running_the_same_thing_do_not_share_a_blob(self):
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        mine = self._recipe_run("my-business-plan")
        sidecar = api_main._run_case_path(api_main.workflow_journal_path(self.tenant_id, "my-business-plan", self.me))
        self.assertEqual(json.loads(sidecar.read_text(encoding="utf-8")), {"project_id": None, "artifacts": [mine]})
        self._login_as("colleague@example.com")
        theirs = self._recipe_run("their-business-plan")
        self.assertNotEqual(mine["cas_path"], theirs["cas_path"])
        self._login_as("user@example.com")
        exported = self.client.get("/govern/export").json()["person"]["runs"]
        self.assertEqual([item["artifact_type"] for run in exported for item in run["artifacts"]], ["BusinessProposalArtifact"])
        self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        with self.assertRaises(InvariantViolation):
            artifacts.read(self.tenant_id, mine)
        self.assertEqual(artifacts.read(self.tenant_id, theirs)["artifact_type"], "BusinessProposalArtifact")

    def test_a_run_with_an_encrypted_journal_is_recorded_exported_and_deleted_like_any_other(self):
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        settings = {"COGNITIVE_OS_JOURNAL_KEY_MODE": "local-dev", "COGNITIVE_OS_JOURNAL_KEY_B64": base64.b64encode(b"k" * 32).decode("ascii")}
        with mock.patch.dict(os.environ, settings, clear=False):
            reference = self._recipe_run("my-encrypted-plan")
            journal = api_main.workflow_journal_path(self.tenant_id, "my-encrypted-plan", self.me)
            self.assertTrue(json.loads(journal.read_text(encoding="utf-8"))["context"]["protected"])
            self.assertNotIn("cas_reference", journal.read_text(encoding="utf-8"))   # the journal names nothing: only the server's own record does
            self.assertEqual(json.loads(api_main._run_case_path(journal).read_text(encoding="utf-8"))["artifacts"], [reference])
            run = self.client.get("/govern/export").json()["person"]["runs"][0]
            self.assertEqual(run["artifacts"][0]["artifact_type"], "BusinessProposalArtifact")
            self.assertIn("1 筆", self.client.get("/govern/account").json()["keeps"][4])
            self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        with self.assertRaises(InvariantViolation):
            artifacts.read(self.tenant_id, reference)
        self.assertFalse(journal.exists())

    # -- a reference that is not what it claims never stops an export or a deletion ---------------------------------------

    def test_a_malformed_reference_in_a_run_from_before_the_sidecar_does_not_stop_the_export_or_the_deletion(self):
        journal = api_main.workflow_journal_path(self.tenant_id, "odd-run", self.me)
        journal.parent.mkdir(parents=True, exist_ok=True)
        claims = [{"artifact_type": "X"}, "not even a mapping", {"artifact_type": "Y", "content_sha256": "0" * 64, "cas_path": {"path": "/objects/x/../../etc/passwd"}}, {"cas_path": {"path": "\u0000"}}]
        journal.write_text(json.dumps({"status": "SUCCEEDED", "context": {"outputs": {"s": {"note": {"cas_reference": claims[0]}, "more": [{"cas_reference": claim} for claim in claims[1:]]}}}}), encoding="utf-8")
        exported = self.client.get("/govern/export")
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertEqual([item["error"] for item in exported.json()["person"]["runs"][0]["artifacts"]], ["ARTIFACT_REFERENCE_MALFORMED"] * 4)
        response = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        # a claim that names no file is never called done: the account is deleted, the claims are listed, no "done"
        self.assertEqual((response.status_code, response.json()["physical_cleanup"], response.json()["tombstone"]), (202, "blocked", False), response.text)
        self.assertEqual(len(response.json()["failed"]), 4)
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")
        self.assertFalse(journal.exists())

    def test_a_journal_that_is_not_json_or_a_recorded_blob_that_no_longer_matches_does_not_stop_it_either(self):
        broken = api_main.workflow_journal_path(self.tenant_id, "half-written", self.me)
        broken.parent.mkdir(parents=True, exist_ok=True)
        broken.write_text('{"status": "SUCCEED', encoding="utf-8")
        _, reference = self._stored_run(self.me, "tampered", self.pid)
        blob = api_main.app.dependency_overrides[api_main.get_artifact_store]().cas._resolve_owned(self.tenant_id, reference["cas_path"])
        blob.write_bytes(b"{}")
        runs = self.client.get("/govern/export").json()
        self.assertEqual(runs["cases"][0]["runs"][0]["artifacts"][0]["error"], "JSON_ARTIFACT_HASH_MISMATCH")
        response = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        # the erasure removes the person's file by its path even when its bytes no longer match: nothing is left, so "done"
        self.assertEqual((response.status_code, response.json()["physical_cleanup"], response.json()["failed"]), (200, "done", []), response.text)
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")
        self.assertFalse(broken.exists() or blob.exists())

    def test_a_suspended_tenant_does_not_take_the_right_to_delete_away(self):
        with mock.patch.object(api_main, "check_entitlement", return_value=False):
            self.assertEqual(self.client.delete(f"/projects/{self.second}").status_code, 403)   # the case route still asks (control)
            response = self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")

    def test_what_was_deleted_is_gone_from_every_row_of_the_database_not_only_from_a_query_of_mine(self):
        """SQLite's secure_delete also kept this for the bytes of the file; PostgreSQL keeps a deleted row's bytes until a
        vacuum reuses the space (docs/platform/STORAGE_SWITCH.md "Erasure and the bytes on disk": an open decision).
        What is checked here: no row of any table, the region's whole database, still holds it."""
        secret_card, secret_flow = "PRIVATE-CARD-ONE " + "x" * 1900, "PRIVATE-FLOW-RAW"
        self._card(secret_card)
        self._workflow(self.me, secret_flow)
        before = "\n".join(dump(self.databases))
        self.assertIn("PRIVATE-FLOW-RAW", before)   # it is in the database before
        self.assertIn("user@example.com", before)
        self.assertEqual(self.client.post("/govern/account/erase", json={"confirm": self.PHRASE}).status_code, 200)
        after = "\n".join(dump(self.databases))
        for secret in ("PRIVATE-CARD-ONE", "PRIVATE-FLOW-RAW", "user@example.com"):
            self.assertNotIn(secret, after)

    def test_a_protected_run_is_named_among_what_stays_because_its_ciphertext_cannot_be_deleted_yet(self):
        journal, _ = self._run(self.me, "run-protected")
        journal.write_text(json.dumps({"status": "SUCCEEDED", "context": {"protected": True, "storage": "TENANT_SCOPED_CAS", "cas_path": {}}}), encoding="utf-8")
        keeps = self.client.get("/govern/account").json()["keeps"]
        self.assertEqual(len(keeps), 5)
        self.assertIn("1 筆", keeps[4])


class IdentityStoreTests(PgTestCase):
    REGION = "local-dev"

    def setUp(self):
        empty_tables(self.databases)   # fixed ids (T, ME, OTHER): a fresh database per test, as the temp file was
        self.store = IdentityStore(self.databases)
        self.tenant = self.store.create_tenant("T", "T", "jurisdiction-pack.tw.v1", "local-dev", "k")["tenant_id"]
        self.me = self.store.create_identity("ME", self.tenant, "me@example.com", "Me", "correct-horse-battery")["identity_id"]
        self.other = self.store.create_identity("OTHER", self.tenant, "other@example.com", "Other", "correct-horse-battery")["identity_id"]

    def _count(self, table, identity):
        with self.databases.transaction(self.REGION) as connection:
            return connection.execute(f"SELECT COUNT(*) FROM {table} WHERE identity_id=%s", (identity,)).fetchone()[0]

    def test_everything_that_signs_in_as_the_person_goes_and_the_other_is_untouched(self):
        for who in (self.me, self.other):
            self.store.issue_session_for_identity(who, self.tenant)
            self.store.issue_handoff_code(who, self.tenant, "/x")
        self.store.issue_password_reset_token(self.tenant, "me@example.com")
        self.store.issue_password_reset_token(self.tenant, "other@example.com")
        self.assertTrue(self.store.delete_identity(self.tenant, self.me))
        self.assertEqual([self._count(table, self.me) for table in ("session", "handoff_code", "password_reset_token", "identity_credential")], [0, 0, 0, 0])
        self.assertEqual([self._count(table, self.other) for table in ("session", "handoff_code", "password_reset_token", "identity_credential")], [1, 1, 1, 1])
        self.assertEqual(self.store.get_identity(self.other)["status"], "active")

    def test_usage_stays_for_the_tenants_budget_but_stops_naming_the_person(self):
        usage_id, _ = self.store.reserve_ai_usage(self.tenant, self.me, "p", "m", 10, 10, since="1970-01-01T00:00:00Z", fits=lambda used: True)
        self.store.settle_ai_usage(self.tenant, usage_id, "m", 5, 5)
        before = self.store.ai_usage_totals(self.tenant)
        self.store.delete_identity(self.tenant, self.me)
        self.assertEqual(self.store.ai_usage_totals(self.tenant), before)
        self.assertEqual(self._count("ai_usage", self.me), 0)

    def test_what_was_deleted_is_gone_from_every_row_not_only_from_its_own_table(self):
        """The bytes-on-disk half of this test (SQLite's secure_delete) does not carry over: STORAGE_SWITCH.md "Erasure and
        the bytes on disk". Every row of every table is checked instead."""
        tokens = [self.store.issue_session_for_identity(self.me, self.tenant) for _ in range(3)]
        handoff = self.store.issue_handoff_code(self.me, self.tenant, "/RAW-REDIRECT-SECRET")
        raw = "\n".join(dump(self.databases))
        for token in tokens:
            self.assertIn(token, raw)   # it is in the database before
        self.assertTrue(self.store.delete_identity(self.tenant, self.me))
        raw = "\n".join(dump(self.databases))
        for token in tokens:
            self.assertNotIn(token, raw)
        self.assertNotIn("RAW-REDIRECT-SECRET", raw)
        self.assertNotIn("me@example.com", raw)
        self.assertIn("other@example.com", raw)   # somebody else's row is left as it was
        self.assertTrue(handoff)

    def test_deleting_twice_or_in_another_tenant_does_nothing(self):
        self.assertFalse(self.store.delete_identity("ELSEWHERE", self.me))
        self.assertEqual(self.store.get_identity(self.me)["status"], "active")
        self.assertTrue(self.store.delete_identity(self.tenant, self.me))
        self.assertFalse(self.store.delete_identity(self.tenant, self.me))


class VersionRecordTests(GovernApiTestCase):
    def test_which_model_and_instructions_answered_and_which_rules_were_in_use(self):
        self._card("合夥人第三次改條件")
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).status_code, 200)
        body = self.client.get(f"{self.base}/govern/versions").json()
        self.assertEqual([(call["block"], call["action"], call["model"], len(call["instructions_sha256"])) for call in body["ai_calls"]], [("SENSE", "mirror", "test-mirror-model", 64)])
        names = [rule["name"] for rule in body["rules"]]
        self.assertEqual(names[:5], ["ai_preamble", "crisis", "high_risk", "record_kinds", "integrity"])
        self.assertLessEqual(set(rulesets()), set(names))   # then every block's list and rule (STEP2_SHARED_RULES §6)
        for rule in body["rules"][:4]:
            self.assertRegex(rule["version"], r"^[0-9a-f]{12}$")
        self.assertRegex(body["rules"][4]["version"], r"^v\d+-[0-9a-f]{12}$")
        card = next(item for item in body["kinds"] if item["kind"] == "sense.card")
        self.assertEqual((card["block"], card["title"], card["documents"], card["versions"]), ("SENSE", "外化卡", 1, 1))
        self.assertRegex(card["definition"], r"^[0-9a-f]{12}$")
        self.assertNotIn("合夥人", json.dumps(body, ensure_ascii=False))

    def test_a_changed_rule_changes_its_version(self):
        before = {rule["name"]: rule["version"] for rule in self.client.get(f"{self.base}/govern/versions").json()["rules"]}
        with mock.patch.object(safety, "SIGNALS", safety.SIGNALS + ("zzz",)):
            after = {rule["name"]: rule["version"] for rule in self.client.get(f"{self.base}/govern/versions").json()["rules"]}
        self.assertNotEqual(after["crisis"], before["crisis"])
        self.assertEqual({key: value for key, value in after.items() if key != "crisis"}, {key: value for key, value in before.items() if key != "crisis"})

    def test_only_the_creator_reads_the_version_records(self):
        self._login_as("colleague@example.com")
        self.assertEqual(self.client.get(f"{self.base}/govern/versions").status_code, 404)


class ExplainSettingTests(GovernApiTestCase):
    def test_the_ai_explains_from_the_systems_own_description_and_reads_nothing_the_person_wrote(self):
        self.client.post("/me/docs/govern.location", json={"content": {"where": "PRIVATE-PLACE"}})
        turn = self.client.post("/me/ai/GOVERN/explain", json={"context": {"topic": "where"}})
        self.assertEqual(turn.status_code, 200, turn.text)
        saved = turn.json()["saved"]
        self.assertEqual((saved["kind"], saved["author"], saved["block"]), ("govern.explanation", "ai", "GOVERN"))
        system, user = self.provider.calls[0]
        self.assertIn(TOPICS["where"][1], user)
        self.assertNotIn("PRIVATE-PLACE", user + system)
        self.assertEqual(len(self.client.get("/me/docs/govern.explanation").json()), 1)
        calls = self.client.get("/me/docs/govern.ai_call_personal").json()
        self.assertEqual([(call["content"]["block"], call["content"]["action"]) for call in calls], [("GOVERN", "explain")])

    def test_only_a_listed_setting_can_be_asked_about(self):
        self.assertEqual(self.client.post("/me/ai/GOVERN/explain", json={"context": {"topic": "anything"}}).status_code, 400)
        self.assertEqual(self.client.post("/me/ai/GOVERN/explain", json={"context": {}}).status_code, 400)
        self.assertEqual(self.provider.calls, [])

    def test_no_description_carries_a_crisis_word_or_the_gate_would_stop_every_explanation(self):
        for topic, (name, description) in TOPICS.items():
            self.assertFalse(safety.crisis_signal(name, description), topic)
            self.assertTrue(self.client.post("/me/ai/GOVERN/explain", json={"context": {"topic": topic}}).json().get("saved"), topic)

    def test_it_runs_with_no_case_only(self):
        """Its answer is kept for the person, not in a case: the gate refuses before any model call is paid for."""
        self.assertEqual(self.client.post(f"{self.base}/ai/GOVERN/explain", json={"context": {"topic": "where"}}).status_code, 403)
        self.assertEqual(self.provider.calls, [])


class NeverReadsIntoAnAiTests(unittest.TestCase):
    """GOVERN moves data and never reads it into an AI (卡: 匯出和刪除只搬動資料，不看內容)."""
    FILES = ("ai_lego/apps/api/blocks/govern.py", "ai_lego/platform/block_hooks/govern.py", "ai_lego/platform/safety/__init__.py", "ai_lego/platform/safety/risk.py")
    FORBIDDEN = {"ask_ai", "complete", "complete_json", "_MeteredProvider", "get_ai_provider", "AnthropicProvider"}

    def _names(self, path):
        tree = ast.parse((PRODUCT_ROOT / path).read_text(encoding="utf-8"))
        return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} | {alias.name for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom)) for alias in node.names}

    def test_no_model_call_in_what_moves_or_judges_the_data(self):
        for path in self.FILES:
            self.assertEqual(self._names(path) & self.FORBIDDEN, set(), path)

    def test_the_recognition_hook_writes_nothing_itself(self):
        names = self._names("ai_lego/platform/block_hooks/govern.py")
        self.assertNotIn("save", names)
        self.assertNotIn("append", names)

    def test_the_detector_sees_what_it_forbids(self):
        tree = ast.parse("def f(p):\n    p.complete_json('a', 'b')\n    ask_ai(p)\n")
        names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
        self.assertEqual(names & self.FORBIDDEN, {"complete_json", "ask_ai"})


class KindsTests(unittest.TestCase):
    def test_every_block_code_a_guardrail_can_name_is_real(self):
        self.assertEqual(set(doc_kinds.require("govern.guardrail").fields["found_by"].choices), set(ALL_CODES))
        self.assertEqual(doc_kinds.require("govern.explanation").authors, frozenset({"ai"}))


class WebCopiesTests(unittest.TestCase):
    """apps/cognitive-web/lib/govern.ts names what the engine names; a name that drifts is a page showing a word the engine
    does not use."""

    def setUp(self):
        self.web = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "govern.ts").read_text(encoding="utf-8")

    def _list(self, name):
        return re.findall(r'"([^"]+)"', re.search(rf"export const {name} = \[(.*?)\];", self.web, re.S).group(1))

    def test_the_guardrails_in_the_engines_order_each_with_its_name(self):
        from ai_lego.core.domain.kinds.govern import GUARDRAILS
        self.assertEqual(self._list("GUARDRAIL_ORDER"), list(GUARDRAILS))
        for key, label in GUARDRAILS.items():
            self.assertIn(f'{key}: "{label.split("（")[0]}：', self.web)

    def test_the_kinds_of_high_risk(self):
        from ai_lego.core.domain.kinds.govern import HIGH_RISK
        self.assertEqual(self._list("HIGH_RISK"), list(HIGH_RISK))

    def test_the_topics_the_ai_can_explain(self):
        declared = re.search(r"export type Topic = (.*?);", self.web).group(1)
        self.assertEqual(set(re.findall(r'"(\w+)"', declared)), set(TOPICS))

    def test_the_reasons_the_ai_stopped(self):
        reasons = re.search(r"export const STOP_REASON: Record<string, string> = \{(.*?)\};", self.web, re.S).group(1)
        self.assertEqual(set(re.findall(r"(\w+):", reasons)), set(doc_kinds.require("govern.stop").fields["reason"].choices))

    def test_the_always_on_parts_that_can_write_a_record_have_a_name(self):
        from ai_lego.core.domain.blocks import ALWAYS_ON, BLOCKS
        named = re.search(r"const PART_NAME: Record<string, string> = \{(.*?)\};", self.web, re.S).group(1)
        self.assertEqual(set(re.findall(r"(\w+):", named)), set(ALWAYS_ON) | {"INTERNAL"})
        self.assertEqual(set(ALL_CODES), set(BLOCKS) | set(ALWAYS_ON) | {"INTERNAL"})


if __name__ == "__main__":
    unittest.main()
