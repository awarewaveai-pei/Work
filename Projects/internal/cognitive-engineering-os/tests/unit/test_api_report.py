from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.project import project_record
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from tests.unit.test_api_main import ApiTestCase


class ReportApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.repo = ProjectSourceRepository(root / "projects.sqlite3")
        self.artifacts = JsonArtifactStore(TenantScopedCas(root / "artifact-cas"))
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        api_main.app.dependency_overrides[api_main.get_artifact_store] = lambda: self.artifacts
        self._login()
        self.project_id = str(uuid.uuid4())
        workspace_id = api_main.app.dependency_overrides[api_main.get_store]().list_workspaces(self.tenant["tenant_id"])[0]["workspace_id"]
        self.repo.create_project(project_record(
            self.project_id, self.tenant["tenant_id"], workspace_id, "Report project", "Report API", "Confidential",
            self.identity["identity_id"], "2026-09-25T00:00:00Z",
        ))
        entries = [{"n": 1, "id": "source:S1", "source_id": "S1", "sha256": "a" * 64, "start": 0, "end": 10,
                    "title": "Source one", "url": "https://example.com/1", "fetched_at": "2026-09-25T00:00:00Z", "source_class": None}]
        synthesis_artifact = {
            "synthesis": {
                "synthesis_id": "SYN-TEST-001", "project_id": self.project_id, "kind": "dossier_brief",
                "summary": {"text": "結論", "citations": ["source:S1"]}, "sections": [], "gaps": [], "conflicts": [],
                "uncited_sections": [], "manifest_ref": {"sha256": "b" * 64, "count": 1, "batches": 1},
            },
            "manifest": {"entries": entries, "batches": [[1]], "sha256": "b" * 64},
            "gate_results": [{"gate_id": "citation_integrity", "status": "PASS", "evidence": {}}],
        }
        reference = self.artifacts.put(self.tenant["tenant_id"], "LiteratureMatrix", synthesis_artifact)
        self.repo.save_synthesis(self.tenant["tenant_id"], self.project_id, "SYN-TEST-001", "literature_matrix", reference, "2026-09-25T00:00:00Z")

    def tearDown(self):
        self._tmp.cleanup()
        super().tearDown()

    def test_create_get_and_markdown_export_report(self):
        created = self.client.post(f"/projects/{self.project_id}/reports", json={"synthesis_id": "SYN-TEST-001"})
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "AI_GENERATED")
        report_id = body["report_id"]
        fetched = self.client.get(f"/projects/{self.project_id}/reports/{report_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["report"]["report_state"], "AI_GENERATED")
        exported = self.client.get(f"/projects/{self.project_id}/reports/{report_id}/export")
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("Source one", exported.content.decode("utf-8"))
        self.assertEqual(exported.headers["content-type"], "text/markdown; charset=utf-8")

    def test_approval_and_rejection_are_gate_checked_and_audited(self):
        report_id = self.client.post(f"/projects/{self.project_id}/reports", json={"synthesis_id": "SYN-TEST-001"}).json()["report_id"]
        rejected = self.client.post(f"/projects/{self.project_id}/reports/{report_id}/approval", json={"decision": "reject"})
        self.assertEqual(rejected.status_code, 400, rejected.text)
        rejected = self.client.post(f"/projects/{self.project_id}/reports/{report_id}/approval", json={"decision": "reject", "reason": "請補資料"})
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(self.client.get(f"/projects/{self.project_id}/reports/{report_id}").json()["report"]["report_state"], "AI_GENERATED")
        approved = self.client.post(f"/projects/{self.project_id}/reports/{report_id}/approval", json={"decision": "approve"})
        self.assertEqual(approved.status_code, 200, approved.text)
        report = self.client.get(f"/projects/{self.project_id}/reports/{report_id}").json()["report"]
        self.assertEqual(report["report_state"], "HUMAN_APPROVED")
        self.assertEqual(report["approved_by"], self.identity["identity_id"])
        event_types = [event["event_type"] for event in self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}")]
        self.assertIn("ReportCreated", event_types)
        self.assertIn("ReportRejected", event_types)
        self.assertIn("ReportApproved", event_types)
