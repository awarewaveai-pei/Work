import json
import sqlite3
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import source_record
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation


class ProjectSourceRepositoryTests(unittest.TestCase):
    @staticmethod
    def _project():
        return project_record(
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
            "EdD study",
            "Investigate reflective practice.",
            "Confidential",
            "44444444-4444-4444-8444-444444444444",
            "2026-09-14T00:00:00Z",
        )

    @classmethod
    def _source(cls):
        project = cls._project()
        return source_record(
            "55555555-5555-4555-8555-555555555555",
            project["project_id"],
            project["tenant_id"],
            "Interview notes",
            "text/plain",
            "Confidential",
            "a" * 64,
            18,
            {
                "uri": "artifact://tenant/22222222-2222-4222-8222-222222222222/project/11111111-1111-4111-8111-111111111111/source/55555555-5555-4555-8555-555555555555",
                "segments": [
                    {"segment_type": "tenant", "segment_id": project["tenant_id"]},
                    {"segment_type": "project", "segment_id": project["project_id"]},
                    {"segment_type": "source", "segment_id": "55555555-5555-4555-8555-555555555555"},
                ],
            },
            project["created_by_identity_id"],
            "2026-09-14T00:00:00Z",
        )

    def test_project_survives_reopen_and_cross_tenant_read_returns_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.sqlite3"
            project = self._project()

            ProjectSourceRepository(path).create_project(project)
            reopened = ProjectSourceRepository(path)

            self.assertEqual(reopened.get_project(project["tenant_id"], project["project_id"]), project)
            self.assertIsNone(reopened.get_project("99999999-9999-4999-8999-999999999999", project["project_id"]))

    def test_source_metadata_and_storage_reference_are_tenant_scoped_and_evented_without_content(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = ProjectSourceRepository(Path(directory) / "projects.sqlite3")
            project = self._project()
            source = self._source()
            cas_path = {"path": "/objects/tenant/sha256/aa/aa/" + "a" * 64, "tenant_segment": project["tenant_id"], "hash": "a" * 64, "shard_1": "aa", "shard_2": "aa"}
            repository.create_project(project)

            repository.add_source(source, cas_path)

            self.assertEqual(repository.get_source(project["tenant_id"], project["project_id"], source["source_id"]), source)
            self.assertEqual(repository.get_source_content_reference(project["tenant_id"], project["project_id"], source["source_id"]), cas_path)
            self.assertIsNone(repository.get_source("99999999-9999-4999-8999-999999999999", project["project_id"], source["source_id"]))
            events = repository.list_events(project["tenant_id"], f"source:{source['source_id']}")
            self.assertEqual([event["event_type"] for event in events], ["SourceAdded"])
            self.assertNotIn("content", events[0]["payload"])

    def test_source_cannot_silently_change_its_project_classification(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = ProjectSourceRepository(Path(directory) / "projects.sqlite3")
            project = self._project()
            source = deepcopy(self._source())
            source["data_classification"] = "Public"
            repository.create_project(project)

            with self.assertRaisesRegex(InvariantViolation, "SOURCE_PROJECT_CLASSIFICATION_MISMATCH"):
                repository.add_source(source, {"tenant_segment": project["tenant_id"], "hash": source["content_sha256"]})

    def test_source_metadata_round_trips_populated_citation_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = ProjectSourceRepository(Path(directory) / "projects.sqlite3")
            project = self._project()
            source = source_record(
                "55555555-5555-4555-8555-555555555555",
                project["project_id"],
                project["tenant_id"],
                "Interview notes",
                "text/plain",
                "Confidential",
                "a" * 64,
                18,
                {
                    "uri": "artifact://tenant/22222222-2222-4222-8222-222222222222/project/11111111-1111-4111-8111-111111111111/source/55555555-5555-4555-8555-555555555555",
                    "segments": [
                        {"segment_type": "tenant", "segment_id": project["tenant_id"]},
                        {"segment_type": "project", "segment_id": project["project_id"]},
                        {"segment_type": "source", "segment_id": "55555555-5555-4555-8555-555555555555"},
                    ],
                },
                project["created_by_identity_id"],
                "2026-09-14T00:00:00Z",
                doi="10.1000/xyz123",
                authors=["Ada Lovelace", "Alan Turing"],
                venue="Journal of Reflective Practice",
                published_at="2020-05",
            )
            cas_path = {"path": "/objects/tenant/sha256/aa/aa/" + "a" * 64, "tenant_segment": project["tenant_id"], "hash": "a" * 64, "shard_1": "aa", "shard_2": "aa"}
            repository.create_project(project)

            repository.add_source(source, cas_path)

            self.assertEqual(repository.get_source(project["tenant_id"], project["project_id"], source["source_id"]), source)

    def test_a_pre_existing_database_without_citation_columns_upgrades_in_place(self):
        """2026-09-18: doi/authors_json/venue/published_at were added to prov_sources.
        ``CREATE TABLE IF NOT EXISTS`` is a no-op on an already-existing table, so this builds a
        real pre-migration (production-shaped) database file with raw SQL -- bypassing
        ProjectSourceRepository entirely, so this test does not depend on the current schema --
        and proves reopening it through the real repository upgrades the table in place instead
        of raising, with old rows reading back with the new columns as null."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.sqlite3"
            project = self._project()
            source = self._source()

            raw_connection = sqlite3.connect(path)
            try:
                raw_connection.executescript(
                    """
                    CREATE TABLE platform_projects (
                        tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
                        name TEXT NOT NULL, purpose TEXT NOT NULL, data_classification TEXT NOT NULL,
                        status TEXT NOT NULL, version INTEGER NOT NULL, created_by_identity_id TEXT NOT NULL,
                        created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, project_id)
                    );
                    CREATE TABLE prov_sources (
                        tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, source_id TEXT NOT NULL,
                        title TEXT NOT NULL, media_type TEXT NOT NULL, data_classification TEXT NOT NULL,
                        content_sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, artifact_uri_json TEXT NOT NULL,
                        content_role TEXT NOT NULL, verification_status TEXT NOT NULL, status TEXT NOT NULL,
                        version INTEGER NOT NULL, created_by_identity_id TEXT NOT NULL, created_at TEXT NOT NULL,
                        cas_path_json TEXT NOT NULL, PRIMARY KEY (tenant_id, project_id, source_id)
                    );
                    CREATE TABLE events (
                        event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, aggregate_id TEXT NOT NULL,
                        sequence INTEGER NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL,
                        schema_version TEXT NOT NULL, correlation_id TEXT NOT NULL, causation_id TEXT,
                        payload_json TEXT NOT NULL, UNIQUE (tenant_id, aggregate_id, sequence)
                    );
                    """
                )
                raw_connection.execute(
                    "INSERT INTO platform_projects (tenant_id, project_id, workspace_id, name, purpose, data_classification, status, version, created_by_identity_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (project["tenant_id"], project["project_id"], project["workspace_id"], project["name"], project["purpose"], project["data_classification"], project["status"], project["version"], project["created_by_identity_id"], project["created_at"]),
                )
                raw_connection.execute(
                    "INSERT INTO prov_sources (tenant_id, project_id, source_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at, cas_path_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        source["tenant_id"],
                        source["project_id"],
                        source["source_id"],
                        source["title"],
                        source["media_type"],
                        source["data_classification"],
                        source["content_sha256"],
                        source["size_bytes"],
                        json.dumps(source["artifact_uri"]),
                        source["content_role"],
                        source["verification_status"],
                        source["status"],
                        source["version"],
                        source["created_by_identity_id"],
                        source["created_at"],
                        json.dumps({"path": "/objects/tenant/sha256/aa/aa/" + "a" * 64, "tenant_segment": project["tenant_id"], "hash": "a" * 64, "shard_1": "aa", "shard_2": "aa"}),
                    ),
                )
                raw_connection.commit()
            finally:
                raw_connection.close()

            repository = ProjectSourceRepository(path)  # must not raise against the old-shaped file

            migrated = repository.get_source(project["tenant_id"], project["project_id"], source["source_id"])
            self.assertIsNotNone(migrated)
            self.assertIsNone(migrated["doi"])
            self.assertIsNone(migrated["authors"])
            self.assertIsNone(migrated["venue"])
            self.assertIsNone(migrated["published_at"])

            second_source = source_record(
                "66666666-6666-4666-8666-666666666666",
                project["project_id"],
                project["tenant_id"],
                "Second source",
                "text/plain",
                "Confidential",
                "b" * 64,
                10,
                {
                    "uri": f"artifact://tenant/{project['tenant_id']}/project/{project['project_id']}/source/66666666-6666-4666-8666-666666666666",
                    "segments": [
                        {"segment_type": "tenant", "segment_id": project["tenant_id"]},
                        {"segment_type": "project", "segment_id": project["project_id"]},
                        {"segment_type": "source", "segment_id": "66666666-6666-4666-8666-666666666666"},
                    ],
                },
                project["created_by_identity_id"],
                "2026-09-14T00:00:00Z",
                doi="10.1000/xyz123",
                authors=["Ada Lovelace"],
                venue="Journal of Reflective Practice",
                published_at="2020-05",
            )
            repository.add_source(second_source, {"tenant_segment": project["tenant_id"], "hash": "b" * 64})

            added = repository.get_source(project["tenant_id"], project["project_id"], second_source["source_id"])
            self.assertEqual(added["doi"], "10.1000/xyz123")
            self.assertEqual(added["authors"], ["Ada Lovelace"])
            self.assertEqual(added["venue"], "Journal of Reflective Practice")
            self.assertEqual(added["published_at"], "2020-05")


if __name__ == "__main__":
    unittest.main()
