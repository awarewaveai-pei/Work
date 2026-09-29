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
    citation_problems,
    detail_problems,
    normalize_manifest_ids,
    move_unresolvable_prefills_to_needs_input,
    prefill_map,
    evaluate_interpretation_gates,
    record_leaf_paths,
    record_sha256,
    result_page_shows,
    run_interpretation,
    visual_kind,
    repair_details,
    trend_candidates,
)
from ai_lego.platform.ai_gateway.provider import AiCompletion, ProviderCallError


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
        self.assertEqual(set(shape["gaps"][0]), {"text", "needed_evidence", "path", "citations"})   # 1.3.0: the unit and lines a gap is about
        self.assertEqual(shape["visual"]["bindings"]["levels"][0]["path"], "r/events")
        self.assertEqual(provider.requests[0][2], INTERPRET_MAX_TOKENS)
        self.assertEqual(set(shape) >= {"summary", "units", "focus", "priority", "solutions", "loop", "trend"}, True)   # the result page's sections (schema 1.1.0)
        self.assertIn("every point's value must appear in the text of the manifest id it cites", provider.requests[0][1])

    def test_prefill_map_same_name_and_missing(self):
        prefill, needs_input = prefill_map({"properties": {"patterns": {"type": "array"}, "missing": {"type": "string"}}}, build_prompt_manifest(RECORD))
        self.assertEqual(prefill, {"patterns": "r/patterns"})
        self.assertEqual(needs_input, ["missing"])

    def test_move_unresolvable_prefills_drops_a_key_that_is_not_a_real_target_field(self):
        # N-13: the model's prefill key is a guess about the TARGET tool's field names. A key the target does not have is
        # nothing the user can fill there either: it goes (it is not listed under 還要你填). A real target field whose value
        # is no manifest line still needs the user. The model's own words in needs_input stay; a stray key of another
        # tool (the iceberg's `structures`, seen on a real run 2026-09-28) goes.
        interpretation = {"next_steps": [{"method_id": "systems.leverage_point_analysis", "prefill": {"patterns": "r/patterns", "objective": "r/patterns", "intervention_points": "r/nope"}, "needs_input": ["structures", "每個出手點的改變難度"]}]}
        move_unresolvable_prefills_to_needs_input(interpretation, build_prompt_manifest(RECORD), lambda method_id: {"patterns", "intervention_points"})
        step = interpretation["next_steps"][0]
        self.assertEqual(step["prefill"], {"patterns": "r/patterns"})
        self.assertEqual(step["needs_input"], ["每個出手點的改變難度", "intervention_points"])

    def test_move_unresolvable_prefills_without_a_resolver_only_checks_manifest_ids(self):
        # unable to resolve the target's own schema (resolver returns None, or none was given): unchanged, as before N-13
        interpretation = {"next_steps": [{"method_id": "systems.leverage_point_analysis", "prefill": {"objective": "r/patterns"}, "needs_input": []}]}
        move_unresolvable_prefills_to_needs_input(interpretation, build_prompt_manifest(RECORD), lambda method_id: None)
        self.assertEqual(interpretation["next_steps"][0]["prefill"], {"objective": "r/patterns"})
    def test_record_hash_is_canonical(self):
        self.assertEqual(record_sha256({"b": 2, "a": 1}), record_sha256({"a": 1, "b": 2}))

    def test_nested_leaf_path_exists(self):
        self.assertIn("r/r", record_leaf_paths({"r": {}}))
        self.assertIn("r/patterns/0", record_leaf_paths(RECORD))

    def test_manifest_contains_record_and_project_sources(self):
        manifest = build_prompt_manifest(RECORD, [{"source_id": "S1", "content_sha256": "abc"}])
        self.assertIn("r/patterns/0", {item["id"] for item in manifest})
        self.assertIn("source:S1", {item["id"] for item in manifest})

    def test_manifest_project_source_carries_its_title(self):
        # N-32/P-29: without this, the result page's ⑨ citation had nothing but the id and a sha256 to show.
        manifest = build_prompt_manifest(RECORD, [{"source_id": "S1", "content_sha256": "abc", "title": "客戶訪談紀錄"}])
        item = next(entry for entry in manifest if entry["id"] == "source:S1")
        self.assertEqual((item["title"], item["value"]), ("客戶訪談紀錄", "客戶訪談紀錄"))

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
        self.assertIn("'fake.missing' is not an active method; removed", provider.requests[1][1])   # the step goes alone, the answer stays (P-07)
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
        self.assertEqual([gate["status"] for gate in result["gate_results"]], ["PASS"] * 5)   # the four interpretation gates + no_preset_conclusion
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


class NewToThisPageTests(unittest.TestCase):
    """Operator 2026-09-29: ⑧ recommends tools ③ does not already draw and the project has not run; 1.4.0 plan rows."""

    STEP = {"answers": "a", "deepens": "d", "prefill": {}, "needs_input": [], "yields": "y", "est_cost": "S"}

    def test_the_registry_names_what_the_page_draws(self):
        self.assertEqual(result_page_shows(resolve_spec_root(), "systems.iceberg_model"),
                         {"systems.causal_loop_diagram", "systems.behavior_over_time", "systems.leverage_point_analysis"})
        self.assertEqual(result_page_shows(resolve_spec_root(), "root_cause.five_whys"), {"systems.causal_loop_diagram", "systems.behavior_over_time"})

    def test_an_excluded_tool_leaves_the_prompt_and_a_step_naming_it_goes_as_a_repair_not_a_paid_retry(self):
        steps = [dict(self.STEP, method_id="systems.causal_loop_diagram"), dict(self.STEP, method_id="root_cause.five_whys")]
        provider = FakeProvider([detailed_response(next_steps=steps, next_methods=["systems.causal_loop_diagram", "root_cause.five_whys"])])
        excluded = {"systems.causal_loop_diagram": "③ 已經畫出", "systems.iceberg_model": "就是這個工具"}
        result = run_interpretation(method_id="systems.iceberg_model", contract=dict(CONTRACT, recommended_next=["systems.causal_loop_diagram", "root_cause.five_whys"]), display={}, record=DETAIL_RECORD, sources=[], provider=provider,
                                    spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.causal_loop_diagram", "root_cause.five_whys"},
                                    interpretation_id="INTERP-NEW-001", catalog_lines=["systems.causal_loop_diagram — 因果回饋圖", "root_cause.five_whys — 五個為什麼"], excluded_method_ids=excluded)
        self.assertEqual(provider.calls, 1)   # a repair, never a second paid call
        self.assertEqual([step["method_id"] for step in result["interpretation"]["next_steps"]], ["root_cause.five_whys"])
        self.assertEqual(result["interpretation"]["next_methods"], ["root_cause.five_whys"])
        prompt = provider.requests[0][1]
        available = prompt.split("AVAILABLE ACTIVE METHODS:\n", 1)[1].split("\n\n", 1)[0]
        self.assertNotIn("systems.causal_loop_diagram", available)
        self.assertIn("systems.causal_loop_diagram (③ 已經畫出)", prompt)
        self.assertNotIn("systems.causal_loop_diagram", prompt.split("CONTRACT: ", 1)[1].split("\n", 1)[0])
        self.assertIn("next_steps", result["gate_results"][3]["evidence"]["repaired"])

    def test_a_plan_row_serves_only_options_that_exist(self):
        solutions = json.loads(detailed_response())["solutions"]
        solutions["long_horizon"] = "quarter"
        solutions["plan"] = [{"when": "第 1 週", "action": "補數據", "owner": "帶領者", "proof": "有基準值", "target": "第 2 週前", "phase": "short", "options": ["乙", "丁"]},
                             {"when": "第 2 季", "action": "改訓練", "owner": "訓練負責人", "proof": "新教材", "target": "定稿", "phase": "long", "options": ["丁"]}]
        result = run_detail(FakeProvider([detailed_response(solutions=solutions)]), "INTERP-NEW-002")
        plan = result["interpretation"]["solutions"]["plan"]
        self.assertEqual((plan[0]["options"], "options" in plan[1], plan[1]["phase"]), (["乙"], False, "long"))
        self.assertEqual(result["interpretation"]["solutions"]["long_horizon"], "quarter")

    def test_the_prompt_asks_for_five_options_and_a_short_and_a_long_plan(self):
        provider = FakeProvider([valid_response()])
        run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-NEW-003")
        prompt = provider.requests[0][1]
        self.assertIn("solutions: 5 options", prompt)
        self.assertIn("phase short = the first month", prompt)
        self.assertIn("long_horizon = month|quarter|year", prompt)


class ResultPageDetailTests(unittest.TestCase):
    """Schema 1.1.0 sections: every claim cites the record, numbers come from the line they cite, loops close."""

    def problems(self, **override) -> dict:
        return detail_problems(json.loads(detailed_response(**override)), DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD))

    def test_a_supported_answer_has_no_problem_and_keeps_every_section(self):
        self.assertEqual(self.problems(), {})
        result = run_detail(FakeProvider([detailed_response()]), "INTERP-DETAIL-001")
        evidence = result["gate_results"][3]["evidence"]
        self.assertEqual((evidence["problems"], evidence["dropped"], evidence["removed"]), ({}, {}, {}))
        self.assertEqual(list(evidence["repaired"]), ["gaps"])   # no gap and no source: the missing-source gap is added (P-08)
        for key in ("summary", "units", "focus", "priority", "solutions", "loop", "trend"): self.assertIn(key, result["interpretation"])

    def test_a_number_the_record_does_not_state_is_refused(self):
        trend = {"reading": "x", "series": [{"name": "x", "unit": "人", "points": [{"label": "a", "value": 7, "citation": "r/events/0"}, {"label": "b", "value": 2, "citation": "r/events/0"}]}]}
        self.assertIn("trend value 7 is not stated in r/events/0", self.problems(trend=trend)["trend"][0])
        metric = {"options": json.loads(detailed_response())["solutions"]["options"], "first_step": "x", "metrics": [{"name": "x", "now": "4 人", "now_citation": "r/events/0", "target": "6", "when": "x"}]}
        self.assertIn("['4'] without a record line that states it (now_citation 'r/events/0')", self.problems(solutions=metric)["solutions"][0])
        uncited = {"options": metric["options"], "first_step": "x", "metrics": [{"name": "x", "now": "2 人", "target": "6", "when": "x"}]}
        self.assertIn("without a record line that states it", self.problems(solutions=uncited)["solutions"][0])
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
        self.assertIn("state numbers the record does not", provider.requests[1][1])   # the retry is told what to fix
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
        evidence = result["gate_results"][3]["evidence"]
        self.assertEqual(evidence["dropped"], {})   # the unstated point went alone; its series was left with one point, so the trend went too
        self.assertEqual(list(evidence["removed"]), ["trend"])
        self.assertIn("trend value 9 is not stated in r/events/0; point removed", evidence["removed"]["trend"][0])
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
        evidence = result["gate_results"][3]["evidence"]
        self.assertEqual(sorted(evidence["dropped"]), ["solutions"])   # options left under minItems 2: the section goes
        self.assertTrue(evidence["dropped"]["solutions"][0].startswith("schema: "))
        self.assertIn("leverage", evidence["removed"]["units"][0])   # the bad unit goes alone (P-06), and with it the only unit
        for key in ("summary", "focus", "priority", "loop", "trend"): self.assertIn(key, result["interpretation"])   # the valid sections stay
        self.assertTrue(result["interpretation"]["findings"])

    def test_a_core_the_schema_refuses_is_not_trimmed_into_a_pass(self):
        body = json.loads(detailed_response())
        body["findings"][0]["confidence"]["level"] = "certain"   # the core: the schema allows high|mid|low, and no synonym maps "certain"
        result = run_detail(FakeProvider([json.dumps(body, ensure_ascii=False)] * 2), "INTERP-DETAIL-006")
        self.assertIsNone(result["interpretation"])   # the only finding goes at item grain; no finding left = the core refuses
        self.assertIn("citation_integrity", result["error"])




class TrendRetryTests(unittest.TestCase):
    """A record that measures the same thing twice (6 位 … 2 位) supports 圖 A; a first answer without it is asked once more
    (2026-09-28 real run: the demo record states 第 1 次 6 位 and 第 6 次 2 位, the model omitted trend, nothing noticed)."""

    def test_the_record_measured_twice_is_found_and_ordinals_are_not(self):
        self.assertEqual(trend_candidates(DETAIL_RECORD), {"位": ["2", "6", "8"]})   # 第 6 次 / 第 1 次 are not measures; 35 分鐘 is stated once
        self.assertEqual(trend_candidates({"events": ["第 3 次 session 有 4 人"]}), {})

    def test_a_first_answer_without_trend_is_asked_once_more_and_the_second_with_trend_is_kept(self):
        provider = FakeProvider([detailed_response(trend=None), detailed_response()])
        result = run_detail(provider, "INTERP-TREND-001")
        self.assertEqual(provider.calls, 2)
        self.assertTrue(result["attempts"][0]["refused"].startswith("TREND_MISSING: trend was omitted but the record states 2 位, 6 位, 8 位"), result["attempts"])
        self.assertIn("trend", result["interpretation"])
        self.assertIsNone(result["error"])

    def test_a_second_omission_keeps_the_first_answer_without_a_third_call(self):
        provider = FakeProvider([detailed_response(trend=None), detailed_response(trend=None)])
        result = run_detail(provider, "INTERP-TREND-002")
        self.assertEqual(provider.calls, 2)
        self.assertIsNone(result["error"])
        self.assertNotIn("trend", result["interpretation"])
        evidence = result["gate_results"][3]["evidence"]
        self.assertEqual((evidence["dropped"], evidence["removed"]), ({}, {}))

    def test_a_record_measured_once_is_not_asked_again(self):
        provider = FakeProvider([detailed_response(trend=None)])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record={"events": ["第 6 次 session 有 2 位分享"], "structures": ["說明佔 35 分鐘"]}, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids=set(), interpretation_id="INTERP-TREND-003")
        self.assertEqual(provider.calls, 1)
        self.assertIsNone(result["error"])

    def test_the_prompt_lays_the_plan_out_in_weeks(self):
        provider = FakeProvider([detailed_response()])
        run_detail(provider, "INTERP-WEEKS-001")
        self.assertIn("phase short = the first month, when = 第 1 週 / 第 2 到 4 週 (weeks counted from the start)", provider.requests[0][1])


class CutOffProvider(FakeProvider):
    """First call cut off at max_tokens (billed), then the scripted answers."""
    def __init__(self, responses, reason="cut_off"):
        super().__init__(responses); self.reason = reason; self.cut = False
    def complete(self, system, user, *, max_tokens):
        if not self.cut:
            self.cut = True; self.requests.append((system, user, max_tokens))
            raise ProviderCallError(f"AI_PROVIDER_{self.reason.upper()}: test", reason=self.reason, input_tokens=100, output_tokens=max_tokens)
        return super().complete(system, user, max_tokens=max_tokens)


class ModelCallTests(unittest.TestCase):
    """P-01 / P-47: a cut-off answer is asked once more and what it cost is counted; a refusal is not retried."""

    def test_a_cut_off_answer_is_asked_again_and_its_tokens_are_counted(self):
        provider = CutOffProvider([detailed_response()])
        result = run_detail(provider, "INTERP-CUT-001")
        self.assertIsNone(result["error"])
        self.assertEqual(len(provider.requests), 2)
        self.assertEqual(result["attempts"][0]["stop_reason"], "cut_off")
        self.assertIn("ANSWER_CUT_OFF", provider.requests[1][1])
        self.assertEqual(result["output_tokens"], INTERPRET_MAX_TOKENS + 20)
        self.assertEqual(result["input_tokens"], 110)

    def test_a_refusal_is_not_retried_but_is_counted(self):
        provider = CutOffProvider([detailed_response()], reason="refusal")
        result = run_detail(provider, "INTERP-CUT-002")
        self.assertIn("AI_PROVIDER_REFUSAL", result["error"])
        self.assertEqual(len(provider.requests), 1)
        self.assertEqual(result["output_tokens"], INTERPRET_MAX_TOKENS)


class GateGrainTests(unittest.TestCase):
    """Each problem costs the smallest thing that holds it, never the whole answer (P-03..P-13, N-33, N-39)."""

    manifest = build_prompt_manifest(DETAIL_RECORD)

    def test_layer_ordinals_and_section_marks_are_not_claims(self):
        self.assertEqual(detail_problems(json.loads(detailed_response(summary="問題在第 3 層，⑦ 的方案先做。", priority="先第 3 層再第 4 層")), DETAIL_RECORD, self.manifest), {})
        body = json.loads(detailed_response()); body["findings"][0]["title"] = "問題在第 3 層"
        self.assertEqual(evaluate_interpretation_gates(body, DETAIL_RECORD, self.manifest, set())[0]["status"], "PASS")

    def test_a_quantity_in_chinese_words_is_checked_like_digits(self):
        body = json.loads(detailed_response()); body["findings"][0]["text"] = "少了四個人。"
        gate = evaluate_interpretation_gates(body, DETAIL_RECORD, self.manifest, set())[0]
        self.assertEqual((gate["status"], gate["evidence"]["unstated_numbers"]), ("FAIL", {"F1": ["4"]}))
        worded = {"events": ["第 6 次只有兩位分享"]}
        self.assertEqual(detail_problems({"summary": "只剩 2 位"}, worded, build_prompt_manifest(worded)), {})

    def test_the_schema_refuses_one_item_and_that_item_goes_alone(self):
        solutions = json.loads(detailed_response())["solutions"]
        metric = solutions["metrics"][0]
        solutions["metrics"] = [dict(metric, target=""), dict(metric), dict(metric), dict(metric), dict(metric)]
        units = json.loads(detailed_response())["units"]
        units[0]["brief"] = "很" * 45
        units[1]["leverage"] = "medium"
        result = run_detail(FakeProvider([detailed_response(solutions=solutions, units=units)] * 2), "INTERP-GRAIN-001")
        self.assertIsNone(result["error"])
        self.assertEqual(len(result["interpretation"]["solutions"]["metrics"]), 3)   # the empty one gone, then capped at 3
        self.assertNotIn("brief", result["interpretation"]["units"][0])            # the over-long brief goes, the unit stays
        self.assertEqual(result["interpretation"]["units"][1]["leverage"], "mid")   # a synonym read as the enum value
        self.assertNotIn("solutions", result["gate_results"][3]["evidence"]["dropped"])

    def test_a_manifest_id_in_another_notation_is_that_id_and_nothing_is_guessed(self):
        """Run #14 (2026-09-28): citation_integrity refused twice; a notation is read, an id is never invented."""
        manifest = build_prompt_manifest(RECORD)
        body = {"findings": [{"id": "F1", "citations": ["patterns[0]", "r.events.0", "/r/patterns/0/", "r/nothing/9"]}],
                "units": [{"path": "events/0", "citations": ["r/events[0]"], "meaning": "events/0"}],
                "visual": {"bindings": {"levels": [{"label": "events[0]", "path": "events[0]"}]}},
                "next_steps": [{"method_id": "systems.a", "prefill": {"events": "events[0]"}}],
                "trend": {"series": [{"points": [{"citation": "patterns[0]"}]}]}}
        repaired = normalize_manifest_ids(body, manifest)
        self.assertEqual(body["findings"][0]["citations"], ["r/patterns/0", "r/events/0", "r/patterns/0", "r/nothing/9"])
        self.assertEqual((body["units"][0]["path"], body["units"][0]["citations"], body["units"][0]["meaning"]), ("r/events/0", ["r/events/0"], "events/0"))
        self.assertEqual(body["visual"]["bindings"]["levels"][0], {"label": "events[0]", "path": "r/events/0"})   # a label is text
        self.assertEqual(body["next_steps"][0]["prefill"], {"events": "r/events/0"})
        self.assertEqual(body["trend"]["series"][0]["points"][0]["citation"], "r/patterns/0")
        self.assertEqual(set(repaired), {"findings", "units", "visual", "next_steps", "trend"})
        self.assertIn("findings[0].citations[0] 'patterns[0]' -> 'r/patterns/0'", repaired["findings"])

    def test_a_refused_citation_tells_the_retry_which_ids_to_fix(self):
        wrong = json.loads(valid_response()); wrong["findings"][0]["citations"] = ["r/nothing/9"]
        wrong["recommendations"] = [{"level": "now", "action": "先補數字", "expected": "x", "citations": []}]
        provider = FakeProvider([json.dumps(wrong), valid_response()])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-CITE-001")
        self.assertIsNone(result["error"])
        retry = provider.requests[1][1]
        self.assertIn('citations not in MANIFEST: ["r/nothing/9"]', retry)
        self.assertIn("cite only MANIFEST ids, copied exactly, e.g. [", retry)   # with examples of what an id looks like
        self.assertEqual(citation_problems(wrong, build_prompt_manifest(RECORD)).count("recommendations[0]"), 1)
        self.assertEqual(citation_problems(json.loads(valid_response()), build_prompt_manifest(RECORD)), "")

    def test_one_bad_next_step_goes_alone(self):
        steps = [{"method_id": m, "answers": "a", "deepens": "d", "prefill": {}, "needs_input": [], "yields": "y", "est_cost": "S"} for m in ("systems.a", "fake.none", "systems.b")]
        provider = FakeProvider([detailed_response(next_steps=steps, next_methods=["systems.a"])] * 2)
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=DETAIL_RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.a", "systems.b"}, interpretation_id="INTERP-GRAIN-002")
        self.assertIsNone(result["error"])
        self.assertEqual([s["method_id"] for s in result["interpretation"]["next_steps"]], ["systems.a", "systems.b"])
        self.assertEqual(result["interpretation"]["next_methods"], ["systems.a", "systems.b"])

    def test_a_string_gap_is_kept_and_a_record_only_answer_always_lists_the_missing_source(self):
        result = run_detail(FakeProvider([detailed_response(gaps=["缺逐次數字"])]), "INTERP-GRAIN-003")
        self.assertEqual(result["interpretation"]["gaps"][0]["text"], "缺逐次數字")
        result = run_detail(FakeProvider([detailed_response(gaps=[])]), "INTERP-GRAIN-004")
        self.assertIn("沒有外部來源", result["interpretation"]["gaps"][0]["text"])

    def test_a_repaired_citation_costs_no_retry(self):
        solutions = json.loads(detailed_response())["solutions"]
        solutions["metrics"][0]["now_citation"] = ""
        provider = FakeProvider([detailed_response(solutions=solutions)])
        result = run_detail(provider, "INTERP-GRAIN-005")
        self.assertEqual(provider.calls, 1)
        self.assertEqual(result["gate_results"][3]["evidence"]["removed"], {})

    def test_a_worse_second_answer_does_not_replace_the_first(self):
        bad_trend = {"reading": "x", "series": [{"name": "x", "unit": "位", "points": [{"label": "a", "value": 9, "citation": "r/events/0"}, {"label": "b", "value": 2, "citation": "r/events/0"}]}]}
        solutions = json.loads(detailed_response())["solutions"]
        for option in solutions["options"]: option.pop("advice")
        open_loop = dict(json.loads(detailed_response())["loop"], edges=[{"from": "a", "to": "b"}])
        provider = FakeProvider([detailed_response(trend=bad_trend), detailed_response(solutions=solutions, loop=open_loop)])
        result = run_detail(provider, "INTERP-GRAIN-006")
        self.assertEqual(provider.calls, 2)
        self.assertIn("solutions", result["interpretation"])
        self.assertIn("loop", result["interpretation"])
        self.assertIn("KEPT_FIRST_ANSWER", result["attempts"][1]["refused"])

    def test_more_fact_fields_are_checked(self):
        body = json.loads(detailed_response())
        body["loop"]["name"] = "9 人迴路"
        self.assertIn("loop", detail_problems(body, DETAIL_RECORD, self.manifest))
        body = json.loads(detailed_response()); body["trend"]["question"] = "從 9 位掉到幾位？"
        self.assertIn("trend", detail_problems(body, DETAIL_RECORD, self.manifest))
        body = json.loads(detailed_response()); body["findings"][0]["confidence"]["reason"] = "問過 9 位"
        self.assertEqual(evaluate_interpretation_gates(body, DETAIL_RECORD, self.manifest, set())[0]["status"], "FAIL")
        result = run_detail(FakeProvider([detailed_response(gaps=[{"text": "少了 9 位的紀錄", "needed_evidence": "x"}, {"text": "缺訪談", "needed_evidence": "x"}])] * 2), "INTERP-GRAIN-007")
        self.assertEqual([g["text"] for g in result["interpretation"]["gaps"]], ["缺訪談"])

    def test_every_claim_cites_and_confidence_stays_mid_without_a_source(self):
        findings = json.loads(detailed_response())["findings"]
        findings[0]["confidence"]["level"] = "high"
        findings.append({"id": "F2", "title": "無出處", "text": "沒有引註。", "citations": [], "confidence": {"level": "low", "reason": "x"}})
        recommendations = [{"level": "now", "action": "先做", "expected": "x", "citations": []}, {"level": "now", "action": "後做", "expected": "x", "citations": ["r/events/0"]}]
        result = run_detail(FakeProvider([detailed_response(findings=findings, recommendations=recommendations)] * 2), "INTERP-GRAIN-008")
        self.assertIsNone(result["error"])
        self.assertEqual([f["id"] for f in result["interpretation"]["findings"]], ["F1"])
        self.assertEqual(result["interpretation"]["findings"][0]["confidence"]["level"], "mid")
        self.assertEqual([r["action"] for r in result["interpretation"]["recommendations"]], ["後做"])
        gate = result["gate_results"][0]["evidence"]
        self.assertEqual((gate["claims"], gate["unsupported"]), (2, 0))

    def test_a_root_key_the_contract_does_not_have_is_left_out(self):
        result = run_detail(FakeProvider([detailed_response(revision_conditions=[{"text": "x", "would_change": "y"}])]), "INTERP-GRAIN-009")
        self.assertIsNone(result["error"])
        self.assertNotIn("revision_conditions", result["interpretation"])


class Contract13Tests(unittest.TestCase):
    """Schema 1.3.0: the mock's remaining fields reach the page, each held to the manifest at its own grain."""

    def full(self, **override) -> str:
        body = json.loads(detailed_response())
        body["units"][0]["thickness"] = {"verdict": "thin", "note": "沒有逐次數字", "fill_by": "systems.a"}
        body["diagnosis"] = {"title": "問題在第 3 層，根在第 4 層", "text": "流程讓帶領者先講。", "citations": ["r/structures/0"]}
        body["priority_short"] = "先第 3 層"
        body["solutions"]["recommended"] = "乙"
        body["loop"]["feeders"] = [{"id": "f1", "text": "紀錄表只問洞察", "citations": ["r/structures/0"], "to": "a"}]
        body["next_methods"] = ["systems.a", "systems.b", "systems.c"]
        body["next_steps"] = [{"method_id": m, "answers": "a", "deepens": "d", "prefill": {}, "needs_input": [], "yields": "y", "est_cost": "S", "short": "短", "on_path": True, "why": "因為"} for m in ("systems.a", "systems.b", "systems.c")]
        body["gaps"] = [{"text": "缺逐次數字", "needed_evidence": "紀錄", "path": "r/events", "citations": ["r/events/0", "r/ghost"]}]
        body.update(override)
        return json.dumps(body, ensure_ascii=False)

    def run_full(self, text: str, record=DETAIL_RECORD) -> dict:
        return run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=record, sources=[], provider=FakeProvider([text] * 2), spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.a", "systems.b", "systems.c"}, interpretation_id="INTERP-13-001")

    def test_the_new_fields_survive_and_are_repaired_at_their_own_grain(self):
        result = self.run_full(self.full())
        out = result["interpretation"]
        self.assertIsNone(result["error"])
        self.assertEqual(out["diagnosis"]["title"], "問題在第 3 層，根在第 4 層")   # layer ordinals are not claims
        self.assertEqual(out["units"][0]["thickness"]["fill_by"], "systems.a")
        self.assertEqual(out["solutions"]["recommended"], "乙")
        self.assertEqual(out["loop"]["feeders"][0]["to"], "a")
        self.assertEqual([s["on_path"] for s in out["next_steps"]], [True, True, False])   # at most two on the path
        self.assertEqual(out["gaps"][0]["citations"], ["r/events/0"])                     # the unknown citation goes alone
        self.assertEqual(out["priority_short"], "先第 3 層")

    def test_a_bad_feeder_recommendation_or_fill_by_costs_only_itself(self):
        body = json.loads(self.full())
        body["loop"]["feeders"] = [{"id": "f1", "text": "x", "citations": ["r/ghost"], "to": "a"}, {"id": "f2", "text": "y", "citations": ["r/events/0"], "to": "zz"}]
        body["solutions"]["recommended"] = "丁"
        body["units"][0]["thickness"]["fill_by"] = "systems.zzz"
        out = self.run_full(json.dumps(body, ensure_ascii=False))["interpretation"]
        self.assertNotIn("feeders", out["loop"])
        self.assertIn("nodes", out["loop"])
        self.assertNotIn("recommended", out["solutions"])
        self.assertNotIn("fill_by", out["units"][0]["thickness"])

    def test_a_diagnosis_stating_an_unstated_number_is_dropped_alone(self):
        result = self.run_full(self.full(diagnosis={"title": "少了 9 位", "text": "x", "citations": ["r/events/0"]}))
        self.assertNotIn("diagnosis", result["interpretation"])
        self.assertIn("diagnosis", result["gate_results"][3]["evidence"]["dropped"])
        self.assertIn("summary", result["interpretation"])

    def test_a_unit_left_blank_is_always_a_gap_with_its_path(self):
        record = dict(DETAIL_RECORD, patterns=[])
        result = self.run_full(self.full(), record=record)
        paths = [g.get("path") for g in result["interpretation"]["gaps"]]
        self.assertIn("r/patterns", paths)
        self.assertEqual(paths.count("r/events"), 1)   # a unit the model already named is not repeated


class ItemLevelIntegrityTests(unittest.TestCase):
    """The invariant (nothing unverified is shown) at the smallest grain that keeps it: one metric, one path, one unit,
    one point goes alone; the section stays (2026-09-27: a whole ⑦ card was lost to one empty now_citation)."""

    def repaired(self, **override):
        fixed, removed, self.last_repaired = repair_details(json.loads(detailed_response(**override)), DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD))
        return fixed, removed

    def solutions(self, **override) -> dict:
        return json.loads(detailed_response())["solutions"] | override

    def test_a_metric_with_an_empty_citation_gets_the_one_record_line_that_states_its_number(self):
        fixed, removed = self.repaired(solutions=self.solutions(metrics=[{"name": "主動分享人數", "now": "2 人", "now_citation": "", "target": "6", "when": "一期"}]))
        self.assertEqual(fixed["solutions"]["metrics"][0]["now_citation"], "r/events/0")
        self.assertIn("so it was set", self.last_repaired["solutions"][0])   # repaired, not removed: no paid retry, no 已拿掉 (P-09)
        self.assertNotIn("solutions", removed)
        self.assertEqual(detail_problems(fixed, DETAIL_RECORD, build_prompt_manifest(DETAIL_RECORD)), {})

    def test_a_metric_no_record_line_states_goes_alone_and_the_section_stays(self):
        fixed, removed = self.repaired(solutions=self.solutions(metrics=[{"name": "x", "now": "4 人", "now_citation": "", "target": "6", "when": "x"}, {"name": "y", "now": "未量測", "now_citation": "r/nope", "target": "每次", "when": "x"}]))
        self.assertEqual([m["name"] for m in fixed["solutions"]["metrics"]], ["y"])
        self.assertNotIn("now_citation", fixed["solutions"]["metrics"][0])   # not measured yet: no citation to keep
        self.assertIn("removed", removed["solutions"][0])
        self.assertIn("options", fixed["solutions"])

    def test_an_options_unknown_path_goes_and_the_option_stays(self):
        options = self.solutions()["options"]
        options[0] = {**options[0], "paths": ["r/events", "r/ghost"]}
        fixed, removed = self.repaired(solutions=self.solutions(options=options))
        self.assertEqual(fixed["solutions"]["options"][0]["paths"], ["r/events"])
        self.assertIn("r/ghost", removed["solutions"][0])

    def test_a_unit_with_a_path_that_is_not_in_the_manifest_goes_and_the_others_stay(self):
        units = json.loads(detailed_response())["units"] + [{"path": "r/ghost", "meaning": "x", "action": "x", "effect": "x", "leverage": "low", "citations": ["r/events/0"]}]
        fixed, removed = self.repaired(units=units)
        self.assertEqual([u["path"] for u in fixed["units"]], [u["path"] for u in units[:-1]])
        self.assertIn("units[%d].path" % (len(units) - 1), removed["units"][0])

    def test_a_trend_point_the_line_does_not_state_goes_and_a_series_with_two_left_stays(self):
        series = [{"name": "x", "unit": "人", "points": [{"label": "a", "value": 6, "citation": "r/events/0"}, {"label": "b", "value": 9, "citation": "r/events/0"}, {"label": "c", "value": 2, "citation": "r/events/0"}]}]
        fixed, removed = self.repaired(trend={"reading": "x", "series": series})
        self.assertEqual([p["value"] for p in fixed["trend"]["series"][0]["points"]], [6, 2])
        self.assertEqual(len(removed["trend"]), 1)

    def test_the_run_retries_for_removed_items_and_reports_them(self):
        bad_metric = self.solutions(metrics=[{"name": "x", "now": "4 人", "now_citation": "", "target": "6", "when": "x"}])
        provider = FakeProvider([detailed_response(solutions=bad_metric), detailed_response()])
        result = run_detail(provider, "INTERP-ITEM-001")
        self.assertEqual(provider.calls, 2)
        self.assertIn('"removed"', provider.requests[1][1])
        evidence = result["gate_results"][3]["evidence"]
        self.assertEqual((evidence["dropped"], evidence["removed"]), ({}, {}))
        self.assertEqual(len(result["interpretation"]["solutions"]["metrics"]), 1)   # the second answer's own metric, cited

    def test_an_unstated_number_in_the_headline_costs_the_headline_not_the_answer(self):
        provider = FakeProvider([detailed_response(headline="從 6 人掉到 3 人")] * 2)
        result = run_detail(provider, "INTERP-ITEM-002")
        self.assertIsNone(result["error"])   # P-05: the page title falls back to the tool's name
        self.assertIn("headline", result["gate_results"][3]["evidence"]["dropped"])
        self.assertNotIn("headline", result["interpretation"])
        self.assertIn("summary", result["interpretation"])

    def test_complete_json_is_used_when_the_provider_offers_it_and_the_prompt_names_the_new_fields(self):
        class JsonProvider(FakeProvider):
            def complete_json(self, system, user, *, max_tokens, effort=None, input_schema=None):
                self.json_calls = getattr(self, "json_calls", 0) + 1
                self.json_kwargs = {"effort": effort, "input_schema": input_schema, "system": system}
                return self.complete(system, user, max_tokens=max_tokens)
        provider = JsonProvider([detailed_response()])
        result = run_detail(provider, "INTERP-ITEM-003")
        self.assertEqual((provider.json_calls, result["error"]), (1, None))
        self.assertEqual(provider.json_kwargs["effort"], "medium")   # thinking bounded (P-02)
        schema = provider.json_kwargs["input_schema"]
        self.assertIn("findings", schema["properties"])
        self.assertNotIn("interpretation_id", schema["properties"])   # the server's keys are never asked of the model (P-48)
        self.assertNotIn("interpretation_id", schema["required"])
        self.assertIn("input of the tool call", provider.json_kwargs["system"])   # one instruction for the channel used (P-11)
        self.assertNotIn("r/foo", provider.requests[0][1])
        shape = json.loads(provider.requests[0][1].split("OUTPUT JSON SHAPE: ", 1)[1].split("\n\nRULES:", 1)[0])
        self.assertIn("headline", shape)
        self.assertEqual(set(shape["units"][0]) >= {"brief", "step", "leverage"}, True)
        self.assertEqual(set(shape["solutions"]) >= {"horizon", "signoff"}, True)
        self.assertIn("question", shape["trend"])
        self.assertIn("gaps = at least 1", provider.requests[0][1])
        self.assertNotIn("THE USER RETURNED", provider.requests[0][1])

    def test_feedback_puts_the_reason_and_the_previous_version_in_the_prompt(self):
        provider = FakeProvider([detailed_response()])
        run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=DETAIL_RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids=set(), interpretation_id="INTERP-ITEM-004",
                           feedback="第二個發現把線上場當成原因，資料沒有這樣說", previous={"headline": "舊標題", "summary": "舊的一句話", "findings": [{"id": "F1", "title": "舊發現"}]})
        prompt = provider.requests[0][1]
        self.assertIn("THE USER RETURNED THE PREVIOUS VERSION", prompt)
        self.assertIn("第二個發現把線上場當成原因", prompt)
        self.assertIn("舊發現", prompt)


if __name__ == "__main__":
    unittest.main()
