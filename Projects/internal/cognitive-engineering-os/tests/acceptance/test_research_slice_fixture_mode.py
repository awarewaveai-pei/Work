import shutil
import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
from ai_lego.errors import InvariantViolation
from tests.acceptance.criteria import SliceCriteriaMixin


class FixtureModeAcceptanceTests(SliceCriteriaMixin, unittest.TestCase):
    """Deterministic adapters: stdlib tone WAV + declared-transcript fixture. Runs on any machine."""

    @classmethod
    def setUpClass(cls):
        cls.runtime = Path(tempfile.mkdtemp(prefix="ai-lego-slice-fixture-"))
        cls.result = run_research_slice(SliceConfig(runtime_dir=cls.runtime, transcription="fixture", review="fixture"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.runtime, ignore_errors=True)

    def test_adapters_are_labelled_as_fixtures(self):
        self.assertEqual(
            self.result["adapters"],
            {"audio_mode": "SYNTHETIC_TONE_WAV_STDLIB", "transcription_mode": "SYNTHETIC_FIXTURE_TRANSCRIPT", "review_mode": "fixture", "coding_mode": "fixture", "open_coding_model": None, "coder_two": "synthetic_fixture"},
        )
        self.assertIsNone(self.result["open_coding"])
        self.assertIsNone(self.result["second_coder"])
        self.assertEqual(self.result["statistics"]["judgment_source"], "SYNTHETIC_48_UNITS")
        self.assertEqual(self.result["coding_outputs"]["coder_1"]["pending_labels_origin"], "fixture")

    def test_runtime_dir_inside_spec_root_is_refused(self):
        from ai_lego import resolve_spec_root

        with self.assertRaisesRegex(InvariantViolation, "RUNTIME_DIR_INSIDE_SPEC_ROOT"):
            run_research_slice(SliceConfig(runtime_dir=resolve_spec_root() / "runtime-should-not-exist"))

    def test_interactive_review_mode_reads_a_scripted_terminal_session(self):
        # AI-SUG-1: 'l' (lock the suggested label) -> 'y' (yes, this is a direct SOURCE_FACT quote).
        # AI-SUG-2: 'e' (edit) -> replacement label -> 'n' (do not lock the edited label).
        runtime = Path(tempfile.mkdtemp(prefix="ai-lego-slice-interactive-"))
        try:
            answers = iter(["l", "y", "e", "human_refined_label", "n"])
            output: list[str] = []
            result = run_research_slice(SliceConfig(runtime_dir=runtime, review="interactive", input_fn=lambda _: next(answers), output_fn=output.append))
            locked = result["coding_outputs"]["coder_1"]["code_set"][0]
            self.assertEqual(locked["code_id"], "CODE-LOCKED-P1-001")
            self.assertEqual(locked["provenance"], {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"})
            reviewed = next(code for code in result["coding_outputs"]["coder_1"]["code_set"] if code["code_id"] == "CODE-C1-002")
            self.assertEqual(reviewed["label"], "human_refined_label")
            self.assertEqual(reviewed["provenance"]["authorship_state"], "HUMAN_EDITED")
            self.assertIsNone(reviewed["provenance"]["locked"])
            self.assertEqual(result["gates"]["authorship"], "PASS")
            self.assertTrue(any(line.startswith("Review AI-SUG-1") for line in output))
            # the quote shown to the reviewer and copied into the ledger is the source's own PII-free `quote` field.
            events_text = "\n".join((runtime / "data" / "events" / "ledger.jsonl").read_text(encoding="utf-8").splitlines())
            self.assertNotIn("Mara Linden", events_text)
            self.assertNotIn("Elias Morgan", events_text)
        finally:
            shutil.rmtree(runtime, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
