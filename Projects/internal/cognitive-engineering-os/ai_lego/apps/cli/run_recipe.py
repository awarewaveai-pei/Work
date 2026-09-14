"""Run a validated Recipe from a caller-owned JSON source.

This is a thin command-line composition root: Recipe compilation, method
resolution, binding validation, gate dispatch, journaling, and workflow
completion all remain owned by the shared runtime. Capability execution is
limited to explicitly registered, deterministic local adapters.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api.dispatch import method_binding_issues, resolve_builder
from ai_lego.apps.recipe_runtime import build_method_components, build_registered_capability_adapters, build_registered_workflow_gate_registry
from ai_lego.core.support import read_json, write_json
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.workflow.executor import execute_workflow_ir, missing_workflow_input_paths
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir


VALIDATOR = "generic-recipe-cli"


def _runtime_dir(path: Path | None, spec_root: Path) -> Path:
    runtime = (path or PRODUCT_ROOT / ".runtime" / "recipe-cli").resolve()
    guard_runtime_dir(runtime, spec_root, PRODUCT_ROOT, PRODUCT_ROOT / ".runtime")
    prepare_runtime_dir(runtime, reset=False)
    return runtime


def run_recipe(
    recipe_id: str,
    source: dict[str, Any],
    runtime_dir: Path,
    *,
    spec_root: Path | None = None,
    run_id: str | None = None,
    resume: bool = False,
) -> dict[str, Any]:
    """Execute one ACTIVE Recipe and persist a JSON report."""
    if not isinstance(source, dict):
        raise TypeError("source must be a JSON object")
    if not isinstance(resume, bool):
        raise TypeError("resume must be a boolean")
    run_id = run_id or recipe_id
    if not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise ValueError("run_id must be 1-80 ASCII letters, numbers, '_' or '-'")
    spec_root = resolve_spec_root(spec_root)
    runtime_dir = _runtime_dir(runtime_dir, spec_root)
    workflow_ir = compile_recipe_to_workflow_ir(spec_root, recipe_id, "R1")
    nodes = workflow_ir["nodes"]
    method_ids = [node["method_id"] for node in nodes if node["node_kind"] == "method"]
    capability_ids = capability_refs(workflow_ir)
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve(method_ids)
    if resolution["blocked"] is not None:
        raise RuntimeError(f"METHOD_RESOLUTION_BLOCKED: {resolution['blocked']}")
    for node in nodes:
        if node["node_kind"] != "method":
            continue
        builder = resolve_builder(node["method_id"])
        issues = method_binding_issues(builder, node.get("bindings"))
        if issues:
            raise InvariantViolation(f"WORKFLOW_METHOD_BINDINGS_INVALID: node {node['method_id']}: {issues}")

    missing = missing_workflow_input_paths(workflow_ir, {"source": source})
    if missing:
        raise InvariantViolation(f"WORKFLOW_SOURCE_FIELDS_MISSING: {', '.join(missing)}")

    handlers, gate_runners = build_method_components(nodes, validator=VALIDATOR)
    capability_catalog = CapabilityCatalog.from_spec_root(spec_root)
    capability_resolution = capability_catalog.resolve(capability_ids)
    if capability_resolution["blocked"] is not None:
        executability = plan_executability(workflow_ir, capability_resolution)
        if not executability["executable"]:
            raise RuntimeError(f"CLI_CAPABILITY_PLAN_NOT_EXECUTABLE: {executability}")
    resolvable_capability_ids = [ref for ref in capability_ids if capability_catalog.is_resolvable(ref)]
    capability_adapters = build_registered_capability_adapters(capability_catalog, resolvable_capability_ids)
    try:
        handlers.update(capability_adapters.handlers_for(resolvable_capability_ids))
    except InvariantViolation as error:
        raise RuntimeError(f"CLI_CAPABILITY_ADAPTER_UNAVAILABLE: {error}") from error

    refs = list(workflow_ir.get("workflow_gate_refs", []))
    if "workflow_execution_integrity" not in refs:
        refs.insert(0, "workflow_execution_integrity")
    registry = build_registered_workflow_gate_registry(VALIDATOR)
    try:
        registry.require_for(refs)
    except InvariantViolation as error:
        raise RuntimeError(f"CLI_WORKFLOW_GATE_UNSUPPORTED: {error}") from error

    journal = runtime_dir / f"{run_id}.journal.json"
    result = execute_workflow_ir(
        workflow_ir,
        {"source": source},
        handlers,
        catalogs={"method": catalog, "capability": capability_catalog},
        gate_runners=gate_runners,
        workflow_gate_runner=lambda context, workflow: registry.evaluate(refs, context, workflow),
        journal_path=journal,
        resume=resume,
    )
    report = {
        "status": "PASS" if result.status == "SUCCEEDED" else "FAILED",
        "recipe_id": recipe_id,
        "run_id": run_id,
        "method_resolution": resolution,
        "capability_resolution": capability_resolution,
        "workflow": result.as_dict(),
        "journal": str(journal),
    }
    write_json(runtime_dir / f"{run_id}.result.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe_id")
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--runtime-dir", type=Path)
    parser.add_argument("--run-id", type=str)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    report = run_recipe(
        args.recipe_id,
        read_json(args.input_json),
        args.runtime_dir or PRODUCT_ROOT / ".runtime" / "recipe-cli",
        run_id=args.run_id,
        resume=args.resume,
    )
    print(f"{report['status']} {args.recipe_id}: {len(report['workflow']['steps'])} steps; run_id={report['run_id']}; journal={report['journal']}")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
