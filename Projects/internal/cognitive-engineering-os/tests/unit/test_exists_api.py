"""GET /exists/<kind>/{id} (blocks/exists.py): the web's page-load check. The owner gets 204; someone else gets exactly the
body the kind's read route gives them (never more), and an unknown id the same; each route needs only what its read route
needs (Codex aee2c44a: a method needs no session; a broken method catalog does not touch the case checks)."""

from __future__ import annotations

import uuid

from ai_lego.apps.api import main as api_main
from ai_lego.data.events import record_log
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class ExistsApiTests(ProjectSourceApiTestCase):
    def test_owner_204_others_and_unknown_get_the_read_routes_404(self):
        self.assertEqual(self.client.get("/exists/project/x").status_code, 401)
        self._login()
        project = self._create_project()["project_id"]
        self._repo.append_event(self.tenant["tenant_id"], project, "InterpretationRequested", {"interpretation_id": "i-1", "method_id": "systems.iceberg_model"},
                                record_log.user(self.identity["identity_id"], "MAP"))
        group = self.client.post("/groups", json={"name": "g", "purpose": "decision"}).json()["group_id"]
        mine = {"project": project, "interpretation": "i-1", "group": group, "method": "systems.iceberg_model"}
        read = {"project": f"/projects/{project}", "interpretation": "/interpretations/i-1", "group": f"/groups/{group}"}
        for kind, item in mine.items():
            self.assertEqual(self.client.get(f"/exists/{kind}/{item}").status_code, 204, kind)
            self.assertEqual(self.client.get(f"/exists/{kind}/no-such-id").status_code, 404, kind)
        # someone else in the SAME organisation: only the owner check stands between them (tenant scoping would hide it from
        # another organisation anyway)
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.assertEqual(self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"}).status_code, 200)
        for kind, path in read.items():
            asked, own_route = self.client.get(f"/exists/{kind}/{mine[kind]}"), self.client.get(path)
            self.assertEqual((asked.status_code, asked.json()), (404, own_route.json()), kind)   # not theirs: the read route's 404, word for word
            self.assertEqual(own_route.status_code, 404, kind)

    def test_each_check_needs_only_what_its_read_route_needs(self):
        form, asked = self.client.get("/methods/no-such-tool/form"), self.client.get("/exists/method/no-such-tool")
        self.assertEqual((asked.status_code, asked.json()), (404, form.json()))   # no session, like the form
        self.assertEqual(self.client.get("/exists/method/systems.iceberg_model").status_code, 204)
        self._login()
        project = self._create_project()["project_id"]

        def broken():
            raise RuntimeError("catalog unreadable")
        api_main.app.dependency_overrides[api_main.get_catalog] = broken
        try:
            self.assertEqual(self.client.get(f"/exists/project/{project}").status_code, 204)
        finally:
            api_main.app.dependency_overrides.pop(api_main.get_catalog)
