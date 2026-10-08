"""EXPRESS export is local, ordered, and person-controlled."""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_lego import PRODUCT_ROOT
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.exports.render import _PDF_PRINTABLE_WIDTH, _pdf_text_width, _wrap_pdf_line, render_markdown, render_pdf, render_text
import ai_lego.platform.exports.render as render_module
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


FORBIDDEN_OUTBOUND_WORDS = ("smtp", "requests", "urllib", "webhook", "schedule", "cron")
MISSING = object()


def _assert_no_outbound_code(root: Path) -> None:
    paths = [root / "ai_lego" / "apps" / "api" / "blocks" / "express.py", *(root / "ai_lego" / "platform" / "exports").glob("*.py")]
    hits = [(path, word) for path in paths for word in FORBIDDEN_OUTBOUND_WORDS if word in path.read_text(encoding="utf-8").lower()]
    if hits:
        raise AssertionError(f"EXPRESS export/send has an outbound path: {hits}")


def _draft() -> dict:
    return {
        "format": "摘要",
        "reader": "合夥人",
        "sentences": [
            {"text": "第一句。", "refs": [{"kind": "sense.card", "doc_id": "one"}], "unchecked": False, "author": "user"},
            {"text": "第二句。", "refs": [{"kind": "sense.card", "doc_id": "two"}], "unchecked": True, "author": "ai"},
        ],
        "confidence_lines": ["信心：60%"],
        "uncertainty_lines": ["我還不確定合作方是否會改變條件。"],
    }


def _pdf_text(pdf: bytes) -> str:
    executable = shutil.which("pdftotext")
    if executable is None:
        raise AssertionError("pdftotext is required to verify PDF text extraction")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "draft.pdf"
        path.write_bytes(pdf)
        result = subprocess.run([executable, "-layout", str(path), "-"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise AssertionError(result.stderr)
    return result.stdout


class ExpressRendererTests(unittest.TestCase):
    def test_every_renderer_keeps_order_marks_and_final_disclosures(self):
        for rendered in (render_markdown(_draft()), render_text(_draft())):
            self.assertLess(rendered.index("第一句。"), rendered.index("第二句。"))
            self.assertNotIn("第一句。（AI 寫的）", rendered)
            self.assertIn("第二句。 （AI 寫的） （還沒查證）", rendered)
            self.assertIn("信心和仍不確定", rendered)
            self.assertIn("信心：60%", rendered)
            self.assertIn("我還不確定合作方是否會改變條件。", rendered)

    def test_pdf_has_the_pdf_signature(self):
        self.assertTrue(render_pdf(_draft()).startswith(b"%PDF"))

    def test_pdf_preserves_dollar_signs_without_math_parsing(self):
        for text in ("price $5 and $10 total", "a $_$ b"):
            with self.subTest(text=text):
                draft = {**_draft(), "sentences": [{**_draft()["sentences"][0], "text": text}]}
                extracted = re.sub(r"\s+", "", _pdf_text(render_pdf(draft)))
                self.assertIn(re.sub(r"\s+", "", text), extracted)

    def test_pdf_width_uses_the_renderer_and_stays_inside_the_printable_limit(self):
        with patch.object(render_module._PDF_RENDERER, "get_text_width_height_descent", wraps=render_module._PDF_RENDERER.get_text_width_height_descent) as measure:
            width = _pdf_text_width("price $5 and $10 total")
        self.assertGreater(width, 0)
        self.assertLessEqual(width, _PDF_PRINTABLE_WIDTH)
        self.assertTrue(measure.called)

    def test_pdf_wraps_by_glyph_width_and_keeps_long_sentences_across_pages(self):
        sentences = [
            "中" * 120,
            "EnglishWithoutSpaces" * 18,
            "混合CJKandLatin（還沒查證）（AI 寫的）" * 8,
            *[f"第{i}個句子，這一頁之後還要繼續。" for i in range(1, 100)],
        ]
        draft = {
            "format": "摘要",
            "reader": "合夥人",
            "sentences": [
                {"text": text, "refs": [{"kind": "sense.card", "doc_id": str(index)}], "unchecked": index == 2, "author": "ai" if index == 2 else "user"}
                for index, text in enumerate(sentences)
            ],
        }
        with patch.object(render_module, "_wrap_pdf_line", wraps=_wrap_pdf_line) as wrapper:
            pdf = render_pdf(draft)
        self.assertEqual(wrapper.call_count, len(render_module._pdf_lines(draft)))
        self.assertGreaterEqual(pdf.count(b"/Type /Page"), 2)
        for index, sentence in enumerate(sentences, 1):
            displayed = f"{index}. {sentence}"
            chunks = _wrap_pdf_line(displayed)
            self.assertEqual("".join(chunks), displayed)
            self.assertTrue(all(_pdf_text_width(chunk) <= _PDF_PRINTABLE_WIDTH for chunk in chunks), (index, max(map(_pdf_text_width, chunks))))
        extracted = re.sub(r"\s+", "", _pdf_text(pdf))
        self.assertIn(re.sub(r"\s+", "", sentences[1]), extracted)


class ExpressExportApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self._login()
        self.project = self._create_project()
        self.base = f"/projects/{self.project['project_id']}"
        record = self.client.post(f"{self.base}/docs/sense.card", json={"content": {"category": "事件", "text": "自己的紀錄"}})
        self.assertEqual(record.status_code, 200, record.text)
        self.record = record.json()
        selection = self.client.post(f"{self.base}/docs/express.selection", json={"content": {"items": [{"project_id": self.project["project_id"], "kind": "sense.card", "doc_id": self.record["doc_id"]}], "format": "摘要", "reader": "合夥人"}})
        self.assertEqual(selection.status_code, 200, selection.text)

    def _save_draft(self, *, unchecked: bool = False, seen: object = True) -> dict:
        sentence = {"text": "我想說的話。", "refs": [{"kind": "sense.card", "doc_id": self.record["doc_id"]}], "unchecked": unchecked, "author": "user"}
        if seen is not MISSING:
            sentence["seen"] = seen
        response = self.client.post(f"{self.base}/docs/express.draft", json={"content": {"format": "摘要", "reader": "合夥人", "sentences": [sentence]}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _event_count(self) -> int:
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            return int(connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s", (self.tenant["tenant_id"], self.project["project_id"])).fetchone()[0])

    def test_export_formats_are_downloads_and_export_does_not_record(self):
        draft = self._save_draft()
        before = self._event_count()
        for fmt, extension in (("md", ".md"), ("text", ".txt"), ("pdf", ".pdf")):
            response = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/export", params={"format": fmt})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("attachment", response.headers["content-disposition"])
            self.assertIn(extension, response.headers["content-disposition"])
            if fmt == "pdf":
                self.assertTrue(response.content.startswith(b"%PDF"))
            else:
                self.assertIn("我想說的話。", response.text)
        self.assertEqual(self._event_count(), before)

    def test_send_requires_current_version_and_acknowledgement_then_records_sent(self):
        draft = self._save_draft(unchecked=True)
        stale = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 2, "to": "合夥人", "acknowledge_unchecked": True})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertIn("版本不對", stale.text)
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        needs_ack = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 1, "to": "合夥人"})
        self.assertEqual(needs_ack.status_code, 409, needs_ack.text)
        self.assertIn("稿子裡還有還沒查證的句子，確定要送？", needs_ack.text)
        sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", params={"format": "text"}, json={"version": 1, "to": "合夥人", "acknowledge_unchecked": True})
        self.assertEqual(sent.status_code, 200, sent.text)
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            row = connection.execute("SELECT payload_json FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND event_type='DocSaved' ORDER BY write_order DESC LIMIT 1", (self.tenant["tenant_id"], self.project["project_id"])).fetchone()
        self.assertEqual(row["payload_json"]["content"]["version"], 1)

    def test_draft_read_route_marks_the_current_version_as_read(self):
        draft = self._save_draft()
        before = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}/versions")
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        body = read.json()
        self.assertEqual(body["content"]["last_read_version"], body["version"])
        after = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}/versions")
        self.assertEqual([item["version"] for item in after.json()], [1])
        self.assertEqual(len(after.json()), len(before.json()))
        sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": body["version"], "to": "合夥人"})
        self.assertEqual(sent.status_code, 200, sent.text)

    def test_read_edit_read_send_works_and_edit_without_reread_is_refused(self):
        draft = self._save_draft()
        first_read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(first_read.status_code, 200, first_read.text)
        changed = {**first_read.json()["content"], "sentences": [{**first_read.json()["content"]["sentences"][0], "text": "我改過的話。"}]}
        edited = self.client.put(f"{self.base}/docs/express.draft/{draft['doc_id']}", json={"base_version": 1, "content": changed})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertNotIn("last_read_version", edited.json()["content"])
        not_reread = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 2, "to": "合夥人"})
        self.assertEqual(not_reread.status_code, 409, not_reread.text)
        self.assertIn("請重新讀一次再送", not_reread.text)
        second_read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(second_read.status_code, 200, second_read.text)
        sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 2, "to": "合夥人"})
        self.assertEqual(sent.status_code, 200, sent.text)

    def test_repeated_reads_write_one_bookkeeping_event_and_exports_omit_it(self):
        draft = self._save_draft()
        for _ in range(2):
            read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
            self.assertEqual(read.status_code, 200, read.text)
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            reads = connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND event_type='DocRead'", (self.tenant["tenant_id"], self.project["project_id"])).fetchone()[0]
        self.assertEqual(reads, 1)
        exported = self.client.get(f"{self.base}/govern/export")
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertNotIn('"type": "DocRead"', exported.text)

    def test_unchanged_ai_sentence_keeps_its_export_mark(self):
        content = {"format": "摘要", "reader": "合夥人", "sentences": [{"text": "AI 原句", "refs": [{"kind": "sense.card", "doc_id": self.record["doc_id"]}], "unchecked": False, "author": "ai"}]}
        draft = self.client.post(f"{self.base}/docs/express.draft", json={"content": content}).json()
        changed_label = self.client.put(f"{self.base}/docs/express.draft/{draft['doc_id']}", json={"base_version": 1, "content": {**content, "sentences": [{**content["sentences"][0], "author": "user"}]}})
        self.assertEqual(changed_label.status_code, 200, changed_label.text)
        self.assertEqual(changed_label.json()["content"]["sentences"][0]["author"], "ai")
        exported = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/export", params={"format": "text"})
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("AI 原句 （AI 寫的）", exported.text)

    def test_missing_or_non_boolean_seen_is_unread(self):
        for seen in (MISSING, "yes"):
            with self.subTest(seen=seen):
                draft = self._save_draft(seen=seen)
                refused = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 1, "to": "合夥人", "acknowledge_unchecked": True})
                self.assertEqual(refused.status_code, 409, refused.text)
                self.assertIn("請重新讀一次再送", refused.text)

    def test_send_rechecks_after_an_injected_edit_and_records_nothing(self):
        from ai_lego.apps.api.blocks import express as express_routes

        draft = self._save_draft()
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        original = express_routes._draft
        injected = False

        def draft_then_edit(docs, tenant_id, owner, draft_id):
            nonlocal injected
            current = original(docs, tenant_id, owner, draft_id)
            if not injected:
                injected = True
                CaseDocs(self._repo).save(
                    tenant_id, owner, "express.draft",
                    {**current["content"], "sentences": [{**current["content"]["sentences"][0], "text": "並發改過的話。"}]},
                    record_log.user(self.identity["identity_id"], "EXPRESS"), doc_id=draft_id, base_version=current["version"],
                )
            return current

        with patch.object(express_routes, "_draft", side_effect=draft_then_edit):
            refused = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 1, "to": "合夥人"})
        self.assertEqual(refused.status_code, 409, refused.text)
        self.assertIn("版本不對", refused.text)
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            sent = connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND payload_json->>'kind' = 'express.sent'", (self.tenant["tenant_id"], self.project["project_id"])).fetchone()[0]
        self.assertEqual(sent, 0)

    def test_render_failure_happens_before_sent_write(self):
        from ai_lego.apps.api.blocks import express as express_routes

        draft = self._save_draft()
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        with patch.object(express_routes, "render_pdf", side_effect=RuntimeError("renderer failed")):
            with self.assertRaises(RuntimeError):
                self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", params={"format": "pdf"}, json={"version": 1, "to": "合夥人"})
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            sent = connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND payload_json->>'kind' = 'express.sent'", (self.tenant["tenant_id"], self.project["project_id"])).fetchone()[0]
        self.assertEqual(sent, 0)

    def test_edit_after_recheck_is_blocked_until_sent_write_commits(self):
        draft = self._save_draft()
        read = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}")
        self.assertEqual(read.status_code, 200, read.text)
        original_save_many = CaseDocs.save_many
        original_save = CaseDocs._save
        writer_started = threading.Event()
        writer_committed = threading.Event()
        sent_write_started = threading.Event()
        writer_errors = []
        thread_holder = []

        def competing_edit():
            try:
                writer_started.set()
                CaseDocs(self._repo).save(
                    self.tenant["tenant_id"], record_log.case(self.project["project_id"]), "express.draft",
                    {**draft["content"], "sentences": [{**draft["content"]["sentences"][0], "text": "鎖外的競爭編輯。"}]},
                    record_log.user(self.identity["identity_id"], "EXPRESS"), doc_id=draft["doc_id"], base_version=1,
                )
                writer_committed.set()
            except BaseException as error:  # surfaced below; do not hide a failed competing writer
                writer_errors.append(error)

        def wrapped_save_many(self, tenant_id, owner, items, writer, check=None):
            def check_then_start_writer():
                check()
                thread = threading.Thread(target=competing_edit)
                thread.start()
                thread_holder.append(thread)

            return original_save_many(self, tenant_id, owner, items, writer, check=check_then_start_writer)

        def wrapped_save(self, connection, tenant_id, owner, kind, content, writer, doc_id, base_version):
            if kind == "express.sent":
                sent_write_started.set()
            return original_save(self, connection, tenant_id, owner, kind, content, writer, doc_id, base_version)

        with patch.object(CaseDocs, "save_many", wrapped_save_many), patch.object(CaseDocs, "_save", wrapped_save):
            sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 1, "to": "合夥人"})
        for thread in thread_holder:
            thread.join(timeout=5)
        self.assertFalse(writer_errors, writer_errors)
        self.assertTrue(writer_started.is_set())
        self.assertTrue(sent_write_started.is_set())
        self.assertTrue(writer_committed.is_set())
        self.assertEqual(sent.status_code, 200, sent.text)

    def test_seen_only_update_records_a_read_without_a_content_version(self):
        draft = self._save_draft(seen=MISSING)
        update = {**draft["content"], "sentences": [{**draft["content"]["sentences"][0], "seen": True}]}
        response = self.client.put(f"{self.base}/docs/express.draft/{draft['doc_id']}", json={"base_version": 1, "content": update})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["version"], 1)
        self.assertNotIn("seen", response.json()["content"]["sentences"][0])
        versions = self.client.get(f"{self.base}/express/drafts/{draft['doc_id']}/versions")
        self.assertEqual([item["version"] for item in versions.json()], [1])
        sent = self.client.post(f"{self.base}/express/drafts/{draft['doc_id']}/send", json={"version": 1, "to": "合夥人"})
        self.assertEqual(sent.status_code, 200, sent.text)

    def test_generic_sent_document_route_cannot_bypass_send(self):
        draft = self._save_draft()
        response = self.client.post(f"{self.base}/docs/express.sent", json={"content": {"draft": draft["doc_id"], "version": 1, "to": "合夥人"}})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertIn("EXPRESS_SENT_ROUTE_ONLY", response.text)


class ExpressOutboundScanTests(unittest.TestCase):
    def test_real_tree_has_no_outbound_path_and_temp_import_is_caught(self):
        _assert_no_outbound_code(PRODUCT_ROOT)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "ai_lego" / "apps" / "api" / "blocks"
            target.mkdir(parents=True)
            shutil.copy(PRODUCT_ROOT / "ai_lego" / "apps" / "api" / "blocks" / "express.py", target / "express.py")
            exports = root / "ai_lego" / "platform" / "exports"
            exports.mkdir(parents=True)
            shutil.copytree(PRODUCT_ROOT / "ai_lego" / "platform" / "exports", exports, dirs_exist_ok=True)
            (exports / "bad.py").write_text("import smtplib\n", encoding="utf-8")
            with self.assertRaises(AssertionError):
                _assert_no_outbound_code(root)


if __name__ == "__main__":
    unittest.main()
