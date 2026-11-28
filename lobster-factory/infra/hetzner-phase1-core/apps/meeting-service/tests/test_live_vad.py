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


    def test_quiet_speech_in_a_quiet_room_is_found(self):
        # 2026-11-29, the operator's phone recording: speech about 0.004 RMS over a 0.002 background, under the
        # fixed 0.008. Two such sentences after a few seconds of background must each become an utterance.
        rng = np.random.default_rng(1)

        def noise(ms, rms):
            return (rng.normal(0, rms * 32768, RATE * ms // 1000)).astype(np.int16)

        audio = np.concatenate([noise(3000, 0.002), noise(1500, 0.0045), noise(1500, 0.002),
                                noise(1500, 0.0045), noise(1500, 0.002)])
        ends = [e for e in run(Segmenter(RATE), audio) if e.kind == END]
        self.assertEqual(len(ends), 2)
        self.assertAlmostEqual(ends[0].start / RATE, 3.0, delta=0.3)

    def test_a_steady_hum_is_not_taken_for_speech(self):
        # Codex 2026-11-29: 30 s of steady 0.004 background became two 12 s utterances for the recogniser.
        rng = np.random.default_rng(2)
        hum = rng.normal(0, 0.004 * 32768, RATE * 30).astype(np.int16)
        self.assertEqual([e for e in run(Segmenter(RATE), hum) if e.kind == END], [])

if __name__ == "__main__":
    unittest.main()
