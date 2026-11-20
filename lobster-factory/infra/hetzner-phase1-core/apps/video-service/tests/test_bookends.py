"""Plan U5.4 片頭／片尾接成一支: validation of the new payload fields, the old path untouched when none are sent, and
(with ffmpeg) one video whose length is intro + main - transition with the captions moved to where the main video starts."""
import pathlib
import json
import os
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


    def test_old_names_still_read(self):
        # card R2: the transition is now an FFmpeg xfade name; a job queued before (or an older main system) sends the old ones
        for old, kind in [("crossfade", "fade"), ("fade-black", "fadeblack"), ("none", None), ("wipeleft", "wipeleft")]:
            b = _validate_bookends({"format_assets": FA, "intro": {"title": "a", "duration": 3}, "transition": old})
            self.assertEqual(pipeline.xfade_kind(b["transition"]), kind, old)


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

    def test_killed_encoder_keeps_the_exit_signal_in_the_error(self):
        with mock.patch.object(pipeline.subprocess, "run", return_value=subprocess.CompletedProcess([], -9, b"", b"last frame")):
            with self.assertRaisesRegex(RuntimeError, r"bookend join failed \(exit=-9\)"):
                pipeline._run_ffmpeg(["ffmpeg"], "bookend join failed")


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

    def test_wipes_and_circle_join_with_captions_moved(self):
        # card R2: every transition the editor offers joins bookends too -- the three that are not a fade, each once;
        # card R4: plus one of FFmpeg's other built-ins (pixelize), the same path for every name on FFmpeg's list
        real, used = pipeline._run_ffmpeg, []
        def spy(cmd, *a, **k):
            used.append(" ".join(cmd))
            return real(cmd, *a, **k)
        for t in ("wipeleft", "wiperight", "circleopen", "pixelize"):
            self.assertIn(t, pipeline.xfade_names())
            b = {"intro": {"asset": self.intro}, "outro": None, "transition": t, "transition_s": 0.5}
            with mock.patch.object(pipeline, "_run_ffmpeg", spy):
                out = self.compose(b)
            self.assertTrue(any(f"xfade=transition={t}:" in c for c in used), t)
            self.assertAlmostEqual(_length(out), 3.0 + 5.0 - 0.5, delta=0.15)
            cues = pipeline.caption_utils.assemble([[{"startMs": 0, "endMs": 900, "text": "第一句"}]], [2.0], pipeline.bookend_lead_s(b))
            self.assertEqual(cues[0]["startMs"], 2500, t)

    def test_silent_two_second_cover_opener(self):
        # card R2: the cover opener is a 2 s remotion-service video without sound, joined by a 0.5 s crossfade
        opener = f"{self.dir}/opener.mp4"
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "2",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", opener], check=True, capture_output=True)
        b = {"intro": {"asset": opener}, "outro": None, "transition": "crossfade", "transition_s": 0.5}
        out = self.compose(b)
        self.assertFalse(b["intro"]["has_audio"])
        self.assertAlmostEqual(_length(out), 2.0 + 5.0 - 0.5, delta=0.15)
        cues = pipeline.caption_utils.assemble([[{"startMs": 0, "endMs": 900, "text": "第一句"}]], [2.0], pipeline.bookend_lead_s(b))
        self.assertEqual(cues[0]["startMs"], 1500)

    def test_title_intro_and_outro_fade_black(self):
        b = {"intro": {"title": "片頭", "duration": 2.0}, "outro": {"title": "謝謝收看", "duration": 2.0},
             "transition": "fade-black", "transition_s": 0.5}
        self.assertAlmostEqual(_length(self.compose(b)), 2.0 + 5.0 + 2.0 - 1.0, delta=0.15)

    def test_no_transition_concatenates(self):
        b = {"intro": {"asset": self.intro}, "outro": None, "transition": "none", "transition_s": 0.5}
        self.assertAlmostEqual(_length(self.compose(b)), 3.0 + 5.0, delta=0.15)
        self.assertEqual(pipeline.bookend_lead_s(b), 3.0)

    def test_keeps_the_already_voiced_main_for_rejoining(self):
        main = {}
        b = {"intro": {"asset": self.intro}, "outro": None, "transition": "crossfade", "transition_s": 0.5}
        with mock.patch.object(pipeline, "generate_audio", return_value=[self.voice]) as voice, \
                mock.patch.object(pipeline, "_audio_duration", return_value=2.5), \
                mock.patch.object(pipeline.config, "OUTPUT_DIR", pathlib.Path(self.dir)), \
                mock.patch.dict(pipeline.config.FORMATS, {"16x9": (640, 360)}):
            outputs, _ = pipeline.render_video_multiformat([{"id": 1, "narration": "原旁白"}],
                {"16x9": [self.photo]}, "rejoin", bookends=b, main_sink=main)
        self.assertEqual(voice.call_count, 1)
        self.assertAlmostEqual(_length(main["16x9"]), 2.5, delta=0.15)
        self.assertAlmostEqual(_length(outputs["16x9"]), 5.0, delta=0.15)

    def test_saved_main_captions_start_at_zero_not_at_the_old_intro(self):
        def voice(scenes, **kwargs):
            kwargs["cues_out"].append([{"startMs": 0, "endMs": 900, "text": "原旁白"}])
            return [self.voice]
        main, clean, captions = {}, {}, {}
        b = {"intro": {"asset": self.intro}, "outro": None, "transition": "crossfade", "transition_s": 0.5}
        with mock.patch.object(pipeline, "generate_audio", side_effect=voice), \
                mock.patch.object(pipeline, "_audio_duration", return_value=2.5), \
                mock.patch.object(pipeline.config, "OUTPUT_DIR", pathlib.Path(self.dir)), \
                mock.patch.dict(pipeline.config.FORMATS, {"16x9": (640, 360)}), \
                mock.patch.object(pipeline, "burn_script_captions", wraps=pipeline.burn_script_captions) as burn:
            pipeline.render_video_multiformat([{"id": 1, "narration": "原旁白"}], {"16x9": [self.photo]},
                "captioned_main", bookends=b, main_sink=main, clean_sink=clean, caption_sink=captions)
        self.assertEqual(burn.call_args_list[0].args[1][0]["startMs"], 0)
        self.assertEqual(burn.call_args_list[1].args[1][0]["startMs"], 2500)
        self.assertAlmostEqual(_length(main["16x9"]), 2.5, delta=0.15)


def _streams(path: str) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration,color_space,color_range",
                          "-of", "json", path], capture_output=True, text=True, check=True).stdout
    return {s["codec_type"]: s for s in json.loads(out)["streams"]}


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed (runs in the video-service container)")
class StockVideoScenesJoin(unittest.TestCase):
    """2026-11-18 Soulful: an HLG phone clip among bt709 stock shots made the main change colorspace mid-stream; ffmpeg
    rebuilt the xfade/acrossfade graph there and the join ended early with exit 0 (31.9 s planned, 22.5 s video, 9.5 s
    audio). Stock-shaped sources: HLG / PQ / bt709 / full-range bt601 tags, 29.97 / 25 / 59.94 fps, odd sizes, plus a photo."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.temp = mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(self.dir))
        self.temp.start()
        self.voice = f"{self.dir}/v.wav"
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", self.voice],
                       check=True, capture_output=True)

    def tearDown(self):
        self.temp.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def stock(self, name, rate, size, tags, audio=False):
        path = f"{self.dir}/{name}.mp4"
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}",
                        *(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000"] if audio else []), "-t", "4",
                        "-vf", f"setparams={tags}", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                        *(["-c:a", "aac"] if audio else ["-an"]), path], check=True, capture_output=True)
        return path

    def test_mixed_color_stock_scenes_join_full_length(self):
        photo = f"{self.dir}/p.png"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360", "-frames:v", "1", photo], check=True, capture_output=True)
        assets = [self.stock("hlg", "30000/1001", "1279x719", "range=tv:color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc"),
                  self.stock("rec709", "25", "853x481", "range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709", audio=True),
                  self.stock("full601", "60000/1001", "481x853", "range=pc:colorspace=smpte170m"),
                  self.stock("pq", "24", "1920x1080", "range=tv:color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc"),
                  self.stock("sdr2020", "25", "960x540", "range=tv:color_primaries=bt2020:color_trc=bt709:colorspace=bt2020nc"),
                  photo]
        b = {"intro": {"title": "片頭", "duration": 2.0}, "outro": {"title": "謝謝收看", "duration": 2.0},
             "transition": "crossfade", "transition_s": 0.5}
        scenes = [{"narration": f"第{i}句"} for i in range(len(assets))]
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.5):
            out = pipeline.compose_base_video(scenes, assets, [self.voice] * len(assets), "v", 640, 360, 24,
                                              burn_captions=False, bookends=b)
        want = 2.0 + 6 * 2.5 + 2.0 - 2 * 0.5
        got = _streams(out)
        self.assertAlmostEqual(float(got["video"]["duration"]), want, delta=0.15)
        self.assertAlmostEqual(float(got["audio"]["duration"]), want, delta=0.15)
        tags = {(s["video"].get("color_space"), s["video"].get("color_range"))
                for s in (_streams(f"{self.dir}/scene_{i:03d}.mp4") for i in range(len(assets)))}
        self.assertEqual(tags, {("bt709", "tv")}, "every concatenated scene carries one color signature")

    def test_other_gamut_is_converted_not_relabelled(self):
        probe = [{"codec_type": "video", "color_primaries": "bt2020", "color_transfer": "bt709", "color_space": "bt2020nc"}]
        with mock.patch.object(pipeline, "_probe_streams", return_value=probe):
            chain = pipeline._fit_bt709("sdr2020.mp4", 640, 360, 24)
        self.assertIn("pin=bt2020", chain)
        self.assertIn("p=bt709", chain)

    def test_scenes_off_the_frame_grid_keep_their_place(self):
        """Codex 2026-11-18: a 2.51 s scene at 24 fps is 61 frames = 2.542 s of picture; concat places the next scene
        after the longer stream, so every scene pushed the rest ~30 ms and the length check failed real renders."""
        photo = f"{self.dir}/p.png"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360", "-frames:v", "1", photo], check=True, capture_output=True)
        for transition in ("none", "crossfade"):
            b = {"intro": {"title": "片頭", "duration": 2.0}, "outro": None, "transition": transition, "transition_s": 0.5}
            with self.subTest(transition), mock.patch.object(pipeline, "_audio_duration", return_value=2.51):
                out = pipeline.compose_base_video([{"narration": "一"}] * 7, [photo] * 7, [self.voice] * 7, "v", 640, 360, 24,
                                                  burn_captions=False, bookends=b)
                want = 2.0 + 7 * 2.5 - (0.5 if transition == "crossfade" else 0)
                got = _streams(out)
                self.assertAlmostEqual(float(got["video"]["duration"]), want, delta=0.05)
                self.assertAlmostEqual(float(got["audio"]["duration"]), want, delta=0.05)
        sink = {}
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.51), \
                mock.patch.object(pipeline.config, "FPS", 24):
            pipeline._caption_result(sink, [[{"startMs": 0, "endMs": 100, "text": "a"}]] * 7, [self.voice] * 7, "", 0.0, lead_s=0.0)
        self.assertEqual(sink["cues"][-1]["startMs"], 6 * 2500, "captions follow the same frame-aligned scenes")

    def test_template_whose_music_stops_early_still_joins(self):
        intro = f"{self.dir}/intro.mp4"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=3", "-f", "lavfi", "-i",
                        "sine=frequency=880:duration=1.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", intro],
                       check=True, capture_output=True)
        b = pipeline.resolve_bookends({"intro": {"asset": intro}, "outro": None, "transition": "crossfade", "transition_s": 0.5})
        with mock.patch.object(pipeline, "_audio_duration", return_value=2.5):
            out = pipeline.compose_base_video([{"narration": "一"}], [self.stock("s", "25", "853x481", "range=tv")],
                                              [self.voice], "v", 640, 360, 24, burn_captions=False, bookends=b)
        got = _streams(out)
        self.assertAlmostEqual(float(got["video"]["duration"]), 3.0 + 2.5 - 0.5, delta=0.15)
        self.assertAlmostEqual(float(got["audio"]["duration"]), 3.0 + 2.5 - 0.5, delta=0.15)

    def test_short_join_is_an_error_not_a_finished_video(self):
        seg = f"{self.dir}/short.mp4"
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=24:d=3", "-f", "lavfi", "-i",
                        "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:v", "libx264", "-c:a", "aac", seg], check=True, capture_output=True)
        self.assertEqual(pipeline._check_joined_length(seg, 3.0), seg)
        with self.assertRaisesRegex(RuntimeError, "長度不符"):
            pipeline._check_joined_length(seg, 9.5)


class ComposeCpuBudget(unittest.TestCase):
    """ffmpeg/x264 size thread pools from the CPUs they can see; cpuset must show exactly the cores the quota allows."""

    def test_visible_cores_equal_the_cpu_limit(self):
        text = (pathlib.Path(__file__).resolve().parent.parent / "docker-compose.video.yml").read_text(encoding="utf-8")
        cpus = float(re.search(r'^\s+cpus:\s*"([0-9.]+)"', text, re.M).group(1))
        cpuset = re.search(r'^\s+cpuset:\s*"([0-9,\-]+)"', text, re.M).group(1)
        cores = sum(int(b) - int(a) + 1 if "-" in part else 1 for part in cpuset.split(",") for a, _, b in [part.partition("-")])
        self.assertEqual(cores, cpus, "cpuset must list as many cores as the cpus limit")


@unittest.skipUnless(os.getenv("RUN_RESOURCE_TESTS") == "1", "opt-in: run in the production-sized isolated container")
class BookendResourceBudget(unittest.TestCase):
    """Real three-input joins, including the original production resolution and container memory accounting."""

    def join(self, fmt):
        root = pathlib.Path("/sys/fs/cgroup")
        self.assertEqual((root / "memory.max").read_text().strip(), "3221225472")
        self.assertEqual((root / "memory.swap.max").read_text().strip(), "0")
        self.assertEqual((root / "pids.max").read_text().strip(), "256")
        quota, period = (root / "cpu.max").read_text().split()
        self.assertEqual(int(quota) / int(period), 2)
        self.assertEqual(len(os.sched_getaffinity(0)), 2, "run with --cpuset-cpus of two cores, as the compose file")
        w, h = pipeline.config.FORMATS[fmt]
        out_dir = pipeline.config.OUTPUT_DIR / ("bookend-budget-" + fmt)
        out_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(pipeline.config, "TEMP_DIR", pathlib.Path(directory)):
            def segment(name, seconds, color, caption=False):
                path = str(pathlib.Path(directory) / (name + ".mp4"))
                vf = "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='MAIN CAPTION':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-100" if caption else "null"
                subprocess.run(["ffmpeg", "-y", "-hide_banner", "-filter_threads", "1",
                    "-f", "lavfi", "-i", f"color=c={color}:s={w}x{h}:r=24:d={seconds}",
                    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(seconds), "-vf", vf,
                    "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-ar", "44100", "-ac", "2", path], check=True, capture_output=True)
                return path

            intro = segment("intro", 3, "red")
            main = segment("main", 12, "0x205020", caption=True)
            outro = segment("outro", 3, "blue")
            bookends = {"intro": {"asset": intro, "duration": 3, "has_audio": True},
                        "outro": {"asset": outro, "duration": 3, "has_audio": True},
                        "transition": "crossfade", "transition_s": 0.5}
            output = str(out_dir / "joined.mp4")
            try:
                pipeline._join_bookends([main], [12], bookends, output, w, h, 24)
            finally:
                print(json.dumps({"format": fmt, "memory_peak": (root / "memory.peak").read_text().strip(),
                                  "memory_events": (root / "memory.events").read_text().strip()}), flush=True)
            self.assertLess(int((root / "memory.peak").read_text()), 1280 * 1024 * 1024,
                            "measured ~1.1 GiB with two visible cores; more means the join regressed")
            self.assertIn("oom_kill 0", (root / "memory.events").read_text())
            self.assertAlmostEqual(_length(output), 17, delta=0.15)
            self.assertEqual(pipeline.bookend_lead_s(bookends), 2.5)
            info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", output],
                              capture_output=True, text=True, check=True).stdout)["streams"]
            video, audio = next(s for s in info if s["codec_type"] == "video"), next(s for s in info if s["codec_type"] == "audio")
            self.assertEqual((video["codec_name"], video["width"], video["height"], video["pix_fmt"], video["r_frame_rate"]),
                             ("h264", w, h, "yuv420p", "24/1"))
            self.assertEqual((audio["codec_name"], audio["sample_rate"], audio["channels"]), ("aac", "44100", 2))
            from PIL import Image
            frames = []
            for name, timestamp in [("intro", 1), ("fade-in", 2.75), ("main", 3.5), ("fade-out", 14.25), ("outro", 16)]:
                frame = out_dir / (name + ".png")
                subprocess.run(["ffmpeg", "-y", "-hide_banner", "-threads", "1", "-ss", str(timestamp), "-i", output,
                                "-frames:v", "1", "-threads", "1", str(frame)], capture_output=True, check=True)
                with Image.open(frame) as image:
                    rgb = image.convert("RGB")
                    red, green, blue = rgb.getpixel((w // 2, h // 2))
                    if name == "fade-in":
                        self.assertTrue(red > 60 and green > 10 and blue < 50, "intro and main are blended at the first join")
                    if name == "fade-out":
                        self.assertTrue(blue > 60 and green > 10 and red < 50, "main and outro are blended at the second join")
                    if name == "main":
                        self.assertGreater(sum(min(pixel) > 200 for pixel in rgb.crop((0, h - 110, w, h - 40)).getdata()), 100,
                                           "main caption survives the join at its unchanged position")
                    frames.append(rgb.resize((360, round(h * 360 / w))))
            sheet = Image.new("RGB", (len(frames) * 360, frames[0].height))
            for index, frame in enumerate(frames):
                sheet.paste(frame, (index * 360, 0))
            sheet.save(out_dir / "contact.png")

    def test_three_input_16x9(self):
        self.join("16x9")

    def test_three_input_9x16(self):
        self.join("9x16")

    def test_three_input_4x5(self):
        self.join("4x5")


if __name__ == "__main__":
    unittest.main()
