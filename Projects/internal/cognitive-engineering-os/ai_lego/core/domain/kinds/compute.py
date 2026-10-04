"""COMPUTE 計算與模擬 (contract card): the system really runs the calculation -- formula and every input on the page, each
input with its source, a range not one number, labelled 計算結果 or 模擬結果 -- and keeps every run. The first two kinds
are shared (docs/platform/STEP2_SHARED_RULES.md §3; read through ``ai_lego.platform.evidence.calc_results``); COMPUTE
adds its own kinds below them."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.evidence_words import ADOPT, LABELS

KINDS = [
    # one calculation the system actually ran (每算一次存一筆，可以重跑)
    DocKind("compute.run", "COMPUTE", "計算", {
        "request": Field("text", 64, required=True, scan=False),    # the person's request it ran for
        "question": Field("text", 1000, scan=False),               # copied from the request (scanned there)
        "label": Field("choice", choices=LABELS, required=True, labels=LABELS),
        "algorithm": Field("json", 1000, required=True, scan=False, shape="object"),   # {"id", "version", "name"}
        "formula": Field("text", 2000, scan=False),
        "inputs": Field("json", 20000, required=True, scan=False, shape="array"),     # [{"name", "value", "unit", "cards": [card doc ids], "own": bool}]
        "scenarios": Field("json", 20000, scan=False, shape="object"),             # {"樂觀"|"一般"|"悲觀"|...: {input name: value}}
        "result": Field("json", 20000, required=True, scan=False, shape="object"),  # {"range": {"low", "high", "unit"}, "by_scenario": {...}}
        "flip": Field("json", 4000, scan=False, shape="object"),                   # {"input", "at"}: 哪一個輸入一變，結果就翻過來
        "rules": Field("json", 2000, scan=False, shape="object"),
        "rerun_of": Field("text", 64, scan=False),
    }, authors=frozenset({"system"}), deletable=False),
    # 你可以不採用結果
    DocKind("compute.adopt", "COMPUTE", "採不採用", {
        "run": Field("text", 64, required=True, scan=False),
        "adopt": Field("choice", choices=ADOPT, required=True, human_only=True, labels=ADOPT),
        "reason": Field("text", 1000, human_only=True),
    }),
    # COMPUTE's own kinds (below the shared ones).
    # 你說要算什麼、挑數字、確認每個數字從哪裡來、設情境: every number is the person's (AI 不准自己編數字), so every field is
    # theirs; saving a version makes the system run it (block_hooks/compute.py). Every version stays: a run points at it.
    DocKind("compute.request", "COMPUTE", "要算什麼", {
        "question": Field("text", 1000, required=True, human_only=True),
        "algorithm": Field("text", 40, required=True, human_only=True, scan=False),           # an id of ruleset compute.algorithms
        "inputs": Field("json", 12000, required=True, human_only=True, shape="array"),       # [{"key", "name", "value", "unit", "cards": [card ids], "own": bool}]
        "scenarios": Field("json", 8000, human_only=True, scan=False, shape="object"),       # {"樂觀"|"悲觀": {input name: value}}; 一般 = each input's value
        "not_priced": Field("json", 4000, human_only=True, shape="array"),                   # 成本效益: [{"side": NOT_PRICED_SIDES, "what"}] -- listed, never priced
        "who_bears": Field("text", 1000, human_only=True),                                     # 成本效益: 誰得到效益、誰付成本
        "from_run": Field("text", 64, human_only=True, scan=False),                            # the run this version reran or edited (its rerun_of)
    }, deletable=False),
    # AI 建議適合的算法 (propose_options): ids from the ruleset and words only -- never a number
    DocKind("compute.suggestion", "COMPUTE", "AI 建議的算法", {
        "algorithms": Field("json", 3000, required=True, shape="array"),   # [{"id", "why"}]
        "ideas": Field("list", 5),                          # 情境可以怎麼想，只有字
        "question": Field("text", 300),
    }, authors=frozenset({"ai"})),
    # AI 用白話解釋結果、指出哪一個假設最影響結果: each point says which kind of statement it is; ``run`` and ``rests_on``
    # (every input the result rests on: AI 不准把假設藏起來) are filled from the run, never by the model
    DocKind("compute.explanation", "COMPUTE", "AI 的白話解釋", {
        "run": Field("text", 64, required=True, scan=False),
        "points": Field("json", 8000, required=True, shape="array"),       # [{"part": AI_PARTS, "text"}]
        "influential": Field("text", 120, required=True),   # one input's name
        "rests_on": Field("list", 20, required=True),
    }, authors=frozenset({"ai"})),
]

SCENARIOS = ("樂觀", "一般", "悲觀")
BASE = SCENARIOS[1]
NOT_PRICED_SIDES = ("成本", "效益")
# AI 輸出要分開標示 (來源與不確定性)
AI_PARTS = ("資料支持", "推論", "法律／程序條件", "價值選擇", "創意假設")
NOT_PREDICTION = "模擬不是預測"
