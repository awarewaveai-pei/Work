"""C17 我／對方：音訊封包協定、回音守衛、只開一路＝C17 之前的事件順序。"""
import asyncio
import os
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live import echo  # noqa: E402
from lib.live import hub as hub_mod  # noqa: E402
from lib.live.session import ME, Session  # noqa: E402
from lib.live.usage import Usage  # noqa: E402

RATE = 16000


def speech(seconds, seed):
    """Noise whose loudness rises and falls like syllables, a different pattern per seed."""
    rng = np.random.default_rng(seed)
    n = int(seconds * RATE)
    syllables = np.repeat(rng.uniform(0.05, 1.0, n // 3200 + 1), 3200)[:n]
    return (rng.normal(0, 6000, n) * syllables).clip(-32000, 32000).astype(np.int16)


class Protocol(unittest.TestCase):
    def test_frames(self):
        pcm = b"\x01\x00\x02\x00"
        self.assertEqual(hub_mod.parse_frame(b"\x00" + pcm, 2), ("me", pcm))
        self.assertEqual(hub_mod.parse_frame(b"\x01" + pcm, 2), ("them", pcm))
        self.assertIsNone(hub_mod.parse_frame(b"\x01" + pcm + b"\x00", 2), "half a sample")
        self.assertIsNone(hub_mod.parse_frame(b"\x07" + pcm, 2), "unknown source")
        self.assertIsNone(hub_mod.parse_frame(b"\x00", 2), "no audio")
        self.assertEqual(hub_mod.parse_frame(b"\x00" + pcm, 1), ("them", b"\x00" + pcm),
                         "a page without proto: the whole frame is audio, never read as a source byte")


class EchoGuard(unittest.TestCase):
    def session(self, me_pcm, them_pcm):
        me, them = echo.Ring(), echo.Ring()
        me.add(0, me_pcm.tobytes())
        them.add(0, them_pcm.tobytes())
        events = []
        s = Session(None, events.append)
        s.echo = lambda start, end: echo.is_echo(me.slice(int(start * RATE), int(end * RATE)),
                                                 them.slice(int(start * RATE), int(end * RATE)))
        s.target = s.listen = "zh-TW"       # same language: no translation is started
        line = s.open(0.0, "me")
        s.finish(line, "聽到的話", 4.0)
        return s

    def test_the_others_voice_on_the_microphone_is_dropped(self):
        them = speech(4, 1)
        late = np.concatenate([np.zeros(1600, dtype=np.int16), them[:-1600]])     # 100 ms later, 1/10 as loud
        mine = (late * 0.1).astype(np.int16) + speech(4, 9) // 200                    # plus a little room noise
        self.assertEqual(self.session(mine, them).segments, [])

    def test_my_own_voice_is_kept(self):
        s = self.session(speech(4, 2), speech(4, 3))
        self.assertEqual([(x.who, x.speaker, x.text) for x in s.segments], [("me", ME, "聽到的話")])


class OneChannel(unittest.IsolatedAsyncioTestCase):
    """A page without proto: one 「對方」 channel, the events in the order they had before C17."""

    async def test_event_sequence(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)

        async def fake_gemini(session, usage, key, language, audio, who="them"):
            while (item := await audio.get()) is not None:
                if item[0] == 0:
                    session.finish(session.open(0.0, who), "hello there.", 1.0)

        for p in (mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""}),
                  mock.patch.object(hub_mod.stt_gemini, "run", fake_gemini),
                  mock.patch.object(hub_mod.settings, "key", lambda name: "k")):
            p.start()
            self.addCleanup(p.stop)
        hub = hub_mod.Hub(Usage(os.path.join(tmp.name, "usage.json")))
        hub.translator = type("T", (), {"set_keys": lambda *a: None, "__call__": None})()
        hub._session().translate = lambda *a: asyncio.sleep(0, "你好。")
        events = []
        hub.clients["page"] = type("Q", (), {"put_nowait": staticmethod(events.append)})()
        owner = object()
        await hub.start(owner, "gemini", "en-US")
        hub.feed(owner, b"\x00\x00" * 1600)          # starts with a zero byte: still plain audio
        for _ in range(20):
            await asyncio.sleep(0)
        await hub._session().drain()
        await hub.stop()
        await hub.finalizing
        kinds = [(e["type"], e.get("who"), e.get("text"), e.get("tr"), e.get("final")) if e["type"] == "caption"
                 else (e["type"], e.get("on")) for e in events if e["type"] not in ("usage", "summary")]
        self.assertEqual(kinds, [
            ("segment", None), ("listening", True),
            ("caption", "them", "…", "", False), ("caption", "them", "hello there.", "", True),
            ("caption", "them", "hello there.", "你好。", True),
            ("listening", False), ("status", None), ("segment", None)])


if __name__ == "__main__":
    unittest.main()
