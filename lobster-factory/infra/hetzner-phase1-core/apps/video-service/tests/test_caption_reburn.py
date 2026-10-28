import pathlib
import sys
import unittest
from unittest import mock

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import captions  # noqa: E402
import server  # noqa: E402

BASE = "https://v.example.com"
GOOD = {
    "clean_url": f"{BASE}/videoclean/abc12345_0123456789_t/16x9.mp4",
    "format": "16x9",
    "object_key": "video/abc12345_0123456789_t/16x9.mp4",
    "cues": [{"startMs": 0, "endMs": 1000, "text": "hi"}],
}


class BurnCues(unittest.TestCase):
    def test_long_cue_is_split_inside_its_own_time(self):
        out = captions.burn_cues([{"startMs": 1000, "endMs": 4000, "text": "aaaa。bbbbbb"}], lambda t: t.split("。"))
        self.assertEqual([c["text"] for c in out], ["aaaa", "bbbbbb"])
        self.assertEqual(out[0]["start_ms"], 1000)
        self.assertEqual(out[-1]["end_ms"], 4000)


class ReburnValidation(unittest.TestCase):
    def setUp(self):
        p = mock.patch.multiple(server, R2_VIDEO_PUBLIC_BASE=BASE, R2_API_TOKEN="t", R2_ACCOUNT_ID="a", R2_VIDEO_BUCKET="b")
        p.start()
        self.addCleanup(p.stop)

    def test_good_payload_parses(self):
        _, cues, fmt, key = server._validate_reburn(GOOD)
        self.assertEqual((fmt, key), ("16x9", GOOD["object_key"]))
        self.assertEqual(cues[0]["text"], "hi")

    def test_foreign_clean_source_rejected(self):
        with self.assertRaisesRegex(ValueError, "videoclean"):
            server._validate_reburn({**GOOD, "clean_url": "https://evil.example.com/videoclean/x/16x9.mp4"})

    def test_key_outside_video_dir_or_wrong_format_rejected(self):
        for key in ("videoclean/abc/16x9.mp4", "video/abc/9x16.mp4", "video/../x/16x9.mp4"):
            with self.assertRaisesRegex(ValueError, "object_key"):
                server._validate_reburn({**GOOD, "object_key": key})

    def test_overlapping_or_empty_cues_rejected(self):
        with self.assertRaisesRegex(ValueError, "重疊"):
            server._validate_reburn({**GOOD, "cues": [{"startMs": 0, "endMs": 900, "text": "a"}, {"startMs": 500, "endMs": 1500, "text": "b"}]})
        with self.assertRaisesRegex(ValueError, "text"):
            server._validate_reburn({**GOOD, "cues": [{"startMs": 0, "endMs": 900, "text": "  "}]})


if __name__ == "__main__":
    unittest.main()
