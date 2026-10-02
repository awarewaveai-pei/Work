"""Structured answers (ai_gateway/structured.py): every model answer that must be a JSON object is asked for with its
shape and read through the gateway; a schema failure says where it broke without saying what was there."""

from __future__ import annotations

import ast
import json
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import SchemaValidationError
from ai_lego.modules.research import route_method, synthesis, workflow_interpretation
from ai_lego.platform.ai_gateway.provider import AiCompletion
from ai_lego.platform.ai_gateway.structured import ask_object, parse_object, schema_lookup, tool_schema
from tests.unit.test_synthesis import _source_item

PACKAGE = Path(__file__).resolve().parents[2] / "ai_lego"
SPEC_ROOT = resolve_spec_root()
CONTRACTS = SchemaContracts(SPEC_ROOT)
DOSSIER = "ai-lego://specs/cognitive/typed-objects/dossier-brief.schema.yaml"

# Every plain model call allowed in ai_lego, with why it is not an object answer. A new `.complete(` must either go
# through ask_object or be added here with its reason.
PLAIN_CALLS = {
    ("platform/ai_gateway/structured.py", "provider.complete"): "ask_object's fallback for a provider without complete_json",
    ("apps/api/main.py", "self._inner.complete"): "_MeteredProvider passes the call through",
    ("modules/research/synthesis.py", "provider.complete"): "map step: free-text notes that are reduce's input, never an object",
    # The model-profile gateway (ai_execution) is a different seam: local/offline providers without tool calls, seeded;
    # its answers are validated by validate_codebook_response.
    ("modules/research/ai_coding.py", "gateway.complete"): "model-profile gateway, not the AnthropicProvider seam",
    ("modules/research/coding_eval.py", "self.inner.complete"): "model-profile gateway wrapper",
}
SCHEMA_CALLS = {
    ("platform/ai_gateway/structured.py", "provider.complete_json"),
    ("apps/api/main.py", "inner.complete_json"),
}


def _calls(name: str) -> set[tuple[str, str]]:
    found = set()
    for path in PACKAGE.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == name:
                found.add((path.relative_to(PACKAGE).as_posix(), ast.unparse(node.func)))
    return found


class Provider:
    """Offers complete_json, like the real provider: records the shape it was handed."""

    model = "test-model"

    def __init__(self, *answers: str) -> None:
        self.answers, self.schemas = list(answers), []

    def complete_json(self, system, user, *, max_tokens, input_schema=None, effort=None):
        self.schemas.append(input_schema)
        return AiCompletion(text=self.answers.pop(0), model=self.model, input_tokens=1, output_tokens=2)


class TextOnly:
    model = "fake"

    def __init__(self, text: str) -> None:
        self.text = text

    def complete(self, system, user, *, max_tokens):
        return AiCompletion(text=self.text, model=self.model, input_tokens=1, output_tokens=2)


class EveryObjectAnswerGoesThroughTheGateway(unittest.TestCase):
    def test_plain_model_calls_are_only_the_listed_ones(self):
        self.assertEqual(_calls("complete"), set(PLAIN_CALLS))

    def test_only_the_gateway_and_the_meter_hand_over_a_shape(self):
        self.assertEqual(_calls("complete_json"), SCHEMA_CALLS)

    def test_no_module_digs_json_out_of_text_itself(self):
        users = {path.relative_to(PACKAGE).as_posix() for path in PACKAGE.rglob("*.py") if "extract_json_object" in path.read_text(encoding="utf-8")}
        self.assertEqual(users, {"platform/ai_gateway/structured.py", "platform/ai_gateway/draft.py"})   # draft re-exports it


class AskObject(unittest.TestCase):
    def test_a_provider_that_takes_a_shape_gets_it(self):
        provider = Provider('{"a": 1}')
        self.assertEqual(parse_object(ask_object(provider, "s", "u", max_tokens=10, schema={"type": "object"})), {"a": 1})
        self.assertEqual(provider.schemas, [{"type": "object"}])

    def test_a_text_only_fake_answers_as_text_and_the_shape_is_never_built(self):
        def never():
            raise AssertionError("built for a provider that cannot take it")
        self.assertEqual(parse_object(ask_object(TextOnly('```json\n{"b": 2}\n```'), "s", "u", max_tokens=10, schema=never)), {"b": 2})


class ToolSchema(unittest.TestCase):
    def test_refs_are_inlined_and_only_standard_keywords_stay(self):
        contents, lookup = schema_lookup(CONTRACTS, DOSSIER)
        shape = tool_schema(contents, lookup=lookup, drop=("synthesis_id",))
        dumped = json.dumps(shape)
        self.assertNotIn("$ref", dumped)
        self.assertNotIn("pattern", dumped)
        self.assertNotIn("synthesis_id", dumped)
        self.assertEqual(shape["properties"]["sections"]["items"]["properties"]["claims"]["type"], "array")

    def test_a_ref_without_a_lookup_is_any_value(self):
        self.assertEqual(tool_schema({"type": "object", "properties": {"p": {"$ref": "#/x"}}}), {"type": "object", "properties": {"p": {}}})

    def test_each_caller_asks_for_what_the_model_writes(self):
        dossier = synthesis.answer_schema(CONTRACTS, DOSSIER)
        self.assertEqual(sorted(dossier["properties"]), ["conflicts", "gaps", "related_entities", "sections", "summary"])
        self.assertEqual(dossier["properties"]["summary"]["properties"]["citations"]["items"], {"type": "integer", "minimum": 1})
        self.assertEqual(dossier["properties"]["conflicts"]["items"]["properties"]["citations"]["minItems"], 2)
        literature = synthesis.answer_schema(CONTRACTS, "ai-lego://specs/cognitive/typed-objects/literature-matrix.schema.yaml")
        self.assertNotIn("source_id", literature["properties"]["studies"]["items"]["required"])
        route = route_method.answer_schema(CONTRACTS)
        self.assertEqual(sorted(route["properties"]), ["candidates", "suggested_workflow"])
        self.assertNotIn("score", route["properties"]["candidates"]["items"]["properties"])
        workflow = workflow_interpretation.answer_schema(CONTRACTS)
        self.assertEqual(sorted(workflow["properties"]["stations"]["items"]["properties"]), ["one_liner", "station_index"])


class Violations(unittest.TestCase):
    def test_a_violation_is_a_path_and_a_keyword_never_the_value(self):
        instance = {"text": "SECRET-VALUE", "citations": ["SECRET-ID", 5]}
        ref = DOSSIER + "#/$defs/summary"
        self.assertEqual(CONTRACTS.violations(ref, instance), ["citations[1] type"])
        with self.assertRaises(SchemaValidationError) as raised:
            CONTRACTS.validate(ref, {"text": "", "extra": "SECRET-VALUE"}, "summary")
        self.assertEqual(raised.exception.violations, ("$ additionalProperties", "$ required", "text minLength"))
        self.assertNotIn("SECRET", json.dumps(raised.exception.violations))


class SynthesisAsksWithItsShape(unittest.TestCase):
    def _run(self, provider):
        return synthesis.run_synthesis(kind="dossier_brief", project_id="P-1", subject={"name": "N", "kind": "person", "anchors": []},
                                       sources=[_source_item("s1")], provider=provider, spec_root=SPEC_ROOT, schema_contracts=CONTRACTS, synthesis_id="SYN-T")

    def test_the_reduce_call_carries_the_answer_schema(self):
        answer = {"summary": {"text": "x", "citations": [1]}, "sections": [{"heading": "身分與現況", "claims": [{"claim_id": "C1", "text": "y", "citations": [1]}]}], "related_entities": [], "gaps": [], "conflicts": []}
        provider = Provider(json.dumps(answer, ensure_ascii=False))
        outcome = self._run(provider)
        self.assertIsNone(outcome["error"], outcome["error"])
        self.assertEqual(provider.schemas, [synthesis.answer_schema(CONTRACTS, DOSSIER)])
        self.assertEqual(outcome["violations"], [])

    def test_a_rejected_answer_returns_where_it_broke(self):
        bad = json.dumps({"summary": {"text": "x", "citations": []}, "sections": [], "related_entities": [], "gaps": [], "conflicts": []})
        outcome = self._run(Provider(bad, bad))
        self.assertTrue(outcome["error"].startswith("SYNTHESIS_REJECTED_AFTER_REPAIR: SCHEMA_VALIDATION_FAILED"), outcome["error"])
        self.assertEqual(outcome["violations"], ["summary.citations minItems"])


if __name__ == "__main__":
    unittest.main()
