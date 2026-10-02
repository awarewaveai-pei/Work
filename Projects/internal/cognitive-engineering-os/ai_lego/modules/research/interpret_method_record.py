"""Project-bound interpretation of a validated method record (PI-a C10)."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Callable, Mapping

import yaml

from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gateway.structured import ask_object, offers_schema, parse_object, tool_schema
from ai_lego.platform.ai_gateway.provider import MAX_OUTPUT_TOKENS, ProviderCallError
from ai_lego.modules.research.gates import evaluate_citation_integrity

INTERPRETATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/method-interpretation.schema.yaml"
INTERPRETATION_SCHEMA_FILE = Path("specs") / "cognitive" / "typed-objects" / "method-interpretation.schema.yaml"
_VISUAL_KINDS = {"layered", "quadrant", "table", "matrix", "graph", "tree", "timeline", "scorecard"}
# Thinking counts against max_tokens and is billed as output (claude-opus-5-5 always thinks; its API default effort is medium, INTERPRET_EFFORT sets it explicitly). Measured
# 2026-09-28 on the demo record (claude-sonnet-5, effort unset): one answer = 5.8k-7.5k output tokens; the ceiling leaves room for a long
# record, and INTERPRET_EFFORT keeps the thinking share bounded. A cut-off answer is asked once more (run_interpretation).
INTERPRET_MAX_TOKENS = min(16000, MAX_OUTPUT_TOKENS)
INTERPRET_EFFORT = "medium"
INTERPRET_TIMEOUT_SECONDS = 300.0                    # 16k tokens take up to ~4 minutes; the interactive 60 s default would cut it off (the job runs in the background)
# keys the server writes after the model answers: never asked of the model
SERVER_KEYS = ("interpretation_id", "method_id", "record_sha256", "data_thickness", "provenance", "model", "usage", "judgment")
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
            title = source.get("title")
            manifest.append({"id": f"source:{source_id}", "kind": "project_source", "source_id": source_id, "title": title, "value": title, "sha256": source.get("content_sha256") or source.get("sha256")})
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


def result_page_shows(spec_root: Path, method_id: str) -> set[str]:
    """The tools whose picture ③ of this method's result page already draws (methods/registry/result-page-shows.yaml)."""
    try:
        document = yaml.safe_load((spec_root / "methods" / "registry" / "result-page-shows.yaml").read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return set()
    return {str(item) for item in [*(document.get("every_method") or []), *((document.get("by_method") or {}).get(method_id) or [])]}


def build_interpretation_prompt(method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], manifest: list[Mapping[str, Any]], kind: str, *, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "", feedback: str = "", previous: Mapping[str, Any] | None = None, via_tool: bool = False, excluded_method_ids: Mapping[str, str] | None = None) -> tuple[str, str]:
    """``feedback`` = why the user returned the previous version (``previous`` = its summary and findings): the answer
    corrects exactly that and keeps what was right (the result page's 退回並說原因). ``via_tool``: the answer is the
    input of the tool call (complete_json), so the system line says that and not "reply with text".
    ``excluded_method_ids``: tools ⑧ must not recommend (id -> why); they leave the catalog and the contract's list."""
    excluded = dict(excluded_method_ids or {})
    catalog_lines = [line for line in catalog_lines or [] if line.split(" ", 1)[0] not in excluded]
    contract = {**contract, "recommended_next": [item for item in contract.get("recommended_next") or [] if item not in excluded]}
    channel = "Answer with exactly one JSON object as the input of the tool call." if via_tool else "Reply with exactly one JSON object, no markdown."
    system = f"You interpret a validated Cognitive Engineering method record. {channel} Do not invent facts, coordinates, scores, or sources."
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
        "NOT FOR next_steps / next_methods (this page already draws them, or this project already ran them): " + ", ".join(f"{key} ({why})" for key, why in sorted(excluded.items())),
        "OUTPUT JSON SHAPE: " + json.dumps({
            "headline": "",
            "findings": [{"id": "F1", "title": "", "text": "", "citations": [example_path], "confidence": {"level": "mid", "reason": ""}, "revision_conditions": [{"text": "", "would_change": ""}]}],
            "visual": {"kind": kind, "bindings": binding_examples.get(kind, {})}, "next_methods": [],
            "next_steps": [{"method_id": "", "answers": "", "deepens": "", "prefill": {}, "needs_input": [], "yields": "", "est_cost": "S", "short": "", "on_path": True, "why": ""}],
            "recommendations": [{"level": "now", "action": "", "expected": "", "citations": [example_path]}],
            "gaps": [{"text": "", "needed_evidence": "", "path": example_path, "citations": [example_path]}],
            "summary": "",
            "units": [{"path": example_path, "brief": "", "meaning": "", "action": "", "step": "", "effect": "", "leverage": "mid", "citations": [example_path], "thickness": {"verdict": "thin", "note": "", "fill_by": ""}}],
            "diagnosis": {"title": "", "text": "", "citations": [example_path]},
            "priority_short": "",
            "focus": {"path": example_path, "why": ""},
            "priority": "",
            "solutions": {"options": [{"name": "", "what": "", "takes": "", "cost": "", "durability": "", "risk": "", "advice": "", "paths": [example_path]}],
                          "first_step": "", "recommended": "", "horizon": "", "long_horizon": "quarter", "plan": [{"when": "", "action": "", "owner": "", "proof": "", "target": "", "phase": "short", "options": [""]}],
                          "metrics": [{"name": "", "now": "", "now_citation": example_path, "target": "", "when": ""}], "signoff": ""},
            "loop": {"kind": "reinforcing", "name": "", "reading": "", "nodes": [{"id": "n1", "text": "", "citations": [example_path]}], "edges": [{"from": "n1", "to": "n2"}], "feeders": [{"id": "f1", "text": "", "citations": [example_path], "to": "n1"}]},
            "trend": {"question": "", "reading": "", "series": [{"name": "", "unit": "", "points": [{"label": "", "value": 0, "citation": example_path}]}]},
        }, ensure_ascii=False),
        f"RULES: Write all narrative in {language}. The JSON shape is illustrative: omit optional arrays rather than emit empty-string examples. revision_conditions belongs inside each finding, never at the root. recommendations must contain objects, never bare strings, each citing the manifest; level = now|next|later (when to do it). next_steps objects require every shown key; est_cost = S|M|L (S = minutes of the user's time, M = an hour or two, L = days). Every finding and recommendation cites at least one manifest id; citations and every visual binding string must be a manifest id. confidence.level = high only when a SOURCE supports the finding; with the record alone it is at most mid. next_methods may only use exact AVAILABLE ACTIVE METHODS ids; every next_steps.method_id must also appear in next_methods (a step naming any other method is dropped), and every next_steps.prefill value must be a MANIFEST id. Never invent numbers or sources.",
        "RESULT PAGE SECTIONS (each optional; omit a section you cannot support from the record): headline = what happened in this case, at most 20 Chinese characters, like a newspaper headline (the page title). "
        "summary = one or two sentences saying what is really going on and what to change. "
        "units = one entry per unit of the picture (layered: one per level, path = that level's binding path): brief = what the user filled in for that unit, at most 16 Chinese characters, only words and numbers from the record; meaning = what the unit tells (two or three sentences); "
        "action = how to act at that unit; step = that action in at most 12 Chinese characters; effect = what the action achieves and how long it lasts; leverage = low|mid|high|max (max = the deepest unit, hardest but most lasting); citations = manifest ids. "
        "focus = the units path to act on first, and why. priority = the order of action in one or two sentences. "
        "solutions: 5 options (distinct paths, from quick relief to the deepest change; the user may pick several), name = a short name of at most 8 Chinese characters with no numbering or 甲乙丙 prefix (the page numbers them), paths = the units each acts on, compared by what, takes (time to effect), cost, durability, risk, advice; first_step = one thing doable tomorrow with no budget and no approval; "
        "horizon = when to rerun this analysis and compare, in 天 or 週 (for example 90 天); plan = at most 12 rows (when, action, owner, proof, target, phase, options) in two phases: "
        "phase short = the first month, when = 第 1 週 / 第 2 到 4 週 (weeks counted from the start); phase long = after the first month, when = 第 2 個月 / 第 2 季 / 第 2 年 in the unit of long_horizon; "
        "long_horizon = month|quarter|year, how long the deepest recommended change takes to show; options = the option names (options[].name) a row serves, so every option has at least one short and one long row (a row serving several options lists them all); "
        "owner and target are suggestions the user confirms; "
        "metrics = at most 3 (name, now, target, when): now may contain a number only when the record states it, with now_citation = the manifest id whose text states it, otherwise say it is not measured yet; target is a suggestion; "
        "now and target are the bare value only, without the words 現在/目標 or （待確認） (the page adds those itself); "
        "signoff = who has to agree to what (in brackets) and which option cannot go ahead without them, at most two sentences. "
        "loop = the feedback loop the record shows - causes that come back around and feed themselves (usual in systems tools; omit only when the record shows none): 2-6 nodes, each citing the record, and edges that close the loop (every node has an arrow in and out); kind reinforcing|balancing. "
        "trend = only numbers written in the record: question = the question the chart answers (ends with ？); every point's value must appear in the text of the manifest id it cites; when the record states the same quantity at two or more times (第 1 次 6 位、第 6 次 2 位) the trend is required, one point per stated time; omit trend only when the record has fewer than two such numbers. "
        "gaps = at least 1 (there is always evidence you did not have); a unit of the record the user left empty must be listed as a gap. next_steps = 2 to 4, the first being the one most worth doing next.",
        "NUMBERS: headline, findings (title, text, confidence.reason), summary, priority, focus.why, units[].brief, units[].meaning, solutions.metrics[].name, loop (name, node texts, reading), trend (question, reading) and gaps[].text state only numbers written in the record, in digits or in words (四個人 is 4; no differences, sums or percentages you work out); layer and step ordinals (第 3 層) are not counted. Suggestions (actions, plan, targets) may propose numbers. "
        "LENGTH: the whole JSON must close well inside the output limit. At most 3 findings; a text field is at most three sentences (about 100 Chinese characters); at most 2 recommendations, 3 gaps, 12 plan rows, 5 loop nodes, 4 next_steps; no indentation or line breaks outside strings.",
    ]
    lines.append(
        "MORE OF THE PAGE (each optional): diagnosis = where the problem sits and where its root is, title at most 24 Chinese characters "
        "(問題在第 3 層，根在第 4 層), text one or two sentences, citations = manifest ids. priority_short = the order of action in at most 20 characters. "
        "units[].thickness = how well the record covers that unit: verdict enough|thin|thinnest|empty (thinnest = the one thinnest unit; empty = the user left it blank), "
        "note = why in at most 30 characters (沒有逐次數字), fill_by = the next_steps method that would fill it. gaps[].path = the unit a gap is about, "
        "gaps[].citations = the lines it is about. solutions.recommended = the name of the option you recommend (one of options[].name). "
        "next_steps[].short = the step in at most 12 characters for the journey row, on_path = true for the 1-2 steps on the recommended path (the others are "
        "alternatives), why = why this step now, in one sentence. loop.feeders = at most 2 beliefs or rules that feed a loop node from outside the loop "
        "each citing the record, to = the node it feeds; a feeder is not a loop node.")
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


def move_unresolvable_prefills_to_needs_input(
    interpretation: dict[str, Any],
    manifest: list[Mapping[str, Any]],
    target_record_fields: "Callable[[str], set[str] | None] | None" = None,
) -> None:
    """Preserve a next step without claiming unsupported record data is prefilled. ``target_record_fields``
    (method_id -> its record schema's top-level property names, or None when the target cannot be resolved):
    a prefill key the model invented that is not a real field of the TARGET tool's own record is exactly as
    unusable as a prefill value that is not a real manifest id (N-13) -- both go to needs_input instead."""
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
        fields = target_record_fields(step["method_id"]) if target_record_fields and isinstance(step.get("method_id"), str) else None
        not_target = [field for field in step["prefill"] if fields is not None and field not in fields]
        for field in not_target:   # a key the target tool does not have is nothing the user can fill there either: it goes, not to needs
            del step["prefill"][field]
        invalid_fields = [field for field, value in step["prefill"].items() if not isinstance(value, str) or value not in manifest_ids]
        for field in invalid_fields:   # a real target field whose value is no manifest line: the user fills it
            del step["prefill"][field]
            if isinstance(field, str) and field not in step["needs_input"]:
                step["needs_input"].append(field)
        if fields is not None:   # a needs entry is a target field or the model's own words; a stray key of another tool (structures) is neither
            step["needs_input"] = [need for need in step["needs_input"] if not (isinstance(need, str) and re.fullmatch(r"[a-z_]+", need) and need not in fields)]


def normalize_gaps_without_inventing_evidence(interpretation: dict[str, Any], language: str) -> None:
    """Keep model-identified gaps while stating when required evidence was not specified."""
    gaps = interpretation.get("gaps")
    if not isinstance(gaps, list):
        return
    unspecified = "未指定；需使用者補充證據" if language.startswith("zh") else "Not specified; user must supply evidence"
    normalized: list[dict[str, str]] = []
    for gap in gaps:
        if isinstance(gap, str) and gap.strip(): gap = {"text": gap}   # a model's bare-string gap is still a gap (P-08)
        if not isinstance(gap, Mapping) or not isinstance(gap.get("text"), str) or not gap["text"].strip():
            continue
        needed = gap.get("needed_evidence")
        normalized.append({"text": gap["text"], "needed_evidence": needed if isinstance(needed, str) and needed.strip() else unspecified,
                           **{key: gap[key] for key in ("path", "citations") if key in gap}})   # 1.3.0: what the gap is about
    interpretation["gaps"] = normalized


def add_blank_unit_gaps(interpretation: dict[str, Any], manifest: list[Mapping[str, Any]], language: str) -> dict[str, list[str]]:
    """Every unit of the record the user left blank is a gap, with its path so the page names the field (P-08: the page
    said 空白，列成證據缺口 while no gap was listed). A gap the model already gave that path is not repeated."""
    thickness = data_thickness_from_manifest(manifest)
    gaps = interpretation.get("gaps") if isinstance(interpretation.get("gaps"), list) else []
    covered = {gap.get("path") for gap in gaps if isinstance(gap, Mapping)}
    zh = language.startswith("zh")
    added = []
    for unit, counts in thickness.items():
        path = f"r/{unit}"
        if counts.get("own_statements") == 0 and path not in covered:
            gaps.append({"text": "這一層你沒有填" if zh else "You left this unit blank", "needed_evidence": "這一層的具體事實或紀錄" if zh else "Facts or records for this unit", "path": path})
            added.append(path)
    if added: interpretation["gaps"] = gaps
    return {"gaps": [f"{path} left blank: listed as a gap" for path in added]} if added else {}


def add_missing_source_gap(interpretation: dict[str, Any], manifest: list[Mapping[str, Any]], language: str) -> dict[str, list[str]]:
    """No gap listed although nothing outside the user's own words was read: that absence is itself the gap (P-08: the
    page must never say 沒有缺口 on a record-only analysis). -> repaired notes."""
    if interpretation.get("gaps") or any(item.get("kind") == "project_source" for item in manifest):
        return {}
    zh = language.startswith("zh")
    interpretation["gaps"] = [{"text": "本次沒有外部來源；結論只根據你填的內容" if zh else "No external source; the conclusions rest on your own words only",
                               "needed_evidence": "真實紀錄或外部資料（逐次數字、訪談、文件）" if zh else "Real records or outside data"}]
    return {"gaps": ["no gap listed and no external source: the missing-source gap added"]}


_ID_KEYS = frozenset({"citations", "citation", "now_citation", "path", "paths"})


def canonical_manifest_id(value: str, ids: set[str]) -> str | None:
    """``value`` as the manifest id it spells in another notation (``events[0]``, ``r.events.0``, ``/r/events/0/``), or
    None. Only an exact manifest id is ever returned: a notation is read, an id is never guessed."""
    if value in ids:
        return value
    text = re.sub(r"\[(\d+)\]", r"/\1", value.strip()).replace(".", "/").strip("/")
    for candidate in (text, f"r/{text}", f"r/{text.removeprefix('record/')}"):
        if candidate in ids:
            return candidate
    return None


def normalize_manifest_ids(interpretation: dict[str, Any], manifest: list[Mapping[str, Any]]) -> dict[str, list[str]]:
    """Every field that holds a manifest id (citations, path(s), a trend point's citation, visual bindings except a
    level's label, next-step prefill values) rewritten to the id it spells -> repaired, by section."""
    ids = {str(item.get("id")) for item in manifest}
    repaired: dict[str, list[str]] = {}
    def fix(value: Any, where: str) -> Any:
        if isinstance(value, str) and value not in ids and (canonical := canonical_manifest_id(value, ids)) is not None:
            repaired.setdefault(re.split(r"[.\[]", where, maxsplit=1)[0], []).append(f"{where} {value!r} -> {canonical!r}")
            return canonical
        return value
    def walk(node: Any, where: str, ids_here: bool = False) -> Any:
        if isinstance(node, dict):
            for key, child in node.items():
                path = f"{where}.{key}" if where else str(key)
                node[key] = walk(child, path, (ids_here or key in _ID_KEYS or key in ("bindings", "prefill")) and key != "label")
            return node
        if isinstance(node, list):
            for index, child in enumerate(node):
                node[index] = walk(child, f"{where}[{index}]", ids_here)
            return node
        return fix(node, where) if ids_here else node
    walk(interpretation, "")
    return repaired


def citation_problems(interpretation: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> str:
    """What citation_integrity refused, in words the retry can act on: the non-manifest ids and the uncited claims."""
    ids = {str(item.get("id")) for item in manifest}
    unknown = sorted({c for c in _citation_ids(interpretation) if c not in ids})
    uncited = [f"{section}[{index}]" for section in ("findings", "recommendations") for index, claim in enumerate(interpretation.get(section) or [])
               if isinstance(claim, Mapping) and (section == "findings" or claim.get("action")) and not (isinstance(claim.get("citations"), list) and claim["citations"])]
    parts = []
    if not interpretation.get("findings"):
        parts.append("no findings")
    if unknown:
        parts.append("citations not in MANIFEST: " + json.dumps(unknown[:12], ensure_ascii=False))
    if uncited:
        parts.append("claims without citations: " + json.dumps(uncited, ensure_ascii=False))
    if not parts:
        return ""
    example = json.dumps(sorted(ids)[:3], ensure_ascii=False)
    return "; " + "; ".join(parts) + f" (cite only MANIFEST ids, copied exactly, e.g. {example})"


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
DETAIL_KEYS = ("headline", "summary", "diagnosis", "units", "focus", "priority", "priority_short", "solutions", "loop", "trend")


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


_CIRCLED = re.compile("[\u2460-\u2473\u24eb-\u24f4\u2776-\u2793]")          # ①…⑳ section marks (NFKC would make ⑦ a 7)
_ORDINAL = re.compile(r"第\s*[0-9一二兩三四五六七八九十]+\s*(?:層級|層|步)")      # 第 3 層: a layer of the method, not a fact of the case
_CJK_COUNT = re.compile(r"([零〇一二兩三四五六七八九十百千萬]+)\s*(個人|位|人|名|成|倍)")   # 四個人, 兩位, 三成: a quantity in words
_CJK_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_CJK_UNIT = {"十": 10, "百": 100, "千": 1000}


def _cjk_int(word: str) -> int | None:
    total = section = digit = 0
    for ch in word:
        if ch in _CJK_DIGIT: digit = _CJK_DIGIT[ch]
        elif ch in _CJK_UNIT: section += (digit or 1) * _CJK_UNIT[ch]; digit = 0
        elif ch == "萬": total += (section + digit) * 10000; section = digit = 0
        else: return None
    return total + section + digit


def _words_to_digits(match: "re.Match[str]") -> str:
    value = _cjk_int(match.group(1))
    if value is None: return match.group(0)
    return f"{value * 10}%" if match.group(2) == "成" else f"{value}{match.group(2)}"


def _numbers(text: str) -> list[str]:
    """Every number ``text`` states, one canonical text each. Digits (any width), and quantities in Chinese words with a
    count word (四個人 -> 4, 三成 -> 30); ordinals of layers/steps and circled section marks are structure, not claims."""
    normal = unicodedata.normalize("NFKC", _CIRCLED.sub(" ", text)).replace("−", "-")
    normal = _CJK_COUNT.sub(_words_to_digits, _ORDINAL.sub(" ", normal))
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


# Enum words a model writes for the contract's values (P-12: "medium" once refused a whole answer).
ENUM_SYNONYMS: dict[str, str] = {
    "medium": "mid", "moderate": "mid", "middle": "mid", "中": "mid", "中等": "mid", "中低": "mid", "very_high": "max", "highest": "max",
    "最高": "max", "高": "high", "低": "low", "reinforcing_loop": "reinforcing", "增強": "reinforcing", "自我加強": "reinforcing",
    "balancing_loop": "balancing", "平衡": "balancing", "自我平衡": "balancing",
}
CONFORM_KEYS = ("findings", "recommendations", "gaps", "next_steps", "headline", "summary", "diagnosis", "units", "focus", "priority", "priority_short", "solutions", "loop", "trend")


def load_interpretation_schema(spec_root: Path) -> dict[str, Any]:
    value = yaml.safe_load((spec_root / INTERPRETATION_SCHEMA_FILE).read_text(encoding="utf-8"))
    if not isinstance(value, dict): raise InvariantViolation("INTERPRETATION_SCHEMA_INVALID")
    return value


def conform_to_schema(interpretation: Mapping[str, Any], schema: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, list[str]], dict[str, list[str]]]:
    """The model's answer brought inside the contract at the smallest grain (P-06: one empty field, one over-long brief or
    one fourth metric used to cost a whole section): an array item the schema refuses goes alone; an optional field it
    refuses goes alone; an array over maxItems keeps its first items; a known synonym becomes the enum value; a key the
    contract does not have goes. What cannot be fixed at that grain -- a required field of a section, an array left under
    minItems -- is left for ``settle`` to drop the section. -> (answer, removed, repaired), notes by top-level key."""
    removed: dict[str, list[str]] = {}
    repaired: dict[str, list[str]] = {}
    def note(bucket: dict[str, list[str]], where: str, message: str) -> None: bucket.setdefault(where.split(".")[0].split("[")[0], []).append(f"{where}: {message}")

    def fits(value: Any, node: Mapping[str, Any], where: str) -> tuple[Any, str]:
        """(value, "") when it fits after item-grain repair; (value, why) when it does not."""
        kind = node.get("type")
        if "enum" in node and isinstance(value, str) and value not in node["enum"]:
            synonym = ENUM_SYNONYMS.get(value.strip().lower(), ENUM_SYNONYMS.get(value.strip()))
            if synonym in node["enum"]: note(repaired, where, f"{value!r} read as {synonym!r}"); value = synonym
        if kind == "string":
            if not isinstance(value, str): return value, "not a string"
            if len(value.strip()) < int(node.get("minLength", 0)): return value, "empty"
            if "maxLength" in node and len(value) > int(node["maxLength"]): return value, f"longer than {node['maxLength']} characters"
            if "enum" in node and value not in node["enum"]: return value, f"{value!r} is not one of {node['enum']}"
            return value, ""
        if kind in ("number", "integer"):
            if isinstance(value, str):
                try: value = float(value.replace(",", "")); note(repaired, where, "a number written as text read as a number")
                except ValueError: return value, "not a number"
            if isinstance(value, bool) or not isinstance(value, (int, float)): return value, "not a number"
            return (int(value) if kind == "integer" and float(value).is_integer() else value), ""
        if kind == "object":
            if not isinstance(value, Mapping): return value, "not an object"
            properties = node.get("properties") or {}
            required = set(node.get("required") or [])
            out = dict(value)
            if node.get("additionalProperties") is False and properties:
                for key in [k for k in out if k not in properties]:
                    del out[key]; note(repaired, where, f"{key!r} is not in the contract; left out")
            for key, child in properties.items():
                if key not in out or not isinstance(child, Mapping) or "$ref" in child or "oneOf" in child: continue
                if out[key] is None and key not in required: del out[key]; continue
                fixed, why = fits(out[key], child, f"{where}.{key}")
                if not why: out[key] = fixed
                elif key in required: return out, f"{key}: {why}"
                elif why == "empty": del out[key]; note(repaired, f"{where}.{key}", "empty; left out")   # an empty optional field is an absent one, nothing lost
                else: del out[key]; note(removed, f"{where}.{key}", f"{why}; removed")
            missing = [key for key in required if key not in out]
            return out, (f"missing {missing}" if missing else "")
        if kind == "array":
            if not isinstance(value, list): return value, "not an array"
            item_node = node.get("items") if isinstance(node.get("items"), Mapping) else {}
            kept = []
            for index, item in enumerate(value):
                fixed, why = fits(item, item_node, f"{where}[{index}]") if item_node else (item, "")
                if why: note(removed, f"{where}[{index}]", f"{why}; removed")
                else: kept.append(fixed)
            if "maxItems" in node and len(kept) > int(node["maxItems"]):
                note(removed, where, f"{len(kept)} items, the contract allows {node['maxItems']}; kept the first {node['maxItems']}")
                kept = kept[: int(node["maxItems"])]
            if len(kept) < int(node.get("minItems", 0)): return kept, f"fewer than {node['minItems']} items"
            return kept, ""
        return value, ""

    out = copy.deepcopy(dict(interpretation))
    properties = schema.get("properties") or {}
    for key in [k for k in out if properties and k not in properties]:   # a root key the contract does not have (revision_conditions at the root) used to refuse the answer
        del out[key]; note(repaired, key, "not in the contract; left out")
    for key in CONFORM_KEYS:
        if key not in out or key not in properties: continue
        if out[key] is None: del out[key]; continue
        fixed, why = fits(out[key], properties[key], key)
        if not why: out[key] = fixed
        elif key == "headline": del out[key]; note(removed, key, f"{why}; removed")   # the page title falls back to the tool's name
        else: out[key] = fixed   # a section (or a core list) the item grain could not save: settle / the core gates decide
    return out, removed, repaired


def answer_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    """The contract as the answer's JSON Schema for the tool call (P-48; ``structured.tool_schema``), the server's keys out.
    Guidance for the model; conform_to_schema and the gates stay the authority."""
    result = tool_schema(schema, drop=SERVER_KEYS)
    result.setdefault("properties", {})["visual"] = {"type": "object", "required": ["kind", "bindings"], "properties": {"kind": {"type": "string"}, "bindings": {"type": "object"}}}
    return result


def repair_next_steps(interpretation: dict[str, Any], active_method_ids: set[str], excluded_method_ids: Mapping[str, str] | None = None) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """P-07: a step naming a method that is not active goes alone (it used to refuse the whole answer); next_methods keeps
    only active ids and gains every kept step's method. A step naming an excluded tool (③ draws it, the project ran it)
    goes too, as a repair -- the answer was right about the tool, only not new to this page. -> (removed, repaired)."""
    removed: dict[str, list[str]] = {}
    repaired: dict[str, list[str]] = {}
    excluded = dict(excluded_method_ids or {})
    steps = interpretation.get("next_steps")
    methods = interpretation.get("next_methods")
    methods = [m for m in methods if isinstance(m, str)] if isinstance(methods, list) else []
    left_out = [m for m in methods if m in excluded]
    if left_out:
        repaired.setdefault("next_methods", []).append(f"{left_out} left out ({', '.join(excluded[m] for m in left_out)})")
    methods = [m for m in methods if m not in excluded]
    if isinstance(steps, list):
        kept = []
        for index, step in enumerate(steps):
            method = step.get("method_id") if isinstance(step, Mapping) else None
            if method in excluded: repaired.setdefault("next_steps", []).append(f"next_steps[{index}] {method} left out ({excluded[method]})")
            elif isinstance(step, Mapping) and method in active_method_ids: kept.append(step)
            else: removed.setdefault("next_steps", []).append(f"next_steps[{index}].method_id {method if isinstance(step, Mapping) else step!r} is not an active method; removed")
        interpretation["next_steps"] = kept
        for step in kept:
            if step["method_id"] not in methods: methods.append(step["method_id"]); repaired.setdefault("next_methods", []).append(f"{step['method_id']} added (a next step names it)")
    unknown = [m for m in methods if m not in active_method_ids]
    if unknown: removed.setdefault("next_methods", []).append(f"{unknown} are not active methods; removed")
    interpretation["next_methods"] = [m for m in methods if m in active_method_ids]
    return removed, repaired


def repair_claims(interpretation: dict[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Every claim cites the manifest (N-39): a finding or recommendation with no citation, or citing a non-manifest id, goes
    alone while at least one finding stays (none left = the core gate refuses). A gap stating an unstated number goes
    (P-13). With no external source a finding's confidence is at most mid (N-33). -> (removed, repaired)."""
    ids = {str(item.get("id")) for item in manifest}
    in_record = frozenset(_record_numbers(record, manifest))
    removed: dict[str, list[str]] = {}
    repaired: dict[str, list[str]] = {}
    def supported(claim: Any) -> bool:
        citations = claim.get("citations") if isinstance(claim, Mapping) else None
        return isinstance(citations, list) and bool(citations) and all(isinstance(c, str) and c in ids for c in citations)
    findings = interpretation.get("findings")
    if isinstance(findings, list) and any(supported(f) for f in findings):
        for index, finding in enumerate(findings):
            if not supported(finding): removed.setdefault("findings", []).append(f"findings[{index}] cites no manifest id; removed")
        interpretation["findings"] = [f for f in findings if supported(f)]
    recommendations = interpretation.get("recommendations")
    if isinstance(recommendations, list):
        for index, item in enumerate(recommendations):
            if not supported(item): removed.setdefault("recommendations", []).append(f"recommendations[{index}] cites no manifest id; removed")
        interpretation["recommendations"] = [item for item in recommendations if supported(item)]
    gaps = interpretation.get("gaps")
    if isinstance(gaps, list):
        kept = []
        for index, gap in enumerate(gaps):
            unstated = [n for n in _numbers(str(gap.get("text", ""))) if n not in in_record] if isinstance(gap, Mapping) else []
            if unstated: removed.setdefault("gaps", []).append(f"gaps[{index}].text states {unstated}, which the record does not; removed")
            else: kept.append(gap)
        interpretation["gaps"] = kept
    if not any(item.get("kind") == "project_source" for item in manifest):
        for index, finding in enumerate(interpretation.get("findings") or []):
            confidence = finding.get("confidence") if isinstance(finding, dict) else None
            if isinstance(confidence, dict) and confidence.get("level") == "high":
                confidence["level"] = "mid"; repaired.setdefault("findings", []).append(f"findings[{index}].confidence high -> mid (no external source)")
    return removed, repaired


def repair_details(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> tuple[dict[str, Any], dict[str, list[str]], dict[str, list[str]]]:
    """The interpretation with every unverifiable item repaired or removed alone -> (answer, removed, repaired), by section.
    A metric whose current value has no citation gets the one record line that states its numbers (repaired), or goes
    (removed); an option's unknown paths go; a unit whose path or citations are not manifest ids, or whose meaning states
    an unstated number, goes; a trend point not stated by the line it cites goes (a series left with one point, too).
    Only ``removed`` is worth asking the model again for (P-09: a repaired citation once cost a paid retry)."""
    ids = {str(item.get("id")) for item in manifest}
    in_record = frozenset(_record_numbers(record, manifest))
    done: dict[str, list[str]] = {}
    repaired: dict[str, list[str]] = {}
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
                    repaired.setdefault("solutions", []).append(f"solutions.metrics[{index}].now_citation {cite!r} did not state {claimed}; {stating[0]} does, so it was set")
                else:
                    note("solutions", f"solutions.metrics[{index}].now states {claimed} and no single record line states it (citation {cite!r}); removed")
            solutions["metrics"] = kept
            if not kept: del solutions["metrics"]
        fixed["solutions"] = solutions
    loop = fixed.get("loop")
    if isinstance(loop, Mapping) and isinstance(loop.get("feeders"), list):
        loop = dict(loop)
        node_ids = {node.get("id") for node in loop.get("nodes") or [] if isinstance(node, Mapping)}
        kept_feeders = []
        for index, feeder in enumerate(loop["feeders"]):
            cites = feeder.get("citations") if isinstance(feeder, Mapping) else None
            unstated = [n for n in _numbers(str(feeder.get("text", ""))) if n not in in_record] if isinstance(feeder, Mapping) else []
            if not isinstance(feeder, Mapping) or not isinstance(cites, list) or not cites or any(c not in ids for c in cites):
                note("loop", f"loop.feeders[{index}] does not cite the manifest; removed")
            elif feeder.get("to") not in node_ids: note("loop", f"loop.feeders[{index}].to {feeder.get('to')!r} is not a loop node; removed")
            elif unstated: note("loop", f"loop.feeders[{index}] states {unstated}, which the record does not; removed")
            else: kept_feeders.append(dict(feeder))
        if kept_feeders: loop["feeders"] = kept_feeders
        else: loop.pop("feeders", None)
        fixed["loop"] = loop
    steps = fixed.get("next_steps") if isinstance(fixed.get("next_steps"), list) else []
    step_methods = {step.get("method_id") for step in steps if isinstance(step, Mapping)}
    for index, unit in enumerate(fixed.get("units") or []):
        thickness = unit.get("thickness") if isinstance(unit, dict) else None
        if isinstance(thickness, dict) and thickness.get("fill_by") is not None and thickness.get("fill_by") not in step_methods:
            thickness.pop("fill_by"); repaired.setdefault("units", []).append(f"units[{index}].thickness.fill_by names no next step; left out")
    solutions = fixed.get("solutions")
    if isinstance(solutions, dict) and "recommended" in solutions:
        names = {option.get("name") for option in solutions.get("options") or [] if isinstance(option, Mapping)}
        if solutions["recommended"] not in names:
            solutions.pop("recommended"); repaired.setdefault("solutions", []).append("solutions.recommended names no option; left out")
    if isinstance(solutions, dict) and isinstance(solutions.get("plan"), list):   # 1.4.0: a row serves options that exist
        names = {option.get("name") for option in solutions.get("options") or [] if isinstance(option, Mapping)}
        for index, row in enumerate(solutions["plan"]):
            if isinstance(row, dict) and isinstance(row.get("options"), list):
                unknown = [name for name in row["options"] if name not in names]
                if unknown:
                    row["options"] = [name for name in row["options"] if name in names]
                    if not row["options"]: del row["options"]
                    repaired.setdefault("solutions", []).append(f"solutions.plan[{index}].options {unknown} name no option; left out")
    on_path = [step for step in steps if isinstance(step, dict) and step.get("on_path") is True]
    for step in on_path[2:]:
        step["on_path"] = False; repaired.setdefault("next_steps", []).append(f"{step.get('method_id')} on_path: at most two steps are on the path; set false")
    for index, gap in enumerate(fixed.get("gaps") or []):
        if not isinstance(gap, dict): continue
        if "path" in gap and gap["path"] not in ids: gap.pop("path"); repaired.setdefault("gaps", []).append(f"gaps[{index}].path is not a manifest id; left out")
        if isinstance(gap.get("citations"), list):
            known = [c for c in gap["citations"] if c in ids]
            if len(known) != len(gap["citations"]): repaired.setdefault("gaps", []).append(f"gaps[{index}] cited non-manifest ids; kept {known}")
            if known: gap["citations"] = known
            else: gap.pop("citations")
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
    return fixed, done, repaired


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
    facts("headline", "headline", interpretation.get("headline"))   # the page title: one bad number costs the title, not the answer (P-05)
    facts("summary", "summary", interpretation.get("summary"))
    facts("priority", "priority", interpretation.get("priority"))
    facts("priority_short", "priority_short", interpretation.get("priority_short"))
    diagnosis = interpretation.get("diagnosis")
    if isinstance(diagnosis, Mapping):
        facts("diagnosis", "diagnosis.title", diagnosis.get("title"))
        facts("diagnosis", "diagnosis.text", diagnosis.get("text"))
        unknown = [c for c in (diagnosis.get("citations") if isinstance(diagnosis.get("citations"), list) else []) if c not in ids]
        if unknown: bad("diagnosis", f"diagnosis cites {unknown}, not manifest ids")
    def cites(section: str, where: str, citations: Any) -> None:
        unknown = [c for c in (citations if isinstance(citations, list) else []) if c not in ids]
        if unknown: bad(section, f"{where} cites {unknown}, not manifest ids")
    for index, unit in enumerate(interpretation.get("units") or []):
        if isinstance(unit, Mapping):
            if unit.get("path") not in ids: bad("units", f"units[{index}].path {unit.get('path')!r} is not a manifest id")
            cites("units", f"units[{index}]", unit.get("citations"))
            facts("units", f"units[{index}].meaning", unit.get("meaning"))
            facts("units", f"units[{index}].brief", unit.get("brief"))
            if isinstance(unit.get("thickness"), Mapping): facts("units", f"units[{index}].thickness.note", unit["thickness"].get("note"))
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
        facts("loop", "loop.name", loop.get("name"))
        if len(node_ids) != len(nodes): bad("loop", "loop.nodes ids repeat")
        if any(edge.get("from") not in node_ids or edge.get("to") not in node_ids for edge in edges): bad("loop", "loop.edges name a node that does not exist")
        elif not (node_ids <= {edge.get("from") for edge in edges} and node_ids <= {edge.get("to") for edge in edges}): bad("loop", "loop does not close: every node needs an arrow in and out")
    trend = interpretation.get("trend")
    if isinstance(trend, Mapping):
        facts("trend", "trend.reading", trend.get("reading"))
        facts("trend", "trend.question", trend.get("question"))
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
    def reason(finding: Mapping[str, Any]) -> str:
        return str(finding.get("confidence", {}).get("reason", "")) if isinstance(finding.get("confidence"), Mapping) else ""
    unstated = {str(finding.get("id")): missing for finding in interpretation.get("findings", []) if isinstance(finding, Mapping)
                for missing in [[n for text in (str(finding.get("title", "")), str(finding.get("text", "")), reason(finding)) for n in _numbers(text) if n not in in_record]] if missing}
    claims = [c for c in interpretation.get("findings", []) if isinstance(c, Mapping)] + [r for r in interpretation.get("recommendations", []) if isinstance(r, Mapping) and r.get("action")]
    shared_citation_gate = evaluate_citation_integrity(interpretation, manifest_ids)
    cited = [c for c in claims if isinstance(c.get("citations"), list) and c["citations"] and all(isinstance(x, str) and x in manifest_ids for x in c["citations"])]
    citation_ok = bool(interpretation.get("findings")) and shared_citation_gate["status"] == "PASS" and not unstated
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
        {"gate_id": "citation_integrity", "status": "PASS" if citation_ok else "FAIL", "evidence": {**shared_citation_gate["evidence"], "citations": citations, "manifest_count": len(manifest), "unstated_numbers": unstated, "claims": len(claims), "cited": len(cited), "unsupported": len(claims) - len(cited)}},
        {"gate_id": "visual_bindings_resolvable", "status": "PASS" if visual_ok else "FAIL", "evidence": {"paths": binding_paths}},
        {"gate_id": "next_methods_resolvable", "status": "PASS" if next_ok else "FAIL", "evidence": {"next_methods": next_methods}},
        {"gate_id": "detail_integrity", "status": "PASS" if not detail else "FAIL", "evidence": {"problems": detail}},
    ]


def no_preset_conclusion_gate(interpretation: Mapping[str, Any]) -> dict[str, Any]:
    """無預設結論 (the mock's approve bar): what is stored is labelled the AI's inference and carries no judgment in the
    user's name -- the judgment field stays the user's to fill (a model-written one is taken out before this runs)."""
    provenance = interpretation.get("provenance") if isinstance(interpretation.get("provenance"), Mapping) else {}
    ai_labelled = provenance.get("epistemic_type") == "AI_INFERENCE" and provenance.get("authorship_state") == "AI_GENERATED"
    no_judgment = "judgment" not in interpretation
    return {"gate_id": "no_preset_conclusion", "status": "PASS" if ai_labelled and no_judgment else "FAIL",
            "evidence": {"ai_labelled": ai_labelled, "judgment_left_to_user": no_judgment}}


def validate_interpretation(schema_contracts: SchemaContracts, interpretation: Mapping[str, Any]) -> None:
    schema_contracts.validate(INTERPRETATION_SCHEMA, dict(interpretation), "MethodInterpretation")


def run_interpretation(*, method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], sources: list[Mapping[str, Any]], provider: Any, spec_root: Path, schema_contracts: SchemaContracts, active_method_ids: set[str], interpretation_id: str, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "", feedback: str = "", previous: Mapping[str, Any] | None = None, target_record_fields: "Callable[[str], set[str] | None] | None" = None, excluded_method_ids: Mapping[str, str] | None = None) -> dict[str, Any]:
    kind = visual_kind(spec_root, method_id, contract)
    manifest = build_prompt_manifest(record, sources)
    contract_schema = load_interpretation_schema(spec_root)
    system, user = build_interpretation_prompt(method_id, contract, display, record, manifest, kind, language=language, catalog_lines=catalog_lines, record_schema_text=record_schema_text, feedback=feedback, previous=previous, via_tool=offers_schema(provider), excluded_method_ids=excluded_method_ids)
    def complete(system: str, user: str) -> Any:   # API-parsed JSON with bounded thinking when the provider offers it; a fake's text otherwise
        return ask_object(provider, system, user, max_tokens=INTERPRET_MAX_TOKENS, schema=answer_schema(contract_schema), effort=INTERPRET_EFFORT)
    total_input = total_output = 0
    previous_error = ""
    gates: list[dict[str, Any]] = []
    fallback: tuple[dict[str, Any], list[dict[str, Any]], str] | None = None   # an earlier answer whose core held, its failing detail dropped
    attempts: list[dict[str, Any]] = []   # per model call: output size and why it was refused (a retry is paid for twice)

    def settle(interpretation: dict[str, Any], gates: list[dict[str, Any]], removed: dict[str, list[str]], repaired: dict[str, list[str]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
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
        return kept, gates[:3] + [{"gate_id": "detail_integrity", "status": "PASS", "evidence": {"problems": {}, "dropped": dropped, "removed": removed, "repaired": repaired}}]

    def score(kept: Mapping[str, Any], settled: list[dict[str, Any]]) -> tuple[int, int, int]:
        """More sections kept, then more findings, then fewer items removed: which of two answers the page is better with."""
        evidence = settled[3]["evidence"]
        return (sum(key in kept for key in DETAIL_KEYS), len(kept.get("findings") or []), -sum(len(v) for v in evidence["removed"].values()) - len(evidence["dropped"]))

    def merge(*buckets: dict[str, list[str]]) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for bucket in buckets:
            for key, notes in bucket.items(): out.setdefault(key, []).extend(notes)
        return out

    for attempt in range(2):
        retry_user = user if not previous_error else user + "\n\nPrevious response was refused. Correct exactly this failure: " + previous_error
        try:
            completion = complete(system, retry_user)
        except ProviderCallError as error:   # billed without a usable answer: count it; only a cut-off is worth one more try
            total_input += error.input_tokens
            total_output += error.output_tokens
            attempts.append({"output_tokens": error.output_tokens, "refused": str(error), "stop_reason": error.reason})
            if error.reason == "cut_off" and attempt == 0:
                previous_error = f"ANSWER_CUT_OFF at {error.output_tokens} output tokens before the answer closed; answer again far more briefly (see LENGTH)."
                continue
            if fallback is not None: break
            return {"interpretation": None, "gate_results": gates, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
        except InvariantViolation as error:
            timed_out = "TimeoutError" in str(error) or "wall-clock deadline" in str(error)
            attempts.append({"output_tokens": 0, "refused": str(error), "stop_reason": "timeout" if timed_out else "error"})
            if timed_out and attempt == 0:   # a slow answer is asked once more; a configuration or HTTP error is not
                previous_error = "ANSWER_TIMED_OUT: the previous answer took too long; answer again far more briefly (see LENGTH)."
                continue
            if fallback is not None: break
            return {"interpretation": None, "gate_results": gates, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
        total_input += completion.input_tokens
        total_output += completion.output_tokens
        attempts.append({"output_tokens": completion.output_tokens, "refused": None, "stop_reason": getattr(completion, "stop_reason", "")})
        try:
            interpretation = parse_object(completion)
            supplied_visual = interpretation.get("visual") if isinstance(interpretation.get("visual"), Mapping) else {}
            interpretation.update({"interpretation_id": interpretation_id, "method_id": method_id, "record_sha256": record_sha256(record), "visual": {**supplied_visual, "kind": kind}, "data_thickness": data_thickness_from_manifest(manifest), "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None}, "model": completion.model, "usage": {"input_tokens": completion.input_tokens, "output_tokens": completion.output_tokens}})
            for key in DETAIL_KEYS:   # "trend": null means omitted, not a malformed section
                if key in interpretation and interpretation[key] is None: del interpretation[key]
            model_judgment = interpretation.pop("judgment", None)   # the user's own field: never filled in their name (無預設結論)
            ids_repaired = normalize_manifest_ids(interpretation, manifest)   # before anything reads an id
            move_unresolvable_prefills_to_needs_input(interpretation, manifest, target_record_fields)
            normalize_gaps_without_inventing_evidence(interpretation, language)
            normalize_layered_visual_bindings(interpretation)
            steps_removed, steps_repaired = repair_next_steps(interpretation, active_method_ids, excluded_method_ids)
            interpretation, schema_removed, schema_repaired = conform_to_schema(interpretation, contract_schema)
            claims_removed, claims_repaired = repair_claims(interpretation, record, manifest)
            gaps_repaired = merge(add_blank_unit_gaps(interpretation, manifest, language), add_missing_source_gap(interpretation, manifest, language))
            interpretation, detail_removed, detail_repaired = repair_details(interpretation, record, manifest)
            removed = merge(steps_removed, schema_removed, claims_removed, detail_removed)
            repaired = merge(ids_repaired, steps_repaired, schema_repaired, claims_repaired, gaps_repaired, detail_repaired,
                             {"judgment": ["the model wrote a judgment; the judgment is the user's, left out"]} if model_judgment is not None else {})
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
                    detail += ". Use exact ACTIVE ids; every next_steps.method_id also in next_methods."
                unstated = gates[0]["evidence"].get("unstated_numbers") if "citation_integrity" in core_failed else None
                if "citation_integrity" in core_failed:
                    detail += citation_problems(interpretation, manifest)
                if unstated:
                    detail += "; findings/headline state numbers the record does not: " + json.dumps(unstated, ensure_ascii=False) + " (state only numbers written in the record)"
                raise InvariantViolation("INTERPRETATION_GATE_FAILED: " + "; ".join(core_failed) + detail)
            kept, settled = settle(interpretation, gates, removed, repaired)
            settled = settled + [no_preset_conclusion_gate(kept)]
            kept["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
            dropped = settled[3]["evidence"]["dropped"]
            if fallback is not None and score(fallback[0], fallback[1]) > score(kept, settled):   # the retry lost more than it gained (P-10)
                attempts[-1]["refused"] = "KEPT_FIRST_ANSWER: the second answer kept less (sections, findings, removed items)"
                break
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
            if completion.output_tokens >= INTERPRET_MAX_TOKENS:   # a text answer (fakes, a text fallback) ran into the ceiling: the JSON never closed
                previous_error = f"ANSWER_CUT_OFF at {completion.output_tokens} output tokens before the JSON closed; answer again far more briefly (see LENGTH). Parser: {error}"
            attempts[-1]["refused"] = previous_error
    if fallback is not None:
        kept, settled, model = fallback
        kept["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
        return {"interpretation": kept, "gate_results": settled, "error": None, "model": model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
    return {"interpretation": None, "gate_results": gates, "error": f"INTERPRETATION_REJECTED_AFTER_REPAIR: {previous_error}", "model": provider.model, "input_tokens": total_input, "output_tokens": total_output, "attempts": attempts}
