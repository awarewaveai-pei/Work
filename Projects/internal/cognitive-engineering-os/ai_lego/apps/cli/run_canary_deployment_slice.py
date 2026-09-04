"""``devops_sre.canary_deployment`` vertical slice -- the twenty-first Method Atlas slice, second from the
`devops_sre` family.

Builds a real 5-stage completed rollout (1%->5%->25%->50%->100%, all
healthy). Then demonstrates the unhealthy-forbids-completed invariant is
real by attempting to claim outcome:completed with an unhealthy stage
and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_canary_deployment_slice
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
from ai_lego.modules.devops_sre.canary_deployment import (
    METHOD_ID,
    all_gates_pass,
    evaluate_canary_deployment_plan_gates,
    generate_canary_deployment_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CANARY-SYNTHETIC-001"
EXECUTION_ID = "EX-CANARY-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CANARY-001"

S = {
    "canary": "ai-lego://specs/cognitive/typed-objects/canary-deployment-plan.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-canary-slice"


def run_canary_deployment_slice(config: SliceConfig) -> dict[str, Any]:
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

    stages = [
        {"id": "ST1", "traffic_percent": 1, "healthy": True, "metrics_summary": "error rate 0.01%, latency p99 210ms"},
        {"id": "ST2", "traffic_percent": 5, "healthy": True, "metrics_summary": "error rate 0.01%, latency p99 205ms"},
        {"id": "ST3", "traffic_percent": 25, "healthy": True, "metrics_summary": "error rate 0.02%, latency p99 215ms"},
        {"id": "ST4", "traffic_percent": 50, "healthy": True, "metrics_summary": "error rate 0.02%, latency p99 208ms"},
        {"id": "ST5", "traffic_percent": 100, "healthy": True, "metrics_summary": "error rate 0.01%, latency p99 202ms"},
    ]
    descriptor, plan = catalog.invoke(
        METHOD_ID,
        generate_canary_deployment_plan,
        "CANARY-2026-09-04-001",
        "checkout-api v2.4.0",
        stages,
        "completed",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["canary"], plan, "canary deployment plan")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CanaryDeploymentPlanGenerated", {"canary_deployment_plan": plan, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_canary_deployment_plan_gates(plan, "run_canary_deployment_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"canary gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CANARY_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CanaryGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the unhealthy-forbids-completed invariant is real: attempt to claim outcome:completed with an
    # unhealthy stage. Must be refused. ---
    invariant_blocked = False
    try:
        generate_canary_deployment_plan(
            "CANARY-2026-09-04-002",
            "x",
            [{"id": "ST1", "traffic_percent": 1, "healthy": False, "metrics_summary": "error rate spiked to 5%"}],
            "completed",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        invariant_blocked = True
    if not invariant_blocked:
        raise InvariantViolation("CANARY_INVARIANT_GUARD_DID_NOT_FIRE: outcome:completed with an unhealthy stage was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CanaryUnhealthyInvariantVerified", {"invariant_blocked": invariant_blocked}, 1.3)
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
        "canary_deployment_plan": plan,
        "gate_results": gate_results,
        "invariant_verification": {"invariant_blocked": invariant_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "canary_slice_result.json", result)
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
        result = run_canary_deployment_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    plan = result["canary_deployment_plan"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.canary_deployment: stages={len(plan['stages'])}, outcome={plan['outcome']}, gates [{gate_summary}], "
        f"unhealthy_invariant_verified={result['invariant_verification']['invariant_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
