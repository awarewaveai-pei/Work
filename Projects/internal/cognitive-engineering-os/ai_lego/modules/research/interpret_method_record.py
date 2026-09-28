"""Project-bound interpretation of a validated method record (PI-a C10)."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Mapping

import yaml

from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gateway.draft import extract_json_object
from ai_lego.platform.ai_gateway.provider import MAX_OUTPUT_TOKENS

INTERPRETATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/method-interpretation.schema.yaml"
_VISUAL_KINDS = {"layered", "quadrant", "table", "matrix", "graph", "tree", "timeline", "scorecard"}
INTERPRET_MAX_TOKENS = min(12288, MAX_OUTPUT_TOKENS)   # the result page's sections (schema 1.2.0) plus the model's thinking; a cut-off answer is unparseable
INTERPRET_TIMEOUT_SECONDS = 240.0                    # an answer that long takes 2-3 minutes; the interactive 60 s default would cut it off (the job runs in the background)
MAX_SCHEMA_CHARS = 12000
MAX_FEEDBACK_CHARS = 2000


def record_sha256(record: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json(dict(record)).encode("utf-8")).hexdigest()


def record_leaf_paths(value: Any, prefix: str = "r") -> set[str]:
    if isinstance(value, Mapping):
        # Keep both collection nodes and scalar leaves. A visual such as a
        # quadrant binds its item collection (``record.tasks``), while a
        # citation normally points at a scalar (``record.tasks.0.urgency``).
        paths: set[str] = {prefix}
        for key, child in value.items():
            paths |= record_leaf_paths(child, f"{prefix}/{key}")
        return paths
    if isinstance(value, list):
        paths: set[str] = {prefix}
        for index, child in enumerate(value):
            paths |= record_leaf_paths(child, f"{prefix}/{index}")
        return paths
    return {prefix}


def build_prompt_manifest(record: Mapping[str, Any], sources: list[Mapping[str, Any]] | None = None) -> list[dict[str, Any]]:
    def value_at(path: str) -> Any:
        current: Any = record
        for component in path.removeprefix("r/").split("/") if path != "r" else []:
            current = current[int(component)] if isinstance(current, list) else current[component]
        return current

    manifest = []
    included = {key: value for key, value in record.items() if key not in {"id", "version", "provenance", "generated_by_method"}}
    for path in sorted(record_leaf_paths(included) - {"r"}):
        value = value_at(path)
        rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        manifest.append({"id": path, "kind": "record", "path": path, "value": rendered[:400], "sha256": record_sha256(record)})
    for source in sources or []:
        source_id = source.get("source_id") or source.get("id")
        if isinstance(source_id, str) and source_id:
            manifest.append({"id": f"source:{source_id}", "kind": "project_source", "source_id": source_id, "sha256": source.get("content_sha256") or source.get("sha256")})
    return manifest


def _load_visual_registry(spec_root: Path) -> dict[str, Any]:
    value = yaml.safe_load((spec_root / "methods" / "registry" / "method-visual-kinds.yaml").read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise InvariantViolation("VISUAL_REGISTRY_INVALID")
    return value


def visual_kind(spec_root: Path, method_id: str, contract: Mapping[str, Any]) -> str:
    registry = _load_visual_registry(spec_root)
    family = str(contract.get("family") or method_id.split(".", 1)[0])
    kind = registry.get("overrides", {}).get(method_id, registry.get("default_by_family", {}).get(family, "table"))
    if kind not in _VISUAL_KINDS:
        raise InvariantViolation(f"VISUAL_KIND_INVALID: {kind}")
    return kind


def build_interpretation_prompt(method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], manifest: list[Mapping[str, Any]], kind: str, *, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "", feedback: str = "", previous: Mapping[str, Any] | None = None) -> tuple[str, str]:
    """``feedback`` = why the user returned the previous version (``previous`` = its summary and findings): the answer
    corrects exactly that and keeps what was right (the result page's 退回並說原因)."""
    system = "You interpret a validated Cognitive Engineering method record. Reply with exactly one JSON object, no markdown. Do not invent facts, coordinates, scores, or sources."
    example_path = next((str(item["id"]) for item in manifest if item.get("kind") == "record"), "r/example")
    binding_examples: dict[str, dict[str, Any]] = {
        "layered": {"levels": [{"label": "record layer", "path": example_path}]},
        "quadrant": {"items": example_path, "x": example_path, "y": example_path, "x_threshold": example_path, "y_threshold": example_path},
        "table": {"rows": example_path, "columns": example_path},
    }
    lines = [
        f"METHOD: {method_id} — {(display or {}).get('name_zh', '')} / {(display or {}).get('name_en', '')}",
        f"BLURB / WHY: {(display or {}).get('blurb_zh', '')} / {(display or {}).get('why', '')}",
        "CONTRACT: " + json.dumps({key: contract.get(key) for key in ("purpose", "inputs", "outputs", "preconditions", "recommended_next")}, ensure_ascii=False),
        "RECORD SCHEMA: " + record_schema_text[:MAX_SCHEMA_CHARS],
        "MANIFEST:\n" + "\n".join(f"[{item['id']}] {item.get('value', '')}" for item in manifest if item.get("kind") == "record"),
        "SOURCES:\n" + "\n".join(str(item["id"]) for item in manifest if item.get("kind") == "project_source"),
        "AVAILABLE ACTIVE METHODS:\n" + "\n".join(catalog_lines or []),
        "OUTPUT JSON SHAPE: " + json.dumps({
            "headline": "",
            "findings": [{"id": "F1", "title": "", "text": "", "citations": ["r/foo"], "confidence": {"level": "mid", "reason": ""}, "revision_conditions": [{"text": "", "would_change": ""}]}],
            "visual": {"kind": kind, "bindings": binding_examples.get(kind, {})}, "next_methods": [],
            "next_steps": [{"method_id": "", "answers": "", "deepens": "", "prefill": {}, "needs_input": [], "yields": "", "est_cost": ""}],
            "recommendations": [{"level": "", "action": "", "expected": "", "citations": []}],
            "gaps": [{"text": "", "needed_evidence": ""}],
            "summary": "",
            "units": [{"path": example_path, "brief": "", "meaning": "", "action": "", "step": "", "effect": "", "leverage": "mid", "citations": [example_path]}],
            "focus": {"path": example_path, "why": ""},
            "priority": "",
            "solutions": {"options": [{"name": "", "what": "", "takes": "", "cost": "", "durability": "", "risk": "", "advice": "", "paths": [example_path]}],
                          "first_step": "", "horizon": "", "plan": [{"when": "", "action": "", "owner": "", "proof": "", "target": ""}],
                          "metrics": [{"name": "", "now": "", "now_citation": example_path, "target": "", "when": ""}], "signoff": ""},
            "loop": {"kind": "reinforcing", "name": "", "reading": "", "nodes": [{"id": "n1", "text": "", "citations": [example_path]}], "edges": [{"from": "n1", "to": "n2"}]},
            "trend": {"question": "", "reading": "", "series": [{"name": "", "unit": "", "points": [{"label": "", "value": 0, "citation": example_path}]}]},
        }, ensure_ascii=False),
        f"RULES: Write all narrative in {language}. The JSON shape is illustrative: omit optional arrays rather than emit empty-string examples. revision_conditions belongs inside each finding, never at the root. recommendations must contain objects, never bare strings; next_steps objects require every shown key including est_cost. Citations and every visual binding string must be a manifest id. next_methods may only use exact AVAILABLE ACTIVE METHODS ids; every next_steps.method_id must also appear in next_methods, and every next_steps.prefill value must be a MANIFEST id. If unsure of a valid next method, set both next_methods and next_steps to []. Never invent numbers or sources.",
        "RESULT PAGE SECTIONS (each optional; omit a section you cannot support from the record): headline = what happened in this case, at most 20 Chinese characters, like a newspaper headline (the page title). "
        "summary = one or two sentences saying what is really going on and what to change. "
        "units = one entry per unit of the picture (layered: one per level, path = that level's binding path): brief = what the user filled in for that unit, at most 16 Chinese characters, only words and numbers from the record; meaning = what the unit tells (two or three sentences); "
        "action = how to act at that unit; step = that action in at most 12 Chinese characters; effect = what the action achieves and how long it lasts; leverage = low|mid|high|max (max = the deepest unit, hardest but most lasting); citations = manifest ids. "
        "focus = the units path to act on first, and why. priority = the order of action in one or two sentences. "
        "solutions: 2-3 options, name = a short name of at most 8 Chinese characters with no numbering or 甲乙丙 prefix (the page numbers them), paths = the units each acts on, compared by what, takes (time to effect), cost, durability, risk, advice; first_step = one thing doable tomorrow with no budget and no approval; "
        "horizon = the plan's span in 天 or 週 (for example 90 天); plan = at most 5 rows (when, action, owner, proof, target): when = the week numbers counted from the plan's start, digits only, like 1 到 2 / 3 到 4 / 5 (the table's first column is 週), owner and target are suggestions the user confirms; "
        "metrics = at most 3 (name, now, target, when): now may contain a number only when the record states it, with now_citation = the manifest id whose text states it, otherwise say it is not measured yet; target is a suggestion; "
        "signoff = who has to agree to what (in brackets) and which option cannot go ahead without them, at most two sentences. "
        "loop = the feedback loop the record shows - causes that come back around and feed themselves (usual in systems tools; omit only when the record shows none): 2-6 nodes, each citing the record, and edges that close the loop (every node has an arrow in and out); kind reinforcing|balancing. "
        "trend = only numbers written in the record: question = the question the chart answers (ends with ？); every point's value must appear in the text of the manifest id it cites; when the record states the same quantity at two or more times (第 1 次 6 位、第 6 次 2 位) the trend is required, one point per stated time; omit trend only when the record has fewer than two such numbers. "
        "gaps = at least 1 (there is always evidence you did not have); a unit of the record the user left empty must be listed as a gap. next_steps = up to 4, the first being the one most worth doing next.",
        "NUMBERS: headline, findings (title, text), summary, priority, focus.why, units[].brief, units[].meaning, solutions.metrics[].name, loop texts and trend.reading state only numbers written in the record (no differences, sums or percentages you work out); suggestions (actions, plan, targets) may propose numbers. "
        "LENGTH: the whole JSON must close well inside the output limit. At most 3 findings; a text field is at most three sentences (about 100 Chinese characters); at most 2 recommendations, 3 gaps, 5 plan rows, 5 loop nodes, 4 next_steps; no indentation or line breaks outside strings.",
    ]
    if feedback:
        lines.append("THE USER RETURNED THE PREVIOUS VERSION. Reason, in the user's words: " + feedback[:MAX_FEEDBACK_CHARS] + "\nPREVIOUS VERSION (headline, summary, findings): "
                     + json.dumps({key: (previous or {}).get(key) for key in ("headline", "summary", "findings")}, ensure_ascii=False)[:6000]
                     + "\nCorrect exactly what the reason says; keep what was right; the reason outranks everything above except NUMBERS and the manifest.")
    return system, "\n\n".join(lines)


def prefill_map(target_record_schema: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> tuple[dict[str, str], list[str]]:
    """Map same-named top-level fields to known manifest ids; report every unmatched field."""
    properties = target_record_schema.get("properties", {})
    if not isinstance(properties, Mapping):
        return {}, []
    ids = {str(item.get("id")) for item in manifest}
    prefill: dict[str, str] = {}
    needs_input: list[str] = []
    for field in properties:
        candidate = f"r/{field}"
        if candidate in ids:
            prefill[str(field)] = candidate
        else:
            needs_input.append(str(field))
    return prefill, needs_input


def data_thickness_from_manifest(manifest: list[Mapping[str, Any]]) -> dict[str, Any]:
    units: dict[str, dict[str, int]] = {}
    source_count = sum(item.get("kind") == "project_source" for item in manifest)
    for item in manifest:
        identifier = str(item.get("id", ""))
        if item.get("kind") != "record" or not identifier.startswith("r/"):
            continue
        unit = identifier.split("/")[1]
        units.setdefault(unit, {"own_statements": 0, "external_sources": source_count})
        if item.get("value") in ("[]", "{}", '""'):   # a unit left blank is 0 statements, not 1 (the page lists it as an evidence gap)
            continue
        if not any(other.get("kind") == "record" and str(other.get("id", "")).startswith(identifier + "/") for other in manifest):
            units[unit]["own_statements"] += 1
    return units


def _citation_ids(interpretation: Mapping[str, Any]) -> list[str]:
    ids: list[str] = []
    for finding in interpretation.get("findings", []):
        if isinstance(finding, Mapping): ids.extend(c for c in finding.get("citations", []) if isinstance(c, str))
    for recommendation in interpretation.get("recommendations", []):
        if isinstance(recommendation, Mapping): ids.extend(c for c in recommendation.get("citations", []) if isinstance(c, str))
    return ids


def move_unresolvable_prefills_to_needs_input(interpretation: dict[str, Any], manifest: list[Mapping[str, Any]]) -> None:
    """Preserve a next step without claiming unsupported record data is prefilled."""
    manifest_ids = {str(item.get("id")) for item in manifest}
    steps = interpretation.get("next_steps")
    if not isinstance(steps, list):
        return
    for step in steps:
        if not isinstance(step, dict):
            continue
        if not isinstance(step.get("prefill"), dict):
            step["prefill"] = {}
        if not isinstance(step.get("needs_input"), list):
            step["needs_input"] = []
        invalid_fields = [field for field, value in step["prefill"].items() if not isinstance(value, str) or value not in manifest_ids]
        for field in invalid_fields:
            del step["prefill"][field]
            if isinstance(field, str) and field not in step["needs_input"]:
                step["needs_input"].append(field)


def normalize_gaps_without_inventing_evidence(interpretation: dict[str, Any], language: str) -> None:
    """Keep model-identified gaps while stating when required evidence was not specified."""
    gaps = interpretation.get("gaps")
    if not isinstance(gaps, list):
        return
    unspecified = "未指定；需使用者補充證據" if language.startswith("zh") else "Not specified; user must supply evidence"
    normalized: list[dict[str, str]] = []
    for gap in gaps:
        if not isinstance(gap, Mapping) or not isinstance(gap.get("text"), str) or not gap["text"].strip():
            continue
        needed = gap.get("needed_evidence")
        normalized.append({"text": gap["text"], "needed_evidence": needed if isinstance(needed, str) and needed.strip() else unspecified})
    interpretation["gaps"] = normalized


def normalize_layered_visual_bindings(interpretation: dict[str, Any]) -> None:
    """Convert a model's layer-name → manifest-path map to the typed levels array."""
    visual = interpretation.get("visual")
    if not isinstance(visual, dict) or visual.get("kind") != "layered":
        return
    bindings = visual.get("bindings")
    if not isinstance(bindings, dict) or "levels" in bindings or not bindings:
        return
    if all(isinstance(label, str) and label and isinstance(path, str) for label, path in bindings.items()):
        visual["bindings"] = {"levels": [{"label": label, "path": path} for label, path in bindings.items()]}


# Sections of the result page (schema 1.2.0). What a schema cannot check: every path/citation is a manifest id, a
# number stated as a current value or plotted comes from the record line it cites, a loop closes. The invariant is that
# nothing unverified is shown -- and it is enforced at the smallest grain that keeps it: one metric, one option path, one
# unit, one trend point is repaired or removed alone (repair_details); a section goes only when the section itself
# fails (a loop that does not close, a summary stating a number the record does not). Both are disclosed in the gate's
# evidence (removed / dropped), never silently.
DETAIL_KEYS = ("summary", "units", "focus", "priority", "solutions", "loop", "trend")


def _record_text(record: Mapping[str, Any], path: str) -> str:
    current: Any = record
    try:
        for component in path.removeprefix("r/").split("/") if path != "r" else []:
            current = current[int(component)] if isinstance(current, list) else current[component]
    except (KeyError, IndexError, ValueError, TypeError):
        return ""
    return current if isinstance(current, str) else json.dumps(current, ensure_ascii=False)


# One reading of a number everywhere (Codex 2026-09-26): full-width digits and separators (NFKC), thousands commas,
# a minus sign only when it is not a range dash ("1-5" is 1 and 5), one canonical text (6.0 -> "6", -1.5 -> "-1.5").
_NUMBER = re.compile(r"(?:(?<![\d.])-)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")


def _number_text(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)): return str(value)
    return str(int(value)) if float(value).is_integer() else repr(float(value))


def _numbers(text: str) -> list[str]:
    normal = unicodedata.normalize("NFKC", text).replace("−", "-")
    return [_number_text(float(match.group(0).replace(",", ""))) for match in _NUMBER.finditer(normal)]


def _record_numbers(record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> set[str]:
    """Every number the record states (its full text, not the manifest's 400-character preview)."""
    return {n for item in manifest if item.get("kind") == "record" for n in _numbers(_record_text(record, str(item.get("id", ""))))}


_MEASURE = re.compile(r"(?<!第)(?<!第 )(?<![\d.])(?<!\d,)(\d+(?:\.\d+)?)\s*(位|人|次|件|分鐘|小時|天|週|周|元|%|％)")   # NFKC turns ， into , so only a digit-comma excludes (1,000)


def trend_candidates(record: Mapping[str, Any]) -> dict[str, list[str]]:
    """Units the record measures twice or more (8 位 … 2 位 … 6 位 -> {"位": ["2", "6", "8"]}); 第 N 次 ordinals are not measures.
    Which of them is the same quantity at two times only the model can tell: this decides whether to ask it once more."""
    counts: dict[str, set[str]] = {}
    for text in _record_texts(record):
        for number, unit in _MEASURE.findall(unicodedata.normalize("NFKC", text)):
            counts.setdefault(unit, set()).add(number)
    return {unit: sorted(numbers, key=float) for unit, numbers in counts.items() if len(numbers) >= 2}


def _record_texts(record: Mapping[str, Any]) -> list[str]:
    out: list[str] = []
    def walk(value: Any) -> None:
        if isinstance(value, str): out.append(value)
        elif isinstance(value, Mapping):
            for item in value.values(): walk(item)
        elif isinstance(value, list):
            for item in value: walk(item)
    walk(record)
    return out


def _lines_stating(record: Mapping[str, Any], manifest: list[Mapping[str, Any]], numbers: list[str]) -> list[str]:
    """The record lines (leaf manifest ids) whose own text states every one of ``numbers``."""
    leaves = [str(item.get("id", "")) for item in manifest if item.get("kind") == "record"]
    leaves = [leaf for leaf in leaves if not any(other != leaf and other.startswith(leaf + "/") for other in leaves)]
    return [leaf for leaf in leaves if set(numbers) <= set(_numbers(_record_text(record, leaf)))]


def repair_details(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """The interpretation with every unverifiable item repaired or removed alone, and what was done, by section.
    A metric whose current value has no citation gets the one record line that states its numbers, or goes; an
    option's unknown paths go; a unit whose path or citations are not manifest ids, or whose meaning states an
    unstated number, goes; a trend point not stated by the line it cites goes (a series left with one point, too)."""
    ids = {str(item.get("id")) for item in manifest}
    in_record = frozenset(_record_numbers(record, manifest))
    done: dict[str, list[str]] = {}
    def note(section: str, message: str) -> None: done.setdefault(section, []).append(message)
    fixed = copy.deepcopy(dict(interpretation))
    units = fixed.get("units")
    if isinstance(units, list):
        kept = []
        for index, unit in enumerate(units):
            if not isinstance(unit, Mapping): note("units", f"units[{index}] is not an object; removed"); continue
            citations = [c for c in unit.get("citations") or [] if isinstance(c, str)] if isinstance(unit.get("citations"), list) else []
            unknown = [c for c in citations if c not in ids]
            unstated = [n for n in _numbers(str(unit.get("meaning", ""))) + _numbers(str(unit.get("brief", ""))) if n not in in_record]
            if unit.get("path") not in ids: note("units", f"units[{index}].path {unit.get('path')!r} is not a manifest id; removed")
            elif unknown: note("units", f"units[{index}] cites {unknown}, not manifest ids; removed")
            elif unstated: note("units", f"units[{index}] states {unstated}, which the record does not; removed")
            else: kept.append(dict(unit))
        fixed["units"] = kept
        if not kept: del fixed["units"]
    solutions = fixed.get("solutions")
    if isinstance(solutions, Mapping):
        solutions = dict(solutions)
        options = solutions.get("options")
        if isinstance(options, list):
            for index, option in enumerate(options):
                if isinstance(option, dict) and isinstance(option.get("paths"), list):
                    unknown = [path for path in option["paths"] if path not in ids]
                    if unknown:
                        option["paths"] = [path for path in option["paths"] if path in ids]
                        note("solutions", f"solutions.options[{index}].paths {unknown} are not manifest ids; removed from the option")
        metrics = solutions.get("metrics")
        if isinstance(metrics, list):
            kept = []
            for index, metric in enumerate(metrics):
                if not isinstance(metric, Mapping): note("solutions", f"solutions.metrics[{index}] is not an object; removed"); continue
                metric = dict(metric)
                cite = metric.get("now_citation")
                cite = cite if isinstance(cite, str) and cite.strip() else None   # "" is no citation
                claimed = _numbers(str(metric.get("now", "")))
                if not claimed:   # "not measured yet": nothing to verify, a stray citation is dropped
                    metric.pop("now_citation", None); kept.append(metric); continue
                if cite is not None and cite in ids and set(claimed) <= set(_numbers(_record_text(record, cite))):
                    metric["now_citation"] = cite; kept.append(metric); continue
                stating = _lines_stating(record, manifest, claimed)
                if len(stating) == 1:
                    metric["now_citation"] = stating[0]; kept.append(metric)
                    note("solutions", f"solutions.metrics[{index}].now_citation {cite!r} did not state {claimed}; {stating[0]} does, so it was set")
                else:
                    note("solutions", f"solutions.metrics[{index}].now states {claimed} and no single record line states it (citation {cite!r}); removed")
            solutions["metrics"] = kept
            if not kept: del solutions["metrics"]
        fixed["solutions"] = solutions
    trend = fixed.get("trend")
    if isinstance(trend, Mapping):
        trend = dict(trend)
        series_kept = []
        for s_index, series in enumerate(trend.get("series") or []):
            if not isinstance(series, Mapping): note("trend", f"trend.series[{s_index}] is not an object; removed"); continue
            points = []
            for p_index, point in enumerate(series.get("points") or []):
                if not isinstance(point, Mapping): note("trend", f"trend.series[{s_index}].points[{p_index}] is not an object; removed"); continue
                cite = point.get("citation")
                if cite not in ids: note("trend", f"trend.series[{s_index}].points[{p_index}].citation {cite!r} is not a manifest id; point removed")
                elif _number_text(point.get("value")) not in _numbers(_record_text(record, cite)): note("trend", f"trend value {point.get('value')!r} is not stated in {cite}; point removed")
                else: points.append(dict(point))
            if len(points) >= 2: series_kept.append({**dict(series), "points": points})
            elif points or series.get("points"): note("trend", f"trend.series[{s_index}] kept fewer than 2 stated points; series removed")
        trend["series"] = series_kept
        if not series_kept: del fixed["trend"]; note("trend", "no series kept; trend removed")
        else: fixed["trend"] = trend
    return fixed, done


def detail_problems(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> dict[str, list[str]]:
    """-> {section: [problem, ...]}: what fails at the section's own level (after repair_details); empty when every one holds."""
    ids = {str(item.get("id")) for item in manifest}
    problems: dict[str, list[str]] = {}
    def bad(section: str, message: str) -> None: problems.setdefault(section, []).append(message)
    # the fact fields of these sections may only state numbers the record states (suggestions -- actions, plans, targets --
    # are proposals the user confirms and are not held to this)
    in_record = frozenset(_record_numbers(record, manifest))   # its own name: a closure reads it at call time (a reused name once made it the last metric's numbers)
    def facts(section: str, where: str, text: Any) -> None:
        unknown = [n for n in _numbers(text) if n not in in_record] if isinstance(text, str) else []
        if unknown: bad(section, f"{where} states {unknown}, which the record does not (the record states {sorted(in_record, key=float)})")
    facts("summary", "summary", interpretation.get("summary"))
    facts("priority", "priority", interpretation.get("priority"))
    def cites(section: str, where: str, citations: Any) -> None:
        unknown = [c for c in (citations if isinstance(citations, list) else []) if c not in ids]
        if unknown: bad(section, f"{where} cites {unknown}, not manifest ids")
    for index, unit in enumerate(interpretation.get("units") or []):
        if isinstance(unit, Mapping):
            if unit.get("path") not in ids: bad("units", f"units[{index}].path {unit.get('path')!r} is not a manifest id")
            cites("units", f"units[{index}]", unit.get("citations"))
            facts("units", f"units[{index}].meaning", unit.get("meaning"))
            facts("units", f"units[{index}].brief", unit.get("brief"))
    focus = interpretation.get("focus")
    if isinstance(focus, Mapping):
        if focus.get("path") not in ids: bad("focus", f"focus.path {focus.get('path')!r} is not a manifest id")
        facts("focus", "focus.why", focus.get("why"))
    solutions = interpretation.get("solutions")
    if isinstance(solutions, Mapping):
        for index, option in enumerate(solutions.get("options") or []):
            if isinstance(option, Mapping):
                unknown = [path for path in option.get("paths") or [] if path not in ids]
                if unknown: bad("solutions", f"solutions.options[{index}].paths {unknown} are not manifest ids")
        for index, metric in enumerate(solutions.get("metrics") or []):
            if not isinstance(metric, Mapping): continue
            facts("solutions", f"solutions.metrics[{index}].name", metric.get("name"))
            claimed, cite = _numbers(str(metric.get("now", ""))), metric.get("now_citation")
            if claimed and (cite not in ids or any(n not in _numbers(_record_text(record, cite)) for n in claimed)):
                bad("solutions", f"solutions.metrics[{index}].now states {claimed} without a record line that states it (now_citation {cite!r})")
    loop = interpretation.get("loop")
    if isinstance(loop, Mapping):
        nodes = [node for node in loop.get("nodes") or [] if isinstance(node, Mapping)]
        edges = [edge for edge in loop.get("edges") or [] if isinstance(edge, Mapping)]
        node_ids = {node.get("id") for node in nodes}
        for index, node in enumerate(nodes):
            cites("loop", f"loop.nodes[{index}]", node.get("citations"))
            facts("loop", f"loop.nodes[{index}].text", node.get("text"))
        facts("loop", "loop.reading", loop.get("reading"))
        if len(node_ids) != len(nodes): bad("loop", "loop.nodes ids repeat")
        if any(edge.get("from") not in node_ids or edge.get("to") not in node_ids for edge in edges): bad("loop", "loop.edges name a node that does not exist")
        elif not (node_ids <= {edge.get("from") for edge in edges} and node_ids <= {edge.get("to") for edge in edges}): bad("loop", "loop does not close: every node needs an arrow in and out")
    trend = interpretation.get("trend")
    if isinstance(trend, Mapping):
        facts("trend", "trend.reading", trend.get("reading"))
        for s_index, series in enumerate(trend.get("series") or []):
            for p_index, point in enumerate((series or {}).get("points") or [] if isinstance(series, Mapping) else []):
                if not isinstance(point, Mapping): continue
                cite = point.get("citation")
                if cite not in ids: bad("trend", f"trend.series[{s_index}].points[{p_index}].citation {cite!r} is not a manifest id")
                elif _number_text(point.get("value")) not in _numbers(_record_text(record, cite)): bad("trend", f"trend value {point.get('value')!r} is not stated in {cite}")
    return problems


def without_sections(interpretation: Mapping[str, Any], sections: set[str]) -> dict[str, Any]:
    return {key: value for key, value in copy.deepcopy(dict(interpretation)).items() if key not in sections}


def evaluate_interpretation_gates(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]], active_method_ids: set[str]) -> list[dict[str, Any]]:
    manifest_ids = {str(item.get("id")) for item in manifest}
    detail = detail_problems(interpretation, record, manifest)
    citations = _citation_ids(interpretation)
    in_record = frozenset(_record_numbers(record, manifest))
    unstated = {str(finding.get("id")): missing for finding in interpretation.get("findings", []) if isinstance(finding, Mapping)
                for missing in [[n for field in ("title", "text") for n in _numbers(str(finding.get(field, ""))) if n not in in_record]] if missing}
    headline_unstated = [n for n in _numbers(str(interpretation.get("headline") or "")) if n not in in_record]
    if headline_unstated: unstated["headline"] = headline_unstated
    citation_ok = bool(interpretation.get("findings")) and bool(citations) and all(c in manifest_ids for c in citations) and not unstated
    visual = interpretation.get("visual")
    bindings = visual.get("bindings", {}) if isinstance(visual, Mapping) else {}
    is_layered = isinstance(visual, Mapping) and visual.get("kind") == "layered"
    binding_paths: list[str] = []
    def collect(value: Any, *, level_item: bool = False) -> None:
        if isinstance(value, str): binding_paths.append(value)
        elif isinstance(value, Mapping):
            for key, child in value.items():
                if not (level_item and key == "label"):
                    collect(child, level_item=is_layered and key == "levels")
        elif isinstance(value, list):
            for child in value: collect(child, level_item=level_item)
    collect(bindings)
    visual_ok = all(path in manifest_ids for path in binding_paths)
    next_methods = interpretation.get("next_methods", [])
    next_steps = interpretation.get("next_steps", [])
    next_ok = isinstance(next_methods, list) and all(isinstance(method_id, str) and method_id in active_method_ids for method_id in next_methods)
    if not isinstance(next_steps, list):
        next_ok = False
    else:
        for step in next_steps:
            if not isinstance(step, Mapping) or step.get("method_id") not in next_methods:
                next_ok = False
                break
            prefill = step.get("prefill", {})
            if not isinstance(prefill, Mapping) or any(not isinstance(value, str) or value not in manifest_ids for value in prefill.values()):
                next_ok = False
                break
    return [
        {"gate_id": "citation_integrity", "status": "PASS" if citation_ok else "FAIL", "evidence": {"citations": citations, "manifest_count": len(manifest), "unstated_numbers": unstated}},
        {"gate_id": "visual_bindings_resolvable", "status": "PASS" if visual_ok else "FAIL", "evidence": {"paths": binding_paths}},
        {"gate_id": "next_methods_resolvable", "status": "PASS" if next_ok else "FAIL", "evidence": {"next_methods": next_methods}},
        {"gate_id": "detail_integrity", "status": "PASS" if not detail else "FAIL", "evidence": {"problems": detail}},
    ]


def validate_interpretation(schema_contracts: SchemaContracts, interpretation: Mapping[str, Any]) -> None:
    schema_contracts.validate(INTERPRETATION_SCHEMA, dict(interpretation), "MethodInterpretation")


def run_interpretation(*, method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], sources: list[Mapping[str, Any]], provider: Any, spec_root: Path, schema_contracts: SchemaContracts, active_method_ids: set[str], interpretation_id: str, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "", feedback: str = "", previous: Mapping[str, Any] | None = None) -> dict[str, Any]:
    kind = visual_kind(spec_root, method_id, contract)
    manifest = build_prompt_manifest(record, sources)
    system, user = build_interpretation_prompt(method_id, contract, display, record, manifest, kind, language=language, catalog_lines=catalog_lines, record_schema_text=record_schema_text, feedback=feedback, previous=previous)
    complete = getattr(provider, "complete_json", None) or provider.complete   # API-parsed JSON when the provider offers it; a fake's text otherwise
    total_input = total_output = 0
    previous_error = ""
    gates: list[dict[str, Any]] = []
    fallback: tuple[dict[str, Any], list[dict[str, Any]], str] | None = None   # an earlier answer whose core held, its failing detail dropped
    attempts: list[dict[str, Any]] = []   # per model call: output size and why it was refused (a retry is paid for twice)

    def settle(interpretation: dict[str, Any], gates: list[dict[str, Any]], removed: dict[str, list[str]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Drop the detail sections that failed their gate or the schema; the returned gates describe what is returned."""
        dropped: dict[str, list[str]] = dict(gates[3]["evidence"]["problems"])
        kept = without_sections(interpretation, set(dropped))
        try:
            validate_interpretation(schema_contracts, kept)
        except InvariantViolation:   # which detail sections does the schema refuse? each is checked alone on the core
            present = [key for key in DETAIL_KEYS if key in kept]
            validate_interpretation(schema_contracts, without_sections(kept, set(present)))   # the core itself refused: not ours to trim
            for key in present:
                try:
                    validate_interpretation(schema_contracts, without_sections(kept, set(present) - {key}))
                except InvariantViolation as error:
                    dropped[key] = [f"schema: {error}"]
            kept = without_sections(kept, set(dropped))
            validate_interpretation(schema_contracts, kept)   # sections valid alone are valid together (the schema has no cross-section rule)
        return kept, gates[:3] + [{"gate_id": "detail_integrity", "status": "PASS", "evidence": {"problems": {}, "dropped": dropped, "removed": removed}}]

    for attempt in range(2):
        retry_user = user if not previous_error else user + "\n\nPrevious response was refused. Correct exactly this failure: " + previous_error
        try:
            completion = complete(system, retry_user, max_tokens=INTERPRET_MAX_TOKENS)
        except InvariantViolation as error:
            if fallback is not None: break
            return {"interpretation": None, "gate_results": gates, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
        total_input += completion.input_tokens
        total_output += completion.output_tokens
        attempts.append({"output_tokens": completion.output_tokens, "refused": None})
        try:
            interpretation = extract_json_object(completion.text)
            supplied_visual = interpretation.get("visual") if isinstance(interpretation.get("visual"), Mapping) else {}
            interpretation.update({"interpretation_id": interpretation_id, "method_id": method_id, "record_sha256": record_sha256(record), "visual": {**supplied_visual, "kind": kind}, "data_thickness": data_thickness_from_manifest(manifest), "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None}, "model": completion.model, "usage": {"input_tokens": completion.input_tokens, "output_tokens": completion.output_tokens}})
            for key in DETAIL_KEYS:   # "trend": null means omitted, not a malformed section
                if key in interpretation and interpretation[key] is None: del interpretation[key]
            move_unresolvable_prefills_to_needs_input(interpretation, manifest)
            normalize_gaps_without_inventing_evidence(interpretation, language)
            normalize_layered_visual_bindings(interpretation)
            interpretation, removed = repair_details(interpretation, record, manifest)
            gates = evaluate_interpretation_gates(interpretation, record, manifest, active_method_ids)
            core_failed = [g["gate_id"] for g in gates[:3] if g["status"] != "PASS"]
            if core_failed:
                detail = ""
                if "next_methods_resolvable" in core_failed:
                    steps = interpretation.get("next_steps", [])
                    step_ids = [step.get("method_id") for step in steps if isinstance(step, Mapping)] if isinstance(steps, list) else []
                    detail = "; next_methods=" + json.dumps(interpretation.get("next_methods"), ensure_ascii=False) + "; next_steps.method_id=" + json.dumps(step_ids, ensure_ascii=False)
                    if isinstance(steps, list):
                        detail += "; next_steps.prefill_types=" + json.dumps([type(step.get("prefill")).__name__ for step in steps if isinstance(step, Mapping)])
                    detail += ". Use exact ACTIVE ids and matching next_steps, or set both arrays to []."
                unstated = gates[0]["evidence"].get("unstated_numbers") if "citation_integrity" in core_failed else None
                if unstated:
                    detail += "; findings/headline state numbers the record does not: " + json.dumps(unstated, ensure_ascii=False) + " (state only numbers written in the record)"
                raise InvariantViolation("INTERPRETATION_GATE_FAILED: " + "; ".join(core_failed) + detail)
            kept, settled = settle(interpretation, gates, removed)
            kept["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
            dropped = settled[3]["evidence"]["dropped"]
            if (dropped or removed) and attempt == 0:   # the core holds; ask once more for what was dropped or removed, keep this answer if that fails
                fallback = (kept, settled, completion.model)
                previous_error = "DETAIL_INTEGRITY: " + json.dumps({"dropped": dropped, "removed": removed}, ensure_ascii=False)
                attempts[-1]["refused"] = previous_error
                continue
            candidates = trend_candidates(record) if kept.get("trend") is None else {}
            if candidates and attempt == 0:   # 圖 A missing though the record measures something twice: ask once, keep this answer if the model still omits it
                fallback = (kept, settled, completion.model)
                previous_error = "TREND_MISSING: trend was omitted but the record states " + "; ".join(f"{', '.join(n + ' ' + unit for n in numbers)}" for unit, numbers in candidates.items()) + ". If any of these is the same quantity at two or more times, add trend (one point per stated time, each value in the text of the line it cites); if none is, answer again unchanged."
                attempts[-1]["refused"] = previous_error
                continue
            if fallback is not None and previous_error.startswith("TREND_MISSING") and kept.get("trend") is None:
                break   # the model kept the omission: the first answer stands, nothing else was wrong with it
            return {"interpretation": kept, "gate_results": settled, "error": None, "model": completion.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
        except (InvariantViolation, KeyError, TypeError) as error:
            previous_error = str(error)
            if completion.output_tokens >= INTERPRET_MAX_TOKENS:   # it ran into the ceiling: the JSON never closed
                previous_error = f"ANSWER_CUT_OFF at {completion.output_tokens} output tokens before the JSON closed; answer again far more briefly (see LENGTH). Parser: {error}"
            attempts[-1]["refused"] = previous_error
    if fallback is not None:
        kept, settled, model = fallback
        kept["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
        return {"interpretation": kept, "gate_results": settled, "error": None, "model": model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
    return {"interpretation": None, "gate_results": gates, "error": f"INTERPRETATION_REJECTED_AFTER_REPAIR: {previous_error}", "model": provider.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
