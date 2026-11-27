"""Ported from OwnVoice Meet src-tauri/src/sentences.rs tests (Apache-2.0). `skip()` is not ported, nor its test."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.sentences import FINAL, INTERIM, SHORT_BYTES, Tracker, clean, words  # noqa: E402

TRACE = os.path.join(os.path.dirname(__file__), "data", "live-captions-en-trace.json")


def finals(ev):
    return [t for k, t in ev if k == FINAL]


def norm_words(s):
    return [w.norm for w in words(clean(s))]


def hold(t, text, from_ms, ms):
    """Updates 25 ms apart with the same text, from `from_ms` for `ms` milliseconds."""
    out = []
    for k in range(ms // 25 + 1):
        out.extend(t.update(text, (from_ms + 25 * k) / 1000))
    return out


class SentenceTests(unittest.TestCase):
    def test_cleans_like_sync_loop(self):
        self.assertEqual(clean("the U.S economy"), "the US economy")
        self.assertEqual(clean("Dr. J.Smith said"), "Dr. J Smith said")
        self.assertEqual(clean("We moved to AWS. Then OK. So"), "We moved to AWS. Then OK. So")
        self.assertEqual(clean("Hello , world .How are you ?"), "Hello, world. How are you?")
        self.assertEqual(clean("你好 。 我們開始 ， 好嗎"), "你好。我們開始，好嗎")
        self.assertEqual(clean("Revenue grew 3.5 percent to 1,200 units."), "Revenue grew 3.5 percent to 1,200 units.")
        self.assertEqual(clean("this first line is long enough to end a sentence\nnext"), "this first line is long enough to end a sentence. next")
        self.assertEqual(clean("Hi\nthere"), "Hi—there")
        self.assertEqual(clean("会議を始めます\n次"), "会議を始めます——次")

    def test_words_ignore_case_and_commas_and_keep_numbers_whole(self):
        got = [(w.norm, w.eos) for w in words(clean("Revenue grew 3.5 percent, don't you think? Yes. 好。"))]
        self.assertEqual(got, [("revenue", False), ("grew", False), ("3.5", False), ("percent", False), ("don't", False),
                               ("you", False), ("think", True), ("yes", True), ("好", True)])

    def test_a_real_recording_becomes_whole_sentences_without_repeats(self):
        trace = json.load(open(TRACE, encoding="utf-8"))
        t = Tracker()
        ev = []
        # The app polls every 25 ms: replay each text until the next one arrived, and 4 s after the last.
        for i, (ms, text) in enumerate(trace):
            until = trace[i + 1][0] if i + 1 < len(trace) else ms + 4000
            now = ms
            while now < until:
                ev.extend(t.update(text, now / 1000))
                now += 25
        fs = finals(ev)
        # No fragments: every finished line is a real sentence (the provisional periods did not count).
        self.assertTrue(all(len(f.encode()) >= SHORT_BYTES for f in fs), fs)
        self.assertLessEqual(len(fs), 5, fs)
        # No word sequence finished twice.
        all_words = [w for f in fs for w in norm_words(f)]
        grams = [tuple(all_words[i:i + 4]) for i in range(len(all_words) - 3)]
        for g in grams:
            self.assertEqual(grams.count(g), 1, (g, fs))
        # Everything said came out once, in order.
        said = norm_words("Pipeline onto the new cluster and then retire the old build servers once every single team has signed off on the migration checklist that we shared last week. Thanks everyone for joining the call today. Could you share your screen and walk us through the deployment")
        self.assertEqual(all_words, said, fs)

    def test_a_provisional_period_at_the_end_does_not_finish_a_sentence(self):
        t = Tracker()
        ev = t.update("Pipeline.", 0.0)
        ev += t.update("Pipeline onto the.", 0.3)
        ev += t.update("Pipeline onto the new cluster", 0.9)
        self.assertEqual(finals(ev), [])
        self.assertEqual(t.open, "Pipeline onto the new cluster")

    def test_a_settled_sentence_end_with_words_after_it_finishes_the_sentence(self):
        t = Tracker()
        ev = hold(t, "Thanks everyone for joining the call today. Could you", 0, 1400)
        self.assertEqual(finals(ev), [], "not settled yet")
        ev = t.update("Thanks everyone for joining the call today. Could you share", 1.5)
        self.assertEqual(finals(ev), ["Thanks everyone for joining the call today."])
        self.assertEqual(ev[-1], (INTERIM, "Could you share"))

    def test_a_middle_period_that_comes_and_goes_is_not_a_repeat(self):
        t = Tracker()
        ev = hold(t, "retire the old build servers. Once every single team", 0, 1600)
        self.assertEqual(finals(ev), ["retire the old build servers."])
        ev = t.update("retire the old build servers once every single team has signed off", 1.7)
        self.assertEqual(finals(ev), [])
        self.assertEqual(t.open, "once every single team has signed off")

    def test_silence_finishes_the_last_sentence(self):
        t = Tracker()
        self.assertEqual(finals(hold(t, "Could you share your screen?", 0, 1500)), ["Could you share your screen?"])
        # Without a sentence end it waits longer.
        t = Tracker()
        self.assertEqual(finals(hold(t, "and that we shared last", 0, 2900)), [])
        self.assertEqual(finals(t.update("and that we shared last", 3.0)), ["and that we shared last"])

    def test_short_sentences_join_the_next(self):
        t = Tracker()
        self.assertEqual(finals(hold(t, "OK. So let us begin with the plan. Next", 0, 1600)), ["OK. So let us begin with the plan."])
        t = Tracker()
        self.assertEqual(finals(hold(t, "Yes.", 0, 1600)), ["Yes."])

    def test_text_cut_off_at_the_front_mid_word_is_still_followed(self):
        t = Tracker()
        ev = hold(t, "Pipeline onto the new cluster and then retire the old build servers. Once every", 0, 1600)
        self.assertEqual(finals(ev), ["Pipeline onto the new cluster and then retire the old build servers."])
        ev = t.update("eline onto the new cluster and then retire the old build servers. Once every single team", 1.7)
        self.assertEqual(finals(ev), [])
        self.assertEqual(t.open, "Once every single team")

    def test_chinese_is_followed_character_by_character(self):
        t = Tracker()
        self.assertEqual(finals(hold(t, "謝謝大家今天來參加這個會議。可以請你", 0, 1600)), ["謝謝大家今天來參加這個會議。"])
        self.assertEqual(t.open, "可以請你")



def test_spaces_between_chinese_characters_are_dropped_but_not_around_latin_words():
    # 2026-11-27: Gemini's interim Chinese came out as 「今天我 們討 論新 產品」 on screen and in the transcript.
    from lib.live.sentences import clean
    assert clean("今天我 們討 論新 產品 用 AI 工具") == "今天我們討論新產品用 AI 工具"

if __name__ == "__main__":
    unittest.main()
