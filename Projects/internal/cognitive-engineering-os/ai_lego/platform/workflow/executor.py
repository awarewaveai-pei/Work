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

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from ai_lego.core.support import read_json, sha256_json, write_json
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
    contract: dict[str, Any] | None = None

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
        if self.contract is not None:
            result["contract"] = self.contract
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


def _atomic_write_journal(path: Path, payload: dict[str, Any]) -> None:
    """Publish a journal record atomically so a crash cannot expose half JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    write_json(temporary, payload)
    os.replace(temporary, path)


def _journal_record(workflow_ir: Mapping[str, Any], initial_context: Mapping[str, Any], status: str, context: dict[str, Any], steps: list[WorkflowStepResult], next_index: int) -> dict[str, Any]:
    return {
        "journal_version": 1,
        "workflow_id": workflow_ir["id"],
        "workflow_sha256": sha256_json(dict(workflow_ir)),
        "initial_context_sha256": sha256_json(dict(initial_context)),
        "status": status,
        "next_index": next_index,
        "context": context,
        "steps": [step.as_dict() for step in steps],
    }


def _restore_journal(path: Path, workflow_ir: Mapping[str, Any], initial_context: Mapping[str, Any]) -> tuple[dict[str, Any], list[WorkflowStepResult], int, str]:
    try:
        journal = read_json(path)
    except Exception as error:
        raise InvariantViolation(f"WORKFLOW_JOURNAL_UNREADABLE: {path}") from error
    if not isinstance(journal, dict) or journal.get("journal_version") != 1:
        raise InvariantViolation(f"WORKFLOW_JOURNAL_INVALID: {path}")
    if journal.get("workflow_id") != workflow_ir["id"] or journal.get("workflow_sha256") != sha256_json(dict(workflow_ir)):
        raise InvariantViolation("WORKFLOW_JOURNAL_WORKFLOW_MISMATCH")
    if journal.get("initial_context_sha256") != sha256_json(dict(initial_context)):
        raise InvariantViolation("WORKFLOW_JOURNAL_INPUT_MISMATCH")
    if journal.get("status") == "SUCCEEDED":
        expected = len(workflow_ir["nodes"])
    elif journal.get("status") == "FAILED":
        expected = journal.get("next_index")
    else:
        raise InvariantViolation(f"WORKFLOW_JOURNAL_NOT_RESUMABLE: status={journal.get('status')!r}")
    if not isinstance(expected, int) or expected < 0 or expected > len(workflow_ir["nodes"]):
        raise InvariantViolation("WORKFLOW_JOURNAL_NEXT_INDEX_INVALID")
    raw_steps = journal.get("steps")
    if not isinstance(raw_steps, list) or len(raw_steps) < expected:
        raise InvariantViolation("WORKFLOW_JOURNAL_STEPS_INCOMPLETE")
    restored: list[WorkflowStepResult] = []
    for raw in raw_steps[:expected]:
        if not isinstance(raw, dict) or raw.get("status") != "SUCCEEDED":
            raise InvariantViolation("WORKFLOW_JOURNAL_COMPLETED_STEP_INVALID")
        restored.append(WorkflowStepResult(int(raw["index"]), raw["label"], raw["node_kind"], raw["ref"], raw["status"], tuple(raw.get("input_paths", [])), raw.get("output"), raw.get("error"), raw.get("contract")))
    context = journal.get("context")
    if not isinstance(context, dict):
        raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_INVALID")
    return context, restored, expected, str(journal["status"])


def execute_workflow_ir(
    workflow_ir: Mapping[str, Any],
    initial_context: Mapping[str, Any],
    handlers: Mapping[str, Handler],
    catalogs: Mapping[str, Any] | None = None,
    journal_path: Path | None = None,
    resume: bool = False,
) -> WorkflowRunResult:
    """Execute a flat compiled IR with explicit handler and input resolution.

    Handler input is a mapping from each declared path to its resolved value.
    Its output is stored under ``steps.<index>`` and, when a label exists,
    under ``outputs.<slug>``.  This preserves the raw execution record while
    giving later nodes stable, explicit paths to consume.

    When ``catalogs`` is supplied, it must contain ``method`` and/or
    ``capability`` catalogs.  Each node is then invoked through that catalog's
    shared per-invocation gate; an implementation is never called for an
    unresolved reference.
    """
    workflow_id = workflow_ir.get("id")
    nodes = workflow_ir.get("nodes")
    if not isinstance(workflow_id, str) or not workflow_id:
        raise InvariantViolation("WORKFLOW_ID_MISSING")
    if not isinstance(nodes, list) or not nodes:
        raise InvariantViolation(f"WORKFLOW_NODES_MISSING: {workflow_id}")

    if resume and journal_path is None:
        raise InvariantViolation("WORKFLOW_RESUME_JOURNAL_REQUIRED")
    context: dict[str, Any] = dict(initial_context)
    context.setdefault("steps", {})
    context.setdefault("outputs", {})
    results: list[WorkflowStepResult] = []
    start_index = 0
    if journal_path is not None and journal_path.exists():
        if not resume:
            raise InvariantViolation(f"WORKFLOW_JOURNAL_EXISTS_REQUIRES_RESUME: {journal_path}")
        context, results, start_index, prior_status = _restore_journal(journal_path, workflow_ir, initial_context)
        if prior_status == "SUCCEEDED":
            return WorkflowRunResult(workflow_id, "SUCCEEDED", context, tuple(results))
    elif resume:
        raise InvariantViolation(f"WORKFLOW_JOURNAL_NOT_FOUND: {journal_path}")
    if journal_path is not None:
        _atomic_write_journal(journal_path, _journal_record(workflow_ir, initial_context, "RUNNING", context, results, start_index))

    for index, raw_node in enumerate(nodes[start_index:], start=start_index):
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
            contract = None
            if catalogs is not None:
                catalog = catalogs.get(node["node_kind"])
                if catalog is None:
                    raise InvariantViolation(f"WORKFLOW_CATALOG_NOT_REGISTERED: {node['node_kind']}")
                contract, raw_output = catalog.invoke(ref, handler, payload, node)
                output = dict(raw_output)
            else:
                output = dict(handler(payload, node))
            context["steps"][str(index)] = output
            context["outputs"][label] = output
            step_result = WorkflowStepResult(index, label, node["node_kind"], ref, "SUCCEEDED", paths, output, contract=contract)
            results.append(step_result)
            if journal_path is not None:
                _atomic_write_journal(journal_path, _journal_record(workflow_ir, initial_context, "RUNNING", context, results, index + 1))
        except Exception as error:
            message = str(error) or error.__class__.__name__
            failed_step = WorkflowStepResult(index, label, node.get("node_kind", "unknown"), ref, "FAILED", paths, error=message)
            results.append(failed_step)
            if journal_path is not None:
                _atomic_write_journal(journal_path, _journal_record(workflow_ir, initial_context, "FAILED", context, results, index))
            return WorkflowRunResult(workflow_id, "FAILED", context, tuple(results))

    if journal_path is not None:
        _atomic_write_journal(journal_path, _journal_record(workflow_ir, initial_context, "SUCCEEDED", context, results, len(nodes)))
    return WorkflowRunResult(workflow_id, "SUCCEEDED", context, tuple(results))
