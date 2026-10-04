from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.project import project_record
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.data.events import record_log
from tests.unit.test_api_main import ApiTestCase


class ReportApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.repo = ProjectSourceRepository(self.databases)
        self.artifacts = JsonArtifactStore(TenantScopedCas(root / "artifact-cas"))
        self.source_cas = TenantScopedCas(root / "source-cas")
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        api_main.app.dependency_overrides[api_main.get_artifact_store] = lambda: self.artifacts
        api_main.app.dependency_overrides[api_main.get_source_cas] = lambda: self.source_cas
        self._login()
        self.project_id = str(uuid.uuid4())
        workspace_id = api_main.app.dependency_overrides[api_main.get_store]().list_workspaces(self.tenant["tenant_id"])[0]["workspace_id"]
        self.repo.create_project(project_record(
            self.project_id, self.tenant["tenant_id"], workspace_id, "Report project", "Report API", "Confidential",
            self.identity["identity_id"], "2026-09-25T00:00:00Z",
        ))
        source = self.client.post(f"/projects/{self.project_id}/sources", json={"title": "Searchable study", "media_type": "text/plain", "data_classification": "Confidential", "content": "study content", "canonical_url": "https://example.com/1"}).json()
        entries = [{"n": 1, "id": f"source:{source['source_id']}", "source_id": source["source_id"], "sha256": source["content_sha256"], "start": 0, "end": 10,
                    "title": "Source one", "url": "https://example.com/1", "fetched_at": "2026-09-25T00:00:00Z", "source_class": None}]
        synthesis_artifact = {
            "synthesis": {
                "synthesis_id": "SYN-TEST-001", "project_id": self.project_id, "kind": "dossier_brief",
                "summary": {"text": "結論", "citations": [f"source:{source['source_id']}"]}, "sections": [], "gaps": [], "conflicts": [],
                "uncited_sections": [], "manifest_ref": {"sha256": "b" * 64, "count": 1, "batches": 1},
            },
            "manifest": {"entries": entries, "batches": [[1]], "sha256": "b" * 64},
            "gate_results": [{"gate_id": "citation_integrity", "status": "PASS", "evidence": {}}],
        }
        reference = self.artifacts.put(self.tenant["tenant_id"], "LiteratureMatrix", synthesis_artifact)
        self.repo.save_synthesis(self.tenant["tenant_id"], self.project_id, "SYN-TEST-001", "literature_matrix", reference, "2026-09-25T00:00:00Z")
        self.source_id = source["source_id"]

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

    def test_cross_project_search_is_tenant_scoped_and_returns_citing_findings(self):
        response = self.client.get("/sources/search", params={"q": "Searchable", "limit": 10})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()["results"]
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["source"]["source_id"], self.source_id)
        self.assertEqual(result[0]["project"]["project_id"], self.project_id)
        self.assertEqual(result[0]["findings"][0]["text"], "結論")
        self.assertEqual(self.client.get("/sources/search", params={"q": "   "}).status_code, 400)

    def _events(self) -> list[str]:
        return [event["event_type"] for event in self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}")]

    def _new_report(self) -> str:
        return self.client.post(f"/projects/{self.project_id}/reports", json={"synthesis_id": "SYN-TEST-001"}).json()["report_id"]

    def test_caller_supplied_run_results_are_refused(self):
        forged = [{"run_id": "RUN-X", "recipe_id": "r", "status": "SUCCEEDED", "workflow": {"steps": [], "workflow_gates": [{"gate_id": "g", "status": "PASS"}]}}]
        response = self.client.post(f"/projects/{self.project_id}/reports", json={"synthesis_id": "SYN-TEST-001", "run_results": forged})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("REPORT_RUN_RESULTS_UNBOUND", response.text)

    def test_second_approval_is_refused_and_not_audited_twice(self):
        report_id = self._new_report()
        url = f"/projects/{self.project_id}/reports/{report_id}/approval"
        self.assertEqual(self.client.post(url, json={"decision": "approve"}).status_code, 200)
        again = self.client.post(url, json={"decision": "approve"})
        self.assertEqual(again.status_code, 409, again.text)
        self.assertIn("REPORT_ALREADY_APPROVED", again.text)
        self.assertEqual(self._events().count("ReportApproved"), 1)

    def test_reject_after_approve_records_the_previous_state(self):
        report_id = self._new_report()
        url = f"/projects/{self.project_id}/reports/{report_id}/approval"
        self.client.post(url, json={"decision": "approve"})
        self.assertEqual(self.client.post(url, json={"decision": "reject", "reason": "發現錯誤"}).status_code, 200)
        report = self.client.get(f"/projects/{self.project_id}/reports/{report_id}").json()["report"]
        self.assertEqual((report["report_state"], report["approved_by"]), ("AI_GENERATED", None))
        rejected = [e for e in self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}") if e["event_type"] == "ReportRejected"]
        self.assertEqual(rejected[-1]["payload"]["previous_state"], "HUMAN_APPROVED")

    def test_report_with_failed_gate_cannot_be_approved(self):
        tenant_id = self.tenant["tenant_id"]
        base = self.artifacts.read(tenant_id, self.repo.get_synthesis(tenant_id, self.project_id, "SYN-TEST-001")["artifact_reference"])
        failing = self.artifacts.put(tenant_id, "LiteratureMatrix", {**base, "gate_results": [{"gate_id": "citation_integrity", "status": "FAIL", "evidence": {}}]})
        self.repo.save_synthesis(tenant_id, self.project_id, "SYN-FAIL-001", "literature_matrix", failing, "2026-09-25T00:00:01Z")
        created = self.client.post(f"/projects/{self.project_id}/reports", json={"synthesis_id": "SYN-FAIL-001"})
        self.assertEqual(created.status_code, 201, created.text)
        refused = self.client.post(f"/projects/{self.project_id}/reports/{created.json()['report_id']}/approval", json={"decision": "approve"})
        self.assertEqual(refused.status_code, 409, refused.text)
        self.assertIn("REPORT_GATE_FAILED", refused.text)

    def test_concurrent_decision_loses_with_409_and_leaves_the_winner_intact(self):
        report_id = self._new_report()
        original = self.repo.update_report_reference

        def racing(tenant_id, project_id, rid, expected, new, event_type, payload, *, writer):
            winner = self.artifacts.put(tenant_id, "ResearchReport", {"report": {"report_state": "AI_GENERATED", "approved_by": None, "markdown": "winner"}, "gate_results": []})
            original(tenant_id, project_id, rid, expected, winner, "ReportRejected", {"report_id": rid, "reason": "winner"}, writer=writer)
            return original(tenant_id, project_id, rid, expected, new, event_type, payload, writer=writer)   # now stale

        self.repo.update_report_reference = racing
        try:
            lost = self.client.post(f"/projects/{self.project_id}/reports/{report_id}/approval", json={"decision": "approve"})
        finally:
            self.repo.update_report_reference = original
        self.assertEqual(lost.status_code, 409, lost.text)
        self.assertIn("REPORT_STALE", lost.text)
        self.assertEqual(self._events().count("ReportApproved"), 0)
        self.assertEqual(self.client.get(f"/projects/{self.project_id}/reports/{report_id}").json()["report"]["markdown"], "winner")

    def test_report_pointer_update_checks_expected_reference(self):
        report_id = self._new_report()
        tenant_id = self.tenant["tenant_id"]
        other = self.artifacts.put(tenant_id, "ResearchReport", {"report": {}, "gate_results": []})
        with self.assertRaises(InvariantViolation) as caught:
            self.repo.update_report_reference(tenant_id, self.project_id, report_id, other, other, "ReportApproved", {}, writer=record_log.user("someone", "VERIFY"))
        self.assertEqual(str(caught.exception), "REPORT_STALE")
        with self.assertRaises(InvariantViolation) as caught:
            self.repo.update_report_reference(tenant_id, self.project_id, "RPT-MISSING", other, other, "ReportApproved", {}, writer=record_log.user("someone", "VERIFY"))
        self.assertEqual(str(caught.exception), "REPORT_NOT_FOUND")

    def _second_tenant_client(self):
        store = IdentityStore(self.databases)
        tenant = store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other Tenant", home_jurisdiction="jurisdiction-pack.tw.v1",
                                     data_residency_region="local-dev", encryption_root_key_ref="test-kek-ref")
        workspace_id = store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")["workspace_id"]
        identity = store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], "other@example.com", "Other", "correct-horse-battery")
        client = TestClient(api_main.app, base_url="https://testserver")
        self.assertEqual(client.post("/auth/login", json={"tenant_id": tenant["tenant_id"], "email": "other@example.com", "password": "correct-horse-battery"}).status_code, 200)
        project_id = str(uuid.uuid4())
        self.repo.create_project(project_record(project_id, tenant["tenant_id"], workspace_id, "Other project", "Other", "Confidential", identity["identity_id"], "2026-09-25T00:00:00Z"))
        return client, project_id

    def test_other_tenant_can_neither_read_a_report_nor_find_its_sources(self):
        report_id = self._new_report()
        other, other_project = self._second_tenant_client()
        self.assertEqual(other.get(f"/projects/{self.project_id}/reports/{report_id}").status_code, 404)
        self.assertEqual(other.get(f"/projects/{self.project_id}/reports/{report_id}/export").status_code, 404)
        self.assertEqual(other.post(f"/projects/{self.project_id}/reports/{report_id}/approval", json={"decision": "approve"}).status_code, 404)
        self.assertEqual(other.get("/sources/search", params={"q": "Searchable"}).json()["results"], [])
        made = other.post(f"/projects/{other_project}/sources", json={"title": "Foreign study", "media_type": "text/plain", "data_classification": "Confidential", "content": "x"})
        self.assertEqual(made.status_code, 200, made.text)
        self.assertEqual(self.client.get("/sources/search", params={"q": "Foreign"}).json()["results"], [])
        self.assertEqual(len(other.get("/sources/search", params={"q": "Foreign"}).json()["results"]), 1)

    def test_search_treats_like_wildcards_as_literals(self):
        made = self.client.post(f"/projects/{self.project_id}/sources", json={"title": "50% growth", "media_type": "text/plain", "data_classification": "Confidential", "content": "y"})
        self.assertEqual(made.status_code, 200, made.text)
        titles = [r["source"]["title"] for r in self.client.get("/sources/search", params={"q": "%"}).json()["results"]]
        self.assertEqual(titles, ["50% growth"])
        self.assertEqual(self.client.get("/sources/search", params={"q": chr(92)}).json()["results"], [])

    def test_search_findings_come_only_from_cited_claims_of_the_same_project(self):
        by_id = {r["source"]["source_id"]: r for r in self.client.get("/sources/search", params={"q": "Searchable"}).json()["results"]}
        finding = by_id[self.source_id]["findings"][0]
        self.assertEqual((finding["citation"], finding["synthesis_id"], finding["project_id"]), (f"source:{self.source_id}", "SYN-TEST-001", self.project_id))
        uncited = self.client.post(f"/projects/{self.project_id}/sources", json={"title": "Searchable uncited", "media_type": "text/plain", "data_classification": "Confidential", "content": "z"}).json()
        results = {r["source"]["source_id"]: r for r in self.client.get("/sources/search", params={"q": "Searchable"}).json()["results"]}
        self.assertEqual(results[uncited["source_id"]]["findings"], [])

    def test_search_finds_citations_in_every_synthesis_location(self):
        tenant_id = self.tenant["tenant_id"]
        cite = [f"source:{self.source_id}"]
        shapes = {
            "LiteratureMatrix": {"studies": [{"study_id": "ST1", "source_id": self.source_id, "claim": "study claim", "citations": cite}]},
            "DecisionEvidenceBrief": {"options": [{"option_id": "O1", "name": "option name", "citations": cite}],
                                      "evidence": [{"text": "evidence text", "citations": cite}]},
            "DossierBrief": {"conflicts": [{"text": "conflict text", "citations": cite * 2}],
                             "related_entities": [{"name": "entity name", "relation": "r", "citations": cite}],
                             "sections": [{"heading": "Sec heading", "claims": [{"claim_id": "C1", "text": "section claim", "citations": cite}]}]},
        }
        for artifact_type, extra in shapes.items():
            synthesis_id = f"SYN-{artifact_type}"
            reference = self.artifacts.put(tenant_id, artifact_type, {"synthesis": {"synthesis_id": synthesis_id, "project_id": self.project_id, **extra}, "gate_results": []})
            self.repo.save_synthesis(tenant_id, self.project_id, synthesis_id, "literature_matrix", reference, "2026-09-25T00:00:02Z")
        found = {(f["synthesis_id"], f["heading"], f["text"]) for f in self.client.get("/sources/search", params={"q": "Searchable"}).json()["results"][0]["findings"]}
        for expected in [
            ("SYN-LiteratureMatrix", "studies", "study claim"),
            ("SYN-DecisionEvidenceBrief", "options", "option name"),
            ("SYN-DecisionEvidenceBrief", "evidence", "evidence text"),
            ("SYN-DossierBrief", "conflicts", "conflict text"),
            ("SYN-DossierBrief", "related_entities", "entity name"),
            ("SYN-DossierBrief", "Sec heading", "section claim"),
        ]:
            self.assertIn(expected, found)

    def test_search_reports_unreadable_synthesis_instead_of_empty_findings(self):
        tenant_id = self.tenant["tenant_id"]
        complete = self.client.get("/sources/search", params={"q": "Searchable"}).json()
        self.assertEqual(complete["incomplete"], [])
        self.assertTrue(complete["results"][0]["findings_complete"])
        reference = self.repo.get_synthesis(tenant_id, self.project_id, "SYN-TEST-001")["artifact_reference"]
        self.artifacts.cas.unlink(tenant_id, reference["cas_path"])
        broken = self.client.get("/sources/search", params={"q": "Searchable"}).json()
        self.assertEqual(broken["results"][0]["findings"], [])
        self.assertFalse(broken["results"][0]["findings_complete"])
        self.assertEqual(broken["incomplete"], [{"project_id": self.project_id, "reason": "ARTIFACT_UNREADABLE"}])

    def test_search_artifact_budget_is_a_hard_cap_reported_as_incomplete(self):
        original = api_main.MAX_SEARCH_SYNTHESIS_READS
        api_main.MAX_SEARCH_SYNTHESIS_READS = 0
        try:
            capped = self.client.get("/sources/search", params={"q": "Searchable"}).json()
        finally:
            api_main.MAX_SEARCH_SYNTHESIS_READS = original
        self.assertEqual(capped["results"][0]["findings"], [])
        self.assertFalse(capped["results"][0]["findings_complete"])
        self.assertEqual(capped["incomplete"], [{"project_id": self.project_id, "reason": "SEARCH_ARTIFACT_BUDGET_EXCEEDED"}])

    def test_every_decision_writes_a_distinct_blob(self):
        # The CAS is content-addressed: if two versions could share bytes, deleting the replaced or losing version would
        # delete the live one (including across the gap between a pointer read and the unlink).
        report_id = self._new_report()
        url = f"/projects/{self.project_id}/reports/{report_id}/approval"
        seen = [self.repo.get_report(self.tenant["tenant_id"], self.project_id, report_id)["artifact_reference"]["content_sha256"]]
        for body in ({"decision": "reject", "reason": "a"}, {"decision": "reject", "reason": "a"}, {"decision": "approve"}, {"decision": "reject", "reason": "a"}):
            self.assertEqual(self.client.post(url, json=body).status_code, 200)
            seen.append(self.repo.get_report(self.tenant["tenant_id"], self.project_id, report_id)["artifact_reference"]["content_sha256"])
        self.assertEqual(len(set(seen)), len(seen))

    def test_repeating_a_decision_that_changes_no_bytes_keeps_the_report_readable(self):
        report_id = self._new_report()
        url = f"/projects/{self.project_id}/reports/{report_id}/approval"
        for _ in range(3):   # the 2nd and 3rd reject write bytes identical to the stored artifact
            self.assertEqual(self.client.post(url, json={"decision": "reject", "reason": "再看一次"}).status_code, 200)
            self.assertEqual(self.client.get(f"/projects/{self.project_id}/reports/{report_id}").status_code, 200)
            self.assertEqual(self.client.get(f"/projects/{self.project_id}/reports/{report_id}/export").status_code, 200)

    def test_search_marks_a_result_set_cut_by_limit_as_truncated(self):
        for n in range(2):
            made = self.client.post(f"/projects/{self.project_id}/sources", json={"title": f"Searchable extra {n}", "media_type": "text/plain", "data_classification": "Confidential", "content": f"c{n}"})
            self.assertEqual(made.status_code, 200, made.text)   # 3 matches in total with the setUp source
        cut = self.client.get("/sources/search", params={"q": "Searchable", "limit": 2}).json()
        self.assertEqual((len(cut["results"]), cut["truncated"], cut["limit"]), (2, True, 2))
        exact = self.client.get("/sources/search", params={"q": "Searchable", "limit": 3}).json()
        self.assertEqual((len(exact["results"]), exact["truncated"]), (3, False))
        self.assertFalse(self.client.get("/sources/search", params={"q": "Searchable"}).json()["truncated"])

    def test_search_marks_malformed_artifacts_and_references_incomplete(self):
        tenant_id = self.tenant["tenant_id"]
        shapeless = self.artifacts.put(tenant_id, "LiteratureMatrix", {"synthesis": "not an object"})
        self.repo.save_synthesis(tenant_id, self.project_id, "SYN-SHAPELESS", "literature_matrix", shapeless, "2026-09-25T00:00:03Z")
        result = self.client.get("/sources/search", params={"q": "Searchable"}).json()
        self.assertEqual(result["incomplete"], [{"project_id": self.project_id, "reason": "ARTIFACT_MALFORMED"}])
        self.assertFalse(result["results"][0]["findings_complete"])
        with self.assertRaises(InvariantViolation) as caught:
            self.artifacts.cas.read(tenant_id, {"tenant_segment": tenant_id})   # a cas_path without "path"
        self.assertEqual(str(caught.exception), "CAS_PATH_INVALID")
