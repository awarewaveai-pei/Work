"""Two things the system reads in what the person wrote (2026-10-11 walk): SENSE's hearsay check proposes VERIFY for reported
speech in any form (「還說『同業都這樣改』」 proposed nothing), and a guardrail notice names the fields its word was in (the
intake said 「你寫的風險碰到：法律」 with the risk box empty: 合約 was in the question)."""

from __future__ import annotations

import unittest

from ai_lego.data.events import record_log
from ai_lego.platform.block_hooks import after_save
from ai_lego.platform.block_hooks.sense import hearsay

REPORTED = {
    "還說": "上週他第三次改合約條件，還說『同業都這樣改』",
    "他說": "他說同業都這樣",
    "他跟我說「…」": "他跟我說「合約本來就要改」",
    "X說「…」": "小陳說「這個不用簽」",
    "老闆說：「…」": "老闆說：「下個月一定加薪」",
    "對方表示": "對方表示這是業界慣例",
    "竟然說": "他們竟然說合約不用改",
    "據說": "據說下個月要漲價",
    "有人說": "有人說這家公司快倒了",
    "聽說": "聽說要漲價",
    "網路上寫": "網路上寫這個方案很有效",
}
OWN_WORDS = "老實說我不想再繼續合作了，我跟他說我需要時間想想，我跟同事說「下週再談」，也說不定會再談。"


class HearsayTests(unittest.TestCase):
    def test_every_form_of_reported_speech_is_caught(self):
        for form, text in REPORTED.items():
            with self.subTest(form=form):
                self.assertTrue(hearsay(text), text)

    def test_the_persons_own_words_and_turns_of_phrase_are_not(self):
        self.assertFalse(hearsay(OWN_WORDS))


class _Docs:
    """Keeps the guardrails it is given; nothing else of a case."""

    def __init__(self) -> None:
        self.saved: list[tuple[str, dict]] = []

    def current(self, tenant_id, owner, kind):
        return [{"content": content} for saved_kind, content in self.saved if saved_kind == kind]

    def save(self, tenant_id, owner, kind, content, writer, **kwargs):
        self.saved.append((kind, content))
        return {"kind": kind, "content": content}


class GuardrailFoundInTests(unittest.TestCase):
    def test_a_notice_names_the_fields_its_word_was_in(self):
        intake = {"kind": "assembler.intake", "block": "ASSEMBLER", "author": "user",
                  "content": {"purpose": "複雜決策", "package": "個人複雜決策", "question": "合夥人第三次改合約條件，要不要繼續？", "risk": "可能會少一筆錢"}}
        notices = [notice for notice in after_save(_Docs(), "t", record_log.case("c"), intake) if notice["type"] == "guardrail"]
        self.assertEqual({notice["category"]: notice["found_in"] for notice in notices}, {"法律": ["question"], "金錢": ["risk"]})


if __name__ == "__main__":
    unittest.main()
