"""``art-therapy-unstick-v1`` -- the operator's "participant is stuck" chain, run end to end through the API."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_metaphor_dialogue_slice import fixture_args as dialogue_args
from ai_lego.apps.cli.run_reframing_slice import fixture_args as reframing_args
from ai_lego.apps.cli.run_value_clarification_slice import fixture_args as value_args
from ai_lego.apps.cli.run_visual_metaphor_slice import fixture_args as metaphor_args
from ai_lego.core.domain.provenance import make_provenance
from tests.unit.test_api_main import ApiTestCase

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def unstick_source() -> dict:
    vm, md, rf, vc = metaphor_args()[0], dialogue_args()[0], reframing_args()[0], value_args()[0]
    return {
        "visual_metaphor": {"record_id": vm[0], "felt_experience": vm[1], "image": vm[2], "metaphor_statement": vm[3], "elements": vm[4], "provenance": P},
        "metaphor_dialogue": {"record_id": md[0], "figure": md[1], "exchanges": md[2], "integration_note": md[3], "provenance": P},
        "reframing": {"record_id": rf[0], "original_frame": rf[1], "reframes": rf[2], "provenance": P},
        "value_clarification": {"record_id": vc[0], "transformation_context": vc[1], "core_values": vc[2], "provenance": P},
    }


class ArtTherapyUnstickRecipeTests(ApiTestCase):
    def test_recipe_runs_all_four_methods_through_the_shared_executor(self):
        self._login()
        response = self.client.post("/recipes/art-therapy-unstick-v1/run", json={"source": unstick_source(), "run_id": "api-art-unstick-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS", payload)
        self.assertEqual([s["ref"] for s in payload["workflow"]["steps"]], ["art_therapy.visual_metaphor", "art_therapy.metaphor_dialogue", "framing.reframing", "art_therapy.value_clarification"])
        outputs = payload["workflow"]["context"]["outputs"]
        self.assertEqual(outputs["value_clarification"]["core_values"][0]["value"], "自主")
        self.assertTrue(all(g["status"] == "PASS" for g in payload["workflow_gates"]), payload["workflow_gates"])

    def test_a_tampered_record_fails_the_run_not_the_server(self):
        self._login()
        source = unstick_source()
        source["reframing"]["reframes"][0]["statement"] = source["reframing"]["original_frame"]["statement"]  # reframe that repeats the original
        response = self.client.post("/recipes/art-therapy-unstick-v1/run", json={"source": source, "run_id": "api-art-unstick-tamper"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("REFRAME_INVALID_REFRAMES", payload["workflow"]["steps"][2]["error"])


if __name__ == "__main__":
    unittest.main()
