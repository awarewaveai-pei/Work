"""The three web form payload fixtures must pass the real invoke endpoint."""

from __future__ import annotations

import json
from pathlib import Path

from tests.unit.test_api_main import ApiTestCase
from tests.unit.test_method_form import collect_defs, method_form, serialize_fields


FIXTURES = Path(__file__).resolve().parents[2] / "apps" / "cognitive-web" / "fixtures"


class WebFormPayloadTests(ApiTestCase):
    def test_three_payloads_invoke(self):
        self._login()
        for method_id in ("systems.iceberg_model", "decision.eisenhower_matrix", "decision.decision_tree"):
            with self.subTest(method_id=method_id):
                payload = json.loads((FIXTURES / f"payload-{method_id}.json").read_text(encoding="utf-8"))
                form = method_form(method_id)
                dashboard_payload = serialize_fields(form["fields"], payload, collect_defs(form["fields"], {}), by_param=True)
                self.assertEqual(payload, dashboard_payload)
                response = self.client.post(f"/methods/{method_id}/invoke", json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("record", response.json())
