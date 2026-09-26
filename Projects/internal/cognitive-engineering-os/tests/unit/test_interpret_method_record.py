from __future__ import annotations

import json
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.interpret_method_record import (
    INTERPRET_MAX_TOKENS,
    build_prompt_manifest,
    detail_problems,
    prefill_map,
    evaluate_interpretation_gates,
    record_leaf_paths,
    record_sha256,
    run_interpretation,
    visual_kind,
)
from ai_lego.platform.ai_gateway.provider import AiCompletion


RECORD = {"events": ["release incidents"], "patterns": ["weekly spike"]}
CONTRACT = {"family": "systems", "purpose": ["explain"], "recommended_next": ["systems.leverage_point_analysis"]}


def valid_response() -> str:
    return json.dumps({
        "findings": [{"id": "F1", "title": "Pattern", "text": "The spike repeats.", "citations": ["r/patterns/0"], "confidence": {"level": "mid", "reason": "The record contains one repeated pattern."}}],
        "visual": {"kind": "layered", "bindings": {"levels": [{"label": "r/patterns/0", "path": "r/patterns/0"}]}},
        "next_methods": ["systems.leverage_point_analysis"],
        "next_steps": [], "data_thickness": {"lowest": "patterns"}, "recommendations": [], "gaps": [],
    })


class FakeProvider:
    model = "fake"

    def __init__(self, responses: list[str]):
        self.responses = responses
        self.calls = 0
        self.requests: list[tuple[str, str, int]] = []

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion:
        self.requests.append((system, user, max_tokens))
        text = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return AiCompletion(text=text, model=self.model, input_tokens=10, output_tokens=20)


class InterpretationTests(unittest.TestCase):
    def test_prompt_language_catalog_and_token_budget(self):
        provider = FakeProvider([valid_response()])
        run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={"name_zh": "冰山模型"}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-PROMPT-001", catalog_lines=["systems.iceberg_model — 冰山模型"])
        self.assertIn("zh-TW", provider.requests[0][1])
        self.assertIn("systems.iceberg_model — 冰山模型", provider.requests[0][1])
        self.assertIn("every next_steps.method_id must also appear in next_methods", provider.requests[0][1])
        shape = json.loads(provider.requests[0][1].split("OUTPUT JSON SHAPE: ", 1)[1].split("\n\nRULES:", 1)[0])
        self.assertNotIn("revision_conditions", shape)
        self.assertIn("revision_conditions", shape["findings"][0])
        self.assertIn("est_cost", shape["next_steps"][0])
        self.assertEqual(set(shape["recommendations"][0]), {"level", "action", "expected", "citations"})
        self.assertEqual(set(shape["gaps"][0]), {"text", "needed_evidence"})
        self.assertEqual(shape["visual"]["bindings"]["levels"][0]["path"], "r/events")
        self.assertEqual(provider.requests[0][2], INTERPRET_MAX_TOKENS)
        self.assertEqual(set(shape) >= {"summary", "units", "focus", "priority", "solutions", "loop", "trend"}, True)   # the result page's sections (schema 1.1.0)
        self.assertIn("every point's value must appear in the text of the manifest id it cites", provider.requests[0][1])

    def test_prefill_map_same_name_and_missing(self):
        prefill, needs_input = prefill_map({"properties": {"patterns": {"type": "array"}, "missing": {"type": "string"}}}, build_prompt_manifest(RECORD))
        self.assertEqual(prefill, {"patterns": "r/patterns"})
        self.assertEqual(needs_input, ["missing"])
    def test_record_hash_is_canonical(self):
        self.assertEqual(record_sha256({"b": 2, "a": 1}), record_sha256({"a": 1, "b": 2}))

    def test_nested_leaf_path_exists(self):
        self.assertIn("r/r", record_leaf_paths({"r": {}}))
        self.assertIn("r/patterns/0", record_leaf_paths(RECORD))

    def test_manifest_contains_record_and_project_sources(self):
        manifest = build_prompt_manifest(RECORD, [{"source_id": "S1", "content_sha256": "abc"}])
        self.assertIn("r/patterns/0", {item["id"] for item in manifest})
        self.assertIn("source:S1", {item["id"] for item in manifest})

    def test_manifest_excludes_system_keys(self):
        manifest = build_prompt_manifest({**RECORD, "id": "x", "version": 1, "provenance": {}, "generated_by_method": "x"})
        ids = {item["id"] for item in manifest}
        self.assertNotIn("r/id", ids)
        self.assertNotIn("r/version", ids)
        self.assertNotIn("r/provenance", ids)
        self.assertNotIn("r/generated_by_method", ids)
        self.assertNotIn("r", ids)
        self.assertIn("r/events/0", ids)

    def test_visual_kind_uses_override(self):
        self.assertEqual(visual_kind(resolve_spec_root(), "systems.iceberg_model", CONTRACT), "layered")
        self.assertEqual(visual_kind(resolve_spec_root(), "decision.eisenhower_matrix", {"family": "decision"}), "quadrant")

    def test_citation_out_of_manifest_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/nope"]}], "visual": {"bindings": {}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[0]["status"], "FAIL")

    def test_visual_binding_out_of_record_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"bindings": {"path": "r/missing"}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[1]["status"], "FAIL")

    def test_bare_binding_path_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"bindings": {"path": "events/0"}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[1]["status"], "FAIL")

    def test_generic_binding_label_is_not_exempt_from_path_gate(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"kind": "graph", "bindings": {"label": "r/missing"}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[1]["status"], "FAIL")
        self.assertIn("r/missing", result[1]["evidence"]["paths"])

    def test_layered_level_label_is_display_text_not_path(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"kind": "layered", "bindings": {"levels": [{"label": "Events", "path": "r/events/0"}]}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[1]["status"], "PASS")
        self.assertEqual(result[1]["evidence"]["paths"], ["r/events/0"])

    def test_next_method_out_of_catalog_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"bindings": {}}, "next_methods": ["fake.missing"]}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[2]["status"], "FAIL")

    def test_orphan_next_step_repair_is_explicit(self):
        orphan = json.loads(valid_response())
        orphan["next_steps"] = [{"method_id": "fake.missing"}]
        provider = FakeProvider([json.dumps(orphan), valid_response()])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-REPAIR-001")
        self.assertEqual(provider.calls, 2)
        self.assertIsNone(result["error"])
        self.assertIn('next_steps.method_id=["fake.missing"]', provider.requests[1][1])
        self.assertEqual((result["input_tokens"], result["output_tokens"]), (20, 40))

    def test_unresolvable_prefill_becomes_needs_input_without_loosening_gate(self):
        response = json.loads(valid_response())
        response["next_steps"] = [{
            "method_id": "systems.leverage_point_analysis", "answers": "Where to intervene?", "deepens": "the pattern",
            "prefill": {"patterns": "invented source", "events": "r/events/0"}, "needs_input": [],
            "yields": "leverage points", "est_cost": "one session",
        }]
        raw_gates = evaluate_interpretation_gates(response, RECORD, build_prompt_manifest(RECORD), {"systems.leverage_point_analysis"})
        self.assertEqual(raw_gates[2]["status"], "FAIL")
        provider = FakeProvider([json.dumps(response)])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-PREFILL-001")
        self.assertEqual(provider.calls, 1)
        self.assertIsNone(result["error"])
        self.assertEqual(result["gate_results"][2]["status"], "PASS")
        step = result["interpretation"]["next_steps"][0]
        self.assertEqual(step["prefill"], {"events": "r/events/0"})
        self.assertEqual(step["needs_input"], ["patterns"])

    def test_malformed_prefill_and_needs_input_are_empty_not_claimed(self):
        response = json.loads(valid_response())
        response["next_steps"] = [{
            "method_id": "systems.leverage_point_analysis", "answers": "Where to intervene?", "deepens": "the pattern",
            "prefill": "unsupported source", "needs_input": None, "yields": "leverage points", "est_cost": "one session",
        }]
        provider = FakeProvider([json.dumps(response)])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-PREFILL-002")
        self.assertEqual(provider.calls, 1)
        self.assertIsNone(result["error"])
        step = result["interpretation"]["next_steps"][0]
        self.assertEqual(step["prefill"], {})
        self.assertEqual(step["needs_input"], [])

    def test_gaps_missing_evidence_are_explicit_without_losing_text(self):
        response = json.loads(valid_response())
        response["gaps"] = [
            {"id": "G1", "text": "No field measurement"},
            {"text": "No timeline", "needed_evidence": "dated observations"},
        ]
        provider = FakeProvider([json.dumps(response)])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-GAPS-001")
        self.assertEqual(provider.calls, 1)
        self.assertIsNone(result["error"])
        self.assertEqual(result["interpretation"]["gaps"], [
            {"text": "No field measurement", "needed_evidence": "未指定；需使用者補充證據"},
            {"text": "No timeline", "needed_evidence": "dated observations"},
        ])

    def test_layer_name_bindings_keep_exact_manifest_paths(self):
        response = json.loads(valid_response())
        response["visual"]["bindings"] = {"events": "r/events/0", "patterns": "r/patterns/0"}
        provider = FakeProvider([json.dumps(response)])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-LAYERS-001")
        self.assertEqual(provider.calls, 1)
        self.assertIsNone(result["error"])
        self.assertEqual(result["interpretation"]["visual"]["bindings"], {"levels": [
            {"label": "events", "path": "r/events/0"},
            {"label": "patterns", "path": "r/patterns/0"},
        ]})

    def test_layer_name_binding_with_unknown_path_still_fails_gate(self):
        response = json.loads(valid_response())
        response["visual"]["bindings"] = {"events": "r/unknown"}
        provider = FakeProvider([json.dumps(response)] * 2)
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-LAYERS-002")
        self.assertEqual(provider.calls, 2)
        self.assertIsNone(result["interpretation"])
        self.assertEqual(result["gate_results"][1]["status"], "FAIL")
        self.assertEqual((result["input_tokens"], result["output_tokens"]), (20, 40))

    def test_bad_json_then_repair_passes(self):
        provider = FakeProvider(["not json", valid_response()])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-TEST-001")
        self.assertEqual(provider.calls, 2)
        self.assertEqual(result["interpretation"]["interpretation_id"], "INTERP-TEST-001")
        self.assertEqual([gate["status"] for gate in result["gate_results"]], ["PASS", "PASS", "PASS", "PASS"])
        self.assertIsNone(result["error"])
        self.assertEqual((result["input_tokens"], result["output_tokens"]), (20, 40))

    def test_schema_failure_after_repair_is_refused(self):
        provider = FakeProvider([valid_response().replace('"r/patterns/0"', '"r/missing"')] * 2)
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-TEST-002")
        self.assertIsNone(result["interpretation"])
        self.assertTrue(result["error"])
        self.assertIn("citation_integrity", result["error"])
        self.assertEqual(provider.calls, 2)
        self.assertEqual((result["input_tokens"], result["output_tokens"]), (20, 40))


DETAIL_RECORD = {"events": ["第 6 次 session，8 位只有 2 位主動分享；第 1 次是 6 位"], "structures": ["帶領者先講作品的意義，說明佔 35 分鐘"]}


def detailed_response(**override) -> str:
    body = {
        "findings": [{"id": "F1", "title": "流程", "text": "先講讓分享變少。", "citations": ["r/structures/0"], "confidence": {"level": "mid", "reason": "一句紀錄"}}],
        "visual": {"kind": "layered", "bindings": {"levels": [{"label": "事件", "path": "r/events"}, {"label": "結構", "path": "r/structures"}]}},
        "next_methods": [], "next_steps": [], "recommendations": [], "gaps": [],
        "summary": "分享變少是流程造成的。",
        "units": [{"path": "r/events", "meaning": "警訊", "action": "開場鼓勵", "effect": "當次", "leverage": "low", "citations": ["r/events/0"]},
                  {"path": "r/structures", "meaning": "迴路", "action": "參與者先說", "effect": "持久", "leverage": "high", "citations": ["r/structures/0"]}],
        "focus": {"path": "r/structures", "why": "切斷迴路第一環"},
        "priority": "先改流程。",
        "solutions": {"options": [{"name": "甲", "what": "鼓勵", "takes": "當次", "cost": "低", "durability": "低", "risk": "退縮", "advice": "急救", "paths": ["r/events"]},
                                  {"name": "乙", "what": "改順序", "takes": "一期", "cost": "中", "durability": "高", "risk": "被改回", "advice": "先做", "paths": ["r/structures"]}],
                      "first_step": "下次先讓參與者說 3 分鐘。",
                      "plan": [{"when": "第 1 週", "action": "補數據", "owner": "帶領者", "proof": "有基準值", "target": "第 2 週前"}],
                      "metrics": [{"name": "主動分享人數", "now": "2 人", "now_citation": "r/events/0", "target": "6 人", "when": "一期"}]},
        "loop": {"kind": "reinforcing", "name": "等答案迴路", "reading": "越轉越安靜",
                 "nodes": [{"id": "a", "text": "帶領者先講", "citations": ["r/structures/0"]}, {"id": "b", "text": "參與者等答案", "citations": ["r/events/0"]}],
                 "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]},
        "trend": {"reading": "人數一路掉", "series": [{"name": "主動分享", "unit": "人", "points": [{"label": "第 1 次", "value": 6, "citation": "r/events/0"}, {"label": "第 6 次", "value": 2, "citation": "r/events/0"}]}]},
    }
    body.update(override)
    return json.dumps(body, ensure_ascii=False)


def run_detail(provider: "FakeProvider", interpretation_id: str) -> dict:
    return run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=DETAIL_RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids=set(), interpretation_id=interpretation_id)


class ResultPageDetailTests(unittest.TestCase):
    """Schema 1.1.0 sections: every claim cites the record, numbers come from the line they cite, loops close."""

    def problems(self, **override) -> dict:
        return detail_problems(json.loads(detailed_response(**override)), DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD))

    def test_a_supported_answer_has_no_problem_and_keeps_every_section(self):
        self.assertEqual(self.problems(), {})
        result = run_detail(FakeProvider([detailed_response()]), "INTERP-DETAIL-001")
        self.assertEqual(result["gate_results"][3], {"gate_id": "detail_integrity", "status": "PASS", "evidence": {"problems": {}, "dropped": {}}})
        for key in ("summary", "units", "focus", "priority", "solutions", "loop", "trend"): self.assertIn(key, result["interpretation"])

    def test_a_number_the_record_does_not_state_is_refused(self):
        trend = {"reading": "x", "series": [{"name": "x", "unit": "人", "points": [{"label": "a", "value": 7, "citation": "r/events/0"}, {"label": "b", "value": 2, "citation": "r/events/0"}]}]}
        self.assertIn("trend value 7 is not stated in r/events/0", self.problems(trend=trend)["trend"][0])
        metric = {"options": json.loads(detailed_response())["solutions"]["options"], "first_step": "x", "metrics": [{"name": "x", "now": "4 人", "now_citation": "r/events/0", "target": "6", "when": "x"}]}
        self.assertIn("['4'] is not stated in r/events/0", self.problems(solutions=metric)["solutions"][0])
        uncited = {"options": metric["options"], "first_step": "x", "metrics": [{"name": "x", "now": "2 人", "target": "6", "when": "x"}]}
        self.assertIn("without now_citation", self.problems(solutions=uncited)["solutions"][0])
        unmeasured = {"options": metric["options"], "first_step": "x", "metrics": [{"name": "x", "now": "未量測", "target": "每次", "when": "x"}]}
        self.assertEqual(self.problems(solutions=unmeasured), {})   # no number, no citation needed

    def test_numbers_read_the_same_whatever_their_format(self):
        record = {"events": ["溫度 -1.5 度", "營收 1,000 萬", "第 ６ 次", "第 1-5 次"]}
        manifest = build_prompt_manifest(record)
        def trend(value: float, citation: str) -> dict:
            return {"trend": {"reading": "x", "series": [{"name": "x", "unit": "x", "points": [{"label": "a", "value": value, "citation": citation}, {"label": "b", "value": value, "citation": citation}]}]}}
        for value, citation in [(-1.5, "r/events/0"), (1000, "r/events/1"), (6, "r/events/2"), (5, "r/events/3"), (1, "r/events/3")]:
            self.assertEqual(detail_problems(trend(value, citation), record, manifest), {}, (value, citation))
        for value, citation in [(1.5, "r/events/0"), (-5, "r/events/3"), (100, "r/events/1")]:   # the sign, the range dash, the separator
            self.assertIn("trend", detail_problems(trend(value, citation), record, manifest), (value, citation))

    def test_a_fact_field_may_only_state_numbers_the_record_states(self):
        self.assertIn("999", self.problems(summary="分享率掉了 999%")["summary"][0])
        self.assertEqual(self.problems(summary="第 1 次 6 位，第 6 次只剩 2 位"), {})
        units = [{"path": "r/events", "meaning": "少了 4 位", "action": "記錄 10 次", "effect": "x", "leverage": "low", "citations": ["r/events/0"]}]
        self.assertIn("units[0].meaning states ['4']", self.problems(units=units)["units"][0])   # a derived number is a claim too; the action is a proposal
        loop = json.loads(detailed_response())["loop"] | {"reading": "繞 3 圈就沒人說話"}   # 3 is nowhere in the record
        self.assertIn("loop.reading", self.problems(loop=loop)["loop"][0])
        self.assertIn("priority", self.problems(priority="先花 90 天改流程"))

    def test_checks_after_the_metrics_still_see_every_number_of_the_record(self):
        # 2026-09-26 real run: a metric's numbers (35) replaced the record's for every later check, so a loop and a trend
        # stating 1, 6 and 2 -- all in the record -- were dropped
        solutions = json.loads(detailed_response())["solutions"] | {"metrics": [{"name": "說明時間", "now": "佔 35 分鐘", "now_citation": "r/structures/0", "target": "20 分鐘", "when": "下次"}]}
        loop = json.loads(detailed_response())["loop"] | {"reading": "從第 1 次 6 位到只剩 2 位"}
        trend = json.loads(detailed_response())["trend"] | {"reading": "8 位只有 2 位"}
        self.assertEqual(self.problems(solutions=solutions, loop=loop, trend=trend), {})

    def test_a_finding_that_states_a_number_the_record_does_not_fails_the_core(self):
        # Codex ecbc5d71 F1: the findings are the page's main claims; a number in them is a fact about the user's situation
        body = json.loads(detailed_response())
        body["findings"][0]["text"] = "分享率掉了 999%。"
        gates = evaluate_interpretation_gates(body, DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD), set())
        self.assertEqual(gates[0]["status"], "FAIL")
        self.assertEqual(gates[0]["evidence"]["unstated_numbers"], {"F1": ["999"]})
        provider = FakeProvider([json.dumps(body, ensure_ascii=False), detailed_response()])
        result = run_detail(provider, "INTERP-DETAIL-007")
        self.assertIn("findings state numbers the record does not", provider.requests[1][1])   # the retry is told what to fix
        self.assertIsNone(result["error"])
        self.assertEqual(result["gate_results"][0]["evidence"]["unstated_numbers"], {})
        body["findings"][0]["text"] = "第 1 次 6 位，第 6 次只剩 2 位。"   # numbers the record states pass
        self.assertEqual(evaluate_interpretation_gates(body, DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD), set())[0]["status"], "PASS")

    def test_paths_and_citations_must_be_manifest_ids_and_a_loop_must_close(self):
        units = [{"path": "r/nope", "meaning": "x", "action": "x", "effect": "x", "leverage": "low", "citations": ["r/events/9"]}]
        self.assertEqual(len(self.problems(units=units)["units"]), 2)
        self.assertIn("focus.path", self.problems(focus={"path": "structures", "why": "x"})["focus"][0])
        open_loop = {"kind": "reinforcing", "name": "x", "reading": "x", "nodes": [{"id": "a", "text": "x", "citations": ["r/events/0"]}, {"id": "b", "text": "x", "citations": ["r/events/0"]}], "edges": [{"from": "a", "to": "b"}, {"from": "a", "to": "b"}]}
        self.assertIn("does not close", self.problems(loop=open_loop)["loop"][0])
        stray = dict(open_loop, edges=[{"from": "a", "to": "z"}, {"from": "b", "to": "a"}])
        self.assertIn("does not exist", self.problems(loop=stray)["loop"][0])

    def test_a_failing_section_is_asked_for_again_then_dropped_the_core_is_kept(self):
        bad_trend = {"reading": "x", "series": [{"name": "x", "unit": "人", "points": [{"label": "a", "value": 9, "citation": "r/events/0"}, {"label": "b", "value": 2, "citation": "r/events/0"}]}]}
        provider = FakeProvider([detailed_response(trend=bad_trend)] * 2)
        result = run_detail(provider, "INTERP-DETAIL-002")
        self.assertEqual(provider.calls, 2)   # asked once more, naming the section
        self.assertIn("DETAIL_INTEGRITY", provider.requests[1][1])
        self.assertIsNone(result["error"])
        self.assertNotIn("trend", result["interpretation"])
        self.assertIn("loop", result["interpretation"])   # only the failing section goes
        self.assertEqual(list(result["gate_results"][3]["evidence"]["dropped"]), ["trend"])
        self.assertEqual((result["input_tokens"], result["output_tokens"]), (20, 40))

    def test_when_the_retry_breaks_the_core_the_first_answer_is_returned_without_its_failing_section(self):
        bad_loop = {"kind": "reinforcing", "name": "x", "reading": "x", "nodes": [{"id": "a", "text": "x", "citations": ["r/events/0"]}, {"id": "b", "text": "x", "citations": ["r/events/0"]}], "edges": [{"from": "a", "to": "b"}, {"from": "a", "to": "b"}]}
        broken_core = detailed_response().replace('"citations": ["r/structures/0"], "confidence"', '"citations": ["r/missing"], "confidence"')
        provider = FakeProvider([detailed_response(loop=bad_loop), broken_core])
        result = run_detail(provider, "INTERP-DETAIL-003")
        self.assertIsNone(result["error"])
        self.assertNotIn("loop", result["interpretation"])
        self.assertIn("solutions", result["interpretation"])
        self.assertEqual(result["interpretation"]["usage"], {"input_tokens": 20, "output_tokens": 40})   # both calls are paid for

    def test_an_answer_cut_off_at_the_ceiling_is_named_and_every_attempt_is_kept(self):
        class CutOff(FakeProvider):
            def complete(self, system, user, *, max_tokens):
                reply = super().complete(system, user, max_tokens=max_tokens)
                return AiCompletion(text=reply.text, model=reply.model, input_tokens=10, output_tokens=INTERPRET_MAX_TOKENS if self.calls == 1 else 20)
        provider = CutOff([detailed_response()[:900], detailed_response()])
        result = run_detail(provider, "INTERP-DETAIL-005")
        self.assertIsNone(result["error"])
        self.assertIn("ANSWER_CUT_OFF", provider.requests[1][1])
        self.assertEqual([a["output_tokens"] for a in result["attempts"]], [INTERPRET_MAX_TOKENS, 20])
        self.assertTrue(result["attempts"][0]["refused"].startswith("ANSWER_CUT_OFF"))
        self.assertIsNone(result["attempts"][1]["refused"])
        self.assertIn("LENGTH:", provider.requests[0][1])

    def test_a_section_the_schema_refuses_is_dropped_alone(self):
        # 2026-09-26 real run: two options without advice used to drop every section, the summary and the layer readings too
        units = [{"path": "r/events", "meaning": "x", "action": "x", "effect": "x", "leverage": "huge", "citations": ["r/events/0"]}]
        solutions = json.loads(detailed_response())["solutions"]
        for option in solutions["options"]: option.pop("advice")
        provider = FakeProvider([detailed_response(units=units, solutions=solutions)] * 2)
        result = run_detail(provider, "INTERP-DETAIL-004")
        self.assertIsNone(result["error"])
        dropped = result["gate_results"][3]["evidence"]["dropped"]
        self.assertEqual(sorted(dropped), ["solutions", "units"])
        self.assertTrue(all(reason[0].startswith("schema: ") for reason in dropped.values()))
        for key in ("summary", "focus", "priority", "loop", "trend"): self.assertIn(key, result["interpretation"])   # the valid sections stay
        self.assertTrue(result["interpretation"]["findings"])

    def test_a_core_the_schema_refuses_is_not_trimmed_into_a_pass(self):
        body = json.loads(detailed_response())
        body["findings"][0]["confidence"]["level"] = "certain"   # the core: the schema allows high|mid|low
        result = run_detail(FakeProvider([json.dumps(body, ensure_ascii=False)] * 2), "INTERP-DETAIL-006")
        self.assertIsNone(result["interpretation"])
        self.assertIn("SCHEMA_VALIDATION_FAILED", result["error"])


if __name__ == "__main__":
    unittest.main()
