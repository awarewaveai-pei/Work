"""問 AI 的提示詞：搜尋結果要編號附上，沒有結果要明說（模型才不會用記憶補）。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import lookup  # noqa: E402


class AskUserTests(unittest.TestCase):
    def test_results_are_numbered_and_context_comes_first(self):
        results = [{"title": "T1", "snippet": "S1", "link": "https://a.example/1"},
                   {"title": "T2", "snippet": "S2", "link": "https://b.example/2"}]
        user = lookup.ask_user("  Smart App Control ", "We will migrate in March.", results)
        self.assertLess(user.index("We will migrate in March."), user.index("Smart App Control"))
        self.assertIn("[1] T1\nS1\nhttps://a.example/1", user)
        self.assertIn("[2] T2\nS2\nhttps://b.example/2", user)

    def test_no_results_is_said_out_loud(self):
        user = lookup.ask_user("OwnVoice Meet", "", [])
        self.assertIn("這次沒有搜尋結果", user)
        self.assertNotIn("逐字稿", user)


if __name__ == "__main__":
    unittest.main()
