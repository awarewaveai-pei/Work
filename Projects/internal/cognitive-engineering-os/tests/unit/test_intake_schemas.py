import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import source_record


class IntakeSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contracts = SchemaContracts(resolve_spec_root())

    def test_runtime_project_and_source_records_match_their_canonical_contracts(self):
        project = project_record(
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
            "EdD study",
            "Investigate reflective practice.",
            "Confidential",
            "44444444-4444-4444-8444-444444444444",
            "2026-09-14T00:00:00Z",
        )
        source = source_record(
            "55555555-5555-4555-8555-555555555555",
            project["project_id"],
            project["tenant_id"],
            "Interview notes",
            "text/plain",
            project["data_classification"],
            "a" * 64,
            20,
            {
                "uri": "artifact://tenant/22222222-2222-4222-8222-222222222222/project/11111111-1111-4111-8111-111111111111/source/55555555-5555-4555-8555-555555555555",
                "segments": [
                    {"segment_type": "tenant", "segment_id": "22222222-2222-4222-8222-222222222222"},
                    {"segment_type": "project", "segment_id": "11111111-1111-4111-8111-111111111111"},
                    {"segment_type": "source", "segment_id": "55555555-5555-4555-8555-555555555555"},
                ],
            },
            project["created_by_identity_id"],
            "2026-09-14T00:00:00Z",
        )

        self.contracts.validate("ai-lego://specs/domain/project.schema.yaml", project, "project")
        self.contracts.validate("ai-lego://specs/domain/source.schema.yaml", source, "source")

    def test_source_with_populated_citation_metadata_matches_its_canonical_contract(self):
        """The prior test only exercises doi/authors/venue/published_at at their None default;
        this proves the schema's additionalProperties:false shape also accepts real values."""
        project = project_record(
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
            "EdD study",
            "Investigate reflective practice.",
            "Confidential",
            "44444444-4444-4444-8444-444444444444",
            "2026-09-14T00:00:00Z",
        )
        source = source_record(
            "55555555-5555-4555-8555-555555555555",
            project["project_id"],
            project["tenant_id"],
            "Interview notes",
            "text/plain",
            project["data_classification"],
            "a" * 64,
            20,
            {
                "uri": "artifact://tenant/22222222-2222-4222-8222-222222222222/project/11111111-1111-4111-8111-111111111111/source/55555555-5555-4555-8555-555555555555",
                "segments": [
                    {"segment_type": "tenant", "segment_id": "22222222-2222-4222-8222-222222222222"},
                    {"segment_type": "project", "segment_id": "11111111-1111-4111-8111-111111111111"},
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

        self.contracts.validate("ai-lego://specs/domain/source.schema.yaml", source, "source")


if __name__ == "__main__":
    unittest.main()
