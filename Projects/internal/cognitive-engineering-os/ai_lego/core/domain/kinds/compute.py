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
        "algorithm": Field("json", 1000, required=True, scan=False),   # {"id", "version", "name"}
        "formula": Field("text", 2000, scan=False),
        "inputs": Field("json", 20000, required=True, scan=False),     # [{"name", "value", "unit", "cards": [card doc ids], "own": bool}]
        "scenarios": Field("json", 20000, scan=False),              # {"樂觀"|"一般"|"悲觀"|...: {input name: value}}
        "result": Field("json", 20000, required=True, scan=False),  # {"range": {"low", "high", "unit"}, "by_scenario": {...}}
        "flip": Field("json", 4000, scan=False),                    # {"input", "at"}: 哪一個輸入一變，結果就翻過來
        "rules": Field("json", 2000, scan=False),
        "rerun_of": Field("text", 64, scan=False),
    }, authors=frozenset({"system"}), deletable=False),
    # 你可以不採用結果
    DocKind("compute.adopt", "COMPUTE", "採不採用", {
        "run": Field("text", 64, required=True, scan=False),
        "adopt": Field("choice", choices=ADOPT, required=True, human_only=True, labels=ADOPT),
        "reason": Field("text", 1000, human_only=True),
    }),
]
