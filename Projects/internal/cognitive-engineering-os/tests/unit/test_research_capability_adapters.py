import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.capability_adapters import pre_transcribed_input_adapter, research_paper_artifact_adapter, run_statistics_adapter
from ai_lego.modules.research.synthetic_fixtures import expanded_synthetic_coder_judgments


class ResearchCapabilityAdapterTests(unittest.TestCase):
    def test_pre_transcribed_adapter_requires_normalized_provenance_bearing_input(self):
        transcript = {"status": "normalized", "provenance": {"epistemic_type": "SOURCE_FACT"}}
        result = pre_transcribed_input_adapter({"transcript": transcript}, {})
        self.assertEqual(result["mode"], "PRE_TRANSCRIBED_INPUT")
        self.assertFalse(result["media_transcription_claimed"])
        with self.assertRaisesRegex(InvariantViolation, "TRANSCRIPT_NORMALIZED_INPUT_REQUIRED"):
            pre_transcribed_input_adapter({"transcript": {"status": "raw", "provenance": {}}}, {})

    def test_statistics_is_deterministic_trusted_compute(self):
        coder_one, coder_two = expanded_synthetic_coder_judgments()
        first = run_statistics_adapter({"rater_coding_set": {"coder_one": coder_one, "coder_two": coder_two}}, {})
        second = run_statistics_adapter({"coder_one": coder_one, "coder_two": coder_two}, {})
        self.assertEqual(first["interrater_reliability_result"], second["interrater_reliability_result"])
        self.assertEqual(first["interrater_reliability_result"]["provenance"]["epistemic_type"], "CALCULATED_RESULT")

    def test_statistics_rejects_missing_or_short_rater_set(self):
        with self.assertRaisesRegex(InvariantViolation, "RATER_CODING_SET_REQUIRED"):
            run_statistics_adapter({}, {})
        with self.assertRaisesRegex(InvariantViolation, "RATER_CODING_SET_INVALID"):
            run_statistics_adapter({"coder_one": ["a"], "coder_two": ["a"]}, {})

    def test_artifact_adapter_returns_value_without_path_side_effect(self):
        result = research_paper_artifact_adapter(
            {
                "triangulated_findings": {"findings": [{"finding_id": "F1"}]},
                "interrater_reliability_result": {"kappa": 0.75, "confidence_interval_95": [0.5, 0.9], "provenance": {"epistemic_type": "CALCULATED_RESULT"}},
            },
            {},
        )
        self.assertEqual(result["artifact"]["artifact_type"], "ResearchMemoArtifact")
        self.assertIn("Cohen's Kappa: 0.75", result["artifact"]["content"])

    def test_artifact_adapter_rejects_uncomputed_statistics(self):
        with self.assertRaisesRegex(InvariantViolation, "RESEARCH_MEMO_CALCULATED_RESULT_REQUIRED"):
            research_paper_artifact_adapter({"triangulated_findings": {"findings": []}, "interrater_reliability_result": {}}, {})
