"""Small, deterministic Workflow IR executor.

This is the runtime seam between a compiled Recipe and domain adapters.  It
does not know about a particular method or provider: callers register handlers
for the IR node references and provide the initial context.  The executor
resolves declared input paths, stops on the first failure, and returns a
serialisable step ledger so a durable runner can be added later without
changing Method contracts.

The deliberately narrow contract is the first vertical slice of Master Plan
§9: no implicit LLM fallback, no guessed input, and no partial success marked
as a successful run.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation


Handler = Callable[[dict[str, Any], dict[str, Any]], Mapping[str, Any]]


@dataclass(frozen=True)
class WorkflowStepResult:
    """One observed node execution, suitable for an audit/manifest adapter."""

    index: int
    label: str
    node_kind: str
    ref: str
    status: str
    input_paths: tuple[str, ...]
    output: dict[str, Any] | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "index": self.index,
            "label": self.label,
            "node_kind": self.node_kind,
            "ref": self.ref,
            "status": self.status,
            "input_paths": list(self.input_paths),
        }
        if self.output is not None:
            result["output"] = self.output
        if self.error is not None:
            result["error"] = self.error
        return result


@dataclass(frozen=True)
class WorkflowRunResult:
    """Complete run result; ``SUCCEEDED`` is only possible when every node ran."""

    workflow_id: str
    status: str
    context: dict[str, Any]
    steps: tuple[WorkflowStepResult, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "status": self.status,
            "context": self.context,
            "steps": [step.as_dict() for step in self.steps],
        }


def _lookup(context: Mapping[str, Any], path: str) -> Any:
    """Resolve dotted paths without silently treating missing data as null."""
    current: Any = context
    for part in path.split("."):
        if not isinstance(current, Mapping) or part not in current:
            raise InvariantViolation(f"WORKFLOW_INPUT_NOT_FOUND: {path}")
        current = current[part]
    return current


def _input_paths(node: Mapping[str, Any]) -> tuple[str, ...]:
    declared = node.get("input")
    if declared is None:
        return ()
    if isinstance(declared, str):
        return (declared,)
    if isinstance(declared, list) and all(isinstance(item, str) for item in declared):
        return tuple(declared)
    raise InvariantViolation(f"WORKFLOW_INPUT_DECLARATION_INVALID: {declared!r}")


def _node_ref(node: Mapping[str, Any]) -> str:
    kind = node.get("node_kind")
    if kind == "method":
        ref = node.get("method_id")
    elif kind == "capability":
        ref = node.get("ref")
    else:
        raise InvariantViolation(f"WORKFLOW_NODE_KIND_UNKNOWN: {kind!r}")
    if not isinstance(ref, str) or not ref:
        raise InvariantViolation(f"WORKFLOW_NODE_REF_MISSING: {node!r}")
    return ref


def execute_workflow_ir(
    workflow_ir: Mapping[str, Any],
    initial_context: Mapping[str, Any],
    handlers: Mapping[str, Handler],
) -> WorkflowRunResult:
    """Execute a flat compiled IR with explicit handler and input resolution.

    Handler input is a mapping from each declared path to its resolved value.
    Its output is stored under ``steps.<index>`` and, when a label exists,
    under ``outputs.<slug>``.  This preserves the raw execution record while
    giving later nodes stable, explicit paths to consume.
    """
    workflow_id = workflow_ir.get("id")
    nodes = workflow_ir.get("nodes")
    if not isinstance(workflow_id, str) or not workflow_id:
        raise InvariantViolation("WORKFLOW_ID_MISSING")
    if not isinstance(nodes, list) or not nodes:
        raise InvariantViolation(f"WORKFLOW_NODES_MISSING: {workflow_id}")

    context: dict[str, Any] = dict(initial_context)
    context.setdefault("steps", {})
    context.setdefault("outputs", {})
    results: list[WorkflowStepResult] = []

    for index, raw_node in enumerate(nodes):
        if not isinstance(raw_node, Mapping):
            raise InvariantViolation(f"WORKFLOW_NODE_INVALID: index={index}")
        node = dict(raw_node)
        label = node.get("label")
        if not isinstance(label, str) or not label.strip():
            label = f"step-{index + 1}"
        ref = _node_ref(node)
        paths = _input_paths(node)
        try:
            payload = {path: _lookup(context, path) for path in paths}
            handler = handlers.get(ref)
            if handler is None:
                raise InvariantViolation(f"WORKFLOW_HANDLER_NOT_REGISTERED: {ref}")
            output = dict(handler(payload, node))
            context["steps"][str(index)] = output
            context["outputs"][label] = output
            results.append(WorkflowStepResult(index, label, node["node_kind"], ref, "SUCCEEDED", paths, output))
        except Exception as error:
            message = str(error) or error.__class__.__name__
            results.append(WorkflowStepResult(index, label, node.get("node_kind", "unknown"), ref, "FAILED", paths, error=message))
            return WorkflowRunResult(workflow_id, "FAILED", context, tuple(results))

    return WorkflowRunResult(workflow_id, "SUCCEEDED", context, tuple(results))
