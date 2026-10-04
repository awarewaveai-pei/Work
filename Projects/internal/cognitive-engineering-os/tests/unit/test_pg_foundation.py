"""The PostgreSQL foundation (docs/platform/STORAGE_SWITCH.md W4): the baseline migration against the SQLite schema it
replaces (frozen in ai_lego/data/migrations/sqlite_schema_2026_10_04.sql: the data move reads the old files by it), the
advisory lock behind invariants 1-2 (two connections racing), the schema-at-head refusal, the region URL parsing, the
time helpers, the row type, and the tenant -> region routing of invariant 4 with two real regions. Runs on a real
PostgreSQL only (tests/pg.py). sqlite3 is imported here only to read that frozen schema."""

from __future__ import annotations

import ast
import re
import sqlite3
import threading
import time
import traceback
import unittest
import uuid
from datetime import datetime, timezone

import tempfile
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg import errors

from ai_lego import PRODUCT_ROOT
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore
from tests.pg import PgTestCase, dump

MIGRATIONS = PRODUCT_ROOT / "ai_lego" / "data" / "migrations"
FROZEN_SQLITE_SCHEMA = MIGRATIONS / "sqlite_schema_2026_10_04.sql"
# Columns a later migration added after the SQLite ones: 0003 write_order, where the engine read SQLite's rowid.
ADDED_AFTER_SQLITE = {"events": ["write_order"], "workspace": ["write_order"]}
_CREATE_TABLE = re.compile(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(", re.IGNORECASE)
_CREATE_INDEX = re.compile(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+\w+\s+ON\s+\w+\s*\([^)]*\)(?:\s+WHERE\s+[^;]+)?", re.IGNORECASE)
# A citation's own printed date ("2019", "Spring 2020"): text, not a moment (0001_baseline.py type rules).
_FREE_TEXT_DATES = {"published_at"}
_ISO_MICRO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")


def sqlite_ddl_in_the_engine() -> list[str]:
    """Every SQLite CREATE TABLE / CREATE INDEX the engine's source still holds, read from its string constants (ast
    joins the adjacent literals a statement is split across)."""
    found: list[str] = []
    for path in sorted((PRODUCT_ROOT / "ai_lego").rglob("*.py")):
        if MIGRATIONS in path.parents:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                found += [f"{path.name}: {match.group(1)}" for match in _CREATE_TABLE.finditer(node.value)]
                found += [f"{path.name}: {match.group(0)[:60]}" for match in _CREATE_INDEX.finditer(node.value)]
    return found


def sqlite_schema() -> sqlite3.Connection:
    """The SQLite schema the engine kept until the switch (the frozen file), run into an in-memory SQLite."""
    connection = sqlite3.connect(":memory:")
    connection.executescript(FROZEN_SQLITE_SCHEMA.read_text(encoding="utf-8"))
    return connection


def _sqlite_tables(connection: sqlite3.Connection) -> list[str]:
    return [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def _expected_pg_type(column: str, sqlite_type: str) -> str:
    if sqlite_type == "INTEGER":
        return "bigint"
    if sqlite_type == "BLOB":
        return "bytea"
    if column.endswith("_json"):
        return "jsonb"
    if column.endswith("_at") and column not in _FREE_TEXT_DATES:
        return "timestamp with time zone"
    return "text"


def _pg_indexes(connection: psycopg.Connection, table: str) -> set[tuple[bool, bool, tuple[str, ...]]]:
    rows = connection.execute(
        "SELECT i.indisunique, i.indpred IS NOT NULL, array(SELECT a.attname FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)"
        " JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.n)"
        " FROM pg_index i WHERE i.indrelid = to_regclass(%s)", (table,)).fetchall()
    return {(unique, partial, tuple(columns)) for unique, partial, columns in rows}


def _pg_primary_key(connection: psycopg.Connection, table: str) -> tuple[str, ...]:
    row = connection.execute(
        "SELECT array(SELECT a.attname FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)"
        " JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.n)"
        " FROM pg_index i WHERE i.indrelid = to_regclass(%s) AND i.indisprimary", (table,)).fetchone()
    return tuple(row[0]) if row else ()


def _user_tables(url: str) -> set[str]:
    with psycopg.connect(url) as connection:
        return {row[0] for row in connection.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()")}


class BaselineMigrationTests(PgTestCase):
    def test_upgrade_downgrade_upgrade(self):
        database = self.pg.create_database(migrated=False)
        self.addCleanup(self.pg.drop_database, database)
        url = self.pg.url(database)
        tables = set(_sqlite_tables(sqlite_schema()))
        db.migrate(url)
        self.assertLessEqual(tables, _user_tables(url))
        db.downgrade(url, "base")
        self.assertEqual(_user_tables(url), {"alembic_version"})
        db.migrate(url)
        self.assertLessEqual(tables, _user_tables(url))
        with psycopg.connect(url) as connection:
            self.assertEqual(db.schema_revisions(connection), db.head_revisions())

    def test_every_sqlite_table_exists_with_its_columns_keys_and_indexes(self):
        lite = sqlite_schema()
        tables = _sqlite_tables(lite)
        self.assertEqual(len(tables), 19, "the frozen SQLite schema holds the 19 tables the engine kept")
        with psycopg.connect(self.url) as connection:
            for table in tables:
                with self.subTest(table=table):
                    sqlite_columns = list(lite.execute(f"PRAGMA table_info({table})"))   # cid, name, type, notnull, default, pk
                    pg_columns = connection.execute(
                        "SELECT column_name, data_type, is_nullable FROM information_schema.columns"
                        " WHERE table_schema = current_schema() AND table_name = %s ORDER BY ordinal_position", (table,)).fetchall()
                    self.assertEqual([c[1] for c in sqlite_columns] + ADDED_AFTER_SQLITE.get(table, []), [c[0] for c in pg_columns], "column names and order")
                    primary_key = tuple(c[1] for c in sorted(sqlite_columns, key=lambda c: c[5]) if c[5])
                    self.assertEqual(primary_key, _pg_primary_key(connection, table))
                    for (_, name, sqlite_type, notnull, _, _), (_, pg_type, nullable) in zip(sqlite_columns, pg_columns):
                        self.assertEqual(_expected_pg_type(name, sqlite_type), pg_type, name)
                        self.assertEqual(bool(notnull) or name in primary_key, nullable == "NO", f"{name} NOT NULL")
                    sqlite_indexes = {
                        (bool(unique), bool(partial), tuple(info[2] for info in lite.execute(f"PRAGMA index_info({index})")))
                        for _, index, unique, _, partial in lite.execute(f"PRAGMA index_list({table})")
                    }
                    self.assertLessEqual(sqlite_indexes, _pg_indexes(connection, table), "every SQLite key and index (unique, partial, columns)")


    def test_the_engine_holds_no_sqlite_schema_any_more(self):
        self.assertEqual(sqlite_ddl_in_the_engine(), [], "the port is not done: SQLite DDL is still in ai_lego")


class SchemaAtHeadTests(PgTestCase):
    def test_a_database_at_head_passes(self):
        self.databases.require_schema_at_head(self.REGION)

    def test_a_database_one_revision_behind_is_refused(self):
        database = self.pg.create_database()
        self.addCleanup(self.pg.drop_database, database)
        url = self.pg.url(database)
        db.downgrade(url, "-1")
        with db.Databases({"behind": url}) as databases, self.assertRaisesRegex(InvariantViolation, r"^DB_SCHEMA_BEHIND: region 'behind'"):
            databases.require_schema_at_head("behind")

    def test_a_database_never_migrated_is_refused(self):
        database = self.pg.create_database(migrated=False)
        self.addCleanup(self.pg.drop_database, database)
        with db.Databases({"empty": self.pg.url(database)}) as databases, self.assertRaisesRegex(InvariantViolation, r"^DB_SCHEMA_BEHIND: .*no revision"):
            databases.require_schema_at_head("empty")

    def test_an_unknown_region_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, r"^DB_REGION_UNKNOWN: 'nowhere' \(configured: test\)"):
            self.databases.require_schema_at_head("nowhere")


def _insert_event(connection: psycopg.Connection, tenant: str, aggregate: str, sequence: int, occurred_at: datetime | None = None) -> None:
    event_id = str(uuid.uuid4())
    connection.execute(
        "INSERT INTO events (event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id,"
        " payload_json, author, block, owner_kind, owner_id) VALUES (%s, %s, %s, %s, 'TaskNoted', %s, '1.0.0', %s, '{}', 'system', 'ACT', 'case', 'p')",
        (event_id, tenant, aggregate, sequence, occurred_at or db.now(), event_id))


class EventSequenceTests(PgTestCase):
    """Invariant 1: the next sequence of one aggregate, read then written by two writers at once."""

    APPENDS_PER_WRITER = 50

    def _append_next(self, tenant: str, aggregate: str) -> None:
        with self.databases.transaction(self.REGION) as connection:
            db.advisory_xact_lock(connection, "events", tenant, aggregate)
            (last,) = connection.execute("SELECT COALESCE(MAX(sequence), 0) FROM events WHERE tenant_id = %s AND aggregate_id = %s", (tenant, aggregate)).fetchone()
            time.sleep(0.002)   # widens the read-then-write window: without the lock the race shows on every run
            _insert_event(connection, tenant, aggregate, last + 1)

    def test_two_writers_under_the_lock_leave_no_gap_and_no_duplicate(self):
        tenant, aggregate = "t-race", f"project:{uuid.uuid4()}"
        barrier = threading.Barrier(2, timeout=30)
        failures: list[str] = []

        def writer() -> None:
            try:
                for _ in range(self.APPENDS_PER_WRITER):
                    barrier.wait()   # both writers start each append together
                    self._append_next(tenant, aggregate)
            except threading.BrokenBarrierError:
                pass
            except Exception as error:
                failures.append(f"{type(error).__name__}: {error}")
                barrier.abort()

        threads = [threading.Thread(target=writer) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=120)
        self.assertEqual(failures, [])
        with self.databases.transaction(self.REGION) as connection:
            sequences = [row[0] for row in connection.execute("SELECT sequence FROM events WHERE tenant_id = %s AND aggregate_id = %s ORDER BY sequence", (tenant, aggregate))]
        self.assertEqual(sequences, list(range(1, 2 * self.APPENDS_PER_WRITER + 1)))

    def test_without_the_lock_the_unique_key_refuses_a_duplicate_sequence(self):
        tenant, aggregate = "t-backstop", f"project:{uuid.uuid4()}"
        with self.databases.transaction(self.REGION) as connection:
            _insert_event(connection, tenant, aggregate, 1)
        with self.assertRaises(errors.UniqueViolation) as caught, self.databases.transaction(self.REGION) as connection:
            _insert_event(connection, tenant, aggregate, 1)
        self.assertEqual(caught.exception.diag.constraint_name, "uq_events_aggregate_sequence")


class AdvisoryLockTests(PgTestCase):
    """Invariant 2 at helper level: a name excludes a second connection until the first one's transaction ends."""

    def _try_lock(self, *parts: str) -> bool:
        """In a second connection: True if the lock was free, False if it is held elsewhere."""
        try:
            with self.databases.transaction(self.REGION) as connection:
                connection.execute("SET LOCAL lock_timeout = '300ms'")
                db.advisory_xact_lock(connection, *parts)
        except errors.LockNotAvailable:
            return False
        return True

    def test_the_same_name_waits_and_a_different_name_does_not(self):
        with self.databases.transaction(self.REGION) as holder:
            db.advisory_xact_lock(holder, "doc", "t", "d1")
            self.assertFalse(self._try_lock("doc", "t", "d1"))
            self.assertTrue(self._try_lock("doc", "t", "d2"))
        self.assertTrue(self._try_lock("doc", "t", "d1"), "released when the holder's transaction ended")

    def test_parts_are_not_glued_into_one_name(self):
        with self.databases.transaction(self.REGION) as holder:
            db.advisory_xact_lock(holder, "doc", "ab", "c")
            self.assertTrue(self._try_lock("doc", "a", "bc"))

    def test_a_part_holding_the_separator_is_refused(self):
        with self.databases.transaction(self.REGION) as connection, self.assertRaisesRegex(InvariantViolation, r"^DB_LOCK_KEY_INVALID"):
            db.advisory_xact_lock(connection, "doc", f"a{db.LOCK_KEY_SEPARATOR}b")

    def test_outside_a_transaction_is_refused(self):
        with psycopg.connect(self.url, autocommit=True) as connection, self.assertRaisesRegex(InvariantViolation, r"^DB_LOCK_OUTSIDE_TRANSACTION"):
            db.advisory_xact_lock(connection, "doc", "t", "d1")


class TimeRoundTripTests(PgTestCase):
    def test_now_survives_a_timestamptz_column_with_its_microseconds(self):
        """A pooled connection reads a time back as the API's string (iso()), microseconds kept."""
        for aggregate, moment in (("project:now", db.now()), ("project:fixed", db.now().replace(microsecond=123456))):
            with self.databases.transaction(self.REGION) as connection:
                _insert_event(connection, "t-time", aggregate, 1, occurred_at=moment)
                (stored,) = connection.execute("SELECT occurred_at FROM events WHERE tenant_id = 't-time' AND aggregate_id = %s", (aggregate,)).fetchone()
            self.assertEqual(stored, db.iso(moment))
            self.assertEqual(datetime.fromisoformat(stored), moment)
            self.assertRegex(stored, _ISO_MICRO)
        self.assertTrue(stored.endswith(".123456Z"), stored)


class TimeHelperTests(unittest.TestCase):
    def test_iso_keeps_six_fraction_digits_and_parses_back(self):
        for moment in (db.now(), datetime(2026, 10, 4, 12, 0, 0, 0, tzinfo=timezone.utc)):
            text = db.iso(moment)
            self.assertRegex(text, _ISO_MICRO)
            self.assertEqual(datetime.fromisoformat(text), moment)

    def test_a_naive_time_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, r"^DB_TIME_NAIVE"):
            db.iso(datetime(2026, 10, 4, 12, 0, 0))


class DatabaseUrlsTests(unittest.TestCase):
    PASSWORD = "Hunter2-s3cret"

    def test_regions_and_urls_parse(self):
        parsed = db.parse_database_urls(f"eu-west=postgresql://cos:{self.PASSWORD}@db-eu:5432/cognitive, sg=postgres://cos@db-sg/cognitive")
        self.assertEqual(parsed, {"eu-west": f"postgresql://cos:{self.PASSWORD}@db-eu:5432/cognitive", "sg": "postgres://cos@db-sg/cognitive"})

    def test_a_malformed_entry_is_refused_without_its_password(self):
        good = f"eu-west=postgresql://cos:{self.PASSWORD}@db-eu/cognitive"
        for value in (
            f"postgresql://cos:{self.PASSWORD}@db-eu/cognitive",                     # no region
            f"{good},EU=postgresql://cos:{self.PASSWORD}@db/c",                       # region not lowercase
            f"{good},sg=mysql://cos:{self.PASSWORD}@db/c",                            # not PostgreSQL
            f"{good},sg=postgresql://cos:{self.PASSWORD}%zz@db/c",                    # does not parse (libpq quotes it)
            f"{good},eu-west=postgresql://cos:{self.PASSWORD}@other/c",               # region twice
            f"eu-west=postgresql://db/c?password=ab,{self.PASSWORD}",                 # a comma inside the password
        ):
            with self.subTest(value=value.replace(self.PASSWORD, "***")):
                with self.assertRaisesRegex(InvariantViolation, r"^DB_URLS_MALFORMED: entry \d+ of \d+") as caught:
                    db.Databases.from_env({db.DATABASE_URLS_ENV: value})
                shown = "".join(traceback.format_exception(caught.exception))
                self.assertNotIn(self.PASSWORD, shown)
                self.assertNotIn(self.PASSWORD[:7], shown)

    def test_no_urls_at_all_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, r"^DB_URLS_MISSING"):
            db.Databases.from_env({})


class RowTests(PgTestCase):
    def test_a_row_reads_by_name_by_position_and_as_a_dict(self):
        with self.databases.transaction(self.REGION) as connection:
            row = connection.execute("SELECT 1 AS one, 'two' AS two").fetchone()
        self.assertEqual((row["one"], row[1], dict(row), tuple(row)), (1, "two", {"one": 1, "two": "two"}, (1, "two")))
        with self.assertRaises(IndexError):
            row["three"]

    def test_json_comes_back_with_sorted_keys_and_times_as_the_api_string(self):
        with self.databases.transaction(self.REGION) as connection:
            value, moment = connection.execute("SELECT %s::jsonb, %s::timestamptz", (db.Jsonb({"bb": 1, "a": {"d": 2, "c": 3}}), "2026-10-04T01:02:03Z")).fetchone()
        self.assertEqual(list(value), ["a", "bb"])   # jsonb's own order is by length: bb would come last only by luck
        self.assertEqual(list(value["a"]), ["c", "d"])
        self.assertEqual(moment, "2026-10-04T01:02:03.000000Z")


class RegionRoutingTests(PgTestCase):
    """Invariant 4 with two real regions: one tenant per region, every repository writing for both; a tenant's rows are
    only in its own region's database, the directory (in the first region) holds tenant -> region and nothing else, and
    erasing one tenant's case touches only its region."""

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        second = cls.pg.create_database()
        cls.addClassCleanup(cls.pg.drop_database, second)
        cls.regions = db.Databases({"one": cls.url, "two": cls.pg.url(second)})   # "one" first: it holds the directory
        cls.addClassCleanup(cls.regions.close)

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.cas = TenantScopedCas(Path(folder.name) / "source-cas")
        self.store = IdentityStore(self.regions)
        self.repo = ProjectSourceRepository(self.regions)
        self.tenants = {region: self._tenant_writing_everywhere(region) for region in ("one", "two")}

    def _tenant_writing_everywhere(self, region: str) -> dict[str, str]:
        marker = f"MARKER-{region.upper()}-{uuid.uuid4().hex[:8]}"
        tenant = self.store.create_tenant(str(uuid.uuid4()), f"{marker} tenant", "jurisdiction-pack.tw.v1", region, "kek")["tenant_id"]
        workspace = self.store.create_workspace(str(uuid.uuid4()), tenant, f"{marker} workspace")["workspace_id"]
        identity = self.store.create_identity(str(uuid.uuid4()), tenant, f"{marker.lower()}@example.com", marker, "correct-horse-battery")["identity_id"]
        self.assertIsNotNone(self.store.authenticate(tenant, f"{marker.lower()}@example.com", "correct-horse-battery"))
        project = str(uuid.uuid4())
        self.repo.create_project({"project_id": project, "tenant_id": tenant, "workspace_id": workspace, "name": f"{marker} case", "purpose": "p",
                                  "data_classification": "Confidential", "status": "active", "version": 1, "created_by_identity_id": identity, "created_at": "2026-10-04T00:00:00Z"})
        content = f"{marker} source".encode("utf-8")
        cas_path = TenantScopedCas.cas_path_for(tenant, content)
        self.repo.add_source({"source_id": str(uuid.uuid4()), "project_id": project, "tenant_id": tenant, "title": f"{marker} title", "media_type": "text/plain",
                              "data_classification": "Confidential", "content_sha256": cas_path["hash"], "size_bytes": len(content), "artifact_uri": {"uri": "x"},
                              "content_role": "primary", "verification_status": "unverified", "status": "active", "version": 1, "created_by_identity_id": identity,
                              "created_at": "2026-10-04T00:00:00Z", "doi": None, "authors": None, "venue": None, "published_at": None},
                             cas_path, lambda: self.cas.put(tenant, content), writer=record_log.user(identity, "GATHER"))
        CaseDocs(self.repo).save(tenant, record_log.person(identity), "govern.location", {"where": f"{marker} place"}, record_log.user(identity, "GOVERN"))
        CustomWorkflowRepository(self.regions).create({"workflow_id": str(uuid.uuid4()), "tenant_id": tenant, "title": f"{marker} flow", "method_ids": ["a.b"],
                                                       "created_by_identity_id": identity, "created_at": "2026-10-04T00:00:00Z", "updated_at": "2026-10-04T00:00:00Z"})
        return {"tenant": tenant, "marker": marker, "project": project, "identity": identity}

    def _region_text(self, region: str) -> str:
        return "\n".join(line for line in dump(self.regions, region) if not line.startswith("tenant_directory:"))

    def test_a_tenants_rows_are_only_in_its_own_regions_database(self):
        for region, other in (("one", "two"), ("two", "one")):
            mine, theirs = self.tenants[region], self.tenants[other]
            text = self._region_text(region)
            for item in (mine["marker"], mine["tenant"], mine["identity"]):
                self.assertIn(item, text, f"{item} missing from region {region}")
            for item in (theirs["marker"], theirs["tenant"], theirs["identity"]):
                self.assertNotIn(item, text, f"region {other}'s tenant has a row in region {region}")

    def test_the_directory_is_in_the_first_region_and_holds_only_tenant_and_region(self):
        with self.regions.transaction("one") as connection:
            lines = {tuple(row) for row in connection.execute("SELECT * FROM tenant_directory")}
        self.assertLessEqual({(self.tenants[region]["tenant"], region) for region in ("one", "two")}, lines)
        self.assertTrue(all(len(line) == 2 for line in lines))
        with self.regions.transaction("two") as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tenant_directory").fetchone()[0], 0)

    def test_erasing_a_case_removes_it_from_its_region_and_touches_no_other(self):
        two_before = self._region_text("two")
        one = self.tenants["one"]
        self.repo.erase_project(one["tenant"], one["project"], one["identity"], self.cas, 0)
        self.assertNotIn(f"{one['marker']} title", self._region_text("one"))
        self.assertNotIn(f"{one['marker']} case", self._region_text("one"))
        self.assertEqual(self._region_text("two"), two_before)
        self.assertEqual(self.cas.list_objects(one["tenant"]), [])

    def test_a_credential_naming_no_tenant_is_found_in_its_region(self):
        two = self.tenants["two"]
        token = self.store.issue_session_for_identity(two["identity"], two["tenant"])
        self.assertEqual(self.store.resolve_session(token), {"identity_id": two["identity"], "tenant_id": two["tenant"]})
        self.assertEqual(self.store.get_identity(two["identity"])["tenant_id"], two["tenant"])
        self.store.revoke_session(token)
        self.assertIsNone(self.store.resolve_session(token))

    def test_an_unknown_tenant_or_region_is_refused_and_nothing_is_written(self):
        with self.assertRaisesRegex(InvariantViolation, "^TENANT_REGION_UNKNOWN"):
            self.repo.get_project(str(uuid.uuid4()), "p")
        tenant = str(uuid.uuid4())
        with self.assertRaisesRegex(InvariantViolation, r"^DB_REGION_UNKNOWN: 'three'"):
            self.store.create_tenant(tenant, "x", "jurisdiction-pack.tw.v1", "three", "kek")
        self.assertIsNone(self.regions.region_of(tenant))

    def test_a_directory_commit_failure_can_be_retried_without_stranding_a_home_row(self):
        tenant = str(uuid.uuid4())
        create = (tenant, "Recoverable tenant", "jurisdiction-pack.tw.v1", "two", "kek")
        original = self.regions.transaction

        @contextmanager
        def fail_directory_commit(region):
            with original(region) as connection:
                yield connection
                if region == "one":
                    raise RuntimeError("injected directory commit failure")

        with patch.object(self.regions, "transaction", fail_directory_commit):
            with self.assertRaisesRegex(RuntimeError, "injected directory commit failure"):
                self.store.create_tenant(*create)
        self.assertIsNone(self.store.get_tenant(tenant), "an uncommitted directory entry cannot route a tenant")
        with original("two") as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tenant WHERE tenant_id = %s", (tenant,)).fetchone()[0], 1)
        with self.assertRaisesRegex(InvariantViolation, "^TENANT_CREATE_ORPHAN_CONFLICT"):
            self.store.create_tenant(tenant, "Different tenant", *create[2:])
        self.assertIsNone(self.regions.region_of(tenant))
        recovered = self.store.create_tenant(*create)
        self.assertEqual(recovered["tenant_id"], tenant)
        self.assertEqual(self.store.get_tenant(tenant)["created_at"], recovered["created_at"])


if __name__ == "__main__":
    unittest.main()
