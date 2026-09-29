import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import yaml

from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.route_method import free_layer, route


class _Provider:
    model = "fake"

    def __init__(self, payload):
        self.payload = payload
        self.calls = 0

    def complete(self, system, user, *, max_tokens):
        self.calls += 1
        return type("Completion", (), {"text": self.payload, "model": self.model, "input_tokens": 1, "output_tokens": 2})()


class _Contracts:
    def __init__(self):
        self.validated = []

    def validate(self, reference, instance, label):
        self.validated.append((reference, instance, label))


def _catalog():
    return type("Catalog", (), {
        "methods": {
            "research.search": {"name_zh": "搜尋", "name_en": "Search", "blurb_zh": "找資料"},
            "research.compare": {"name_zh": "比較", "name_en": "Compare", "blurb_zh": "比較方案"},
        },
        "recipes": [{"id": "quick-search", "name": "Quick search", "name_zh": "快速搜尋", "blurb_zh": "先找資料"}],
    })()


def _spec_root(threshold=0.5):
    root = Path(tempfile.mkdtemp())
    (root / "evolution" / "ux-defaults").mkdir(parents=True)
    (root / "evolution" / "kinds.yaml").write_text("kinds:\n  ux-defaults:\n    risk_tier: R3\n", encoding="utf-8")
    version = {"kind": "ux-defaults", "version": "v1", "set_by": "operator", "route": {"free_layer_min_confidence": threshold}}
    version_path = root / "evolution" / "ux-defaults" / "v1.yaml"
    version_path.write_text(yaml.safe_dump(version), encoding="utf-8")
    digest = hashlib.sha256(version_path.read_bytes()).hexdigest()
    (root / "evolution" / "ux-defaults" / "champion.yaml").write_text(
        yaml.safe_dump({"kind": "ux-defaults", "version": "v1", "version_sha256": digest}), encoding="utf-8"
    )
    return root


class RouteMethodTests(unittest.TestCase):
    def test_free_layer_matches_cjk_and_latin_terms_then_id(self):
        hits = free_layer(_catalog(), "我要搜尋資料並比較方案")
        self.assertEqual([item["id"] for item in hits], ["quick-search", "research.compare", "research.search"])

    def test_high_confidence_does_not_call_provider(self):
        provider = _Provider('{"candidates": []}')
        result = route("搜尋資料", catalog=_catalog(), provider=provider, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertEqual(provider.calls, 0)
        self.assertFalse(result["needs_ai"])

    def test_low_confidence_uses_provider_and_requires_catalog_citations(self):
        provider = _Provider('{"candidates":[{"kind":"method","id":"research.search","why":"找資料","citations":["catalog:research.search"],"yields":"結果","est_cost":"低"}],"suggested_workflow":["research.search"]}')
        result = route("完全陌生的需求", catalog=_catalog(), provider=provider, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertEqual(provider.calls, 1)
        self.assertEqual(result["candidates"][0]["id"], "research.search")
        self.assertEqual(result["gates"]["rationale_cited"]["status"], "PASS")

    def test_no_provider_returns_free_result_needing_ai(self):
        result = route("完全陌生的需求", catalog=_catalog(), provider=None, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertTrue(result["needs_ai"])

    def test_hallucinated_id_is_removed(self):
        provider = _Provider('{"candidates":[{"kind":"method","id":"fake.nope","why":"x","citations":["catalog:fake.nope"],"yields":"x","est_cost":"低"}]}')
        result = route("完全陌生的需求", catalog=_catalog(), provider=provider, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertEqual(result["candidates"], [])
        self.assertEqual(result["gates"]["methods_resolvable"]["status"], "FAIL")

    def test_empty_text_is_rejected(self):
        with self.assertRaises(InvariantViolation):
            route(" ", catalog=_catalog(), provider=None, spec_root=_spec_root(), schema_contracts=_Contracts())

    def test_recipe_is_a_free_layer_candidate(self):
        hits = free_layer(_catalog(), "快速搜尋")
        self.assertEqual(hits[0]["kind"], "recipe")

    def test_uncited_ai_rationale_fails_gate(self):
        provider = _Provider('{"candidates":[{"kind":"method","id":"research.search","why":"找資料","citations":[],"yields":"結果","est_cost":"低"}]}')
        result = route("完全陌生的需求", catalog=_catalog(), provider=provider, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertEqual(result["gates"]["rationale_cited"]["status"], "FAIL")

    def test_more_than_three_ai_candidates_fails_without_emitting_more_than_three(self):
        candidates = [
            {"kind": "method", "id": "research.search", "why": "x", "citations": ["catalog:research.search"], "yields": "x", "est_cost": "低"},
            {"kind": "method", "id": "research.compare", "why": "x", "citations": ["catalog:research.compare"], "yields": "x", "est_cost": "低"},
            {"kind": "recipe", "id": "quick-search", "why": "x", "citations": ["catalog:quick-search"], "yields": "x", "est_cost": "低"},
            {"kind": "method", "id": "research.search", "why": "x", "citations": ["catalog:research.search"], "yields": "x", "est_cost": "低"},
        ]
        provider = _Provider(json.dumps({"candidates": candidates}))
        result = route("完全陌生的需求", catalog=_catalog(), provider=provider, spec_root=_spec_root(), schema_contracts=_Contracts())
        self.assertEqual(result["gates"]["max_three"]["status"], "FAIL")
        self.assertEqual(len(result["candidates"]), 3)

    def test_operator_threshold_changes_free_vs_ai_decision(self):
        provider = _Provider('{"candidates":[]}')
        route("搜尋資料", catalog=_catalog(), provider=provider, spec_root=_spec_root(1.1), schema_contracts=_Contracts())
        self.assertEqual(provider.calls, 1)


if __name__ == "__main__":
    unittest.main()
