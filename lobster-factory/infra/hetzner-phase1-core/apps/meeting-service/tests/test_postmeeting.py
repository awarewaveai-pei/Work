"""會後整理產物鏈（C15）：聆聽場次的轉接、依產物跳過步驟、入口的預設做法。"""
import json
import os
import sys
import tempfile
import time
import unittest
import wave
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import pipeline  # noqa: E402
from lib import merge_segments, postmeeting, summarize  # noqa: E402

LINES = [
    {"id": 1, "start": 1.0, "end": 2.5, "text": "Hello everyone.", "tr": "大家好。", "speaker": None},
    {"id": 2, "start": 2.6, "end": 2.6, "text": "  ", "tr": ""},
    {"id": 3, "start": 10.0, "end": 11.0, "text": "Next item.", "tr": "", "speaker": None},
]


def sidecar(stt="local", lines=LINES, dropped=0.0, failed=()):
    return {"version": 1, "listen": "en-US", "target": "zh-TW", "stt": stt, "channels": 1, "lines": list(lines),
            "dropped_sec": dropped, "failed_lines": list(failed)}


class Fakes:
    """transcribe／diarize 的假函式，記被呼叫幾次。"""

    def __init__(self):
        self.transcribed = self.diarized = 0

    def transcribe(self, media_path, model_name, log, language):
        self.transcribed += 1
        return {"segments": [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好", "avg_logprob": -0.2, "no_speech_prob": 0.0}],
                "audio_duration_sec": 1.0, "realtime_factor": 2.0, "backend": "cpu", "language": "zh", "model": "large-v3"}

    def diarize(self, media_path, segments, spans_cache_path=None, log=print):
        self.diarized += 1
        for s in segments:
            s["speaker"] = "A"
        return {"speakers": ["A"], "overlap_sec": 0.0, "turns": pipeline.diarize.turns(segments)}

    def patches(self):
        return [mock.patch.object(pipeline, "transcribe", self.transcribe),
                mock.patch.object(pipeline.diarize, "diarize", self.diarize),
                mock.patch.object(pipeline.keep_awake, "prevent_sleep"),
                mock.patch.object(pipeline.keep_awake, "allow_sleep")]


def start(test, patches):
    for p in patches:
        p.start()
        test.addCleanup(p.stop)


class Adapter(unittest.TestCase):
    def test_lines_become_segments_with_times_and_the_translation_in_brackets(self):
        segs = postmeeting.segments(LINES)
        self.assertEqual([(s["id"], s["start"], s["end"], s["text"]) for s in segs],
                         [(0, 1.0, 2.5, "Hello everyone."), (1, 10.0, 11.0, "Next item.")], "the empty line is left out")
        self.assertEqual(segs[0]["tr"], "大家好。")
        self.assertNotIn("tr", segs[1])
        text = summarize.build_transcript_text(merged=merge_segments.merge(segs))
        self.assertIn("Hello everyone.（大家好。）", text)
        joined = summarize.build_transcript_text(merged=merge_segments.merge(postmeeting.segments([LINES[0], {**LINES[0], "start": 2.6, "end": 3.0, "text": "Welcome.", "tr": ""}])))
        self.assertIn("Hello everyone.（大家好。） Welcome.", joined, "a translation stays with its own sentence")

    def test_a_long_gap_in_what_reached_recognition_makes_re_transcribing_the_default(self):
        self.assertTrue(postmeeting.recommend(sidecar(dropped=postmeeting.DROPPED_MAX_SEC), 1)["reuse"])
        r = postmeeting.recommend(sidecar(dropped=postmeeting.DROPPED_MAX_SEC + 1), 1)
        self.assertFalse(r["reuse"])
        self.assertIn("秒", r["reason"])


    def test_speakers_are_reused_only_when_every_line_has_one(self):
        # Codex 2026-11-27: one labelled line used to skip pyannote for all the others (they became 「?」).
        segs = [{"start": 0.0, "end": 1.0, "speaker": "我"}, {"start": 1.0, "end": 2.0}]
        self.assertIsNone(postmeeting.speakers(segs))
        segs[1]["speaker"] = "講者 1"
        self.assertEqual(postmeeting.speakers(segs)["speakers"], ["我", "講者 1"])

    def test_gemini_lines_in_speech_without_pauses_are_moved_back_by_the_measured_delay(self):
        # Codex 2026-11-27: every shift scored the same and the lines kept their 4 s late arrival times.
        from lib.live import vad
        spans = [(4.4 + a, 4.4 + b) for a, b in ((1.0, 5.0), (5.0, 9.0), (9.0, 13.0))]
        moved = vad.reanchor(spans, [(1.0, 20.0)])
        self.assertAlmostEqual(moved[0][0], 1.0, delta=0.1)
        self.assertAlmostEqual(moved[-1][1], 13.0, delta=0.1)


    def test_an_end_snapped_to_a_pause_never_runs_into_the_next_line(self):
        # critic 2026-11-27: A's end jumped to the pause at 20 and pushed B into the next speaker's speech.
        from lib.live import vad
        moved = vad.reanchor([(10.2, 19.3), (19.4, 19.9)], [(10.0, 20.0), (20.8, 30.0)])
        self.assertLessEqual(moved[0][1], moved[1][0])
        self.assertLess(moved[1][0], 20.0)

    def test_translations_are_dropped_before_the_end_of_a_long_meeting_is(self):
        # critic 2026-11-27: bracketed translations made the 60k cap cut off the last quarter of a meeting.
        merged = [{"start": i, "text": "x" * 90, "text_tr": "x" * 90 + "（譯" + "y" * 60 + "）"} for i in range(600)]
        text = summarize.build_transcript_text(merged=merged)
        self.assertNotIn("已截斷", text)
        self.assertNotIn("（譯", text)


class ChainSkipsWhatItHas(unittest.TestCase):
    def setUp(self):
        self.fakes = Fakes()
        start(self, self.fakes.patches())
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.job = tmp.name

    def run_chain(self, media="input.wav"):
        pipeline.run_pipeline_phase1(self.job, media, pipeline.Options())
        with open(os.path.join(self.job, "status.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_a_job_with_a_transcript_never_transcribes_and_diarizes_once(self):
        postmeeting.write_products(self.job, sidecar(), 5.0)
        status = self.run_chain()
        self.assertEqual(status["stage"], "awaiting_summary", status.get("error"))
        self.assertEqual((self.fakes.transcribed, self.fakes.diarized), (0, 1))
        self.assertEqual(status["steps"]["transcribe"], pipeline.REUSED)
        self.assertTrue(os.path.exists(os.path.join(self.job, postmeeting.SPEAKERS)))

    def test_speakers_marked_while_listening_mean_no_diarize(self):
        postmeeting.write_products(self.job, sidecar(lines=[{**l, "speaker": "我"} for l in LINES]), 5.0)
        status = self.run_chain()
        self.assertEqual((self.fakes.transcribed, self.fakes.diarized), (0, 0))
        self.assertEqual(status["steps"]["diarize"], pipeline.REUSED)
        with open(os.path.join(self.job, "diarized.txt"), encoding="utf-8") as f:
            self.assertIn("我：Hello everyone.", f.read())


class Entry(unittest.TestCase):
    """/api/ownvoice/import：舊場次走完整條，沒有錄音不分講者。工作在測試裡同步跑完。"""

    class SyncThread:
        def __init__(self, target, daemon=None):
            self.target = target

        def start(self):
            self.target()

    def setUp(self):
        self.fakes = Fakes()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.sessions = os.path.join(tmp.name, "sessions")
        jobs_dir = os.path.join(tmp.name, "jobs")
        os.makedirs(jobs_dir)
        start(self, self.fakes.patches() + [
            mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": self.sessions}),
            mock.patch.object(app_module, "JOBS_DIR", jobs_dir),
            mock.patch.object(app_module.threading, "Thread", self.SyncThread),
            mock.patch.object(app_module.settings, "pref", lambda name: "zh-TW")])
        self.client = TestClient(app_module.app, base_url="http://127.0.0.1:8420")

    def session(self, name, wav=True, side=None):
        folder = os.path.join(self.sessions, name)
        os.makedirs(folder)
        if wav:
            path = os.path.join(folder, "01-段落 1.wav")
            with wave.open(path, "wb") as w:
                w.setnchannels(1), w.setsampwidth(2), w.setframerate(16000)
                w.writeframes(b"\0\0" * 16000)
            os.utime(path, (time.time() - 60,) * 2)
        if side is not None:
            with open(os.path.join(folder, "session.json"), "w", encoding="utf-8") as f:
                json.dump(side, f)

    def post(self, name, **body):
        return self.client.post("/api/ownvoice/import", json={"session": name, **body})

    def test_an_old_session_runs_the_whole_chain(self):
        self.session("2026-11-20 0900")
        r = self.post("2026-11-20 0900")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["reuse"])
        self.assertEqual((self.fakes.transcribed, self.fakes.diarized), (1, 1))

    def test_a_session_without_a_recording_never_diarizes(self):
        self.session("2026-11-21 0900", wav=False, side=sidecar())
        r = self.post("2026-11-21 0900")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["reuse"])
        self.assertEqual((self.fakes.transcribed, self.fakes.diarized), (0, 0))
        self.assertEqual(os.listdir(os.path.join(self.sessions, "2026-11-21 0900")), ["session.json"], "the session folder is never written")


if __name__ == "__main__":
    unittest.main()
