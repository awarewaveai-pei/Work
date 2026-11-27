import asyncio
import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import gpu_gate  # noqa: E402
from lib.live import stt_local  # noqa: E402

RATE = 16_000


def tone(ms):
    return np.array([int(math.sin(i * 0.3) * 8000) for i in range(RATE * ms // 1000)], dtype=np.int16)


def silence(ms):
    return np.zeros(RATE * ms // 1000, dtype=np.int16)


class FakeSession:
    def __init__(self):
        self.calls = []

    def open(self, start, who="them"):
        self.calls.append(("open",))
        return len([c for c in self.calls if c[0] == "open"])

    def interim(self, line, text):
        self.calls.append(("interim", line, text))

    def finish(self, line, text, end, lang=None):
        self.calls.append(("finish", line, text))

    def drop(self, line):
        self.calls.append(("drop", line))

    def fail(self, line, msg):
        self.calls.append(("fail", line, msg))

    def status(self, text):
        self.calls.append(("status", text))

    def kinds(self, kind):
        return [c for c in self.calls if c[0] == kind]


class FakeUsage:
    def __init__(self):
        self.added = []

    def add_audio(self, model_id, seconds):
        self.added.append((model_id, seconds))


class FakeModel:
    def __init__(self, text="你好"):
        self.text = text
        self.kwargs = None

    def transcribe(self, samples, **kwargs):
        self.kwargs = kwargs
        seg = type("Seg", (), {"text": self.text})()
        return [seg], None


async def feed(audio, queue):
    for i in range(0, len(audio), 1600):
        queue.put_nowait((i, audio[i:i + 1600].tobytes()))
    queue.put_nowait(None)


class SttLocalTests(unittest.IsolatedAsyncioTestCase):
    async def run_with(self, audio, model=None, language="zh-TW"):
        session, usage, queue = FakeSession(), FakeUsage(), asyncio.Queue()
        model = model or FakeModel()
        await feed(audio, queue)
        recognizer = stt_local.Recognizer(session, usage, model_provider=lambda: model)
        await asyncio.wait_for(stt_local.run(session, recognizer, language, queue), 10)
        await asyncio.wait_for(recognizer.close(), 10)
        return session, usage, model

    async def test_one_sentence_opens_once_and_finishes_once(self):
        session, usage, model = await self.run_with(np.concatenate([tone(1500), silence(800)]))
        self.assertEqual(len(session.kinds("open")), 1)
        self.assertEqual(session.kinds("finish"), [("finish", 1, "你好")])
        self.assertEqual(session.kinds("drop"), [])
        self.assertEqual(model.kwargs["language"], "zh")
        self.assertEqual(usage.added[0][0], "local-whisper")

    async def test_a_click_is_dropped(self):
        session, _, _ = await self.run_with(np.concatenate([tone(120), silence(900)]))
        self.assertEqual(len(session.kinds("open")), 1)
        self.assertEqual(session.kinds("drop"), [("drop", 1)])
        self.assertEqual(session.kinds("finish"), [])


class WhileTheModelLoads(unittest.IsolatedAsyncioTestCase):
    """2026-11-27 (C15 real run): the model took 13-24 s to load while a 10 s queue filled; the first 5 s
    of the meeting never reached recognition. Speech must be cut and kept while it loads."""

    async def test_nothing_said_while_the_model_loads_is_lost(self):
        from lib.live import hub as hub_mod
        from lib.live.usage import Usage
        import tempfile
        from unittest import mock

        loaded = asyncio.Event()
        model = FakeModel()

        def slow_model():
            # The load runs in a thread: wait there until the test has sent 15 s of speech.
            while not loaded.is_set():
                import time
                time.sleep(0.01)
            return model

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for p in (mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""}),
                  mock.patch.object(stt_local, "default_model", slow_model),
                  mock.patch.object(stt_local, "_unload", lambda: None)):
            p.start()
            self.addCleanup(p.stop)
        hub = hub_mod.Hub(Usage(os.path.join(tmp.name, "usage.json")))
        hub.translator = type("T", (), {"set_keys": lambda *a: None})()
        lost = []
        hub._session().on_lost.append(lost.append)
        hub._session().translate = lambda *a: asyncio.sleep(0, "譯")
        owner = object()
        await hub.start(owner, "local", "zh-TW")
        sentence = np.concatenate([tone(1500), silence(1000)])
        audio = np.concatenate([sentence] * 6)          # 15 s, six sentences, more than the 10 s queue
        for i in range(0, len(audio), 1600):
            hub.feed(owner, audio[i:i + 1600].tobytes())
            await asyncio.sleep(0)
        loaded.set()
        await hub.stop()
        await asyncio.wait_for(hub.task, 10) if not hub.task.done() else None
        finals = [s for s in hub._session().segments if s.final]
        self.assertEqual(lost, [], "no audio reported lost")
        self.assertEqual(len(finals), 6, [s.text for s in hub._session().segments])
        self.assertIsNone(gpu_gate.active(), "the one GPU claim was given back")
        if hub.finalizing is not None:
            await hub.finalizing


class OneGpuClaim(unittest.IsolatedAsyncioTestCase):
    async def test_busy_gpu_means_local_listening_does_not_start(self):
        from lib.live import hub as hub_mod
        from lib.live.usage import Usage
        import tempfile
        from unittest import mock

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        p = mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""})
        p.start()
        self.addCleanup(p.stop)
        hub = hub_mod.Hub(Usage(os.path.join(tmp.name, "usage.json")))
        self.assertTrue(gpu_gate.acquire_batch())
        try:
            await hub.start(object(), "local", "zh-TW")
            self.assertFalse(hub.listening)
            self.assertEqual(hub._session().status_text, hub_mod.BUSY_TEXT)
            self.assertEqual(gpu_gate.active(), "batch")
        finally:
            gpu_gate.release_batch()


if __name__ == "__main__":
    unittest.main()
