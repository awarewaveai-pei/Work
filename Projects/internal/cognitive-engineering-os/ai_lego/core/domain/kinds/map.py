"""MAP 拆解 (contract card): the person splits one matter into six layers and keeps the claims of four kinds apart.
The map is the person's (every version stays; the core conflict is theirs alone). What the AI offers -- which layer a
card may sit in, other readings, a method, which lines are claims -- is its own kind (``map.*``) that the person
confirms or drops (``map.review``); a confirmed one lands in the map as the person's own save, tagged with who wrote it.
"""

from __future__ import annotations

from typing import Callable

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.evidence_words import MIN_ORIGINS

# (key, name, the question the layer answers, what it hands over) -- 系統做什麼
LAYERS = (
    ("facts", "事實", "到底發生了什麼？", "可觀察事件、資料與來源"),
    ("interpretations", "解釋", "同一事實有哪些理解？", "目前敘事、替代敘事、推論鏈"),
    ("interests", "利益", "每個角色真正想要或害怕什麼？", "誘因、損失、隱性動機"),
    ("structure", "結構", "規則、角色、權力、資源怎麼配置？", "權責圖、資訊不對稱、制度限制"),
    ("core", "核心矛盾", "哪個上游問題不解，其他都只是症狀？", "核心衝突假設"),
    ("intervention", "介入", "最小且槓桿最高的改變是什麼？", "可逆試驗、介入方案、風險"),
)
LAYER_KEYS = tuple(key for key, *_ in LAYERS)
BY = ("user", "ai", "joint")   # who wrote an item (我、AI，或共同)

# 四種主張要分開: kind -> (what it needs, the fields that carry it)
CLAIM_KINDS = {
    "事實": ("要可追溯的證據與查證", (("evidence", "證據，或怎麼查證"),)),
    "法律": ("要標適用法域、時效、來源；AI 不能憑常識宣告", (("jurisdiction", "適用法域"), ("limitation", "時效"), ("source", "來源"))),
    "價值": ("要說清楚依據的原則、彼此衝突的價值、誰承擔後果", (("principle", "依據的原則"), ("conflict", "彼此衝突的價值"), ("bears", "誰承擔後果"))),
    "文化宗教": ("承認傳統內部有多種詮釋，當事人的理解放在平台定義之前", (("own_understanding", "你自己怎麼理解"),)),
}
# 事實 and 法律 can be checked against a record; 價值 and 文化宗教 cannot (VERIFY is proposed only for the first two)
CHECKABLE = ("事實", "法律")

# 「解不了的局」: Theo Farrell's lecture on Britain in Afghanistan (the lecture, not his book) -- (question, his example)
UNWINNABLE_QUESTIONS = (
    ("目標是不是大到到過現場的人都不敢這樣寫？", "英國的國家目標是建立有效、有代表性的政府；到過現場的小組只敢寫「守住兩個城、先弄懂當地」"),
    ("我是為了這個問題本身去做，還是為了別的事？", "對英國軍方，赫爾曼德是離開伊拉克的體面出口，也是為了帶動盟友"),
    ("我依靠的那一方，是不是正在製造問題？", "塔利班當年趕走的軍閥回來當省長、警察局長、情報局長，掠奪別的部落；被排除的部落倒向塔利班"),
    ("對手是不是給了我這邊給不了的東西？", "政府法院一路要賄賂；塔利班的法庭快、不用錢"),
    ("問題有沒有一部分在我管不到、又不能翻臉的地方？", "內陸國，補給要穿過巴基斯坦；塔利班的家眷、新兵、冬季休整都在巴基斯坦的難民營"),
    ("我的手段是不是在替對手招人？", "夜間破門搜查、懸賞舉報、掃毒打到大部分人的生計，引發普遍起義"),
    ("修這個問題，會不會製造下一個？", "撤換軍閥省長之後，他的部落民兵轉頭和塔利班合作"),
    ("當地人記得什麼我不知道的事？", "當地人還記得、還在慶祝 1880 年打敗英軍"),
)
UNWINNABLE_ANSWERS = ("是", "否", "不確定")
# Farrell says these two doom a campaign; the reading after them is ours, not his (card 「我的解讀」)
FARRELL_REASONS = ("我支持的政府貪腐到失去正當性", "鄰國支持我的對手")
FARRELL_READING = "我們的解讀，不是 Farrell 說的：兩個都不是多投入就能解決的。"

REVIEW_DECISIONS = ("採用", "不採用")

KINDS = [
    DocKind("map.map", "MAP", "地圖", {
        "method": Field("text", 200, scan=False),           # the 拆法 used, as the person reads it (工具名: the catalog's words)
        "method_id": Field("text", 120, scan=False),        # its catalog id, so a method already used in this case is known
        "method_version": Field("text", 40),                # the tool's version when it was picked (系統記下用的是哪一版)
        "one_lines": Field("json", 6000, shape="object"),   # {layer key: the one line you write first}
        "layers": Field("json", 60000, unread_keys=("place",), shape="object"),   # {layer key: [{id, text, by, card?, group?, place?, sources?, self_said?, cards?}]}; a fact's cards = GATHER source cards
        "skipped": Field("choices", len(LAYER_KEYS), choices=LAYER_KEYS),
        "core_conflict": Field("text", 2000, human_only=True),
        "claims": Field("json", 20000, labels=tuple(CLAIM_KINDS), shape="array"),   # [{id, text, kind, by, item?, + the kind's detail fields}]
        "gaps": Field("list", 30),                          # 資訊缺口
        "assumptions": Field("json", 8000, shape="array"),  # [{text, by}] 假設，誰提的
        "unwinnable": Field("bool"),                        # you judged this a game that cannot be won
        "unwinnable_answers": Field("json", 8000, shape="array"),  # [{q: 0..7, answer, note?}]
    }, deletable=False, singleton=True),
    # What the AI offers. Each is the AI's alone; the person confirms or drops each line (map.review).
    DocKind("map.placement", "MAP", "AI 建議的層", {
        "placements": Field("json", 20000, shape="array"), # [{card: sense.card doc_id, layer}]
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("map.alternatives", "MAP", "AI 提的別的解釋", {
        "items": Field("json", 20000, shape="array"),      # [{about: item id, view, check}]
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("map.method_pick", "MAP", "AI 推薦的拆法", {
        "picks": Field("json", 8000, shape="array"),      # [{method_id, reason}]
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("map.claim_proposal", "MAP", "AI 提議的主張", {
        "proposals": Field("json", 20000, shape="array"),  # [{item: item id, kind}]
    }, authors=frozenset({"ai"}), singleton=True),
    # The person's answer to one line of an AI offer: kept, so 回顧 can show whether you took it.
    DocKind("map.review", "MAP", "你對 AI 建議的回應", {
        "suggestion": Field("text", 64, required=True),     # the AI doc_id
        "version": Field("int", 100000, required=True),
        "key": Field("text", 64, required=True),            # which line of it: a card id, an item id, a method id
        "decision": Field("choice", choices=REVIEW_DECISIONS, required=True),
    }, deletable=False),
]


def is_thin(item: object, behind: "Callable[[list[str]], int] | None" = None) -> bool:
    """A fact not marked as the person's own say (「我自己說的」) with fewer than two independent sources: the AI stops on
    it (card 「交還控制」), the person decides. A fact with no mark counts as from outside -- this fails closed. A fact
    linked to source cards (``cards``) is counted live by ``behind`` (ai_lego.platform.evidence.origins_behind); a caller
    that cannot count (CONTEXT reads no source cards) holds it back -- the stored ``sources`` is never trusted for it."""
    if not isinstance(item, dict) or item.get("self_said") is True:
        return False
    cards = item.get("cards")
    if isinstance(cards, list) and cards:   # a linked fact's count is only the live one; a caller that cannot count holds it back
        return behind is None or behind([card for card in cards if isinstance(card, str)]) < MIN_ORIGINS
    sources = item.get("sources")
    return isinstance(sources, bool) or not isinstance(sources, int) or sources < MIN_ORIGINS


def thin_facts(layers: object, behind: "Callable[[list[str]], int] | None" = None) -> list[str]:
    """Ids of the thin facts in the facts layer."""
    items = layers.get("facts") if isinstance(layers, dict) else None
    return [item["id"] for item in items if is_thin(item, behind) and item.get("id")] if isinstance(items, list) else []


def spec() -> dict:
    """What the page shows, from the one place that holds it."""
    return {
        "layers": [{"key": key, "name": name, "question": question, "output": output} for key, name, question, output in LAYERS],
        "claim_kinds": [{"kind": kind, "needs": needs, "details": [{"key": key, "label": label} for key, label in details]} for kind, (needs, details) in CLAIM_KINDS.items()],
        "unwinnable": {
            "questions": [{"q": number, "question": question, "example": example} for number, (question, example) in enumerate(UNWINNABLE_QUESTIONS)],
            "answers": list(UNWINNABLE_ANSWERS),
            "reasons": list(FARRELL_REASONS),
            "reasons_reading": FARRELL_READING,
            "source": "題目出自 Theo Farrell 談英國在阿富汗作戰的講稿。",
        },
    }
