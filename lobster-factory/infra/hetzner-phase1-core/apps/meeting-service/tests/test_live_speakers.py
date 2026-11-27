"""C18 即時分講者：分群邏輯（假向量）、刪掉的聲音不再比對、聲音檔不在 repo 裡。"""
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live import speakers  # noqa: E402

rng = np.random.default_rng(0)
A, B = rng.normal(size=256), rng.normal(size=256)


def near(v):
    """A sentence of that voice: its direction plus a little noise (cosine with it about 0.9)."""
    return v + rng.normal(scale=0.3, size=256) * np.linalg.norm(v) / 16


class Grouping(unittest.TestCase):
    def test_two_voices_stay_apart_and_a_short_line_takes_the_one_before(self):
        c = speakers.Clusters()
        names = [c.add(1, near(A), 3.0), c.add(2, near(B), 2.5), c.add(3, near(A), 4.0), c.add(4, None, 0.6)]
        self.assertEqual(names, [("講者 1", False), ("講者 2", False), ("講者 1", False), ("講者 1", True)])

    def test_a_name_the_user_gave_survives_the_regroup_at_stop(self):
        c = speakers.Clusters()
        for i, v in enumerate([A, B, A, B, B]):
            c.add(i, near(v), 3.0)
        self.assertTrue(c.rename("講者 2", "王經理"))
        labels = c.regroup()
        self.assertEqual([labels[i][0] for i in range(5)], ["講者 1", "王經理", "講者 1", "王經理", "王經理"],
                         "B spoke longest but keeps the name it was given; A is numbered")


class SavedVoices(unittest.TestCase):
    def test_a_deleted_voice_is_never_matched_again(self):
        with tempfile.TemporaryDirectory() as d:
            voices = speakers.Voices(os.path.join(d, "voices.json"))
            saved = voices.save("林經理", A)
            c = speakers.Clusters(voices.load())
            self.assertEqual(c.add(1, near(A), 3.0)[0], "林經理", "a saved voice is recognised")
            speakers.delete_voice(voices, c, saved["id"])
            self.assertEqual(voices.load(), [], "gone from the file")
            fresh = speakers.Clusters(voices.load())
            self.assertNotEqual(fresh.add(1, near(A), 3.0)[0], "林經理")
            c.speakers.clear()
            c.lines.clear()
            self.assertNotEqual(c.add(2, near(A), 3.0)[0], "林經理", "gone from this listening's matching too")

    def test_the_voices_file_is_never_inside_the_repository(self):
        repo = speakers.HERE
        path = os.path.normcase(os.path.abspath(speakers.voices_path()))
        self.assertFalse(path.startswith(os.path.normcase(repo) + os.sep), path)
        with self.assertRaises(ValueError):
            speakers.Voices(os.path.join(repo, "voices.json"))


if __name__ == "__main__":
    unittest.main()
