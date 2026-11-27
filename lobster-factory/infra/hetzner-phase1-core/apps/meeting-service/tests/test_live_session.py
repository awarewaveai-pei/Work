"""Session wiring over a fake `translate` the test resolves by hand."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dataclasses import asdict  # noqa: E402

from lib.live.session import Segment, Session  # noqa: E402
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
        self.s.on_final.append(lambda seg: self.final.append((seg.id, seg.text)))
        self.s.on_translated.append(lambda id, tr, failed: self.translated.append((id, tr)))

    @staticmethod
    def cap(id, text, tr, final, lang="en-US"):
        # lang: the language listened to (Session's default); "" on the gray "…" line before any text
        return {"type": "caption", **asdict(Segment(id, text=text, tr=tr, final=final, lang=lang))}

    async def test_one_sentence_event_order(self):
        s = self.s
        i = s.open(0.0)
        s.interim(i, "hello there")
        s.finish(i, " hello there. ", 0.0)
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
                self.cap(1, "…", "", False, ""),
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
        i = s.open(0.0)
        self.now[0] = 5.0
        s.interim(i, LONG)
        await settle()
        early = self.fake.calls[0]
        self.assertTrue(early.early)
        s.finish(i, LONG + " the whole deployment.", 0.0)
        await settle()
        final = self.fake.calls[1]
        self.assertTrue(early.stop.is_set(), "the final request cancels the early one")
        self.assertFalse(final.stop.is_set())
        final.fut.set_result("最終翻譯")
        await settle()
        early.fut.set_result("早期譯文")
        await s.drain()
        self.assertEqual(s.segments[0].tr, "最終翻譯")
        self.assertNotIn("早期譯文", [e.get("tr") for e in self.events])
        self.assertEqual(self.translated, [(1, "最終翻譯")])
        self.assertEqual(s._lines, {})

    async def test_empty_final_text_drops_the_line(self):
        s = self.s
        i = s.open(0.0)
        s.finish(i, "   ", 0.0)
        await settle()
        self.assertEqual(self.events, [self.cap(1, "…", "", False, ""), {"type": "caption-remove", "id": 1}])
        self.assertEqual(s.segments, [])
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(s._lines, {})

    async def test_failed_final_translation_shows_the_error_in_the_chinese_field(self):
        s = self.s
        i = s.open(0.0)
        s.finish(i, "good morning", 0.0)
        await settle()
        self.fake.calls[0].fut.set_exception(TranslateError("翻譯失敗：boom"))
        await s.drain()
        self.assertEqual(self.events[-1], self.cap(1, "good morning", "〔翻譯失敗：boom〕", True))
        self.assertEqual(self.translated, [(1, "〔翻譯失敗：boom〕")])

    async def test_context_excludes_the_line_and_what_follows(self):
        s = self.s
        for text in ("a", "b", "c"):
            s.finish(s.open(0.0), text, 0.0)
        s.open(0.0)
        self.assertEqual(s.context(2), ["Them: a"])
        self.assertEqual(s.context(3), ["Them: a", "Them: b"])
        self.assertEqual(s.context(None), ["Them: a", "Them: b", "Them: c"])
        self.assertEqual(s.context(None, 2), ["Them: b", "Them: c"])
        await settle()
        for c in self.fake.calls:
            c.fut.set_result("好")
        await s.drain()


class LanguageTests(unittest.IsolatedAsyncioTestCase):
    """C14: the translation rule and the Simplified-to-Traditional rule (lib/live/langs.py)."""
    setUp = SessionTests.setUp

    async def say(self, listen, target, text):
        self.s.listen, self.s.target = listen, target
        self.s.finish(self.s.open(0.0), text, 1.0)
        await settle()
        return self.s.segments[-1]

    async def test_a_line_already_in_the_target_language_calls_no_model(self):
        seg = await self.say("zh-TW", "zh-TW", "我們今天開會。")
        self.assertEqual((len(self.fake.calls), seg.lang, seg.tr), (0, "zh-TW", ""))
        await self.say("auto", "zh-TW", "下一個議題。")       # auto: the language comes from the script
        await self.say("en-US", "none", "No translation.")    # 不翻譯
        self.assertEqual(len(self.fake.calls), 0)

    async def test_simplified_chinese_in_traditional_out(self):
        seg = await self.say("zh-TW", "en-US", "这个会议讨论预算。")
        self.assertEqual(seg.text, "這個會議討論預算。")
        self.assertEqual(len(self.fake.calls), 1, "Chinese into English is translated")

    async def test_japanese_kanji_stay_as_they_are(self):
        seg = await self.say("ja-JP", "zh-TW", "会議で学ぶことが来る")
        self.assertEqual((seg.text, seg.lang), ("会議で学ぶことが来る", "ja-JP"))
        seg = await self.say("auto", "zh-TW", "会議で学ぶ")
        self.assertEqual((seg.text, seg.lang), ("会議で学ぶ", "ja-JP"))
        self.assertEqual(len(self.fake.calls), 2)


if __name__ == "__main__":
    unittest.main()
