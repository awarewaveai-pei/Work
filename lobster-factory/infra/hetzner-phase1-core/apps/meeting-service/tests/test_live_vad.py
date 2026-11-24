"""Port of the #[test]s in OwnVoice Meet vad.rs."""
import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.vad import DISCARD, END, START, Segmenter, VadEvent, wav  # noqa: E402

RATE = 16_000


def tone(ms):
    n = RATE * ms // 1000
    return np.array([int(math.sin(i * 0.3) * 8000) for i in range(n)], dtype=np.int16)


def silence(ms):
    return np.zeros(RATE * ms // 1000, dtype=np.int16)


def run(seg, audio):
    events = []
    for i in range(0, len(audio), 1600):
        events.extend(seg.push(audio[i:i + 1600]))
    return events


class VadTests(unittest.TestCase):
    def test_one_sentence_gives_start_audio_end_with_preroll(self):
        seg = Segmenter(RATE)
        audio = np.concatenate([silence(600), tone(1500), silence(900)])
        ev = run(seg, audio)
        self.assertEqual(ev[0].kind, START)
        ends = [len(e.audio) for e in ev if e.kind == END]
        self.assertEqual(len(ends), 1, f"exactly one utterance: {ev}")
        # 300 ms preroll + 1500 ms speech + 700 ms closing silence, to the frame
        expect = RATE * 2500 // 1000
        self.assertLessEqual(abs(ends[0] - expect), 480, f"utterance length {ends[0]} vs {expect}")
        self.assertFalse(seg.in_speech())

    def test_a_click_is_discarded(self):
        seg = Segmenter(RATE)
        audio = np.concatenate([tone(120), silence(900)])
        ev = run(seg, audio)
        self.assertIn(VadEvent(DISCARD), ev)
        self.assertFalse(any(e.kind == END for e in ev))

    def test_long_speech_is_cut_at_twelve_seconds(self):
        seg = Segmenter(RATE)
        ev = run(seg, tone(13_000))
        self.assertEqual(sum(1 for e in ev if e.kind == END), 1)

    def test_wav_header_is_well_formed(self):
        w = wav([0, 1, -1], RATE)
        self.assertEqual(w[0:4], b"RIFF")
        self.assertEqual(len(w), 44 + 6)
        self.assertEqual(int.from_bytes(w[24:28], "little"), RATE)


if __name__ == "__main__":
    unittest.main()
