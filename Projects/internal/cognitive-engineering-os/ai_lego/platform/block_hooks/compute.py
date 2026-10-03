"""COMPUTE 計算與模擬 (contract card 「系統做什麼」): the system really runs the calculation; the AI never writes a number.

- BEFORE_SAVE ``compute.request``: every input is a number in its range with a unit (one unit for every amount) and
  either names the case's source cards or is marked 我自己說的; then every scenario is computed once, so a number the
  module cannot work with (每單位的毛利是 0 以下…) refuses the whole request in plain words (COMPUTE_INPUT_REFUSED) --
  never a half result.
- AFTER_SAVE ``compute.request``: the system runs it and saves ``compute.run`` (author system): formula, every input
  with its source, the result per scenario and the range, the input whose change flips the result (one at a time),
  label, ruleset stamp. A new version of the request is a new run with ``rerun_of``.
- BEFORE_SAVE ``compute.adopt``: one live 採用／不採用 per run, with a reason; the page edits the first.

The formulas are the modules' (ruleset ``compute.algorithms`` names each one's [builder, gates]); this file arranges
the person's numbers into the module's arguments and reads its answer, and the module's own gates check every record.
"""

from __future__ import annotations

import hashlib
import importlib
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import ADOPT, LABELS, MIN_ORIGINS, OWN_WORDS
from ai_lego.core.domain.kinds.compute import AI_PARTS, BASE, NOT_PREDICTION, NOT_PRICED_SIDES, SCENARIOS
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import evidence
from ai_lego.platform.rulesets import Ruleset, require

RULESET = "compute.algorithms"
UNCOMPUTABLE = "算不出來"
OTHERS = tuple(name for name in SCENARIOS if name != BASE)   # set beside each input; 一般 is the input's own value
INPUT_KEYS = {"key", "name", "value", "unit", "cards", "own"}
MAX_CARDS, NAME_CHARS, UNIT_CHARS, NOT_PRICED_MAX, WHAT_CHARS = 12, 60, 20, 10, 200
SENSITIVITY = "系統一次改一個輸入，找出讓結果翻過來的那一個。"
NO_FLIP = "每一個數字單獨往上、往下改（改到跟它本身一樣大，或到你給的樂觀、悲觀那麼遠），結果都沒有翻過來。"
ZERO_SPAN = "這個數字是 0，也沒有樂觀、悲觀的值，不知道要改多少。"
NEAR_LINE = "結果離那條線太近：光是隨機抽的不同，就可能讓它翻過來。"
CALCULATED = make_provenance("CALCULATED_RESULT", "HUMAN_APPROVED")   # the person's numbers, the module's formula
SIMULATED = make_provenance("SIMULATED_RESULT", "HUMAN_APPROVED")

# A module's refusal, in what it means for the person's numbers (the modules' codes: modules/feasibility/*.py,
# modules/decision/expected_value.py, compute/montecarlo/simulation.py).
MODULE_WORDS = {
    "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN": "每單位的毛利是 0 或負的：做越多賠越多，永遠打不平。",
    "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS": "要有一開始投入的金額，之後每年的淨收入也要是正的，才算得出內部報酬率。",
    "IRR_NO_SOLUTION_FOUND": "這組數字找不到內部報酬率。",
    "IRR_DID_NOT_CONVERGE": "這組數字找不到內部報酬率。",
    "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE": "三個機率加起來要剛好是 100%。",
    "EXPECTEDVALUE_SUM_OVERFLOW": "數字太大，算不出來。",
}


class Refused(Exception):
    """A module could not compute with these numbers; the message is in the person's words."""


def ruleset() -> Ruleset:
    return require(RULESET)


def algorithms() -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in ruleset().items["algorithms"]}


def _refuse(words: str) -> None:
    raise InvariantViolation(f"COMPUTE_INPUT_REFUSED: {words}")


# -- the request as the system runs it --------------------------------------------------------------------------------

def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and value not in (float("inf"), float("-inf"))


def _bounds(spec: Mapping[str, Any], kind: Mapping[str, Any]) -> tuple[float | None, float | None, bool]:
    upper = spec.get("max", kind.get("max"))
    lower = spec.get("min", kind.get("min", -upper if upper is not None else None))
    return lower, upper, bool(kind.get("integer"))


def _shown(number: float) -> str:
    return f"{int(number):,}" if float(number).is_integer() else f"{number:g}"


def _value(name: str, value: Any, spec: Mapping[str, Any], kind: Mapping[str, Any], where: str = "") -> float:
    lower, upper, integer = _bounds(spec, kind)
    if not _number(value):
        _refuse(f"{where}「{name}」要填一個數字。")
    if integer and float(value) != int(value):
        _refuse(f"{where}「{name}」要是整數。")
    if lower is not None and value < lower:
        _refuse(f"{where}「{name}」不能小於 {_shown(lower)}。")
    if upper is not None and value > upper:
        _refuse(f"{where}「{name}」不能大於 {_shown(upper)}。")
    return int(value) if integer else value


def _input(item: Any, specs: Mapping[str, Mapping[str, Any]], types: Mapping[str, Any], cards: set[str], algorithm: str) -> dict[str, Any]:
    if not isinstance(item, Mapping) or set(item) - INPUT_KEYS:
        _refuse("有一個數字的格式不對，請重新整理頁面再試一次。")
    spec = specs.get(item.get("key")) if isinstance(item.get("key"), str) else None   # raw content: BEFORE_SAVE runs before the kind's own checks
    shown = item.get("name") if isinstance(item.get("name"), str) and item.get("name").strip() else "（沒有名字）"
    if spec is None:
        _refuse(f"「{shown}」不是{algorithm}要用的數字。")
    kind = types[spec["type"]]
    if spec.get("repeat"):
        name = item.get("name").strip() if isinstance(item.get("name"), str) else ""
        if not name or len(name) > NAME_CHARS:
            _refuse(f"每一項要有名字，最多 {NAME_CHARS} 個字。")
    else:
        name = spec["name"]
        if item.get("name") != name:   # the system's word for a fixed input; a stale page is told, never guessed at
            _refuse(f"「{shown}」不是{algorithm}這一版的輸入名稱，請重新整理頁面。")
    value = _value(name, item.get("value"), spec, kind)
    unit = item.get("unit").strip() if isinstance(item.get("unit"), str) else ""
    if not unit or len(unit) > UNIT_CHARS:
        _refuse(f"「{name}」要寫單位，最多 {UNIT_CHARS} 個字。")
    if kind.get("fixed_unit") and unit != kind["unit"]:
        _refuse(f"「{name}」的單位是「{kind['unit']}」。")
    own, picked = item.get("own"), item.get("cards") or []
    if not isinstance(own, bool):
        _refuse(f"「{name}」要選來源卡，或標「{OWN_WORDS}」。")
    if own and picked:
        _refuse(f"「{name}」標了「{OWN_WORDS}」，就不能同時選來源卡。")
    if not own:
        if not isinstance(picked, list) or not picked or any(not isinstance(card, str) for card in picked) or len(set(picked)) != len(picked):
            _refuse(f"「{name}」要選至少一張來源卡（不重複），或標「{OWN_WORDS}」。")
        if len(picked) > MAX_CARDS:
            _refuse(f"「{name}」最多選 {MAX_CARDS} 張來源卡。")
        if set(picked) - cards:
            _refuse(f"「{name}」選的來源卡不在這個案子裡。")
    return {"key": spec["key"], "name": name, "value": value, "unit": unit, "cards": [] if own else list(picked), "own": own}


def plan(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: Mapping[str, Any]) -> dict[str, Any]:
    """The request as the system runs it: the algorithm, the inputs (each with its source) and every scenario's values.
    Anything a page could send wrong is refused here in the person's words, before anything is saved."""
    algo = algorithms().get(content.get("algorithm")) if isinstance(content.get("algorithm"), str) else None
    if algo is None:
        raise InvariantViolation("COMPUTE_ALGORITHM_UNKNOWN: 這個算法不在清單裡，請從清單裡選。")
    types = ruleset().items["types"]
    specs = {spec["key"]: spec for spec in algo["inputs"]}
    raw = content.get("inputs")
    if not isinstance(raw, list) or not raw:
        _refuse("還沒有填任何數字。")
    cards = {card["card"] for origin in evidence.origins(docs, tenant_id, owner, with_reviews=False) for card in origin["cards"]}
    inputs = [_input(item, specs, types, cards, algo["name"]) for item in raw]
    names = [item["name"] for item in inputs]
    if len(set(names)) != len(names):
        _refuse(f"「{next(name for name in names if names.count(name) > 1)}」出現了兩次，每個數字的名字要不一樣。")
    for spec in algo["inputs"]:
        count = sum(item["key"] == spec["key"] for item in inputs)
        low, high = spec.get("repeat") or (1, 1)
        if count < low:
            _refuse(f"少了「{spec['name']}」。")
        if count > high:
            _refuse(f"「{spec['name']}」最多 {high} 項。" if spec.get("repeat") else f"「{spec['name']}」出現了兩次。")
    units = {item["unit"] for item in inputs if types[specs[item["key"]]["type"]].get("same_unit")}
    if len(units) > 1:
        _refuse(f"同一個算式裡的金額要用同一種單位，現在有：{'、'.join(sorted(units))}。")

    values = {BASE: {item["name"]: item["value"] for item in inputs}}
    scenarios = content.get("scenarios") or {}
    if not isinstance(scenarios, Mapping) or set(scenarios) - set(OTHERS):
        _refuse(f"情境只有{'和'.join(OTHERS)}兩種；{BASE}就是你填的數字。")
    by_name = {item["name"]: item for item in inputs}
    for scenario in OTHERS:
        given = scenarios.get(scenario) or {}
        if not isinstance(given, Mapping):
            _refuse(f"{scenario}情境的格式不對，請重新整理頁面再試一次。")
        values[scenario] = dict(values[BASE])
        for name, value in given.items():
            item = by_name.get(name)
            if item is None:
                _refuse(f"{scenario}情境裡的「{name}」不是這次要用的數字。")
            spec = specs[item["key"]]
            if spec.get("scenarios") is False:
                _refuse(f"「{name}」不分情境，只填一個數字。")
            values[scenario][name] = _value(name, value, spec, types[spec["type"]], f"{scenario}情境的")
    for item in inputs:
        if specs[item["key"]].get("spread"):
            low, high = sorted(values[scenario][item["name"]] for scenario in OTHERS)
            if not low <= item["value"] <= high:
                _refuse(f"「{item['name']}」的{BASE}值要在{'和'.join(OTHERS)}之間。")

    extras = set(algo.get("extras") or ())
    not_priced, who_bears = content.get("not_priced"), content.get("who_bears")
    if (not_priced or who_bears) and not extras:
        _refuse(f"只有成本效益會用到「換不成金額的東西」和「誰得到效益、誰付成本」；{algo['name']}不用填。")
    if "who_bears" in extras and not (isinstance(who_bears, str) and who_bears.strip()):
        _refuse("成本效益要寫：誰得到效益、誰付成本。")
    rows = not_priced or []
    if not isinstance(rows, list) or len(rows) > NOT_PRICED_MAX or any(
            not isinstance(row, Mapping) or set(row) != {"side", "what"} or row["side"] not in NOT_PRICED_SIDES
            or not isinstance(row["what"], str) or not row["what"].strip() or len(row["what"]) > WHAT_CHARS for row in rows):
        _refuse(f"換不成金額的東西，最多 {NOT_PRICED_MAX} 項，每項標{'或'.join(NOT_PRICED_SIDES)}、寫一句（最多 {WHAT_CHARS} 字）。")
    return {"algo": algo, "inputs": inputs, "values": values, "not_priced": [dict(row) for row in rows], "who_bears": (who_bears or "").strip()}


# -- the modules ------------------------------------------------------------------------------------------------------

def _resolve(path: str) -> Callable[..., Any]:
    module, _, name = path.rpartition(".")
    return getattr(importlib.import_module(module), name)


def _record(pair: list[str], **arguments: Any) -> dict[str, Any]:
    """The module's record for these numbers, passed through the module's own gates."""
    builder, gates = _resolve(pair[0]), _resolve(pair[1])
    try:
        record = builder(**arguments)
    except InvariantViolation as error:
        raise Refused(MODULE_WORDS.get(str(error).split(":", 1)[0], "這組數字算不出來。")) from error
    except ArithmeticError as error:   # a float that overflows or underflows inside the module's own arithmetic
        raise Refused("數字太大或太小，算不出來。") from error
    if not importlib.import_module(pair[0].rpartition(".")[0]).all_gates_pass(gates(record, "COMPUTE", "compute")):
        raise Refused("算出來的結果沒有通過這個算法自己的檢查，這次不算。")
    return record


def _flows(first: float, yearly: float, years: int) -> list[dict[str, Any]]:
    return [{"period": 0, "amount": first}] + [{"period": year, "amount": yearly} for year in range(1, years + 1)]


def _side(algo: Mapping[str, Any], first: bool) -> str:
    return algo["sides"][0 if first else 1]


def _break_even(algo: Mapping[str, Any], v: Mapping[str, Any], found: Mapping[str, Any]) -> dict[str, Any]:
    record = _record(algo["calls"][0], record_id="BEVEN-compute", subject_ref="COMPUTE", fixed_cost=v["fixed_cost"],
                     contribution_margin_per_unit=v["margin"], provenance=CALCULATED)
    volume = record["break_even_volume_units"]
    return {"value": volume, "side": _side(algo, volume <= v["expected"])}


def _npv(algo: Mapping[str, Any], v: Mapping[str, Any], found: Mapping[str, Any]) -> dict[str, Any]:
    record = _record(algo["calls"][0], record_id="NPV-compute", subject_ref="COMPUTE", cash_flows=_flows(-v["initial"], v["yearly"], v["years"]),
                     discount_rate=v["rate"] / 100, provenance=CALCULATED)
    return {"value": record["npv"], "side": _side(algo, record["npv"] > 0)}


def _irr(algo: Mapping[str, Any], v: Mapping[str, Any], found: Mapping[str, Any]) -> dict[str, Any]:
    record = _record(algo["calls"][0], record_id="IRR-compute", subject_ref="COMPUTE", cash_flows=_flows(-v["initial"], v["yearly"], v["years"]),
                     hurdle_rate=v["hurdle"] / 100, provenance=CALCULATED)
    return {"value": round(record["irr"] * 100, 6), "side": _side(algo, record["meets_hurdle"])}


def _expected_value(algo: Mapping[str, Any], v: Mapping[str, Any], found: Mapping[str, Any]) -> dict[str, Any]:
    states = [{"id": state, "label": state, "probability": v[f"p_{state}"] / 100, "outcome_value": v[f"v_{state}"]} for state in ("good", "mid", "bad")]
    record = _record(algo["calls"][0], record_id="EXPECTEDVALUE-compute", decision_subject="COMPUTE", states=states, provenance=CALCULATED)
    return {"value": record["expected_value"], "side": _side(algo, record["expected_value"] > 0)}


def _cost_benefit(algo: Mapping[str, Any], v: Mapping[str, Any], found: Mapping[str, Any]) -> dict[str, Any]:
    """The cost-benefit module keeps what cannot be priced unpriced and asks who bears what; NPV gives today's value
    of the benefits and of the costs."""
    priced = lambda key, words: {"id": key, "description": words, "value": v[key], "non_monetizable": False}   # noqa: E731
    unpriced = [{"id": f"not_priced_{index}", "description": row["what"], "value": None, "non_monetizable": True, "side": row["side"]}
                for index, row in enumerate(found["not_priced"])]
    side_of = lambda side: [{key: row[key] for key in ("id", "description", "value", "non_monetizable")} for row in unpriced if row["side"] == side]   # noqa: E731
    rate = v["rate"] / 100
    _record(algo["calls"][0], record_id="CBA-compute", provenance=CALCULATED, alternatives=[{
        "id": "COMPUTE", "costs": [priced("one_time_cost", "一開始的成本"), priced("yearly_cost", "每年的成本"), *side_of(NOT_PRICED_SIDES[0])],
        "benefits": [priced("yearly_benefit", "每年的效益"), *side_of(NOT_PRICED_SIDES[1])],
        "discount_rate": rate, "sensitivity_analysis": SENSITIVITY, "distributional_effects": found["who_bears"]}])
    benefits = _record(algo["calls"][1], record_id="NPV-benefits", subject_ref="COMPUTE", cash_flows=_flows(0, v["yearly_benefit"], v["years"]),
                       discount_rate=rate, provenance=CALCULATED)["npv"]
    costs = _record(algo["calls"][1], record_id="NPV-costs", subject_ref="COMPUTE", cash_flows=_flows(v["one_time_cost"], v["yearly_cost"], v["years"]),
                    discount_rate=rate, provenance=CALCULATED)["npv"]
    net = round(benefits - costs, 8)
    return {"value": net, "side": _side(algo, net > 0), "benefits_now": benefits, "costs_now": costs}


def _monte_carlo(algo: Mapping[str, Any], values: Mapping[str, Mapping[str, Any]], found: Mapping[str, Any], runs: int, seed: int) -> dict[str, Any]:
    """Each item drawn between its 悲觀 and 樂觀 values (most often near 一般), summed, ``runs`` times."""
    items = [item["name"] for item in found["inputs"] if item["key"] == "item"]
    threshold = next(values[BASE][item["name"]] for item in found["inputs"] if item["key"] == "threshold")
    distributions = []
    for index, name in enumerate(items):
        low, high = sorted(values[scenario][name] for scenario in OTHERS)
        distributions.append({"id": f"item-{index}", "label": name, "distribution_type": "triangular", "params": {"min": low, "max": high, "mode": values[BASE][name]}})
    record = _record(algo["calls"][0], simulation_id=f"MC-{seed}", input_distributions=distributions, random_seed=seed, num_runs=runs,
                     sensitivity_notes=SENSITIVITY, provenance=SIMULATED, success_threshold=threshold, success_direction="at_least")
    spread = {item["p"]: item["value"] for item in record["outcome_distribution"]["percentiles"]}
    chance = record["success_probability"]
    return {"value": spread[50], "side": _side(algo, chance >= 0.5), "low": spread[5], "high": spread[95], "mean": record["outcome_distribution"]["mean"],
            "chance": chance, "threshold": threshold}


POINTS = {"break_even": _break_even, "npv": _npv, "irr": _irr, "expected_value": _expected_value, "cost_benefit": _cost_benefit}
SIMULATIONS = {"monte_carlo": _monte_carlo}


def _point(found: Mapping[str, Any], values: Mapping[str, Any]) -> dict[str, Any]:
    keyed = {item["key"]: values[item["name"]] for item in found["inputs"]}
    return POINTS[found["algo"]["id"]](found["algo"], keyed, found)


def check(found: Mapping[str, Any]) -> None:
    """Every scenario computed once before anything is saved: a refusal names the scenario and says why."""
    algo = found["algo"]
    if algo["id"] in SIMULATIONS:   # a simulation draws from all three scenarios at once
        try:
            SIMULATIONS[algo["id"]](algo, found["values"], found, 100, 0)
        except Refused as refused:
            _refuse(str(refused))
        return
    for scenario in (BASE, *OTHERS):
        try:
            _point(found, found["values"][scenario])
        except Refused as refused:
            _refuse(f"{scenario}情境：{refused}")


# -- 哪一個輸入一變，結果就翻過來 ----------------------------------------------------------------------------------------

def _nearest_flip(side_of: Callable[[float], str], base: float, base_side: str, span: float, bounds: tuple[float | None, float | None, bool],
                  steps: int, narrow: int) -> tuple[float, str] | None:
    """From ``base`` outward each way in ``steps`` steps up to ``span``; at the first step whose side differs, narrow
    down between it and the step before. Returns the first value on the other side nearest to ``base``, and that side."""
    lower, upper, integer = bounds
    best: tuple[float, str] | None = None
    for direction in (-1, 1):
        previous = base
        for step in range(1, steps + 1):
            x = base + direction * span * step / steps
            x = round(x) if integer else x
            x = max(x, lower) if lower is not None else x
            x = min(x, upper) if upper is not None else x
            if x == previous:
                continue
            side = side_of(x)
            if side == base_side:
                previous = x
                continue
            near, far, far_side = previous, x, side
            for _ in range(narrow if not integer else 64):
                if integer and abs(far - near) <= 1:
                    break
                middle = (near + far) // 2 if integer else (near + far) / 2
                middle_side = side_of(middle)
                if middle_side == base_side:
                    near = middle
                else:
                    far, far_side = middle, middle_side
            if best is None or abs(far - base) < abs(best[0] - base):
                best = (far if integer else round(far, 8), far_side)
            break
    return best


def _sweep(found: Mapping[str, Any], side_at: Callable[[str, float], str], base_side: str, steps: int, narrow: int) -> dict[str, Any]:
    algo, types = found["algo"], ruleset().items["types"]
    specs = {spec["key"]: spec for spec in algo["inputs"]}
    each, scale = [], {}
    for item in found["inputs"]:
        spec, name = specs[item["key"]], item["name"]
        base = found["values"][BASE][name]
        if isinstance(spec.get("sweep"), str):
            each.append({"input": name, "base": base, "at": None, "why": spec["sweep"]})
            continue
        span = max([abs(base)] + [abs(found["values"][scenario][name] - base) for scenario in OTHERS])
        if span == 0:
            each.append({"input": name, "base": base, "at": None, "why": ZERO_SPAN})
            continue
        flipped = _nearest_flip(lambda x, name=name: side_at(name, x), base, base_side, span, _bounds(spec, types[spec["type"]]), steps, narrow)
        scale[name] = abs(base) or span
        each.append({"input": name, "base": base, "at": flipped[0], "to": flipped[1], "change": round((flipped[0] - base) / abs(base), 4) if base else None}
                    if flipped else {"input": name, "base": base, "at": None})
    flips = [entry for entry in each if entry.get("at") is not None]
    if not flips:
        return {"input": None, "from": base_side, "why": NO_FLIP, "each": each}
    nearest = min(flips, key=lambda entry: abs(entry["at"] - entry["base"]) / scale[entry["input"]])
    return {**{key: nearest[key] for key in ("input", "base", "at", "to", "change")}, "from": base_side, "each": each}


def outcome(found: Mapping[str, Any], seed: int) -> tuple[dict[str, Any], dict[str, Any]]:
    """(result, flip) of a checked request: the result per scenario and its range (a simulation: the middle 90% of its
    draws), and the one input whose change alone flips which side of the line the result falls on."""
    algo, items = found["algo"], ruleset().items
    specs, unit_of = {spec["key"]: spec for spec in algo["inputs"]}, algo["result"]["unit"]
    money = next((item["unit"] for item in found["inputs"] if items["types"][specs[item["key"]]["type"]].get("same_unit")), None)
    unit = money if unit_of == "money" else next((item["unit"] for item in found["inputs"] if item["key"] == unit_of), unit_of)
    result: dict[str, Any] = {"what": algo["result"]["name"], "unit": unit, "sides": algo["sides"]}
    sweep = items["sweep"]
    if algo["id"] in SIMULATIONS:
        simulate = SIMULATIONS[algo["id"]]
        draws = items["simulation_runs"]
        drawn = simulate(algo, found["values"], found, draws, seed)
        result.update({"range": {"low": drawn["low"], "high": drawn["high"], "unit": unit},
                       "simulation": {"runs": draws, "seed": seed, **{key: drawn[key] for key in ("value", "mean", "chance", "threshold", "side")}}})

        def side_at(name: str, x: float) -> str:
            # a number moves as a whole: its three scenario values shift together (one without scenarios has three equal ones)
            shift = x - found["values"][BASE][name]
            moved = {scenario: {**found["values"][scenario], name: found["values"][scenario][name] + shift} for scenario in SCENARIOS}
            try:
                return simulate(algo, moved, found, sweep["simulation_runs"], seed)["side"]
            except Refused:
                return UNCOMPUTABLE

        # the sweep redraws at every step, so it draws fewer times; where that alone changes the side, no flip is claimed
        if simulate(algo, found["values"], found, sweep["simulation_runs"], seed)["side"] != drawn["side"]:
            return result, {"input": None, "from": drawn["side"], "why": NEAR_LINE, "each": []}
        return result, _sweep(found, side_at, drawn["side"], sweep["simulation_steps"], sweep["simulation_narrow"])
    by_scenario = {scenario: _point(found, found["values"][scenario]) for scenario in SCENARIOS}
    numbers = [row["value"] for row in by_scenario.values()]
    result.update({"range": {"low": min(numbers), "high": max(numbers), "unit": unit}, "by_scenario": by_scenario})
    if found["not_priced"] or found["who_bears"]:
        result.update({"not_priced": found["not_priced"], "who_bears": found["who_bears"]})

    def side_at(name: str, x: float) -> str:
        try:
            return _point(found, {**found["values"][BASE], name: x})["side"]
        except Refused:
            return UNCOMPUTABLE

    return result, _sweep(found, side_at, by_scenario[BASE]["side"], sweep["steps"], sweep["narrow"])


# -- where each number comes from ---------------------------------------------------------------------------------------

def input_origins(found: list[dict[str, Any]], inputs: list[Mapping[str, Any]]) -> dict[str, int]:
    """How many counted independent origins back each outside number (``evidence.origins``' counting, read, never
    redone); the person's own numbers have none. Under MIN_ORIGINS here is ``calc_results()[].thin_inputs``."""
    origin_of = {card["card"]: origin["origin_id"] for origin in found for card in origin["cards"]}
    counted = {origin["origin_id"] for origin in found if origin["counts"]}
    return {item["name"]: len({origin_of[card] for card in item.get("cards") or [] if origin_of.get(card) in counted})
            for item in inputs if isinstance(item, Mapping) and not item.get("own")}


def sourcing(inputs: list[Mapping[str, Any]], counts: Mapping[str, int]) -> list[dict[str, Any]]:
    rows = []
    for item in inputs:
        if item.get("own"):
            rows.append({"input": item["name"], "own": True, "origins": 0, "words": OWN_WORDS})
            continue
        count = counts.get(item["name"], 0)
        words = f"有 {count} 個獨立出處" if count >= MIN_ORIGINS else f"只有 {count} 個算數的獨立出處（要 {MIN_ORIGINS} 個）"
        rows.append({"input": item["name"], "own": False, "origins": count, "words": words})
    return rows


def weakest(rows: list[Mapping[str, Any]]) -> str:
    """結果的可信度，不會高過輸入的來源: the result is said to stand no higher than its least-sourced number."""
    if not rows:
        return ""
    first = min(rows, key=lambda row: (not row["own"], row["origins"]))
    if not first["own"] and first["origins"] >= MIN_ORIGINS:
        return f"每個數字都有至少 {MIN_ORIGINS} 個獨立出處。結果還是建立在這些數字和公式上，不等於確定。"
    return f"結果不會比最弱的那個數字更可靠。最弱的是「{first['input']}」：{first['words']}。"


def case_runs(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> list[dict[str, Any]]:
    """Every run of the case as ``evidence.calc_results`` gives it, with where each number comes from and the sentence
    that keeps the result no surer than its weakest number."""
    found = evidence.origins(docs, tenant_id, owner, with_reviews=False)
    out = []
    for run in evidence.calc_results(docs, tenant_id, owner, found):
        rows = sourcing(run.get("inputs") or [], input_origins(found, run.get("inputs") or []))
        out.append({**run, "sourcing": rows, "weakest": weakest(rows)})
    return out


def spec() -> dict[str, Any]:
    """What the page shows and offers: the ruleset (its version and who keeps it), the words, the scenarios."""
    found = ruleset()
    return {"ruleset": {**found.stamp(), "title": found.title, "maintainer": found.maintainer}, "types": found.items["types"],
            "algorithms": found.items["algorithms"], "scenarios": list(SCENARIOS), "base": BASE, "own_words": OWN_WORDS, "min_origins": MIN_ORIGINS,
            "labels": list(LABELS), "adopt": list(ADOPT), "parts": list(AI_PARTS), "not_priced_sides": list(NOT_PRICED_SIDES),
            "not_prediction": NOT_PREDICTION, "uncomputable": UNCOMPUTABLE}


# -- the hooks ----------------------------------------------------------------------------------------------------------

def _request_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    check(plan(docs, tenant_id, owner, content))


def _request_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    found = plan(docs, tenant_id, owner, doc["content"])
    seed = int(hashlib.sha256(f"{doc['doc_id']}:{doc['version']}".encode("utf-8")).hexdigest()[:8], 16)   # replayable, stored with the run
    result, flip = outcome(found, seed)
    stamp, algo = ruleset().stamp(), found["algo"]
    content = {"request": doc["doc_id"], "question": doc["content"]["question"], "label": algo["label"],
               "algorithm": {"id": algo["id"], "version": stamp["version"], "name": algo["name"]}, "formula": algo["formula"],
               "inputs": found["inputs"], "scenarios": found["values"], "result": result, "flip": flip, "rules": stamp}
    earlier = [run for run in docs.current(tenant_id, owner, "compute.run") if run["content"].get("request") == doc["doc_id"]]
    if earlier:
        content["rerun_of"] = earlier[-1]["doc_id"]
    saved = docs.save(tenant_id, owner, "compute.run", content, record_log.system("COMPUTE"))
    return [{"type": "computed", "run": saved["doc_id"]}]


def _adopt_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    run = content.get("run")
    if run not in {doc["doc_id"] for doc in docs.current(tenant_id, owner, "compute.run")}:
        raise InvariantViolation("COMPUTE_RUN_NOT_FOUND: 找不到這次計算。")
    if not (isinstance(content.get("reason"), str) and content["reason"].strip()):
        raise InvariantViolation("COMPUTE_ADOPT_REASON_REQUIRED: 採用或不採用，都寫一句為什麼。")
    adopts = docs.current(tenant_id, owner, "compute.adopt")
    if any(doc["content"].get("run") == run and doc["doc_id"] != doc_id for doc in adopts):
        raise InvariantViolation("COMPUTE_ADOPT_ALREADY_GIVEN: 這次計算你已經選過採不採用；要改，改那一筆。")
    if doc_id is not None and any(doc["doc_id"] == doc_id and doc["content"].get("run") != run for doc in adopts):
        raise InvariantViolation("COMPUTE_ADOPT_RUN_FIXED: 採不採用跟著它寫的那次計算，不能換到別次。")


BEFORE_SAVE = {"compute.request": _request_checked, "compute.adopt": _adopt_checked}
AFTER_SAVE = {"compute.request": _request_saved}
