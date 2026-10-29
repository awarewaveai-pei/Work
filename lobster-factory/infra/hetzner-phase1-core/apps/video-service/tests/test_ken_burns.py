import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import pipeline  # noqa: E402


def _z(expr: str, on: int) -> float:
    return eval(expr, {"__builtins__": {}}, {"on": on})


class KenBurnsSpread(unittest.TestCase):
    def test_zoom_keeps_moving_to_the_last_frame(self):
        for frames in (48, 120, 240, 480):
            zin = pipeline._ken_burns_zoom(frames, out=False)
            self.assertGreater(_z(zin, frames - 1) - _z(zin, frames - 2), 0.0004, frames)
            zout = pipeline._ken_burns_zoom(frames, out=True)
            self.assertLess(_z(zout, frames - 1), _z(zout, frames - 2), frames)
            self.assertGreaterEqual(_z(zout, frames - 1), 1.0)


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed (runs in the video-service container)")
class KenBurnsRender(unittest.TestCase):
    def test_photo_scene_has_no_freeze_events(self):
        with tempfile.TemporaryDirectory() as d:
            photo, audio, out = f"{d}/p.png", f"{d}/a.wav", f"{d}/o.mp4"
            subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "mandelbrot=size=640x360", "-frames:v", "1", photo], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", audio], check=True, capture_output=True)
            pipeline._render_scene_ffmpeg(photo, "測試", audio, 10.0, out, 640, 360, 24, scene_id=0, burn_captions=False)
            res = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", out, "-vf", "freezedetect=n=-60dB:d=0.5", "-an", "-f", "null", "-"],
                                 capture_output=True, text=True)
            self.assertEqual((res.stdout + res.stderr).count("freeze_start"), 0)


if __name__ == "__main__":
    unittest.main()
