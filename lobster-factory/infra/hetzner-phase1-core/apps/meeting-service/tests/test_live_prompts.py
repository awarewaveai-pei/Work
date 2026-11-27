"""Port of the #[test]s in OwnVoice Meet prompts.rs."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.prompts import listen_system, listen_user, parse_glossary, reply_system, reply_user, summary_system, system_blocks  # noqa: E402


# The prompts as they were checked in a live meeting (before C14); for zh-TW / en-US they must not change.
LISTEN_SYSTEM = "You are a live interpreter in an online meeting. Translate the latest utterance into natural Traditional Chinese as used in Taiwan.\nThe utterance comes from speech recognition: it may contain recognition errors or be a sentence fragment. Translate the most plausible meaning and keep a fragment as a fragment; do not complete it or add anything.\nWhen a word looks misrecognized, silently use the most plausible reading; keep an unknown name as heard. Never comment on the recognition or on your translation.\nYour entire output is shown as a subtitle: output only the Chinese translation, with no quotes, labels or notes."
REPLY_SYSTEM = "You help a Taiwanese participant speak in an English-language meeting. They type what they want to say in Chinese (it may be casual, incomplete, or mixed with English). Write the English they will read aloud word for word.\n- Spoken style: short sentences of at most about 15 words, plain words that are easy to pronounce, natural meeting register.\n- Keep their meaning, stance and tone. Do not add points, greetings, or filler they did not imply.\n- Use the conversation context to pick the right terms and refer to what others said.\n- If their prepared script is provided and what they type matches a point in it, reuse the script's English wording and terms.\nOutput only the English script, with no quotes, labels or notes."
SUMMARY_SYSTEM = "You keep a running summary of a meeting or talk for a Taiwanese participant who follows it in English.\nYou get the summary so far (it may be empty) and the newest stretch of the transcript, which comes from speech recognition and may contain recognition errors.\nReturn the whole summary brought up to date, in Traditional Chinese as used in Taiwan (繁體中文): at most 8 short bullet points, each starting with \"- \", about what was actually said: main points, decisions, numbers and dates, open questions, and who said what when speakers are named.\nKeep names and technical terms as they are; merge new points into the existing ones rather than repeating them; drop small talk. Do not invent anything, do not give advice and do not suggest what the participant should say.\nOutput only the bullet points."


class PromptsTests(unittest.TestCase):
    def test_an_unfinished_utterance_is_marked_as_such(self):
        self.assertIn("stops mid-sentence", listen_user([], "so the plan is", True))
        self.assertNotIn("mid-sentence", listen_user([], "So the plan is set.", False))

    def test_glossary_skips_comments_and_blanks(self):
        g = parse_glossary("# terms\n季度營收 = quarterly revenue\n\nbad line\n = x\n")
        self.assertEqual(g, [("季度營收", "quarterly revenue")])

    def test_script_is_a_separate_cached_block_only_when_present(self):
        self.assertEqual(len(system_blocks("I", [], "  ")), 1)
        b = system_blocks("I", [], "# Pitch")
        self.assertEqual(len(b), 2)
        self.assertEqual(b[1]["cache_control"]["type"], "ephemeral")

    def test_chinese_target_prompts_are_word_for_word_today_s(self):
        self.assertEqual(listen_system("zh-TW"), LISTEN_SYSTEM)
        self.assertEqual(reply_system("zh-TW", "en-US"), REPLY_SYSTEM)
        self.assertEqual(summary_system("zh-TW", "en-US"), SUMMARY_SYSTEM)
        self.assertEqual(listen_user(["Them: hi"], "So.", False, "zh-TW"), "Recent conversation, for context only (do not translate):\nThem: hi\n\nTranslate this utterance into Traditional Chinese as used in Taiwan (繁體中文):\nSo.")
        self.assertEqual(listen_user([], "so the", True, "zh-TW"), "Recent conversation, for context only (do not translate):\n(none)\n\nThe speaker is still talking: this utterance stops mid-sentence. Translate only what is there, as a fragment, into Traditional Chinese as used in Taiwan (繁體中文), and output only that:\nso the")
        self.assertEqual(reply_user([], "我想說", "zh-TW"), "Recent conversation (speech-recognized, may have errors):\n(none)\n\nWhat I want to say (Chinese):\n我想說")


if __name__ == "__main__":
    unittest.main()
