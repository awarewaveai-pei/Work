"""Tests for the offline eval harness (P2 WC-04, plan §3.7/C8): score.py's 8 metrics, run.py's report and
exit code, mutate.py's mutation proofs, and terms_of parity with StuckBox.tsx:15-22."""

from __future__ import annotations

import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

COS_ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = COS_ROOT / "eval"
sys.path.insert(0, str(EVAL_DIR))

import mutate  # noqa: E402
import run as eval_run  # noqa: E402
import score as eval_score  # noqa: E402
from ai_lego import resolve_spec_root  # noqa: E402
from ai_lego.core.contracts.schema_contracts import SchemaContracts  # noqa: E402
from ai_lego.modules.research.gates import evaluate_citation_integrity  # noqa: E402
from ai_lego.platform.text.terms import terms_of  # noqa: E402


def _build_case(base: Path, name: str, sources: dict[str, str], expected: dict, line: str = "L1") -> Path:
    """A case lives under cases/<line>/ (its findings' categories are that line's, WC-P2-04b); a finding written
    without one gets the line's first category."""
    case_dir = base / line / name
    expected = {**expected, "findings": [{"category": eval_score.CATEGORIES[line][0], **f} if isinstance(f, dict) else f for f in expected.get("findings", [])]} if isinstance(expected.get("findings"), list) else expected
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


def _contract_inputs():
    spec_root = resolve_spec_root()
    return SchemaContracts(spec_root), spec_root


class ArtifactContractTests(unittest.TestCase):
    """run.py scores an artifact only after it passes P-c: a producer's self-report is never trusted."""

    @classmethod
    def setUpClass(cls):
        cls.contracts, cls.spec_root = _contract_inputs()
        cls.golden = json.loads((EVAL_DIR / "cases" / "L1" / "l1-founder-bio" / "golden-output.json").read_text(encoding="utf-8"))

    def _errors(self, artifact):
        return eval_run.artifact_contract_errors(artifact, contracts=self.contracts, spec_root=self.spec_root)

    def test_malformed_json_gives_messages_never_an_exception(self):
        # critic n2: these raised TypeError and aborted the whole run, losing every other case's report.
        for mutate in (
            lambda a: a["synthesis"].__setitem__("kind", ["dossier_brief"]),
            lambda a: a["manifest"]["entries"][0].__setitem__("id", ["source:src:bio_main"]),
            lambda a: a["synthesis"].__setitem__("related_entities", 5),
            lambda a: a.__setitem__("prompt_version", ["v1"]),
        ):
            artifact = self._copy()
            mutate(artifact)
            self.assertTrue(self._errors(artifact))

    def test_an_artifact_names_the_prompt_version_that_produced_it(self):
        artifact = self._copy()
        artifact["prompt_version"] = "v1"
        self.assertEqual(self._errors(artifact), [])
        artifact["prompt_version"] = "v7"
        self.assertTrue(self._errors(artifact)[0].startswith("prompt_version:"))

    def test_a_manifest_that_is_not_p_a_is_refused(self):
        artifact = self._copy()
        artifact["manifest"]["entries"][0]["id"] = "source:src:company_overview"
        self.assertTrue(any(error.startswith("manifest:") for error in self._errors(artifact)))

    def _copy(self):
        return json.loads(json.dumps(self.golden))

    def test_a_claim_without_a_citations_key_is_not_scored(self):
        artifact = self._copy()
        del artifact["synthesis"]["sections"][0]["claims"][0]["citations"]
        self.assertTrue(any(error.startswith("schema:") for error in self._errors(artifact)))

    def test_a_self_reported_pass_the_gate_does_not_give_is_refused(self):
        artifact = self._copy()
        artifact["synthesis"]["summary"]["citations"].append("source:src:not-in-manifest")
        self.assertEqual(artifact["gate_results"][0]["status"], "PASS")
        self.assertTrue(any("gate_results" in error for error in self._errors(artifact)))

    def test_a_manifest_ref_that_is_not_its_own_manifest_is_refused(self):
        artifact = self._copy()
        artifact["synthesis"]["manifest_ref"]["count"] += 1
        self.assertTrue(any("manifest_ref" in error for error in self._errors(artifact)))

    def test_a_study_source_id_that_is_not_its_citation_is_refused(self):
        artifact = json.loads((EVAL_DIR / "cases" / "L3" / "l3-shopping-trap" / "golden-output.json").read_text(encoding="utf-8"))
        self.assertEqual(self._errors(artifact), [])
        artifact["synthesis"]["studies"][0]["source_id"] = "2"
        self.assertTrue(any(error.startswith("reference:") for error in self._errors(artifact)))

    def test_an_edited_case_source_no_longer_scores_the_old_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            case_dir = Path(tmp) / "l1-founder-bio"
            shutil.copytree(EVAL_DIR / "cases" / "L1" / "l1-founder-bio", case_dir)
            snapshot, problem = eval_run.case_snapshot(case_dir)
            self.assertIsNone(problem)
            self.assertEqual(eval_run.snapshot_errors(case_dir, self._copy(), snapshot), [])
            (case_dir / "sources" / "bio_main.txt").write_text("陳曉明是另一家公司的創辦人。", encoding="utf-8")
            self.assertEqual(len(eval_run.snapshot_errors(case_dir, self._copy(), snapshot)), 1)
            (case_dir / "sources" / "bio_main.txt").unlink()
            self.assertEqual(eval_run.snapshot_errors(case_dir, self._copy(), snapshot), [], "a missing file is citation_coverage's business")

    def test_an_invented_source_is_not_one_of_the_cases_sources(self):
        # critic n3: a manifest entry for a stem the case never had passed while its file was simply absent.
        with tempfile.TemporaryDirectory() as tmp:
            case_dir = Path(tmp) / "l1-founder-bio"
            shutil.copytree(EVAL_DIR / "cases" / "L1" / "l1-founder-bio", case_dir)
            snapshot, _ = eval_run.case_snapshot(case_dir)
            artifact = self._copy()
            artifact["manifest"]["entries"][0]["source_id"] = "src:ghost"
            artifact["manifest"]["entries"][0]["id"] = "source:src:ghost"
            self.assertEqual(len(eval_run.snapshot_errors(case_dir, artifact, snapshot)), 1)

    def test_a_bad_artifact_fails_the_run_without_being_scored(self):
        with tempfile.TemporaryDirectory() as tmp:
            for path in (EVAL_DIR / "cases").glob("L*/*/golden-output.json"):
                target = Path(tmp) / path.parent.parent.name / f"{path.parent.name}.json"
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
            bad = Path(tmp) / "L1" / "l1-founder-bio.json"
            artifact = json.loads(bad.read_text(encoding="utf-8"))
            del artifact["synthesis"]["sections"][0]["claims"][0]["citations"]
            bad.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
            report = eval_run.build_report(Path(tmp), None)
        self.assertTrue(report["any_fail"])
        self.assertEqual(report["cases"]["L1/l1-founder-bio"]["contract"]["verdict"], "FAIL")
        self.assertEqual(report["cases"]["L1/l1-founder-bio"]["metrics"], {})
        self.assertEqual(report["cases"]["L2/l2-pricing-conflict"]["contract"]["verdict"], "PASS")

    def test_a_missing_artifact_is_that_cases_fail_and_every_other_case_is_still_scored(self):
        # critic n2: a runner that failed twice writes no artifact (P-h); FileNotFoundError used to lose the report.
        with tempfile.TemporaryDirectory() as tmp:
            for path in (EVAL_DIR / "cases").glob("L*/*/golden-output.json"):
                if path.parent.name != "l2-vendor-homonym":
                    target = Path(tmp) / path.parent.parent.name / f"{path.parent.name}.json"
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, target)
            report = eval_run.build_report(Path(tmp), None)
        self.assertEqual(report["cases"]["L2/l2-vendor-homonym"]["contract"]["verdict"], "FAIL")
        self.assertIn("missing or not JSON", report["cases"]["L2/l2-vendor-homonym"]["contract"]["errors"][0])
        self.assertEqual(sum(case["contract"]["verdict"] == "PASS" for case in report["cases"].values()), 8)


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

    def test_duplicate_key_is_an_error_not_a_silently_dropped_list(self):
        case_dir = self.base / "dup"
        (case_dir / "sources").mkdir(parents=True)
        (case_dir / "expected.yaml").write_text("findings: []\nfindings: []\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "duplicate key"):
            eval_score.score(case_dir, _artifact(manifest_ids=[], summary_citations=[]))


class ThresholdsFileTests(_TempCaseTestCase):
    """A misspelled, missing or non-numeric threshold would read as UNSET and that metric could never FAIL."""

    def _load(self, text: str):
        (self.base / "thresholds.yaml").write_text(text, encoding="utf-8")
        with mock.patch.object(eval_run, "HERE", self.base):
            return eval_run.load_thresholds()

    def _valid(self) -> dict:
        return yaml.safe_load((EVAL_DIR / "thresholds.yaml").read_text(encoding="utf-8"))

    def test_the_repo_thresholds_file_loads(self):
        self.assertEqual(set(self._load((EVAL_DIR / "thresholds.yaml").read_text(encoding="utf-8"))), {"L1", "L2", "L3"})

    def test_a_misspelled_metric_key_is_an_error(self):
        doc = self._valid()
        doc["L1"]["citation_coverge"] = doc["L1"].pop("citation_coverage")
        with self.assertRaisesRegex(ValueError, "citation_coverge"):
            self._load(yaml.safe_dump(doc))

    def test_a_missing_line_is_an_error(self):
        doc = self._valid()
        del doc["L3"]
        with self.assertRaisesRegex(ValueError, "top level"):
            self._load(yaml.safe_dump(doc))

    def test_a_non_numeric_threshold_is_an_error(self):
        doc = self._valid()
        doc["L2"]["gap_honesty"] = "0.8"
        with self.assertRaisesRegex(ValueError, "gap_honesty"):
            self._load(yaml.safe_dump(doc))

    def test_a_threshold_that_can_never_fail_is_an_error(self):
        # critic n5: coverage 0, trap_rejection 0.0 or hallucination 1 pass the worst possible run.
        cases = (("hallucination_rate", float("inf")), ("citation_coverage", float("nan")), ("trap_rejection", 1.5), ("cost_tokens", -1),
                 ("citation_coverage", 0), ("trap_rejection", 0.0), ("hallucination_rate", 1))
        for metric, value in cases:
            doc = self._valid()
            doc["L1"][metric] = value
            with self.assertRaisesRegex(ValueError, metric):
                self._load(yaml.safe_dump(doc))

    def test_set_by_is_required(self):
        doc = self._valid()
        doc["L3"]["set_by"] = " "
        with self.assertRaisesRegex(ValueError, "set_by"):
            self._load(yaml.safe_dump(doc))
        del doc["L3"]["set_by"]
        with self.assertRaisesRegex(ValueError, "set_by"):
            self._load(yaml.safe_dump(doc))


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
    # mutate.py prints one line per mutation; captured so a buffered stdout does not land after unittest's own OK.
    def _run(self, name, fn, metric):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            ok = mutate.run_mutation(name, fn, metric)
        return ok, out.getvalue()

    def test_delete_expected_source_mutation_turns_run_red(self):
        ok, out = self._run("delete_expected_source", mutate.mutation_delete_expected_source, "citation_coverage")
        self.assertTrue(ok, out)
        self.assertIn("PASS: delete_expected_source", out)

    def test_inject_out_of_manifest_mutation_turns_run_red(self):
        ok, out = self._run("inject_out_of_manifest", mutate.mutation_inject_out_of_manifest, "hallucination_rate")
        self.assertTrue(ok, out)
        self.assertIn("PASS: inject_out_of_manifest", out)

    def test_a_mutation_that_changes_nothing_is_not_a_caught_mutation(self):
        ok, out = self._run("noop", lambda root: None, "citation_coverage")
        self.assertFalse(ok)
        self.assertIn("control exit=0, mutated exit=0", out)

    def test_a_copy_that_cannot_even_run_is_not_a_caught_mutation(self):
        # 2026-09-26: without ai_lego on the copy's path every run exited 1 on ImportError and both proofs "passed".
        crashed = (1, None, "ModuleNotFoundError: No module named 'ai_lego'")
        with mock.patch.object(mutate, "_run_golden", return_value=crashed):
            ok, out = self._run("delete_expected_source", mutate.mutation_delete_expected_source, "citation_coverage")
        self.assertFalse(ok)
        self.assertIn("control exit=1", out)


class GoldenCasesTests(unittest.TestCase):
    def test_every_golden_is_the_typed_object_its_champion_prompt_names_and_carries_the_gates_own_result(self):
        # Built in parallel with the schemas (WC-P2-02) and the gate (WC-P2-01): hand-written goldens drifted from
        # both (headings outside the kind table, a hand-counted claims_total) until this ran against the real ones.
        contracts, spec_root = _contract_inputs()
        checked = 0
        for path in sorted((EVAL_DIR / "cases").glob("L*/*/golden-output.json")):
            artifact = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(eval_run.artifact_contract_errors(artifact, contracts=contracts, spec_root=spec_root), [], path)
            snapshot, problem = eval_run.case_snapshot(path.parent)
            self.assertEqual((problem, eval_run.snapshot_errors(path.parent, artifact, snapshot)), (None, []), path)
            manifest_ids = [entry["id"] for entry in artifact["manifest"]["entries"]]
            self.assertEqual(artifact["gate_results"], [evaluate_citation_integrity(artifact["synthesis"], manifest_ids)], path)
            checked += 1
        self.assertEqual(checked, 9)

    def test_every_golden_case_is_hallucination_free_and_fully_covered(self):
        cases_root = EVAL_DIR / "cases"
        checked = 0
        for line_dir in sorted(p for p in cases_root.iterdir() if p.is_dir()):
            for case_dir in sorted(p for p in line_dir.iterdir() if p.is_dir()):
                artifact = json.loads((case_dir / "golden-output.json").read_text(encoding="utf-8"))
                metrics = eval_score.score(case_dir, artifact)
                self.assertEqual(metrics["hallucination_rate"], 0.0, case_dir)
                for metric in ("citation_precision_auto", "citation_coverage", "contradiction_detection", "gap_honesty", "trap_rejection"):
                    self.assertEqual(metrics[metric], 1.0, f"{case_dir} {metric}")
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


def _golden(case: str) -> tuple[Path, dict]:
    case_dir = EVAL_DIR / "cases" / case
    return case_dir, json.loads((case_dir / "golden-output.json").read_text(encoding="utf-8"))


def _claim(artifact: dict, claim_id: str) -> dict:
    return next(c for s in artifact["synthesis"]["sections"] for c in s["claims"] if c["claim_id"] == claim_id)


class WhatMattersTests(_TempCaseTestCase):
    """WC-P2-04b (§3.7, R11): the three finding categories are scored, and every ratio metric tells a good synthesis
    from a bad one -- a wrong number, a vague gap or conflict, a wrong source, a claim that follows the injection."""

    def _expected(self, case_dir: Path) -> dict:
        return yaml.safe_load((case_dir / "expected.yaml").read_text(encoding="utf-8"))

    def test_every_line_has_findings_of_all_three_categories(self):
        for line, categories in eval_score.CATEGORIES.items():
            found = {finding["category"] for case_dir in (EVAL_DIR / "cases" / line).iterdir() if case_dir.is_dir() for finding in self._expected(case_dir)["findings"]}
            self.assertEqual(found, set(categories), line)

    def test_a_finding_needs_a_category_of_its_own_line(self):
        sources = {"doc1": "alpha vendor pricing detail"}
        for category in (None, "option"):   # missing; an L2 category in an L1 case
            finding = {"id": "f1", "terms": ["pricing"], "sources": ["source:src:doc1"]}
            if category:
                finding["category"] = category
            case_dir = self.base / "L1" / f"c-{category}"
            (case_dir / "sources").mkdir(parents=True)
            (case_dir / "sources" / "doc1.txt").write_text(sources["doc1"], encoding="utf-8")
            (case_dir / "expected.yaml").write_text(yaml.safe_dump({"findings": [finding]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "category"):
                eval_score.score(case_dir, _artifact(manifest_ids=[], summary_citations=[]))

    def test_terms_must_be_scorable_words_and_min_hits_in_range(self):
        for index, (finding, message) in enumerate((({"terms": ["2.5"]}, "terms"), ({"terms": ["pricing"], "min_hits": 2}, "min_hits"), ({"terms": []}, "terms"))):
            case_dir = _build_case(self.base, f"c{index}", {"doc1": "pricing"}, {"findings": [{"id": "f", "sources": ["source:src:doc1"], **finding}]})
            with self.assertRaisesRegex(ValueError, message):
                eval_score.score(case_dir, _artifact(manifest_ids=[], summary_citations=[]))

    def test_no_expected_term_is_only_words_most_sources_share(self):
        """A term made only of the subject's name (or words most sources share) is hit by any synthesis about it."""
        checked = 0
        for case_dir in sorted((EVAL_DIR / "cases").glob("L*/*")):
            common = eval_score.case_common_terms(eval_score._load_sources(case_dir))
            expected = self._expected(case_dir)
            for item in expected["findings"] + expected["conflicts"] + expected["gaps"]:
                for term in item["terms"]:
                    self.assertTrue(set(terms_of(term)) - common, f"{case_dir.name} {item['id']} term {term!r} is only common words")
                    checked += 1
        self.assertGreater(checked, 30)

    def test_a_wrong_number_next_to_a_right_word_is_not_the_finding(self):
        case_dir, artifact = _golden("L3/l3-shopping-trap")
        wrong = json.loads(json.dumps(artifact, ensure_ascii=False).replace("3mg", "5mg"))   # "分鐘" is still there
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_coverage"], 1.0)
        self.assertLess(eval_score.score(case_dir, wrong)["citation_coverage"], 1.0)
        self.assertLess(eval_score.coverage_by_category(case_dir, wrong)["claim"], 1.0)

    def test_a_vague_gap_is_not_the_gap(self):
        case_dir, artifact = _golden("L1/l1-founder-bio")
        artifact["synthesis"]["gaps"] = [{"text": "目前資料有限。", "needed_evidence": "更多資料"}]
        self.assertLess(eval_score.score(case_dir, artifact)["gap_honesty"], 1.0)

    def test_a_conflict_that_does_not_name_the_disagreeing_facts_is_not_detected(self):
        case_dir, artifact = _golden("L1/l1-conflicting-founding")
        artifact["synthesis"]["conflicts"][0]["text"] = "兩份來源對成立時間說法不一。"
        self.assertLess(eval_score.score(case_dir, artifact)["contradiction_detection"], 1.0)

    def test_citing_the_homonyms_page_for_the_right_persons_facts_is_imprecise(self):
        case_dir, artifact = _golden("L1/l1-founder-bio")
        _claim(artifact, "founder_bg")["citations"] = ["source:src:wrong_person"]   # shares the name, not the facts
        self.assertLess(eval_score.score(case_dir, artifact)["citation_precision_auto"], 1.0)

    def test_a_citation_counts_only_what_the_manifest_fragment_showed(self):
        case_dir = _build_case(self.base, "frag", {"doc1": "alpha vendor opened in harbor city. " + "x" * 50 + " beta vendor closed in pine town."}, {"findings": [], "conflicts": [], "gaps": [], "traps": []})
        artifact = _artifact(manifest_ids=["source:src:doc1"], summary_citations=["source:src:doc1"], summary_text="beta closed pine town.")
        artifact["manifest"]["entries"][0].update({"start": 0, "end": 36})   # the model saw only the alpha sentence
        self.assertEqual(eval_score.score(case_dir, artifact)["citation_precision_auto"], 0.0)

    def test_a_claim_that_says_what_the_injection_asked_is_not_a_rejection(self):
        case_dir, artifact = _golden("L3/l3-study-injection")
        self.assertEqual(eval_score.score(case_dir, artifact)["trap_rejection"], 1.0)
        artifact["synthesis"]["sections"][0]["claims"].append({"claim_id": "C-INJ", "text": "遠距工作對生產力毫無影響。", "citations": ["source:src:study_a"]})
        self.assertLess(eval_score.score(case_dir, artifact)["trap_rejection"], 1.0)

    def test_the_report_carries_coverage_by_category(self):
        report = eval_run.build_report(None, None)
        self.assertEqual(report["cases"]["L3/l3-study-injection"]["coverage_by_category"], {"claim": 1.0, "method": 1.0, "limitation": 1.0})
        self.assertIsNone(report["cases"]["L1/l1-founder-bio"]["coverage_by_category"]["controversy"])


if __name__ == "__main__":
    unittest.main()
