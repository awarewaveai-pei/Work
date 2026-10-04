"""DECIDE 判斷 (contract card): the person writes a provisional conclusion with its grounds, confidence, criteria,
uncertainty and what would change it. Every field the person writes is human-only; the AI only checks (``decide.check``)
and the person confirms what cannot be undone (``decide.review``). Every version stays (舊版不刪)."""

from __future__ import annotations

import re

from ai_lego.core.domain.doc_kinds import DocKind, Field

INTENSITY = ("弱", "中", "強")
CREDIBILITY = ("高", "中", "低", "還不知道")      # 可信不可信由你標：系統只給出處數
HOLD = ("先等一下", "請人覆核", "我想過了，照做")   # 護欄 wait_or_review 之下，不能反悔的事
# 什麼時候停止分析：四題 (keys of ``stop_answers``)
STOP_KEYS = ("unknown", "value_vs_delay", "reversible_enough", "exit_or_escalate")
# 下決定前的四個檢查題 (keys of ``pre_checks``)
PRE_CHECK_KEYS = ("resources", "warned", "pulled", "deadline")
# 系統問你有沒有在影響這個判斷的八項 (``influences_asked`` = [{"who", "answer", "note"}])
ASKED = ("家庭", "文化", "宗教", "法律", "你所在的制度", "演算法", "帶領者", "做研究的人")
ASKED_ANSWER = ("有", "沒有", "不確定")
UNWINNABLE = ("退出", "止損", "換目標")              # MAP 標成解不了的局時，選項裡一定列出的

# 「什麼會改變結論」答「沒有」：接受，並標「這一版不打算改」 (the page mirrors this pattern; the test compares the two)
NO_CHANGE = r"^[\s「『\"'（(]*(沒有|没有|無|无|沒有任何證據|没有任何证据|none|no|nothing)[\s」』\"'）)。.!！]*$"
_NO_CHANGE = re.compile(NO_CHANGE, re.IGNORECASE)


def wont_change(change_condition: object) -> bool:
    return isinstance(change_condition, str) and bool(_NO_CHANGE.match(change_condition.strip()))


def _mine(type: str = "text", max: int = 2000, **options) -> Field:
    return Field(type, max, human_only=True, **options)


KINDS = [
    DocKind("decide.judgment", "DECIDE", "判斷卡", {
        "conclusion": _mine(max=4000),                       # 暫定結論
        "problem_definition": _mine(),                       # 1 問題目前怎麼被定義，為什麼這樣定義
        "facts": _mine("json", 16000, shape="array"),        # 2 [{"text", "sources": int, "self_said": bool, "credibility": CREDIBILITY}]
        "assumptions": _mine(),                              # 3 假設與它的依據
        "norm_context": _mine(),                             # 4 適用法域、權利與義務、價值、由誰承擔後果
        "alternative": _mine(),                              # 5 至少一個替代假設或反例
        "options": _mine("list", 10),                        # 選項（解不了的局：退出、止損、換目標）
        "criteria": _mine(),                                 # 6 判準與權衡
        "uncertainty": _mine(required=True),                 # 7 仍存在的不確定性
        "change_condition": _mine(required=True),            # 8 什麼證據或事件會改變結論（寫「沒有」可以，會被標出來）
        "next_step": _mine(max=500),                         # 9 下一步，一句話；交給 ACT
        "deciders": _mine(max=500),                          # 10 誰有決定權
        "affected": _mine("list", 30),                       # 10 誰會受影響（先帶入開案資料）
        "revision_reason": _mine(max=1000),                  # 11 這一版為什麼改
        "confidence": _mine("int", 100, required=True),      # 信心（百分比）
        "stop_answers": _mine("json", 8000, shape="object"),  # 什麼時候停止分析的四題，key = STOP_KEYS
        "pre_checks": _mine("json", 8000, shape="object"),    # Farrell 的四個檢查題，key = PRE_CHECK_KEYS
        "intensity_now": _mine("choice", choices=INTENSITY, required=True),   # 下判斷前：情緒和急迫感多強
        "influences_listed": _mine("json", 16000, scan=False, shape="array"),  # 系統列的：[{"kind", "text"}]，存在你存的這一版
        "influences_asked": _mine("json", 8000, labels=ASKED, shape="array"),  # 系統問的八項你怎麼答：[{"who", "answer", "note"}]
        "influences_added": _mine("list", 20),               # 你自己補的（跟系統列的分開記）
    }, deletable=False, singleton=True),
    # The AI's check of what the person wrote: it never rewrites the card (關卡二), it points.
    DocKind("decide.check", "DECIDE", "AI 檢查你寫的判斷", {
        "clarity": Field("list", 6),               # 哪裡寫得不清楚
        "reversibility": Field("list", 6),         # 做了不能反悔、很難反悔的地方（你確認）
        "revisitable": Field("text", 800),         # 之後能不能回頭對：哪裡對不出來
        "out_of_scope": Field("list", 6),          # 超出適用範圍的地方
        "gaps": Field("list", 8),                  # 還空著的格子
        "contradictions": Field("list", 6),        # 前後矛盾的地方
        "question": Field("text", 300),            # 一次只問一題
    }, authors=frozenset({"ai"}), singleton=True),   # 再檢查一次 = its next version
    DocKind("decide.review", "DECIDE", "你對 AI 檢查的回應", {
        "check": Field("text", 64, required=True),            # the decide.check doc_id
        "version": Field("int", 100000, required=True),       # the check version you answered
        "irreversible": Field("list", 6),                     # 你確認：這些做了就不能反悔
        "hold": Field("choice", choices=HOLD),
        "reviewer": Field("text", 200),                       # 請誰覆核
        "note": Field("text", 1000),
    }),
    # 「現在我要自己下結論」: from now on the AI gives this version no new answer (the AI actions check it)
    DocKind("decide.seal", "DECIDE", "現在我要自己下結論", {
        "for_version": Field("int", 100000, required=True),
    }, deletable=False),
    DocKind("decide.pause", "DECIDE", "現在先不決定", {
        "why": Field("text", 1000),
    }),
]
