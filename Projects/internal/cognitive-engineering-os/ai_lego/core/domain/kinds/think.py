"""THINK 共思考 (contract card): the person writes first, the AI helps second. A round (``think.round``) is the person's own:
the problem, their own version, the role and mode they picked, their candidate criteria and the look back at how they thought.
What the AI gives back is its own kinds -- ``think.reply`` (a mirror, an audit, criteria, a question) and ``think.batch``
(a set of cards, which ``apps/api/blocks/think.py`` lays out as one AI-authored ``think.card`` each, so every card can get its own
reaction and pick). The person answers a card with ``think.reaction`` and a reply with ``think.response``. Your own version and
the AI-assisted one are never the same document."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

ROLES = ("鏡子", "發散夥伴", "蘇格拉底引導者", "反方教練", "證據稽核者", "決策教練", "後設學習教練")
MODES = ("鏡像", "發散", "挑戰", "查證", "收斂", "只問問題")
# 每一輪至少留下一樣你自己的東西. An own item is stored as "<label>：<what you wrote>", so a reader of the list (DECIDE, LEARN) sees what kind of thing it is.
OWN_TYPES = ("觀察", "假設或替代解釋", "我不知道", "會改變判斷的證據條件", "判準或行動選擇", "對思考方式的反思")
DIVERGE_METHODS = ("替代假設", "反向思考", "視角切換", "限制重設", "類比遷移", "第二序後果")
COUNTER_ANGLES = ("反例", "相反誘因", "第二序後果", "失敗模式", "邊界條件", "最強反論")
METHODS = tuple(dict.fromkeys(DIVERGE_METHODS + COUNTER_ANGLES))
REACTIONS = ("共鳴", "反感", "不理解")
STANCES = ("修正", "維持", "暫停")           # 反方教練: 人要回應：修正、維持或暫停結論
RESPONSES = ("確認", "改寫", "否定")         # 鏡子 / 證據稽核者: 人要確認、改寫或否定
SOURCED = ("有來源", "它自己說的")           # in step 1 there are no source cards (GATHER, step 2), so an AI card is always the second
MAX_PICKED = 3                              # 你自己選三張卡，帶到下一步: per round, refused by block_hooks/think.py BEFORE_SAVE
MIN_OWN_CARDS = 2                           # 你自己至少加兩張思考卡

# Which role and mode an AI action is (the page's role/mode chips and the seven command cards pick one of these).
ACTION_FACETS = {
    "mirror": ("鏡子", "鏡像"),
    "look_back": ("後設學習教練", "鏡像"),
    "diverge": ("發散夥伴", "發散"),
    "counter": ("反方教練", "挑戰"),
    "audit": ("證據稽核者", "查證"),
    "criteria": ("決策教練", "收斂"),
    "direct_advice": ("決策教練", "收斂"),
    "socratic": ("蘇格拉底引導者", "只問問題"),
    "ask_conclusion": ("決策教練", "只問問題"),
}

KINDS = [
    DocKind("think.round", "THINK", "共思考的一輪", {
        "problem": Field("text", 2000, required=True, human_only=True),   # 問題由你自己界定
        "own": Field("list", 12, human_only=True),                         # 你自己的版本，在 AI 開口之前寫的
        "role": Field("choice", choices=ROLES),
        "mode": Field("choice", choices=MODES),
        "criteria": Field("list", 12),                                     # 候選的判準
        "reflection": Field("text", 2000, human_only=True),                # 這次我是怎麼想的
    }),
    DocKind("think.card", "THINK", "思考卡", {
        "claim": Field("text", 1000, required=True),                       # 主張
        "mechanism": Field("text", 1000),                                  # 機制
        "benefit": Field("text", 1000),                                    # 可能好處
        "risk": Field("text", 1000),                                       # 風險
        "assumption": Field("text", 1000),                                 # 要驗證的假設
        "premise": Field("text", 1000),                                    # 建議的前提和適用條件
        "fails_when": Field("text", 1000),                                 # 這個建議可能怎麼失敗
        "round": Field("text", 64, required=True),
        "role": Field("choice", choices=ROLES),                            # 哪個角色給的（AI 的卡）
        "method": Field("choice", choices=METHODS),                        # 發散法／挑戰的角度
        "sourced": Field("choice", choices=SOURCED),                       # AI 的卡才有
        "batch": Field("text", 64),                                        # the think.batch an AI card was laid out from
        "batch_index": Field("int", 100),
    }, authors=frozenset({"user", "ai", "joint"})),
    # Your answer to a card, as your own record pointing at it (like assembler.answer): the card stays whoever wrote its words.
    DocKind("think.reaction", "THINK", "你對一張卡的反應", {
        "card": Field("text", 64, required=True),                          # the think.card doc_id; one live reaction per card (block_hooks/think.py)
        "reaction": Field("choice", choices=REACTIONS),                    # 共鳴、反感、不理解
        "reason": Field("text", 1000),
        "stance": Field("choice", choices=STANCES),                        # 反方的卡：修正、維持、暫停
        "picked": Field("bool"),                                           # 你選這張帶到下一步
    }),
    DocKind("think.batch", "THINK", "AI 這一輪給的一批卡", {
        "round": Field("text", 64, required=True),
        "action": Field("text", 40, required=True),
        "role": Field("choice", choices=ROLES, required=True),
        "cards": Field("json", 60000),                                     # [{claim, mechanism, benefit, risk, assumption, method?, premise?, fails_when?}]
        "question": Field("text", 300),
        "handback": Field("text", 500),                                    # 交還控制: why it gave no cards
        "sourced": Field("choice", choices=SOURCED, required=True),
    }, authors=frozenset({"ai"})),
    DocKind("think.reply", "THINK", "AI 回給你的整理", {
        "round": Field("text", 64, required=True),
        "action": Field("text", 40, required=True),
        "role": Field("choice", choices=ROLES, required=True),
        "sections": Field("json", 30000),                                  # [{"title", "items": [text]}]
        "question": Field("text", 300),                                    # 一次只問一題
        "premise": Field("text", 1000),
        "fails_when": Field("text", 1000),
        "handback": Field("text", 500),
        "sourced": Field("choice", choices=SOURCED, required=True),
    }, authors=frozenset({"ai"})),
    DocKind("think.response", "THINK", "你對 AI 整理的回應", {
        "reply": Field("text", 64, required=True),
        "response": Field("choice", choices=RESPONSES, required=True),
        "note": Field("text", 1000),                                       # 改寫時，寫你自己的版本
    }),
]
