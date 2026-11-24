import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.stt_gemini import Live  # noqa: E402


class FakeSession:
    def __init__(self):
        self.calls = []
        self.next_id = 0

    def open(self):
        self.next_id += 1
        self.calls.append(("open", self.next_id))
        return self.next_id

    def interim(self, line, text):
        self.calls.append(("interim", line, text))

    def finish(self, line, text):
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


if __name__ == "__main__":
    unittest.main()
