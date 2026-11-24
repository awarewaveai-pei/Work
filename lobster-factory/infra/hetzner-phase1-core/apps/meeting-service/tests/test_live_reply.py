"""Session.compose_reply over a fake `compose` the test resolves by hand."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.session import Session  # noqa: E402
from lib.live.translate import TranslateError  # noqa: E402


class FakeCompose:
    def __init__(self):
        self.calls = []

    async def __call__(self, system, user, on_delta):
        fut = asyncio.get_running_loop().create_future()
        self.calls.append((system, user, on_delta, fut))
        return await fut


async def settle():
    for _ in range(5):
        await asyncio.sleep(0)


class ReplyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.fake = FakeCompose()
        self.s = Session(self.translate, self.events.append, compose=self.fake)

    @staticmethod
    async def translate(system, user, on_delta, stop, early):
        return "對方的中文"

    @staticmethod
    def ev(id, zh, en, done):
        return {"type": "reply", "id": id, "zh": zh, "en": en, "done": done}

    async def test_one_reply_streams_then_finishes_and_is_remembered(self):
        s = self.s
        s.finish(s.open(), "Can you hear me?")
        s.glossary = "上線 = go live"
        s.script = "# Pitch"
        id = s.compose_reply("聽得到")
        await settle()
        system, user, on_delta, fut = self.fake.calls[0]
        self.assertIn("go live", system[0]["text"])
        self.assertIn("# Pitch", system[1]["text"])
        self.assertIn("Them: Can you hear me?", user)
        self.assertIn("聽得到", user)
        on_delta("Yes")
        on_delta("Yes, I can.")
        fut.set_result("Yes, I can.\n")
        await s.drain()
        replies = [e for e in self.events if e["type"] == "reply"]
        self.assertEqual(
            replies,
            [self.ev(id, "聽得到", "", False), self.ev(id, "聽得到", "Yes", False), self.ev(id, "聽得到", "Yes, I can.", False), self.ev(id, "聽得到", "Yes, I can.", True)],
        )
        self.assertEqual(s.reply, {"id": id, "zh": "聽得到", "en": "Yes, I can.", "done": True})
        self.assertEqual(s.my_lines, [(1, "Yes, I can.")])
        self.assertIn("Me: Yes, I can.", s.context(None))

    async def test_a_newer_reply_silences_the_older_one(self):
        s = self.s
        first = s.compose_reply("第一句")
        await settle()
        first_task = s._reply_task
        second = s.compose_reply("第二句")
        await settle()
        self.assertNotEqual(first, second)
        self.assertTrue(first_task.cancelled(), "the older reply stops costing money")
        n = len(self.events)
        _, _, delta1, _ = self.fake.calls[0]
        _, _, delta2, fut2 = self.fake.calls[1]
        delta1("late words")
        await settle()
        self.assertEqual(len(self.events), n)
        delta2("Second.")
        fut2.set_result("Second.")
        await s.drain()
        self.assertEqual([e["id"] for e in self.events[n:]], [second, second])
        self.assertTrue(self.events[-1]["done"])
        self.assertEqual([en for _, en in s.my_lines], ["Second."])

    async def test_a_failing_model_shows_the_error_and_finishes(self):
        id = self.s.compose_reply("你好")
        await settle()
        self.fake.calls[0][3].set_exception(TranslateError("還沒有設定翻譯用的金鑰"))
        await self.s.drain()
        self.assertEqual(self.events[-1], self.ev(id, "你好", "[Failed: 還沒有設定翻譯用的金鑰]", True))
        self.assertEqual(self.s.my_lines, [])


if __name__ == "__main__":
    unittest.main()
