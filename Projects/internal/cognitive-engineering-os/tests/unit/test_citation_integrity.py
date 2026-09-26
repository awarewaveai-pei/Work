"""Tests for ``ai_lego.modules.research.gates.evaluate_citation_integrity`` (P2 WC-01, P-b/P-e).

The one ``citation_integrity`` definition every synthesis line and interpret
(WC-P2-08) shares. Each case matches one of the required-status conditions:
FAIL <=> out-of-manifest citation, zero-citation claim, under-two conflict, or
zero claims total; ``uncited_sections`` is informational only."""

from __future__ import annotations

import unittest

from ai_lego.modules.research.gates import evaluate_citation_integrity

MANIFEST_IDS = {"source:a", "source:b", "source:c"}


class CitationIntegrityTests(unittest.TestCase):
    def test_out_of_manifest_citation_fails(self):
        result = evaluate_citation_integrity({"claims": [{"text": "x", "citations": ["source:a", "source:zz"]}]}, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["evidence"]["out_of_manifest"]), 1)

    def test_zero_citation_claim_fails(self):
        result = evaluate_citation_integrity({"claims": [{"text": "x", "citations": []}]}, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["evidence"]["zero_citation"]), 1)

    def test_conflicts_with_only_one_distinct_citation_fails(self):
        obj = {"conflicts": [{"text": "disputed", "citations": ["source:a"]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["evidence"]["conflicts_under_two"]), 1)

    def test_conflicts_with_duplicate_id_counts_as_one_distinct_and_fails(self):
        obj = {"conflicts": [{"text": "disputed", "citations": ["source:a", "source:a"]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["evidence"]["conflicts_under_two"]), 1)

    def test_conflicts_with_two_distinct_citations_passes_that_check(self):
        obj = {"conflicts": [{"text": "disputed", "citations": ["source:a", "source:b"]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["evidence"]["conflicts_under_two"], [])

    def test_zero_claims_total_fails(self):
        result = evaluate_citation_integrity({"summary": "no claims here"}, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["claims_total"], 0)

    def test_nested_claims_are_found_at_any_depth(self):
        obj = {"sections": [{"heading": "h", "claims": [{"claim_id": "C1", "citations": ["source:a"]}]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["claims_total"], 1)

    def test_uncited_sections_are_reported_but_do_not_fail(self):
        obj = {"claims": [{"text": "x", "citations": ["source:a"]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["uncited_sections"], ["source:b", "source:c"])

    def test_fully_valid_object_passes_with_no_evidence(self):
        obj = {
            "claims": [{"claim_id": "C1", "citations": ["source:a"]}],
            "conflicts": [{"text": "d", "citations": ["source:b", "source:c"]}],
            "gaps": [{"text": "unknown"}],
        }
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["out_of_manifest"], [])
        self.assertEqual(result["evidence"]["zero_citation"], [])
        self.assertEqual(result["evidence"]["conflicts_under_two"], [])
        self.assertEqual(result["evidence"]["uncited_sections"], [])

    def test_gate_id_is_citation_integrity(self):
        result = evaluate_citation_integrity({"claims": [{"citations": ["source:a"]}]}, MANIFEST_IDS)
        self.assertEqual(result["gate_id"], "citation_integrity")


if __name__ == "__main__":
    unittest.main()
