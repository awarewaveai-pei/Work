"""Offline tests for round 7: the model second coder (codebook pass), model suggestions flowing into human review,
and the Gateway's seed/temperature forwarding. No model is called; the real run is ``--coding local-llm``."""

from __future__ import annotations

import json
import unittest
from unittest import mock

from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.ai_coding import CODEBOOK_PROMPT_VERSION, apply_codebook, build_codebook_prompt, validate_codebook_response
from ai_lego.modules.research.qualitative_coding import assemble_coding_outputs
from ai_lego.modules.research.review import fixture_review
from ai_lego.modules.research.synthetic_fixtures import SUGGESTED_LABEL
from ai_lego.platform.ai_execution.gateway import AIGateway
from ai_lego.platform.net import egress
from tests.unit.test_ai_coding import UNITS, _StubGateway

CODEBOOK = ["after_hours_monitoring", "emotional_exhaustion", "late_night_rumination"]


class CodebookValidationTests(unittest.TestCase):
    def test_label_in_codebook_with_verbatim_evidence_is_accepted(self):
        raw = '[{"source_id":"SRC-3","label":"emotional_exhaustion","evidence_span":"feeling empty"}]'
        out = validate_codebook_response(raw, UNITS, CODEBOOK)
        self.assertEqual(out["labels"], {"SRC-3": "emotional_exhaustion"})
        self.assertEqual(out["missing"], ["SRC-4"])

    def test_label_outside_codebook_is_rejected_even_with_good_evidence(self):
        raw = '[{"source_id":"SRC-3","label":"burnout_spiral","evidence_span":"feeling empty"}]'
        out = validate_codebook_response(raw, UNITS, CODEBOOK)
        self.assertEqual(out["labels"], {})
        self.assertEqual(out["rejected"][0]["reason"], "LABEL_NOT_IN_CODEBOOK")

    def test_fabricated_evidence_still_rejected_before_the_codebook_check(self):
        raw = '[{"source_id":"SRC-3","label":"emotional_exhaustion","evidence_span":"I cried"}]'
        out = validate_codebook_response(raw, UNITS, CODEBOOK)
        self.assertEqual(out["rejected"][0]["reason"], "FABRICATED_EVIDENCE")

    def test_prompt_lists_codebook_then_units(self):
        prompt = build_codebook_prompt(UNITS, CODEBOOK)
        self.assertLess(prompt.index("- after_hours_monitoring"), prompt.index("[SRC-3]"))

    def test_prompt_without_definitions_is_the_bare_v2_shape_and_with_definitions_renders_label_colon_definition(self):
        bare = build_codebook_prompt(UNITS, CODEBOOK)
        self.assertIn("Codebook (allowed labels):\n\n- after_hours_monitoring\n- emotional_exhaustion\n", bare)
        defined = build_codebook_prompt(UNITS, CODEBOOK, {"emotional_exhaustion": "feeling drained or empty"})
        self.assertIn("Codebook (allowed labels, each with its definition):", defined)
        self.assertIn("\n- emotional_exhaustion: feeling drained or empty\n", defined)
        self.assertIn("\n- after_hours_monitoring\n", defined)  # a label without a definition stays bare


class ApplyCodebookTests(unittest.TestCase):
    def test_second_pass_is_seeded_temperature_zero_and_recorded(self):
        gateway = _StubGateway('[{"source_id":"SRC-3","label":"emotional_exhaustion","evidence_span":"feeling empty"},{"source_id":"SRC-4","label":"late_night_rumination","evidence_span":"Reading project updates"}]')
        out = apply_codebook(gateway, "p", UNITS, CODEBOOK, pii_guard=PiiLedgerGuard(), classification_tag="Confidential", trace_id="T:2", seed=7)
        call = gateway.calls[0]
        self.assertEqual((call["seed"], call["temperature"], call["prompt_version"]), (7, 0.0, CODEBOOK_PROMPT_VERSION))
        self.assertEqual(out["labels"], {"SRC-3": "emotional_exhaustion", "SRC-4": "late_night_rumination"})
        self.assertEqual(out["suggestion_source"]["seed"], 7)
        self.assertEqual(out["codebook"], sorted(CODEBOOK))

    def test_definitions_travel_in_the_checked_frame_and_are_recorded(self):
        gateway = _StubGateway('[{"source_id":"SRC-3","label":"emotional_exhaustion","evidence_span":"feeling empty"}]')
        out = apply_codebook(gateway, "p", UNITS, CODEBOOK, pii_guard=PiiLedgerGuard(), classification_tag="Confidential", trace_id="T:3", definitions={"emotional_exhaustion": "feeling drained or empty"})
        self.assertIn("- emotional_exhaustion: feeling drained or empty", gateway.calls[0]["prompt"])
        self.assertEqual(out["definitions_given"], ["emotional_exhaustion"])
        self.assertEqual(out["labels"], {"SRC-3": "emotional_exhaustion"})

    def test_a_definition_for_a_label_outside_the_codebook_is_refused_before_any_call(self):
        gateway = _StubGateway("[]")
        with self.assertRaisesRegex(InvariantViolation, "CODEBOOK_DEFINITION_UNKNOWN_LABEL"):
            apply_codebook(gateway, "p", UNITS, CODEBOOK, pii_guard=PiiLedgerGuard(), classification_tag="Confidential", trace_id="T", definitions={"not_a_label": "x"})
        self.assertEqual(gateway.calls, [])

    def test_a_definition_carrying_detected_pii_trips_the_guard_before_any_call(self):
        guard = PiiLedgerGuard()
        guard.register("P9.name", "Zelda Quorn")
        gateway = _StubGateway("[]")
        with self.assertRaisesRegex(InvariantViolation, "MODEL_INPUT_PII_GUARD_TRIPPED"):
            apply_codebook(gateway, "p", UNITS, CODEBOOK, pii_guard=guard, classification_tag="Confidential", trace_id="T", definitions={"emotional_exhaustion": "what Zelda Quorn said"})
        self.assertEqual(gateway.calls, [])

    def test_empty_codebook_is_an_error(self):
        with self.assertRaisesRegex(InvariantViolation, "CODEBOOK_EMPTY"):
            apply_codebook(_StubGateway("[]"), "p", UNITS, [], pii_guard=PiiLedgerGuard(), classification_tag="Confidential", trace_id="T")


class ReviewWithModelSuggestionsTests(unittest.TestCase):
    def test_fixture_review_locks_the_model_suggestion_and_records_what_was_proposed(self):
        locked, suggestion = fixture_review({"SRC-1": "checking_after_dinner", "SRC-2": "evening_planning"})
        self.assertEqual(locked["label"], "checking_after_dinner")
        self.assertEqual(locked["provenance"]["locked"], "LOCKED_FACT")
        self.assertEqual(suggestion["suggested_label"], "evening_planning")
        self.assertEqual(suggestion["result_label"], SUGGESTED_LABEL)  # the human's edit overrides the model, visibly
        self.assertEqual(suggestion["action"], "EDIT")

    def test_fixture_review_without_suggestions_is_unchanged(self):
        locked, suggestion = fixture_review()
        self.assertEqual(locked["label"], SUGGESTED_LABEL)
        self.assertEqual(suggestion["suggested_label"], SUGGESTED_LABEL)


class AssembleWithModelSecondCoderTests(unittest.TestCase):
    def test_model_second_coder_is_labelled_as_ai_never_as_human(self):
        locked, review = fixture_review()
        source = {"model_identifier": "gemma3:4b", "seed": 20260904}
        outputs = assemble_coding_outputs(locked, review, "2026-09-04T00:00:00Z", coder_two_labels={"SRC-1": "after_hours_monitoring", "SRC-3": "emotional_exhaustion"}, coder_two_source=source)
        coder_two = outputs["coder_2"]
        self.assertEqual(coder_two["coder_id"], "CODER-2-MODEL")
        self.assertEqual(coder_two["coder_kind"], "model")
        self.assertFalse(coder_two["synthetic_fixture"])
        for code in coder_two["code_set"]:
            self.assertEqual(code["provenance"]["authorship_state"], "AI_SUGGESTED")
            self.assertIsNone(code["human_action"])
            self.assertNotIn("synthetic_fixture", code)
            self.assertEqual(code["suggestion_source"], source)

    def test_v11_theme_whose_categories_never_materialised_is_absent_not_empty(self):
        """Real coders can produce labels outside the fixture axial map; a v11 theme with no category under it must
        not be emitted empty (the methodology gate rejects a theme whose codes are unreachable via categories)."""
        from ai_lego.modules.research.gates import evaluate_methodology_gate

        locked, review = fixture_review({"SRC-1": "checking_after_dinner", "SRC-2": "planning_evenings"})
        outputs = assemble_coding_outputs(
            locked,
            review,
            "2026-09-04T00:00:00Z",
            pending_ai_labels={"SRC-3": "feeling_empty", "SRC-4": "late_night_thinking"},
            suggestion_source={"model_identifier": "stub"},
            coder_two_labels={"SRC-1": "checking_after_dinner", "SRC-2": "checking_after_dinner", "SRC-3": "feeling_empty", "SRC-4": "late_night_thinking"},
            coder_two_source={"model_identifier": "stub"},
        )
        for theme in outputs["theme_set"]["themes"]:
            self.assertTrue(theme["category_ids"], theme)
        self.assertEqual([t["theme_id"] for t in outputs["theme_set"]["themes"]], [f"THEME-{i}" for i in range(1, len(outputs["theme_set"]["themes"]) + 1)])
        passed, evidence = evaluate_methodology_gate(outputs)
        self.assertTrue(passed, evidence)

    def test_default_second_coder_is_still_the_synthetic_fixture(self):
        locked, review = fixture_review()
        outputs = assemble_coding_outputs(locked, review, "2026-09-04T00:00:00Z")
        self.assertEqual(outputs["coder_2"]["coder_kind"], "synthetic_fixture")
        self.assertTrue(outputs["coder_2"]["synthetic_fixture"])


class GatewayOptionsTests(unittest.TestCase):
    def test_ollama_payload_carries_seed_and_temperature_only_when_given(self):
        gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b"}})
        with mock.patch.object(egress._LOOPBACK_OPENER, "open") as opened:
            opened.return_value.__enter__.return_value.read.return_value = json.dumps({"message": {"content": "[]"}}).encode("utf-8")
            gateway.complete("local", system="s", prompt="p", seed=42, temperature=0.0)
            with_options = json.loads(opened.call_args[0][0].data.decode("utf-8"))
            gateway.complete("local", system="s", prompt="p")
            without_options = json.loads(opened.call_args[0][0].data.decode("utf-8"))
        self.assertEqual(with_options["options"], {"seed": 42, "temperature": 0.0})
        self.assertNotIn("options", without_options)


if __name__ == "__main__":
    unittest.main()
