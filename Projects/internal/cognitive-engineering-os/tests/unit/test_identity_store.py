"""Tests for ``ai_lego.platform.identity.store.IdentityStore`` -- real PostgreSQL (tests/pg.py, one database per class;
each test makes its own tenants), real PBKDF2 hashing, real session issuance/expiry."""

from __future__ import annotations

import datetime
import hashlib
import unittest
import uuid

from psycopg import errors

from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity import store as store_module
from ai_lego.platform.identity.store import IdentityStore
from tests.pg import PgTestCase, dump


class _TempStoreTestCase(PgTestCase):
    REGION = "local-dev"

    def setUp(self):
        self.store = IdentityStore(self.databases)

    def _connect(self):
        """A transaction on the region every test tenant names (a direct-column check is the point of some tests)."""
        return self.databases.transaction(self.REGION)

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
        with self.assertRaises(errors.UniqueViolation):  # UNIQUE (tenant_id, name)
            self.store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], "Default")

    def test_list_workspaces_is_tenant_scoped_and_true_insertion_ordered(self):
        # Ordered by `created_at, write_order` (not `workspace_id`): two workspaces created close together can share a
        # created_at (a host clock ticks coarser than the inserts: 15.6 ms on Windows' Python 3.12), and write_order (the
        # insertion order, where SQLite had rowid) breaks the tie correctly. Ordering by workspace_id (a random UUID)
        # instead would silently scramble insertion order -- caught by this test failing intermittently before the fix.
        tenant_a = self._make_tenant()
        tenant_b = self._make_tenant()
        first = self.store.create_workspace(str(uuid.uuid4()), tenant_a["tenant_id"], "Default")
        second = self.store.create_workspace(str(uuid.uuid4()), tenant_a["tenant_id"], "Second")
        self.store.create_workspace(str(uuid.uuid4()), tenant_b["tenant_id"], "Other Tenant's Workspace")
        listed = self.store.list_workspaces(tenant_a["tenant_id"])
        self.assertEqual([w["workspace_id"] for w in listed], [first["workspace_id"], second["workspace_id"]])

    def test_list_workspaces_for_unknown_tenant_is_empty_not_an_error(self):
        self.assertEqual(self.store.list_workspaces(str(uuid.uuid4())), [])

    def test_get_workspace_is_tenant_scoped(self):
        tenant_a = self._make_tenant()
        tenant_b = self._make_tenant()
        workspace = self.store.create_workspace(str(uuid.uuid4()), tenant_a["tenant_id"], "Default")
        self.assertEqual(self.store.get_workspace(tenant_a["tenant_id"], workspace["workspace_id"])["workspace_id"], workspace["workspace_id"])
        self.assertIsNone(self.store.get_workspace(tenant_b["tenant_id"], workspace["workspace_id"]), "a workspace must not resolve under a different tenant")
        self.assertIsNone(self.store.get_workspace(tenant_a["tenant_id"], str(uuid.uuid4())))


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
        """Read every row of every table -- the plaintext password must not appear anywhere."""
        self.assertNotIn("correct-horse-battery", "\n".join(dump(self.databases)))

    def test_two_identities_with_the_same_password_get_different_hashes(self):
        """Per-identity salt must actually vary -- same password, different hash bytes."""
        second_tenant = self._make_tenant()
        second_identity = self.store.create_identity(str(uuid.uuid4()), second_tenant["tenant_id"], "second@example.com", "Second", "correct-horse-battery")
        with self._connect() as conn:  # direct-column check is the point of this test
            row1 = conn.execute("SELECT password_hash, password_salt FROM identity_credential WHERE identity_id = %s", (self.identity["identity_id"],)).fetchone()
            row2 = conn.execute("SELECT password_hash, password_salt FROM identity_credential WHERE identity_id = %s", (second_identity["identity_id"],)).fetchone()
        self.assertNotEqual(bytes(row1["password_salt"]), bytes(row2["password_salt"]))
        self.assertNotEqual(bytes(row1["password_hash"]), bytes(row2["password_hash"]))

    def test_suspended_identity_cannot_authenticate(self):
        with self._connect() as conn:
            conn.execute("UPDATE identity SET status = 'suspended' WHERE identity_id = %s", (self.identity["identity_id"],))
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
        with self._connect() as conn:
            conn.execute("UPDATE session SET expires_at = %s WHERE session_token = %s", (past, self.token))
        self.assertIsNone(self.store.resolve_session(self.token))
        with self._connect() as conn:
            remaining = conn.execute("SELECT COUNT(*) AS n FROM session WHERE session_token = %s", (self.token,)).fetchone()
        self.assertEqual(remaining["n"], 0, "expired session row should be deleted on the resolve attempt that finds it expired")

    def test_two_logins_issue_two_distinct_tokens(self):
        second_token = self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery")
        self.assertNotEqual(self.token, second_token)


class HandoffCodeTests(_TempStoreTestCase):
    """Cross-origin handoff codes (ai_lego/apps/api/main.py's /auth/handoff/mint + /auth/handoff --
    operator report 2026-09-18: a next-admin-created Cognitive OS Project was invisible to the
    operator's own dashboard login because they are different tenants)."""

    def setUp(self):
        super().setUp()
        self.tenant = self._make_tenant()
        self.identity = self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "service@example.com", "Service", "correct-horse-battery")

    def test_mint_then_redeem_returns_identity_tenant_and_path(self):
        code = self.store.issue_handoff_code(self.identity["identity_id"], self.tenant["tenant_id"], "/?project=abc-123")
        redeemed = self.store.redeem_handoff_code(code)
        self.assertIsNotNone(redeemed)
        self.assertEqual(redeemed["identity_id"], self.identity["identity_id"])
        self.assertEqual(redeemed["tenant_id"], self.tenant["tenant_id"])
        self.assertEqual(redeemed["redirect_path"], "/?project=abc-123")

    def test_redeem_unknown_code_returns_none(self):
        self.assertIsNone(self.store.redeem_handoff_code("not-a-real-code"))

    def test_redeem_is_single_use(self):
        code = self.store.issue_handoff_code(self.identity["identity_id"], self.tenant["tenant_id"], "/?project=abc-123")
        first = self.store.redeem_handoff_code(code)
        self.assertIsNotNone(first)
        second = self.store.redeem_handoff_code(code)
        self.assertIsNone(second, "a redeemed code must not be usable a second time (e.g. browser prefetch, reload of the redirect)")

    def test_expired_code_is_rejected(self):
        """Hand-tamper expires_at into the past, same technique as SessionTests.
        test_expired_session_is_rejected_and_deleted above -- proves redeem_handoff_code actually
        checks expiry rather than trusting row existence + consumed_at alone."""
        code = self.store.issue_handoff_code(self.identity["identity_id"], self.tenant["tenant_id"], "/?project=abc-123")
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        with self._connect() as conn:
            conn.execute("UPDATE handoff_code SET expires_at = %s WHERE code_hash = %s", (past, code_hash))
        self.assertIsNone(self.store.redeem_handoff_code(code))

    def test_issue_session_for_identity_produces_a_resolvable_session(self):
        """No password check here (unlike authenticate()) -- this is the primitive redeem_handoff_code
        uses to turn an already-proven identity into a real, revocable session row."""
        token = self.store.issue_session_for_identity(self.identity["identity_id"], self.tenant["tenant_id"])
        resolved = self.store.resolve_session(token)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["identity_id"], self.identity["identity_id"])
        self.assertEqual(resolved["tenant_id"], self.tenant["tenant_id"])


class PasswordResetTests(_TempStoreTestCase):
    def setUp(self):
        super().setUp()
        self.tenant = self._make_tenant()
        self.identity = self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")

    def test_issue_returns_raw_token_but_database_only_contains_digest(self):
        issued = self.store.issue_password_reset_token(self.tenant["tenant_id"], "USER@EXAMPLE.COM")
        self.assertIsNotNone(issued)
        with self._connect() as conn:
            row = conn.execute("SELECT token_hash FROM password_reset_token WHERE reset_id = %s", (issued["reset_id"],)).fetchone()
        self.assertEqual(row["token_hash"], hashlib.sha256(issued["token"].encode()).hexdigest())
        self.assertNotEqual(row["token_hash"], issued["token"])

    def test_new_token_invalidates_previous_and_consumption_revokes_sessions(self):
        session = self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "correct-horse-battery")
        first = self.store.issue_password_reset_token(self.tenant["tenant_id"], "user@example.com")
        second = self.store.issue_password_reset_token(self.tenant["tenant_id"], "user@example.com")
        self.assertFalse(self.store.consume_password_reset_token(first["token"], "new-correct-password"))
        self.assertTrue(self.store.consume_password_reset_token(second["token"], "new-correct-password"))
        self.assertIsNone(self.store.resolve_session(session))
        self.assertIsNotNone(self.store.authenticate(self.tenant["tenant_id"], "user@example.com", "new-correct-password"))
        self.assertFalse(self.store.consume_password_reset_token(second["token"], "another-password"))

    def test_unknown_identity_does_not_issue_a_token(self):
        self.assertIsNone(self.store.issue_password_reset_token(self.tenant["tenant_id"], "nobody@example.com"))


class EntitlementAuditTests(_TempStoreTestCase):
    def test_record_entitlement_check_is_queryable(self):
        tenant = self._make_tenant()
        self.store.record_entitlement_check(tenant["tenant_id"], "experiment.mvp", True)
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM entitlement_audit WHERE tenant_id = %s", (tenant["tenant_id"],)).fetchone()
        self.assertEqual(row["capability_id"], "experiment.mvp")
        self.assertEqual(row["granted"], 1)


class StoreReopenTests(PgTestCase):
    """A fresh IdentityStore on fresh pools to the same database must see prior data -- proves
    this is real persistence, not an in-memory mock that happens to pass single-instance tests."""

    REGION = "local-dev"

    def test_data_survives_a_new_store_instance_on_the_same_database(self):
        store1 = IdentityStore(self.databases)
        tenant = store1.create_tenant(
            tenant_id=str(uuid.uuid4()),
            legal_name="Persisted Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        with type(self.databases)({self.REGION: self.url}) as reopened:
            fetched = IdentityStore(reopened).get_tenant(tenant["tenant_id"])
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["legal_name"], "Persisted Tenant")


class PbkdfIterationConstantTests(unittest.TestCase):
    def test_iteration_count_meets_owasp_2023_floor(self):
        self.assertGreaterEqual(store_module.PBKDF2_ITERATIONS, 600_000)


if __name__ == "__main__":
    unittest.main()
