import pathlib
import sys
import unittest

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from server import _validate_footage  # noqa: E402


class FootageRenderValidationTests(unittest.TestCase):
    def test_valid_payload_parses(self):
        clips, formats, out_name, audio, captions = _validate_footage({
            "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 2000}],
            "formats": ["16x9"],
            "out_name": "n",
            "audio": {"source_url": "https://cdn/a.mp3", "source_start_ms": 0, "duration_ms": 2000},
            "captions": [{"start_ms": 0, "end_ms": 500, "text": "ok"}],
        })
        self.assertEqual(len(clips), 1)
        self.assertEqual(formats, ["16x9"])
        self.assertEqual(out_name, "n")
        self.assertIsNotNone(audio)
        self.assertEqual(len(captions), 1)

    def test_minimal_payload_has_no_audio_or_captions(self):
        _, _, _, audio, captions = _validate_footage({
            "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
            "formats": ["9x16"],
        })
        self.assertIsNone(audio)
        self.assertIsNone(captions)

    def test_empty_clips_rejected(self):
        with self.assertRaisesRegex(ValueError, "clips 必須是非空 list"):
            _validate_footage({"clips": [], "formats": ["16x9"]})

    def test_non_https_source_url_rejected(self):
        with self.assertRaisesRegex(ValueError, r"source_url 必須是 https:// URL"):
            _validate_footage({
                "clips": [{"source_url": "/etc/passwd", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
            })

    def test_negative_source_start_ms_rejected(self):
        with self.assertRaisesRegex(ValueError, "source_start_ms 必須是非負數"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": -1, "duration_ms": 1000}],
                "formats": ["16x9"],
            })

    def test_zero_duration_rejected(self):
        with self.assertRaisesRegex(ValueError, "duration_ms 必須是正數"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 0}],
                "formats": ["16x9"],
            })

    def test_nan_duration_rejected(self):
        with self.assertRaisesRegex(ValueError, "duration_ms 必須是正數"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": float("nan")}],
                "formats": ["16x9"],
            })

    def test_infinite_duration_rejected(self):
        with self.assertRaisesRegex(ValueError, "duration_ms 必須是正數"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": float("inf")}],
                "formats": ["16x9"],
            })

    def test_clip_duration_ceiling_rejected(self):
        with self.assertRaisesRegex(ValueError, "duration_ms 過長"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 30 * 60 * 1000}],
                "formats": ["16x9"],
            })

    def test_too_many_clips_rejected(self):
        clips = [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}] * 121
        with self.assertRaisesRegex(ValueError, "clips 過多"):
            _validate_footage({"clips": clips, "formats": ["16x9"]})

    def test_unknown_format_rejected(self):
        with self.assertRaisesRegex(ValueError, "未知格式"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["bogus"],
            })

    def test_audio_missing_source_url_rejected(self):
        with self.assertRaisesRegex(ValueError, "audio.source_url"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
                "audio": {"source_url": "", "source_start_ms": 0, "duration_ms": 1000},
            })

    def test_audio_duration_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "與 clips 總長度"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
                "audio": {"source_url": "https://cdn/a.mp3", "source_start_ms": 0, "duration_ms": 5000},
            })

    def test_audio_duration_within_tolerance_accepted(self):
        _, _, _, audio, _ = _validate_footage({
            "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
            "formats": ["16x9"],
            "audio": {"source_url": "https://cdn/a.mp3", "source_start_ms": 0, "duration_ms": 1050},
        })
        self.assertIsNotNone(audio)

    def test_caption_non_increasing_time_rejected(self):
        with self.assertRaisesRegex(ValueError, "遞增的 start_ms/end_ms"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
                "captions": [{"start_ms": 10, "end_ms": 5, "text": "a"}],
            })

    def test_caption_blank_text_rejected(self):
        with self.assertRaisesRegex(ValueError, "text 必須是非空字串"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
                "captions": [{"start_ms": 0, "end_ms": 5, "text": "   "}],
            })

    def test_too_many_captions_rejected(self):
        captions = [{"start_ms": i, "end_ms": i + 1, "text": "a"} for i in range(121)]
        with self.assertRaisesRegex(ValueError, "captions 過多"):
            _validate_footage({
                "clips": [{"source_url": "https://cdn/clip.mp4", "source_start_ms": 0, "duration_ms": 1000}],
                "formats": ["16x9"],
                "captions": captions,
            })


if __name__ == "__main__":
    unittest.main()
