"""POST /auth/login without tenant_id (the login page asked for a system id, 2026-10-11): an address is unique only within a
tenant, so the password is checked against the address in every tenant; nothing about a tenant is said before the password
matched there."""

from __future__ import annotations

import uuid

from ai_lego.platform.identity.store import IdentityStore
from tests.unit.test_api_main import ApiTestCase

PASSWORD = "correct-horse-battery"


class LoginAnywhereTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.email = f"{uuid.uuid4().hex}@example.com"   # the database is shared across tests: an address of this test only
        self.store = IdentityStore(self.databases)

    def _tenant(self, name: str, password: str = PASSWORD) -> str:
        tenant = self.store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name=name, home_jurisdiction="jurisdiction-pack.tw.v1",
                                          data_residency_region="local-dev", encryption_root_key_ref="kek")
        self.store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")
        self.store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], self.email, "Someone", password)
        return tenant["tenant_id"]

    def _login(self, password: str = PASSWORD, **extra):
        return self.client.post("/auth/login", json={"email": self.email.upper(), "password": password, **extra})

    def _session_tenant(self) -> str:
        project = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential"})
        self.assertEqual(project.status_code, 200, project.text)
        return project.json()["tenant_id"]

    def test_one_tenant_opens_its_session(self):
        tenant = self._tenant("工作室甲")
        response = self._login()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self._session_tenant(), tenant)

    def test_the_tenant_whose_password_matched_is_the_only_one_used_or_named(self):
        self._tenant("工作室甲", password="another-password-1")
        mine = self._tenant("工作室乙")
        response = self._login()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("工作室甲", response.text)
        self.assertEqual(self._session_tenant(), mine)

    def test_several_matches_ask_which_one_and_open_nothing(self):
        first, second = self._tenant("工作室甲"), self._tenant("工作室乙")
        response = self._login()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "LOGIN_CHOOSE_WORKSPACE")
        self.assertCountEqual(response.json()["detail"]["workspaces"], [{"tenant_id": first, "name": "工作室甲"}, {"tenant_id": second, "name": "工作室乙"}])
        self.assertNotIn("cognitive_os_session", response.headers.get("set-cookie", ""))
        chosen = self._login(tenant_id=second)
        self.assertEqual(chosen.status_code, 200, chosen.text)
        self.assertEqual(self._session_tenant(), second)

    def test_a_wrong_password_names_nothing(self):
        self._tenant("工作室甲")
        self._tenant("工作室乙")
        unknown = self.client.post("/auth/login", json={"email": f"{uuid.uuid4().hex}@example.com", "password": PASSWORD})
        for response in (self._login(password="wrong-password-here"), unknown):
            self.assertEqual((response.status_code, response.json()), (401, {"detail": "AUTH_FAILED: invalid credentials"}))
            self.assertNotIn("工作室", response.text)
