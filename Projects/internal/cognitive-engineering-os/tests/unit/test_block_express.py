"""EXPRESS keeps output traceable to the person's selected records."""

from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, rulesets
from ai_lego.platform.ai_actions import express as express_actions
from ai_lego.platform.block_hooks import express as express_hooks
from ai_lego.platform.rulesets.express import FORMATS, FORMAT_NAMES
from tests.unit.test_block_decide import Provider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


SENSE = {"category": "事件", "text": "我看到了一個選項。"}
JUDGMENT = {"uncertainty": "我還不確定合作方是否會改變條件。", "change_condition": "如果他把條件寫進合約", "confidence": 60, "intensity_now": "弱"}


class ExpressKindTests(unittest.TestCase):
    def test_kinds_are_case_owned_and_sent_is_person_only(self):
        selection = doc_kinds.require("express.selection")
        draft = doc_kinds.require("express.draft")
        sent = doc_kinds.require("express.sent")
        self.assertEqual(selection.owner, draft.owner, "case")
        self.assertEqual(draft.authors, frozenset({"ai", "joint", "user"}))
        self.assertNotIn("last_read_version", draft.fields)
        self.assertEqual(sent.authors, frozenset({"user"}))
        self.assertTrue(all(field.human_only for field in sent.fields.values()))
        self.assertEqual(set(sent.fields), {"draft", "version", "to"})

    def test_the_page_asks_only_for_case_owned_kinds(self):
        """A person-owned kind asked through /projects/{id}/docs answers 404 and the page logs a console error on every open."""
        source = (PRODUCT_ROOT / "apps/cognitive-web/components/blocks/ExpressPage.tsx").read_text(encoding="utf-8")
        listed = re.findall(r'"([a-z_]+\.[a-z_]+)"', re.search(r"const CASE_RECORD_KINDS = \[(.*?)\] as const", source, re.S).group(1))
        self.assertTrue(listed)
        for kind in listed:
            spec = doc_kinds.require(kind)
            self.assertEqual((spec.owner, spec.block in express_hooks.SELECTABLE_BLOCKS), ("case", True), kind)

    def test_formats_are_versioned(self):
        self.assertEqual(tuple(item["name"] for item in FORMATS.items), FORMAT_NAMES)
        self.assertEqual(rulesets.require("express.formats").version, "1")
        changed = rulesets.Ruleset(FORMATS.name, FORMATS.block, FORMATS.title, FORMATS.version, FORMATS.maintainer, [*FORMATS.items, {"name": "新格式"}])
        with self.assertRaisesRegex(InvariantViolation, "RULESET_CHANGED_WITHOUT_VERSION"):
            rulesets.check(changed, {FORMATS.name: {FORMATS.version: FORMATS.fingerprint()}})

    def test_no_other_block_reads_draft_sentences_as_human_only(self):
        roots = [PRODUCT_ROOT / "ai_lego" / "platform" / "ai_actions", PRODUCT_ROOT / "ai_lego" / "platform" / "block_hooks", PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks"]
        hits = []
        for root in roots:
            for path in root.glob("*.py"):
                if path.name == "express.py":
                    continue
                text = path.read_text(encoding="utf-8")
                if "express.draft" in text and "human_only" in text:
                    hits.append(path.name)
        self.assertEqual(hits, [])

    def test_sent_has_no_ai_or_hook_write_path(self):
        for relative in ("ai_lego/platform/ai_actions", "ai_lego/platform/block_hooks"):
            root = PRODUCT_ROOT / relative
            for path in root.glob("*.py"):
                if path.name == "express.py":
                    continue
                self.assertNotIn("express.sent", path.read_text(encoding="utf-8"), path)
        source = (PRODUCT_ROOT / "ai_lego" / "platform" / "ai_actions" / "express.py").read_text(encoding="utf-8")
        self.assertNotIn('output_kind="express.sent"', source)


class ExpressApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider({"format": "摘要", "reader": "合夥人", "sentences": [{"text": "我還不確定合作方是否會改變條件。", "refs": [{"kind": "decide.judgment", "doc_id": "missing"}], "unchecked": True, "author": "ai"}]})
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.project = self._create_project()
        self.base = f"/projects/{self.project['project_id']}"

    def save(self, kind: str, content: dict, *, path: str | None = None):
        response = self.client.post(path or f"{self.base}/docs/{kind}", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def save_case_record(self, kind: str, content: dict) -> dict:
        return self.save(kind, content)

    def selection(self, refs: list[dict[str, str]], **extra):
        return self.save_case_record("express.selection", {"items": refs, "format": "摘要", "reader": "合夥人", **extra})

    def test_selection_rechecks_every_ref_and_outline_uses_only_selected_records(self):
        selected = self.save_case_record("sense.card", SENSE)
        unselected = self.save_case_record("sense.card", {**SENSE, "text": "UNSELECTED_UNIQUE_WORD"})
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": selected["doc_id"]}])
        outline = self.client.get(f"{self.base}/express/outline")
        self.assertEqual(outline.status_code, 200, outline.text)
        rendered = json.dumps(outline.json(), ensure_ascii=False)
        self.assertNotIn("UNSELECTED_UNIQUE_WORD", rendered)
        self.provider.answer = {"sentences": [{"text": "我看見了一個選項。", "refs": [{"kind": "sense.card", "doc_id": selected["doc_id"]}], "unchecked": False, "author": "ai"}]}
        drafted = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(drafted.status_code, 200, drafted.text)
        self.assertNotIn("UNSELECTED_UNIQUE_WORD", self.provider.calls[-1][1])
        bad = self.client.put(f"{self.base}/docs/express.selection/{self.client.get(f'{self.base}/docs/express.selection').json()[0]['doc_id']}", json={"content": {"items": [{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": "not-current"}], "format": "摘要", "reader": "合夥人"}, "base_version": 1})
        self.assertEqual(bad.status_code, 404, bad.text)
        self.assertIn("EXPRESS_SELECTION_RECORD_NOT_FOUND", bad.text)
        self.assertNotEqual(selected["doc_id"], unselected["doc_id"])

    def test_selection_rejects_a_ref_that_names_another_case(self):
        record = self.save_case_record("sense.card", SENSE)
        response = self.client.post(f"{self.base}/docs/express.selection", json={"content": {"items": [{"project_id": "another-case", "kind": "sense.card", "doc_id": record["doc_id"]}], "format": "摘要", "reader": "合夥人"}})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("EXPRESS_SELECTION_PROJECT_MISMATCH", response.text)

    def test_selection_crud_and_draft_list_and_versions_routes(self):
        record = self.save_case_record("sense.card", SENSE)
        selection = self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}])
        self.assertEqual(self.client.get(f"{self.base}/express/selection").json()[0]["doc_id"], selection["doc_id"])
        self.assertEqual(self.client.get(f"{self.base}/express/selection/{selection['doc_id']}/versions").json()[0]["version"], 1)
        self.assertEqual(self.client.get(f"{self.base}/express/drafts").json(), [])
        formats = self.client.get(f"{self.base}/express/formats").json()
        self.assertEqual((formats["name"], formats["version"]), ("express.formats", "1"))
        self.assertEqual([item["name"] for item in formats["formats"]], list(FORMAT_NAMES))

    def test_explicit_missing_selection_or_draft_never_falls_back_to_latest(self):
        record = self.save_case_record("sense.card", SENSE)
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}])
        missing_selection = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {"selection": "missing"}})
        self.assertNotEqual(missing_selection.status_code, 200, missing_selection.text)
        self.assertIn("EXPRESS_SELECTION_REQUIRED", missing_selection.text)
        missing_draft = self.client.post(f"{self.base}/ai/EXPRESS/adjust_for_reader", json={"context": {"draft": "missing"}})
        self.assertNotEqual(missing_draft.status_code, 200, missing_draft.text)
        self.assertIn("EXPRESS_DRAFT_REQUIRED", missing_draft.text)
        self.assertEqual(self.provider.calls, [])

    def test_sentence_without_refs_and_ref_outside_selection_are_refused(self):
        record = self.save_case_record("sense.card", SENSE)
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}])
        for sentence in (
            {"text": "沒有來源的句子", "refs": [], "unchecked": False, "author": "ai"},
            {"text": "指向別筆紀錄", "refs": [{"kind": "sense.card", "doc_id": "outside"}], "unchecked": False, "author": "ai"},
        ):
            self.provider.answer = {"sentences": [sentence]}
            response = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIn("AI_ANSWER_INVALID", response.text)
        self.assertEqual(self.client.get(f"{self.base}/express/drafts").json(), [])

    def test_normal_save_also_rejects_a_ref_outside_the_selection(self):
        selected = self.save_case_record("sense.card", SENSE)
        outside = self.save_case_record("sense.card", {**SENSE, "text": "沒有選進來的卡片"})
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": selected["doc_id"]}])
        refused = self.client.post(f"{self.base}/docs/express.draft", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "越界", "refs": [{"kind": "sense.card", "doc_id": outside["doc_id"]}], "unchecked": True, "author": "user"}]}})
        self.assertEqual(refused.status_code, 400, refused.text)
        self.assertIn("EXPRESS_DRAFT_REF_OUTSIDE_SELECTION", refused.text)

    def test_same_ai_sentence_stays_ai_changed_text_may_be_user_and_joint_is_refused(self):
        record = self.save_case_record("sense.card", SENSE)
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}])
        first = self.save_case_record("express.draft", {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "ai"}]})
        same = self.client.put(f"{self.base}/docs/express.draft/{first['doc_id']}", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "user"}]}, "base_version": 1})
        self.assertEqual(same.status_code, 200, same.text)
        self.assertEqual(same.json()["content"]["sentences"][0]["author"], "ai")
        changed = self.client.put(f"{self.base}/docs/express.draft/{first['doc_id']}", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句，但我改過了", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "user"}]}, "base_version": 2})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["content"]["sentences"][0]["author"], "user")
        joint = self.client.put(f"{self.base}/docs/express.draft/{first['doc_id']}", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "不應有共同作者", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "joint"}]}, "base_version": 3})
        self.assertEqual(joint.status_code, 400, joint.text)
        self.assertIn("EXPRESS_DRAFT_SENTENCE_INVALID", joint.text)

    def test_ai_words_stay_ai_in_a_new_draft_and_with_changed_spacing(self):
        record = self.save_case_record("sense.card", SENSE)
        self.selection([{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}])
        refs = [{"kind": "sense.card", "doc_id": record["doc_id"]}]
        first = self.save_case_record("express.draft", {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句", "refs": refs, "unchecked": False, "author": "ai"}]})
        for text in ("AI 原句", "AI 原句 ", "  AI　原句", "AI原句", "ＡＩ 原句"):
            with self.subTest(text=text):
                copied = self.client.post(f"{self.base}/docs/express.draft", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": text, "refs": refs, "unchecked": False, "author": "user"}]}})
                self.assertEqual(copied.status_code, 200, copied.text)
                self.assertEqual(copied.json()["content"]["sentences"][0]["author"], "ai")
        spaced = self.client.put(f"{self.base}/docs/express.draft/{first['doc_id']}", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句 ", "refs": refs, "unchecked": False, "author": "user"}]}, "base_version": 1})
        self.assertEqual(spaced.status_code, 200, spaced.text)
        self.assertEqual(spaced.json()["content"]["sentences"][0]["author"], "ai")
        own = self.client.post(f"{self.base}/docs/express.draft", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句，但我改過了", "refs": refs, "unchecked": False, "author": "user"}]}})
        self.assertEqual(own.json()["content"]["sentences"][0]["author"], "user")

    def test_unchecked_claim_is_marked_and_handback_happens_before_model(self):
        claim = self.save_case_record("verify.claim", {"text": "某件事真的發生了", "sentence": "可以查的事實", "from": "我加的"})
        self.selection([{"project_id": self.project["project_id"], "kind": "verify.claim", "doc_id": claim["doc_id"]}])
        stopped = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(stopped.status_code, 200, stopped.text)
        self.assertEqual(stopped.json(), {"handback": "這裡有還沒查證的句子，要先處理還是照樣寫進去？"})
        self.assertEqual(self.provider.calls, [])
        selection = self.client.get(f"{self.base}/docs/express.selection").json()[0]
        self.client.put(f"{self.base}/docs/express.selection/{selection['doc_id']}", json={"content": {**selection["content"], "unchecked_ok": True}, "base_version": selection["version"]})
        self.provider.answer = {"sentences": [{"text": "某件事真的發生了。", "refs": [{"kind": "verify.claim", "doc_id": claim["doc_id"]}], "unchecked": False, "author": "ai"}]}
        saved = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertTrue(saved.json()["saved"]["content"]["sentences"][0]["unchecked"])

    def test_manual_draft_cannot_remove_an_unchecked_claim_marker(self):
        claim = self.save_case_record("verify.claim", {"text": "某件事真的發生了", "sentence": "可以查的事實", "from": "我加的"})
        self.selection([{"project_id": self.project["project_id"], "kind": "verify.claim", "doc_id": claim["doc_id"]}])
        content = {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "某件事真的發生了。", "refs": [{"kind": "verify.claim", "doc_id": claim["doc_id"]}], "unchecked": False, "author": "user"}]}
        refused = self.client.post(f"{self.base}/docs/express.draft", json={"content": content})
        self.assertEqual(refused.status_code, 400, refused.text)
        self.assertIn("EXPRESS_DRAFT_UNCHECKED_REQUIRED", refused.text)
        content["sentences"][0]["unchecked"] = True
        self.save_case_record("express.draft", content)

    def test_person_confidence_and_uncertainty_survive_and_ai_cannot_be_user(self):
        judgment = self.save_case_record("decide.judgment", JUDGMENT)
        self.selection([{"project_id": self.project["project_id"], "kind": "decide.judgment", "doc_id": judgment["doc_id"]}])
        self.provider.answer = {"sentences": [{"text": "信心：60；我還不確定合作方是否會改變條件。", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "joint"}]}
        joint = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(joint.status_code, 422, joint.text)
        self.assertIn("invalid author", joint.text)
        self.provider.answer = {"sentences": [{"text": "只寫一般摘要", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "ai"}]}
        missing_person_line = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(missing_person_line.status_code, 422, missing_person_line.text)
        self.assertIn("person's confidence or uncertainty", missing_person_line.text)
        self.provider.answer = {"sentences": [{"text": "信心：60；我還不確定合作方是否會改變條件。", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "ai"}]}
        response = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(response.status_code, 200, response.text)
        draft = response.json()["saved"]
        self.assertIn("我還不確定合作方是否會改變條件。", json.dumps(draft["content"], ensure_ascii=False))
        self.assertNotEqual(draft["content"]["sentences"][0]["author"], "user")
        self.assertIn("我還不確定合作方是否會改變條件。", self.provider.calls[0][1])
        self.provider.answer = {"sentences": [{"text": "冒充本人", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "user"}]}
        refused = self.client.post(f"{self.base}/ai/EXPRESS/adjust_for_reader", json={"context": {"draft": draft["doc_id"]}})
        self.assertEqual(refused.status_code, 422, refused.text)
        self.assertIn("cannot label", refused.text)

    def test_sent_can_only_be_written_by_the_person(self):
        record = self.save_case_record("sense.card", SENSE)
        ref = {"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}
        self.selection([ref])
        draft = self.save_case_record("express.draft", {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "我看到了一個選項。", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "user", "seen": True}]})
        for invalid in ({"draft": "missing", "version": 1, "to": "合夥人"},
                        {"draft": draft["doc_id"], "version": 2, "to": "合夥人"}):
            refused = self.client.post(f"{self.base}/docs/express.sent", json={"content": invalid})
            self.assertEqual(refused.status_code, 403, refused.text)
            self.assertIn("EXPRESS_SENT_ROUTE_ONLY", refused.text)
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        self.assertEqual(read.json()["content"]["last_read_version"], read.json()["version"])
        sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": read.json()["version"], "to": "合夥人"})
        self.assertEqual(sent.status_code, 200, sent.text)
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            doc_kinds.check_record("DocSaved", {"kind": "express.sent", "content": {"draft": draft["doc_id"], "version": 1, "to": "合夥人"}}, "ai", "EXPRESS", "case")
        self.assertNotIn("express.sent", (PRODUCT_ROOT / "ai_lego" / "platform" / "ai_actions" / "express.py").read_text(encoding="utf-8"))


class ExpressSourceScanTests(unittest.TestCase):
    @staticmethod
    def _assert_sent_route_contract(source: str) -> None:
        tree = ast.parse(source)
        writes_sent = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and "express.sent" in ast.unparse(node)]
        owners = []
        for function in [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]:
            if any(node in writes_sent for node in ast.walk(function)):
                owners.append(function.name)
        if owners != ["send_draft"]:
            raise AssertionError(f"only send_draft may write express.sent: {owners}")
        send = next(node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "send_draft")
        save_calls = [node for node in ast.walk(send) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "save_many"]
        if len(save_calls) != 1 or "express.sent" not in ast.unparse(save_calls[0]) or not any(keyword.arg == "check" for keyword in save_calls[0].keywords):
            raise AssertionError("send_draft must write express.sent through save_many(check=...)")

    def test_only_send_route_writes_sent_through_checked_save_many(self):
        source = (PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks" / "express.py").read_text(encoding="utf-8")
        self._assert_sent_route_contract(source)

    def test_a_second_sent_writer_is_rejected(self):
        source = (PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks" / "express.py").read_text(encoding="utf-8")
        mutated = source + "\n\ndef bad_route(docs):\n    docs.save_many([], [], [{\"kind\": \"express.sent\"}], None)\n"
        with self.assertRaises(AssertionError):
            self._assert_sent_route_contract(mutated)

    def test_send_route_without_check_is_rejected(self):
        source = (PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks" / "express.py").read_text(encoding="utf-8")
        mutated = source.replace("api._me(session, \"EXPRESS\"), check=check_current,", "api._me(session, \"EXPRESS\"),")
        with self.assertRaises(AssertionError):
            self._assert_sent_route_contract(mutated)


if __name__ == "__main__":
    unittest.main()
