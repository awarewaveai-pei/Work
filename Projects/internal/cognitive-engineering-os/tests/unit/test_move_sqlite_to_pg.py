"""The SQLite -> PostgreSQL data move (ai_lego/apps/cli/move_sqlite_to_pg.py) on the files the engine of a76af28da really
wrote (tests/fixtures/sqlite_a76af28da/runtime, built by that engine through its own repositories): the move
commits only when the proof is equal on both sides, the proof fails on one corrupted row and then leaves no trace, and
the SQLite files stay byte for byte as they were. Runs on a real PostgreSQL only (tests/pg.py)."""

from __future__ import annotations

import shutil
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import psycopg

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.cli import move_sqlite_to_pg as move
from tests.pg import PgTestCase

FIXTURE = PRODUCT_ROOT / "tests" / "fixtures" / "sqlite_a76af28da" / "runtime"
EVENT_TABLE_FILES = ("projects.sqlite3", "custom_workflows.sqlite3")


def sqlite_count(directory: Path, filename: str, table: str) -> int:
    with closing(sqlite3.connect((directory / filename).resolve().as_uri() + "?mode=ro", uri=True)) as connection:   # `with` alone leaves the file open: Windows cannot then delete the temp copy
        return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def count(url: str, table: str) -> int:
    with psycopg.connect(url) as connection:
        return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


class DataMoveProofTests(PgTestCase):
    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.source, self.destination = Path(folder.name) / "source", Path(folder.name) / "destination"
        shutil.copytree(FIXTURE, self.source)
        self.destination.mkdir()
        self.arguments = dict(source_dir=self.source, region_map={"local-dev": self.REGION}, files_root=self.destination,
                              derived_index=self.source / "derived_cache.sqlite3")

    def run_move(self, url: str, command: str = "move") -> move.Result:
        return move.run(command, urls={self.REGION: url}, **self.arguments)

    def fresh_database(self) -> str:
        database = self.pg.create_database()
        self.addCleanup(self.pg.drop_database, database)
        return self.pg.url(database)

    def test_the_move_commits_with_an_equal_proof_and_refuses_a_second_run(self):
        url = self.fresh_database()
        before = {name: move.file_sha256(self.source / name) for name in ("identity.sqlite3", "projects.sqlite3", "custom_workflows.sqlite3", "derived_cache.sqlite3")}

        result = self.run_move(url)

        self.assertTrue(result.committed)
        self.assertEqual(result.differences, [])
        self.assertEqual(count(url, "events"), sum(sqlite_count(self.source, name, "events") for name in EVENT_TABLE_FILES))
        for table, filename in (("tenant", "identity.sqlite3"), ("ai_usage", "identity.sqlite3"), ("prov_sources", "projects.sqlite3"),
                                ("custom_workflows", "custom_workflows.sqlite3"), ("derived_artifact_cache", "derived_cache.sqlite3")):
            self.assertEqual(count(url, table), sqlite_count(self.source, filename, table), table)
        with psycopg.connect(url) as connection:
            self.assertEqual(connection.execute("SELECT DISTINCT data_residency_region FROM tenant").fetchall(), [(self.REGION,)])
            self.assertEqual(connection.execute("SELECT DISTINCT region FROM tenant_directory").fetchall(), [(self.REGION,)])
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM ai_usage WHERE status = 'reserved'").fetchone()[0], 2)
            top = connection.execute("SELECT MAX(id) FROM ai_usage").fetchone()[0]
            self.assertEqual(connection.execute("SELECT last_value FROM pg_sequences WHERE sequencename = 'ai_usage_id_seq'").fetchone()[0], top, "the next id is past the largest")
        for tenant, (files, size, digest) in result.source.files.items():
            self.assertEqual(move.tree_digest(self.destination, move.plan_files(self.source, sorted(result.regions), frozenset({"derived_cache.sqlite3"}))[tenant]), (files, size, digest))
        self.assertEqual({name: move.file_sha256(self.source / name) for name in before}, before, "the source files are untouched")

        with self.assertRaises(move.MoveError) as refused:
            self.run_move(url)
        self.assertEqual(refused.exception.code, "TARGET_NOT_EMPTY")
        self.assertEqual(self.run_move(url, "verify").differences, [])

    def test_one_corrupted_row_fails_the_proof_and_leaves_nothing_behind(self):
        url = self.fresh_database()
        with psycopg.connect(url, autocommit=True) as connection:   # corrupts the copy of the one ProjectRenamed record
            connection.execute("CREATE FUNCTION corrupt_one() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                               "NEW.payload_json := jsonb_set(NEW.payload_json, '{name}', '\"changed\"'); RETURN NEW; END $$")
            connection.execute("CREATE TRIGGER corrupt_one BEFORE INSERT ON events FOR EACH ROW WHEN (NEW.event_type = 'ProjectRenamed') EXECUTE FUNCTION corrupt_one()")

        with self.assertRaises(move.MoveError) as failed:
            self.run_move(url)

        self.assertEqual(failed.exception.code, "PROOF_FAILED")
        self.assertEqual(failed.exception.exit_code, move.EXIT_PROOF)
        self.assertIn("event aggregates: 1 differ", str(failed.exception))
        self.assertEqual([count(url, table) for table in ("tenant", "events", "tenant_directory", "ai_usage")], [0, 0, 0, 0], "rolled back")
        self.assertEqual(list(self.destination.iterdir()), [], "the files this run copied are gone")

        with psycopg.connect(url, autocommit=True) as connection:   # the guard removed, the same target takes the move
            connection.execute("DROP TRIGGER corrupt_one ON events")
        self.assertTrue(self.run_move(url).committed)


if __name__ == "__main__":
    unittest.main()
