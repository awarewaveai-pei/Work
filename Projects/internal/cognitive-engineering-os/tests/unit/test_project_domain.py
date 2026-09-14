import unittest

from ai_lego.core.domain.project import project_record
from ai_lego.errors import InvariantViolation


class ProjectDomainTests(unittest.TestCase):
    def test_builds_a_tenant_workspace_scoped_project(self):
        record = project_record(
            project_id="11111111-1111-4111-8111-111111111111",
            tenant_id="22222222-2222-4222-8222-222222222222",
            workspace_id="33333333-3333-4333-8333-333333333333",
            name="EdD reflective practice",
            purpose="Build a defensible doctoral research project.",
            data_classification="Confidential",
            created_by_identity_id="44444444-4444-4444-8444-444444444444",
            created_at="2026-09-14T00:00:00Z",
        )

        self.assertEqual(record["status"], "active")
        self.assertEqual(record["version"], 1)
        self.assertEqual(record["data_classification"], "Confidential")

    def test_refuses_an_unknown_data_classification(self):
        with self.assertRaisesRegex(InvariantViolation, "PROJECT_DATA_CLASSIFICATION_INVALID"):
            project_record(
                project_id="11111111-1111-4111-8111-111111111111",
                tenant_id="22222222-2222-4222-8222-222222222222",
                workspace_id="33333333-3333-4333-8333-333333333333",
                name="Project",
                purpose="Purpose",
                data_classification="Secret",
                created_by_identity_id="44444444-4444-4444-8444-444444444444",
                created_at="2026-09-14T00:00:00Z",
            )


if __name__ == "__main__":
    unittest.main()
