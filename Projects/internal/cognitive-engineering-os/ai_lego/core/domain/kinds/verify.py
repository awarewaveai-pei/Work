"""VERIFY 查證主張 (contract card): a message is split into claims (the AI proposes, the person confirms); each checkable
fact gets a ledger line -- how many independent origins support or oppose it -- and the person's own 採信／存疑／不採信.
The platform never rules true or false. The first four kinds are shared (docs/platform/STEP2_SHARED_RULES.md §3; read
through ``ai_lego.platform.evidence.checked_claims``); VERIFY adds its own kinds below them."""

from __future__ import annotations

import unicodedata
from typing import Any, Mapping

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.evidence_words import SENTENCE_KINDS, STANCES, STATES, VERDICTS, normalise_quote

CLAIM_FROM = ("訊息", "MAP", "我加的")
MESSAGE_FORMS = ("訊息", "截圖文字", "連結")   # 你貼上訊息、截圖或連結
# 系統找出它要你做什麼
ASKS = ("轉傳", "捐款", "不投票", "敵視某一群人", "不信任身邊的人")
# How a message spread and what it is made of: the platform has no tool for any of it in step 2 (STEP2_SHARED_RULES §11),
# so each is 無法檢查 with why -- (key, the question, why). The person may write what they saw (verify.seen), never counted.
SPREAD = (
    ("spread", "這則訊息怎麼傳開", "平台沒有接社群平台的資料"),
    ("coordinated", "是不是很多帳號在很短時間內一起貼", "平台沒有接社群平台的資料"),
    ("earliest", "最早從哪裡出來", "平台沒有接社群平台的資料，追不到訊息在哪裡傳過"),
    ("media_origin", "圖片和影片最早出現在哪裡", "平台還沒有拿圖去搜尋的工具"),
    ("credentials", "檔案裡有沒有內容來源憑證", "平台還沒有讀內容來源憑證的工具"),
    ("ai_made", "是不是 AI 生成的", "沒有工具給得出依據，無法判定"),
)
SPREAD_KEYS = tuple(key for key, *_ in SPREAD)
# 「去查」: the claim angles of the collector wire v2 (STEP2_SHARED_RULES §4.1) in the checker's order -- who said it
# first (原始文件), then how others report it, a fact-check, the earliest copy, and the opposite claim.
FACTCHECK_ANGLE = "factcheck"
SEARCH_ANGLES = ("primary", "news", FACTCHECK_ANGLE, "origin", "opposite")
# the channels one 「去查」 run plans (wire v2: engine x language); 查不到 needs every one of them to answer
SEARCH_PROVIDERS = {"serper": "Serper", "brave": "Brave"}
SEARCH_LANGUAGES = {"zh": "中文", "en": "英文"}

KINDS = [
    # one claim the person confirmed (你確認了才算)
    DocKind("verify.claim", "VERIFY", "主張", {
        "text": Field("text", 2000, required=True, human_only=True),
        "sentence": Field("choice", choices=SENTENCE_KINDS, required=True, human_only=True, labels=SENTENCE_KINDS),
        "law": Field("bool", human_only=True),                    # 講法律的句子另外標「法律」
        "jurisdiction": Field("text", 300, human_only=True),     # 法域
        "limitation": Field("text", 300, human_only=True),       # 時效
        "law_source": Field("text", 1000, human_only=True),      # 來源
        "alternative": Field("text", 2000, human_only=True),     # 對事實的解釋：你至少寫一個別的解釋
        "from": Field("choice", choices=CLAIM_FROM, required=True, labels=CLAIM_FROM),
        "map_claim": Field("text", 64, scan=False),              # the MAP claim it came from
        # added by VERIFY (乙): the message it was split from (its first reaction gates it), the AI proposal it
        # confirms ("<verify.split doc id>#<index>"), and why you changed a saved claim (你改的時候，要留下理由)
        "message": Field("text", 64, scan=False),
        "proposal": Field("text", 80, scan=False),
        "reason": Field("text", 1000, human_only=True),
    }),
    # what one source card says about one claim version, as the person reads it (or confirms the AI's reading): only
    # this counts in the ledger. Read from one snapshot of the page; an older claim version or snapshot is shown, not counted.
    DocKind("verify.stance", "VERIFY", "來源怎麼說", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),
        "card": Field("text", 64, required=True, scan=False),
        "snapshot": Field("text", 64, required=True, scan=False),   # the card's snapshot sha256 it was read from
        "stance": Field("choice", choices=STANCES, required=True, human_only=True, labels=STANCES),
        "quote": Field("text", 2000, scan=False),               # the source's words, not the person's
        "reading": Field("text", 64, scan=False),                # the AI reading it confirms (verify.reading doc id), if any
        "reason": Field("text", 1000, human_only=True),          # 你改 AI 的讀法時，要留下理由
    }),
    # the AI's reading of sources for claims: what each card says, with the exact quote the gate checked; never counted
    # until the person confirms it into verify.stance (AI 不准宣判真假)
    DocKind("verify.reading", "VERIFY", "AI 讀來源", {
        "readings": Field("json", 60000, required=True, scan=False, cited=True, shape="array"),  # [{"claim", "claim_version", "card", "snapshot", "reads_as": STANCES, "quote", "citations"}]
    }, authors=frozenset({"ai"})),
    # the background search for one claim ended: 查到 / 查不到 / 無法檢查 (private group, no tool)
    DocKind("verify.search", "VERIFY", "背後找來源", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),
        "state": Field("choice", choices=STATES, required=True, scan=False),
        "why": Field("text", 300, scan=False),
        "run": Field("text", 64, scan=False),
        "rules": Field("json", 2000, scan=False, shape="object"),
    }, authors=frozenset({"system"}), deletable=False),
    # 你對每個主張標採信、存疑或不採信，並寫一句理由
    DocKind("verify.verdict", "VERIFY", "你的判定", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),     # the claim as you judged it; a changed claim shows the verdict as earlier
        "verdict": Field("choice", choices=VERDICTS, required=True, human_only=True, labels=VERDICTS),
        "reason": Field("text", 1000, required=True, human_only=True),
    }),

    # ---- VERIFY's own kinds (乙) ----
    # the message as it was when pasted (系統替訊息原文存一份當時的樣子): never a source (it would support itself, rules §4),
    # never edited; sha256 is the server's stamp of exactly this text
    DocKind("verify.message", "VERIFY", "要查的訊息", {
        "text": Field("text", 20000, required=True, human_only=True),
        "form": Field("choice", choices=MESSAGE_FORMS, required=True, labels=MESSAGE_FORMS),
        "url": Field("text", 2048, scan=False),
        "sha256": Field("text", 64, required=True, scan=False),
    }, deletable=False, others_words="text"),
    # 先停一下，寫下第一反應和信心: until it exists nothing about the message is shown or asked of the AI
    DocKind("verify.first", "VERIFY", "你的第一反應", {
        "message": Field("text", 64, required=True, scan=False),
        "reaction": Field("text", 1000, required=True, human_only=True),
        "confidence": Field("int", 100, required=True, human_only=True),
    }, deletable=False),
    # the AI's proposed split of a message (AI 先提出怎麼拆成主張，你確認了才算: each confirmed one becomes a verify.claim)
    DocKind("verify.split", "VERIFY", "AI 提的拆法", {
        "message": Field("text", 64, required=True, scan=False),
        "claims": Field("json", 20000, required=True, shape="array"),  # [{"text", "sentence": SENTENCE_KINDS, "law": bool}]
    }, authors=frozenset({"ai"})),
    # the manipulation patterns the AI named, each with the exact part of the message (找到手法，不等於訊息是假的)
    DocKind("verify.techniques", "VERIFY", "AI 指出的手法", {
        "message": Field("text", 64, required=True, scan=False),
        "techniques": Field("json", 20000, shape="array"),  # [{"name": a verify.techniques item, "quote": words of the message, "why"}]
        "asks": Field("json", 8000, shape="array"),         # [{"what": ASKS, "quote"}]: what it wants you to do
        "rules": Field("json", 2000, scan=False, shape="object"),  # the ruleset stamp it was named with
    }, authors=frozenset({"ai"})),
    # what the platform could not check about how the message spread (SPREAD), written when you wrote your first reaction
    DocKind("verify.spread", "VERIFY", "訊息怎麼傳開", {
        "message": Field("text", 64, required=True, scan=False),
        "cells": Field("json", 4000, required=True, scan=False, shape="object"),  # {SPREAD_KEYS: evidence_words.cell(...)}
    }, authors=frozenset({"system"}), deletable=False),
    # what you saw yourself about how it spread: your own words, never counted as a source
    DocKind("verify.seen", "VERIFY", "你自己看到的", {
        "message": Field("text", 64, required=True, scan=False),
        "about": Field("choice", choices=SPREAD_KEYS, required=True, labels=SPREAD_KEYS),
        "text": Field("text", 2000, required=True, human_only=True),
    }),
    # 「去查」 for one claim version: the collection run started for it (one run per claim), so the run's end can say
    # 查到／查不到／無法檢查 for that claim (verify.search)
    DocKind("verify.lookup", "VERIFY", "去查", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),
        "run": Field("text", 64, required=True, scan=False),
        "angles": Field("list", 7, scan=False),
        "languages": Field("list", 2, scan=False),   # what the run searched in (collection_run.query_language); absent = every SEARCH_LANGUAGES
    }, authors=frozenset({"system"}), deletable=False),
    # 系統查別人是不是已經查過這一則: each fact-check database of the place's list, what it said; every hit is a source
    # (GATHER cards it) -- 誰判的、依據什麼, never the platform's verdict
    DocKind("verify.factcheck", "VERIFY", "查核資料庫", {
        "message": Field("text", 64, scan=False),
        "claim": Field("text", 64, scan=False),
        "claim_version": Field("int", 100000),
        "place": Field("text", 200, scan=False),                # the place whose list was used; absent = none matched (elsewhere)
        "dbs": Field("json", 30000, required=True, scan=False, shape="array"),  # [{"db", "state", "why"?, "hits": [{"source_id", "publisher", "judged_as", "date", "url"}]}]
        "rules": Field("json", 2000, scan=False, shape="object"),
    }, authors=frozenset({"system"}), deletable=False),
    # AI 用白話摘要主張帳本 (the ledger itself is the system's: evidence.checked_claims)
    DocKind("verify.summary", "VERIFY", "AI 白話摘要帳本", {
        "lines": Field("json", 20000, required=True, shape="array"),  # [{"claim", "claim_version", "line"}]
        "overview": Field("text", 1000),
    }, authors=frozenset({"ai"})),
    # AI 提出還該查什麼
    DocKind("verify.next", "VERIFY", "還該查什麼", {
        "items": Field("list", 6, required=True),
        "question": Field("text", 300),
    }, authors=frozenset({"ai"})),
]

# 有組織的假訊息怎麼認，檢查題 (the card's words; the page shows them, the person may skip them: 你可以只看結果，跳過練習)
CHECK_QUESTIONS = (
    "量是自然的嗎？同一句話、同一張圖，是不是很多帳號在很短時間內一起貼？",
    "這些帳號多久前建立的？平常貼什麼？是不是先貼輕鬆內容、後來才轉政治？",
    "帳號像不像真人：有沒有生活動態、有沒有跟人互動、自稱的身分和貼的內容合不合？",
    "帳號舊、是真人的，不等於可信：真人帳號會被盜用。",
    "兩邊吵得很兇的留言，會不會是同一批帳號扮兩邊？目的是讓真人互相攻擊。",
    "聲音和影片可以用 AI 合成；口音像本地人，不代表是本地人。",
    "最早從哪裡出來？那個「新聞網站」查得到是誰辦的嗎？",
    "它是全假、半真半假、斷章取義，還是真的但被放大？四種要分開。",
    "它要我對誰生氣？要我做什麼：轉傳、不投票、放棄、不信任身邊的人？",
    "很多人這樣說，不等於是真的；留言區、熱門、搜尋排名都可以用量灌出來。",
)
LAW_UNCONFIRMED = "未確認"   # a 法律 claim without its 法域、時效、來源: 不能當成確定的結論
LAW_UNCONFIRMED_LINE = "法律的說法還沒寫法域、時效、來源，不能當成確定的結論"   # the summary's line for it, whatever the AI wrote


def law_unconfirmed(claim: Mapping[str, Any]) -> bool:
    return bool(claim.get("law")) and not all(isinstance(claim.get(key), str) and claim[key].strip() for key in ("jurisdiction", "limitation", "law_source"))


def claim_key(text: Any) -> str:
    """The same claim written again (「你查過」): width, case, spaces and punctuation do not make it another claim."""
    folded = normalise_quote(text).casefold() if isinstance(text, str) else ""
    return "".join(char for char in folded if not unicodedata.category(char).startswith(("P", "Z", "S")))


def weak_line(support: int, oppose: int) -> str:
    """What may be said of a claim with fewer than two independent origins (AI 說得多肯定，不能超過最弱的那一環)."""
    if support and oppose:
        return "只有一個出處說到它，裡面兩種說法都有"
    if support:
        return "只有一個出處這樣說"
    if oppose:
        return "只有一個出處說不是這樣"
    return "還沒有獨立出處說到它"
