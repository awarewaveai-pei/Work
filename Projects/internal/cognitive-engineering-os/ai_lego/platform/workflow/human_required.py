"""Value-judgment parameters only a human can supply -- a Recipe run refuses to execute while any bound
``source.*`` path for one is missing or empty, and AI drafting (``draft_recipe_source``) never fills them
(plan §3.4 C5, §12.8 WC-P3-02). The executor and its Recipe engine (I8) stay untouched: this is a pre-flight
check the API runs before handing bindings to it, using the exact same dotted-path convention.
"""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any, Mapping

from ai_lego.apps.api.dispatch import MethodDispatchError, resolve_builder
from ai_lego.errors import InvariantViolation
from ai_lego.platform.catalog.display_catalog import _yaml

_REGISTRY_RELATIVE_PATH = ("methods", "registry", "method-human-required.yaml")
_EMPTY_VALUES = (None, "", [], {})
_MISSING = object()


def load_human_required(spec_root: Path) -> dict[str, list[str]]:
    """method_id -> the value-judgment parameter names a human must supply. Missing/malformed registry fails
    closed (no default); a method_id that does not resolve to a builder, or a param name that is not one of
    that builder's real parameters, is the same class of error as a malformed entry -- a typo here would
    otherwise silently never exclude anything (critic M12/m10)."""
    path = spec_root.joinpath(*_REGISTRY_RELATIVE_PATH)
    if not path.is_file():
        raise InvariantViolation(f"HUMAN_REQUIRED_REGISTRY_MISSING: {path}")
    raw = _yaml(path)
    if not isinstance(raw, dict) or not all(
        isinstance(method_id, str) and method_id and isinstance(params, list) and all(isinstance(p, str) and p for p in params)
        for method_id, params in raw.items()
    ):
        raise InvariantViolation(f"HUMAN_REQUIRED_REGISTRY_INVALID: {path}")
    for method_id, params in raw.items():
        try:
            builder = resolve_builder(method_id)
        except MethodDispatchError as error:
            raise InvariantViolation(f"HUMAN_REQUIRED_REGISTRY_INVALID: {method_id!r} does not resolve to a dispatchable builder ({error})") from error
        signature_params = set(inspect.signature(builder).parameters)
        unknown = [p for p in params if p not in signature_params]
        if unknown:
            raise InvariantViolation(f"HUMAN_REQUIRED_REGISTRY_INVALID: {method_id!r} lists unknown parameter(s) {unknown} (builder has {sorted(signature_params)})")
    return raw


def _lookup_source(source: Mapping[str, Any], dotted: str) -> Any:
    current: Any = source
    for part in dotted.split("."):
        if not isinstance(current, Mapping) or part not in current:
            return _MISSING
        current = current[part]
    return current


def missing_human_required(
    workflow_ir: Mapping[str, Any],
    source: Mapping[str, Any],
    human_required: Mapping[str, list[str]],
) -> list[dict[str, Any]]:
    """Every human-only param, on any method node in ``workflow_ir``, whose bound ``source.*`` path is absent,
    empty (None, "", [], {}), or a whitespace-only string in ``source`` (critic m10 -- "   " is not a real
    weight/warrant, just whitespace that happened to survive a form round-trip). A param not bound to
    ``source.*`` in this Recipe instance is not this check's concern (nothing in the request body could have
    filled it anyway)."""
    missing: list[dict[str, Any]] = []
    nodes = workflow_ir.get("nodes")
    if not isinstance(nodes, list):
        return missing
    for index, node in enumerate(nodes):
        if not isinstance(node, Mapping) or node.get("node_kind") != "method":
            continue
        method_id = node.get("method_id")
        params = human_required.get(method_id) if isinstance(method_id, str) else None
        if not params:
            continue
        bindings = node.get("bindings")
        bindings = bindings if isinstance(bindings, Mapping) else {}
        for param in params:
            path = bindings.get(param)
            if not isinstance(path, str) or not path.startswith("source."):
                continue
            value = _lookup_source(source, path.removeprefix("source."))
            if value is _MISSING or value in _EMPTY_VALUES or (isinstance(value, str) and not value.strip()):
                missing.append({"index": index, "method_id": method_id, "param": param, "path": path})
    return missing
