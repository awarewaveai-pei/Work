"""Tests for the offline eval harness (P2 WC-04, plan §3.7/C8): score.py's 8 metrics, run.py's report and
exit code, mutate.py's mutation proofs, and terms_of parity with StuckBox.tsx:15-22."""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

COS_ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = COS_ROOT / "eval"
sys.path.insert(0, str(EVAL_DIR))

import mutate  # noqa: E402
import run as eval_run  # noqa: E402
import score as eval_score  # noqa: E402
from ai_lego.platform.text.terms import terms_of  # noqa: E402


def _build_case(base: Path, name: str, sources: dict[str, str], expected: dict) -> Path:
    case_dir = base / name
    (case_dir / "sources").mkdir(parents=True)
    for stem, text in sources.items():
        (case_dir / "sources" / f"{stem}.txt").write_text(text, encoding="utf-8")
    (case_dir / "expected.yaml").write_text(yaml.safe_dump(expected, allow_unicode=True), encoding="utf-8")
    return case_dir


def _artifact(*, manifest_ids: list[str], summary_citations: list[str], summary_text: str = "summary text", claims: list[dict] | None = None, gaps: list[dict] | None = None, conflicts: list[dict] | None = None, usage: dict | None = None, latency_ms: float | None = None) -> dict:
    artifact = {
        "manifest": {"entries": [{"id": mid} for mid in manifest_ids]},
        "synthesis": {
            "summary": {"text": summary_text, "citations": summary_citations},
            "sections": [{"heading": "h", "claims": claims or []}],
            "gaps": gaps or [],
            "conflicts": conflicts or [],
            "usage": usage or {"input_tokens": 0, "output_tokens": 0},
        },
    }
    if latency_ms is not None:
        artifact["latency_ms"] = latency_ms
    return artifact


class TermsOfPartyTests(unittest.TestCase):
    """termsOf parity with StuckBox.tsx:15-22 -- CJK runs -> overlapping bigrams, latin/digit runs kept whole, lowercased, de-duplicated, insertion order preserved."""

    def test_cjk_run_becomes_overlapping_bigrams(self):
        self.assertEqual(terms_of("冰山模型"), ["冰山", "山模", "模型"])

    def test_latin_run_kept_whole_and_lowercased(self):
        self.assertEqual(terms_of("ROI 分析"), ["roi", "分析"])

    def test_mixed_text_splits_on_non_matching_separators(self):
        self.assertEqual(terms_of("我卡在 溝通 上"), ["我卡", "卡在", "溝通"])

    def test_alnum_run_kept_whole(self):
        self.assertEqual(terms_of("SWOT2023"), ["swot2023"])

    def test_empty_string_yields_no_terms(self):
        self.assertEqual(terms_of(""), [])

    def test_single_cjk_character_yields_no_bigram(self):
        self.assertEqual(terms_of("山"), [])

    def test_duplicate_terms_deduplicated_in_first_seen_order(self):
        self.assertEqual(terms_of("陳曉明 陳曉明"), ["陳曉", "曉明"])


class _TempCaseTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.mkdtemp()
        self.base = Path(self._tmp)

    def tearDown(self) -> None:
        shutil.rmtree(self._tmp, ignore_errors=True)


class CitationPrecisionAutoTests(_TempCaseTestCase):
    def test_citation_with_shared_term_scores_full_precision(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha vendor offers same day support and 24x7 chat."}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=["source:src:doc1"], summary_text="alpha vendor offers 24x7 chat.")
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_precision_auto"], 1.0)

    def test_citation_with_no_shared_term_scores_zero_precision(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha vendor offers same day support."}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=["source:src:doc1"])
        artifact["synthesis"]["summary"]["text"] = "totally unrelated wording here"
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_precision_auto"], 0.0)


class CitationCoverageTests(_TempCaseTestCase):
    def test_covered_finding_scores_full_coverage(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha vendor pricing detail"}, expected={"findings": [{"id": "f1", "terms": ["pricing"], "sources": ["source:src:doc1"]}], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=[], claims=[{"claim_id": "c1", "text": "alpha vendor pricing detail", "citations": ["source:src:doc1"]}])
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_coverage"], 1.0)

    def test_uncited_finding_drops_coverage(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha vendor pricing detail"}, expected={"findings": [{"id": "f1", "terms": ["pricing"], "sources": ["source:src:doc1"]}], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=[], claims=[{"claim_id": "c1", "text": "alpha vendor pricing detail", "citations": []}])
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_coverage"], 0.0)

    def test_deleted_source_file_drops_coverage_even_if_still_cited(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha vendor pricing detail"}, expected={"findings": [{"id": "f1", "terms": ["pricing"], "sources": ["source:src:doc1"]}], "conflicts": [], "gaps": [], "traps": []})
        (case_dir / "sources" / "doc1.txt").unlink()
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=[], claims=[{"claim_id": "c1", "text": "alpha vendor pricing detail", "citations": ["source:src:doc1"]}])
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_coverage"], 0.0)


class HallucinationRateTests(_TempCaseTestCase):
    def test_well_formed_artifact_has_zero_hallucination(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=["source:src:doc1"])
        self.assertEqual(eval_score.score(case_dir, artifact)["hallucination_rate"], 0.0)

    def test_out_of_manifest_citation_raises_hallucination(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=["source:src:not-in-manifest"])
        self.assertEqual(eval_score.score(case_dir, artifact)["hallucination_rate"], 1.0)

    def test_zero_citation_node_counts_as_hallucination(self):
        case_dir = _build_case(self.base, "case", sources={"doc1": "alpha"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=[])
        self.assertEqual(eval_score.score(case_dir, artifact)["hallucination_rate"], 1.0)


class ContradictionDetectionTests(_TempCaseTestCase):
    def test_declared_conflict_matching_two_sources_is_detected(self):
        case_dir = _build_case(self.base, "case", sources={"a": "x", "b": "y"}, expected={"findings": [], "conflicts": [{"id": "c1", "terms": ["price"], "sources": ["source:src:a", "source:src:b"]}], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:a", "source:src:b"], summary_citations=[], conflicts=[{"text": "price disagreement", "citations": ["source:src:a", "source:src:b"]}])
        self.assertEqual(eval_score.score(case_dir, artifact)["contradiction_detection"], 1.0)

    def test_conflict_with_only_one_source_is_not_detected(self):
        case_dir = _build_case(self.base, "case", sources={"a": "x", "b": "y"}, expected={"findings": [], "conflicts": [{"id": "c1", "terms": ["price"], "sources": ["source:src:a", "source:src:b"]}], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:a", "source:src:b"], summary_citations=[], conflicts=[{"text": "price disagreement", "citations": ["source:src:a"]}])
        self.assertEqual(eval_score.score(case_dir, artifact)["contradiction_detection"], 0.0)


class GapHonestyTests(_TempCaseTestCase):
    def test_disclosed_gap_scores_full_honesty(self):
        case_dir = _build_case(self.base, "case", sources={}, expected={"findings": [], "conflicts": [], "gaps": [{"id": "g1", "terms": ["revenue"]}], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[], gaps=[{"text": "revenue is undisclosed", "needed_evidence": "financials"}])
        self.assertEqual(eval_score.score(case_dir, artifact)["gap_honesty"], 1.0)

    def test_undisclosed_gap_scores_zero_honesty(self):
        case_dir = _build_case(self.base, "case", sources={}, expected={"findings": [], "conflicts": [], "gaps": [{"id": "g1", "terms": ["revenue"]}], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[], gaps=[])
        self.assertEqual(eval_score.score(case_dir, artifact)["gap_honesty"], 0.0)


class TrapRejectionTests(_TempCaseTestCase):
    def test_uncited_trap_scores_full_rejection(self):
        case_dir = _build_case(self.base, "case", sources={"trap": "shop now"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": [{"source": "source:src:trap", "kind": "shopping_page"}]})
        artifact = _artifact(manifest_ids=["source:src:trap"], summary_citations=[])
        self.assertEqual(eval_score.score(case_dir, artifact)["trap_rejection"], 1.0)

    def test_cited_trap_drops_rejection_rate(self):
        case_dir = _build_case(self.base, "case", sources={"trap": "shop now"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": [{"source": "source:src:trap", "kind": "shopping_page"}]})
        artifact = _artifact(manifest_ids=["source:src:trap"], summary_citations=["source:src:trap"])
        self.assertEqual(eval_score.score(case_dir, artifact)["trap_rejection"], 0.0)

    def test_contradicting_sources_trap_kind_is_excluded_from_rejection(self):
        # A contradicting_sources trap SHOULD be cited (it is one side of a real conflict); citing it
        # must not lower trap_rejection the way citing a homonym/shopping_page/injection_sentence trap would.
        case_dir = _build_case(self.base, "case", sources={"trap": "conflicting figure"}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": [{"source": "source:src:trap", "kind": "contradicting_sources"}]})
        artifact = _artifact(manifest_ids=["source:src:trap"], summary_citations=["source:src:trap"])
        self.assertEqual(eval_score.score(case_dir, artifact)["trap_rejection"], 1.0)


class CostAndLatencyTests(_TempCaseTestCase):
    def test_cost_tokens_sums_input_and_output(self):
        case_dir = _build_case(self.base, "case", sources={}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[], usage={"input_tokens": 100, "output_tokens": 50})
        self.assertEqual(eval_score.score(case_dir, artifact)["cost_tokens"], 150.0)

    def test_latency_defaults_to_zero_when_absent(self):
        case_dir = _build_case(self.base, "case", sources={}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[])
        self.assertEqual(eval_score.score(case_dir, artifact)["latency_ms"], 0.0)

    def test_latency_reads_top_level_field_when_present(self):
        case_dir = _build_case(self.base, "case", sources={}, expected={"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[], latency_ms=2345.0)
        self.assertEqual(eval_score.score(case_dir, artifact)["latency_ms"], 2345.0)


class ExpectedYamlErrorTests(_TempCaseTestCase):
    def test_non_list_findings_raises_clear_error(self):
        case_dir = _build_case(self.base, "bad", sources={}, expected={"findings": "not-a-list", "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=[], summary_citations=[])
        with self.assertRaisesRegex(ValueError, "findings"):
            eval_score.score(case_dir, artifact)

    def test_non_mapping_top_level_raises_clear_error(self):
        case_dir = self.base / "bad2"
        (case_dir / "sources").mkdir(parents=True)
        (case_dir / "expected.yaml").write_text("- just\n- a\n- list\n", encoding="utf-8")
        artifact = _artifact(manifest_ids=[], summary_citations=[])
        with self.assertRaisesRegex(ValueError, "mapping"):
            eval_score.score(case_dir, artifact)


class VerdictTests(unittest.TestCase):
    def test_unset_threshold_is_never_pass_or_fail(self):
        self.assertEqual(eval_run.verdict("citation_coverage", 0.5, None), "UNSET")

    def test_higher_is_better_metric_fails_below_threshold(self):
        self.assertEqual(eval_run.verdict("citation_coverage", 0.4, 0.5), "FAIL")
        self.assertEqual(eval_run.verdict("citation_coverage", 0.6, 0.5), "PASS")

    def test_lower_is_better_metric_fails_above_threshold(self):
        self.assertEqual(eval_run.verdict("hallucination_rate", 0.2, 0.1), "FAIL")
        self.assertEqual(eval_run.verdict("hallucination_rate", 0.05, 0.1), "PASS")


class ChampionDeltaTests(unittest.TestCase):
    def test_champion_delta_is_zero_against_an_identical_prior_report(self):
        report = eval_run.build_report(None, None)
        key = next(iter(report["cases"]))
        rediffed = eval_run.build_report(None, report)
        self.assertEqual(rediffed["cases"][key]["metrics"]["citation_coverage"]["champion_delta"], 0.0)


class RunMainTests(unittest.TestCase):
    def test_golden_run_exits_zero_with_null_thresholds(self):
        with tempfile.TemporaryDirectory() as tmp:
            code = eval_run.main(["--golden", "--out", tmp])
            self.assertEqual(code, 0)
            self.assertTrue((Path(tmp) / "eval-report.json").exists())
            self.assertTrue((Path(tmp) / "eval-report.md").exists())


class MutationProofTests(unittest.TestCase):
    def test_delete_expected_source_mutation_turns_run_red(self):
        self.assertTrue(mutate.run_mutation("delete_expected_source", mutate.mutation_delete_expected_source, "citation_coverage"))

    def test_inject_out_of_manifest_mutation_turns_run_red(self):
        self.assertTrue(mutate.run_mutation("inject_out_of_manifest", mutate.mutation_inject_out_of_manifest, "hallucination_rate"))


class GoldenCasesTests(unittest.TestCase):
    def test_every_golden_case_is_hallucination_free_and_fully_covered(self):
        import json

        cases_root = EVAL_DIR / "cases"
        checked = 0
        for line_dir in sorted(p for p in cases_root.iterdir() if p.is_dir()):
            for case_dir in sorted(p for p in line_dir.iterdir() if p.is_dir()):
                artifact = json.loads((case_dir / "golden-output.json").read_text(encoding="utf-8"))
                metrics = eval_score.score(case_dir, artifact)
                self.assertEqual(metrics["hallucination_rate"], 0.0, case_dir)
                self.assertEqual(metrics["citation_coverage"], 1.0, case_dir)
                checked += 1
        self.assertEqual(checked, 9)

    def test_all_four_trap_kinds_are_represented_across_cases(self):
        cases_root = EVAL_DIR / "cases"
        kinds: set[str] = set()
        for line_dir in sorted(p for p in cases_root.iterdir() if p.is_dir()):
            for case_dir in sorted(p for p in line_dir.iterdir() if p.is_dir()):
                expected = yaml.safe_load((case_dir / "expected.yaml").read_text(encoding="utf-8"))
                kinds |= {t["kind"] for t in expected.get("traps", [])}
        self.assertEqual(kinds, {"homonym", "shopping_page", "injection_sentence", "contradicting_sources"})


if __name__ == "__main__":
    unittest.main()
