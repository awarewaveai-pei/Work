"""Collected-Source provenance fields and same-transaction supersede (RESEARCH_LINES_MASTER_PLAN WC-P1-01, I1/I2)."""

from __future__ import annotations

import unittest

from psycopg import errors

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import COLLECTED_PROVENANCE, source_record
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.data.events import record_log
from tests.pg import PgTestCase, add_tenant, empty_tables

TENANT = "22222222-2222-4222-8222-222222222222"
PROJECT = "11111111-1111-4111-8111-111111111111"
IDENTITY = "44444444-4444-4444-8444-444444444444"
URL = "https://example.com/about"


def _project() -> dict:
    return project_record(PROJECT, TENANT, "33333333-3333-4333-8333-333333333333", "Acme dossier", "Partnership risk.", "Confidential", IDENTITY, "2026-09-26T00:00:00Z")


def _collected(source_id: str, sha: str, *, supersedes: str | None = None, **overrides) -> dict:
    fields = dict(
        canonical_url=URL,
        source_uri=URL + "?utm=x",
        fetched_at="2026-09-26T01:02:03.456Z",
        provenance=dict(COLLECTED_PROVENANCE),
        source_class="reference",
        relevance={"entityConfidence": 0.9, "searchAngle": "career"},
        supersedes_source_id=supersedes,
    )
    fields.update(overrides)
    return source_record(
        source_id, PROJECT, TENANT, "About Acme", "text/plain", "Confidential", sha, 42,
        {
            "uri": f"artifact://tenant/{TENANT}/project/{PROJECT}/source/{source_id}",
            "segments": [
                {"segment_type": "tenant", "segment_id": TENANT},
                {"segment_type": "project", "segment_id": PROJECT},
                {"segment_type": "source", "segment_id": source_id},
            ],
        },
        IDENTITY, "2026-09-26T01:02:04Z", **fields,
    )


def _cas(sha: str) -> dict:
    return {"tenant_segment": TENANT, "hash": sha}


OLD = "55555555-5555-4555-8555-555555555555"
NEW = "66666666-6666-4666-8666-666666666666"


class SourceProvenanceTests(PgTestCase):
    def setUp(self):
        empty_tables(self.databases)   # fixed ids: a fresh database per test, as the temp file was
        add_tenant(self.databases, TENANT)
        self.repo = ProjectSourceRepository(self.databases)
        self.repo.create_project(_project())

    def test_collected_fields_round_trip(self):
        source = _collected(OLD, "a" * 64)
        self.repo.add_source(source, _cas("a" * 64), writer=record_log.system("GATHER"))
        # the times come back in the database's form: the same instants, six fraction digits (D4)
        self.assertEqual(self.repo.get_source(TENANT, PROJECT, OLD), {**source, "created_at": "2026-09-26T01:02:04.000000Z", "fetched_at": "2026-09-26T01:02:03.456000Z"})
        self.assertEqual(self.repo.find_active_source(TENANT, PROJECT, URL)["source_id"], OLD)

    def test_collected_source_matches_the_schema(self):
        contracts = SchemaContracts(resolve_spec_root())
        contracts.validate("ai-lego://specs/domain/source.schema.yaml", _collected(OLD, "a" * 64), "source")
        contracts.validate("ai-lego://specs/domain/source.schema.yaml", {**_collected(NEW, "b" * 64, supersedes=OLD), "status": "superseded"}, "source")

    def test_supersede_swaps_the_active_row_in_one_transaction(self):
        self.repo.add_source(_collected(OLD, "a" * 64), _cas("a" * 64), writer=record_log.system("GATHER"))
        self.repo.supersede(OLD, _collected(NEW, "b" * 64, supersedes=OLD), _cas("b" * 64))
        self.assertEqual(self.repo.get_source(TENANT, PROJECT, OLD)["status"], "superseded")
        new = self.repo.get_source(TENANT, PROJECT, NEW)
        self.assertEqual((new["status"], new["supersedes_source_id"]), ("active", OLD))
        self.assertEqual(self.repo.find_active_source(TENANT, PROJECT, URL)["source_id"], NEW)
        events = self.repo.list_events(TENANT, f"source:{OLD}")
        self.assertEqual([e["event_type"] for e in events], ["SourceAdded", "SourceSuperseded"])
        self.assertEqual(set(events[-1]["payload"]), {"source_id", "superseded_by", "project_id"})

    def test_superseding_a_row_that_is_no_longer_active_writes_nothing(self):
        self.repo.add_source(_collected(OLD, "a" * 64), _cas("a" * 64), writer=record_log.system("GATHER"))
        self.repo.supersede(OLD, _collected(NEW, "b" * 64, supersedes=OLD), _cas("b" * 64))
        third = "77777777-7777-4777-8777-777777777777"
        with self.assertRaisesRegex(InvariantViolation, "SOURCE_SUPERSEDE_CONFLICT"):
            self.repo.supersede(OLD, _collected(third, "c" * 64, supersedes=OLD), _cas("c" * 64))
        self.assertIsNone(self.repo.get_source(TENANT, PROJECT, third))
        self.assertEqual(self.repo.find_active_source(TENANT, PROJECT, URL)["source_id"], NEW)

    def test_a_failed_insert_rolls_the_old_row_back_to_active(self):
        self.repo.add_source(_collected(OLD, "a" * 64), _cas("a" * 64), writer=record_log.system("GATHER"))
        with self.assertRaisesRegex(InvariantViolation, "SOURCE_STORAGE_REFERENCE_INVALID"):
            self.repo.supersede(OLD, _collected(NEW, "b" * 64, supersedes=OLD), _cas("not-the-hash"))
        self.assertEqual(self.repo.get_source(TENANT, PROJECT, OLD)["status"], "active")
        self.assertEqual(self.repo.list_events(TENANT, f"source:{OLD}")[-1]["event_type"], "SourceAdded")

    def test_the_database_refuses_two_active_versions_of_one_url(self):
        self.repo.add_source(_collected(OLD, "a" * 64), _cas("a" * 64), writer=record_log.system("GATHER"))
        with self.assertRaises(errors.UniqueViolation) as caught:
            self.repo.add_source(_collected(NEW, "b" * 64), _cas("b" * 64), writer=record_log.system("GATHER"))
        self.assertEqual(caught.exception.diag.constraint_name, "ux_prov_sources_active_canonical")

    def test_non_evidence_provenance_is_refused(self):
        bad = {"epistemic_type": "SOURCE_FACT", "authorship_state": "SOURCE_QUOTATION", "locked": None}
        with self.assertRaisesRegex(InvariantViolation, "SOURCE_PROVENANCE_INVALID"):
            _collected(OLD, "a" * 64, provenance=bad)


if __name__ == "__main__":
    unittest.main()
