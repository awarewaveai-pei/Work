"""LEARN 回顧校準 (contract card): the person looks back -- prediction against outcome, what they missed, process
apart from luck, whether the AI's help earned trust -- and decides to keep the judgment, write a new version, or change
method. The platform shows what the person did unaided; it never scores or ranks (no key here may be one).

Person-owned (outside any case): the daily 10-minute calibration card, the two practices the person set, the weekly
sprints, and ``learn.history`` -- one line per reviewed case, written only by the platform (author system), from which
the cross-case hints come."""

from __future__ import annotations

from typing import Any, Mapping

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.kinds.decide import INTENSITY, wont_change

DECISIONS = ("維持判斷", "出新版判斷", "換方法再做一輪", "還沒決定")
PREDICTION_RESULT = ("對上了", "部分對上", "沒對上", "還不知道")
DONE_WHEN = ("做到了", "部分做到", "還沒", "不確定")
DAILY_ABOUT = ("信念", "情緒", "決定")
# 回顧的四個檢查題 (keys of ``review_checks``)
REVIEW_CHECK_KEYS = ("measured_right", "paper_vs_strength", "accumulating", "opponent_learns")
# 信任校準五個面向 (keys of ``trust``)
TRUST_KEYS = ("reliability", "predictability", "usefulness", "context", "bias_dependence")
# Blocks a review may propose adding (the ones ``assembler.proposal.learn`` can name)
PROPOSABLE = ("GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "COLLAB", "EXPRESS")
# 成長九項 (藍圖 6.10): learning signals shown to the person only -- never a score, never a rank, never compared with others
GROWTH = (
    "AI 介入前，能不能先提出自己的問題定義",
    "自發產生的假設與替代方案的數量和差異度",
    "能不能區分事實、推論、價值與未知",
    "有沒有提出可被反駁的改變條件",
    "初始信心與事後結果的校準程度",
    "能不能說明何時採納、覆寫或暫停 AI 的建議",
    "能不能辨認資料遺失、脈絡斷裂、模型偏誤或 AI 不適用的情況",
    "能不能從過去決策辨認重複的情緒、身份或權力模式",
    "是否逐步需要更少 AI 支架，仍能完成同類型思考",
)


def _mine(type: str = "text", max: int = 2000, **options) -> Field:
    return Field(type, max, human_only=True, **options)


KINDS = [
    DocKind("learn.calibration", "LEARN", "回顧", {
        "judgment_version": _mine("int", 100000, required=True),     # 對的是判斷卡的第幾版
        "outcome": _mine(max=3000, required=True),                   # 實際發生了什麼
        "prediction_result": _mine("choice", choices=PREDICTION_RESULT),
        "prediction_note": _mine(max=1000),                          # 預測對上結果：差在哪
        "missed": _mine(),                                           # 當時漏看了什麼
        "review_checks": _mine("json", 8000),                        # Farrell 的四個檢查題，key = REVIEW_CHECK_KEYS
        "step_done": _mine(),                                        # 這一步有沒有做好（清得掉）
        "direction": _mine(),                                        # 整件事有沒有往解決的方向走（守得住）
        "process": _mine(),                                          # 過程：我做對、做錯了什麼
        "luck": _mine(),                                             # 運氣：哪些不是我做的
        "decision": _mine("choice", choices=DECISIONS),
        "other_method": _mine(max=500),                              # 換方法時：換什麼（MAP 讀）
        "updated_conditions": _mine(),                               # 更新後的判斷條件（DECIDE 讀）
        "done_when_met": _mine("choice", choices=DONE_WHEN),         # 開案時寫的暫定完成條件，做到了沒有
        "trust": _mine("json", 8000),                                # 信任校準五個面向，key = TRUST_KEYS
        "delegate_note": _mine(max=1000),                            # 哪些事還交給 AI，哪些不交
        "next_blocks": _mine("choices", len(PROPOSABLE), choices=PROPOSABLE),
        "wrong_sources": _mine("json", 8000),                        # [{"source", "why", "cards"?}]：當時哪個出處錯了；cards = the GATHER cards of the origin picked (evidence.origins reads them)
    }, deletable=False),
    DocKind("learn.revisit", "LEARN", "回來重看的日子", {
        "on": Field("date", required=True),
        "note": Field("text", 500),
    }, singleton=True),
    DocKind("learn.compare", "LEARN", "AI 整理的前後比較", {
        "side_by_side": Field("text", 3000, required=True),
        "done_well": Field("list", 2),                               # 這次你想得好的兩處
        "practice": Field("text", 500),                              # 下次可以練的一處
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("learn.daily", "LEARN", "每天的校準卡", {
        "about": _mine("choice", choices=DAILY_ABOUT, required=True),
        "text": _mine(max=1000, required=True),                      # 一個信念、情緒或決定
        "counterexample": _mine(max=1000),                           # 你補的反例
        "change_condition": _mine(max=1000),                         # 什麼會改變它
    }, owner="person"),
    DocKind("learn.daily_mirror", "LEARN", "AI 當鏡子整理的校準卡", {
        "summary": Field("text", 1500, required=True),
    }, owner="person", authors=frozenset({"ai"}), singleton=True),
    DocKind("learn.practice", "LEARN", "你設的兩件固定做的事", {
        "daily": Field("bool"),                                      # 每天 10 分鐘認知校準
        "weekly_sprints": Field("int", 3),                           # 每週 2 到 3 次 30 分鐘思考衝刺（0 = 不設）
    }, owner="person", singleton=True),
    DocKind("learn.sprint", "LEARN", "一次思考衝刺", {
        "project": Field("text", 64, required=True),                 # 挑了哪個案子
        "note": Field("text", 500),
    }, owner="person"),
    DocKind("learn.habit", "LEARN", "下次要保留或改變的思考習慣", {
        "keep": _mine(max=1000),                                     # 要保留的
        "change": _mine(max=1000),                                   # 要改變的
        "project": Field("text", 64),                                # 從哪個案子的回顧來的（選填）
    }, owner="person"),
    DocKind("learn.history", "LEARN", "個人歷程：一個案子", {
        "project": Field("text", 64, required=True),
        "judgment_version": Field("int", 100000),
        "intensity": Field("choice", choices=INTENSITY),             # 下判斷前你標的情緒強度
        "wont_change": Field("bool"),                                # 「什麼會改變結論」寫了「沒有」
        "moves": Field("list", len(GROWTH)),                         # 這個案子你自己做到的思考動作（GROWTH 的項目）
        "ai_docs": Field("int", 100000),                             # 這個案子 AI 寫的（含 AI 起草你改過的）份數
        "own_docs": Field("int", 100000),                            # 你自己寫的份數
    }, owner="person", authors=frozenset({"system"}), deletable=False, from_case="project"),
]


def pattern_hints(entries: list[Mapping[str, Any]]) -> list[str]:
    """Habits that show up in more than one case (the contract's example: decided while 強 in two cases). A hint only
    says how often; it never says right or wrong, and it is shown to the person alone."""
    hints = []
    strong = sum(1 for entry in entries if entry.get("intensity") == "強")
    if strong >= 2:
        hints.append(f"你有 {strong} 個案子，都是在情緒「強」的時候下的判斷。這只告訴你出現幾次，不是說對或錯。")
    unchanging = sum(1 for entry in entries if entry.get("wont_change"))
    if unchanging >= 2:
        hints.append(f"你有 {unchanging} 個案子的判斷，「什麼會改變結論」都寫了「沒有」。這只告訴你出現幾次，不是說對或錯。")
    return hints


def _latest(records: Mapping[str, list[dict[str, Any]]], kind: str) -> dict[str, Any] | None:
    found = records.get(kind) or []
    return found[-1] if found else None


def own_moves(records: Mapping[str, list[dict[str, Any]]], history: list[Mapping[str, Any]], project_id: str) -> list[dict[str, str]]:
    """The thinking moves this person made on their own in one case, from what the case holds (成長九項; ``records`` =
    kind -> the current documents of that kind). An item with nothing to show is left out -- never a zero, never a score.
    Item 8 is not here: it is the system pointing at a habit (``pattern_hints``), not something the person did."""
    moves: dict[int, str] = {}
    all_docs = [doc for docs in records.values() for doc in docs]
    first_ai = min((doc["created_at"] for doc in all_docs if doc["author"] in ("ai", "joint")), default=None)
    judgment = _latest(records, "decide.judgment")
    content = judgment["content"] if judgment else {}
    wrote_problem = [doc["created_at"] for doc in records.get("think.round", []) if doc["content"].get("problem")]
    if content.get("problem_definition") and judgment:
        wrote_problem.append(judgment["created_at"])
    if wrote_problem and (first_ai is None or min(wrote_problem) < first_ai):
        moves[0] = "你在 AI 動手之前，先寫了自己怎麼定義這個問題。"
    ideas = sum(len(doc["content"].get("own") or []) for doc in records.get("think.round", [])) + (1 if content.get("alternative") else 0)
    if ideas:
        moves[1] = f"你自己寫了 {ideas} 個想法或替代方案。"
    made_map = _latest(records, "map.map")
    layers = (made_map["content"].get("layers") or {}) if made_map and isinstance(made_map["content"].get("layers"), dict) else {}
    parts = [part for part, shown in (("地圖上事實和解釋分開放", layers.get("facts") and layers.get("interpretations")), ("判斷卡寫了仍然不確定的地方", content.get("uncertainty")),
                                      ("你自己標了事實的可信度", any(isinstance(fact, dict) and fact.get("credibility") for fact in content.get("facts") or []))) if shown]
    if parts:
        moves[2] = "；".join(parts) + "。"
    if content.get("change_condition") and not wont_change(content["change_condition"]):
        moves[3] = f"你寫下了什麼會改變結論：「{content['change_condition'][:60]}」。"
    reviewed = [doc for doc in records.get("learn.calibration", []) if doc["content"].get("prediction_result") in PREDICTION_RESULT[:3]]
    if reviewed and content.get("confidence") is not None:
        moves[4] = f"你當初信心 {content['confidence']}%，回頭看預測「{reviewed[-1]['content']['prediction_result']}」。"
    rewrote = sum(1 for doc in all_docs if doc["author"] == "joint")
    dropped = sum(1 for doc in records.get("sense.review", []) if doc["content"].get("decision") == "刪掉")
    kept = ([f"改過 {rewrote} 份 AI 起草的內容"] if rewrote else []) + ([f"刪掉 {dropped} 份 AI 整理"] if dropped else [])
    if kept:
        moves[5] = "你" + "、".join(kept) + "。"
    trust = (_latest(records, "learn.calibration") or {"content": {}})["content"].get("trust") or {}
    if isinstance(trust, dict) and any(trust.get(key) for key in ("predictability", "context", "bias_dependence")):
        moves[6] = "你寫下了 AI 哪些地方看不到脈絡、不一定適用或可能偏掉。"
    before = [entry for entry in history if entry.get("project") != project_id and entry.get("ai_docs") is not None]
    ai_docs = sum(1 for doc in all_docs if doc["author"] in ("ai", "joint"))
    if before and all_docs:
        moves[8] = f"AI 寫的份數：這個案子 {ai_docs}，上一個案子 {before[-1]['ai_docs']}。案子不同，這只是並排給你看，不能直接比。"
    return [{"item": GROWTH[index], "seen": text} for index, text in sorted(moves.items())]
