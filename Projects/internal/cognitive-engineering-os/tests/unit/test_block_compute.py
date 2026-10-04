"""COMPUTE 計算與模擬: the system runs every calculation through the existing modules (never the AI, never a formula
retyped here); every input is a number with a unit and either source cards or 我自己說的; a bad number is refused in
plain words with nothing saved; a run keeps formula, inputs with sources, the result per scenario and its range, the
input that flips it, label and ruleset version; a new version reruns beside the first; 採用／不採用 once per run; the
AI suggests and explains without a number or a forecast and hands back under two independent origins."""

from __future__ import annotations

import json
import unittest
from unittest import mock

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.compute.expected_value.calculation import compute_expected_value
from ai_lego.compute.montecarlo.simulation import run_simulation
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain import evidence_words as words
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.modules.feasibility.break_even import compute_break_even_volume
from ai_lego.modules.feasibility.irr import compute_irr
from ai_lego.modules.feasibility.npv import compute_npv
from ai_lego.platform import ai_gate, evidence, integrity, rulesets
from ai_lego.platform.ai_actions import compute as compute_ai
from ai_lego.platform.block_hooks import compute
from ai_lego.platform.safety.risk import high_risk_categories
from tests.unit.test_block_decide import Provider
from tests.unit.test_step2_foundation import Step2Case

YEARLY = "之後每年的淨收入"
EXPLAINED = {"points": [{"part": "推論", "text": "悲觀情境下淨現值是負的，主要因為每年的淨收入比較低。"}], "influential": YEARLY}


def item(key, name, value, unit="元", cards=None):
    return {"key": key, "name": name, "value": value, "unit": unit, **({"cards": cards, "own": False} if cards else {"own": True})}


def flows(first, yearly, years):
    return [{"period": 0, "amount": first}] + [{"period": year, "amount": yearly} for year in range(1, years + 1)]


class RulesetTests(unittest.TestCase):
    def test_the_algorithms_a_personal_decision_needs_each_call_a_module(self):
        found = rulesets.rulesets()["compute.algorithms"]
        self.assertEqual((found.block, found.version), ("COMPUTE", "3"))
        algos = compute.algorithms()
        self.assertEqual(set(algos), {"break_even", "npv", "irr", "expected_value", "cost_benefit", "monte_carlo"})
        self.assertEqual(set(algos), set(compute.POINTS) | set(compute.SIMULATIONS))
        for algo in algos.values():
            self.assertEqual(algo["label"], words.LABELS[1] if algo["id"] in compute.SIMULATIONS else words.LABELS[0], algo["id"])
            self.assertEqual(len(algo["sides"]), 2)
            for builder, gates in algo["calls"]:
                self.assertTrue(builder.startswith("ai_lego.modules.") and callable(compute._resolve(builder)) and callable(compute._resolve(gates)), builder)

    def test_no_word_the_person_saves_with_a_request_reads_as_high_risk(self):
        """Input names and units are copied into the person's request, which GOVERN reads: the system's own labels must
        not add a guardrail to every calculation (「錢」「投資」 are 金錢 words)."""
        saved = [word for algo in compute.algorithms().values() for spec in algo["inputs"] for word in (spec["name"], algo["name"])]
        saved += [kind["unit"] for kind in compute.ruleset().items["types"].values()]
        self.assertEqual(high_risk_categories(*saved), [])

    def test_the_irr_module_solves_long_horizons(self):
        """irr.py divided by (1+r)**period, which underflowed to 0.0 at its low bound from 54 periods on; it now reads NPV's
        sign with every power at most 1. The rate it returns makes NPV zero, through the NPV module."""
        for years in (54, 60, 100):
            rate = compute_irr(flows(-1000, 100, years))
            self.assertAlmostEqual(compute_npv(flows(-1000, 100, years), rate), 0, delta=1e-3, msg=years)
        self.assertEqual(compute_irr(flows(-1000, 1200, 1)), 0.2)
        self.assertEqual(compute_irr(flows(-1000, 3e8, 100)), 300000.0)   # a huge rate over many periods no longer overflows

    def test_monte_carlo_says_it_draws_each_item_on_its_own(self):
        algo = compute.algorithms()["monte_carlo"]
        self.assertIn("每一項各抽各的，假設它們不會一起變好或變壞", algo["formula"])
        self.assertTrue(algo["assumes"].startswith("每一項各抽各的"))


class SweepTests(unittest.TestCase):
    def test_the_flip_is_the_nearest_value_on_the_other_side(self):
        side = lambda x: "above" if x > 10 else "below"   # noqa: E731
        (at, to), stop = compute._nearest_flip(side, 20.0, "above", 20.0, (None, None, False), 16, 30)
        self.assertEqual((to, stop), ("below", None))
        self.assertAlmostEqual(at, 10.0, places=4)
        self.assertEqual(compute._nearest_flip(side, 7, "below", 7, (1, 50, True), 16, 30), ((11, "above"), None))   # whole years: the first year past the line
        self.assertEqual(compute._nearest_flip(side, 40.0, "above", 5.0, (None, None, False), 16, 30), (None, None))   # beyond the reach: no flip claimed

    def test_numbers_no_module_can_compute_are_a_wall_never_a_flip(self):
        """critic M4b: past a number the modules refuse, the sweep stops that way and claims nothing."""
        walled = lambda x: None if x < 12 else ("above" if x > 10 else "below")   # noqa: E731  -- the line at 10 sits behind a wall at 12
        self.assertEqual(compute._nearest_flip(walled, 20.0, "above", 20.0, (None, None, False), 16, 30), (None, 11.25))
        inside = lambda x: None if 12 < x < 13 else ("above" if x > 10 else "below")   # noqa: E731  -- a wall met while narrowing down (first midpoint 12.5)
        self.assertEqual(compute._nearest_flip(inside, 20.0, "above", 20.0, (None, None, False), 4, 30), (None, None))

    def test_a_simulation_near_its_line_claims_no_flip(self):
        """The sweep draws fewer times; if that alone changes the side, the run says so instead of naming an input."""
        found = {"algo": compute.algorithms()["monte_carlo"], "inputs": [item("item", "接案收入", 100), item("threshold", "你要的最低結果", 100)],
                 "values": {scenario: {"接案收入": 100, "你要的最低結果": 100} for scenario in ("樂觀", "一般", "悲觀")}, "not_priced": [], "who_bears": ""}

        def fake(algo, values, found, runs, seed):
            return {"value": 100, "side": algo["sides"][0 if runs != compute.ruleset().items["sweep"]["simulation_runs"] else 1], "low": 90, "high": 110, "mean": 100, "chance": 0.9, "threshold": 100}

        with mock.patch.dict(compute.SIMULATIONS, {"monte_carlo": fake}):
            _, flip = compute.outcome(found, 1)
        self.assertEqual((flip["input"], flip["why"]), (None, compute.NEAR_LINE))

    def test_a_flip_within_two_standard_errors_of_the_line_is_too_close_to_call(self):
        """critic m2: a chance of 0.5011 over 10000 draws (standard error 0.005) names no flip; 0.52 does."""
        def found(threshold):
            values = {"樂觀": {"收入": 200, "你要的最低結果": threshold}, "一般": {"收入": 100, "你要的最低結果": threshold}, "悲觀": {"收入": 0, "你要的最低結果": threshold}}
            return {"algo": compute.algorithms()["monte_carlo"], "inputs": [item("item", "收入", 100), item("threshold", "你要的最低結果", threshold)], "values": values,
                    "not_priced": [], "who_bears": ""}
        near, flip = compute.outcome(found(101.0), 424242)
        self.assertLess(abs(near["simulation"]["chance"] - 0.5), 0.01)
        self.assertEqual((flip["input"], flip["why"]), (None, compute.NEAR_LINE))
        far, flip = compute.outcome(found(95.0), 424242)
        self.assertGreater(abs(far["simulation"]["chance"] - 0.5), 0.01)
        self.assertIsNotNone(flip["input"])


class ComputeCase(Step2Case):
    def setUp(self):
        super().setUp()
        self.provider = Provider(EXPLAINED)
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self.base = f"/projects/{self.pid}"

    def counted(self, count):
        cards = [self.card(url=f"https://example.org/{index}") for index in range(count)]
        self.group(*[[card] for card in cards])
        return cards

    def break_even(self, **scenarios):
        return {"question": "接案多少才打平", "algorithm": "break_even", "inputs": [
            item("fixed_cost", "固定成本", 60000), item("margin", "每單位的毛利", 2000), item("expected", "你預計做得到的量", 40, "件")],
            "scenarios": scenarios or {"悲觀": {"每單位的毛利": 1500}}}

    def irr(self, years=5, **scenarios):
        return {"question": "報酬率夠不夠", "algorithm": "irr", "inputs": [
            item("initial", "一開始投入的金額", 100000), item("yearly", YEARLY, 30000), item("years", "年數", years, "年"), item("hurdle", "你要求的報酬率", 10, "%")],
            "scenarios": scenarios or {"悲觀": {YEARLY: 25000}}}

    def npv(self, yearly_cards=None, yearly=30000, **over):
        return {"question": "開工作室五年划不划算", "algorithm": "npv", "inputs": [
            item("initial", "一開始投入的金額", 100000), item("yearly", YEARLY, yearly, cards=yearly_cards), item("years", "年數", 5, "年"), item("rate", "折現率", 5, "%")],
            "scenarios": {"樂觀": {YEARLY: 40000}, "悲觀": {YEARLY: 15000}}, **over}

    def post(self, content, kind="compute.request"):
        return self.client.post(f"{self.base}/docs/{kind}", json={"content": content})

    def request(self, content):
        response = self.post(content)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def runs(self):
        response = self.client.get(f"{self.base}/compute/runs")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def refused(self, content, fragment, code="COMPUTE_INPUT_REFUSED"):
        response = self.post(content)
        self.assertEqual(response.status_code, 400, response.text)
        detail = response.json()["detail"]
        self.assertTrue(detail.startswith(f"{code}: "), detail)
        self.assertIn(fragment, detail)

    def ask(self, action, **context):
        return self.client.post(f"{self.base}/ai/COMPUTE/{action}", json={"context": context})


class RequestTests(ComputeCase):
    def test_saving_a_request_runs_it_as_the_system(self):
        cards = self.counted(2)
        saved = self.request(self.npv(yearly_cards=cards))
        [run] = self.runs()
        self.assertIn({"type": "computed", "run": run["run_id"]}, saved["notices"])
        [stored] = self.docs.current(self.tenant_id, self.owner, "compute.run")
        self.assertEqual((stored["author"], stored["block"]), ("system", "COMPUTE"))
        stamp = compute.ruleset().stamp()
        self.assertEqual((run["label"], run["algorithm"], run["rules"], run["request"]), ("計算結果", {"id": "npv", "version": stamp["version"], "name": "淨現值"}, stamp, saved["doc_id"]))
        self.assertEqual(run["formula"], compute.algorithms()["npv"]["formula"])
        self.assertEqual([(entry["name"], entry["value"], entry["unit"], entry["cards"], entry["own"]) for entry in run["inputs"]],
                         [("一開始投入的金額", 100000, "元", [], True), (YEARLY, 30000, "元", cards, False), ("年數", 5, "年", [], True), ("折現率", 5, "%", [], True)])
        expected = {scenario: compute_npv(flows(-100000, yearly, 5), 0.05) for scenario, yearly in (("樂觀", 40000), ("一般", 30000), ("悲觀", 15000))}
        self.assertEqual({scenario: row["value"] for scenario, row in run["result"]["by_scenario"].items()}, expected)
        self.assertEqual(run["result"]["range"], {"low": expected["悲觀"], "high": expected["樂觀"], "unit": "元"})
        self.assertEqual([run["result"]["by_scenario"][name]["side"] for name in ("樂觀", "一般", "悲觀")], ["淨現值大於 0", "淨現值大於 0", "淨現值是 0 或更少"])
        flip = run["flip"]
        line = 100000 / compute_npv(flows(0, 1, 5), 0.05)   # the yearly amount at which NPV is 0, through the module
        self.assertEqual((flip["input"], flip["from"], flip["to"]), (YEARLY, "淨現值大於 0", "淨現值是 0 或更少"))
        self.assertAlmostEqual(flip["at"], line, delta=0.01)
        self.assertLessEqual(compute_npv(flows(-100000, flip["at"], 5), 0.05), 0)
        self.assertEqual(len(flip["each"]), 4)

    def test_every_algorithm_runs_through_its_module(self):
        self.request(self.break_even())
        self.request(self.irr())
        self.request({"question": "這個案子平均起來賺不賺", "algorithm": "expected_value", "inputs": [
            item("p_good", "好的情況的機率", 30, "%"), item("v_good", "好的情況的金額", 100000), item("p_mid", "普通情況的機率", 50, "%"),
            item("v_mid", "普通情況的金額", 10000), item("p_bad", "壞的情況的機率", 20, "%"), item("v_bad", "壞的情況的金額", -120000)],
            "scenarios": {"悲觀": {"壞的情況的金額": -150000}}})
        self.request({"question": "換工作值不值得", "algorithm": "cost_benefit", "inputs": [
            item("one_time_cost", "一開始的成本", 50000), item("yearly_cost", "每年的成本", 10000), item("yearly_benefit", "每年的效益", 25000),
            item("years", "年數", 5, "年"), item("rate", "折現率", 3, "%")], "scenarios": {"悲觀": {"每年的效益": 20000}},
            "not_priced": [{"side": "效益", "what": "每天多一小時陪家人"}], "who_bears": "我得到效益，家人分擔家務"})
        self.request({"question": "拆夥後六個月的收入", "algorithm": "monte_carlo", "inputs": [
            item("item", "接案收入", 300000), item("item", "房租", -90000), item("threshold", "你要的最低結果", 150000)],
            "scenarios": {"樂觀": {"接案收入": 420000, "房租": -90000}, "悲觀": {"接案收入": 120000, "房租": -100000}}})
        by_id = {run["algorithm"]["id"]: run for run in self.runs()}
        base = lambda run: run["result"]["by_scenario"]["一般"]   # noqa: E731
        self.assertEqual(base(by_id["break_even"])["value"], compute_break_even_volume(60000, 2000))
        self.assertEqual(base(by_id["irr"])["value"], round(compute_irr(flows(-100000, 30000, 5)) * 100, 6))
        self.assertEqual(base(by_id["expected_value"])["value"], compute_expected_value([
            {"probability": 0.3, "outcome_value": 100000}, {"probability": 0.5, "outcome_value": 10000}, {"probability": 0.2, "outcome_value": -120000}]))
        cba = base(by_id["cost_benefit"])
        self.assertEqual((cba["benefits_now"], cba["costs_now"]), (compute_npv(flows(0, 25000, 5), 0.03), compute_npv(flows(50000, 10000, 5), 0.03)))
        self.assertEqual(by_id["cost_benefit"]["result"]["not_priced"], [{"side": "效益", "what": "每天多一小時陪家人"}])
        simulated = by_id["monte_carlo"]
        self.assertEqual(simulated["label"], "模擬結果")
        drawn = simulated["result"]["simulation"]
        replay = run_simulation([{"distribution_type": "triangular", "params": {"min": 120000, "max": 420000, "mode": 300000}},
                                 {"distribution_type": "triangular", "params": {"min": -100000, "max": -90000, "mode": -90000}}],
                                "sum", drawn["seed"], drawn["runs"], success_threshold=150000, success_direction="at_least")
        spread = {row["p"]: row["value"] for row in replay["outcome_distribution"]["percentiles"]}
        self.assertEqual((simulated["result"]["range"]["low"], drawn["value"], simulated["result"]["range"]["high"], drawn["chance"]),
                         (spread[5], spread[50], spread[95], replay["success_probability"]))   # the stored seed replays the same draws

    def test_the_number_is_the_modules_never_one_computed_here(self):
        with mock.patch("ai_lego.modules.feasibility.npv.compute_npv", return_value=123.0):
            self.request(self.npv())
        [run] = self.runs()
        self.assertEqual({row["value"] for row in run["result"]["by_scenario"].values()}, {123.0})

    def test_a_record_the_modules_own_gates_fail_is_refused(self):
        failed = [{"gate_id": "npv_content_integrity", "status": "FAIL", "evidence": [], "validator": "x", "timestamp": "x"}]
        with mock.patch("ai_lego.modules.feasibility.npv.evaluate_npv_gates", return_value=failed):
            self.refused(self.npv(), "一般情境：算出來的結果沒有通過這個算法自己的檢查，這次不算。")
        self.assertEqual(self.docs.current(self.tenant_id, self.owner, "compute.run"), [])

    def test_a_bad_number_is_refused_in_plain_words_and_nothing_is_saved(self):
        case_card = self.counted(1)
        def npv_with(index, **change):
            content = self.npv()
            content["inputs"][index] = {**content["inputs"][index], **change}
            return content
        self.refused(npv_with(1, value="三萬"), f"「{YEARLY}」要填一個數字")
        self.refused(npv_with(1, value=True), f"「{YEARLY}」要填一個數字")
        self.refused(npv_with(1, unit=" "), f"「{YEARLY}」要寫單位")
        self.refused(npv_with(1, unit="美元"), "金額要用同一種單位")
        self.refused(npv_with(3, unit="趴"), "「折現率」的單位是「%」")
        self.refused(npv_with(1, own=None), words.OWN_WORDS)
        self.refused(npv_with(1, own=True, cards=case_card), "就不能同時選來源卡")
        self.refused(npv_with(1, own=False, cards=[]), "要選至少一張來源卡")
        self.refused(npv_with(1, own=False, cards=["not-in-this-case"]), "選的來源卡不在這個案子裡")
        self.refused(npv_with(2, value=101), "「年數」不能大於 100")
        self.refused(npv_with(2, value=2.5), "「年數」要是整數")
        self.refused(npv_with(3, value=-100), "「折現率」不能小於 -99")
        self.refused(npv_with(0, value=-1), "「一開始投入的金額」不能小於 0")
        self.refused(npv_with(0, key="hurdle", name="你要求的報酬率"), "不是淨現值要用的數字")
        self.refused(npv_with(0, name="本金"), "不是淨現值這一版的輸入名稱")
        content = self.npv()
        self.refused({**content, "inputs": content["inputs"][1:]}, "少了「一開始投入的金額」")
        self.refused({**content, "inputs": content["inputs"] + [content["inputs"][0]]}, "出現了兩次")
        self.refused({**content, "scenarios": {"一般": {YEARLY: 1}}}, "情境只有樂觀和悲觀兩種")
        self.refused({**content, "scenarios": {"悲觀": {"房租": 1}}}, "悲觀情境裡的「房租」不是這次要用的數字")
        self.refused({**content, "scenarios": {"悲觀": {"年數": 160}}}, "悲觀情境的「年數」不能大於 100")
        self.refused({**content, "who_bears": "我"}, "只有成本效益會用到")
        self.refused({"question": "平均起來", "algorithm": "expected_value", "inputs": [
            item("p_good", "好的情況的機率", 30, "%"), item("v_good", "好的情況的金額", 1), item("p_mid", "普通情況的機率", 50, "%"),
            item("v_mid", "普通情況的金額", 1), item("p_bad", "壞的情況的機率", 10, "%"), item("v_bad", "壞的情況的金額", 1)],
            "scenarios": {"悲觀": {"壞的情況的金額": 0}}}, "一般情境：三個機率加起來要剛好是 100%")
        self.refused({"question": "成本效益", "algorithm": "cost_benefit", "inputs": [
            item("one_time_cost", "一開始的成本", 1), item("yearly_cost", "每年的成本", 1), item("yearly_benefit", "每年的效益", 1), item("years", "年數", 1, "年"), item("rate", "折現率", 3, "%")],
            "scenarios": {"悲觀": {"每年的效益": 0}}}, "誰得到效益、誰付成本")
        self.refused({**content, "scenarios": {}}, compute.NO_RANGE)   # critic M3: a range, never one number
        self.refused(self.break_even(悲觀={"你預計做得到的量": 30}), "「你預計做得到的量」只是拿來比的線，不算。")   # a comparison line feeds no number
        self.refused(self.irr(悲觀={"你要求的報酬率": 15}), "「你要求的報酬率」只是拿來比的線，不算。")
        self.refused({**content, "scenarios": {"樂觀": {YEARLY: 30000}}}, compute.NO_RANGE)   # equal to 一般 is no scenario
        self.refused({**npv_with(1, unit="元\u200b")}, f"「{YEARLY}」要寫單位")
        simulation = {"question": "六個月", "algorithm": "monte_carlo", "inputs": [item("item", "接案收入", 300000), item("threshold", "你要的最低結果", 1)]}
        self.refused(simulation, compute.NO_SPREAD)
        self.refused({**simulation, "inputs": [item("item", "收\u0001入", 1), item("threshold", "你要的最低結果", 1)], "scenarios": {"悲觀": {"收\u0001入": 0}}}, "不含看不見的字元")
        self.refused({**simulation, "scenarios": {"樂觀": {"接案收入": 200000}, "悲觀": {"接案收入": 250000}}}, "「接案收入」的一般值要在樂觀和悲觀之間")
        self.refused({**simulation, "scenarios": {"悲觀": {"你要的最低結果": 0}}}, "「你要的最低結果」不分情境")
        self.refused({**simulation, "inputs": simulation["inputs"][1:]}, "少了「要加起來的一項」")
        self.refused({"question": "x", "algorithm": "astrology", "inputs": []}, "不在清單裡", code="COMPUTE_ALGORITHM_UNKNOWN")
        self.refused({"question": "x", "algorithm": ["npv"], "inputs": []}, "不在清單裡", code="COMPUTE_ALGORITHM_UNKNOWN")   # raw content: never a 500
        self.refused(npv_with(0, key=["initial"]), "不是淨現值要用的數字")
        self.assertEqual((self.docs.current(self.tenant_id, self.owner, "compute.request"), self.docs.current(self.tenant_id, self.owner, "compute.run")), ([], []))

    def test_only_the_person_writes_a_request_and_only_the_system_a_run(self):
        request, run = doc_kinds.require("compute.request"), doc_kinds.require("compute.run")
        self.assertEqual((request.authors, request.deletable, run.authors, run.deletable), (frozenset({"user"}), False, frozenset({"system"}), False))
        self.assertTrue(all(field.human_only for field in request.fields.values()))
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("compute.request", self.npv(), "ai")
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            self.docs.save(self.tenant_id, self.owner, "compute.run", {"request": "r", "label": "計算結果", "algorithm": {"id": "npv"}, "inputs": [{"name": "x"}], "result": {"range": {"low": 1}}},
                           record_log.ai("COMPUTE"))

    def test_a_new_version_is_a_rerun_beside_the_first_and_the_algorithm_can_change(self):
        first = self.request(self.npv())
        changed = self.client.put(f"{self.base}/docs/compute.request/{first['doc_id']}", json={"content": self.npv(yearly=20000), "base_version": 1})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.client.put(f"{self.base}/docs/compute.request/{first['doc_id']}", json={"content": self.irr(), "base_version": 2}).status_code, 200)
        one, two, three = self.runs()
        self.assertEqual((one.get("rerun_of"), two["rerun_of"], three["rerun_of"]), (None, one["run_id"], two["run_id"]))
        self.assertEqual([run["algorithm"]["id"] for run in (one, two, three)], ["npv", "npv", "irr"])
        self.assertEqual(one["inputs"][1]["value"], 30000)   # every run stays as it was
        self.assertEqual(self.client.delete(f"{self.base}/docs/compute.request/{first['doc_id']}").status_code, 400)

    def test_one_live_adopt_per_run_with_a_reason(self):
        self.request(self.npv())
        [run] = self.runs()
        self.assertIn("COMPUTE_ADOPT_REASON_REQUIRED", self.post({"run": run["run_id"], "adopt": "採用"}, "compute.adopt").text)
        first = self.post({"run": run["run_id"], "adopt": "採用", "reason": "數字有出處"}, "compute.adopt")
        self.assertEqual(first.status_code, 200, first.text)
        second = self.post({"run": run["run_id"], "adopt": "不採用", "reason": "改變主意"}, "compute.adopt")
        self.assertEqual((second.status_code, second.json()["detail"].split(":")[0]), (409, "COMPUTE_ADOPT_ALREADY_GIVEN"))
        doc_id = first.json()["doc_id"]
        edited = self.client.put(f"{self.base}/docs/compute.adopt/{doc_id}", json={"content": {"run": run["run_id"], "adopt": "不採用", "reason": "收入太樂觀"}, "base_version": 1})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(self.runs()[0]["adopt"], {"adopt": "不採用", "reason": "收入太樂觀"})
        self.assertEqual(self.post({"run": "no-such-run", "adopt": "採用", "reason": "x"}, "compute.adopt").status_code, 404)
        self.request(self.npv(yearly=1))
        other = self.runs()[1]["run_id"]
        moved = self.client.put(f"{self.base}/docs/compute.adopt/{doc_id}", json={"content": {"run": other, "adopt": "採用", "reason": "x"}, "base_version": 2})
        self.assertIn("COMPUTE_ADOPT_RUN_FIXED", moved.text)
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("compute.adopt", {"run": run["run_id"], "adopt": "採用"}, "ai")

    def test_a_crisis_word_brings_help_and_a_high_risk_word_a_guardrail(self):
        self.assertEqual(self.request(self.npv(question="算完我就不想活了"))["notices"][0]["type"], "crisis")
        notices = self.request(self.npv(question="要不要請律師先看合約再算"))["notices"]
        self.assertIn("guardrail", [notice["type"] for notice in notices])

    def test_a_colleague_reaches_none_of_it(self):
        self.request(self.npv())
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"{self.base}/compute/runs").status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/docs/compute.request").status_code, 404)
        self.assertEqual(self.ask("explain", run="x").status_code, 404)

    def test_the_page_never_stores_the_persons_numbers_as_a_source(self):
        """STEP2_SHARED_RULES §4: the person's own words stay in the block's kinds, never POST /sources."""
        page = (PRODUCT_ROOT / "apps" / "cognitive-web" / "components" / "blocks" / "ComputePage.tsx").read_text(encoding="utf-8")
        self.assertNotIn("/sources", page)
        self.assertNotIn("<select", page)


class SourcingTests(ComputeCase):
    def test_the_result_is_no_surer_than_its_weakest_number(self):
        self.request(self.npv(yearly_cards=self.counted(2)))
        [run] = self.runs()
        self.assertEqual(run["thin_inputs"], [])   # the person's own numbers are never thin
        self.assertEqual(run["weakest"], f"結果不會比最弱的那個數字更可靠。最弱的是「一開始投入的金額」：{words.OWN_WORDS}。")
        self.assertEqual({row["input"]: (row["own"], row["origins"]) for row in run["sourcing"]}[YEARLY], (False, 2))
        all_sourced = self.npv(yearly_cards=self.counted(2))
        for entry in all_sourced["inputs"]:
            entry.update({"own": False, "cards": all_sourced["inputs"][1]["cards"]})
        self.request(all_sourced)
        self.assertTrue(self.runs()[1]["weakest"].startswith("每個數字都有至少 2 個獨立出處"))

    def test_the_count_shown_is_the_one_evidence_hands_back_on(self):
        """input_origins reads evidence.origins; under MIN_ORIGINS it must name exactly calc_results' thin_inputs."""
        a, b = self.card(source_id="s1", url="https://a"), self.card(source_id="s1", url="https://a")   # one stored page: one origin
        self.group([a], [b])
        self.request(self.npv(yearly_cards=[a, b]))
        [run] = self.runs()
        self.assertEqual((run["thin_inputs"], run["input_origins"]), ([YEARLY], {YEARLY: 1}))   # counted once, in evidence.calc_results
        self.assertEqual(sorted(name for name, count in run["input_origins"].items() if count < words.MIN_ORIGINS), run["thin_inputs"])
        self.request(self.npv(yearly_cards=self.counted(2)))
        self.assertEqual(self.runs()[1]["input_origins"], {YEARLY: 2})
        self.assertIn(f"最弱的是「一開始投入的金額」", run["weakest"])
        self.assertIn("只有 1 個算數的獨立出處（要 2 個）", {row["input"]: row["words"] for row in run["sourcing"]}[YEARLY])


class AiTests(ComputeCase):
    def run_id(self, content=None):
        self.request(content or self.npv())
        return self.runs()[-1]["run_id"]

    def test_explain_hands_back_under_two_origins_before_any_model_call(self):
        run = self.run_id(self.npv(yearly_cards=self.counted(1)))
        back = self.ask("explain", run=run)
        self.assertEqual(back.status_code, 200, back.text)
        self.assertEqual(back.json(), {"handback": f"「{YEARLY}」只有 1 個算數的獨立出處（要 2 個）。AI 先停下來，由你決定：可以先去找出處，或按「仍然繼續」。"})
        self.assertEqual(self.provider.calls, [])
        went_on = self.ask("explain", run=run, go_on=True)
        self.assertEqual((went_on.status_code, len(self.provider.calls)), (200, 1), went_on.text)
        self.assertIn("只有 1 個算數的獨立出處（要 2 個）", self.provider.calls[0][1])   # the AI is told each number's source, from calc_results

    def test_own_numbers_never_hand_back(self):
        self.assertIn("saved", self.ask("explain", run=self.run_id()).json())

    def test_the_explanation_rests_on_every_input_whatever_the_model_says(self):
        run = self.run_id()
        self.provider.answer = {**EXPLAINED, "rests_on": ["運氣"], "run": "another-run"}
        saved = self.ask("explain", run=run).json()["saved"]
        self.assertEqual((saved["author"], saved["content"]["run"], saved["content"]["rests_on"]), ("ai", run, ["一開始投入的金額", YEARLY, "年數", "折現率"]))
        self.assertEqual(saved["content"]["points"], EXPLAINED["points"])
        self.assertIn("模擬不是預測", self.provider.calls[0][0])
        self.provider.answer = {**EXPLAINED, "influential": "運氣"}
        self.assertIn("AI_ANSWER_INVALID", self.ask("explain", run=run).text)

    def test_a_number_or_a_forecast_from_the_ai_is_not_saved(self):
        run = self.run_id()
        for text, code in (("淨現值大約是 3 萬，還不錯。", "AI_ANSWER_HAS_NUMBER"), ("悲觀時會少五萬元。", "AI_ANSWER_HAS_NUMBER"), ("折現率高兩成就不划算。", "AI_ANSWER_HAS_NUMBER"),
                           ("報酬大概 15%。", "AI_ANSWER_HAS_NUMBER"), ("依這個結果預測你會賺。", "AI_ANSWER_CALLS_IT_PREDICTION"), ("這樣一定會賺。", "AI_ANSWER_CALLS_IT_PREDICTION")):
            self.provider.answer = {**EXPLAINED, "points": [{"part": "推論", "text": text}]}
            response = self.ask("explain", run=run)
            self.assertEqual(response.status_code, 502, text)
            self.assertTrue(response.json()["detail"].startswith(code), text)
        self.assertEqual(self.docs.current(self.tenant_id, self.owner, "compute.explanation"), [])
        self.provider.answer = {**EXPLAINED, "points": [{"part": "推論", "text": "模擬不是預測，悲觀情境不一定會發生；千萬不要只看一個數。"}]}
        self.assertIn("saved", self.ask("explain", run=run).json())

    def test_a_name_the_person_gave_may_be_quoted_even_with_digits(self):
        run = self.run_id({"question": "2027 年撐不撐得住", "algorithm": "monte_carlo", "inputs": [
            item("item", "2027 年房租", -120000), item("item", "接案收入", 300000), item("threshold", "你要的最低結果", 100000)],
            "scenarios": {"樂觀": {"接案收入": 400000}, "悲觀": {"接案收入": 200000, "2027 年房租": -150000}}})
        self.provider.answer = {"points": [{"part": "創意假設", "text": "「2027 年房租」漲多少，是你自己估的。"}], "influential": "接案收入"}
        self.assertIn("saved", self.ask("explain", run=run).json())

    def test_suggest_needs_propose_options_and_names_only_listed_algorithms(self):
        self.assertEqual(self.ask("suggest", question="拆夥後六個月的收入").status_code, 403)
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["propose_options"]}})
        self.assertIn("COMPUTE_QUESTION_REQUIRED", self.ask("suggest", question=" ").text)
        self.provider.answer = {"algorithms": [{"id": "monte_carlo", "why": "收入每個月不一樣，模擬看得到範圍。"}, {"id": "astrology", "why": "x"}, {"id": "monte_carlo", "why": "again"}],
                                "ideas": ["悲觀時：大客戶不續約"], "question": "你最擔心哪一項？"}
        saved = self.ask("suggest", question="拆夥後六個月的收入").json()["saved"]
        self.assertEqual(saved["content"]["algorithms"], [{"id": "monte_carlo", "why": "收入每個月不一樣，模擬看得到範圍。"}])
        self.provider.answer = {"algorithms": [{"id": "npv", "why": "每年大概 30 萬，五年。"}]}
        self.assertIn("AI_ANSWER_HAS_NUMBER", self.ask("suggest", question="拆夥後六個月的收入").text)

    def test_the_ai_reads_only_this_calculation_and_the_source_cards(self):
        """讀什麼：GATHER 的來源卡、你給的數字；絕不讀跟這次計算無關的個人資料."""
        actions = [action for (block, _), action in ai_gate.actions().items() if block == "COMPUTE"]
        self.assertEqual(sorted(action.name for action in actions), ["explain", "suggest"])
        for action in actions:
            self.assertLessEqual(set(action.reads), {"compute.run", "compute.request", "gather.source"}, action.name)
            with self.assertRaisesRegex(InvariantViolation, "AI_READ_REFUSED"):
                ai_gate._Reader(action, self.docs, self.tenant_id, self.owner)("sense.card")
        self.docs.save(self.tenant_id, self.owner, "sense.card", {"category": "感受", "text": "我其實很怕跟他談"}, record_log.user(self.identity["identity_id"], "SENSE"))
        self.ask("explain", run=self.run_id())
        self.assertNotIn("很怕跟他談", self.provider.calls[0][1])


class AnswerTests(ComputeCase):
    """critic M4a: a module refusal that is itself an answer is a result with no number, never a reason to refuse."""

    def test_a_pessimistic_scenario_that_never_breaks_even_is_saved_as_its_answer(self):
        self.request(self.break_even(悲觀={"每單位的毛利": -10}))
        [run] = self.runs()
        never = run["result"]["by_scenario"]["悲觀"]
        self.assertEqual((never["value"], never["side"], never["words"]), (None, "做得到的量不夠打平", "每單位的毛利是 0 或負的：做越多賠越多，永遠打不平。"))
        self.assertEqual(run["result"]["range"]["low"], run["result"]["range"]["high"])   # the two scenarios with a number
        self.assertTrue(all(entry.get("to") != "算不出來" for entry in run["flip"]["each"]))

    def test_no_inflow_never_meets_the_hurdle_and_no_outlay_always_does(self):
        self.request(self.irr(悲觀={YEARLY: -5000}, 樂觀={"一開始投入的金額": 0}))
        by = self.runs()[0]["result"]["by_scenario"]
        self.assertEqual((by["悲觀"]["value"], by["悲觀"]["side"]), (None, "沒達到你要求的報酬率"))
        self.assertEqual((by["樂觀"]["value"], by["樂觀"]["side"]), (None, "達到你要求的報酬率"))
        self.assertIsInstance(by["一般"]["value"], float)

    def test_a_margin_swept_to_zero_stays_on_its_side_instead_of_flipping_to_uncomputable(self):
        found = compute.plan({**self.break_even(悲觀={"每單位的毛利": 900}), "inputs": [
            item("fixed_cost", "固定成本", 60000), item("margin", "每單位的毛利", 1000), item("expected", "你預計做得到的量", 20, "件")]}, None)
        _, flip = compute.outcome(found, 1)
        margin = next(entry for entry in flip["each"] if entry["input"] == "每單位的毛利")
        self.assertIsNone(margin["at"])   # 0 means 永遠打不平: still 不夠打平, the side it started on
        self.assertEqual(flip["input"], "固定成本")

    def test_irr_runs_past_the_old_fifty_year_cap(self):
        self.request(self.irr(years=60))
        self.assertIsInstance(self.runs()[0]["result"]["by_scenario"]["一般"]["value"], float)


class RerunTests(ComputeCase):
    def test_a_rerun_names_the_run_it_started_from(self):
        """critic M5: rerunning run 1 after run 2 is a rerun of run 1, with run 1's numbers (the page sends them)."""
        first = self.request(self.npv())
        self.client.put(f"{self.base}/docs/compute.request/{first['doc_id']}", json={"content": self.npv(yearly=20000), "base_version": 1})
        one, two = self.runs()
        again = self.client.put(f"{self.base}/docs/compute.request/{first['doc_id']}", json={"content": {**self.npv(), "from_run": one["run_id"]}, "base_version": 2})
        self.assertEqual(again.status_code, 200, again.text)
        three = self.runs()[2]
        self.assertEqual((three["rerun_of"], three["inputs"][1]["value"], two["rerun_of"]), (one["run_id"], 30000, one["run_id"]))
        unknown = self.client.put(f"{self.base}/docs/compute.request/{first['doc_id']}", json={"content": {**self.npv(), "from_run": "no-such-run"}, "base_version": 3})
        self.assertEqual((unknown.status_code, unknown.json()["detail"].split(":")[0]), (404, "COMPUTE_RUN_NOT_FOUND"))

    def test_the_save_never_leaves_a_request_without_its_run(self):
        """critic m3: what BEFORE_SAVE checked is not checked again after the save (a card gone since must not refuse)."""
        content = self.npv(yearly_cards=["a-card-this-case-no-longer-has"])
        notices = compute._request_saved(self.docs, self.tenant_id, self.owner, {"doc_id": "Q-after", "version": 1, "content": content})
        self.assertEqual([notice["type"] for notice in notices], ["computed"])
        self.assertEqual([run["content"]["request"] for run in self.docs.current(self.tenant_id, self.owner, "compute.run")], ["Q-after"])


class SimulationTests(ComputeCase):
    def test_a_simulation_shows_its_assumption_and_every_item_at_its_own_ends(self):
        """critic M6: the band assumes the items move on their own; beside it, all at 悲觀 and all at 樂觀, summed by the module."""
        self.request({"question": "拆夥後六個月的收入", "algorithm": "monte_carlo", "inputs": [
            item("item", "接案收入", 300000), item("item", "房租", -90000), item("threshold", "你要的最低結果", 150000)],
            "scenarios": {"樂觀": {"接案收入": 420000, "房租": -80000}, "悲觀": {"接案收入": 120000, "房租": -100000}}})
        drawn = self.runs()[0]["result"]["simulation"]
        self.assertEqual(drawn["assumes"], compute.algorithms()["monte_carlo"]["assumes"])
        self.assertEqual(drawn["every"], {"樂觀": 340000, "悲觀": 20000})

    def test_long_names_on_every_item_still_fit_the_run(self):
        """The flip field holds 4000 bytes: six items with sixty-character names and the threshold still save a run."""
        names = ["收" * 59 + chr(0x4E00 + index) for index in range(6)]
        self.request({"question": "六個月", "algorithm": "monte_carlo", "inputs": [item("item", name, 100000 * (index + 1)) for index, name in enumerate(names)]
                      + [item("threshold", "你要的最低結果", 1234567)], "scenarios": {"樂觀": {name: 150000 * (index + 1) for index, name in enumerate(names)},
                                                                          "悲觀": {name: 50000 * (index + 1) for index, name in enumerate(names)}}})
        flip = self.runs()[0]["flip"]
        self.assertLess(len(json.dumps(flip, ensure_ascii=False).encode("utf-8")), 4000)


class RawBodyTests(ComputeCase):
    """critic m1 and probe_api: numbers JSON can carry that Python cannot hold as a float."""

    def raw(self, body):
        return self.client.post(f"{self.base}/docs/compute.request", content=body, headers={"content-type": "application/json"})

    def test_a_huge_whole_number_or_nan_is_refused_in_words_never_a_500(self):
        content = self.npv()
        content["inputs"][2]["value"] = 777777
        response = self.raw(json.dumps({"content": content}).replace("777777", "1" + "0" * 400))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("「年數」不能大於 100", response.json()["detail"])
        content = self.npv()
        content["scenarios"] = {"悲觀": {"年數": 777777}}
        response = self.raw(json.dumps({"content": content}, ensure_ascii=False).replace("777777", "1" + "0" * 400))
        self.assertIn("悲觀情境的「年數」不能大於 100", response.json()["detail"])
        response = self.raw(json.dumps({"content": self.npv()}).replace('"value": 30000', '"value": NaN'))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn(f"「{YEARLY}」要填一個數字", response.json()["detail"])

    def test_an_adopt_naming_a_list_is_not_found_never_a_500(self):
        self.assertEqual(self.post({"run": ["x"], "adopt": "採用", "reason": "x"}, "compute.adopt").status_code, 404)


# critic M1/M2 corpora: what an AI answer may not say, and plain sentences it may.
WRITES_A_NUMBER = ["大約第七年才回本。", "五年後淨現值轉正。", "要撐三個月。", "撐一個月就好。", "十五年", "收入少掉三分之一就不划算。", "打七折就虧。", "虧損上百萬。",
                   "大概一半的機會。", "差了好幾萬", "兩倍", "八成", "第二年", "每年四次", "十分鐘後", "淨現值大約是 3 萬", "報酬大概 15%", "Ⅻ", "①", "５", "壹萬",
                   "廿年後", "卅年", "卌", "about ten percent lower", "roughly five million", "IRR is twenty", "half of it", "double the rent", "the first year",
                   "a third of it", "the fifth scenario", "two fifths of the income"]
# critic M2 round 2: the outcome verb is open-ended, the future marker is not
FORECASTS = ["悲觀情境下你會虧錢。", "這樣做會賺。", "you'll lose money", "it'll pay off", "你會虧", "這個結果很可能會發生", "未來會虧", "估計會虧損", "預估明年會賺",
             "預計會賺", "將會虧本", "依這個結果預測你會賺。", "這樣一定會賺。", "保證回本", "撐得下去是必然的", "you won't lose", "it is bound to work", "will lose money",
             "you are going to profit", "I foresee a loss"]
PLAIN = ["悲觀情境下淨現值是負的，主要因為每年的淨收入比較低。", "模擬不是預測，悲觀情境不一定會發生；千萬不要只看一個數。", "這一項是你自己估的，還沒有外部出處。",
         "一般情境和樂觀情境落在同一邊，只有悲觀情境不一樣。", "這個結果不保證發生，也無法預測未來。", "每一項各抽各的，假設它們不會一起變好或變壞。",
         "一半以上的模擬達到你要的最低結果。", "十分依賴每年的淨收入這一個數字。", "悲觀情境下的計算結果低於打平。",
         "one of the inputs is your own guess, not a prediction"]
# the allow-listed modal words in sentences an explanation could really say
MODAL_WORDS_IN_USE = ["這個數字還有機會找到別的出處。", "會計上怎麼記，要問專業的人。", "工會或公會的公告，可以當成來源卡。", "社會上的看法，屬於價值選擇。",
                      "將來每年的淨收入，是你自己估的。", "在一定程度上，結果取決於每年的淨收入。", "如果有誤會，可以改輸入再算。", "開會之前可以先並排比。",
                      "悲觀情境不代表一定會發生。", "free will is not part of this calculation", "there is no guarantee here"]


class AnswerWordsTests(unittest.TestCase):
    def test_every_way_of_writing_a_number_is_refused(self):
        for text in WRITES_A_NUMBER:
            with self.subTest(text=text), self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_HAS_NUMBER"):
                compute_ai._guard_words([text], compute_ai._names())

    def test_every_way_of_saying_what_will_happen_is_refused(self):
        for text in FORECASTS:
            with self.subTest(text=text), self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_CALLS_IT_PREDICTION"):
                compute_ai._guard_words([text], compute_ai._names())

    def test_plain_sentences_and_their_negations_pass(self):
        for text in PLAIN + MODAL_WORDS_IN_USE:
            with self.subTest(text=text):
                compute_ai._guard_words([text], compute_ai._names())

    def test_every_word_on_the_modal_allow_list_is_one_where_it_marks_no_future(self):
        """Each allowed word is decided here, apart from the code's list: dropping one from the code turns its case red,
        adding one to the code without deciding it here fails the comparison."""
        allowed = ("機會", "社會", "會議", "會計", "協會", "學會", "公會", "工會", "委員會", "會員", "體會", "誤會", "理會", "開會", "聚會", "約會", "會談",
                   "會面", "會合", "會場", "會長", "研討會", "大會", "國會", "議會", "領會", "將近", "將軍", "將就", "將來", "不一定", "不一定會", "不等於一定會",
                   "不代表一定會", "不代表會", "不保證", "無法保證", "不能保證", "沒有保證", "不必然", "不肯定", "一定程度", "free will", "no guarantee", "not guaranteed")
        self.assertEqual(set(allowed), set(compute_ai.NOT_MARKERS + compute_ai.ENGLISH_NOT_MARKERS))
        for word in allowed:
            with self.subTest(word=word):
                compute_ai._guard_words([f"這裡說的是「{word}」這個詞。"], [])

    def test_a_persons_name_never_unlocks_a_numeral_or_a_modal_elsewhere(self):
        """critic M1 round 2: an item named 「五」 is quoted as itself, but 「五」 written anywhere else is still a number."""
        for text, name in (("大概是五倍", "五"), ("少了五萬", "五萬"), ("少了十二", "12")):
            with self.subTest(name=name), self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_HAS_NUMBER"):
                compute_ai._guard_words([text], [name])
        with self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_CALLS_IT_PREDICTION"):
            compute_ai._guard_words(["這會讓結果變"], ["會"])
        compute_ai._guard_words(["「2027 年房租」是你估的，「五月房租」也是。"], ["2027 年房租", "五月房租"])


class IntegrityTests(unittest.TestCase):
    def test_compute_passes_the_integrity_check(self):
        row = next(row for row in integrity.run() if row.block == "COMPUTE")
        self.assertTrue(row.built)
        self.assertEqual(row.failures, [])


if __name__ == "__main__":
    unittest.main()
