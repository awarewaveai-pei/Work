import unittest
from copy import deepcopy

from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import source_record
from ai_lego.data.db import Databases
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.data.events import record_log
from tests.pg import PgTestCase, add_tenant, empty_tables

TENANT, OTHER_TENANT = "22222222-2222-4222-8222-222222222222", "99999999-9999-4999-8999-999999999999"
# A time the record carried as "...T00:00:00Z" reads back in the database's form: the same instant, six fraction digits (D4).
STORED_AT = "2026-09-14T00:00:00.000000Z"


class ProjectSourceRepositoryTests(PgTestCase):
    def setUp(self):
        empty_tables(self.databases)   # fixed ids: a fresh database per test, as the temp file was
        add_tenant(self.databases, TENANT)
        add_tenant(self.databases, OTHER_TENANT)   # a real tenant: its miss proves the scoping, not an unknown id

    @staticmethod
    def _project():
        return project_record(
            "11111111-1111-4111-8111-111111111111",
            TENANT,
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
        project = self._project()
        ProjectSourceRepository(self.databases).create_project(project)
        with Databases({self.REGION: self.url}) as fresh_pools:
            reopened = ProjectSourceRepository(fresh_pools)
            self.assertEqual(reopened.get_project(project["tenant_id"], project["project_id"]), {**project, "created_at": STORED_AT})
            self.assertIsNone(reopened.get_project(OTHER_TENANT, project["project_id"]))

    def test_source_metadata_and_storage_reference_are_tenant_scoped_and_evented_without_content(self):
        repository = ProjectSourceRepository(self.databases)
        project = self._project()
        source = self._source()
        cas_path = {"path": "/objects/tenant/sha256/aa/aa/" + "a" * 64, "tenant_segment": project["tenant_id"], "hash": "a" * 64, "shard_1": "aa", "shard_2": "aa"}
        repository.create_project(project)

        stored = repository.add_source(source, cas_path, writer=record_log.system("GATHER"))

        self.assertEqual(repository.get_source(project["tenant_id"], project["project_id"], source["source_id"]), {**source, "created_at": STORED_AT})
        self.assertEqual(stored, repository.get_source(project["tenant_id"], project["project_id"], source["source_id"]))   # what add_source returns is what is stored
        self.assertEqual(repository.get_source_content_reference(project["tenant_id"], project["project_id"], source["source_id"]), cas_path)
        self.assertIsNone(repository.get_source(OTHER_TENANT, project["project_id"], source["source_id"]))
        events = repository.list_events(project["tenant_id"], f"source:{source['source_id']}")
        self.assertEqual([event["event_type"] for event in events], ["SourceAdded"])
        self.assertNotIn("content", events[0]["payload"])

    def test_source_cannot_silently_change_its_project_classification(self):
        repository = ProjectSourceRepository(self.databases)
        project = self._project()
        source = deepcopy(self._source())
        source["data_classification"] = "Public"
        repository.create_project(project)

        with self.assertRaisesRegex(InvariantViolation, "SOURCE_PROJECT_CLASSIFICATION_MISMATCH"):
            repository.add_source(source, {"tenant_segment": project["tenant_id"], "hash": source["content_sha256"]}, writer=record_log.system("GATHER"))

    def test_source_metadata_round_trips_populated_citation_fields(self):
        repository = ProjectSourceRepository(self.databases)
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

        repository.add_source(source, cas_path, writer=record_log.system("GATHER"))

        self.assertEqual(repository.get_source(project["tenant_id"], project["project_id"], source["source_id"]), {**source, "created_at": STORED_AT})


if __name__ == "__main__":
    unittest.main()
