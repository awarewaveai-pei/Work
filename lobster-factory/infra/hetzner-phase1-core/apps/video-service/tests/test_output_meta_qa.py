"""Every rendered output carries its technical evidence (byte size, sha256, technical_qa, signal_qa).

The 2026-09-10 merge 91fdfe31a dropped this from _build_output_meta; next-admin then had no evidence to persist.
Needs ffmpeg/ffprobe on PATH (the service image has them): renders two real 1-second clips and probes them.
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("ALLOW_INSECURE_LOCAL_RENDER", "true")

import config  # noqa: E402
import server  # noqa: E402


def _clip(path: str, w: int, h: int, source: str, audio: str = "sine=frequency=440:duration=1") -> None:
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"{source}{':' if '=' in source else '='}size={w}x{h}:rate=30:duration=1",
                    "-f", "lavfi", "-i", audio, "-shortest",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path], check=True)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "needs ffmpeg/ffprobe")
class OutputMetaQa(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.fmt, (self.w, self.h) = next(iter(config.FORMATS.items()))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_a_good_output_has_checksum_and_both_qa_reports(self):
        path = os.path.join(self.dir, "ok.mp4")
        _clip(path, self.w, self.h, "testsrc2")
        item = server._build_output_meta({self.fmt: path})[self.fmt]
        self.assertEqual(item["byteSize"], os.path.getsize(path))
        self.assertEqual(item["checksumSha256"], hashlib.sha256(open(path, "rb").read()).hexdigest())
        for key in ("technical_qa", "signal_qa"):
            self.assertIn(item[key]["status"], ("passed", "warned"), key)
        # pix_th is how dark a pixel must be, pic_th how much of the frame: pix_th=0.98 counted every normal frame as
        # black (2026-10-26: a normal video reported blackRatio 0.83, so every technical QA warned).
        self.assertLess(item["signal_qa"]["measurements"]["blackRatio"], 0.05)

    def test_a_black_output_is_warned(self):
        path = os.path.join(self.dir, "black.mp4")
        _clip(path, self.w, self.h, "color=c=black")
        qa = server._build_output_meta({self.fmt: path})[self.fmt]["signal_qa"]
        self.assertEqual(qa["status"], "warned")

    def test_a_silent_output_is_refused(self):
        path = os.path.join(self.dir, "silent.mp4")
        _clip(path, self.w, self.h, "testsrc2", audio="anullsrc=r=48000:cl=stereo")
        with self.assertRaises(RuntimeError):
            server._build_output_meta({self.fmt: path})


if __name__ == "__main__":
    unittest.main()
