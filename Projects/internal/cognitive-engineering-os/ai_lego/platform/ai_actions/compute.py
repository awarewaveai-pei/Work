"""COMPUTE's AI turns (contract card 「AI 能做什麼」): suggest an algorithm (``propose_options``: STEP2_SHARED_RULES §11)
and explain a run in plain words, naming the assumption that moves it most (``organize``). The system runs every
calculation; the AI never writes a number, never calls a calculation or a simulation a prediction, and never hides an
assumption: ``rests_on`` is every input of the run, filled from the record, not by the model.

They read only the case's runs through ``read.evidence.calcs()`` -- each number with its counted origins, counted in
``evidence.calc_results`` from GATHER's cards, never here -- and nothing else the person keeps (讀什麼：GATHER 的來源卡、
你給的數字；絕不讀跟這次計算無關的個人資料). ``explain`` hands back (交還控制) while an outside number has under two
independent origins, unless the person chose to go on."""

from __future__ import annotations

import json
import re
import unicodedata
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import MIN_ORIGINS
from ai_lego.core.domain.evidence_words import LABELS, OWN_WORDS
from ai_lego.core.domain.kinds.compute import AI_PARTS, NOT_PREDICTION, SCENARIOS
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.block_hooks.compute import algorithms, sourcing, weakest

Read = Callable[..., list[dict[str, Any]]]
READS = ("compute.run",)

# AI 不准自己編數字 is an allow list: any digit, percent sign, Roman numeral, CJK numeral or English number word is a
# number the AI wrote, unless it sits inside one of these fixed words with no unit right after it (「一個」 is a word,
# 「一個月」 is a number). A word missing here costs a retry; a number let through would break the card.
# Every numeral form of written Chinese, in one list (Codex F3): the digits, the large units in both scripts, 兩/两, the
# financial forms in both scripts (with 叄), 廿卅卌 (and 卄), and the numerals fused with a measure word.
NUMERAL_FORMS = ("〇零一二三四五六七八九十百千", "萬万億亿兆", "兩两", "壹貳贰參叁叄肆伍陸陆柒捌玖拾佰仟", "廿卄卅卌", "仨倆俩")
NUMERAL = re.compile(r"[\d%‰半倍" + "".join(NUMERAL_FORMS) + "]")
ROMAN = re.compile("[\u2160-\u2188]")   # checked before NFKC turns Ⅻ into letters
UNIT_AFTER = "年月週周天日季歲時分秒鐘倍成元塊千百%次趟件人" + NUMERAL_FORMS[1]
IDIOMS = ("一個", "一起", "一般", "一定", "一樣", "萬一", "一些", "一點", "一直", "一下", "一種", "一次", "一邊", "一方面", "統一", "唯一", "一致",
          "進一步", "一旦", "一切", "一同", "單一", "同一", "不一", "每一", "任一", "另一", "其一", "之一", "一律", "一併", "一向", "一套", "一份",
          "一筆", "一句", "一張", "一項", "這一塊", "那一塊", "每一塊", "一端", "兩端", "兩邊", "兩者", "兩種", "兩難", "第一", "十分", "萬分", "千萬",
          "多半", "一來", "一成不變", "一清二楚", "一模一樣", "獨一無二", "數一數二", "三思", "加倍")
IDIOM = re.compile("(?:" + "|".join(sorted(map(re.escape, IDIOMS), key=len, reverse=True)) + f")(?![{UNIT_AFTER}])")
ENGLISH_NUMBER = re.compile(r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|"
                            r"eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|"
                            r"trillions?|dozens?|half|halves|quarters?|twice|thrice|double|triple|percent|percentage|"
                            r"(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|"
                            r"sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|"
                            r"ninetieth|hundredth|thousandth|millionth)s?)\b", re.IGNORECASE)
ENGLISH_IDIOM = re.compile(r"\b(?:no one|one of|one another|the one|each one|one at a time|double[- ]check|at first|first of all)\b", re.IGNORECASE)

# 模擬不是預測: no filter can stop every forecast in free prose (「下個月就回本」 carries none of these words). The guarantee
# is the frame -- the page shows the system's own 「模擬不是預測，計算也不是」 beside every explanation; this guard is a
# best effort on top of it. It refuses three groups of markers -- the future (會、將…), certainty (穩、鐵定、必…) and
# likelihood (很可能、大概率…) -- unless the marker sits inside a fixed word where it claims nothing (機會、穩定、必要…).
# A refusal costs one retry; the AI can say what the calculation shows without one (「悲觀情境下的計算結果低於打平」).
MODALS = r"[會將]|一定|肯定|勢必|保證|註定|注定"
CERTAINTY = r"穩|鐵定|必|絕對|準|包|保本|保賺|確定"
# how likely an outcome is (Codex F4; 很可能、大概率 hold these): 不可能 and 可能性 stay markers, 盡可能 is allowed below;
# 大約 is about an amount, not a likelihood. 八成 is refused as a number first, 應該會 by its 會
LIKELIHOOD = r"可能|也許|或許|大概|恐怕|說不定|興許|有望|可望|多半"
MARKER = re.compile("|".join((MODALS, CERTAINTY, LIKELIHOOD)))
NOT_MARKERS = (
    # 會 as meeting, body, occasion or understanding
    "機會", "社會", "會議", "會計", "協會", "學會", "公會", "工會", "委員會", "會員", "體會", "誤會", "理會", "開會", "聚會", "約會", "會談",
    "會面", "會合", "會場", "會長", "研討會", "大會", "國會", "議會", "領會",
    # 將 as nearly, a general, making do, or the future named as a time
    "將近", "將軍", "將就", "將來",
    # a certainty word negated says it is not certain; 一定程度 is "to some extent"
    "不一定", "不一定會", "不等於一定會", "不代表一定會", "不代表會", "不保證", "無法保證", "不能保證", "沒有保證", "不必然", "不肯定", "一定程度",
    # 穩 as stable or prudent, 必 as necessary or needless, 準 as accurate, standard or ready, 包 as including, 絕對 as an
    # absolute value; 確定 and 保本 negated
    "穩定", "不穩", "穩健", "必要", "必須", "必需", "不必", "未必", "何必", "準確", "標準", "準備", "水準", "基準", "精準", "準則", "不準", "批准",
    "包括", "包含", "外包", "打包", "絕對值", "不確定", "無法確定", "不保本",
    # 可能 as an effort (盡可能多找出處), not how likely an outcome is
    "盡可能",
)
NOT_MARKER = re.compile("|".join(sorted(map(re.escape, NOT_MARKERS), key=len, reverse=True)))
ENGLISH_MODALS = r"\b(?:will|shall|gonna|going to)\b|\bwon['’]t\b|['’]ll\b"
ENGLISH_CERTAINTY = r"\b(?:certain to|bound to|sure to|destined|sure thing|guarantee[sd]?|certainly|surely)\b|\b(?:is|are|am|was|were|be|['’]re|['’]s) set to\b"
ENGLISH_LIKELIHOOD = r"\b(?:(?:un)?likely|(?:im)?probabl[ey]|perhaps|maybe|possibly|expects? to)\b"
ENGLISH_MARKER = re.compile("|".join((ENGLISH_MODALS, ENGLISH_CERTAINTY, ENGLISH_LIKELIHOOD)), re.IGNORECASE)
ENGLISH_NOT_MARKERS = ("free will", "no guarantee", "not guaranteed", "make sure")
ENGLISH_NOT_MARKER = re.compile(r"\b(?:" + "|".join(map(re.escape, ENGLISH_NOT_MARKERS)) + r")\b", re.IGNORECASE)
MARKER_WORDS = ("會、將、一定、肯定、勢必、保證、穩、鐵定、必、絕對、準、包賺、確定、可能、也許、或許、大概、恐怕、說不定、有望、多半 or will, 'll, "
                "going to, sure to, set to, likely, probably, perhaps, maybe, possibly")   # told to the model
# The words for predicting itself (calling the result a prediction), and their negations.
PREDICTION_WORDS = ("預測", "預計", "預估", "估計", "預期", "predict", "forecast", "foresee", "expected to")
NOT_PREDICTION_WORDS = ("不是預測", "不等於預測", "不是在預測", "不能當成預測", "並不是預測", "無法預測", "不能預測", "沒辦法預測", "你的估計", "你估計的",
                        "自己估計", "not a prediction", "not a forecast", "cannot predict", "can't predict", "does not predict")

# shape() gets only the model's answer: build_input, in the same call and thread, leaves the turn's record here
# (ask_ai always runs build_input first), the same way THINK's turns name their round.
_TURN: ContextVar[dict[str, Any] | None] = ContextVar("compute_turn", default=None)


def _guard_words(texts: list[str], persons: list[str]) -> None:
    """Refuses an answer that writes a number or calls a result a prediction. The system's own names (``_names``) may be
    quoted anywhere. ``persons``: the person's own words (question, item names, notes) -- taken out for the number check
    only (an item named 「2027 年的房租」 is not a number the AI made up); a forecast word in them is still one (Codex F5:
    an item named 「保證」 let 「保證成功」 through)."""
    names = _names()
    system, every = _quotable_words(names), _quotable_words([*names, *persons])
    for text in texts:
        plain = unicodedata.normalize("NFKC", text)
        bare = ENGLISH_IDIOM.sub(" ", IDIOM.sub(" ", _without(plain, every)))
        if ROMAN.search(text) or NUMERAL.search(bare) or ENGLISH_NUMBER.search(bare):
            raise InvariantViolation("AI_ANSWER_HAS_NUMBER: AI 寫了數字（AI 不准自己編數字），這次沒有存。")
        said = _without(plain, system).lower()
        unmarked = ENGLISH_NOT_MARKER.sub(" ", NOT_MARKER.sub(" ", said))
        for phrase in NOT_PREDICTION_WORDS:
            said = said.replace(phrase, " ")
        if MARKER.search(unmarked) or ENGLISH_MARKER.search(unmarked) or any(word in said for word in PREDICTION_WORDS):
            raise InvariantViolation("AI_ANSWER_CALLS_IT_PREDICTION: AI 把計算或模擬說成了預測或保證，這次沒有存。")


def _quotable_words(known: list[str]) -> list[str]:
    return sorted((word for word in (unicodedata.normalize("NFKC", item) for item in known if item) if _quotable(word)), key=len, reverse=True)


def _without(text: str, words: list[str]) -> str:
    for word in words:   # longest first, so a name holding a shorter one goes whole
        text = text.replace(word, " ")
    return text


def _quotable(word: str) -> bool:
    """A known word may be quoted only if it carries more than a guarded word: a person's item named 「五」 or 「會」 must not
    unlock that numeral or modal anywhere else in the answer."""
    return len(word) > 1 and any(not NUMERAL.match(char) and char not in "會將" and not char.isspace() for char in word)


def _names() -> list[str]:
    """The system's own words an answer may quote (a side reads 「一半以上的模擬…」; that is not the AI's number)."""
    words = [word for algo in algorithms().values()
             for word in (algo["name"], algo["result"]["name"], *algo["sides"], *(spec["name"] for spec in algo["inputs"]),
                          *(f"{sentence}。" for text in (algo["formula"], algo.get("assumes", "")) for sentence in text.split("。") if sentence))]
    return [*words, *SCENARIOS, *LABELS, *AI_PARTS, OWN_WORDS, NOT_PREDICTION]


# -- suggest: which algorithm fits (提出選項) ----------------------------------------------------------------------------

SUGGEST = (
    "The person wrote what they want to calculate. Suggest up to three of the algorithms listed below that fit it, by "
    "their id, each with one plain sentence on why it fits and what it would leave out. Then up to five ideas, in words "
    "only, for their 樂觀／一般／悲觀 scenarios: what could make it go better or worse. Ask at most one question.\n"
    "- Never write a number, an amount, a percentage or a range: the person picks every number and where it comes from; "
    "the system computes.\n"
    "- This is a suggestion, not the one right method; when several fit, say what each would show.\n"
    "- A calculation or simulation is not a prediction: never say what will happen, how sure or how likely it is. Do not use "
    f"{MARKER_WORDS} about any outcome; say what a calculation would show."
)
SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "algorithms": {"type": "array", "maxItems": 3, "items": {"type": "object", "properties": {"id": {"type": "string"}, "why": {"type": "string"}}, "required": ["id", "why"]}},
        "ideas": {"type": "array", "maxItems": 5, "items": {"type": "string"}},
        "question": {"type": "string"},
    },
    "required": ["algorithms"],
}


def _suggest_input(context: Mapping[str, Any], read: Read) -> str:
    question = context.get("question")
    if not isinstance(question, str) or not question.strip():
        raise InvariantViolation("COMPUTE_QUESTION_REQUIRED: 先寫下你要算什麼，AI 才建議算法。")
    question = question.strip()[:1000]
    _TURN.set({"persons": [question]})
    catalog = [{"id": algo["id"], "name": algo["name"], "label": algo["label"], "formula": algo["formula"], "inputs": [spec["name"] for spec in algo["inputs"]]}
               for algo in algorithms().values()]
    return ("What the person wants to calculate:\n" + json.dumps({"question": question}, ensure_ascii=False)
            + "\n\nThe algorithms the system can run:\n" + json.dumps(catalog, ensure_ascii=False))


def _suggest_shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn, ids = _TURN.get() or {"persons": []}, set(algorithms())
    _TURN.set(None)
    picked, seen = [], set()
    for item in answer.get("algorithms") if isinstance(answer.get("algorithms"), list) else []:
        if isinstance(item, dict) and item.get("id") in ids and item["id"] not in seen and isinstance(item.get("why"), str) and item["why"].strip():
            seen.add(item["id"])
            picked.append({"id": item["id"], "why": item["why"].strip()[:300]})
    ideas = [idea.strip() for idea in answer.get("ideas") or [] if isinstance(idea, str) and idea.strip()][:5] if isinstance(answer.get("ideas"), list) else []
    question = answer.get("question").strip()[:300] if isinstance(answer.get("question"), str) else ""
    _guard_words([item["why"] for item in picked] + ideas + [question], turn["persons"])
    return {key: value for key, value in {"algorithms": picked[:3], "ideas": ideas, "question": question}.items() if value}


# -- explain: what a run shows, in plain words (整理) --------------------------------------------------------------------

EXPLAIN = (
    "The system ran the calculation below; you did not, and you never restate, round or invent any number. Explain in "
    "plain words what it shows, as a few short points. Label each point with exactly one of these kinds: "
    + "、".join(AI_PARTS) + " (資料支持 = what a number with outside sources says; 推論 = what follows from the formula; "
    "法律／程序條件 = a rule or procedure it depends on; 價值選擇 = what depends on what the person values; 創意假設 = a "
    "guess). Put in `influential` the one input, named exactly as given, whose change moves the result most.\n"
    "- Never write a number, an amount, a percentage or a ratio: refer to inputs and results by name; the page shows "
    "every number beside your words.\n"
    f"- A calculation or a simulation is not a prediction ({NOT_PREDICTION}): a pessimistic scenario that loses money "
    "does not mean the person will lose money. Never say what will happen, how sure or how likely it is: do not use "
    f"{MARKER_WORDS} about any outcome; say what the calculation shows (「悲觀情境下的計算結果低於打平」).\n"
    "- Say which numbers are the person's own (no outside source) and which have few independent origins; the result "
    "is no surer than its least-sourced number. Never present the result as objective truth or as a recommendation."
)
EXPLAIN_SCHEMA = {
    "type": "object",
    "properties": {
        "points": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"part": {"type": "string", "enum": list(AI_PARTS)}, "text": {"type": "string"}}, "required": ["part", "text"]}},
        "influential": {"type": "string"},
    },
    "required": ["points", "influential"],
}


def _run(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    wanted = context.get("run")
    found = next((run for run in read.evidence.calcs() if run["run_id"] == wanted), None) if isinstance(wanted, str) else None
    if found is None:
        raise InvariantViolation("COMPUTE_RUN_NOT_FOUND: 找不到這次計算。")
    return found


def _explain_input(context: Mapping[str, Any], read: Read) -> str:
    run = _run(context, read)
    inputs = [item for item in run.get("inputs") or [] if isinstance(item, Mapping)]
    rows = sourcing(inputs, run["input_origins"])
    names = [item["name"] for item in inputs]
    result = run.get("result") or {}
    persons = [run.get("question") or "", result.get("who_bears") or "", *(row.get("what", "") for row in result.get("not_priced") or [])]
    _TURN.set({"run": run["run_id"], "inputs": names, "persons": [*names, *persons]})
    source = {row["input"]: row["words"] for row in rows}
    payload = {
        "question (the person's)": run.get("question"), "label": run.get("label"), "algorithm": (run.get("algorithm") or {}).get("name"),
        "formula": run.get("formula"), "inputs": [{"name": item["name"], "value": item.get("value"), "unit": item.get("unit"), "source": source.get(item["name"])} for item in inputs],
        "scenarios": run.get("scenarios"), "result": run.get("result"), "flip (the system's one-at-a-time sweep)": run.get("flip"),
        "how sure (the system's rule)": weakest(rows),
    }
    return "The calculation:\n" + json.dumps(payload, ensure_ascii=False)


def _explain_handback(context: Mapping[str, Any], read: Read) -> str | None:
    """交還控制：某個外部數字的獨立出處不到兩個時，AI 停下來。畫面顯示有幾個出處，由你決定。你自己給的數字不算。"""
    if context.get("go_on") is True:
        return None
    run = _run(context, read)
    thin = run.get("thin_inputs") or []
    if not thin:
        return None
    named = "、".join(f"「{name}」只有 {run['input_origins'].get(name, 0)} 個" for name in thin)
    return f"{named}算數的獨立出處（要 {MIN_ORIGINS} 個）。AI 先停下來，由你決定：可以先去找出處，或按「仍然繼續」。"


def _explain_shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn = _TURN.get()
    _TURN.set(None)
    if turn is None or "run" not in turn:
        raise InvariantViolation("AI_ANSWER_INVALID: the turn's run was not read before the answer")
    points = [{"part": item["part"], "text": item["text"].strip()} for item in answer.get("points") or []
              if isinstance(item, dict) and item.get("part") in AI_PARTS and isinstance(item.get("text"), str) and item["text"].strip()][:8] \
        if isinstance(answer.get("points"), list) else []
    influential = answer.get("influential").strip() if isinstance(answer.get("influential"), str) else ""
    if influential not in turn["inputs"]:
        raise InvariantViolation("AI_ANSWER_INVALID: the most influential assumption is not one of the run's inputs")
    _guard_words([item["text"] for item in points], turn["persons"])
    return {"run": turn["run"], "points": points, "influential": influential, "rests_on": turn["inputs"]}


ACTIONS = [
    AiAction(block="COMPUTE", name="suggest", needs="propose_options", instructions=SUGGEST, output_kind="compute.suggestion", output_schema=SUGGEST_SCHEMA,
             reads=(), build_input=_suggest_input, shape=_suggest_shape, max_tokens=900),
    AiAction(block="COMPUTE", name="explain", needs="organize", instructions=EXPLAIN, output_kind="compute.explanation", output_schema=EXPLAIN_SCHEMA,
             reads=READS, build_input=_explain_input, shape=_explain_shape, handback=_explain_handback, max_tokens=1400),
]
