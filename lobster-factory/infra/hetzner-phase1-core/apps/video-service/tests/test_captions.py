import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import captions  # noqa: E402


class Captions(unittest.TestCase):
    def test_assemble_offsets_scenes_and_intro_and_stays_ordered(self):
        a = [{"startMs": 100, "endMs": 1500, "text": "one"}, {"startMs": 1500, "endMs": 2600, "text": "two"}]
        b = [{"startMs": 0, "endMs": 900, "text": "three"}]
        cues = captions.assemble([a, b], [2.5, 1.0], intro_s=3.0)
        self.assertEqual([c["text"] for c in cues], ["one", "two", "three"])
        self.assertEqual(cues[0]["startMs"], 3100)           # intro 3s + 100ms
        self.assertEqual(cues[2]["startMs"], 3000 + 3000)    # scene 1 lasts 2.5 + 0.5 s
        self.assertTrue(all(x["endMs"] <= y["startMs"] for x, y in zip(cues, cues[1:])))

    def test_cues_never_run_past_their_scene(self):
        cues = captions.assemble([[{"startMs": 0, "endMs": 99_000, "text": "long"}]], [1.0])
        self.assertEqual(cues[0]["endMs"], 1500)

    def test_proportional_cues_cover_the_duration(self):
        cues = captions.proportional_cues(["ab", "cdef"], 3000)
        self.assertEqual([(c["startMs"], c["endMs"]) for c in cues], [(0, 1000), (1000, 3000)])

    def test_srt_and_vtt(self):
        cue = [{"startMs": 3_723_004, "endMs": 3_725_000, "text": "hi"}]
        self.assertEqual(captions.to_srt(cue), "1\n01:02:03,004 --> 01:02:05,000\nhi\n\n")
        self.assertTrue(captions.to_vtt(cue).startswith("WEBVTT\n\n01:02:03.004 --> 01:02:05.000"))


if __name__ == "__main__":
    unittest.main()
