"""lib/live/summary.py：batch.rs 的測試，加上批次的排程規則與「沒開摘要就不呼叫模型」。"""
import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live import archive as arc  # noqa: E402
from lib.live import hub as hub_mod  # noqa: E402
from lib.live import summary as sm  # noqa: E402
from lib.live.usage import Usage  # noqa: E402

M = 60.0


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class FakeModel:
    """`complete` answers with the next text; with `hold`, it waits until the test sets the future."""

    def __init__(self, texts):
        self.texts = list(texts)
        self.calls = []
        self.hold = None

    async def complete(self, system, user):
        self.calls.append((system, user))
        if self.hold is not None:
            await self.hold
        return self.texts.pop(0)


class BatchRsPorts(unittest.TestCase):
    def test_a_batch_needs_the_interval_and_a_few_lines(self):
        self.assertFalse(sm.due(10, 4 * M, 5 * M), "not before the interval")
        self.assertTrue(sm.due(10, 5 * M, 5 * M))
        self.assertFalse(sm.due(2, 30 * M, 5 * M), "a quiet room does not make a batch")
        self.assertFalse(sm.due(100, 300 * M, None), "0 minutes = no batches")


class SummaryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = Clock()
        self.model = FakeModel(["- 重點一", "- 重點一\n- 重點二", "- 最後"])
        self.events = []
        self.s = sm.Summary(self.model.complete, lambda: [{"type": "text", "text": "SYS"}], self.events.append,
                            clock=self.clock, now=lambda: datetime(2026, 11, 24, 10, 7))
        self.saved = []
        self.s.on_update = lambda text, updated: self.saved.append((text, updated))
        self.s.begin(5)

    def lines(self, first, n):
        for i in range(first, first + n):
            self.s.line_finished(i, f"line {i}")
            self.s.line_translated(i, f"第 {i} 句")

    async def test_fewer_than_three_lines_never_call(self):
        self.lines(1, 2)
        self.clock.t = 60 * M
        self.s.tick()
        self.assertEqual(self.model.calls, [])
        self.assertEqual(len(self.s.pending), 2)

    async def test_three_lines_after_the_interval_call_once_and_carry_the_previous_summary(self):
        self.lines(1, 3)
        self.clock.t = 4 * M
        self.s.tick()
        self.assertEqual(self.model.calls, [], "interval not over yet")
        self.clock.t = 5 * M
        self.s.tick()
        await self.s.task
        self.assertEqual(len(self.model.calls), 1)
        system, user = self.model.calls[0]
        self.assertEqual(system, [{"type": "text", "text": "SYS"}])
        self.assertIn("Summary so far:\n(none yet)", user)
        self.assertIn("[10:07] line 1\n  （第 1 句）\n[10:07] line 2", user)
        self.assertEqual((self.s.text, self.s.updated, self.s.lines, self.s.error), ("- 重點一", "10:07", 3, ""))
        self.assertEqual(self.saved, [("- 重點一", "10:07")])
        self.assertEqual(self.events[-1], {"type": "summary", "text": "- 重點一", "updated": "10:07", "lines": 3, "working": False, "error": "", "enabled": True})

        self.lines(4, 3)
        self.clock.t = 10 * M
        self.s.tick()
        await self.s.task
        self.assertEqual(len(self.model.calls), 2)
        self.assertIn("Summary so far:\n- 重點一\n\n", self.model.calls[1][1])
        self.assertNotIn("line 1\n", self.model.calls[1][1], "only the new lines go in")
        self.assertEqual(self.s.lines, 6)

    async def test_a_batch_that_finds_the_last_update_still_running_waits_for_the_next(self):
        self.model.hold = asyncio.get_running_loop().create_future()
        self.lines(1, 3)
        self.clock.t = 5 * M
        self.s.tick()
        await asyncio.sleep(0)
        self.assertTrue(self.s.view()["working"])
        self.lines(4, 3)
        self.clock.t = 10 * M
        self.s.tick()
        self.assertEqual(len(self.model.calls), 1)
        self.assertEqual([l.id for l in self.s.pending], [4, 5, 6], "kept for the next batch")
        self.model.hold.set_result(None)
        self.model.hold = None
        await self.s.task
        self.clock.t = 15 * M
        self.s.tick()
        await self.s.task
        self.assertEqual(len(self.model.calls), 2)
        self.assertIn("line 4", self.model.calls[1][1])

    async def test_a_failed_update_keeps_its_lines_and_says_why(self):
        async def broken(system, user):
            raise sm.TranslateError("boom")

        self.s.complete = broken
        self.lines(1, 3)
        self.clock.t = 5 * M
        self.s.tick()
        await self.s.task
        self.assertEqual(self.s.error, "摘要失敗：boom")
        self.assertEqual(len(self.s.pending), 3)
        self.assertEqual(self.saved, [])

    async def test_stopping_gives_whatever_is_left_one_last_update(self):
        self.lines(1, 2)
        await self.s.finish()
        self.assertEqual(len(self.model.calls), 1, "two lines are enough at the end")
        self.assertEqual(self.s.text, "- 重點一")
        self.s.line_finished(9, "after the end")
        self.assertEqual(self.s.pending, [], "no more lines once listening ended")

    async def test_stopping_with_nothing_new_calls_nothing(self):
        await self.s.finish()
        self.assertEqual(self.model.calls, [])

    async def test_the_next_listening_starts_without_the_last_ones_summary_or_lines(self):
        for i in (1, 2, 3):
            self.s.line_finished(i, f"first-meeting {i}")
        self.clock.t = 5 * M
        self.s.tick()
        await self.s.task                      # first meeting: one update, "- 重點一"

        async def broken(system, user):
            raise sm.TranslateError("boom")

        real, self.s.complete = self.s.complete, broken
        for i in (4, 5, 6):
            self.s.line_finished(i, f"first-meeting {i}")
        self.clock.t = 10 * M
        self.s.tick()
        await self.s.task                      # a failed batch stays in `pending`
        self.assertEqual(len(self.s.pending), 3)

        self.s.complete = real
        self.s.begin(5)                        # second meeting
        for i in (7, 8, 9):
            self.s.line_finished(i, f"second-meeting {i}")
        self.clock.t = 20 * M
        self.s.tick()
        await self.s.task
        user = self.model.calls[-1][1]
        self.assertIn("Summary so far:\n(none yet)", user)
        self.assertIn("second-meeting 7", user)
        self.assertNotIn("first-meeting", user)
        self.assertNotIn("重點一", user)

    async def test_an_update_from_the_previous_listening_is_dropped_when_it_returns(self):
        self.model.hold = asyncio.get_running_loop().create_future()
        self.lines(1, 3)
        self.clock.t = 5 * M
        self.s.tick()
        await asyncio.sleep(0)
        finishing = asyncio.ensure_future(self.s.finish())
        await asyncio.sleep(0)
        self.s.begin(5)                        # the next listening starts before the old update returns
        self.lines(10, 2)
        self.model.hold.set_result(None)
        await finishing
        self.assertEqual(len(self.model.calls), 1, "the new listening's lines were not sent by the old finish")
        self.assertEqual((self.s.text, self.saved), ("", []))
        self.assertEqual(len(self.s.pending), 2)

    async def test_clearing_the_captions_starts_over(self):
        self.lines(1, 3)
        self.clock.t = 5 * M
        self.s.tick()
        await self.s.task
        self.lines(4, 1)
        self.s.clear()
        self.assertEqual((self.s.text, self.s.lines, self.s.pending), ("", 0, []))
        self.assertEqual(self.events[-1]["text"], "")


class HubSummarySwitch(unittest.IsolatedAsyncioTestCase):
    """The page asks for the summary per listening (`summary`); without it the model is never called."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        for p in (mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": os.path.join(self._tmp.name, "sessions")}),
                  mock.patch.object(arc, "MIN_FREE_BYTES", 0),
                  mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""}),
                  mock.patch.object(hub_mod.settings, "get_api_key", lambda: ""),
                  mock.patch.object(hub_mod.stt_local, "run", self.idle_stt)):
            p.start()
            self.addCleanup(p.stop)
        self.hub = hub_mod.Hub(Usage(os.path.join(self._tmp.name, "usage.json")))
        self.model = self.hub.translator = self.Translator()

    class Translator:
        def __init__(self):
            self.completes = []

        def set_keys(self, anthropic_key, gemini_key):
            pass

        async def __call__(self, system, user, on_delta, stop, early):
            return "譯文"

        async def complete(self, system, user, target="zh-TW"):
            self.completes.append(user)
            return "- 重點"

    @staticmethod
    async def idle_stt(session, usage, language, audio):
        while await audio.get() is not None:
            pass

    async def meeting(self, **flags) -> None:
        hub, owner = self.hub, object()
        await hub.start(owner, "local", "en-US", **flags)
        s = hub.session
        for text in ("one two three.", "four five six.", "seven eight nine."):
            s.finish(s.open(0.0), text, 0.0)
        await s.drain()
        hub.summary.last -= 3600       # the interval is over
        hub.summary.tick()
        await hub.stop()
        if hub.finalizing is not None:
            await hub.finalizing

    async def test_no_model_call_unless_the_summary_was_asked_for(self):
        await self.meeting()
        self.assertEqual(self.model.completes, [])
        self.assertEqual(self.hub.snapshot()["summary"]["text"], "")

    async def test_asked_for_it_updates_once_and_lands_in_summary_md_when_saving(self):
        await self.meeting(summary=True, save=True)
        self.assertEqual(len(self.model.completes), 1)
        self.assertEqual(self.hub.snapshot()["summary"]["text"], "- 重點")
        from lib import ownvoice
        self.assertIn("- 重點", ownvoice.read_text("latest", "summary.md"))


if __name__ == "__main__":
    unittest.main()
