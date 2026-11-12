import pathlib
import sys
import unittest

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import server  # noqa: E402


class TtsRequestTests(unittest.TestCase):
    """POST /tts checks the request before any Edge call (video-workbench backend/speech.cjs edge-tts)."""

    def test_accepts_text_and_an_edge_voice(self):
        self.assertEqual(server.tts_request({"text": " 你好 ", "voice": "zh-TW-YunJheNeural"}), ("你好", "zh-TW-YunJheNeural"))

    def test_refuses_empty_long_or_odd_voice(self):
        for payload in ({"text": "", "voice": "zh-TW-HsiaoChenNeural"}, {"text": "x" * 2001, "voice": "zh-TW-HsiaoChenNeural"}, {"text": "hi", "voice": "../etc"}):
            with self.assertRaises(ValueError):
                server.tts_request(payload)


if __name__ == "__main__":
    unittest.main()
