"""C18 即時分講者：分群邏輯（假向量）、刪掉的聲音不再比對也不再叫人、聲音檔位置與讀不懂時不覆蓋、
停止時模型載入中也按順序收尾、ring 外的句子沒有向量、遙測關閉。"""
import asyncio
import os
import sys
import tempfile
import threading
import unittest
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import gpu_gate  # noqa: E402
from lib.live import echo, speakers  # noqa: E402

rng = np.random.default_rng(0)
A, B = rng.normal(size=256), rng.normal(size=256)


def near(v):
    """A sentence of that voice: its direction plus a little noise (cosine with it about 0.9)."""
    return v + rng.normal(scale=0.3, size=256) * np.linalg.norm(v) / 16


class Grouping(unittest.TestCase):
    def test_two_voices_stay_apart_and_a_short_line_takes_the_one_before(self):
        c = speakers.Clusters()
        names = [c.add(1, near(A), 3.0), c.add(2, near(B), 2.5), c.add(3, near(A), 4.0), c.add(4, None, 0.6)]
        self.assertEqual(names, [("講者 1", False), ("講者 2", False), ("講者 1", False), ("講者 1", True)])

    def test_a_name_the_user_gave_survives_the_regroup_at_stop(self):
        c = speakers.Clusters()
        for i, v in enumerate([A, B, A, B, B]):
            c.add(i, near(v), 3.0)
        self.assertTrue(c.rename("講者 2", "王經理"))
        labels = c.regroup()
        self.assertEqual([labels[i][0] for i in range(5)], ["講者 1", "王經理", "講者 1", "王經理", "王經理"],
                         "B spoke longest but keeps the name it was given; A is numbered")

    def test_renaming_to_a_name_another_speaker_has_joins_them_and_the_regroup_keeps_them_joined(self):
        # One person heard as two (a far microphone, a cold): the user gives both the same name.
        c = speakers.Clusters()
        for i, v in enumerate([A, B, A, B]):
            c.add(i, near(v), 3.0)
        c.rename("講者 1", "林經理")
        c.rename("講者 2", "林經理")
        self.assertEqual({n for n, _ in c.labels().values()}, {"林經理"})
        self.assertEqual({n for n, _ in c.regroup().values()}, {"林經理"})
        self.assertEqual(c.add(9, near(rng.normal(size=256)), 3.0)[0], "講者 1", "a new voice gets the free number")

    def test_a_typed_name_is_never_handed_out_as_a_number(self):
        c = speakers.Clusters()
        c.add(1, near(A), 3.0)
        c.rename("講者 1", "講者 2")
        self.assertEqual(c.add(2, near(B), 3.0)[0], "講者 1")


    def test_a_listening_of_only_short_lines_stays_one_speaker_after_the_regroup(self):
        # Codex 2026-11-29 said each vector-less line becomes its own speaker at stop; it does not.
        c = speakers.Clusters()
        for i in range(3):
            c.add(i, None, 0.6)
        self.assertEqual({who for who, _ in c.regroup().values()}, {"講者 1"})


class SavedVoices(unittest.TestCase):
    def test_a_deleted_voice_is_never_matched_again_and_no_longer_names_anyone(self):
        with tempfile.TemporaryDirectory() as d:
            voices = speakers.Voices(os.path.join(d, "voices.json"))
            saved = voices.save("林經理", A)
            c = speakers.Clusters(voices.load())
            self.assertEqual(c.add(1, near(A), 3.0)[0], "林經理", "a saved voice is recognised")
            speakers.delete_voice(voices, c, saved["id"])
            self.assertEqual(voices.load(), [], "gone from the file")
            self.assertNotEqual(c.labels()[1][0], "林經理", "the line it named is renamed")
            self.assertNotEqual(c.add(2, near(A), 3.0)[0], "林經理", "not matched in this listening")
            self.assertNotIn("林經理", {n for n, _ in c.regroup().values()}, "nor brought back by the regroup")
            self.assertNotEqual(speakers.Clusters(voices.load()).add(1, near(A), 3.0)[0], "林經理", "nor in the next")

    def test_an_unreadable_voices_file_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "voices.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write('[{"id": "a1", "name": "林經理", "vector": [0.1,')      # cut off mid-write
            voices = speakers.Voices(path)
            with self.assertRaises(speakers.VoicesUnreadable):
                voices.load()
            with self.assertRaises(speakers.VoicesUnreadable):
                voices.save("王經理", B)
            with open(path, encoding="utf-8") as f:
                self.assertIn("林經理", f.read(), "the saved voices are still there to repair")

    def test_a_saved_vector_that_is_not_all_numbers_is_left_out(self):
        # Codex 2026-11-29: 256 strings passed the length check and broke starting to listen.
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "voices.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write('[{"id": "a1", "name": "x", "vector": ' + str(["0.1"] * speakers.DIM).replace("'", '"') + '}]')
            self.assertEqual(speakers.Voices(path).load(), [])

    def test_a_failed_save_leaves_no_temp_file_holding_vectors(self):
        # Codex 2026-11-29: the temp file of a failed replace kept the vectors after a later delete.
        with tempfile.TemporaryDirectory() as d:
            voices = speakers.Voices(os.path.join(d, "voices.json"))
            with mock.patch.object(speakers.os, "replace", side_effect=PermissionError("busy")):
                with self.assertRaises(PermissionError):
                    voices.save("林經理", A)
            self.assertEqual([n for n in os.listdir(d) if n.endswith(".tmp")], [])

    def test_the_voices_file_is_never_inside_the_repository(self):
        repo = speakers.HERE
        path = os.path.normcase(os.path.abspath(speakers.voices_path()))
        self.assertFalse(path.startswith(os.path.normcase(repo) + os.sep), path)
        with self.assertRaises(ValueError):
            speakers.Voices(os.path.join(repo, "voices.json"))

    def test_the_windows_and_the_wsl_server_use_the_same_file(self):
        with mock.patch.dict(os.environ, {"LOCALAPPDATA": r"C:\Users\pei\AppData\Local"}):
            windows = speakers.voices_location()
        with mock.patch.dict(os.environ, {"LOCALAPPDATA": "/mnt/c/Users/pei/AppData/Local"}):
            wsl = speakers.voices_location()
        self.assertEqual(windows, wsl)
        self.assertEqual(windows, r"C:\Users\pei\AppData\Local\meeting-service\voices.json")


class Window(unittest.TestCase):
    def test_a_line_whose_audio_left_the_ring_gets_no_vector(self):
        ring = echo.Ring()
        ring.add(70 * 16000, bytes(3200))      # the ring now starts at 70 s (the model loaded slowly)
        fake = type("T", (), {"ring": ring, "arrival": False})()
        pcm, seconds = speakers.Tracker._window(fake, 2.0, 5.0)
        self.assertIsNone(pcm)
        self.assertEqual(seconds, 3.0)
        self.assertEqual(speakers.Clusters().add(1, None, seconds), ("講者 1", True), "treated like a short line")


class Teardown(unittest.IsolatedAsyncioTestCase):
    """Stop's 5 s timeout cancelled the listening while the model was still loading: the GPU claim went
    back with the model on the GPU. Now the model unloads after its load ends, then the claim goes."""

    async def test_a_cancelled_stop_releases_the_gpu_only_after_the_model_left(self):
        from lib.live import hub as hub_mod
        from lib.live.usage import Usage

        loading = threading.Event()
        order = []

        class SlowEmbedder:
            def __init__(self, token):
                self._lock = threading.Lock()

            def load(self):
                with self._lock:
                    order.append("load start")
                    loading.wait(5)
                    order.append("load end")

            def embed(self, pcm):
                return A

            def unload(self):
                with self._lock:
                    order.append(("unload", gpu_gate.active()))

        async def silent(session, usage, key, language, audio, who="them"):
            while await audio.get() is not None:
                pass

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for p in (mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""}),
                  mock.patch.object(hub_mod.stt_gemini, "run", silent),
                  mock.patch.object(hub_mod.settings, "key", lambda name: "k"),
                  mock.patch.object(hub_mod.speakers, "Embedder", SlowEmbedder),
                  mock.patch.dict(os.environ, {"LOCALAPPDATA": tmp.name}),
                  mock.patch.object(hub_mod, "STOP_TIMEOUT", 0.01)):
            p.start()
            self.addCleanup(p.stop)
        hub = hub_mod.Hub(Usage(os.path.join(tmp.name, "usage.json")))
        await hub.start(object(), "gemini", "en-US", live_speakers=True)
        self.assertEqual(gpu_gate.active(), "live")
        while "load start" not in order:
            await asyncio.sleep(0.01)
        task = hub.task
        stop = asyncio.ensure_future(hub.stop())
        await asyncio.sleep(0.2)
        self.assertTrue(task.cancelling(), "the stop's timeout has cancelled the listening")
        self.assertEqual(gpu_gate.active(), "live", "the claim is kept while the model is still loading")
        loading.set()
        await stop
        await asyncio.wait({task})
        self.assertTrue(task.cancelled())
        self.assertEqual(order, ["load start", "load end", ("unload", "live")])
        self.assertIsNone(gpu_gate.active(), "then given back")
        await hub.finalizing
        self.assertIsNone(hub.tracker, "the speakers and their vectors are gone after the listening")


class Telemetry(unittest.TestCase):
    def test_pyannote_does_not_report_home(self):
        from lib.diarize import no_telemetry
        with mock.patch.dict(os.environ, {"PYANNOTE_METRICS_ENABLED": "true"}):
            no_telemetry()
            from pyannote.audio.telemetry.metrics import CONFIG, is_metrics_enabled
            self.assertTrue(CONFIG["metrics_enabled"], "the installed package has it on by default")
            self.assertFalse(is_metrics_enabled())


if __name__ == "__main__":
    unittest.main()
