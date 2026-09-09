import unittest

from quality import evaluate_probe, evaluate_signal_quality


class TechnicalQualityTests(unittest.TestCase):
    def test_valid_probe_passes_and_records_measurements(self):
        report = evaluate_probe({
            "streams": [{"codec_type": "video", "width": 1080, "height": 1920}, {"codec_type": "audio"}],
            "format": {"duration": "4.25"},
        }, (1080, 1920))
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["measurements"]["durationSeconds"], 4.25)
        self.assertEqual(report["findings"], [])

    def test_missing_audio_and_wrong_dimensions_fail_closed(self):
        report = evaluate_probe({
            "streams": [{"codec_type": "video", "width": 1920, "height": 1080}],
            "format": {"duration": "2"},
        }, (1080, 1920))
        self.assertEqual(report["status"], "failed")
        self.assertEqual({f["ruleId"] for f in report["findings"]}, {"container.audio_stream", "output.profile_dimensions"})

    def test_missing_video_and_duration_fail_closed(self):
        report = evaluate_probe({"streams": [], "format": {}}, None)
        self.assertEqual(report["status"], "failed")
        self.assertIn("container.video_stream", {f["ruleId"] for f in report["findings"]})
        self.assertIn("duration.positive", {f["ruleId"] for f in report["findings"]})

    def test_signal_qa_reports_black_freeze_loudness_and_caption_evidence(self):
        report = evaluate_signal_quality(
            {"format": {"duration": "4"}},
            {"blackRatio": 0.4, "freezeEvents": 1, "integratedLufs": -4, "truePeakDb": 0.2},
            [{"startMs": 0, "endMs": 5000, "text": "too long"}],
        )
        self.assertEqual(report["status"], "failed")
        self.assertEqual({f["ruleId"] for f in report["findings"]}, {"picture.black_frames", "picture.freeze", "audio.loudness", "audio.true_peak", "caption.timing"})


if __name__ == "__main__":
    unittest.main()
