"""GATHER 蒐集來源 (contract card): the system finds sources and writes down only what it can find about each (誰辦的、何時
出現、從哪個管道); the person marks each independent origin 採用／存疑／不用 with a reason. The system never scores a
source. The first five kinds are shared (docs/platform/STEP2_SHARED_RULES.md §3: VERIFY, COMPUTE, MAP, DECIDE, LEARN read
them through ``ai_lego.platform.evidence``); GATHER adds its own kinds below them."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.evidence_words import APPLIES, CARD_CELL_KEYS, MARKS, OWN_WORDS

OVERRIDABLE = (*CARD_CELL_KEYS, "lists")   # 你可以改系統的分類，改的時候寫理由
# What a search looks for (STEP2_SHARED_RULES §4.1 angles of a claim seed): 系統先找最原始的、前例、到過現場的人
ANGLES = (("primary", "原始文件與官方公告"), ("news", "報導"), ("factcheck", "查核"), ("precedent", "前例"), ("field", "到過現場的人"),
          ("opposite", "相反的說法"), ("origin", "最早的出處"))

KINDS = [
    # one card per stored source, or per page set aside with no text (source_id ""); the system's, never the person's words
    DocKind("gather.source", "GATHER", "來源卡", {
        "source_id": Field("text", 64, scan=False),        # the stored row (網頁當時的樣子); "" = a page set aside with no text
        "url": Field("text", 2048, scan=False),             # "" for a file the person pasted
        "title": Field("text", 300, scan=False),
        "found_by": Field("json", 2000, required=True, scan=False),   # {"by": FOUND_BY, "provider"?, "lang"?, "query"?, "angle"?}
        "cells": Field("json", 20000, required=True, scan=False),     # {CARD_CELL_KEYS: evidence_words.cell(...)}: every key, 不留空白
        "lists": Field("json", 4000, scan=False),           # [{"list", "category", "maintainer", "version"}] 列在哪一份名單
        "snapshot": Field("json", 1000, scan=False),        # {"sha256", "fetched_at"} of the stored row
        "aside": Field("text", 300, scan=False),            # why it is set aside (放一旁); "" = not
        "rules": Field("json", 2000, scan=False),           # {ruleset name: version} used for this card
    }, authors=frozenset({"system"}), deletable=False),
    # the system's grouping into independent origins (同一篇、同一張圖、只互相引用、可能同出處); every version stays.
    # An origin's id is computed from its cards (evidence.origins), never stored: a regroup cannot move a mark.
    DocKind("gather.origins", "GATHER", "出處分組", {
        "groups": Field("json", 60000, required=True, scan=False),   # [{"cards": [card doc ids], "how": GROUP_HOW}]: evidence_words.grouping_errors
        "rules_version": Field("text", 40, required=True, scan=False),
    }, authors=frozenset({"system"}), deletable=False, singleton=True),
    # 你可以把系統分的組拆開: these cards become one origin of their own
    DocKind("gather.split", "GATHER", "拆開的組", {
        "cards": Field("list", 200, required=True, scan=False),
        "reason": Field("text", 1000, required=True, human_only=True),
    }),
    # 放一旁的網頁，你可以拿回來
    DocKind("gather.takeback", "GATHER", "拿回來的網頁", {
        "card": Field("text", 64, required=True, scan=False),
        "reason": Field("text", 1000, human_only=True),
    }),
    # 你對每個出處標採用、存疑、不用，並寫一句理由 (同一組一起標); a mark whose group changed is shown, not applied
    DocKind("gather.mark", "GATHER", "你對出處的標記", {
        "origin": Field("text", 120, required=True, scan=False),
        "cards": Field("list", 200, required=True, scan=False),   # the group's cards when you marked it
        "mark": Field("choice", choices=MARKS, required=True, human_only=True, labels=MARKS),
        "reason": Field("text", 1000, required=True, human_only=True),
        "applies": Field("choice", choices=APPLIES, human_only=True, labels=APPLIES),   # 別國的資料：適不適用這裡
    }),
    # 你改系統的分類 (one cell of a card, or which list it is on), with a reason; the page shows yours over the system's
    DocKind("gather.override", "GATHER", "你改的分類", {
        "card": Field("text", 64, required=True, scan=False),
        "key": Field("choice", choices=OVERRIDABLE, required=True, scan=False),
        "value": Field("text", 300, required=True, human_only=True),
        "reason": Field("text", 1000, required=True, human_only=True),
    }),
    # ---- GATHER's own kinds (not read by other blocks) ----
    # 你寫下要查什麼 (or a pasted URL, or 「找跟它說法相反的」 on a card); ``run`` = the collection it started
    DocKind("gather.ask", "GATHER", "要查什麼", {
        "text": Field("text", 2000, required=True),
        "angles": Field("choices", len(ANGLES), choices=tuple(key for key, _ in ANGLES)),
        "card": Field("text", 64, scan=False),          # the source card a 相反的說法 / 原始文件 search starts from
        "url": Field("text", 2048, scan=False),         # a URL the person pasted
        "run": Field("text", 64, scan=False),
    }),
    # 你貼的是一段沒有出處的文字：「我自己說的，還沒有外部出處」 -- kept here, never stored as a source
    DocKind("gather.own", "GATHER", OWN_WORDS, {
        "text": Field("text", 5000, required=True, human_only=True),
    }),
    # 在這裡連不上的管道: what each (engine, language) of one collection run did (ok | unreachable | no_key)
    DocKind("gather.channels", "GATHER", "這次用的管道", {
        "run": Field("text", 64, required=True, scan=False),
        "channels": Field("json", 8000, required=True, scan=False),   # [{"provider", "lang", "state", "why"}]
    }, authors=frozenset({"system"}), deletable=False),
    # AI 幫你想查詢要怎麼下，並翻成別的語言再查一次
    DocKind("gather.ai_queries", "GATHER", "AI 建議的查詢", {
        "queries": Field("json", 8000, required=True),     # [{"text", "lang", "angle"}]
        "note": Field("text", 600),
    }, authors=frozenset({"ai"}), singleton=True),
    # 「這個來源說……」 for each source (or what you pasted), what is still missing, one question
    DocKind("gather.ai_says", "GATHER", "AI 摘要來源", {
        "items": Field("json", 30000, cited=True),         # [{"card", "says", "quote", "citations"}]
        "gaps": Field("list", 5),
        "question": Field("text", 300),
    }, authors=frozenset({"ai"})),
    # AI 指出哪兩個來源互相矛盾（兩邊並排，不選邊）、可能還缺哪一方的說法
    DocKind("gather.ai_compare", "GATHER", "AI 比對來源", {
        "conflicts": Field("json", 30000, cited=True),     # [{"about", "a": {"card", "quote", "citations"}, "b": {...}}]
        "missing": Field("json", 4000),                    # [{"side", "why"}]
    }, authors=frozenset({"ai"}), singleton=True),
]
