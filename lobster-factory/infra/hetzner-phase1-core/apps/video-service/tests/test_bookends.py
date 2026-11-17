"""Plan U5.4 片頭／片尾接成一支: validation of the new payload fields, the old path untouched when none are sent, and
(with ffmpeg) one video whose length is intro + main - transition with the captions moved to where the main video starts."""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import pipeline  # noqa: E402
from server import _validate_bookends  # noqa: E402

FA = {"16x9": ["https://cdn/a.png"]}


class BookendValidation(unittest.TestCase):
    def test_no_intro_or_outro_is_the_old_path(self):
        self.assertIsNone(_validate_bookends({"format_assets": FA, "intro_title": "舊片頭"}))

    def test_title_and_template_segments(self):
        b = _validate_bookends({"format_assets": FA, "intro": {"asset_url": "https://r2/intro.mp4"},
                                "outro": {"title": "謝謝收看", "duration": 3}, "transition": "crossfade", "transition_duration": 0.5})
        self.assertEqual(b, {"intro": {"asset_url": "https://r2/intro.mp4"}, "outro": {"title": "謝謝收看", "duration": 3.0},
                             "transition": "crossfade", "transition_s": 0.5})

    def test_refusals(self):
        for payload, msg in [
            ({"format_assets": FA, "intro": {"title": "a", "duration": 3}, "intro_title": "b"}, "擇一"),
            ({"intro": {"title": "a", "duration": 3}}, "format_assets"),
            ({"format_assets": FA, "intro": {"asset_url": "http://x/a.mp4"}}, "https"),
            ({"format_assets": FA, "intro": {"title": "a", "duration": 3}, "transition": "wipe"}, "transition"),
            ({"format_assets": FA, "intro": {"title": "a", "duration": 3}, "transition": "crossfade", "transition_duration": 5}, "0.2"),
        ]:
            with self.assertRaisesRegex(ValueError, msg):
                _validate_bookends(payload)


class OldPathUnchanged(unittest.TestCase):
    def test_without_bookends_the_scenes_are_only_concatenated(self):
        calls = []

        def run(cmd, **kw):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, b"", b"")
        with mock.patch.object(pipeline.subprocess, "run", side_effect=run), \
                mock.patch.object(pipeline, "_audio_duration", return_value=2.0), \
                tempfile.TemporaryDirectory() as d, mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(d)):
            pipeline.compose_base_video([{"narration": "一"}, {"narration": "二"}], ["a.png", "b.png"], ["a.mp3", "b.mp3"], "v",
                                        640, 360, 24, intro_title="片頭", intro_duration=3.0)
        text = " ".join(" ".join(c) for c in calls)
        self.assertNotIn("xfade", text)
        self.assertNotIn("acrossfade", text)
        self.assertEqual(calls[-1][:5], ["ffmpeg", "-y", "-f", "concat", "-safe"])
        self.assertEqual(len(calls), 4)  # title card, 2 scenes, concat -- as before U5.4


def _length(path: str) -> float:
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path], capture_output=True).stderr.decode("utf-8", "ignore")
    h, m, s = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed (runs in the video-service container)")
class BookendRender(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.temp = mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(self.dir))
        self.temp.start()
        ff = lambda *a: subprocess.run(["ffmpeg", "-y", "-hide_banner", *a], check=True, capture_output=True)
        self.photo, self.voice, self.intro = f"{self.dir}/p.png", f"{self.dir}/v.wav", f"{self.dir}/intro.mp4"
        ff("-f", "lavfi", "-i", "testsrc=size=640x360", "-frames:v", "1", self.photo)
        ff("-f", "lavfi", "-i", "sine=frequency=440:duration=2", self.voice)
        # a "template" intro: another size, with music, 3 s
        ff("-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=frequency=880:duration=3",
           "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", self.intro)

    def tearDown(self):
        self.temp.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def compose(self, bookends):
        scenes = [{"narration": "第一句"}, {"narration": "第二句"}]
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.5):
            return pipeline.compose_base_video(scenes, [self.photo, self.photo], [self.voice, self.voice], "v", 640, 360, 24,
                                               burn_captions=False, bookends=pipeline.resolve_bookends(bookends))

    def test_template_intro_crossfade_is_one_video(self):
        b = {"intro": {"asset": self.intro}, "outro": None, "transition": "crossfade", "transition_s": 0.5}
        out = self.compose(b)
        self.assertAlmostEqual(_length(out), 3.0 + 5.0 - 0.5, delta=0.15)
        # captions: the first line starts where the main video starts = intro - transition
        self.assertAlmostEqual(pipeline.bookend_lead_s(b), 2.5)
        cues = pipeline.caption_utils.assemble([[{"startMs": 0, "endMs": 900, "text": "第一句"}]], [2.0], pipeline.bookend_lead_s(b))
        self.assertEqual(cues[0]["startMs"], 2500)

    def test_title_intro_and_outro_fade_black(self):
        b = {"intro": {"title": "片頭", "duration": 2.0}, "outro": {"title": "謝謝收看", "duration": 2.0},
             "transition": "fade-black", "transition_s": 0.5}
        self.assertAlmostEqual(_length(self.compose(b)), 2.0 + 5.0 + 2.0 - 1.0, delta=0.15)

    def test_no_transition_concatenates(self):
        b = {"intro": {"asset": self.intro}, "outro": None, "transition": "none", "transition_s": 0.5}
        self.assertAlmostEqual(_length(self.compose(b)), 3.0 + 5.0, delta=0.15)
        self.assertEqual(pipeline.bookend_lead_s(b), 3.0)


if __name__ == "__main__":
    unittest.main()
