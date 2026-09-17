"""``research.citation_verification`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_citation_verification_slice import SPEC, _literature, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.citation_verification import generate_citation_verification
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class CitationVerificationTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("CITVER_INVALID_LITERATURE", lambda: generate_citation_verification("CITVER-X", {"set_id": "S", "items": []}, P)),
        ("CITVER_INVALID_LITERATURE", lambda: generate_citation_verification("CITVER-X", {"set_id": "", "items": [{"literature_id": "W1"}]}, P)),
        ("CITVER_INVALID_LITERATURE", lambda: generate_citation_verification("CITVER-X", "not-a-dict", P)),
        ("CITVER_DUPLICATE_LITERATURE_ID", lambda: generate_citation_verification("CITVER-X", {"set_id": "S", "items": [{"literature_id": "W1", "title": "A"}, {"literature_id": "W1", "title": "B"}]}, P)),
    ]
    TAMPERS = [
        ("citation_verification_integrity", lambda r: {**r, "summary": {**r["summary"], "structurally_complete": r["summary"]["total"]}}),
        ("citation_verification_integrity", lambda r: {**r, "checks": [r["checks"][0], {**r["checks"][1], "structurally_complete": True, "issues": []}]}),
        ("citation_verification_integrity", lambda r: {**r, "scope": "FULL"}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]

    def test_well_formed_item_is_structurally_complete_with_no_issues(self):
        record = self.build()
        good = record["checks"][0]
        self.assertTrue(good["structurally_complete"])
        self.assertEqual(good["issues"], [])
        self.assertTrue(good["doi_format_valid"])

    def test_missing_doi_flags_issue_but_missing_venue_alone_never_fails_structural_completeness(self):
        record = self.build()
        bad = record["checks"][1]
        self.assertIn("MISSING_DOI", bad["issues"])
        self.assertIn("MISSING_VENUE", bad["issues"])
        self.assertFalse(bad["structurally_complete"])  # MISSING_DOI is a hard issue
        self.assertIsNone(bad["doi_format_valid"])

    def test_venue_missing_alone_does_not_fail_structural_completeness(self):
        literature = _literature()
        literature["items"] = [{"literature_id": "W9", "title": "Preprint with everything but a venue", "doi": "10.1000/example.9", "authors": ["A. One"], "publication_year": 2022, "venue": None}]
        record = generate_citation_verification("CITVER-VENUE-001", literature, P)
        self.assertEqual(record["checks"][0]["issues"], ["MISSING_VENUE"])
        self.assertTrue(record["checks"][0]["structurally_complete"])
        self.assertEqual(record["summary"], {"total": 1, "structurally_complete": 1, "with_issues": 0})

    def test_malformed_doi_is_flagged_distinctly_from_missing_doi(self):
        literature = _literature()
        literature["items"] = [{"literature_id": "W9", "title": "T", "doi": "not-a-real-doi", "authors": ["A"], "publication_year": 2020, "venue": "V"}]
        record = generate_citation_verification("CITVER-DOI-001", literature, P)
        check = record["checks"][0]
        self.assertIn("DOI_FORMAT_INVALID", check["issues"])
        self.assertNotIn("MISSING_DOI", check["issues"])
        self.assertFalse(check["doi_format_valid"])
        self.assertFalse(check["structurally_complete"])

    def test_implausible_year_is_flagged(self):
        literature = _literature()
        for year in (0, -5, 9999, "2020", 2020.5):
            with self.subTest(year=year):
                literature["items"] = [{"literature_id": "W9", "title": "T", "doi": "10.1000/x", "authors": ["A"], "publication_year": year, "venue": "V"}]
                record = generate_citation_verification("CITVER-YEAR-001", literature, P)
                self.assertIn("MISSING_OR_IMPLAUSIBLE_YEAR", record["checks"][0]["issues"])

    def test_verify_item_never_raises_on_a_non_dict_item(self):
        """Critic finding 2026-09-17: the docstring claims 'Never raises', but the function called item.get(...)
        with no isinstance guard -- reachable via a tampered stored literature_items entry (e.g. replaced with
        None or a string) hitting _core_problem_from_record during gate re-derivation."""
        from ai_lego.modules.research.citation_verification import _verify_item

        for bad in (None, "not-a-dict", 42, [], True):
            result = _verify_item(bad)
            self.assertEqual(result["issues"], ["ITEM_NOT_AN_OBJECT"])
            self.assertFalse(result["structurally_complete"])
            self.assertIsNone(result["literature_id"])

    def test_literature_items_are_a_lean_projection_not_the_full_item(self):
        record = self.build()
        self.assertEqual(set(record["literature_items"][0]), {"literature_id", "title", "doi", "authors", "publication_year", "venue"})


if __name__ == "__main__":
    unittest.main()
