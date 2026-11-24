"""Session wiring over a fake `translate` the test resolves by hand."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.session import Session  # noqa: E402
from lib.live.translate import TranslateError  # noqa: E402

LONG = "so the plan for the next quarter is to move"


class Call:
    def __init__(self, system, user, on_delta, stop, early, fut):
        self.system, self.user, self.on_delta, self.stop, self.early, self.fut = system, user, on_delta, stop, early, fut


class FakeTranslate:
    def __init__(self):
        self.calls = []

    async def __call__(self, system, user, on_delta, stop, early):
        fut = asyncio.get_running_loop().create_future()
        self.calls.append(Call(system, user, on_delta, stop, early, fut))
        return await fut


async def settle():
    for _ in range(5):
        await asyncio.sleep(0)


class SessionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.now = [0.0]
        self.fake = FakeTranslate()
        self.s = Session(self.fake, self.events.append, clock=lambda: self.now[0])
        self.final = []
        self.translated = []
        self.s.on_final.append(lambda i, en: self.final.append((i, en)))
        self.s.on_translated.append(lambda i, zh: self.translated.append((i, zh)))

    @staticmethod
    def cap(id, en, zh, final):
        return {"type": "caption", "id": id, "en": en, "zh": zh, "final": final}

    async def test_one_sentence_event_order(self):
        s = self.s
        i = s.open()
        s.interim(i, "hello there")
        s.finish(i, " hello there. ")
        await settle()
        self.assertEqual(len(self.fake.calls), 1)
        call = self.fake.calls[0]
        self.assertFalse(call.early)
        self.assertIn("hello there.", call.user)
        call.on_delta("你好")
        call.fut.set_result("你好。")
        await s.drain()
        self.assertEqual(
            self.events,
            [
                self.cap(1, "…", "", False),
                self.cap(1, "hello there", "", False),
                self.cap(1, "hello there.", "", True),
                self.cap(1, "hello there.", "你好", True),
                self.cap(1, "hello there.", "你好。", True),
            ],
        )
        self.assertEqual(self.final, [(1, "hello there.")])
        self.assertEqual(self.translated, [(1, "你好。")])
        self.assertEqual(s._lines, {})

    async def test_early_result_after_the_final_one_does_not_overwrite(self):
        s = self.s
        i = s.open()
        self.now[0] = 5.0
        s.interim(i, LONG)
        await settle()
        early = self.fake.calls[0]
        self.assertTrue(early.early)
        s.finish(i, LONG + " the whole deployment.")
        await settle()
        final = self.fake.calls[1]
        self.assertTrue(early.stop.is_set(), "the final request cancels the early one")
        self.assertFalse(final.stop.is_set())
        final.fut.set_result("最終翻譯")
        await settle()
        early.fut.set_result("早期譯文")
        await s.drain()
        self.assertEqual(s.segments[0].zh, "最終翻譯")
        self.assertNotIn("早期譯文", [e.get("zh") for e in self.events])
        self.assertEqual(self.translated, [(1, "最終翻譯")])
        self.assertEqual(s._lines, {})

    async def test_empty_final_text_drops_the_line(self):
        s = self.s
        i = s.open()
        s.finish(i, "   ")
        await settle()
        self.assertEqual(self.events, [self.cap(1, "…", "", False), {"type": "caption-remove", "id": 1}])
        self.assertEqual(s.segments, [])
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(s._lines, {})

    async def test_failed_final_translation_shows_the_error_in_the_chinese_field(self):
        s = self.s
        i = s.open()
        s.finish(i, "good morning")
        await settle()
        self.fake.calls[0].fut.set_exception(TranslateError("翻譯失敗：boom"))
        await s.drain()
        self.assertEqual(self.events[-1], self.cap(1, "good morning", "〔翻譯失敗：boom〕", True))
        self.assertEqual(self.translated, [(1, "〔翻譯失敗：boom〕")])

    async def test_context_excludes_the_line_and_what_follows(self):
        s = self.s
        for en in ("a", "b", "c"):
            s.finish(s.open(), en)
        s.open()
        self.assertEqual(s.context(2), ["Them: a"])
        self.assertEqual(s.context(3), ["Them: a", "Them: b"])
        self.assertEqual(s.context(None), ["Them: a", "Them: b", "Them: c"])
        self.assertEqual(s.context(None, 2), ["Them: b", "Them: c"])
        await settle()
        for c in self.fake.calls:
            c.fut.set_result("好")
        await s.drain()


if __name__ == "__main__":
    unittest.main()
