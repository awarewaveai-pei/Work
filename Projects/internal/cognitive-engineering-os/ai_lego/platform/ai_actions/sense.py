"""SENSE's AI turn (contract card 「AI 能做什麼」): the AI is a mirror. It gives the cards back in order, points at what
is empty, may mark a few of the seven self-awareness signals as worth exploring, and asks one question. It reads only
what the person put out (讀什麼：你輸入的內容；絕不讀判斷卡、回顧紀錄)."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.core.domain.kinds.sense import SIGNALS
from ai_lego.platform.ai_gate import AiAction

SIGNAL_QUESTIONS = {
    "情緒": "我現在最強的情緒是什麼？它推我靠近或遠離什麼？",
    "身體": "我在緊繃、急迫、麻木或過度興奮嗎？這怎麼改變我判斷的速度？",
    "身份": "如果我承認另一種可能，哪一個「我」會受到威脅？",
    "關係／權力": "我是在說真心話，還是在回應某人的期待、權力或恐懼？",
    "慾望／利益": "我希望哪個結果成立？這個希望會造成什麼盲點？",
    "敘事": "我正在重複哪個熟悉的故事？它讓什麼變得看不見？",
    "規範／傳承": "這個要求從哪裡來？我是反思後認同、暫時遵守，還是因習慣、壓力或恐懼沒檢查過？",
}

MIRROR = (
    "Act as a mirror for what the person put out as cards (each with a category). Do not analyse, do not conclude, do "
    "not interpret motives, do not diagnose or evaluate, never say what they should or should not feel, and never use "
    "an emotion as a lever to persuade.\n"
    "- summary: give back, in their own terms and in a calm order, what the cards say: what happened, what they feel, "
    "what they fear and hope, who is involved. Keep their words; add nothing they did not write.\n"
    "- gaps: up to 3 places that are empty, each as a neutral observation with no judgement "
    "(example: 「沒有一張卡講到錢，是沒發生還是沒寫？」).\n"
    "- explore: up to 3 of the seven self-awareness signals that look worth exploring, each with exactly the question "
    "given for it below, unchanged. Only mark a point; never claim to know the person's real motive.\n"
    "- question: at most one question, the one most useful for them to see more clearly.\n"
    "The seven signals and their questions:\n" + "\n".join(f"{name}: {question}" for name, question in SIGNAL_QUESTIONS.items())
)

MIRROR_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "gaps": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "explore": {"type": "array", "maxItems": 3, "items": {"type": "object", "properties": {"signal": {"type": "string", "enum": list(SIGNALS)}, "question": {"type": "string"}}, "required": ["signal", "question"]}},
        "question": {"type": "string"},
    },
    "required": ["summary"],
}


def _cards(read: Callable[[str], list[dict[str, Any]]]) -> list[dict[str, Any]]:
    return [doc["content"] for doc in read("sense.card")]


def _mirror_input(context: Mapping[str, Any], read: Callable[[str], list[dict[str, Any]]]) -> str:
    cards = [{key: card.get(key) for key in ("category", "text", "emotion", "origin", "from_whom", "group", "when") if card.get(key)} for card in _cards(read)]
    state = read("sense.state")
    payload = {"cards": cards, **({"strongest_emotion": state[-1]["content"]} if state else {})}
    return "The person's cards:\n" + json.dumps(payload, ensure_ascii=False)


def _shape(answer: dict[str, Any]) -> dict[str, Any]:
    """The card fixes the questions: a signal outside the seven is dropped, and each kept one carries the card's own
    question word for word (the model only marks a point; it never writes its own probing question here)."""
    explore = answer.get("explore") if isinstance(answer.get("explore"), list) else []
    marked = list(dict.fromkeys(item.get("signal") for item in explore if isinstance(item, dict) and item.get("signal") in SIGNAL_QUESTIONS))[:3]
    gaps = answer.get("gaps") if isinstance(answer.get("gaps"), list) else []
    shaped = {**answer, "gaps": [gap for gap in gaps if isinstance(gap, str)][:3], "explore": [{"signal": signal, "question": SIGNAL_QUESTIONS[signal]} for signal in marked]}
    return {key: value for key, value in shaped.items() if value not in ([], None, "")}


ACTIONS = [
    AiAction(block="SENSE", name="mirror", needs="organize", instructions=MIRROR, output_kind="sense.mirror", output_schema=MIRROR_SCHEMA,
             reads=("sense.card", "sense.state"), build_input=_mirror_input, shape=_shape, max_tokens=1800),
]
