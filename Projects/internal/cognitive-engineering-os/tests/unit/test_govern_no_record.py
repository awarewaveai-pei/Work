"""GOVERN's 「不留紀錄」 and the case's audit line (docs/platform/STEP34_SHARED_RULES.md §10; card 32), on a real PostgreSQL."""

from __future__ import annotations

import json

from ai_lego.apps.api import main as api_main
from ai_lego.apps.api.blocks import govern_group
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.rulesets import require
from tests.pg import dump
from tests.unit.test_api_main import ApiTestCase

PRIVATE = "只有我知道的祕密詞"


class CaseCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.repo = ProjectSourceRepository(self.databases)
        self.docs = CaseDocs(self.repo)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        self._login()
        self.me = self.identity["identity_id"]
        self.case = self.client.post("/projects", json={"name": "不留紀錄的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]

    def intake(self, no_record: bool, base_version: int | None = None):
        content = {"purpose": "複雜決策", "question": PRIVATE, "package": "個人複雜決策", "you_are_in": "台北", "no_record": no_record}
        if base_version is None:
            return self.client.post(f"/projects/{self.case}/docs/assembler.intake", json={"content": content})
        doc_id = self.docs.current(self.tenant["tenant_id"], record_log.case(self.case), "assembler.intake")[0]["doc_id"]
        return self.client.put(f"/projects/{self.case}/docs/assembler.intake/{doc_id}", json={"content": content, "base_version": base_version})


class NoRecordTests(CaseCase):
    def test_the_warning_is_given_before_the_choice(self):
        spec = self.client.get("/blocks/govern/spec").json()
        self.assertEqual(spec["no_record"]["warning"], "關掉之後整個案子會刪掉，不能匯出")

    def test_closing_a_no_record_case_leaves_nothing_of_it_anywhere(self):
        self.assertEqual(self.intake(True).status_code, 200)
        self.client.post(f"/projects/{self.case}/docs/sense.card", json={"content": {"category": "事件", "text": PRIVATE}})
        self.docs.save(self.tenant["tenant_id"], record_log.person(self.me), "learn.history", {"project": self.case, "own_docs": 1}, record_log.system("LEARN"))
        closed = self.client.post(f"/projects/{self.case}/govern/close")
        self.assertEqual(closed.status_code, 200, closed.text)
        rows = "\n".join(dump(self.databases))
        self.assertNotIn(self.case, rows)   # no row of any table names it: no tombstone, no history line, no job
        self.assertNotIn(PRIVATE, rows)
        self.assertEqual(self.client.get(f"/projects/{self.case}").status_code, 404)
        self.assertEqual(self.repo.erased_projects(self.tenant["tenant_id"], self.me), [])

    def test_switched_off_before_closing_the_case_stays_and_a_kept_case_is_not_closed_this_way(self):
        self.intake(True)
        self.assertEqual(self.intake(False, base_version=1).status_code, 200)
        refused = self.client.post(f"/projects/{self.case}/govern/close")
        self.assertEqual((refused.status_code, refused.json()["detail"].split(":")[0]), (409, "CASE_KEEPS_RECORDS"))
        self.assertEqual(self.client.get(f"/projects/{self.case}").status_code, 200)

    def test_a_plain_delete_of_a_no_record_case_leaves_no_tombstone_either(self):
        self.intake(True)
        self.assertEqual(self.client.delete(f"/projects/{self.case}").status_code, 200)
        self.assertNotIn(self.case, "\n".join(dump(self.databases)))

    def test_someone_elses_case_answers_404(self):
        self.intake(True)
        other = self.client.post("/projects", json={"name": "另一個", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        self.assertEqual(self.client.post("/projects/not-a-case/govern/close").status_code, 404)
        self.assertEqual(self.client.post(f"/projects/{other}/govern/close").status_code, 409)


class AuditLineTests(CaseCase):
    def test_versions_and_no_content(self):
        tenant, owner = self.tenant["tenant_id"], record_log.case(self.case)
        self.intake(False)
        self.docs.save(tenant, owner, "govern.ai_call", {"block": "SENSE", "action": "sense.mirror", "model": "claude-test-1", "instructions_sha256": "a" * 64}, record_log.system("GOVERN"))
        stamp = require("verify.factcheck_dbs").stamp()
        self.docs.save(tenant, owner, "verify.factcheck", {"message": PRIVATE[:6], "dbs": [{"db": PRIVATE, "state": "查不到"}], "rules": stamp}, record_log.system("VERIFY"))
        self.client.post(f"/projects/{self.case}/docs/sense.card", json={"content": {"category": "事件", "text": PRIVATE}})
        used = self.client.get(f"/projects/{self.case}/govern/used")
        self.assertEqual(used.status_code, 200, used.text)
        body = used.json()
        self.assertEqual([(turn["model"], turn["instructions"]) for turn in body["ai_turns"]], [("claude-test-1", "a" * 64)])
        self.assertIn({"name": stamp["name"], "version": stamp["version"], "fingerprint": stamp["fingerprint"], "title": require("verify.factcheck_dbs").title},
                      body["rulesets"])
        self.assertNotIn(PRIVATE, json.dumps(body, ensure_ascii=False))
        self.assertNotIn(PRIVATE[:6], json.dumps(body, ensure_ascii=False))
        self.assertTrue(all(label for label in body["labels"].values()))

    def test_someone_elses_case_is_404(self):
        self.assertEqual(self.client.get("/projects/not-a-case/govern/used").status_code, 404)


class GateTests(CaseCase):
    def test_the_audit_route_reads_stamps_only(self):
        self.assertEqual(govern_group.stamps({"rules": {"name": "verify.factcheck_dbs", "version": PRIVATE, "fingerprint": "zz"}, "text": PRIVATE}), [])
