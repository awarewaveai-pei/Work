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
INTERPRET_MAX_TOKENS = MAX_OUTPUT_TOKENS   # the gateway's ceiling: the result page's sections (schema 1.1.0) roughly double the answer, and a cut-off answer is unparseable
INTERPRET_TIMEOUT_SECONDS = 240.0         # an answer that long takes 2-3 minutes; the interactive 60 s default would cut it off (the job runs in the background)
MAX_SCHEMA_CHARS = 12000


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


def build_interpretation_prompt(method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], manifest: list[Mapping[str, Any]], kind: str, *, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "") -> tuple[str, str]:
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
            "findings": [{"id": "F1", "title": "", "text": "", "citations": ["r/foo"], "confidence": {"level": "mid", "reason": ""}, "revision_conditions": [{"text": "", "would_change": ""}]}],
            "visual": {"kind": kind, "bindings": binding_examples.get(kind, {})}, "next_methods": [],
            "next_steps": [{"method_id": "", "answers": "", "deepens": "", "prefill": {}, "needs_input": [], "yields": "", "est_cost": ""}],
            "recommendations": [{"level": "", "action": "", "expected": "", "citations": []}],
            "gaps": [{"text": "", "needed_evidence": ""}],
            "summary": "",
            "units": [{"path": example_path, "meaning": "", "action": "", "effect": "", "leverage": "mid", "citations": [example_path]}],
            "focus": {"path": example_path, "why": ""},
            "priority": "",
            "solutions": {"options": [{"name": "", "what": "", "takes": "", "cost": "", "durability": "", "risk": "", "advice": "", "paths": [example_path]}],
                          "first_step": "", "plan": [{"when": "", "action": "", "owner": "", "proof": "", "target": ""}],
                          "metrics": [{"name": "", "now": "", "now_citation": example_path, "target": "", "when": ""}]},
            "loop": {"kind": "reinforcing", "name": "", "reading": "", "nodes": [{"id": "n1", "text": "", "citations": [example_path]}], "edges": [{"from": "n1", "to": "n2"}]},
            "trend": {"reading": "", "series": [{"name": "", "unit": "", "points": [{"label": "", "value": 0, "citation": example_path}]}]},
        }, ensure_ascii=False),
        f"RULES: Write all narrative in {language}. The JSON shape is illustrative: omit optional arrays rather than emit empty-string examples. revision_conditions belongs inside each finding, never at the root. recommendations must contain objects, never bare strings; next_steps objects require every shown key including est_cost. Citations and every visual binding string must be a manifest id. next_methods may only use exact AVAILABLE ACTIVE METHODS ids; every next_steps.method_id must also appear in next_methods, and every next_steps.prefill value must be a MANIFEST id. If unsure of a valid next method, set both next_methods and next_steps to []. Never invent numbers or sources.",
        "RESULT PAGE SECTIONS (each optional; omit a section you cannot support from the record): summary = one sentence saying what is really going on. "
        "units = one entry per unit of the picture (layered: one per level, path = that level's binding path): meaning = what the unit tells, action = how to act at that unit, "
        "effect = what that action achieves, leverage = low|mid|high, citations = manifest ids. focus = the units path to act on first, and why. priority = the order of action in one or two sentences. "
        "solutions: 2-3 options (paths = the units each acts on) compared by what, takes (time to effect), cost, durability, risk, advice; first_step = one thing doable tomorrow with no budget and no approval; "
        "plan = at most 5 rows (when, action, owner, proof, target) - owner and target are suggestions the user confirms; metrics = at most 3 (name, now, target, when): now may contain a number only when "
        "the record states it, with now_citation = the manifest id whose text states it, otherwise say it is not measured yet; target is a suggestion. "
        "loop = the feedback loop the record shows - causes that come back around and feed themselves (usual in systems tools; omit only when the record shows none): 2-6 nodes, each citing the record, and edges that close the loop (every node has an arrow in and out); kind reinforcing|balancing. "
        "trend = only numbers written in the record: every point's value must appear in the text of the manifest id it cites; omit trend when the record has fewer than two such numbers.",
        "NUMBERS: findings (title, text), summary, priority, focus.why, units[].meaning, loop texts and trend.reading state only numbers written in the record (no differences, sums or percentages you work out); suggestions (actions, plan, targets) may propose numbers. "
        "LENGTH: the whole JSON must close well inside the output limit. At most 3 findings; every text field is one or two short sentences (about 60 Chinese characters); at most 2 recommendations, 3 gaps, 4 plan rows, 5 loop nodes, 2 next_steps; no indentation or line breaks outside strings.",
    ]
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


# Sections of the result page (schema 1.1.0). What a schema cannot check: every path/citation is a manifest id, a
# number stated as a current value or plotted comes from the record line it cites, a loop closes. A section that fails
# is dropped from what is returned (never shown unverified); the gate's evidence names what was dropped and why.
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
    normal = unicodedata.normalize("NFKC", text).replace("\u2212", "-")
    return [_number_text(float(match.group(0).replace(",", ""))) for match in _NUMBER.finditer(normal)]


def _record_numbers(record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> set[str]:
    """Every number the record states (its full text, not the manifest's 400-character preview)."""
    return {n for item in manifest if item.get("kind") == "record" for n in _numbers(_record_text(record, str(item.get("id", ""))))}


def detail_problems(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]]) -> dict[str, list[str]]:
    """-> {section: [problem, ...]} for the result-page sections present; empty when every one holds."""
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
            claimed, cite = _numbers(str(metric.get("now", ""))), metric.get("now_citation")
            if cite is not None and cite not in ids: bad("solutions", f"solutions.metrics[{index}].now_citation {cite!r} is not a manifest id")
            elif claimed and cite is None: bad("solutions", f"solutions.metrics[{index}].now states {claimed} without now_citation")
            elif claimed:
                missing = [n for n in claimed if n not in _numbers(_record_text(record, cite))]
                if missing: bad("solutions", f"solutions.metrics[{index}].now {missing} is not stated in {cite}")
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


def run_interpretation(*, method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], sources: list[Mapping[str, Any]], provider: Any, spec_root: Path, schema_contracts: SchemaContracts, active_method_ids: set[str], interpretation_id: str, language: str = "zh-TW", catalog_lines: list[str] | None = None, record_schema_text: str = "") -> dict[str, Any]:
    kind = visual_kind(spec_root, method_id, contract)
    manifest = build_prompt_manifest(record, sources)
    system, user = build_interpretation_prompt(method_id, contract, display, record, manifest, kind, language=language, catalog_lines=catalog_lines, record_schema_text=record_schema_text)
    total_input = total_output = 0
    previous_error = ""
    gates: list[dict[str, Any]] = []
    fallback: tuple[dict[str, Any], list[dict[str, Any]], str] | None = None   # an earlier answer whose core held, its failing detail dropped
    attempts: list[dict[str, Any]] = []   # per model call: output size and why it was refused (a retry is paid for twice)

    def settle(interpretation: dict[str, Any], gates: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
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
        return kept, gates[:3] + [{"gate_id": "detail_integrity", "status": "PASS", "evidence": {"problems": {}, "dropped": dropped}}]

    for attempt in range(2):
        retry_user = user if not previous_error else user + "\n\nPrevious response was refused. Correct exactly this failure: " + previous_error
        try:
            completion = provider.complete(system, retry_user, max_tokens=INTERPRET_MAX_TOKENS)
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
            move_unresolvable_prefills_to_needs_input(interpretation, manifest)
            normalize_gaps_without_inventing_evidence(interpretation, language)
            normalize_layered_visual_bindings(interpretation)
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
                    detail += "; findings state numbers the record does not: " + json.dumps(unstated, ensure_ascii=False) + " (state only numbers written in the record)"
                raise InvariantViolation("INTERPRETATION_GATE_FAILED: " + "; ".join(core_failed) + detail)
            kept, settled = settle(interpretation, gates)
            kept["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
            dropped = settled[3]["evidence"]["dropped"]
            if dropped and attempt == 0:   # the core holds; ask once more for the dropped sections, keep this answer if that fails
                fallback = (kept, settled, completion.model)
                previous_error = "DETAIL_INTEGRITY: " + json.dumps(dropped, ensure_ascii=False)
                attempts[-1]["refused"] = previous_error
                continue
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
