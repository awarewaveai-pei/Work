"""組裝器: 開案資料 (contract card 「寫什麼」) and the block proposals it shows the person (提議 -> 你同意才加)."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

# 你選目的 (the seven purposes; 公共議題判斷 is ours)
PURPOSES = ("自我理解", "複雜決策", "訊息判斷", "創意發散", "學習反思", "團隊審議", "公共議題判斷")
# 套件 = the purpose's default block order: a copy of the supervisor page's PK (check-supervisor.mjs compares the two)
PACKAGES = {
    "自我理解": ("SENSE", "MAP", "THINK", "DECIDE", "LEARN"),
    "個人複雜決策": ("SENSE", "MAP", "THINK", "DECIDE", "ACT", "LEARN"),
    "創意與策略衝刺": ("SENSE", "MAP", "THINK", "DECIDE", "ACT", "LEARN"),
    "可疑訊息判斷": ("VERIFY", "THINK", "DECIDE", "ACT", "LEARN"),
    "課堂反思": ("SENSE", "THINK", "DECIDE", "LEARN"),
    "團隊審議": ("MAP", "VERIFY", "COLLAB", "DECIDE", "ACT", "LEARN"),
    "公共議題判斷": ("MAP", "VERIFY", "THINK", "DECIDE", "ACT", "LEARN"),
}
PURPOSE_PACKAGE = {"自我理解": "自我理解", "複雜決策": "個人複雜決策", "訊息判斷": "可疑訊息判斷", "創意發散": "創意與策略衝刺",
                   "學習反思": "課堂反思", "團隊審議": "團隊審議", "公共議題判斷": "公共議題判斷"}
# Which build step opens a package (supervisor MY_DECISIONS: 首批 = 自我理解、個人複雜決策、創意與策略衝刺)
PACKAGE_OPENS_AT = {"自我理解": 1, "個人複雜決策": 1, "創意與策略衝刺": 1, "可疑訊息判斷": 2, "公共議題判斷": 2, "團隊審議": 3, "課堂反思": 4}
# Blocks built so far; a proposal for any other block is recorded and shown as 「這一塊還沒開放」
OPEN_BLOCKS = ("SENSE", "MAP", "THINK", "DECIDE", "ACT", "LEARN", "GOVERN")
BUILD_STEP = 1

KINDS = [
    DocKind("assembler.intake", "ASSEMBLER", "開案資料", {
        "purpose": Field("choice", choices=PURPOSES, required=True),
        "question": Field("text", 2000, required=True),           # 要釐清什麼
        "risk": Field("text", 2000),                               # 風險
        "affected": Field("list", 30),                             # 誰會受影響
        "rules": Field("text", 2000),                              # 跟這件事有關的法律或程序（知道的話）
        "done_when": Field("text", 1000),                          # 暫定的完成條件
        "happened_in": Field("list", 10, scan=False),              # 發生地（可多個）
        "you_are_in": Field("text", 200, scan=False),              # 你在哪裡
        "others_in": Field("list", 20, scan=False),                # 其他當事人各在哪裡
        "field_contact": Field("text", 500, scan=False),           # 有沒有到過現場的人可以問（選填）
        "no_record": Field("bool", human_only=True),               # 不留紀錄：關掉這個案子時整個刪掉 (GOVERN, card 32)
        "led_by": Field("json", 400, shape="object", human_only=True, scan=False),   # {facilitator_identity_id}: who led this case (FACILITATE, card 61); read only by visibility.led_cases
        "package": Field("choice", choices=tuple(PACKAGES), required=True),
        "blocks": Field("choices", 20, choices=("SENSE", "GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "EXPRESS", "FACILITATE", "COLLAB", "GOVERN")),
    }, deletable=False, singleton=True),
    # A block's proposal to add another block -- the system's words, written by the proposing block, never by the person.
    *[DocKind(f"assembler.proposal.{block.lower()}", block, "加一塊的提議", {
        "propose": Field("choice", choices=("GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "COLLAB", "EXPRESS"), required=True),
        "why": Field("text", 500, required=True),      # the proposing block's fixed words, never the person's (block_hooks)
        "guardrail": Field("bool"),
        "source": Field("text", 64),                    # the doc that set it off, by id only
        "topic": Field("text", 120),                    # what it is about when a block is offered for different things (TEACH: a method id)
    }, authors=frozenset({"system"}), deletable=False) for block in ("SENSE", "GATHER", "MAP", "VERIFY", "COMPUTE", "DECIDE", "LEARN")],
    # The person's answer to one proposal (你同意才加): its own record, so the proposal's words stay the system's.
    DocKind("assembler.answer", "ASSEMBLER", "你對提議的回答", {
        "proposal": Field("text", 64, required=True),
        "answer": Field("choice", choices=("accepted", "declined"), required=True),
    }),
]
