"""Offline tests for the meeting-service transcription adapter: segment mapping (the diarization-honesty
invariant), availability reasons, and by-path lib loading. The real GPU + pyannote run is the CLI
``--transcription meeting-service`` path, not repeated here."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ai_lego.errors import AdapterUnavailable
from ai_lego.modules.knowledge.ingest.transcription import (
    DIARIZATION_NO_MATCH,
    DIARIZATION_PYANNOTE,
    MEETING_SERVICE_DIR_ENV,
    SPEAKER_UNRESOLVED,
    load_meeting_service_lib,
    map_diarized_segment,
    meeting_service_availability,
    resolve_meeting_service_dir,
)


class SegmentMappingTests(unittest.TestCase):
    def test_direct_exclusive_hit_is_a_real_pyannote_label(self):
        out = map_diarized_segment({"start": 0.5, "end": 2.25, "text": " hello ", "speaker": "A", "avg_logprob": -0.1, "no_speech_prob": 0.01})
        self.assertEqual(out["speaker"], "SPEAKER_A")
        self.assertEqual(out["diarization"], DIARIZATION_PYANNOTE)
        self.assertEqual(out["speaker_inference"], "direct")
        self.assertEqual((out["start_seconds"], out["end_seconds"], out["text"]), (0.5, 2.25, "hello"))

    def test_overlap_and_proximity_routes_are_named_not_hidden(self):
        self.assertEqual(map_diarized_segment({"start": 0, "end": 1, "text": "x", "speaker": "B", "speaker_inferred": "overlap"})["speaker_inference"], "overlap")
        self.assertEqual(map_diarized_segment({"start": 0, "end": 1, "text": "x", "speaker": "B", "speaker_inferred": "proximity"})["speaker_inference"], "proximity")

    def test_unplaceable_segment_is_unresolved_never_folded_into_a_speaker(self):
        for label in ("?", "", None):
            row = {"start": 0, "end": 1, "text": "x"}
            if label is not None:
                row["speaker"] = label
            out = map_diarized_segment(row)
            self.assertEqual(out["speaker"], SPEAKER_UNRESOLVED, label)
            self.assertEqual(out["diarization"], DIARIZATION_NO_MATCH, label)
            self.assertIsNone(out["speaker_inference"], label)


class AvailabilityTests(unittest.TestCase):
    def test_missing_libs_report_which_files_and_where(self):
        with tempfile.TemporaryDirectory() as tmp:
            available, reason = meeting_service_availability(Path(tmp))
        self.assertFalse(available)
        self.assertIn("transcribe, diarize", reason)
        self.assertIn(tmp, reason)

    def test_missing_hf_token_is_reported_without_printing_any_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "lib"
            lib.mkdir()
            (lib / "transcribe.py").write_text("", encoding="utf-8")
            (lib / "diarize.py").write_text("", encoding="utf-8")
            with mock.patch("importlib.import_module", return_value=object()), mock.patch.dict(os.environ, {"HF_TOKEN": ""}):
                available, reason = meeting_service_availability(Path(tmp))
        self.assertFalse(available)
        self.assertIn("HF_TOKEN not set", reason)

    def test_env_override_wins_over_default_dir(self):
        with mock.patch.dict(os.environ, {MEETING_SERVICE_DIR_ENV: r"D:\nowhere\meeting-service"}):
            self.assertEqual(resolve_meeting_service_dir(), Path(r"D:\nowhere\meeting-service"))


class LibLoadingTests(unittest.TestCase):
    def test_loads_by_path_under_a_private_module_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "lib"
            lib.mkdir()
            (lib / "transcribe.py").write_text("MARK = 'loaded-by-path'\n", encoding="utf-8")
            module = load_meeting_service_lib("transcribe", Path(tmp))
        self.assertEqual(module.MARK, "loaded-by-path")
        self.assertEqual(module.__name__, "ai_lego_ext_meeting_service_transcribe")

    def test_missing_file_raises_adapter_unavailable_naming_the_env_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(AdapterUnavailable, f"MEETING_SERVICE_LIB_MISSING.*{MEETING_SERVICE_DIR_ENV}"):
                load_meeting_service_lib("diarize", Path(tmp))


if __name__ == "__main__":
    unittest.main()
