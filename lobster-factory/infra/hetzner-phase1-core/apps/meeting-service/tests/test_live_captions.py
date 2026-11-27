"""Port of the #[test]s in OwnVoice Meet captions.rs."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.captions import EARLY_AFTER, EARLY_EVERY, Line, reads_as_subtitle  # noqa: E402

LONG = "so the plan for the next quarter is to move"


class CaptionsTests(unittest.TestCase):
    def test_early_translation_waits_then_throttles(self):
        t0 = 100.0
        l = Line(t0)
        self.assertFalse(l.wants_early(LONG, t0 + 3), "not before 4 s")
        self.assertFalse(l.wants_early("so the plan", t0 + EARLY_AFTER), "too short to be worth it")
        self.assertTrue(l.wants_early(LONG, t0 + EARLY_AFTER))
        l.start(LONG, True, t0 + EARLY_AFTER)
        longer = "so the plan for the next quarter is to move the whole deployment"
        self.assertFalse(l.wants_early(longer, t0 + EARLY_AFTER + 1), "at most every 2 s")
        self.assertFalse(l.wants_early(LONG, t0 + EARLY_AFTER + EARLY_EVERY), "same text again")
        self.assertTrue(l.wants_early(longer, t0 + EARLY_AFTER + EARLY_EVERY))
        l.start(longer, False, t0 + EARLY_AFTER + EARLY_EVERY)
        self.assertFalse(l.wants_early(f"{longer} now", t0 + 60), "never after the sentence ended")

    def test_a_finished_request_cancels_older_ones_and_older_never_overwrite_newer(self):
        t0 = 100.0
        l = Line(t0)
        a, stop_a = l.start("first part of it", True, t0)
        b, stop_b = l.start("first part of it and more", True, t0)
        # b finishes first: a is cancelled and can no longer show.
        self.assertTrue(l.accept(b, 12, True))
        self.assertTrue(stop_a.is_set())
        self.assertFalse(stop_b.is_set())
        self.assertFalse(l.accept(a, 30, True))

    def test_the_final_translation_replaces_the_early_one_once_it_catches_up(self):
        t0 = 100.0
        l = Line(t0)
        e, stop_e = l.start("an early part of the sentence", True, t0)
        self.assertTrue(l.accept(e, 10, False))
        self.assertTrue(l.accept(e, 20, True))
        f, _ = l.start("an early part of the sentence, finished.", False, t0)
        self.assertTrue(stop_e.is_set(), "the final request cancels early ones")
        self.assertFalse(l.accept(f, 5, False), "keeps the fuller early text while the final one starts")
        self.assertTrue(l.accept(f, 21, False))
        self.assertTrue(l.accept(f, 22, False))
        self.assertFalse(l.accept(e, 25, True))
        self.assertTrue(l.done(f))

    def test_notes_instead_of_a_translation_are_not_shown_early(self):
        self.assertTrue(reads_as_subtitle("遷移到新叢集，然後在每個團隊都簽核之後"))
        self.assertTrue(reads_as_subtitle("把 Kubernetes 叢集升級"))
        self.assertFalse(reads_as_subtitle("to the new cluster and then retire the old build servers once every"))
        self.assertFalse(reads_as_subtitle("遷移到新的叢集\n\nWait, I must output only the translation."))
        self.assertFalse(reads_as_subtitle(""))
        # Other targets go by their own script (C14): English and Japanese early translations are shown.
        self.assertTrue(reads_as_subtitle("migrate to the new cluster and then", "en-US"))
        self.assertFalse(reads_as_subtitle("遷移到新叢集", "en-US"))
        self.assertTrue(reads_as_subtitle("新しいクラスタに移行して", "ja-JP"))

    def test_a_short_final_translation_still_lands_when_complete(self):
        t0 = 100.0
        l = Line(t0)
        e, _ = l.start("an early part of the sentence", True, t0)
        self.assertTrue(l.accept(e, 30, True))
        f, _ = l.start("done.", False, t0)
        self.assertFalse(l.accept(f, 3, False))
        self.assertTrue(l.accept(f, 3, True))


if __name__ == "__main__":
    unittest.main()
