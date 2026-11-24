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

    def open(self):
        self.calls.append(("open",))
        return len([c for c in self.calls if c[0] == "open"])

    def interim(self, line, text):
        self.calls.append(("interim", line, text))

    def finish(self, line, text):
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
        queue.put_nowait(audio[i:i + 1600].tobytes())
    queue.put_nowait(None)


class SttLocalTests(unittest.IsolatedAsyncioTestCase):
    def tearDown(self):
        gpu_gate.release_live()

    async def run_with(self, audio, model=None, language="zh-TW"):
        session, usage, queue = FakeSession(), FakeUsage(), asyncio.Queue()
        model = model or FakeModel()
        await feed(audio, queue)
        await asyncio.wait_for(stt_local.run(session, usage, language, queue, model_provider=lambda: model), 10)
        return session, usage, model

    async def test_one_sentence_opens_once_and_finishes_once(self):
        session, usage, model = await self.run_with(np.concatenate([tone(1500), silence(800)]))
        self.assertEqual(len(session.kinds("open")), 1)
        self.assertEqual(session.kinds("finish"), [("finish", 1, "你好")])
        self.assertEqual(session.kinds("drop"), [])
        self.assertEqual(model.kwargs["language"], "zh")
        self.assertEqual(usage.added[0][0], "local-whisper")
        self.assertIsNone(gpu_gate.active())

    async def test_a_click_is_dropped(self):
        session, _, _ = await self.run_with(np.concatenate([tone(120), silence(900)]))
        self.assertEqual(len(session.kinds("open")), 1)
        self.assertEqual(session.kinds("drop"), [("drop", 1)])
        self.assertEqual(session.kinds("finish"), [])

    async def test_busy_gpu_means_no_recognition(self):
        self.assertTrue(gpu_gate.acquire_batch())
        try:
            session, _, model = await self.run_with(np.concatenate([tone(1500), silence(800)]))
            self.assertIsNone(model.kwargs)
            self.assertEqual(session.kinds("open"), [])
            self.assertTrue(session.kinds("status"))
            self.assertEqual(gpu_gate.active(), "batch")
        finally:
            gpu_gate.release_batch()


if __name__ == "__main__":
    unittest.main()
