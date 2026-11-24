"""Port of the #[test]s in OwnVoice Meet llm.rs, plus the Anthropic event shapes. No network."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.translate import anthropic_event, error_message, openai_event  # noqa: E402
from lib.live.usage import Tally  # noqa: E402


class TranslateTests(unittest.TestCase):
    def test_parses_openai_stream_usage_with_cache(self):
        u = Tally()
        text = []
        openai_event({"choices": [{"delta": {"content": "你好"}}]}, u, text.append)
        openai_event(
            {"choices": [], "usage": {"prompt_tokens": 1200, "completion_tokens": 30, "prompt_tokens_details": {"cached_tokens": 1000}}},
            u,
            lambda _: None,
        )
        self.assertEqual("".join(text), "你好")
        self.assertEqual((u.input, u.cached, u.output), (200, 1000, 30))

    def test_parses_anthropic_stream_text_and_usage(self):
        u = Tally()
        text = []
        anthropic_event({"type": "message_start", "message": {"usage": {"input_tokens": 200, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 50, "output_tokens": 1}}}, u, text.append)
        anthropic_event({"type": "content_block_delta", "delta": {"type": "text_delta", "text": "你好"}}, u, text.append)
        anthropic_event({"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 30}}, u, text.append)
        self.assertEqual("".join(text), "你好")
        self.assertEqual((u.input, u.cached, u.cache_write, u.output), (200, 1000, 50, 30))

    def test_reads_error_bodies_from_each_provider(self):
        self.assertEqual(error_message('{"error":{"message":"bad key"}}'), "bad key")
        self.assertEqual(error_message('[{"error":{"message":"API key not valid"}}]'), "API key not valid")
        self.assertEqual(error_message("plain"), "plain")


if __name__ == "__main__":
    unittest.main()
