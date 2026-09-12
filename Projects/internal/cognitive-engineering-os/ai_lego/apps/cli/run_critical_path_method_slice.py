"""``delivery.critical_path_method`` vertical slice -- F22 PM/Delivery/Governance family (Atlas L919, §12.41).

Builds a 4-task diamond DAG (A->B->D and A->C->D, B longer than C) and proves the real forward/backward
pass is not hand-waved: the computed critical path is A,B,D (NOT all 4 tasks -- C carries genuine slack),
a cyclic dependency graph is refused before any record is constructed, and a hand-tampered record that
smuggles the genuinely non-critical task C into ``critical_path`` is independently caught by the
cpm_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_critical_path_method_slice
"""

from __future__ import annotations

import argparse
import copy
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.delivery.critical_path_method import (
    METHOD_ID,
    all_gates_pass,
    evaluate_cpm_integrity_gate,
    evaluate_critical_path_method_gates,
    generate_critical_path_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CPM-SYNTHETIC-001"
EXECUTION_ID = "EX-CPM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CPM-001"

S = {
    "critical_path_analysis": "ai-lego://specs/cognitive/typed-objects/critical-path-analysis-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-critical-path-method-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "tasks": [
            {"task_id": "A", "duration": 2, "depends_on": []},
            {"task_id": "B", "duration": 5, "depends_on": ["A"]},
            {"task_id": "C", "duration": 2, "depends_on": ["A"]},
            {"task_id": "D", "duration": 3, "depends_on": ["B", "C"]},
        ],
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }


def run_critical_path_method_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed diamond DAG -- real forward/backward pass computes critical_path ==
    # [A, B, D] (project_duration 10), NOT all 4 tasks -- C carries genuine slack 3. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_critical_path_analysis,
        "CPM-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["critical_path_analysis"], analysis, "critical path analysis")
    if analysis["critical_path"] != ["A", "B", "D"] or analysis["project_duration"] != 10:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            f"CPM_UNEXPECTED_RESULT: expected critical_path ['A','B','D'] and project_duration 10, "
            f"got {analysis['critical_path']!r} / {analysis['project_duration']!r} -- the forward/backward pass is not computing correctly"
        )
    c_task = next(t for t in analysis["tasks"] if t["task_id"] == "C")
    if c_task["slack"] != 3:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CPM_UNEXPECTED_RESULT: expected task C slack 3 (genuinely non-critical), got {c_task['slack']!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CriticalPathAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_critical_path_method_gates(analysis, "run_critical_path_method_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"critical path analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CPM_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CriticalPathAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove cycle detection is not toothless -- a cyclic dependency graph (X depends on Y,
    # Y depends on X) MUST be refused before any record is constructed. ---
    cyclic_kwargs = {
        "tasks": [
            {"task_id": "X", "duration": 1, "depends_on": ["Y"]},
            {"task_id": "Y", "duration": 1, "depends_on": ["X"]},
        ],
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }
    cycle_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_critical_path_analysis("CPM-CYCLE-REFUSED-001", **cyclic_kwargs)
    except InvariantViolation as error:
        if "CPM_CYCLE_DETECTED" not in str(error):
            raise
        cycle_refusal_proof["raised"] = True
        cycle_refusal_proof["error_code"] = "CPM_CYCLE_DETECTED"
    if not cycle_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CPM_INVARIANT_NOT_ENFORCED: a cyclic dependency graph was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CycleRefused", {"refusal_proof": cycle_refusal_proof}, 1.3)
    milestones.append("CYCLE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT cpm_integrity gate catches a genuinely
    # non-critical task (C, real slack 3) smuggled into critical_path, bypassing the builder entirely. ---
    tampered = copy.deepcopy(analysis)
    tampered["critical_path"] = ["A", "C", "D"]  # C is NOT on the real critical path
    tampered_gate = evaluate_cpm_integrity_gate(tampered, "run_critical_path_method_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CPM_GATE_NOT_INDEPENDENT: the independent cpm_integrity gate did NOT catch a genuinely non-critical task hand-inserted into critical_path")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "critical_path_analysis": analysis,
        "gate_results": gate_results,
        "cycle_refusal_proof": cycle_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "critical_path_method_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_critical_path_method_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.critical_path_method: CriticalPathAnalysisRecord {result['critical_path_analysis']['id']} built "
        f"(4-task diamond DAG, critical_path={result['critical_path_analysis']['critical_path']}, "
        f"project_duration={result['critical_path_analysis']['project_duration']}), gates [{gate_summary}]; "
        f"CPM_CYCLE_DETECTED REFUSED a cyclic dependency attempt ({result['cycle_refusal_proof']['error_code']}); "
        f"hand-tampered non-critical-task-in-path caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
