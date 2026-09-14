import unittest

from ai_lego.core.domain.source import source_record
from ai_lego.errors import InvariantViolation


class SourceDomainTests(unittest.TestCase):
    def test_builds_an_untrusted_portable_text_source(self):
        record = source_record(
            source_id="11111111-1111-4111-8111-111111111111",
            project_id="22222222-2222-4222-8222-222222222222",
            tenant_id="33333333-3333-4333-8333-333333333333",
            title="Interview notes",
            media_type="text/plain",
            data_classification="Confidential",
            content_sha256="a" * 64,
            size_bytes=18,
            artifact_uri={
                "uri": "artifact://tenant/33333333-3333-4333-8333-333333333333/project/22222222-2222-4222-8222-222222222222/source/11111111-1111-4111-8111-111111111111",
                "segments": [
                    {"segment_type": "tenant", "segment_id": "33333333-3333-4333-8333-333333333333"},
                    {"segment_type": "project", "segment_id": "22222222-2222-4222-8222-222222222222"},
                    {"segment_type": "source", "segment_id": "11111111-1111-4111-8111-111111111111"},
                ],
            },
            created_by_identity_id="44444444-4444-4444-8444-444444444444",
            created_at="2026-09-14T00:00:00Z",
        )

        self.assertEqual(record["content_role"], "RETRIEVED_SOURCE_DATA")
        self.assertEqual(record["verification_status"], "UNVERIFIED")
        self.assertNotIn("content", record)

    def test_refuses_a_non_sha256_content_identity(self):
        with self.assertRaisesRegex(InvariantViolation, "SOURCE_CONTENT_SHA256_INVALID"):
            source_record(
                source_id="11111111-1111-4111-8111-111111111111",
                project_id="22222222-2222-4222-8222-222222222222",
                tenant_id="33333333-3333-4333-8333-333333333333",
                title="Notes",
                media_type="text/plain",
                data_classification="Internal",
                content_sha256="not-a-digest",
                size_bytes=4,
                artifact_uri={
                    "uri": "artifact://tenant/33333333-3333-4333-8333-333333333333/project/22222222-2222-4222-8222-222222222222/source/11111111-1111-4111-8111-111111111111",
                    "segments": [
                        {"segment_type": "tenant", "segment_id": "33333333-3333-4333-8333-333333333333"},
                        {"segment_type": "project", "segment_id": "22222222-2222-4222-8222-222222222222"},
                        {"segment_type": "source", "segment_id": "11111111-1111-4111-8111-111111111111"},
                    ],
                },
                created_by_identity_id="44444444-4444-4444-8444-444444444444",
                created_at="2026-09-14T00:00:00Z",
            )

    def test_refuses_an_artifact_uri_that_names_another_tenant(self):
        with self.assertRaisesRegex(InvariantViolation, "SOURCE_ARTIFACT_URI_IDENTITY_MISMATCH"):
            source_record(
                source_id="11111111-1111-4111-8111-111111111111",
                project_id="22222222-2222-4222-8222-222222222222",
                tenant_id="33333333-3333-4333-8333-333333333333",
                title="Notes",
                media_type="text/plain",
                data_classification="Internal",
                content_sha256="a" * 64,
                size_bytes=4,
                artifact_uri={
                    "uri": "artifact://tenant/99999999-9999-4999-8999-999999999999/project/22222222-2222-4222-8222-222222222222/source/11111111-1111-4111-8111-111111111111",
                    "segments": [
                        {"segment_type": "tenant", "segment_id": "99999999-9999-4999-8999-999999999999"},
                        {"segment_type": "project", "segment_id": "22222222-2222-4222-8222-222222222222"},
                        {"segment_type": "source", "segment_id": "11111111-1111-4111-8111-111111111111"},
                    ],
                },
                created_by_identity_id="44444444-4444-4444-8444-444444444444",
                created_at="2026-09-14T00:00:00Z",
            )


if __name__ == "__main__":
    unittest.main()
