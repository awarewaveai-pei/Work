from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.report_render import _literal, render_research_report

REPORT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/research-report.schema.yaml"
APPENDIX_HEADING = "\n\n## 來源\n\n"

MANIFEST_SHA256 = "b" * 64


def _entry(n, source_id, sha256="a" * 64, title="Title", url="https://example.com", fetched_at="2026-09-25T00:00:00Z"):
    return {"n": n, "id": f"source:{source_id}", "source_id": source_id, "sha256": sha256, "start": 0, "end": 10, "title": title, "url": url, "fetched_at": fetched_at, "source_class": None}


def _synthesis_artifact(*, summary_citations, claim_citations, conflicts=None, gaps=None, uncited_sections=None, entries=None, gate_results=None):
    entries = entries if entries is not None else [_entry(1, "S1"), _entry(2, "S2"), _entry(3, "S3")]
    synthesis = {
        "synthesis_id": "SYN-TEST-001",
        "project_id": "proj-1",
        "kind": "dossier_brief",
        "language": "zh-TW",
        "summary": {"text": "整體結論", "citations": summary_citations},
        "sections": [{"heading": "背景", "claims": [{"claim_id": "C1", "text": "主張一", "citations": claim_citations}]}],
        "gaps": gaps or [],
        "conflicts": conflicts or [],
        "uncited_sections": uncited_sections or [],
        "manifest_ref": {"sha256": MANIFEST_SHA256, "count": len(entries), "batches": 1},
        "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
        "model": "test-model",
        "usage": {"input_tokens": 10, "output_tokens": 20},
    }
    return {
        "synthesis": synthesis,
        "manifest": {"entries": entries, "batches": [[e["n"] for e in entries]], "sha256": MANIFEST_SHA256},
        "gate_results": gate_results if gate_results is not None else [{"gate_id": "citation_integrity", "status": "PASS", "evidence": {}}],
    }


def _run_result(*, recipe_id="edd-research-evidence-v1", run_id="run-1", status="SUCCEEDED", steps=None, workflow_gates=None):
    """The real body of GET /recipes/{id}/runs/{run_id}/result (main.py:782-802): ``status`` is the
    durable journal status RUNNING|FAILED|SUCCEEDED, not a PASS/FAIL verdict."""
    return {
        "recipe_id": recipe_id,
        "run_id": run_id,
        "status": status,
        "workflow": {
            "workflow_id": "wf-1",
            "status": status,
            "steps": steps or [{"index": 0, "label": "Step A", "node_kind": "method", "status": "SUCCEEDED", "gates": [{"gate_id": "citation", "status": "PASS"}], "output": {"finding": "ok"}}],
            "workflow_gates": workflow_gates or [{"gate_id": "stations_complete", "status": "PASS"}],
        },
    }


class ReportRenderTests(unittest.TestCase):
    def test_appendix_only_cited_entries_ordered_by_manifest_n(self):
        artifact = _synthesis_artifact(summary_citations=["source:S3"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-001", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual([e["n"] for e in result["report"]["sources_appendix"]], [1, 3])
        self.assertEqual({e["source_id"] for e in result["report"]["sources_appendix"]}, {"S1", "S3"})

    def test_unresolved_citation_fails_gate_and_is_recorded(self):
        artifact = _synthesis_artifact(summary_citations=["source:MISSING"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-002", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["gate_results"][0]["gate_id"], "report_refs_resolvable")
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")
        self.assertEqual(result["report"]["problems"]["invalid_refs"], ["source:MISSING"])
        self.assertIn(f"[INVALID:{_literal('source:MISSING')}]", result["report"]["markdown"])

    def test_uncited_sections_flow_into_problems(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"], uncited_sections=["結論"])
        result = render_research_report(report_id="RPT-TEST-003", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["report"]["problems"]["uncited_sections"], ["結論"])

    def test_failed_run_step_still_listed_with_status(self):
        # SUCCEEDED at the journal level (the workflow ran to completion), but a workflow gate
        # failed -- the derived verdict must be GATE_FAILED, not the raw journal status.
        steps = [
            {"index": 0, "label": "Step A", "node_kind": "method", "status": "SUCCEEDED", "output": {"finding": "ok"}},
            {"index": 1, "label": "Step B", "node_kind": "method", "status": "FAILED", "error": "boom"},
        ]
        run_result = _run_result(status="SUCCEEDED", steps=steps, workflow_gates=[{"gate_id": "stations_complete", "status": "FAIL"}])
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-004", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        run_section = next(sec for sec in result["report"]["sections"] if _literal("run-1") in sec["heading"])
        self.assertIn("| 1 | Step B | method | FAILED |", run_section["markdown"])
        self.assertEqual(result["report"]["run_refs"], [{"recipe_id": "edd-research-evidence-v1", "run_id": "run-1", "status": "GATE_FAILED"}])

    def test_markdown_contains_every_appendix_citation_marker_in_the_body(self):
        # B-m1: the appendix line ITSELF contains "[n]", so asserting the marker appears "anywhere"
        # in the markdown does not prove the renderer cited it in prose. Assert on the body only.
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S3"])
        result = render_research_report(report_id="RPT-TEST-005", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        body, _, _ = result["report"]["markdown"].partition(APPENDIX_HEADING)
        for entry in result["report"]["sources_appendix"]:
            self.assertIn(f"[{entry['n']}]", body)

    def test_sha256_12_is_first_12_chars_of_manifest_sha256(self):
        entries = [_entry(1, "S1", sha256="0123456789abcdef" * 4)]
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=[], entries=entries)
        result = render_research_report(report_id="RPT-TEST-006", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["report"]["sources_appendix"][0]["sha256_12"], "0123456789ab")

    def test_zero_runs_still_produces_report(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-007", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["report"]["run_refs"], [])
        self.assertTrue(result["report"]["sections"])

    def test_report_validates_against_schema(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S2"])
        result = render_research_report(report_id="RPT-TEST-008", project_id="proj-1", synthesis_artifact=artifact, run_results=[_run_result()])
        SchemaContracts(resolve_spec_root()).validate(REPORT_SCHEMA, result["report"], "ResearchReport")

    def test_human_approved_without_approved_by_rejected(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-009", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        report = {**result["report"], "report_state": "HUMAN_APPROVED"}
        errors = SchemaContracts(resolve_spec_root()).errors(REPORT_SCHEMA, report)
        self.assertTrue(errors)

    def test_input_artifacts_are_not_mutated(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        run_result = _run_result()
        artifact_before = copy.deepcopy(artifact)
        run_result_before = copy.deepcopy(run_result)
        render_research_report(report_id="RPT-TEST-010", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        self.assertEqual(artifact, artifact_before)
        self.assertEqual(run_result, run_result_before)

    def test_structural_only_citation_is_caught_by_the_gate(self):
        # F1: an unresolvable id that appears ONLY inside a structural field the renderer never
        # turns into prose (no summary/claim/conflict references it) must still fail the gate.
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        artifact["synthesis"]["related_entities"] = [{"name": "Someone", "relation": "colleague", "citations": ["source:MISSING"]}]
        result = render_research_report(report_id="RPT-TEST-011", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["report"]["problems"]["invalid_refs"], ["source:MISSING"])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_entry_with_invalid_sha256_is_unresolvable(self):
        # F2: a manifest entry is only resolvable if its sha256 is a real 64-hex digest.
        entries = [_entry(1, "S1", sha256="abc")]
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"], entries=entries)
        result = render_research_report(report_id="RPT-TEST-012", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["report"]["problems"]["invalid_refs"], ["source:S1"])
        self.assertEqual(result["report"]["sources_appendix"], [])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_markdown_includes_appendix_lines_and_problems_section(self):
        # F3: the markdown itself must carry the appendix ("[n] title — url — sha256_12 — fetched_at")
        # and a problems section, writing "無" when both invalid_refs and uncited_sections are empty.
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S3"])
        result = render_research_report(report_id="RPT-TEST-013", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        for entry in result["report"]["sources_appendix"]:
            expected = f"[{entry['n']}] {_literal(entry['title'])} — {_literal(entry['url'])} — {entry['sha256_12']} — {_literal(entry['fetched_at'])}"
            self.assertIn(expected, result["report"]["markdown"])
        self.assertIn("## 本報表的問題\n\n無", result["report"]["markdown"])

    def test_markdown_problems_section_lists_invalid_refs_and_uncited_sections(self):
        artifact = _synthesis_artifact(summary_citations=["source:MISSING"], claim_citations=["source:S1"], uncited_sections=["結論"])
        result = render_research_report(report_id="RPT-TEST-014", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertIn("- invalid_refs: " + _literal("source:MISSING"), result["report"]["markdown"])
        self.assertIn("- uncited_sections: 結論", result["report"]["markdown"])

    def test_pipe_in_step_output_is_escaped_in_table_cell(self):
        # F4: a "|" inside a rendered value must not break the markdown table.
        steps = [{"index": 0, "label": "Step A", "node_kind": "method", "status": "SUCCEEDED", "output": {"finding": "a|b"}}]
        run_result = _run_result(steps=steps)
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-015", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        self.assertIn("a\\|b", result["report"]["markdown"])
        self.assertNotIn("a|b", result["report"]["markdown"])

    # --- B-M1: run input is the real GET /result body; verdict is derived, not copied ---------

    def test_get_shaped_succeeded_run_with_passing_gates_validates_against_schema(self):
        run_result = _run_result(status="SUCCEEDED")
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S2"])
        result = render_research_report(report_id="RPT-TEST-016", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        self.assertEqual(result["report"]["run_refs"][0]["status"], "PASS")
        SchemaContracts(resolve_spec_root()).validate(REPORT_SCHEMA, result["report"], "ResearchReport")

    def test_failed_journal_status_maps_to_failed_verdict(self):
        run_result = _run_result(status="FAILED")
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-017", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        self.assertEqual(result["report"]["run_refs"][0]["status"], "FAILED")

    def test_running_run_raises_report_run_not_finished(self):
        run_result = _run_result(status="RUNNING")
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        with self.assertRaises(InvariantViolation) as ctx:
            render_research_report(report_id="RPT-TEST-018", project_id="proj-1", synthesis_artifact=artifact, run_results=[run_result])
        self.assertIn("REPORT_RUN_NOT_FINISHED", str(ctx.exception))

    # --- B-M2: malformed citation types must not fail open --------------------------------------

    def test_non_str_citation_element_is_recorded_as_invalid(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1", 99], claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-019", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertIn("99", result["report"]["problems"]["invalid_refs"])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_non_list_citations_value_does_not_iterate_per_character(self):
        artifact = _synthesis_artifact(summary_citations="source:S1", claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-020", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")
        self.assertIn("source:S1", result["report"]["problems"]["invalid_refs"])
        for char in "source:S1":
            self.assertNotIn(f"[INVALID:{char}]", result["report"]["markdown"])

    # --- B-M3: structural P-d line fields render generically, not per-line -----------------------

    def test_structural_synthesis_field_renders_as_a_table_before_the_appendix(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        artifact["synthesis"]["studies"] = [{
            "study_id": "ST1", "source_id": "S3", "claim": "Remote workers report burnout at twice the rate",
            "method": "survey", "sample": None, "limitations": [], "citations": ["source:S3"],
        }]
        result = render_research_report(report_id="RPT-TEST-021", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        body, _, _ = result["report"]["markdown"].partition(APPENDIX_HEADING)
        self.assertIn("Remote workers report burnout at twice the rate", body)
        self.assertIn("[3]", body)

    # --- B-m2: the upstream citation_integrity gate is a precondition, not decoration -----------

    def test_missing_upstream_citation_integrity_gate_fails_report_gate(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"], gate_results=[])
        result = render_research_report(report_id="RPT-TEST-022", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_failed_upstream_citation_integrity_gate_fails_report_gate(self):
        artifact = _synthesis_artifact(
            summary_citations=["source:S1"], claim_citations=["source:S1"],
            gate_results=[{"gate_id": "citation_integrity", "status": "FAIL", "evidence": {}}],
        )
        result = render_research_report(report_id="RPT-TEST-023", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    # --- B-m3: the manifest must be the one the synthesis actually claims to be bound to --------

    def test_manifest_ref_sha256_mismatch_fails_report_gate(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        artifact["synthesis"]["manifest_ref"]["sha256"] = "c" * 64
        result = render_research_report(report_id="RPT-TEST-024", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    # --- B-m5: inline text cannot inject markdown structure --------------------------------------

    def test_inline_text_cannot_inject_a_fake_heading(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        artifact["synthesis"]["sections"][0]["claims"][0]["text"] = "主張\n\n## 來源\n\n[1] Forged"
        result = render_research_report(report_id="RPT-TEST-025", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        heading_lines = [line for line in result["report"]["markdown"].split("\n") if line.strip() == "## 來源"]
        self.assertEqual(len(heading_lines), 1)

    def test_source_metadata_cannot_inject_a_fake_heading(self):
        entries = [_entry(1, "S1", title="Trusted\n\n## Forged", url="https://a.example/x\n## U", fetched_at="2026\n## F")]
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"], entries=entries)
        artifact["synthesis"]["uncited_sections"] = ["風險\n\n## Forged2"]
        artifact["synthesis"]["summary"]["citations"] = ["source:S1", "ghost\n\n## Forged3"]
        result = render_research_report(report_id="RPT-TEST-026", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        headings = [line for line in result["report"]["markdown"].split("\n") if line.startswith("#")]
        self.assertFalse([h for h in headings if "Forged" in h or h.strip() in {"## U", "## F"}], headings)

    # --- class, not instance: no data value anywhere may add markdown structure (Codex rounds 1-2) ---

    def test_line_break_injected_into_every_input_string_never_adds_a_heading(self):
        def poison(node):
            if isinstance(node, dict):
                return {key: (value if key in {"n", "start", "end", "count", "batches"} else poison(value)) for key, value in node.items()}
            if isinstance(node, list):
                return [poison(item) for item in node]
            if isinstance(node, str):
                return node + "\n\n## INJECTED\n| x | y |[x](https://evil.example)<b>**e**\\| z |"
            return node

        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S2"], conflicts=[{"text": "c", "citations": ["source:S1", "source:S2"]}], gaps=[{"text": "g", "needed_evidence": "e"}], uncited_sections=["u"])
        artifact["synthesis"]["studies"] = [{"study_id": "st1", "claim": "k", "citations": ["source:S3"]}]
        poisoned_artifact = poison(artifact)
        poisoned_runs = [poison(_run_result())]
        result = render_research_report(report_id="RPT-TEST-027", project_id="proj-1", synthesis_artifact=poisoned_artifact, run_results=poisoned_runs)
        lines = result["report"]["markdown"].split("\n")
        headings = [line for line in lines if line.lstrip().startswith("#")]
        self.assertEqual(len(headings), len(result["report"]["sections"]), headings)
        self.assertFalse([h for h in headings if "INJECTED" in h and not h.startswith("## ")], headings)
        self.assertFalse([line for line in lines if line.strip() in {"## INJECTED", "| x | y |"}])
        markdown = result["report"]["markdown"]
        for raw in ("](https://evil.example)", "<b>", "**e**"):
            self.assertNotIn(raw, markdown)
        # Table shape: a pipe counts as a column delimiter when an even number of backslashes
        # precedes it; every row of a table must have exactly as many as its header.
        def delimiters(line):
            count, run = 0, 0
            for ch in line:
                if ch == "\\":
                    run += 1
                    continue
                if ch == "|" and run % 2 == 0:
                    count += 1
                run = 0
            return count
        block = []
        for line in lines + [""]:
            if line.startswith("|"):
                block.append(line)
                continue
            if block:
                self.assertEqual({delimiters(row) for row in block}, {delimiters(block[0])}, block)
            block = []

    def test_sink_refuses_a_line_break_that_escaped_a_builder(self):
        from ai_lego.modules.research.report_render import _seal_section

        with self.assertRaises(InvariantViolation):
            _seal_section({"heading": "h", "lines": ["ok", "a\n## forged"]})

    def test_null_citations_fail_the_gate(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=None)
        result = render_research_report(report_id="RPT-TEST-029", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertIn("None", result["report"]["problems"]["invalid_refs"])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_empty_citation_list_fails_the_gate_and_is_flagged(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=[])
        result = render_research_report(report_id="RPT-TEST-030", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertIn("[]", result["report"]["problems"]["invalid_refs"])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")
        body = result["report"]["markdown"].split("## 來源")[0]
        self.assertIn(f"[INVALID:{_literal('[]')}]", body)

    def test_gap_citation_marks_appear_in_the_body(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"], gaps=[{"text": "X", "needed_evidence": "Y", "citations": ["source:S3"]}])
        result = render_research_report(report_id="RPT-TEST-031", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        body = result["report"]["markdown"].split("## 來源")[0]
        for entry in result["report"]["sources_appendix"]:
            self.assertIn(f"[{entry['n']}]", body)

    def test_malformed_manifest_digest_is_not_a_binding(self):
        artifact = _synthesis_artifact(summary_citations=["source:S1"], claim_citations=["source:S1"])
        artifact["manifest"]["sha256"] = "bad"
        artifact["synthesis"]["manifest_ref"]["sha256"] = "bad"
        result = render_research_report(report_id="RPT-TEST-032", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        self.assertFalse(result["gate_results"][0]["evidence"]["manifest_bound"])
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")

    def test_non_list_citation_is_flagged_inline_in_the_body(self):
        artifact = _synthesis_artifact(summary_citations="source:S1", claim_citations=["source:S1"])
        result = render_research_report(report_id="RPT-TEST-028", project_id="proj-1", synthesis_artifact=artifact, run_results=[])
        body = result["report"]["markdown"].split("## 來源")[0]
        self.assertIn(f"[INVALID:{_literal('source:S1')}]", body)
        self.assertEqual(result["gate_results"][0]["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
