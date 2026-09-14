"""Shared method-node runtime components for API and offline Recipe entrypoints."""

from __future__ import annotations

import datetime
from typing import Any, Callable, Mapping

from ai_lego.apps.api.dispatch import invoke_builder, invoke_gate_runner, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation


def build_method_components(
    nodes: list[Mapping[str, Any]],
    *,
    validator: str,
    provenance_kind: str = "AI_INFERENCE",
    provenance_authorship: str = "AI_GENERATED",
) -> tuple[dict[str, Callable[..., dict[str, Any]]], dict[int, Callable[..., list[dict[str, Any]]]]]:
    """Build method handlers and indexed gate runners from compiled workflow nodes.

    The factory owns only the repeated method invocation shape. Entrypoints retain
    responsibility for auth, entitlement, capability adapters, journal policy, and
    translating dispatch errors into their own transport responses.
    """
    handlers: dict[str, Callable[..., dict[str, Any]]] = {}
    gate_runners: dict[int, Callable[..., list[dict[str, Any]]]] = {}
    for index, node in enumerate(nodes):
        if node.get("node_kind") != "method":
            continue
        method_id = node.get("method_id")
        if not isinstance(method_id, str) or not method_id:
            raise InvariantViolation(f"WORKFLOW_METHOD_ID_MISSING: node={index}")
        builder = resolve_builder(method_id)
        gate_runner = resolve_gate_runner(method_id)

        def handler(payload: dict[str, Any], _node: dict[str, Any], _builder=builder) -> dict[str, Any]:
            bindings = payload.get("__bindings__")
            if not isinstance(bindings, dict):
                raise InvariantViolation("WORKFLOW_BINDINGS_REQUIRED: executor did not expose bindings")
            return invoke_builder(_builder, "", make_provenance(provenance_kind, provenance_authorship), bindings)

        def run_gate(
            output: dict[str, Any],
            context: dict[str, Any],
            _node: dict[str, Any],
            _gate_runner=gate_runner,
        ) -> list[dict[str, Any]]:
            return invoke_gate_runner(
                _gate_runner,
                output,
                context,
                validator,
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )

        handlers[method_id] = handler
        gate_runners[index] = run_gate
    return handlers, gate_runners
