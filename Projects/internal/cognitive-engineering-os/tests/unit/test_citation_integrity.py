"""Tests for ``ai_lego.modules.research.gates.evaluate_citation_integrity`` (P2 WC-01, P-b/P-e).

The one ``citation_integrity`` definition every synthesis line and interpret
(WC-P2-08) shares. Each case matches one of the required-status conditions:
FAIL <=> out-of-manifest citation, zero-citation claim, under-two conflict, or
zero claims total; ``uncited_sections`` is informational only."""

from __future__ import annotations

import unittest

from ai_lego.modules.research.gates import evaluate_citation_integrity, synthesis_reference_errors

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
        obj = {
            "sections": [
                {"heading": "公司概況", "claims": [{"claim_id": "C1", "text": "x", "citations": ["source:a"]}]},
                {"heading": "法律與監理事件", "claims": []},
            ]
        }
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["uncited_sections"], ["法律與監理事件"])

    def test_a_manifest_source_nobody_cites_is_not_an_uncited_section(self):
        # C4 / report.ts:204: uncited_sections names sections, not unused sources -- a rejected trap source is correct behaviour.
        obj = {"sections": [{"heading": "公司概況", "claims": [{"claim_id": "C1", "text": "x", "citations": ["source:a"]}]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["evidence"]["uncited_sections"], [])

    def test_non_list_citations_is_a_zero_citation_claim(self):
        obj = {"claims": [{"text": "x", "citations": ["source:a"]}], "extra": {"text": "y", "citations": None}}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["claims_total"], 2)
        self.assertEqual([item["path"] for item in result["evidence"]["zero_citation"]], ["$.extra"])

    def test_non_string_citation_is_out_of_manifest_not_a_crash(self):
        obj = {"claims": [{"text": "x", "citations": [{"n": 1}, 1]}]}
        result = evaluate_citation_integrity(obj, MANIFEST_IDS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["out_of_manifest"][0]["bad"], ["{'n': 1}", "1"])

    def test_gate_output_stored_next_to_the_object_is_never_read_back_as_a_claim(self):
        obj = {
            "claims": [{"text": "x", "citations": ["source:zz", {"citations": ["source:a"]}]}],
            "conflicts": [{"text": "d", "citations": ["source:a"]}],
            "empty": {"citations": []},
        }
        first = evaluate_citation_integrity(obj, MANIFEST_IDS)
        again = evaluate_citation_integrity({"synthesis": obj, "gate_results": [first]}, MANIFEST_IDS)
        self.assertEqual(again["evidence"]["claims_total"], first["evidence"]["claims_total"])


class SynthesisReferenceTests(unittest.TestCase):
    def test_a_study_cites_exactly_its_own_source_and_source_id_follows_it(self):
        good = {"kind": "literature_matrix", "studies": [{"study_id": "S1", "source_id": "src:a", "citations": ["source:src:a"]}]}
        self.assertEqual(synthesis_reference_errors(good), [])

    def test_a_study_with_two_citations_is_refused(self):
        bad = {"kind": "literature_matrix", "studies": [{"study_id": "S1", "source_id": "src:a", "citations": ["source:src:a", "source:src:b"]}]}
        self.assertEqual(len(synthesis_reference_errors(bad)), 1)

    def test_a_study_source_id_that_is_not_its_citation_is_refused(self):
        bad = {"kind": "literature_matrix", "studies": [{"study_id": "S1", "source_id": "source:src:a", "citations": ["source:src:a"]}]}
        self.assertIn("source_id", synthesis_reference_errors(bad)[0])

    def test_decision_evidence_must_name_existing_options_and_criteria(self):
        synthesis = {
            "kind": "decision_evidence",
            "options": [{"option_id": "O1"}],
            "criteria": [{"criterion_id": "C1"}],
            "evidence": [{"option_ids": ["O1", "O9"], "criterion_ids": ["C2"]}],
        }
        self.assertEqual(len(synthesis_reference_errors(synthesis)), 2)

    def test_evidence_bound_to_nothing_is_refused(self):
        synthesis = {"kind": "decision_evidence", "options": [{"option_id": "O1"}], "criteria": [], "evidence": [{"option_ids": [], "criterion_ids": []}]}
        self.assertIn("bound to no option", synthesis_reference_errors(synthesis)[0])

    def test_every_id_is_unique_in_its_list(self):
        synthesis = {
            "kind": "decision_evidence",
            "sections": [{"claims": [{"claim_id": "C1"}]}, {"claims": [{"claim_id": "C1"}]}],
            "options": [{"option_id": "O1"}, {"option_id": "O1"}],
            "criteria": [{"criterion_id": "K1"}],
            "evidence": [{"option_ids": ["O1"], "criterion_ids": ["K1"]}],
        }
        errors = synthesis_reference_errors(synthesis)
        self.assertEqual(len([e for e in errors if "repeats" in e]), 2)

    def test_any_json_value_gives_messages_never_an_exception(self):
        for junk in (
            None,
            {"studies": 5},
            {"kind": "decision_evidence", "evidence": [{"option_ids": 3, "criterion_ids": []}]},
            {"kind": "decision_evidence", "options": [{"option_id": ["O1"]}], "evidence": [{"option_ids": [["O1"]], "criterion_ids": []}]},
            {"kind": ["decision_evidence"], "sections": [{"claims": "x"}]},
        ):
            self.assertTrue(synthesis_reference_errors(junk), repr(junk))

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
