import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
