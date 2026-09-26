from __future__ import annotations

import json
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.interpret_method_record import (
    build_prompt_manifest,
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
        self.assertEqual(provider.requests[0][2], 6000)

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
        self.assertEqual([gate["status"] for gate in result["gate_results"]], ["PASS", "PASS", "PASS"])
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


if __name__ == "__main__":
    unittest.main()
