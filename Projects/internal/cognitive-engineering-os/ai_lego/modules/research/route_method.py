"""Deterministic first-use method routing: catalog match first, AI only below threshold."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gateway.draft import extract_json_object
from ai_lego.platform.evolution.registry import load_champion

_TERMS = re.compile(r"[一-鿿]+|[a-z0-9]{2,}")
_MAX_CANDIDATES = 3
_SCHEMA_REF = "ai-lego://specs/cognitive/typed-objects/method-route.schema.yaml"


def _terms_of(text: str) -> list[str]:
    terms: list[str] = []
    for token in _TERMS.findall(text.lower()):
        parts = [token[i : i + 2] for i in range(0, len(token), 2)] if token[0] >= "一" else [token]
        terms.extend(part for part in parts if part not in terms)
    return terms


def _entry_text(entry: dict[str, Any], *, recipe: bool = False) -> str:
    keys = ("name_zh", "blurb_zh", "name") if recipe else ("name_zh", "blurb_zh", "name_en")
    return " ".join(str(entry.get(key) or "") for key in keys).lower()


def free_layer(catalog: Any, text: str, limit: int = _MAX_CANDIDATES) -> list[dict[str, Any]]:
    """Return the same term-hit ordering as the first-use StuckBox, with recipes included."""
    if not isinstance(text, str) or not text.strip():
        raise InvariantViolation("ROUTE_TEXT_REQUIRED: text must be a non-empty string")
    terms = _terms_of(text)
    candidates: list[dict[str, Any]] = []
    for method_id, entry in sorted(catalog.methods.items()):
        hits = sum(term in _entry_text(entry) for term in terms)
        if hits:
            candidates.append({"kind": "method", "id": method_id, "hits": hits, "score": hits / max(1, len(terms)), "why": f"catalog:{method_id}", "citations": [f"catalog:{method_id}"], "yields": str(entry.get("blurb_zh") or entry.get("name_en") or method_id), "est_cost": "低"})
    for recipe in sorted(catalog.recipes, key=lambda item: item["id"]):
        hits = sum(term in _entry_text(recipe, recipe=True) for term in terms)
        if hits:
            recipe_id = recipe["id"]
            candidates.append({"kind": "recipe", "id": recipe_id, "hits": hits, "score": hits / max(1, len(terms)), "why": f"catalog:{recipe_id}", "citations": [f"catalog:{recipe_id}"], "yields": str(recipe.get("blurb_zh") or recipe.get("name") or recipe_id), "est_cost": "低"})
    return sorted(candidates, key=lambda item: (-item["hits"], item["id"]))[:limit]


def _catalog_ids(catalog: Any) -> set[tuple[str, str]]:
    return {("method", method_id) for method_id in catalog.methods} | {("recipe", recipe["id"]) for recipe in catalog.recipes}


def _gate(gates: dict[str, dict[str, Any]], name: str, status: str, evidence: Any = None) -> None:
    gates[name] = {"gate_id": name, "status": status, "evidence": evidence if evidence is not None else {}}


def _ai_prompt(catalog: Any, text: str) -> str:
    manifest = []
    for method_id, entry in sorted(catalog.methods.items()):
        manifest.append(f"catalog:{method_id} | method | {entry.get('name_zh')} | {entry.get('blurb_zh')}")
    for recipe in sorted(catalog.recipes, key=lambda item: item["id"]):
        manifest.append(f"catalog:{recipe['id']} | recipe | {recipe.get('name_zh')} | {recipe.get('blurb_zh')}")
    return "USER TEXT:\n" + text + "\nCATALOG MANIFEST (use only these ids; cite catalog:<id>):\n" + "\n".join(manifest)


def route(text: str, *, catalog: Any, provider: Any, spec_root: Path, schema_contracts: Any) -> dict[str, Any]:
    if not isinstance(text, str) or not text.strip():
        raise InvariantViolation("ROUTE_TEXT_REQUIRED: text must be a non-empty string")
    _, defaults = load_champion(spec_root, "ux-defaults")
    try:
        threshold = float(defaults["route"]["free_layer_min_confidence"])
    except (KeyError, TypeError, ValueError):
        raise InvariantViolation("UX_DEFAULTS_ROUTE_THRESHOLD_INVALID: route.free_layer_min_confidence") from None
    free = free_layer(catalog, text)
    if free and free[0]["score"] >= threshold:
        result = {"text": text, "candidates": free, "suggested_workflow": [item["id"] for item in free], "needs_ai": False, "gates": _free_gates(free)}
        schema_contracts.validate(_SCHEMA_REF, result, "method route")
        return result
    if provider is None:
        result = {"text": text, "candidates": free, "suggested_workflow": [item["id"] for item in free], "needs_ai": True, "gates": _free_gates(free)}
        schema_contracts.validate(_SCHEMA_REF, result, "method route")
        return result
    completion = provider.complete("You route users to existing catalog methods. Return one JSON object with candidates and suggested_workflow.", _ai_prompt(catalog, text), max_tokens=1800)
    raw = extract_json_object(completion.text)
    allowed = _catalog_ids(catalog)
    candidates = []
    repaired_ids = []
    for item in raw.get("candidates", []):
        if not isinstance(item, dict) or (item.get("kind"), item.get("id")) not in allowed:
            if isinstance(item, dict) and item.get("id"):
                repaired_ids.append(item["id"])
            continue
        candidates.append(dict(item))
    workflow = [item for item in raw.get("suggested_workflow", []) if isinstance(item, str) and any(item == candidate.get("id") for candidate in candidates)]
    gates: dict[str, dict[str, Any]] = {}
    _gate(gates, "methods_resolvable", "FAIL" if repaired_ids else "PASS", {"repaired_ids": repaired_ids})
    cited = all(isinstance(item.get("why"), str) and item.get("why", "").strip() and isinstance(item.get("citations"), list) and item["citations"] and all(citation == f"catalog:{item['id']}" for citation in item["citations"]) for item in candidates)
    _gate(gates, "rationale_cited", "PASS" if cited else "FAIL")
    original_count = len(candidates)
    _gate(gates, "max_three", "PASS" if original_count <= _MAX_CANDIDATES else "FAIL", {"count": original_count})
    candidates = candidates[:_MAX_CANDIDATES]
    result = {"text": text, "candidates": candidates, "suggested_workflow": workflow, "needs_ai": False, "gates": gates, "model": completion.model, "usage": {"input_tokens": completion.input_tokens, "output_tokens": completion.output_tokens}}
    schema_contracts.validate(_SCHEMA_REF, result, "method route")
    return result


def _free_gates(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    gates = {}
    _gate(gates, "methods_resolvable", "PASS")
    _gate(gates, "rationale_cited", "PASS" if all(item.get("citations") for item in candidates) else "FAIL")
    _gate(gates, "max_three", "PASS", {"count": len(candidates)})
    return gates
