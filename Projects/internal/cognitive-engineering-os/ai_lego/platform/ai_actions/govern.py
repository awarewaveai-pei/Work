"""GOVERN's AI turn (contract card 「AI 能做什麼」): the AI explains what a setting means. It restates the system's own
description of the setting -- given to it word for word -- and reads nothing the person wrote (the card: GOVERN 不看你攤出
來的內容；「你在哪裡」只用來給求助資源)."""

from __future__ import annotations

from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction

# What each setting does, as the system does it. The AI may use only this text (it is checked in the tests that none of
# it carries a crisis word, or the gate would stop every explanation).
TOPICS = {
    "where": ("你在哪裡", "你可以寫下你在哪個地方，也可以不寫。寫了，出現危急的時候，系統會給你那個地方的求助電話；不寫，就給世界各地都能用的。沒有案子的時候，只有這一項會被讀到，而且只用來給求助資源。"),
    "guardrails": ("護欄", "案子碰到健康、法律、金錢、人身安全或要公開散布的事，系統會加護欄，也就是多一層提醒。護欄有幾種：要求來源（AI 說到事實要附出處）、建議找專業的人、碰到不能反悔的事先等一下或請人看看。你在護欄頁看得到加了哪些、是哪一塊發現的；內容不會被護欄記下來。"),
    "export": ("匯出", "你可以把一個案子，或你所有的資料，下載成檔案。檔案有兩種：程式讀得懂的 JSON，和人讀得懂的 Markdown。每一筆都寫著是誰寫的（你、AI、共同或系統）和哪一塊寫的。匯出只是把資料搬出來，不經過 AI。"),
    "erase": ("刪除", "你可以刪掉一個案子，或刪掉整個帳號。刪帳號會先刪掉你所有的案子和個人紀錄，再刪掉帳號本身。刪掉就回不來。系統只留一筆「已抹除」的標記，裡面沒有你寫的任何內容。"),
    "versions": ("版本紀錄", "每次 AI 回答，系統都記下用了哪個模型，和給它的指令是哪一版（用一串指紋代表）。你可以在案子的護欄與版本頁查到。規則改了，版本就會變。"),
}

EXPLAIN = (
    "Explain one setting of the platform to a person who has never used it. Use only the description you are given: add no "
    "facts, promise nothing, and do not tell the person what to choose. Plain Traditional Chinese, at most five short "
    "sentences, one thing per sentence. Start with the setting's name."
)
SCHEMA = {"type": "object", "properties": {"explanation": {"type": "string"}}, "required": ["explanation"]}


def _input(context: Mapping[str, Any], read: Callable[[str], list[dict[str, Any]]]) -> str:
    topic = context.get("topic")
    if topic not in TOPICS:
        raise InvariantViolation(f"AI_CONTEXT_INVALID: topic is one of {sorted(TOPICS)}")
    name, description = TOPICS[topic]
    return f"Setting: {name}\nDescription (your only source):\n{description}"


ACTIONS = [
    AiAction(block="GOVERN", name="explain", needs="organize", instructions=EXPLAIN, output_kind="govern.explanation", output_schema=SCHEMA,
             reads=(), build_input=_input, outside_case=True, max_tokens=600),
]
