"""Every paid model call the API makes goes through _MeteredProvider (budget check + worst-case reservation before it,
usage recorded after it). Codex 2026-09-28 found the class three times: an interpretation retry, a call bigger than
what was left, the draft endpoints. This test fails on a runner handed a provider that is not metered, and on a
model call made anywhere in the API package (main.py and the block routes in blocks/) outside _MeteredProvider."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

API = Path(__file__).resolve().parents[2] / "ai_lego" / "apps" / "api"
FILES = sorted(API.rglob("*.py"))
RUNNERS = {"draft_method_kwargs", "draft_recipe_source", "run_interpretation", "run_synthesis", "ask_ai"}
MODEL_CALLS = {"complete", "complete_json"}


def _unmetered(tree: ast.Module) -> tuple[int, list[str]]:
    """(runner calls seen, the ones whose provider= is not a _MeteredProvider built in the same function)."""
    seen, bad = 0, []
    for fn in (n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)):
        metered = {t.id for n in ast.walk(fn) if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call)
                   and getattr(n.value.func, "id", "") == "_MeteredProvider" for t in n.targets if isinstance(t, ast.Name)}
        for call in (n for n in ast.walk(fn) if isinstance(n, ast.Call) and getattr(n.func, "id", "") in RUNNERS):
            seen += 1
            value = next((k.value for k in call.keywords if k.arg == "provider"), None)
            built = isinstance(value, ast.Call) and getattr(value.func, "id", "") == "_MeteredProvider"
            if not (built or (isinstance(value, ast.Name) and value.id in metered)):
                bad.append(f"{fn.name}:{call.lineno} {call.func.id}")
    return seen, bad


def _direct_model_calls(tree: ast.Module) -> list[str]:
    outside = [node for node in tree.body if not (isinstance(node, ast.ClassDef) and node.name == "_MeteredProvider")]
    return [f"line {n.lineno} .{n.func.attr}()" for top in outside for n in ast.walk(top)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in MODEL_CALLS]


class EveryPaidCallIsMeteredTests(unittest.TestCase):
    def test_every_runner_in_the_api_gets_a_metered_provider(self):
        results = {path.name: _unmetered(ast.parse(path.read_text(encoding="utf-8"))) for path in FILES}
        self.assertEqual([item for _, bad in results.values() for item in bad], [], "wrap the provider in _MeteredProvider before handing it to a runner")
        self.assertGreaterEqual(sum(seen for seen, _ in results.values()), 5, "the runners (two drafts, interpretation, synthesis, the block AI gate) are all still called")

    def test_no_model_call_outside_the_metered_provider(self):
        self.assertEqual([f"{path.name} {call}" for path in FILES for call in _direct_model_calls(ast.parse(path.read_text(encoding="utf-8")))], [])

    def test_the_detector_sees_the_patterns_it_forbids(self):
        tree = ast.parse("def f(p, s):\n    run_synthesis(provider=p)\n    m = _MeteredProvider(p, s, s, 'x')\n    run_interpretation(provider=m)\n    p.complete('a', 'b', max_tokens=1)\n")
        self.assertEqual(_unmetered(tree), (2, ["f:2 run_synthesis"]))
        self.assertEqual(_direct_model_calls(tree), ["line 5 .complete()"])


if __name__ == "__main__":
    unittest.main()
