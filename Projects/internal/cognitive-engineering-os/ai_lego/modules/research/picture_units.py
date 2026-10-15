"""The units of a tool's own picture when they are not its form fields (docs/TOOL_PAGE_TEMPLATE.md T6, §15.1 item 2):
the problem statement's three parts, the fishbone's bones, the five whys' questions, the Pareto's bars. Derived from the
record, never by the model. The interpretation prompt lists them (one reading per unit, path = the unit's path) and the
server stores them with the interpretation, so the result page builds ④⑥ from the same list (one implementation).

A unit = {path: the manifest id readings use for it, label, members: every manifest id it covers (path first),
own_statements: how many of them the user filled in}. Same item filters as the web pictures (components/result/*.tsx
bonesOf, chainOf, paretoOf, problemOf), so a unit is never listed that the picture does not draw."""

from __future__ import annotations

from typing import Any, Callable, Mapping

Unit = dict[str, Any]
LABELS = {"zh": {"current_state": "現況", "expected_state": "期望", "gap": "差距", "uncategorized": "未分類", "nth": "第 {n} 項"},
          "en": {"current_state": "Current state", "expected_state": "Expected state", "gap": "Gap", "uncategorized": "Uncategorized", "nth": "Item {n}"}}


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _problem(record: Mapping[str, Any], words: Mapping[str, str]) -> list[Unit]:
    content = record.get("content")
    if not isinstance(content, Mapping) or not all(_text(content.get(key)) for key in ("current_state", "expected_state", "gap")):
        return []
    return [{"path": f"r/content/{key}", "label": words[key], "members": [f"r/content/{key}"], "own_statements": 1} for key in ("current_state", "expected_state", "gap")]


def _fishbone(record: Mapping[str, Any], words: Mapping[str, str]) -> list[Unit]:
    bones: dict[str, list[str]] = {}
    for index, item in enumerate(record.get("hypotheses") if isinstance(record.get("hypotheses"), list) else []):
        if not isinstance(item, Mapping) or not isinstance(item.get("id"), str) or not _text(item.get("statement")):
            continue
        category = item["category"].strip() if _text(item.get("category")) else words["uncategorized"]
        bones.setdefault(category, []).append(f"r/hypotheses/{index}")
    return [{"path": members[0], "label": category, "members": members, "own_statements": len(members)} for category, members in bones.items()]


def _five_whys(record: Mapping[str, Any], words: Mapping[str, str]) -> list[Unit]:
    rows = record.get("why_chain")
    if not isinstance(rows, list) or not isinstance(record.get("target_hypothesis_id"), str):
        return []
    kept = [(index, row) for index, row in enumerate(rows) if isinstance(row, Mapping) and isinstance(row.get("question"), str) and isinstance(row.get("answer"), str)]
    kept.sort(key=lambda pair: pair[1].get("step") if isinstance(pair[1].get("step"), (int, float)) else pair[0])
    return [{"path": f"r/why_chain/{index}", "label": row["question"].strip() or row["answer"], "members": [f"r/why_chain/{index}"], "own_statements": int(_text(row["answer"]))}
            for index, row in kept]


def _pareto(record: Mapping[str, Any], words: Mapping[str, str]) -> list[Unit]:
    ranking = record.get("ranking")
    number = lambda value: isinstance(value, (int, float)) and not isinstance(value, bool)
    if not isinstance(ranking, list) or not ranking:
        return []
    keys = ("metric_value", "share_of_total_percent", "cumulative_share_percent")
    if not all(isinstance(row, Mapping) and isinstance(row.get("hypothesis_id"), str) and all(number(row.get(key)) for key in keys) for row in ranking):
        return []   # the picture draws nothing from a malformed ranking (paretoOf), so it lists no unit either
    if all(row["metric_value"] == 0 for row in ranking):
        return []
    statements = {cause["hypothesis_id"]: cause["statement"] for cause in record.get("causes") or []
                  if isinstance(cause, Mapping) and isinstance(cause.get("hypothesis_id"), str) and _text(cause.get("statement"))}
    return [{"path": f"r/ranking/{index}", "label": statements.get(row["hypothesis_id"], row["hypothesis_id"]), "members": [f"r/ranking/{index}"], "own_statements": int(row["metric_value"] > 0)}
            for index, row in enumerate(ranking)]


PICTURE_UNITS: dict[str, Callable[[Mapping[str, Any], Mapping[str, str]], list[Unit]]] = {
    "framing.problem_statement": _problem,
    "root_cause.fishbone": _fishbone,
    "root_cause.five_whys": _five_whys,
    "root_cause.pareto": _pareto,
}


def picture_units(method_id: str, record: Mapping[str, Any], language: str = "zh-TW") -> list[Unit]:
    """-> the units of `method_id`'s picture drawn from `record`, in drawing order; [] for a tool without picture units or
    a record its picture cannot draw."""
    derive = PICTURE_UNITS.get(method_id)
    words = LABELS["zh" if language.startswith("zh") else "en"]
    units = derive(record, words) if derive else []
    for n, unit in enumerate(units, 1):   # a blank question or id the record allows still names its unit (the schema needs a label)
        unit["label"] = str(unit["label"]).strip() or words["nth"].format(n=n)
    return units


def place_readings(interpretation: dict[str, Any]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Each reading of a picture unit sits on that unit's path, one reading per unit: a reading the model wrote on a member
    (r/hypotheses/3 of the bone r/hypotheses/0) moves to the unit's path; a second reading of the same unit is removed
    and said (the page has one 這代表 row per unit; nothing is dropped silently). -> (removed, repaired) notes."""
    units = interpretation.get("picture_units") or []
    readings = interpretation.get("units")
    if not units or not isinstance(readings, list):
        return {}, {}
    def home(path: Any) -> Unit | None:
        return next((unit for unit in units if isinstance(path, str) and any(path == m or path.startswith(m + "/") for m in unit["members"])), None)
    kept, taken, removed, repaired = [], set(), [], []
    for index, reading in enumerate(readings):
        unit = home(reading.get("path")) if isinstance(reading, Mapping) else None
        if unit is None:
            kept.append(reading); continue
        if unit["path"] in taken:
            removed.append(f"units[{index}] is a second reading of {unit['label']} ({unit['path']}); removed"); continue
        taken.add(unit["path"])
        if reading["path"] != unit["path"]:
            repaired.append(f"units[{index}].path {reading['path']} -> {unit['path']} (the unit it belongs to)")
            reading = {**reading, "path": unit["path"]}
        kept.append(reading)
    interpretation["units"] = kept
    return ({"units": removed} if removed else {}), ({"units": repaired} if repaired else {})
