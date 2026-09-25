"""Project-bound interpretation of a validated method record (PI-a C10)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

import yaml

from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation

INTERPRETATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/method-interpretation.schema.yaml"
_VISUAL_KINDS = {"layered", "quadrant", "table", "matrix", "graph", "tree", "timeline", "scorecard"}


def record_sha256(record: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json(dict(record)).encode("utf-8")).hexdigest()


def record_leaf_paths(value: Any, prefix: str = "record") -> set[str]:
    if isinstance(value, Mapping):
        # Keep both collection nodes and scalar leaves. A visual such as a
        # quadrant binds its item collection (``record.tasks``), while a
        # citation normally points at a scalar (``record.tasks.0.urgency``).
        paths: set[str] = {prefix}
        for key, child in value.items():
            paths |= record_leaf_paths(child, f"{prefix}.{key}")
        return paths
    if isinstance(value, list):
        paths: set[str] = {prefix}
        for index, child in enumerate(value):
            paths |= record_leaf_paths(child, f"{prefix}.{index}")
        return paths
    return {prefix}


def build_prompt_manifest(record: Mapping[str, Any], sources: list[Mapping[str, Any]] | None = None) -> list[dict[str, Any]]:
    def value_at(path: str) -> Any:
        current: Any = record
        for component in path.removeprefix("record.").split(".") if path != "record" else []:
            current = current[int(component)] if isinstance(current, list) else current[component]
        return current

    manifest = []
    for path in sorted(record_leaf_paths(record)):
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


def build_interpretation_prompt(method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], manifest: list[Mapping[str, Any]], kind: str) -> tuple[str, str]:
    system = "You interpret a validated Cognitive Engineering method record. Reply with exactly one JSON object, no markdown. Do not invent facts, coordinates, scores, or sources. Every finding citation must be one manifest id. Every next_methods id must be active."
    user = json.dumps({
        "method_id": method_id, "purpose": contract.get("purpose"), "description": contract.get("description"),
        "display": display or {}, "visual_kind": kind, "record": record, "prompt_manifest": manifest,
        "recommended_next": contract.get("recommended_next") or [],
        "output_shape": {"findings": [{"id": "F1", "title": "", "text": "", "citations": ["record.foo"], "confidence": {"level": "mid", "reason": ""}}], "visual": {"kind": kind, "bindings": {}}, "next_methods": contract.get("recommended_next") or [], "next_steps": [], "data_thickness": {}, "recommendations": [], "gaps": []},
    }, ensure_ascii=False)
    return system, user


def parse_interpretation(text: str) -> dict[str, Any]:
    start = text.find("{")
    if start < 0:
        raise InvariantViolation("INTERPRET_NOT_JSON")
    try:
        value, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as error:
        raise InvariantViolation(f"INTERPRET_NOT_JSON: {error.msg}") from None
    if not isinstance(value, dict):
        raise InvariantViolation("INTERPRET_OBJECT_REQUIRED")
    return value


def _citation_ids(interpretation: Mapping[str, Any]) -> list[str]:
    ids: list[str] = []
    for finding in interpretation.get("findings", []):
        if isinstance(finding, Mapping): ids.extend(c for c in finding.get("citations", []) if isinstance(c, str))
    for recommendation in interpretation.get("recommendations", []):
        if isinstance(recommendation, Mapping): ids.extend(c for c in recommendation.get("citations", []) if isinstance(c, str))
    return ids


def evaluate_interpretation_gates(interpretation: Mapping[str, Any], record: Mapping[str, Any], manifest: list[Mapping[str, Any]], active_method_ids: set[str]) -> list[dict[str, Any]]:
    manifest_ids = {str(item.get("id")) for item in manifest}
    citations = _citation_ids(interpretation)
    citation_ok = bool(interpretation.get("findings")) and bool(citations) and all(c in manifest_ids for c in citations)
    bindings = interpretation.get("visual", {}).get("bindings", {}) if isinstance(interpretation.get("visual"), Mapping) else {}
    binding_paths: list[str] = []
    def collect(value: Any) -> None:
        if isinstance(value, str) and (value.startswith("record") or value.startswith("source:")): binding_paths.append(value)
        elif isinstance(value, Mapping):
            for child in value.values(): collect(child)
        elif isinstance(value, list):
            for child in value: collect(child)
    collect(bindings)
    leaf_paths = record_leaf_paths(record)
    visual_ok = all(path in leaf_paths or path in manifest_ids for path in binding_paths)
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
        {"gate_id": "citation_integrity", "status": "PASS" if citation_ok else "FAIL", "evidence": {"citations": citations, "manifest_count": len(manifest)}},
        {"gate_id": "visual_bindings_resolvable", "status": "PASS" if visual_ok else "FAIL", "evidence": {"paths": binding_paths}},
        {"gate_id": "next_methods_resolvable", "status": "PASS" if next_ok else "FAIL", "evidence": {"next_methods": next_methods}},
    ]


def validate_interpretation(schema_contracts: SchemaContracts, interpretation: Mapping[str, Any]) -> None:
    schema_contracts.validate(INTERPRETATION_SCHEMA, dict(interpretation), "MethodInterpretation")


def run_interpretation(*, method_id: str, contract: Mapping[str, Any], display: Mapping[str, Any] | None, record: Mapping[str, Any], sources: list[Mapping[str, Any]], provider: Any, spec_root: Path, schema_contracts: SchemaContracts, active_method_ids: set[str], interpretation_id: str) -> dict[str, Any]:
    kind = visual_kind(spec_root, method_id, contract)
    manifest = build_prompt_manifest(record, sources)
    system, user = build_interpretation_prompt(method_id, contract, display, record, manifest, kind)
    total_input = total_output = 0
    previous_error = ""
    gates: list[dict[str, Any]] = []
    for attempt in range(2):
        retry_user = user if not previous_error else user + "\n\nPrevious response was refused. Correct exactly this failure: " + previous_error
        try:
            completion = provider.complete(system, retry_user, max_tokens=1800)
        except InvariantViolation as error:
            return {"interpretation": None, "gate_results": gates, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output}
        total_input += completion.input_tokens
        total_output += completion.output_tokens
        try:
            interpretation = parse_interpretation(completion.text)
            supplied_visual = interpretation.get("visual") if isinstance(interpretation.get("visual"), Mapping) else {}
            interpretation.update({"interpretation_id": interpretation_id, "method_id": method_id, "record_sha256": record_sha256(record), "visual": {**supplied_visual, "kind": kind}, "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None}, "model": completion.model, "usage": {"input_tokens": completion.input_tokens, "output_tokens": completion.output_tokens}})
            gates = evaluate_interpretation_gates(interpretation, record, manifest, active_method_ids)
            if any(g["status"] != "PASS" for g in gates):
                raise InvariantViolation("INTERPRETATION_GATE_FAILED: " + "; ".join(g["gate_id"] for g in gates if g["status"] != "PASS"))
            validate_interpretation(schema_contracts, interpretation)
            interpretation["usage"] = {"input_tokens": total_input, "output_tokens": total_output}
            return {"interpretation": interpretation, "gate_results": gates, "error": None, "model": completion.model, "input_tokens": total_input, "output_tokens": total_output}
        except (InvariantViolation, KeyError, TypeError) as error:
            previous_error = str(error)
    return {"interpretation": None, "gate_results": gates, "error": f"INTERPRETATION_REJECTED_AFTER_REPAIR: {previous_error}", "model": provider.model, "input_tokens": total_input, "output_tokens": total_output}
