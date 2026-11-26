"""lib/live/langs.py：語言表查詢與文字系統判斷。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live import langs  # noqa: E402


class LangTable(unittest.TestCase):
    def test_lookups(self):
        self.assertEqual([l.code for l in langs.LANGS], ["auto", "zh-TW", "en-US", "ja-JP", "ko-KR"])
        self.assertEqual(langs.find("ja-JP").whisper, "ja")
        self.assertIsNone(langs.find("fr-FR"))
        self.assertEqual(langs.from_whisper("ko").code, "ko-KR")
        self.assertIsNone(langs.from_whisper(""), "auto's empty whisper code is not a detected language")
        self.assertEqual([l.code for l in langs.LANGS if l.to_taiwan], ["zh-TW"], "only Chinese is converted to Traditional")

    def test_script_of(self):
        self.assertEqual(langs.script_of("今天開會"), langs.HAN)
        self.assertEqual(langs.script_of("会議を始めます"), langs.KANA, "Japanese mixes kanji and kana")
        self.assertEqual(langs.script_of("회의를 시작합니다"), langs.HANGUL)
        self.assertEqual(langs.script_of("Let's start."), langs.LATIN)
        self.assertEqual(langs.script_of("我們用 Gemini Live"), langs.HAN, "Latin only when nothing else is there")
        self.assertEqual(langs.script_of("123 ..."), "")


if __name__ == "__main__":
    unittest.main()
