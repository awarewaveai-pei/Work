"""Tests for ``ai_lego.platform.entitlement.check.check_entitlement``."""

from __future__ import annotations

import tempfile
import unittest
import uuid
from pathlib import Path

from ai_lego.platform.entitlement.check import check_entitlement
from ai_lego.platform.identity.store import IdentityStore


class CheckEntitlementTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.store = IdentityStore(Path(self._tmpdir.name) / "identity.sqlite3")

    def tearDown(self):
        self._tmpdir.cleanup()

    def _make_tenant(self, status: str = "active") -> str:
        tenant_id = str(uuid.uuid4())
        self.store.create_tenant(
            tenant_id=tenant_id,
            legal_name="Test Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        if status != "active":
            with self.store._connect() as conn:  # noqa: SLF001
                conn.execute("UPDATE tenant SET status = ? WHERE tenant_id = ?", (status, tenant_id))
        return tenant_id

    def test_active_tenant_is_granted(self):
        tenant_id = self._make_tenant()
        self.assertTrue(check_entitlement(self.store, tenant_id, "experiment.mvp"))

    def test_nonexistent_tenant_is_denied(self):
        self.assertFalse(check_entitlement(self.store, str(uuid.uuid4()), "experiment.mvp"))

    def test_suspended_tenant_is_denied(self):
        tenant_id = self._make_tenant(status="suspended")
        self.assertFalse(check_entitlement(self.store, tenant_id, "experiment.mvp"))

    def test_deleted_tenant_is_denied(self):
        tenant_id = self._make_tenant(status="deleted")
        self.assertFalse(check_entitlement(self.store, tenant_id, "experiment.mvp"))

    def test_every_check_is_audited_regardless_of_outcome(self):
        granted_tenant = self._make_tenant()
        denied_tenant_id = str(uuid.uuid4())
        check_entitlement(self.store, granted_tenant, "experiment.mvp")
        check_entitlement(self.store, denied_tenant_id, "experiment.mvp")
        with self.store._connect() as conn:  # noqa: SLF001
            rows = conn.execute("SELECT tenant_id, granted FROM entitlement_audit ORDER BY id").fetchall()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["granted"], 1)
        self.assertEqual(rows[1]["granted"], 0)


if __name__ == "__main__":
    unittest.main()
