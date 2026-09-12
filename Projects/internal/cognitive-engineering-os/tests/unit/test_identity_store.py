"""Tests for ``ai_lego.platform.identity.store.IdentityStore`` -- real SQLite file per test
(tempfile, not mocked), real PBKDF2 hashing, real session issuance/expiry."""

from __future__ import annotations

import datetime
import tempfile
import unittest
import uuid
from pathlib import Path

from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity import store as store_module
from ai_lego.platform.identity.store import IdentityStore


class _TempStoreTestCase(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.store = IdentityStore(Path(self._tmpdir.name) / "identity.sqlite3")

    def tearDown(self):
        self._tmpdir.cleanup()

    def _make_tenant(self, **overrides):
        base = dict(
            tenant_id=str(uuid.uuid4()),
            legal_name="Test Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        base.update(overrides)
        return self.store.create_tenant(**base)


class TenantTests(_TempStoreTestCase):
    def test_create_and_get_tenant(self):
        tenant = self._make_tenant()
        fetched = self.store.get_tenant(tenant["tenant_id"])
        self.assertEqual(fetched["tenant_id"], tenant["tenant_id"])
        self.assertEqual(fetched["status"], "active")

    def test_get_nonexistent_tenant_returns_none(self):
        self.assertIsNone(self.store.get_tenant(str(uuid.uuid4())))


class WorkspaceTests(_TempStoreTestCase):
    def test_create_workspace_under_real_tenant(self):
        tenant = self._make_tenant()
        workspace = self.store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")
        self.assertEqual(workspace["tenant_id"], tenant["tenant_id"])

    def test_workspace_dangling_tenant_ref_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKSPACE_DANGLING_TENANT_REF"):
            self.store.create_workspace(str(uuid.uuid4()), str(uuid.uuid4()), "Default")

    def test_duplicate_workspace_name_in_same_tenant_refused(self):
        tenant = self._make_tenant()
        self.store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")
        with self.assertRaises(Exception):  # sqlite3.IntegrityError -- UNIQUE(tenant_id, name)
            self.store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")


class IdentityCreationTests(_TempStoreTestCase):
    def test_create_identity_under_real_tenant(self):
        tenant = self._make_tenant()
        identity = self.store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")
        self.assertEqual(identity["tenant_id"], tenant["tenant_id"])
        self.assertEqual(identity["email"], "user@example.com")

    def test_identity_dangling_tenant_ref_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_DANGLING_TENANT_REF"):
            self.store.create_identity(str(uuid.uuid4()), str(uuid.uuid4()), "user@example.com", "User", "correct-horse-battery")

    def test_weak_password_refused(self):
        tenant = self._make_tenant()
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_WEAK_PASSWORD"):
            self.store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], "user@example.com", "User", "short")

    def test_identity_record_never_carries_password_hash(self):
        tenant = self._make_tenant()
        identity = self.store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")
        self.assertNotIn("password_hash", identity)
        self.assertNotIn("password", identity)


class AuthenticationTests(_TempStoreTestCase):
    def setUp(self):
        super().setUp()
        self.tenant = self._make_tenant()
        self.identity = self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")

    def test_correct_credentials_issue_a_session_token(self):
        token = self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery")
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)

    def test_email_is_case_insensitive_at_login(self):
        token = self.store.authenticate(self.tenant["tenant_id"], "USER@EXAMPLE.COM", "correct-horse-battery")
        self.assertIsNotNone(token)

    def test_wrong_password_returns_none(self):
        self.assertIsNone(self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "wrong-password-here"))

    def test_nonexistent_email_returns_none(self):
        self.assertIsNone(self.store.authenticate(self.tenant["tenant_id"], "nobody@example.com", "correct-horse-battery"))

    def test_wrong_tenant_id_returns_none(self):
        """Same email+password, different (real, existing) tenant -- must not cross-tenant-authenticate."""
        other_tenant = self._make_tenant()
        self.assertIsNone(self.store.authenticate(other_tenant["tenant_id"], "user@example.com", "correct-horse-battery"))

    def test_password_is_never_stored_in_plaintext(self):
        """Read the raw sqlite file bytes -- the plaintext password must not appear anywhere."""
        db_bytes = self.store.db_path.read_bytes()
        self.assertNotIn(b"correct-horse-battery", db_bytes)

    def test_two_identities_with_the_same_password_get_different_hashes(self):
        """Per-identity salt must actually vary -- same password, different hash bytes."""
        second_tenant = self._make_tenant()
        second_identity = self.store.create_identity(str(uuid.uuid4()), second_tenant["tenant_id"], "second@example.com", "Second", "correct-horse-battery")
        with self.store._connect() as conn:  # noqa: SLF001 -- direct-column check is the point of this test
            row1 = conn.execute("SELECT password_hash, password_salt FROM identity_credential WHERE identity_id = ?", (self.identity["identity_id"],)).fetchone()
            row2 = conn.execute("SELECT password_hash, password_salt FROM identity_credential WHERE identity_id = ?", (second_identity["identity_id"],)).fetchone()
        self.assertNotEqual(bytes(row1["password_salt"]), bytes(row2["password_salt"]))
        self.assertNotEqual(bytes(row1["password_hash"]), bytes(row2["password_hash"]))

    def test_suspended_identity_cannot_authenticate(self):
        with self.store._connect() as conn:  # noqa: SLF001
            conn.execute("UPDATE identity SET status = 'suspended' WHERE identity_id = ?", (self.identity["identity_id"],))
        self.assertIsNone(self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery"))


class SessionTests(_TempStoreTestCase):
    def setUp(self):
        super().setUp()
        self.tenant = self._make_tenant()
        self.identity = self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")
        self.token = self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery")

    def test_resolve_valid_session(self):
        resolved = self.store.resolve_session(self.token)
        self.assertEqual(resolved["identity_id"], self.identity["identity_id"])
        self.assertEqual(resolved["tenant_id"], self.tenant["tenant_id"])

    def test_resolve_unknown_token_returns_none(self):
        self.assertIsNone(self.store.resolve_session("not-a-real-token"))

    def test_revoke_then_resolve_returns_none(self):
        self.store.revoke_session(self.token)
        self.assertIsNone(self.store.resolve_session(self.token))

    def test_expired_session_is_rejected_and_deleted(self):
        """Hand-tamper the session row's expires_at into the past -- proves resolve_session
        actually checks expiry rather than trusting row existence alone."""
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with self.store._connect() as conn:  # noqa: SLF001
            conn.execute("UPDATE session SET expires_at = ? WHERE session_token = ?", (past, self.token))
        self.assertIsNone(self.store.resolve_session(self.token))
        with self.store._connect() as conn:  # noqa: SLF001
            remaining = conn.execute("SELECT COUNT(*) AS n FROM session WHERE session_token = ?", (self.token,)).fetchone()
        self.assertEqual(remaining["n"], 0, "expired session row should be deleted on the resolve attempt that finds it expired")

    def test_two_logins_issue_two_distinct_tokens(self):
        second_token = self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery")
        self.assertNotEqual(self.token, second_token)


class EntitlementAuditTests(_TempStoreTestCase):
    def test_record_entitlement_check_is_queryable(self):
        tenant = self._make_tenant()
        self.store.record_entitlement_check(tenant["tenant_id"], "experiment.mvp", True)
        with self.store._connect() as conn:  # noqa: SLF001
            row = conn.execute("SELECT * FROM entitlement_audit WHERE tenant_id = ?", (tenant["tenant_id"],)).fetchone()
        self.assertEqual(row["capability_id"], "experiment.mvp")
        self.assertEqual(row["granted"], 1)


class StoreReopenTests(unittest.TestCase):
    """A fresh IdentityStore instance re-pointed at the same file must see prior data -- proves
    this is real persistence, not an in-memory mock that happens to pass single-instance tests."""

    def test_data_survives_a_new_store_instance_on_the_same_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "identity.sqlite3"
            store1 = IdentityStore(db_path)
            tenant = store1.create_tenant(
                tenant_id=str(uuid.uuid4()),
                legal_name="Persisted Tenant",
                home_jurisdiction="jurisdiction-pack.tw.v1",
                data_residency_region="local-dev",
                encryption_root_key_ref="test-kek-ref",
            )
            store2 = IdentityStore(db_path)
            fetched = store2.get_tenant(tenant["tenant_id"])
            self.assertIsNotNone(fetched)
            self.assertEqual(fetched["legal_name"], "Persisted Tenant")


class PbkdfIterationConstantTests(unittest.TestCase):
    def test_iteration_count_meets_owasp_2023_floor(self):
        self.assertGreaterEqual(store_module.PBKDF2_ITERATIONS, 600_000)


if __name__ == "__main__":
    unittest.main()
