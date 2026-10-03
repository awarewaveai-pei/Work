"""SENSE 外化 (contract card): the person puts out, one card per thing, what they actually see, feel and care about.
Cards are the person's; the AI only mirrors them back (``sense.mirror``) and the person confirms, rewrites or drops
that version (``sense.review``)."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

CATEGORIES = ("事件", "感受", "身體反應", "恐懼", "期待", "人物關係與權力", "直覺", "你現在跟自己講的故事", "別人的聲音")
INTENSITY = ("弱", "中", "強")
# 認知作戰打的是情緒：這個情緒是我自己來的，還是有人希望我有？
ORIGIN = ("我自己來的", "有人希望我有", "不確定")
# 自我覺察七個訊號 (the AI may only mark one as worth exploring, with its one smallest question)
SIGNALS = ("情緒", "身體", "身份", "關係／權力", "慾望／利益", "敘事", "規範／傳承")
REGULATION = ("命名", "放慢", "拉開距離", "延後")

KINDS = [
    DocKind("sense.card", "SENSE", "外化卡", {
        "category": Field("choice", choices=CATEGORIES, required=True),
        "text": Field("text", 2000, required=True),
        "emotion": Field("text", 40),                       # 命名：把情緒說成一個詞
        "origin": Field("choice", choices=ORIGIN),          # 這個情緒是我自己來的，還是有人希望我有？
        "from_whom": Field("text", 300),                    # 是誰、從哪裡傳來的（別人的聲音）
        "group": Field("text", 60),                         # 你分的組
        "when": Field("text", 40),                          # 時間線上的位置（日期或「三年前」）
        "links": Field("json", 8000),                       # [{"to": doc_id, "relation": "..."}]：關係圖
        "share_with_facilitator": Field("bool"),            # 有人帶的時候，給不給帶領者看（GOVERN 記同意）
    }),
    # 你自己替現在最強的情緒標強度; DECIDE reads only this, never the cards
    DocKind("sense.state", "SENSE", "現在最強的情緒", {
        "emotion": Field("text", 40, required=True),
        "intensity": Field("choice", choices=INTENSITY, required=True),
        "regulation": Field("choices", len(REGULATION), choices=REGULATION),
        "distance_note": Field("text", 1000),               # 十天、十個月、十年後的我；如果是朋友遇到
        "defer_irreversible": Field("bool"),                # 先做可逆的小步，不可逆的延後
    }, singleton=True),
    DocKind("sense.mirror", "SENSE", "AI 當鏡子整理回來的", {
        "summary": Field("text", 1500, required=True),      # 把你放的東西整理回給你看
        "gaps": Field("list", 3),                           # 哪裡是空的（例：沒有一張卡講到錢）
        "explore": Field("json", 4000),                     # [{"signal": one of SIGNALS, "question": "..."}]，只標記可探索的點
        "question": Field("text", 300),                     # 一次只問一題
    }, authors=frozenset({"ai", "joint", "user"}), singleton=True),   # 再整理一次 = its next version
    DocKind("sense.review", "SENSE", "你對鏡子的回應", {
        "mirror": Field("text", 64, required=True),         # the sense.mirror doc_id
        "version": Field("int", 100000, required=True),     # the version you answered
        "decision": Field("choice", choices=("確認", "改寫", "刪掉"), required=True),
        "note": Field("text", 1000),
    }),
]
