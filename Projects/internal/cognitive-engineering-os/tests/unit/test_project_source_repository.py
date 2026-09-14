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


if __name__ == "__main__":
    unittest.main()
