"""COMPUTE's rules (算法): which calculations the system runs, each with its formula in words, its inputs (name, unit,
range), the module it calls and its label -- versioned, so every run says which version of the rules it used.

Every algorithm calls an existing module's builder and that module's own gates (``calls`` = [builder, gates] pairs,
resolved by ``block_hooks/compute.py``): the formula lives in the module, never here. 年數 stops at 100 because the
system builds one cash flow per year. v2: 蒙地卡羅 says it draws each item on its own (no item moves with another)."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

_FEAS = "ai_lego.modules.feasibility"
BREAK_EVEN = [f"{_FEAS}.break_even.generate_break_even_analysis", f"{_FEAS}.break_even.evaluate_break_even_gates"]
NPV = [f"{_FEAS}.npv.generate_npv_analysis", f"{_FEAS}.npv.evaluate_npv_gates"]
IRR = [f"{_FEAS}.irr.generate_irr_analysis", f"{_FEAS}.irr.evaluate_irr_gates"]
CBA = [f"{_FEAS}.cost_benefit_analysis.generate_cost_benefit_analysis", f"{_FEAS}.cost_benefit_analysis.evaluate_cost_benefit_analysis_gates"]
EV = ["ai_lego.modules.decision.expected_value.generate_expected_value_record", "ai_lego.modules.decision.expected_value.evaluate_expected_value_gates"]
MONTE_CARLO = ["ai_lego.modules.computation.monte_carlo.generate_monte_carlo_simulation", "ai_lego.modules.computation.monte_carlo.evaluate_monte_carlo_gates"]

RATE_HINT = "把以後的金額換成今天的價值時，每年打的折扣。不知道的話，可以先用銀行定存的利率。"
YEARS = {"key": "years", "name": "年數", "type": "years"}
RATE = {"key": "rate", "name": "折現率", "type": "percent", "min": -99, "max": 1000, "hint": RATE_HINT}

ITEMS = {
    # what each kind of input is: its unit (fixed or the person's), its range
    "types": {
        "money": {"unit": "元", "fixed_unit": False, "same_unit": True, "max": 1e12},
        "count": {"unit": "件", "fixed_unit": False, "min": 0, "max": 1e12},
        "percent": {"unit": "%", "fixed_unit": True},
        "years": {"unit": "年", "fixed_unit": True, "integer": True, "min": 1, "max": 100},
    },
    # 哪一個輸入一變，結果就翻過來: one input at a time, from its 一般 value up and down by as much as itself (or as far
    # as its 樂觀/悲觀), in ``steps`` steps each way, then narrowed down ``narrow`` times; a simulation redraws at every
    # step, so it takes fewer steps and fewer draws
    "sweep": {"steps": 16, "narrow": 20, "simulation_runs": 2000, "simulation_steps": 4, "simulation_narrow": 14},
    "simulation_runs": 10000,
    "algorithms": [
        {
            "id": "break_even", "name": "損益平衡", "label": "計算結果", "calls": [BREAK_EVEN],
            "formula": "要做到的量 = 固定成本 ÷ 每單位的毛利。要做到的量不超過你預計做得到的量，就打得平。",
            "result": {"name": "要做到的量", "unit": "expected"},
            "sides": ["做得到的量夠打平", "做得到的量不夠打平"],
            "inputs": [
                {"key": "fixed_cost", "name": "固定成本", "type": "money", "min": 0, "hint": "不管做多少都要付的，例如房租、月費。"},
                {"key": "margin", "name": "每單位的毛利", "type": "money", "hint": "每做一單位，售價減掉這一單位的成本。"},
                {"key": "expected", "name": "你預計做得到的量", "type": "count"},
            ],
        },
        {
            "id": "npv", "name": "淨現值", "label": "計算結果", "calls": [NPV],
            "formula": "淨現值 = 每一年的淨收入 ÷（1 + 折現率）的「第幾年」次方，從第 1 年加到最後一年，再減掉一開始投入的金額。",
            "result": {"name": "淨現值", "unit": "money"},
            "sides": ["淨現值大於 0", "淨現值是 0 或更少"],
            "inputs": [
                {"key": "initial", "name": "一開始投入的金額", "type": "money", "min": 0},
                {"key": "yearly", "name": "之後每年的淨收入", "type": "money", "hint": "每年收進來的減掉每年付出去的；會虧就寫負的。"},
                YEARS, RATE,
            ],
        },
        {
            "id": "irr", "name": "內部報酬率", "label": "計算結果", "calls": [IRR],
            "formula": "內部報酬率 = 讓淨現值剛好等於 0 的那個折現率（系統一步一步試出來）。不低於你要求的報酬率，就算達到。",
            "result": {"name": "內部報酬率", "unit": "%"},
            "sides": ["達到你要求的報酬率", "沒達到你要求的報酬率"],
            "inputs": [
                {"key": "initial", "name": "一開始投入的金額", "type": "money", "min": 0},
                {"key": "yearly", "name": "之後每年的淨收入", "type": "money", "hint": "每年收進來的減掉每年付出去的。"},
                YEARS,
                {"key": "hurdle", "name": "你要求的報酬率", "type": "percent", "min": -99, "max": 1000, "hint": "低於這個，你就覺得不值得。"},
            ],
        },
        {
            "id": "expected_value", "name": "期望值", "label": "計算結果", "calls": [EV],
            "formula": "期望值 = 好的機率 × 好的金額 + 普通的機率 × 普通的金額 + 壞的機率 × 壞的金額。三個機率加起來要是 100%。",
            "result": {"name": "期望值", "unit": "money"},
            "sides": ["期望值大於 0", "期望值是 0 或更少"],
            "inputs": [
                {"key": "p_good", "name": "好的情況的機率", "type": "percent", "min": 0, "max": 100, "sweep": "機率要三個一起加到 100%，不能只改一個。"},
                {"key": "v_good", "name": "好的情況的金額", "type": "money"},
                {"key": "p_mid", "name": "普通情況的機率", "type": "percent", "min": 0, "max": 100, "sweep": "機率要三個一起加到 100%，不能只改一個。"},
                {"key": "v_mid", "name": "普通情況的金額", "type": "money"},
                {"key": "p_bad", "name": "壞的情況的機率", "type": "percent", "min": 0, "max": 100, "sweep": "機率要三個一起加到 100%，不能只改一個。"},
                {"key": "v_bad", "name": "壞的情況的金額", "type": "money", "hint": "會虧就寫負的。"},
            ],
        },
        {
            "id": "cost_benefit", "name": "成本效益", "label": "計算結果", "calls": [CBA, NPV],
            "formula": "淨效益 = 每年效益的現值 −（一開始的成本 + 每年成本的現值）。現值 = 那一年的金額 ÷（1 + 折現率）的「第幾年」次方。換不成金額的東西另外列出來，不硬算成價格。",
            "result": {"name": "淨效益", "unit": "money"},
            "sides": ["淨效益大於 0", "淨效益是 0 或更少"],
            "extras": ["not_priced", "who_bears"],
            "inputs": [
                {"key": "one_time_cost", "name": "一開始的成本", "type": "money", "min": 0},
                {"key": "yearly_cost", "name": "每年的成本", "type": "money", "min": 0},
                {"key": "yearly_benefit", "name": "每年的效益", "type": "money", "min": 0},
                YEARS, RATE,
            ],
        },
        {
            "id": "monte_carlo", "name": "蒙地卡羅", "label": "模擬結果", "calls": [MONTE_CARLO],
            "formula": "每一項在悲觀和樂觀之間隨機抽一個數（越接近一般的值越常抽到），全部加起來。這樣抽 10000 次，看結果落在哪裡。每一項各抽各的，假設它們不會一起變好或變壞。模擬不是預測。",
            "assumes": "每一項各抽各的，假設它們不會一起變好或變壞。真的會一起變的話，結果會比這個範圍更散。",
            "result": {"name": "加起來的結果", "unit": "money"},
            "sides": ["一半以上的模擬達到你要的最低結果", "不到一半的模擬達到你要的最低結果"],
            "inputs": [
                {"key": "item", "name": "要加起來的一項", "type": "money", "repeat": [1, 6], "spread": True,
                 "hint": "自己取名字。收進來的寫正的，付出去的寫負的；樂觀和悲觀是它可能落在的兩端。"},
                {"key": "threshold", "name": "你要的最低結果", "type": "money", "scenarios": False},
            ],
        },
    ],
}

RULESETS = [Ruleset("compute.algorithms", "COMPUTE", "算法", "2", "平台（第 2 步）", ITEMS)]
HISTORY = {"compute.algorithms": {"1": "3552fa2b8bae", "2": "505cca86a1d2"}}
