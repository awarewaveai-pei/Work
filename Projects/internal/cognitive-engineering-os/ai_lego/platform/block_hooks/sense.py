"""SENSE (系統做什麼): a card that carries someone else's claim (「聽說」「他說」「網路上寫」) -> SENSE proposes VERIFY.

Reported speech in general, not a list of exact phrases (2026-10-11: 「還說『同業都這樣改』」 proposed nothing): a hearsay
word (聽說、據說、有人說…), a written source (網路上寫、報導…), someone other than the person saying it (他說、他跟我說、對方
表示…), a saying verb after 還／又／也／竟然 (還說…), or any saying verb right before a quote mark (說「…」) -- looked for after the
person's own speech is taken out (我說、我跟同事說「…」、我們說好了: OWN_SPEECH). Turns of phrase are not speech: 老實說、說不定
(tests/unit/test_sense_hearsay.py)."""

from __future__ import annotations

import re
from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks import propose

_SAY = r"(?:(?:說|講)(?!不定|不出|好了|好的|明|法|服|實話|真的|穿)|表示|聲稱|宣稱|提到|指出|強調|寫)"
_OTHERS = r"他們|她們|他|她|對方|人家|別人|大家|有人|網友|專家|官方|老闆|主管|上司|同事|朋友|客戶|廠商|合夥人|公司|律師|醫生|老師"
_TO_ME = r"(?:跟我|對我|和我|告訴我)?"
# The person's own speech: 我／我們 (not 跟我: that is someone speaking to them), an adverb, an addressee of up to six characters.
OWN_SPEECH = re.compile(r"(?<![跟對和向給叫])我們?(?:還|也|又|就|都|一直)?(?:[跟對和向給][^，。！？；、\s「『“\"]{1,6}?)?(?:說|講)")
HEARSAY = re.compile("|".join((
    r"聽說|據說|據傳|據報|傳言|謠言|謠傳|流傳|轉傳|號稱|聲稱|宣稱|有人說|大家都說",
    r"網路上|網上|新聞(?:說|報|寫)|報導|報紙寫|群組裡|貼文寫|文章寫",
    rf"(?<![跟對和向給叫其吉])(?:{_OTHERS}){_TO_ME}{_SAY}",     # 他說 / 他跟我說 / 對方表示 -- not 其他說法
    rf"(?:還|又|也|竟然|居然|甚至|一直){_TO_ME}{_SAY}",            # 還說
    rf"{_SAY}[：:，,]?\s*[「『“\"]",                              # 說「…」 -- someone's words quoted
)))


def hearsay(text: str) -> bool:
    """Whether the text carries someone else's claim (the module note)."""
    return HEARSAY.search(OWN_SPEECH.sub("", text)) is not None


WHY_VERIFY = "你的卡片裡有別人的說法（聽說、他說、網路上寫的）。要不要查一下是誰說的、別的地方怎麼報？"


def _card_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    found = hearsay(content.get("text", "")) or content.get("category") == "別人的聲音"
    if not found:
        return []
    return propose(docs, tenant_id, owner, "SENSE", "VERIFY", WHY_VERIFY, source=doc["doc_id"])


AFTER_SAVE = {"sense.card": _card_saved}
