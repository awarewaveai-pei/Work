"""Ported from OwnVoice Meet src-tauri/src/idle.rs tests (Apache-2.0)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.idle import END, FORWARD, HOLD, PAUSE, PREROLL_CHUNKS, RESUME, Gate, minutes, minutes_label  # noqa: E402

M = 60.0


def chunk(v: int) -> bytes:
    return int(v).to_bytes(2, "little", signed=True) * 1600


class GateTests(unittest.TestCase):
    def test_forwards_while_people_talk_then_pauses_after_the_quiet_time(self):
        g = Gate(3 * M, 20 * M)
        self.assertEqual(g.on_chunk(chunk(5), 0.0002, M), (FORWARD, chunk(5)))
        self.assertEqual(g.on_chunk(chunk(5), 0.0002, 3 * M), (PAUSE, None))
        self.assertTrue(g.paused)
        self.assertEqual(g.on_chunk(chunk(5), 0.0002, 3 * M + 1), (HOLD, None), "nothing is sent while paused")

    def test_speech_wakes_it_with_the_last_two_seconds_first(self):
        g = Gate(3 * M, 20 * M)
        self.assertEqual(g.on_tick(4 * M), (PAUSE, None), "time alone pauses")
        for _ in range(30):
            self.assertEqual(g.on_chunk(chunk(10), 0.001, 4 * M), (HOLD, None), "room noise does not wake it")
        self.assertEqual(g.on_chunk(chunk(3000), 0.09, 4 * M), (HOLD, None))
        self.assertEqual(g.on_chunk(chunk(3000), 0.09, 4 * M), (HOLD, None))
        step, pre = g.on_chunk(chunk(3001), 0.09, 4 * M)
        self.assertEqual(step, RESUME)
        self.assertEqual(len(pre), PREROLL_CHUNKS, "2 s of audio go first")
        self.assertEqual(pre[-1], chunk(3001), "ending with the chunk that woke it")
        self.assertEqual(pre[-3], chunk(3000), "the start of the speech is in it")
        self.assertFalse(g.paused)
        self.assertEqual(g.on_chunk(chunk(7), 0.09, 4 * M), (FORWARD, chunk(7)), "no instant re-pause before the first caption")
        self.assertEqual(g.on_tick(6 * M), (HOLD, None), "a full pause time of grace after reconnecting")
        self.assertEqual(g.on_tick(7 * M), (PAUSE, None), "and paused again if still nothing was said")

    def test_a_caption_after_a_reconnect_brings_the_normal_pause_time_back(self):
        g = Gate(3 * M, 20 * M)
        g.on_chunk(chunk(5), 0.002, M)  # a quiet room
        g.on_tick(3 * M)
        for _ in range(3):
            g.on_chunk(chunk(3000), 0.2, 3 * M)
        self.assertFalse(g.paused)
        self.assertEqual(g.on_tick(5.0), (HOLD, None), "a caption arrived: quiet went back to zero")
        self.assertEqual(g.on_tick(3 * M), (PAUSE, None), "three quiet minutes after it, not six")

    def test_a_noisy_room_needs_speech_clearly_above_its_own_level(self):
        g = Gate(3 * M, None)
        for _ in range(50):
            g.on_chunk(chunk(1), 0.03, M)  # a loud hall, heard while listening normally
        g.on_tick(3 * M)
        for _ in range(50):
            self.assertEqual(g.on_chunk(chunk(1), 0.03, 3 * M), (HOLD, None), "the hall itself does not wake it")
        for _ in range(5):
            self.assertEqual(g.on_chunk(chunk(1), 0.05, 3 * M), (HOLD, None), "a little louder than the hall is not speech")
        self.assertTrue(any(g.on_chunk(chunk(1), 0.2, 3 * M)[0] == RESUME for _ in range(3)))

    def test_speech_in_the_first_paused_moment_still_wakes_it(self):
        g = Gate(3 * M, None)
        g.on_tick(3 * M)  # nothing was heard before: no idea of the room's level yet
        self.assertTrue(any(g.on_chunk(chunk(3000), 0.2, 3 * M)[0] == RESUME for _ in range(3)))

    def test_ends_after_the_end_time_paused_or_not(self):
        self.assertEqual(Gate(3 * M, 20 * M).on_tick(20 * M), (END, None))
        g = Gate(3 * M, 20 * M)
        g.on_tick(3 * M)
        self.assertEqual(g.on_chunk(chunk(1), 0.0, 20 * M), (END, None))

    def test_minutes_read_naturally(self):
        self.assertEqual(minutes_label(3.0), "3")
        self.assertEqual(minutes_label(0.1), "0.1")
        self.assertEqual(minutes_label(20.0), "20")

    def test_zero_minutes_means_never(self):
        self.assertIsNone(minutes(0.0))
        self.assertEqual(minutes(3.0), 3 * M)
        g = Gate(minutes(0.0), minutes(0.0))
        self.assertEqual(g.on_tick(10_000 * M), (HOLD, None))
        self.assertEqual(g.on_chunk(chunk(1), 0.0, 10_000 * M), (FORWARD, chunk(1)))


if __name__ == "__main__":
    unittest.main()
