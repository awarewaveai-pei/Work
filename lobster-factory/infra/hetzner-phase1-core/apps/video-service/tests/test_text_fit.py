"""Every text drawn into the picture (title card, scene captions, burned captions) stays inside the frame's safe margin
in every format. 2026-11-18 Soulful 9:16: the title ran as one 106 px line and captions at 96 px, cut at both edges.
Measured by font metrics (the layout) and by the pixels ffmpeg actually drew."""
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import pipeline  # noqa: E402
from PIL import Image  # noqa: E402

TITLES = ["A 30-Second Creative Pause: Notice, Draw, Reflect",
          "A 30-Second Creative Pause: Notice, Draw, Reflect on the Colours Around You Today",  # 80 = server max
          "三十秒創意暫停：留意身邊的一種顏色，畫下來，再回想這一刻帶給你的感受與新的想法，慢慢呼吸放鬆"]
NARRATION = ("Notice one colour nearby. Notice how the moment feels, and let your hand follow it slowly across the page. "
             "Find more pauses like this at soulfulexpression dot com. 留意身邊的一種顏色，感受此刻，讓手慢慢跟著它在紙上移動。")
CUES = ["Notice one colour nearby", "Notice how the moment feels, and let your hand follow it",
        "at soulfulexpression dot com", "soulfulexpression.com/creative-pause-notice-draw-reflect",
        "Save 100% of your focus \\ now"]  # drawtext's default %-expansion drew nothing at all for this
SAFE_MARGIN = 0.05  # the contract: text keeps 5 % of the short side clear on each edge
HAS_FONT = bool(pipeline._font_path())


def _captions():
    return [seg for text in [NARRATION, *CUES] for seg in pipeline._split_narration(text)]


@unittest.skipUnless(HAS_FONT, "Noto CJK not installed (runs in the video-service container)")
class LayoutFitsTheFrame(unittest.TestCase):
    def check(self, kind, texts):
        for fmt, (w, h) in pipeline.config.FORMATS.items():
            box = pipeline._text_box(kind, w, h)
            for text in texts:
                with self.subTest(fmt=fmt, text=text):
                    lines, size = pipeline._fit_text(text, box["size"], box["max_w"], box["max_h"])
                    font = pipeline._font(size)
                    self.assertLessEqual(max(font.getlength(line) for line in lines), box["max_w"])
                    self.assertLessEqual(pipeline._text_height(len(lines), font, size), box["max_h"])
                    self.assertEqual("".join(lines).replace(" ", ""), text.replace(" ", ""), "no text dropped")

    def test_titles(self):
        self.check("title", TITLES)

    def test_captions(self):
        self.check("caption", _captions())
        for cue in CUES:
            self.assertEqual("".join(pipeline._split_narration(cue)).replace(" ", ""), cue.replace(" ", ""), "no text dropped")

    def test_16x9_keeps_its_look(self):
        box = pipeline._text_box("caption", 1920, 1080)
        self.assertEqual((box["size"], box["box"]), (54, 4))
        self.assertEqual(pipeline._fit_text("Notice one colour nearby", 54, box["max_w"], box["max_h"]),
                         (["Notice one colour nearby"], 54))
        self.assertEqual(pipeline._text_box("title", 1920, 1080)["size"], 60)


def _drawn_box(png: str) -> tuple:
    with Image.open(png) as im:
        return im.convert("L").point(lambda v: 255 if v > 60 else 0).getbbox()


@unittest.skipUnless(HAS_FONT and shutil.which("ffmpeg"), "ffmpeg + Noto CJK (runs in the video-service container)")
class DrawnTextInsideTheFrame(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.temp = mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(self.dir))
        self.temp.start()

    def tearDown(self):
        self.temp.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def frame(self, video, t, name):
        png = f"{self.dir}/{name}.png"
        subprocess.run(["ffmpeg", "-y", "-ss", str(t), "-i", video, "-frames:v", "1", png], check=True, capture_output=True)
        return png

    def assert_inside(self, png, w, h, what):
        box = _drawn_box(png)
        self.assertIsNotNone(box, f"{what}: nothing drawn")
        side = round(min(w, h) * SAFE_MARGIN)
        left, top, right, bottom = box
        self.assertGreaterEqual(left, side, f"{what}: text box {box} crosses the left margin {side}")
        self.assertLessEqual(right, w - side, f"{what}: text box {box} crosses the right margin {w - side}")
        self.assertGreaterEqual(top, side, f"{what}: text box {box} crosses the top margin {side}")
        # 16:9 captions keep their old 40 px bottom margin (operator: keep the 16:9 look)
        floor = h - (40 if w > h and "caption" in what else side)
        self.assertLessEqual(bottom, floor, f"{what}: text box {box} crosses the bottom margin {floor}")

    def test_title_card_every_format(self):
        for fmt, (w, h) in pipeline.config.FORMATS.items():
            for i, title in enumerate(TITLES):
                with self.subTest(fmt=fmt, title=title):
                    out = f"{self.dir}/title_{fmt}_{i}.mp4"
                    pipeline._render_intro_scene(title, 1.5, out, w, h, 24)
                    self.assert_inside(self.frame(out, 1.2, f"t_{fmt}_{i}"), w, h, f"title {fmt}")

    def test_burned_captions_every_format(self):
        cues = [{"start_ms": i * 1000, "end_ms": i * 1000 + 900, "text": t} for i, t in enumerate(_captions())]
        for fmt, (w, h) in pipeline.config.FORMATS.items():
            with self.subTest(fmt=fmt):
                clip, out = f"{self.dir}/black_{fmt}.mp4", f"{self.dir}/burn_{fmt}.mp4"
                subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:r=24:d={len(cues)}",
                                "-c:v", "libx264", "-pix_fmt", "yuv420p", clip], check=True, capture_output=True)
                pipeline._burn_captions_ffmpeg(clip, cues, out)
                for i, cue in enumerate(cues):
                    self.assert_inside(self.frame(out, i + 0.45, f"c_{fmt}_{i}"), w, h, f"caption {fmt} {cue['text']!r}")

    def test_scene_captions_every_format(self):
        photo, voice = f"{self.dir}/black.png", f"{self.dir}/v.wav"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=640x640", "-frames:v", "1", photo], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", voice], check=True, capture_output=True)
        for fmt, (w, h) in pipeline.config.FORMATS.items():
            with self.subTest(fmt=fmt):
                out = f"{self.dir}/scene_{fmt}.mp4"
                pipeline._render_scene_ffmpeg(photo, NARRATION, voice, 6.0, out, w, h, 24, scene_id=0)
                for k, t in enumerate((0.6, 2.0, 3.5, 5.0)):
                    self.assert_inside(self.frame(out, t, f"s_{fmt}_{k}"), w, h, f"scene caption {fmt} at {t}s")


if __name__ == "__main__":
    unittest.main()
