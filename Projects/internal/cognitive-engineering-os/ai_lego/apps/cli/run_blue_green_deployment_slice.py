"""``devops_sre.blue_green_deployment`` vertical slice -- the twenty-third Method Atlas slice, fourth from the
`devops_sre` family.

Builds a real verified, cut-over deployment with Blue retained as
fallback. Then demonstrates the verify-before-cutover invariant is real
by attempting to claim cutover_status:cut_over with green_verified:false
and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_blue_green_deployment_slice
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
from ai_lego.modules.devops_sre.blue_green_deployment import (
    METHOD_ID,
    all_gates_pass,
    evaluate_blue_green_deployment_plan_gates,
    generate_blue_green_deployment_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BLUEGREEN-SYNTHETIC-001"
EXECUTION_ID = "EX-BLUEGREEN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BLUEGREEN-001"

S = {
    "bluegreen": "ai-lego://specs/cognitive/typed-objects/blue-green-deployment-plan.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-bluegreen-slice"


def run_blue_green_deployment_slice(config: SliceConfig) -> dict[str, Any]:
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

    descriptor, plan = catalog.invoke(
        METHOD_ID,
        generate_blue_green_deployment_plan,
        "BLUEGREEN-2026-09-04-001",
        "v2.3.1 生產環境",
        "v2.4.0 新版本，已完整部署至獨立環境",
        True,
        "cut_over",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
        blue_retained=True,
    )
    contracts.validate(S["bluegreen"], plan, "blue-green deployment plan")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BlueGreenDeploymentPlanGenerated", {"blue_green_deployment_plan": plan, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_blue_green_deployment_plan_gates(plan, "run_blue_green_deployment_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"bluegreen gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BLUEGREEN_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BlueGreenGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the verify-before-cutover invariant is real: attempt to claim cutover_status:cut_over with
    # green_verified:false. Must be refused. ---
    invariant_blocked = False
    try:
        generate_blue_green_deployment_plan(
            "BLUEGREEN-2026-09-04-002",
            "x",
            "x",
            False,
            "cut_over",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        invariant_blocked = True
    if not invariant_blocked:
        raise InvariantViolation("BLUEGREEN_INVARIANT_GUARD_DID_NOT_FIRE: cutover_status:cut_over with green_verified:false was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BlueGreenCutoverInvariantVerified", {"invariant_blocked": invariant_blocked}, 1.3)
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
        "blue_green_deployment_plan": plan,
        "gate_results": gate_results,
        "invariant_verification": {"invariant_blocked": invariant_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "bluegreen_slice_result.json", result)
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
        result = run_blue_green_deployment_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    plan = result["blue_green_deployment_plan"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.blue_green_deployment: cutover_status={plan['cutover_status']}, green_verified={plan['green_verified']}, gates [{gate_summary}], "
        f"cutover_invariant_verified={result['invariant_verification']['invariant_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
