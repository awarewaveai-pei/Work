"""EXPRESS keeps output traceable to the person's selected records."""

from __future__ import annotations

import ast
import json
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
        self.assertEqual(sent.authors, frozenset({"user"}))
        self.assertTrue(all(field.human_only for field in sent.fields.values()))
        self.assertEqual(set(sent.fields), {"draft", "version", "to"})

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
            self.assertEqual(response.status_code, 502, response.text)
            self.assertIn("AI_ANSWER_INVALID", response.text)
        self.assertEqual(self.client.get(f"{self.base}/express/drafts").json(), [])

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
        self.provider.answer = {"sentences": [{"text": "信心：60；我還不確定合作方是否會改變條件。", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "ai"}]}
        response = self.client.post(f"{self.base}/ai/EXPRESS/draft_from_outline", json={"context": {}})
        self.assertEqual(response.status_code, 200, response.text)
        draft = response.json()["saved"]
        self.assertIn("我還不確定合作方是否會改變條件。", json.dumps(draft["content"], ensure_ascii=False))
        self.assertNotEqual(draft["content"]["sentences"][0]["author"], "user")
        self.assertIn("我還不確定合作方是否會改變條件。", self.provider.calls[0][1])
        self.provider.answer = {"sentences": [{"text": "冒充本人", "refs": [{"kind": "decide.judgment", "doc_id": judgment["doc_id"]}], "unchecked": False, "author": "user"}]}
        refused = self.client.post(f"{self.base}/ai/EXPRESS/adjust_for_reader", json={"context": {"draft": draft["doc_id"]}})
        self.assertEqual(refused.status_code, 502, refused.text)
        self.assertIn("cannot label", refused.text)

    def test_sent_can_only_be_written_by_the_person(self):
        record = self.save_case_record("sense.card", SENSE)
        ref = {"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": record["doc_id"]}
        self.selection([ref])
        draft = self.save_case_record("express.draft", {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "我看到了一個選項。", "refs": [{"kind": "sense.card", "doc_id": record["doc_id"]}], "unchecked": False, "author": "user"}]})
        for invalid, code in (({"draft": "missing", "version": 1, "to": "合夥人"}, "EXPRESS_SENT_DRAFT_NOT_FOUND"),
                              ({"draft": draft["doc_id"], "version": 2, "to": "合夥人"}, "EXPRESS_SENT_VERSION_NOT_FOUND")):
            refused = self.client.post(f"{self.base}/docs/express.sent", json={"content": invalid})
            self.assertNotEqual(refused.status_code, 200, refused.text)
            self.assertIn(code, refused.text)
        sent = self.save_case_record("express.sent", {"draft": draft["doc_id"], "version": 1, "to": "合夥人"})
        self.assertEqual(sent["author"], "user")
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            doc_kinds.check_record("DocSaved", {"kind": "express.sent", "content": {"draft": draft["doc_id"], "version": 1, "to": "合夥人"}}, "ai", "EXPRESS", "case")
        self.assertNotIn("express.sent", (PRODUCT_ROOT / "ai_lego" / "platform" / "ai_actions" / "express.py").read_text(encoding="utf-8"))


class ExpressSourceScanTests(unittest.TestCase):
    def test_routes_never_write_sent(self):
        tree = ast.parse((PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks" / "express.py").read_text(encoding="utf-8"))
        writes_sent = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and "express.sent" in ast.unparse(node)]
        self.assertEqual(writes_sent, [], "the EXPRESS route module never names express.sent")


if __name__ == "__main__":
    unittest.main()
