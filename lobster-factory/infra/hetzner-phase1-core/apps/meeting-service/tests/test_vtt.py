import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from lib.transcribe import fmt_vtt_ts, write_vtt


class VttWriterTests(unittest.TestCase):
    def test_timestamp_handles_hour_boundary(self):
        self.assertEqual(fmt_vtt_ts(3600.125), "01:00:00.125")

    def test_writer_has_header_ids_and_dot_timestamps(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "transcript.vtt"
            write_vtt([{"id": 7, "start": 0, "end": 1.25, "text": "測試"}], str(path))
            self.assertEqual(path.read_text(encoding="utf-8"), "WEBVTT\n\n7\n00:00:00.000 --> 00:00:01.250\n測試\n\n")

    def test_writer_sanitizes_carriage_return_in_id(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "transcript.vtt"
            write_vtt([{"id": "a\r\nb", "start": 0, "end": 1, "text": "x"}], str(path))
            self.assertIn("a  b\n", path.read_text(encoding="utf-8"))

    def test_download_mapping_is_allowlisted(self):
        from app import DOWNLOADS
        self.assertEqual(DOWNLOADS["transcript_vtt"][0], "transcript.vtt")
        self.assertNotIn("../transcript.vtt", DOWNLOADS)

    def test_pipeline_writes_vtt_to_job_directory(self):
        import pipeline

        with tempfile.TemporaryDirectory() as d, patch.object(pipeline, "transcribe", return_value={
            "segments": [{"id": 1, "start": 0, "end": 1, "text": "x"}],
            "audio_duration_sec": 1, "realtime_factor": 1, "backend": "cpu",
        }), patch.object(pipeline.merge_segments, "merge", return_value=[]), patch.object(
            pipeline.hallucination, "suspect_ids", return_value=([], {"suspect_pct_segments": 0, "suspect_pct_chars": 0})
        ), patch.object(pipeline.summarize, "build_transcript_text", return_value="x"), patch.object(
            pipeline.summarize, "build_prompt", return_value="prompt"
        ), patch.object(pipeline.keep_awake, "prevent_sleep"), patch.object(pipeline.keep_awake, "allow_sleep"):
            pipeline.run_pipeline_phase1(d, "input.mp4", do_diarize=False)
            self.assertEqual((Path(d) / "transcript.vtt").read_text(encoding="utf-8").splitlines()[0], "WEBVTT")


if __name__ == "__main__":
    unittest.main()
