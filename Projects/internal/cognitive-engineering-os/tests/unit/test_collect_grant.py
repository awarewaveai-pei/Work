"""Research collection grants + collector identity (RESEARCH_LINES_MASTER_PLAN WC-P1-02, §3.4 C3, K3)."""

from __future__ import annotations

import contextlib
import io
import os
import unittest
import uuid
from datetime import datetime, timezone
from unittest import mock

from ai_lego.apps.cli.bootstrap_service_identity import main as bootstrap_main
from ai_lego.core.domain.collection_run import RUN_TTL
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import COLLECTOR_EMAIL, IdentityStore
from tests.pg import PgTestCase, dump, empty_tables

PROJECT_A = "11111111-1111-4111-8111-111111111111"
PROJECT_B = "22222222-2222-4222-8222-222222222222"


class CollectGrantTests(PgTestCase):
    REGION = "local-dev"

    def setUp(self):
        self.store = IdentityStore(self.databases)
        self.tenant = self.store.create_tenant(str(uuid.uuid4()), "Operator", "jurisdiction-pack.tw.v1", "local-dev", "kek")
        self.collector = self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], COLLECTOR_EMAIL, "Research Collector", "x" * 24)

    def _issue(self, project_id: str = PROJECT_A, run_id: str = "run1") -> str:
        deadline = (datetime.now(timezone.utc) + RUN_TTL).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        return self.store.issue_collect_grant(self.tenant["tenant_id"], project_id, run_id, self.collector["identity_id"], deadline)

    def _sql(self, statement: str, params: tuple = ()) -> list:
        with self.databases.for_tenant(self.tenant["tenant_id"]) as connection:
            cursor = connection.execute(statement, params)
            return cursor.fetchall() if cursor.description else []

    def test_issue_exchange_resolve_round_trip(self):
        ref = self._issue()
        exchanged = self.store.exchange_collect_grant(ref)
        self.assertEqual((exchanged["project_id"], exchanged["run_id"], exchanged["tenant_id"]), (PROJECT_A, "run1", self.tenant["tenant_id"]))
        resolved = self.store.resolve_collect_grant(exchanged["grant_token"])
        self.assertEqual(resolved["collector_identity_id"], self.collector["identity_id"])
        self.assertEqual(resolved["grant_ref"], ref)

    def test_a_second_exchange_is_refused(self):
        ref = self._issue()
        self.store.exchange_collect_grant(ref)
        with self.assertRaisesRegex(InvariantViolation, "GRANT_ALREADY_EXCHANGED"):
            self.store.exchange_collect_grant(ref)

    def test_unknown_reference_is_not_found(self):
        with self.assertRaisesRegex(InvariantViolation, "GRANT_NOT_FOUND"):
            self.store.exchange_collect_grant("no-such-ref")

    def test_expired_grant_neither_exchanges_nor_resolves(self):
        ref = self._issue()
        token = self.store.exchange_collect_grant(ref)["grant_token"]
        self._sql("UPDATE collect_grant SET expires_at = '2000-01-01T00:00:00Z' WHERE grant_ref = %s", (ref,))
        self.assertIsNone(self.store.resolve_collect_grant(token))
        ref2 = self._issue(run_id="run2")
        self._sql("UPDATE collect_grant SET expires_at = '2000-01-01T00:00:00Z' WHERE grant_ref = %s", (ref2,))
        with self.assertRaisesRegex(InvariantViolation, "GRANT_EXPIRED"):
            self.store.exchange_collect_grant(ref2)

    def test_closed_grant_is_dead_before_and_after_exchange(self):
        ref = self._issue()
        token = self.store.exchange_collect_grant(ref)["grant_token"]
        self.store.close_collect_grant(ref)
        self.assertIsNone(self.store.resolve_collect_grant(token))
        ref2 = self._issue(run_id="run2")
        self.store.close_collect_grant(ref2)
        with self.assertRaisesRegex(InvariantViolation, "GRANT_EXPIRED"):
            self.store.exchange_collect_grant(ref2)

    def test_only_the_token_hash_is_stored(self):
        ref = self._issue()
        token = self.store.exchange_collect_grant(ref)["grant_token"]
        stored = self._sql("SELECT token_hash FROM collect_grant WHERE grant_ref = %s", (ref,))[0][0]
        self.assertNotEqual(stored, token)
        self.assertNotIn(token, "\n".join(dump(self.databases)))

    def test_closing_a_project_closes_only_its_own_grants(self):
        token_a = self.store.exchange_collect_grant(self._issue(PROJECT_A, "a"))["grant_token"]
        token_b = self.store.exchange_collect_grant(self._issue(PROJECT_B, "b"))["grant_token"]
        self.assertEqual(self.store.close_collect_grants_for_project(self.tenant["tenant_id"], PROJECT_A), 1)
        self.assertIsNone(self.store.resolve_collect_grant(token_a))
        self.assertIsNotNone(self.store.resolve_collect_grant(token_b))

    def test_collector_is_found_by_its_fixed_email(self):
        self.assertEqual(self.store.find_collector_identity(self.tenant["tenant_id"])["identity_id"], self.collector["identity_id"])
        self.assertIsNone(self.store.find_collector_identity(str(uuid.uuid4())))


class BootstrapTenantIdTests(PgTestCase):
    """The command line reads the database from COGNITIVE_OS_DATABASE_URLS, as it does inside the API's container."""

    REGION = "local-dev"

    def setUp(self):
        empty_tables(self.databases)   # whole-table counts below: a fresh database per test, as the temp file was
        environment = mock.patch.dict(os.environ, self.database_urls())
        environment.start()
        self.addCleanup(environment.stop)
        self.store = IdentityStore(self.databases)
        self.tenant = self.store.create_tenant(str(uuid.uuid4()), "Operator", "jurisdiction-pack.tw.v1", "local-dev", "kek")

    def _count(self, table: str) -> int:
        with self.databases.transaction(self.REGION) as connection:
            return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    def test_existing_tenant_gets_only_an_identity(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = bootstrap_main(["--tenant-id", self.tenant["tenant_id"], "--email", COLLECTOR_EMAIL])
        self.assertEqual(code, 0)
        self.assertIn("identity created in existing tenant", out.getvalue())
        self.assertEqual((self._count("tenant"), self._count("workspace"), self._count("identity")), (1, 0, 1))
        self.assertIsNotNone(self.store.find_collector_identity(self.tenant["tenant_id"]))

    def test_unknown_tenant_fails_and_writes_nothing(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = bootstrap_main(["--tenant-id", str(uuid.uuid4()), "--email", COLLECTOR_EMAIL])
        self.assertEqual(code, 1)
        self.assertIn("TENANT_NOT_FOUND", err.getvalue())
        self.assertEqual(self._count("identity"), 0)

    def test_legal_name_is_still_required_without_tenant_id(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            bootstrap_main(["--email", "svc@example.com"])
        self.assertEqual(caught.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
