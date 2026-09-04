"""``architecture.fitness_functions`` vertical slice -- the eighteenth Method Atlas slice, seventh from the
`architecture` family.

Builds a real 2-function set governing this codebase's own ai_lego
package: a domain-layer import restriction and a compute-to-modules
dependency-direction check.

Run::

    python -m ai_lego.apps.cli.run_fitness_functions_slice
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.fitness_functions import (
    METHOD_ID,
    all_gates_pass,
    evaluate_fitness_function_set_gates,
    generate_fitness_function_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FFS-SYNTHETIC-001"
EXECUTION_ID = "EX-FFS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FFS-001"

S = {
    "ffs": "ai-lego://specs/cognitive/typed-objects/fitness-function-set.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-ffs-slice"


def run_fitness_functions_slice(config: SliceConfig) -> dict[str, Any]:
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or default_runtime_dir()).resolve()
    allowed_repo_location = PRODUCT_ROOT / ".runtime"
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, allowed_repo_location)
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    pii_guard = PiiLedgerGuard()
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", RUN_ID, clock, validator=contracts.validate, payload_guard=pii_guard)

    milestones: list[str] = ["RECEIVED"]

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    functions = [
        {"id": "FF1", "invariant": "domain 層不得直接 import 第三方 provider SDK", "test_or_metric": "AST 掃描 core/domain/**，禁止 import 白名單外的套件", "ci_gate": "pre-merge lint job"},
        {"id": "FF2", "invariant": "compute 層不得反向依賴 modules 層", "test_or_metric": "靜態依賴圖檢查 compute/** 對 modules/** 的 import", "ci_gate": "pre-merge architecture-check job"},
    ]
    descriptor, fn_set = catalog.invoke(
        METHOD_ID,
        generate_fitness_function_set,
        "FFS-2026-09-04-001",
        "ai_lego 套件",
        functions,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["ffs"], fn_set, "fitness function set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FitnessFunctionSetGenerated", {"fitness_function_set": fn_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_fitness_function_set_gates(fn_set, "run_fitness_functions_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ffs gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"FFS_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FfsGatesEvaluated", {"gate_results": gate_results}, 1.2)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("GATES_PASSED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "fitness_function_set": fn_set,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "ffs_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_fitness_functions_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    fn_set = result["fitness_function_set"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(f"PASS architecture.fitness_functions: functions={len(fn_set['functions'])}, gates [{gate_summary}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
