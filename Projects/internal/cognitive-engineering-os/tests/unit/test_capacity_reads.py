"""Capacity rig findings, 2026-10-12 (ops/load-test): what one person reads is bounded by that person, and what is parsed from
files or looked up once is not parsed or looked up per request. The scoping tests guard ownership (a person list holds their
cases only); the rest pin that a cached value follows its files."""

from __future__ import annotations

import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

from ai_lego.apps.api import main as api_main
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.rulesets import kept_load
from tests import pg
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

NL = chr(10)


class PersonScopedReadsTests(ProjectSourceApiTestCase):
    def _second_person(self) -> dict:
        store = api_main.app.dependency_overrides[api_main.get_store]()
        return store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "second@example.com", "Second", "correct-horse-battery")

    def _login_second(self) -> None:
        response = self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "second@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_a_second_person_in_the_same_tenant_lists_only_their_own_cases(self):
        self._login()
        mine = self._create_project(name="first person case")
        self._second_person()
        self._login_second()
        theirs = self._create_project(name="second person case")
        self.assertEqual([p["project_id"] for p in self.client.get("/projects").json()], [theirs["project_id"]])
        self._login()
        self.assertEqual([p["project_id"] for p in self.client.get("/projects").json()], [mine["project_id"]])

    def test_the_repository_readers_stay_inside_the_cases_they_are_given(self):
        self._login()
        first = self._create_project(name="first person case")
        self._second_person()
        self._login_second()
        second = self._create_project(name="second person case")
        tenant = self.tenant["tenant_id"]
        self.assertEqual(set(self._repo.last_activity(tenant)), {first["project_id"], second["project_id"]})
        self.assertEqual(set(self._repo.last_activity(tenant, project_ids=[first["project_id"]])), {first["project_id"]})
        self.assertEqual(self._repo.last_activity(tenant, project_ids=[]), {})
        self.assertEqual(self._repo.analyses(tenant, project_ids=[]), {})
        self.assertEqual([p["project_id"] for p in self._repo.list_projects(tenant, created_by=second["created_by_identity_id"])], [second["project_id"]])
        self.assertEqual(CaseDocs(self._repo).owners_with(tenant, "case", "assembler.intake", owner_ids=[]), set())


class CurrentManyTests(ProjectSourceApiTestCase):
    def test_several_kinds_in_one_read_are_each_the_single_kind_answer_and_a_group_is_still_refused(self):
        self._login()
        pid = self._create_project()["project_id"]
        base = f"/projects/{pid}"
        for text in ("one", "two"):
            self.assertEqual(self.client.post(f"{base}/docs/sense.card", json={"content": {"category": "事件", "text": text}}).status_code, 200)
        owner, docs, tenant = record_log.case(pid), CaseDocs(self._repo), self.tenant["tenant_id"]
        kinds = ["sense.card", "assembler.intake", "sense.card", "map.map"]
        many = docs.current_many(tenant, owner, kinds)
        self.assertEqual(list(many), ["sense.card", "assembler.intake", "map.map"])
        self.assertEqual(many, {kind: docs.current(tenant, owner, kind) for kind in many})
        self.assertEqual(len(many["sense.card"]), 2)
        with self.assertRaisesRegex(InvariantViolation, "^DOC_GROUP_READ_NEEDS_VISIBILITY"):
            docs.current_many(tenant, record_log.group("g"), ["collab.place"])


class RegionLookupTests(ProjectSourceApiTestCase):
    def test_a_found_region_is_asked_once_and_a_missing_tenant_is_asked_again(self):
        tenant = pg.add_tenant(self.databases, str(uuid.uuid4()))
        with mock.patch.object(self.databases, "_read_one", wraps=self.databases._read_one) as asked:
            self.assertEqual(self.databases.region_of(tenant), self.databases.directory_region)
            self.assertEqual(self.databases.region_of(tenant), self.databases.directory_region)
            self.assertEqual(asked.call_count, 1)
            unknown = str(uuid.uuid4())
            self.assertIsNone(self.databases.region_of(unknown))
            self.assertIsNone(self.databases.region_of(unknown))
            self.assertEqual(asked.call_count, 3)


class ConnectionBudgetTests(ProjectSourceApiTestCase):
    def test_workers_times_pool_must_fit_the_connections_the_server_allows(self):
        region = self.databases.directory_region
        self.databases.require_connection_budget(region, 1)
        with self.assertRaisesRegex(InvariantViolation, "^DB_POOL_EXCEEDS_SERVER"):
            self.databases.require_connection_budget(region, 100000)


class PoolSizeTests(unittest.TestCase):
    def test_a_pool_size_that_is_not_a_whole_number_is_refused_before_anything_connects(self):
        for value in ("0", "-1", "ten", "2.5"):
            with self.subTest(value=value), self.assertRaisesRegex(InvariantViolation, "^DB_POOL_MAX_INVALID"):
                db.Databases.from_env({db.DATABASE_URLS_ENV: "r=postgresql://u:p@localhost/x", db.POOL_MAX_ENV: value})


class KeptContentTests(unittest.TestCase):
    def test_a_kept_load_follows_its_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root, built = Path(folder), []
            (root / "one.yaml").write_text("a", encoding="utf-8")

            def load():
                built.append(1)
                return object()

            first = kept_load("test.kept", root, load)
            self.assertIs(kept_load("test.kept", root, load), first)
            self.assertEqual(len(built), 1)
            (root / "one.yaml").write_text("changed text", encoding="utf-8")
            self.assertIsNot(kept_load("test.kept", root, load), first)
            (root / "two.yaml").write_text("b", encoding="utf-8")
            kept_load("test.kept", root, load)
            self.assertEqual(len(built), 3)


class DisplayMetadataCacheTests(unittest.TestCase):
    def test_the_display_file_is_parsed_once_per_change_and_a_broken_one_fails_open(self):
        with tempfile.TemporaryDirectory() as folder:
            registry = Path(folder) / "methods" / "registry"
            registry.mkdir(parents=True)
            path = registry / "method-display-metadata.yaml"
            path.write_text(NL.join(["entries:", "  a.b:", "    name_zh: x", ""]), encoding="utf-8")
            with mock.patch.object(api_main, "resolve_spec_root", return_value=Path(folder)), mock.patch.object(api_main.yaml, "safe_load", wraps=api_main.yaml.safe_load) as parsed:
                self.assertEqual(api_main._method_display_metadata(), {"a.b": {"name_zh": "x"}})
                api_main._method_display_metadata()
                self.assertEqual(parsed.call_count, 1)
                path.write_text(NL.join(["entries:", "  a.b:", "    name_zh: a longer name", ""]), encoding="utf-8")
                self.assertEqual(api_main._method_display_metadata(), {"a.b": {"name_zh": "a longer name"}})
                path.write_text(NL.join(["entries: [unclosed", ""]), encoding="utf-8")
                self.assertEqual(api_main._method_display_metadata(), {})
                self.assertEqual(parsed.call_count, 3)


class CatalogBytesTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        api_main._CATALOG_CACHE.clear()

    def test_the_catalog_is_served_from_bytes_built_once_and_a_registry_change_after_the_recheck_window_rebuilds_it(self):
        first = self.client.get("/catalog")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.content, api_main._CATALOG_CACHE["body"])
        with mock.patch.object(api_main, "load_catalog", side_effect=AssertionError("reloaded")):
            self.assertEqual(self.client.get("/catalog").content, first.content)
        built = api_main._CATALOG_CACHE["payload"]
        with mock.patch.object(api_main, "_catalog_fingerprint", return_value=(0, 0)), mock.patch.object(api_main, "_monotonic", return_value=time.monotonic() + 3600):
            self.assertEqual(self.client.get("/catalog").status_code, 200)
        self.assertIsNot(api_main._CATALOG_CACHE["payload"], built)


if __name__ == "__main__":
    unittest.main()
