"""What a person reads of an AI answer (ai_lego/platform/text/ai_words.py, applied by the AI gate after every action's shape):
half-width punctuation between Chinese characters becomes full-width, and no field name is shown. 2026-10-12 walk."""

from __future__ import annotations

import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.text.ai_words import FIELD_LABELS, fullwidth_punctuation, keys_shown, polish, without_field_keys


class FullWidthPunctuationTests(unittest.TestCase):
    def test_punctuation_after_chinese_becomes_full_width(self):
        self.assertEqual(fullwidth_punctuation("條件,並說明 事件卡:"), "條件，並說明 事件卡：")
        self.assertEqual(fullwidth_punctuation("你確定嗎?真的!"), "你確定嗎？真的！")
        self.assertEqual(fullwidth_punctuation("第一點;第二點"), "第一點；第二點")
        self.assertEqual(fullwidth_punctuation("合約(第三條)與(abc)"), "合約（第三條）與(abc)")
        self.assertEqual(fullwidth_punctuation("(中文)開頭"), "（中文）開頭")

    def test_numbers_latin_urls_and_quoted_words_stay_as_they_are(self):
        for text in ("共 3,000 元 10:30 開會", "Hello, world: yes (ok)", "f(x) 與 g(中)", "見 https://a.example.com/x,y:z 與連結"):
            self.assertEqual(fullwidth_punctuation(text), text, text)
        self.assertEqual(fullwidth_punctuation("他說「條件,好」,然後"), "他說「條件,好」，然後")
        self.assertEqual(fullwidth_punctuation("他說“a,b中文,c”,然後"), "他說“a,b中文,c”，然後")
        self.assertEqual(fullwidth_punctuation("網址:https://a.example.com/x,y"), "網址：https://a.example.com/x,y")   # the colon is the sentence's, the URL stays

    def test_a_string_without_chinese_is_returned_untouched(self):
        self.assertEqual(fullwidth_punctuation("Which one, and why?"), "Which one, and why?")

    def test_polish_walks_the_whole_answer_and_leaves_verbatim_keys_alone(self):
        answer = {"items": ["條件,並說明"], "sections": [{"title": "事實", "items": ["他說,好"]}], "quote": "原文,有逗號中文,不改", "n": 3, "flag": True}
        self.assertEqual(polish(answer), {"items": ["條件，並說明"], "sections": [{"title": "事實", "items": ["他說，好"]}], "quote": "原文,有逗號中文,不改", "n": 3, "flag": True})
        self.assertEqual(polish({"text": "訊息,原文", "note": "說明,一下"}, verbatim=("quote", "text")), {"text": "訊息,原文", "note": "說明，一下"})


class FieldKeyTests(unittest.TestCase):
    def test_a_known_key_is_replaced_by_the_label_the_person_sees(self):
        self.assertEqual(without_field_keys("「中」（intensity_now）是指什麼？"), f"「中」（{FIELD_LABELS['intensity_now']}）是指什麼？")
        self.assertEqual(without_field_keys("uncertainty 欄位寫得太少"), f"{FIELD_LABELS['uncertainty']} 欄位寫得太少")
        self.assertEqual(without_field_keys("「change_condition」還空著"), f"「{FIELD_LABELS['change_condition']}」還空著")
        self.assertEqual(without_field_keys("這一格（uncertainty）還空著"), f"這一格（{FIELD_LABELS['uncertainty']}）還空著")
        self.assertEqual(without_field_keys("看一下「conclusion」跟 next_step 格"), f"看一下「{FIELD_LABELS['conclusion']}」跟 {FIELD_LABELS['next_step']} 格")
        self.assertEqual(without_field_keys("寫得太少(uncertainty)"), f"寫得太少（{FIELD_LABELS['uncertainty']}）")

    def test_a_key_with_no_label_is_code_and_the_answer_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID.*map_claim"):
            without_field_keys("請補上 map_claim 這一格")   # a field of one of our document kinds
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID.*some_cell"):
            without_field_keys("請補上 some_cell 這一格", shown={"some_cell"})   # a key of the message the AI was given
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID"):
            polish({"items": ["Fill map_claim first"]})   # English prose too: a field name is never shown

    def test_a_plain_word_named_as_a_cell_is_a_key_whatever_the_word(self):
        """Codex 2026-10-12: SENSE shows `text` and `category`; 「text 欄位」 is as much a field name as 「intensity_now」."""
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID.*text"):
            without_field_keys("請補上 text 欄位")
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID.*zonename"):
            without_field_keys("zonename 欄還空著", shown={"zonename"})
        self.assertEqual(without_field_keys("把文字 text 寫清楚，text format 也要寫"), "把文字 text 寫清楚，text format 也要寫")   # the word in prose, not named as a cell

    def test_a_whole_string_that_is_a_key_is_replaced_and_a_word_of_ours_that_is_no_key_is_left_alone(self):
        self.assertEqual(polish({"gaps": ["uncertainty", "intensity_now"]}), {"gaps": [FIELD_LABELS["uncertainty"], FIELD_LABELS["intensity_now"]]})
        self.assertEqual(without_field_keys("檔名 report_final.pdf 要改，代號 weighted_sum 不動"), "檔名 report_final.pdf 要改，代號 weighted_sum 不動")
        self.assertEqual(without_field_keys("some_cell"), "some_cell")
        self.assertEqual(keys_shown('{"judgment_card": {"next_step": "x \\"fake_key\\": 1"}, "ok": 1}'), frozenset({"judgment_card", "next_step", "ok"}))   # an escaped quote inside a value is no key

    def test_prose_ids_urls_and_quotes_are_not_field_keys(self):
        for text in ("這個 interface 很難用，options 也太少", "The uncertainty is large and the options are few", "3f2a9c1e-0000-4000-8000-000000000000", "見 https://a.example.com/map_claim 的說明"):
            self.assertEqual(without_field_keys(text), text, text)
        self.assertEqual(polish({"quote": "他說 some_cell 是欄位"}), {"quote": "他說 some_cell 是欄位"})   # a source's own words stay

    def test_every_label_is_chinese_and_free_of_the_keys(self):
        for key, label in FIELD_LABELS.items():
            self.assertRegex(label, "[一-鿿]", key)
            self.assertNotIn(key, label)


if __name__ == "__main__":
    unittest.main()
