import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.stt_gemini import Live  # noqa: E402


class FakeSession:
    def __init__(self):
        self.calls = []
        self.next_id = 0

    def open(self, start):
        self.next_id += 1
        self.calls.append(("open", self.next_id))
        return self.next_id

    def interim(self, line, text):
        self.calls.append(("interim", line, text))

    def finish(self, line, text, end):
        self.calls.append(("finish", line, text))


def interim(text):
    return {"serverContent": {"interimInputTranscription": {"text": text}}}


def final(text):
    return {"serverContent": {"inputTranscription": {"text": text}}}


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.session = FakeSession()
        self.live = Live(self.session)

    def test_interims_update_one_line_then_final_finishes_it(self):
        for t in ("hel", "hello", "hello wor"):
            self.live.handle(interim(t))
        self.live.handle(final(" hello world. "))
        self.assertEqual(self.session.calls, [
            ("open", 1),
            ("interim", 1, "hel"),
            ("interim", 1, "hello"),
            ("interim", 1, "hello wor"),
            ("finish", 1, "hello world."),
        ])
        self.assertIsNone(self.live.current)

    def test_final_without_interim_opens_a_new_line(self):
        self.live.handle(final("hello"))
        self.assertEqual(self.session.calls, [("open", 1), ("finish", 1, "hello")])

    def test_empty_final_drops_the_line(self):
        self.live.handle(interim("hmm"))
        self.live.handle(final(""))
        self.assertEqual(self.session.calls[-1], ("finish", 1, ""))
        self.assertIsNone(self.live.current)

    def test_empty_final_without_a_line_does_nothing(self):
        self.live.handle(final(""))
        self.assertEqual(self.session.calls, [])


    def test_speech_without_pauses_comes_out_a_sentence_at_a_time(self):
        # 2026-11-25: a read-out dialogue with no pauses became one caption for a whole minute (Gemini
        # only ends a turn at a pause). Words arrive every 0.3 s, the 100 ms tick runs, no final until the end.
        said = ("Also, yes, we've reviewed it internally. Overall, we're satisfied with the product specifications. "
                "However, the unit price of $125 is slightly above our budget. I understand your concern. "
                "Due to the recent increase in raw material costs, we've had to adjust our pricing by approximately 8%. "
                "That's understandable. What about the lead time?")
        now = [0.0]
        live = Live(self.session, clock=lambda: now[0])
        words = said.split(" ")
        for i in range(1, len(words) + 1):
            live.handle(interim(" ".join(words[:i])))
            for _ in range(3):
                now[0] += 0.1
                live.tick()
        live.handle(final(said))
        done = [c[2] for c in self.session.calls if c[0] == "finish"]
        self.assertGreaterEqual(len(done), 6, done)
        self.assertTrue(all(done), done)
        self.assertEqual(" ".join(done), said)
        self.assertIsNone(live.current)

    def test_a_final_that_rewrites_finished_words_neither_repeats_nor_drops_a_sentence(self):
        # Interim glued "old build"; the final splits it. Two sentences went out, a third was still gray.
        now = [0.0]
        live = Live(self.session, clock=lambda: now[0])
        heard = "We start the migration today. Then we retire the oldbuild servers. And the third one"
        live.handle(interim(heard))
        now[0] = 2.0
        live.tick()
        live.handle(final("We start the migration today. Then we retire the old build servers. And the third one."))
        done = [c[2] for c in self.session.calls if c[0] == "finish" and c[2]]
        self.assertEqual(done, ["We start the migration today.", "Then we retire the oldbuild servers.", "And the third one"])

    def test_a_connection_that_ends_mid_turn_finishes_what_was_heard(self):
        # A refusal, a drop or a rotation starts a new hypothesis; the old gray line must not stay gray or vanish.
        import asyncio
        from lib.live import stt_gemini

        class Session(FakeSession):
            def status(self, text):
                pass

        session = Session()

        async def refused(_session, usage, key, language, audio, live, clock=None):
            live.handle(interim("Then we retire the old build servers"))
            raise stt_gemini._Fatal("401")

        real, stt_gemini._session = stt_gemini._session, refused
        try:
            asyncio.run(stt_gemini.run(session, None, "k", "", asyncio.Queue()))
        finally:
            stt_gemini._session = real
        self.assertEqual(session.calls[-1], ("finish", 1, "Then we retire the old build servers"))

    def test_audio_left_in_the_queue_while_the_line_was_down_is_reported_lost(self):
        # Reconnecting can take up to 30 s; that speech never reaches Gemini and must not look complete.
        import asyncio
        from lib.live import stt_gemini

        lost = []

        class Session:
            def lost(self, seconds):
                lost.append(seconds)

        q = asyncio.Queue()
        q.put_nowait((0, bytes(3200)))
        q.put_nowait((1600, bytes(3200)))
        self.assertFalse(stt_gemini._drain(q, Session()))
        self.assertEqual(lost, [0.2])


if __name__ == "__main__":
    unittest.main()
