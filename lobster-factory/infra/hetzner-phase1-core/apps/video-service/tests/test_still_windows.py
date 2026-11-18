"""Intended stills (title cards, template intro/outro) are not picture defects; a frozen main shot still is.
2026-11-18 Soulful: freezedetect over the whole output counted the 3 s title card (0.625 -> 2.542 s) on every ratio, so
technical QA could never pass a video with a title-card bookend; a black title card also counts as black frames."""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("ALLOW_INSECURE_LOCAL_RENDER", "true")

import pipeline  # noqa: E402
import server  # noqa: E402


def _codes(item: dict) -> set:
    return {f["ruleId"] for f in item["signal_qa"]["findings"]}


class StillWindowsTag(unittest.TestCase):
    def test_round_trip_and_untagged(self):
        tag = pipeline._stills_tag([(0.0, 2.0), (6.5, 8.5)])
        probe = {"format": {"tags": {"comment": tag[1].split("=", 1)[1]}}}
        self.assertEqual(pipeline.still_windows(probe), [(0.0, 2.0), (6.5, 8.5)])
        self.assertEqual(pipeline.still_windows({"format": {}}), [])
        self.assertEqual(pipeline.still_windows({"format": {"tags": {"comment": "made on a phone"}}}), [])
        self.assertEqual(pipeline._stills_tag([]), [])

    def test_counting_rules(self):
        stills = [(0.0, 3.0)]
        self.assertTrue(server._inside((0.625, 2.542), stills))
        self.assertFalse(server._inside((0.625, 4.0), stills), "a freeze that runs past the title card counts")
        self.assertFalse(server._inside((10.0, 12.0), stills))
        self.assertEqual(server._outside_seconds((2.0, 5.0), stills), 2.0)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe") and pipeline._font_path(), "needs ffmpeg + fonts")
class JoinedVideoQa(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.temp = mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(self.dir))
        self.temp.start()
        self.voice, self.photo, self.frozen = f"{self.dir}/v.wav", f"{self.dir}/p.png", f"{self.dir}/frozen.mp4"
        run = lambda *a: subprocess.run(["ffmpeg", "-y", "-v", "error", *a], check=True, capture_output=True)
        run("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-af", "volume=-12dB", self.voice)
        run("-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1", self.photo)
        # a "stock clip" whose picture never moves: the main video freezes for its whole scene
        run("-loop", "1", "-i", self.photo, "-t", "4", "-r", "24", "-c:v", "libx264", "-pix_fmt", "yuv420p", self.frozen)

    def tearDown(self):
        self.temp.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def joined(self, assets):
        b = {"intro": {"title": "片頭", "duration": 2.0}, "outro": {"title": "謝謝收看", "duration": 2.0},
             "transition": "crossfade", "transition_s": 0.5}
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.5):
            out = pipeline.compose_base_video([{"narration": "一"}] * len(assets), assets, [self.voice] * len(assets), "v",
                                              640, 360, 24, burn_captions=False, bookends=b)
        return self.meta(out)

    def meta(self, path):
        with mock.patch.dict(pipeline.config.FORMATS, {"16x9": (640, 360)}):
            return server._build_output_meta({"16x9": path})["16x9"]

    def test_still_title_cards_are_not_freeze_or_black(self):
        item = self.joined([self.photo, self.photo])  # 2 + 5 + 2 - 1 = 8 s, 4 s of it title cards on black
        self.assertNotIn("picture.freeze", _codes(item))
        self.assertNotIn("picture.black_frames", _codes(item))
        self.assertEqual(item["signal_qa"]["measurements"]["freezeEvents"], 0)
        self.assertEqual(len(item["signal_qa"]["measurements"]["stillWindows"]), 2)

    def test_a_frozen_main_shot_still_warns(self):
        item = self.joined([self.photo, self.frozen])
        self.assertIn("picture.freeze", _codes(item))

    def test_the_windows_survive_a_caption_burn(self):
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.5):
            out = pipeline.compose_base_video([{"narration": "一"}] * 2, [self.photo] * 2, [self.voice] * 2, "v", 640, 360, 24,
                                              burn_captions=False, bookends={"intro": {"title": "片頭", "duration": 2.0},
                                                                             "outro": None, "transition": "none"})
        burned = f"{self.dir}/burned.mp4"
        pipeline.burn_script_captions(out, [{"startMs": 2500, "endMs": 3500, "text": "第一句"}], burned)
        self.assertEqual(pipeline.still_windows(server._probe_video(burned)), [(0.0, 2.0)])
        self.assertNotIn("picture.freeze", _codes(self.meta(burned)))


if __name__ == "__main__":
    unittest.main()
