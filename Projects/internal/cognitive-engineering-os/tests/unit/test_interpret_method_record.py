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
        "findings": [{"id": "F1", "title": "Pattern", "text": "The spike repeats.", "citations": ["record.patterns.0"], "confidence": {"level": "mid", "reason": "The record contains one repeated pattern."}}],
        "visual": {"kind": "layered", "bindings": {"levels": [{"label": "Pattern", "path": "record.patterns.0"}]}},
        "next_methods": ["systems.leverage_point_analysis"],
        "next_steps": [], "data_thickness": {"lowest": "patterns"}, "recommendations": [], "gaps": [],
    })


class FakeProvider:
    model = "fake"

    def __init__(self, responses: list[str]):
        self.responses = responses
        self.calls = 0

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion:
        text = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return AiCompletion(text=text, model=self.model, input_tokens=10, output_tokens=20)


class InterpretationTests(unittest.TestCase):
    def test_record_hash_is_canonical(self):
        self.assertEqual(record_sha256({"b": 2, "a": 1}), record_sha256({"a": 1, "b": 2}))

    def test_nested_leaf_path_exists(self):
        self.assertIn("record.r", record_leaf_paths({"r": {}}))
        self.assertIn("record.patterns.0", record_leaf_paths(RECORD))

    def test_manifest_contains_record_and_project_sources(self):
        manifest = build_prompt_manifest(RECORD, [{"source_id": "S1", "content_sha256": "abc"}])
        self.assertIn("record.patterns.0", {item["id"] for item in manifest})
        self.assertIn("source:S1", {item["id"] for item in manifest})

    def test_visual_kind_uses_override(self):
        self.assertEqual(visual_kind(resolve_spec_root(), "systems.iceberg_model", CONTRACT), "layered")
        self.assertEqual(visual_kind(resolve_spec_root(), "decision.eisenhower_matrix", {"family": "decision"}), "quadrant")

    def test_citation_out_of_manifest_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["record.nope"]}], "visual": {"bindings": {}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[0]["status"], "FAIL")

    def test_visual_binding_out_of_record_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["record.events.0"]}], "visual": {"bindings": {"path": "record.missing"}}, "next_methods": []}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[1]["status"], "FAIL")

    def test_next_method_out_of_catalog_fails(self):
        result = evaluate_interpretation_gates({"findings": [{"citations": ["record.events.0"]}], "visual": {"bindings": {}}, "next_methods": ["fake.missing"]}, RECORD, build_prompt_manifest(RECORD), set())
        self.assertEqual(result[2]["status"], "FAIL")

    def test_bad_json_then_repair_passes(self):
        provider = FakeProvider(["not json", valid_response()])
        result, gates, input_tokens, output_tokens = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-TEST-001")
        self.assertEqual(provider.calls, 2)
        self.assertEqual(result["interpretation_id"], "INTERP-TEST-001")
        self.assertEqual([gate["status"] for gate in gates], ["PASS", "PASS", "PASS"])
        self.assertEqual((input_tokens, output_tokens), (20, 40))

    def test_schema_failure_after_repair_is_refused(self):
        provider = FakeProvider([valid_response().replace('"record.patterns.0"', '"record.missing"')] * 2)
        with self.assertRaises(InvariantViolation):
            run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-TEST-002")


if __name__ == "__main__":
    unittest.main()
