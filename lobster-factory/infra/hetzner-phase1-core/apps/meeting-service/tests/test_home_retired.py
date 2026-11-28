"""C19：首頁只剩會議工作區的入口；C15 之前的舊工作（等貼上摘要的、做完的）在工作區的端點照樣列出、續做、下載。
工作資料夾在暫存資料夾。"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
from lib import deck, summarize  # noqa: E402


def _minutes() -> dict:
    m = {"title": "舊週會", "tldr": ["舊工作續做"], "topics": [{"title": "議題", "points": ["一點"], "speakers": []}],
         "_provenance": "測試用", "coaching": {"overall": "測試", "per_slide": []}}
    summarize.normalize(m)
    m["coaching"]["per_slide"] = [{"slide": i + 1, "script": "講稿", "tips": []} for i in range(len(deck.plan_slides(m)))]
    return m


class HomePage(unittest.TestCase):
    def test_home_is_only_the_entry_to_the_workspace(self):
        page = TestClient(app_module.app, base_url="http://127.0.0.1:8420").get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn('href="/workspace"', page.text)
        for gone in ('type="file"', "/api/upload", "/api/ownvoice", "tpl-settings"):
            self.assertNotIn(gone, page.text)


class OldJobs(unittest.TestCase):
    """status.json as written before C15 (no source, steps or started_at; one sync_drive flag)."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.jobs = tmp.name
        self.waiting = self.job("0a0a0a0a0a0a", {"stage": "awaiting_summary", "error": None, "done": False, "sync_drive": False},
                                {"prompt.txt": "舊的提示", "merged.txt": "[00:00] 舊逐字稿"})
        self.done = self.job("0b0b0b0b0b0b", {"stage": "done", "error": None, "done": True, "sync_drive": False},
                             {"merged.txt": "[00:00] 做完的逐字稿", "meeting_record.docx": "docx"})
        patch = mock.patch.object(app_module, "JOBS_DIR", self.jobs)
        patch.start()
        self.addCleanup(patch.stop)
        self.client = TestClient(app_module.app, base_url="http://127.0.0.1:8420")

    def job(self, job_id: str, status: dict, files: dict) -> str:
        folder = os.path.join(self.jobs, job_id)
        os.makedirs(folder)
        with open(os.path.join(folder, "status.json"), "w", encoding="utf-8") as f:
            json.dump(status, f)
        for name, text in files.items():
            with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
                f.write(text)
        return job_id

    def test_listed_resumable_and_downloadable_from_the_workspace(self):
        listed = {j["id"]: j for j in self.client.get("/api/jobs").json()["jobs"]}
        self.assertEqual(listed[self.waiting]["stage"], "awaiting_summary")
        self.assertIn("word", listed[self.done]["downloads"])

        self.assertEqual(self.client.get(f"/api/prompt/{self.waiting}").text, "舊的提示")
        r = self.client.post(f"/api/submit-summary/{self.waiting}", json={"text": json.dumps(_minutes(), ensure_ascii=False)})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self.client.get(f"/api/status/{self.waiting}").json()["done"])
        self.assertEqual(self.client.get(f"/api/download/{self.waiting}/slides").status_code, 200)
        self.assertEqual(self.client.get(f"/api/download/{self.done}/word").content, b"docx")


if __name__ == "__main__":
    unittest.main()
