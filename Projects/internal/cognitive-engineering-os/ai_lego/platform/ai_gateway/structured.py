"""Structured answers: the one way a caller asks the model for a JSON object.

Invariant: an answer that must be a JSON object of a known shape is asked for WITH that shape (``ask_object``: the shape
is the tool's input schema, the API parses the object) and read with ``parse_object`` -- never typed as free text and
dug out afterwards. 2026-10-02: a dossier_brief answered without its shape failed the schema on both attempts.
``tests/unit/test_structured_answers_go_through_the_gateway.py`` holds every caller to this.

The shape is guidance for the model; each caller's schema validation and gates stay the authority.
"""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from ai_lego.errors import InvariantViolation

# JSON Schema keywords the tool input schema keeps; everything else (pattern, uniqueItems, $id, descriptions...) is the
# validator's business, not the model's.
TOOL_SCHEMA_KEYWORDS = frozenset({"type", "properties", "required", "items", "enum", "minLength", "maxLength", "minItems", "maxItems", "additionalProperties", "const", "oneOf", "anyOf", "minimum", "maximum"})
_MAX_REF_DEPTH = 12


def offers_schema(provider: Any) -> bool:
    """Whether ``ask_object`` will hand this provider the shape (a prompt may word its answer instruction by it)."""
    return callable(getattr(provider, "complete_json", None))


def ask_object(provider: Any, system: str, user: str, *, max_tokens: int, schema: Mapping[str, Any] | Callable[[], Mapping[str, Any]], effort: str | None = None) -> Any:
    """One model call for one JSON object. A provider that offers ``complete_json`` (the real one, and the meter around it)
    gets the shape as the tool's input schema; a test fake without it answers as text. ``schema`` may be a function: it is
    built only for a provider that takes it. Read the answer with ``parse_object``."""
    if offers_schema(provider):
        options: dict[str, Any] = {"input_schema": dict(schema() if callable(schema) else schema)}
        if effort is not None:
            options["effort"] = effort
        return provider.complete_json(system, user, max_tokens=max_tokens, **options)
    return provider.complete(system, user, max_tokens=max_tokens)


def parse_object(completion: Any) -> dict[str, Any]:
    return extract_json_object(completion.text)


def extract_json_object(text: str) -> dict[str, Any]:
    """First balanced top-level JSON object in ``text``; fences and surrounding prose are tolerated."""
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE | re.MULTILINE)
    start = stripped.find("{")
    if start < 0:
        raise InvariantViolation("AI_DRAFT_NOT_JSON: no object in model output")
    decoder = json.JSONDecoder()
    try:
        parsed, _ = decoder.raw_decode(stripped[start:])
    except json.JSONDecodeError as error:
        raise InvariantViolation(f"AI_DRAFT_NOT_JSON: {error.msg} at char {error.pos}") from None
    if not isinstance(parsed, dict):
        raise InvariantViolation("AI_DRAFT_NOT_JSON: top-level value is not an object")
    return parsed


def tool_schema(schema: Mapping[str, Any], *, lookup: Callable[[str], Mapping[str, Any]] | None = None, drop: Iterable[str] = ()) -> dict[str, Any]:
    """A spec schema as a tool input schema: ``$ref`` inlined through ``lookup`` (without one, or past the depth limit, a
    ref becomes ``{}`` -- any value), standard keywords only, the root ``drop`` keys (what the server fills) left out of
    ``properties`` and ``required``."""

    def clean(node: Any, resolve: Callable[[str], tuple[Mapping[str, Any], Any]] | None, depth: int) -> Any:
        if not isinstance(node, Mapping):
            return node
        if "$ref" in node:
            if resolve is None or depth >= _MAX_REF_DEPTH:
                return {}
            target, inner = resolve(node["$ref"])
            return clean(target, inner, depth + 1)
        out: dict[str, Any] = {}
        for key, value in node.items():
            if key not in TOOL_SCHEMA_KEYWORDS:
                continue
            if key == "properties" and isinstance(value, Mapping):
                out[key] = {name: clean(child, resolve, depth) for name, child in value.items()}
            elif key == "items" or (key == "additionalProperties" and isinstance(value, Mapping)):
                out[key] = clean(value, resolve, depth)
            elif key in ("oneOf", "anyOf") and isinstance(value, list):
                out[key] = [clean(child, resolve, depth) for child in value]
            else:
                out[key] = copy.deepcopy(value)
        return out

    result = clean(schema, _resolver(lookup) if lookup else None, 0)
    dropped = set(drop)
    if dropped:
        for key in dropped:
            result.get("properties", {}).pop(key, None)
        if "required" in result:
            result["required"] = [key for key in result["required"] if key not in dropped]
    return result


def _resolver(lookup: Callable[[str], Any]) -> Callable[[str], tuple[Mapping[str, Any], Any]]:
    """``lookup`` = a ``referencing`` resolver's ``lookup`` (``SchemaContracts.registry.resolver().lookup``): each hop
    returns the target and the resolver to read the target's own relative refs with."""

    def resolve(ref: str) -> tuple[Mapping[str, Any], Any]:
        resolved = lookup(ref)
        return resolved.contents, _resolver(resolved.resolver.lookup)

    return resolve


def schema_lookup(schema_contracts: Any, schema_id: str) -> tuple[Mapping[str, Any], Callable[[str], Any]]:
    """The schema registered under ``schema_id`` and the lookup for its refs (relative ones resolve against it)."""
    resolved = schema_contracts.registry.resolver().lookup(schema_id)
    return resolved.contents, resolved.resolver.lookup


def keep_properties(node: dict[str, Any], keys: Iterable[str]) -> dict[str, Any]:
    """``node`` (an object schema) with only ``keys`` in ``properties`` and ``required`` -- an item the server completes
    after the model wrote part of it."""
    kept = list(keys)
    out = dict(node)
    out["properties"] = {key: value for key, value in (node.get("properties") or {}).items() if key in kept}
    out["required"] = [key for key in node.get("required", []) if key in kept]
    return out


def map_property(schema: Any, key: str, change: Callable[[dict[str, Any]], dict[str, Any]]) -> Any:
    """Every ``properties[key]`` in the tree becomes ``change(its schema)`` (a field the model writes in another form than
    the stored one -- synthesis citations are the manifest's numbers until the server turns them into ids)."""
    if isinstance(schema, list):
        return [map_property(item, key, change) for item in schema]
    if not isinstance(schema, Mapping):
        return schema
    out = {name: map_property(value, key, change) for name, value in schema.items()}
    if isinstance(out.get("properties"), dict) and isinstance(out["properties"].get(key), dict):
        out["properties"][key] = change(copy.deepcopy(out["properties"][key]))
    return out
