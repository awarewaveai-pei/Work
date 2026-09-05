"""``devops_sre.runbook_execution`` vertical slice -- the thirty-third Method Atlas slice, eighth from the
`devops_sre` family.

Builds a real fully-completed execution (three steps, all go, no
rollback needed) and a real stopped execution (step 2 deviated,
execution halted, rollback performed). Then proves the
decision-justification invariant is real by attempting to construct a
step claiming `decision: go` while its own preconditions were not met
(construction layer), and proves the stop-forbids-later-steps
invariant is real by hand-tampering a valid stopped record to append a
step recorded after the stop gate while leaving every other field
untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_runbook_execution_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.runbook_execution import (
    METHOD_ID,
    all_gates_pass,
    evaluate_runbook_execution_gates,
    generate_runbook_execution_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RUNBOOKEXEC-SYNTHETIC-001"
EXECUTION_ID = "EX-RUNBOOKEXEC-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RUNBOOKEXEC-001"

S = {
    "runbook_execution_record": "ai-lego://specs/cognitive/typed-objects/runbook-execution-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-runbook-execution-slice"


def _step(step_number: int, description: str, preconditions_met: bool, outcome: str, decision: str) -> dict[str, Any]:
    return {"step_number": step_number, "description": description, "preconditions_met": preconditions_met, "outcome": outcome, "decision": decision}


def run_runbook_execution_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real fully-completed execution: three steps, all go, no rollback needed. ---
    completed_steps = [
        _step(1, "verify replica lag < 5s", True, "matched_expected", "go"),
        _step(2, "promote replica to primary", True, "matched_expected", "go"),
        _step(3, "repoint application connection string", True, "matched_expected", "go"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_runbook_execution_record,
        "RBEXEC-2026-09-05-001",
        "database-failover-runbook v3",
        completed_steps,
        False,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["runbook_execution_record"], record, "runbook execution record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RunbookExecutionRecordGenerated", {"runbook_execution_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_runbook_execution_gates(record, "run_runbook_execution_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"runbook execution gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RUNBOOKEXEC_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RunbookExecutionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real stopped execution: step 2 deviated, execution halted, rollback performed. ---
    stopped_steps = [
        _step(1, "verify replica lag < 5s", True, "matched_expected", "go"),
        _step(2, "promote replica to primary", True, "deviated", "stop"),
    ]
    _, stopped_record = catalog.invoke(
        METHOD_ID,
        generate_runbook_execution_record,
        "RBEXEC-2026-09-05-002",
        "database-failover-runbook v3",
        stopped_steps,
        True,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["runbook_execution_record"], stopped_record, "stopped runbook execution record")

    # --- Prove the decision-justification invariant is real, at the CONSTRUCTION layer: attempt to build a
    # step claiming decision:go while its own preconditions were NOT met. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_runbook_execution_record(
            "RBEXEC-2026-09-05-003",
            "database-failover-runbook v3",
            [_step(1, "verify replica lag < 5s", False, "matched_expected", "go")],
            False,
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "RUNBOOKEXEC_UNJUSTIFIED_GO" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("RUNBOOKEXEC_INVARIANT_GUARD_DID_NOT_FIRE: a step claiming decision:go with unmet preconditions was accepted (or a different guard fired instead)")

    # --- Prove the SAME "no step past a stop gate" discipline at the independent GATE layer: take a COPY of
    # the real, valid stopped record and hand-tamper it by APPENDING a step recorded AFTER the stop gate
    # (step 3, itself internally well-shaped and justified) while leaving every other field untouched.
    # Pinned to the SPECIFIC runbook_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(stopped_record)
    tampered["steps"].append(_step(3, "repoint application connection string", True, "matched_expected", "go"))
    tampered_gate_results = evaluate_runbook_execution_gates(tampered, "run_runbook_execution_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "runbook_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = integrity_result["status"] == "FAIL" and 3 in evidence.get("step_numbers_after_stop", [])
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"RUNBOOKEXEC_GATE_GUARD_DID_NOT_FIRE: runbook_integrity did not flag the step recorded after the stop gate "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "RunbookExecutionInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        1.3,
    )
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
        "runbook_execution_record": record,
        "stopped_runbook_execution_record": stopped_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "runbook_execution_slice_result.json", result)
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
        result = run_runbook_execution_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["runbook_execution_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.runbook_execution: {len(record['steps'])} steps, rollback_performed={record['rollback_performed']}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
