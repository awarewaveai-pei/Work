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

    def test_next_method_out_of_catalog_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["r/events/0"]}], "visual": {"bindings": {}}, "next_methods": ["fake.missing"]}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[2]["status"], "FAIL")

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
