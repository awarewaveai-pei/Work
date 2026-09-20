"""Every worked example in methods/registry/method-form-examples.yaml fills the real form and produces
input the REAL builder + gates accept, and the dashboard's own JS serializer agrees with the Python mirror
on all of them.

Why data and not prose: the examples used to be paragraphs in method-display-metadata.yaml written against
the old raw-JSON form (English parameter names, JSON fragments, error codes). Prose cannot be tested, so it
silently stopped matching the form. These examples are the form's own input shape, checked here.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.api.method_form import load_examples
from tests.unit.test_method_form import SPEC_ROOT, _method_ids, collect_defs, invoke, method_form, serialize_fields

DASHBOARD = Path(__file__).resolve().parents[2] / "ai_lego" / "apps" / "api" / "dashboard.html"
# .cjs, not .js: the monorepo root package.json declares "type": "module", so a .js file cannot use require()
PARITY_HARNESS = Path(__file__).resolve().parents[1] / "js" / "method_form_parity.cjs"


class ExampleTests(unittest.TestCase):
    def setUp(self):
        self.examples = load_examples(SPEC_ROOT)

    def test_there_is_an_example_for_every_method_that_has_a_hand_form(self):
        expected = {method_id for method_id in _method_ids() if not method_form(method_id).get("workflow_only")}
        self.assertEqual(expected - set(self.examples), set())

    def test_every_example_is_input_the_real_builder_and_gates_accept(self):
        failures: dict[str, str] = {}
        for method_id, example in sorted(self.examples.items()):
            form = method_form(method_id)
            try:
                kwargs = serialize_fields(form["fields"], example["input"], collect_defs(form["fields"], {}), by_param=True)
                _, gates = invoke(method_id, kwargs)
            except Exception as error:  # noqa: BLE001 -- report every broken example, not just the first
                failures[method_id] = f"{type(error).__name__}: {str(error)[:200]}"
                continue
            failed = [gate.get("gate_id") for gate in gates if gate.get("status") not in ("PASS", "NOT_APPLICABLE")]
            if failed:
                failures[method_id] = f"gates failed: {failed}"
        self.assertEqual(failures, {})

    def test_every_example_only_uses_keys_the_form_actually_renders(self):
        """An example key the form cannot show would be invisible to whoever clicked 用這個範例填入."""
        stray = {}
        for method_id, example in sorted(self.examples.items()):
            keys = {field["key"] for field in method_form(method_id)["fields"]}
            extra = sorted(set(example["input"]) - keys)
            if extra:
                stray[method_id] = extra
        self.assertEqual(stray, {})


class JsSerializerParityTests(unittest.TestCase):
    """The Python serializer in test_method_form.py is only a mirror. This runs the REAL one, extracted
    verbatim from dashboard.html, over the same inputs -- a divergence means CI passes while the operator's
    browser sends something else."""

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_dashboard_js_and_python_produce_identical_payloads(self):
        examples = load_examples(SPEC_ROOT)
        cases = {}
        for method_id, example in sorted(examples.items()):
            form = method_form(method_id)
            cases[method_id] = {
                "fields": form["fields"],
                "input": example["input"],
                "python": serialize_fields(form["fields"], example["input"], collect_defs(form["fields"], {}), by_param=True),
            }
        with tempfile.TemporaryDirectory() as tmp:
            cases_path = Path(tmp) / "cases.json"
            cases_path.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
            result = subprocess.run(
                ["node", str(PARITY_HARNESS), str(DASHBOARD), str(cases_path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=180,
            )
        self.assertEqual(result.returncode, 0, f"stdout={result.stdout}\nstderr={result.stderr}")
        report = json.loads(result.stdout)
        self.assertEqual(report["different"], [], f"{len(report['different'])} methods disagree")
        self.assertEqual(report["identical"], len(cases))


if __name__ == "__main__":
    unittest.main()
