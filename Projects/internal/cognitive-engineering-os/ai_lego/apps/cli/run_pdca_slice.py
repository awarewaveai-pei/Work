"""``learning.pdca`` vertical slice -- 4th Method Atlas slice from the ``learning`` family (F17), after
``learning.reversal_criteria``/``learning.kill_criteria``/``learning.decision_journal``.

Real 2-cycle PDCACycleRecord grounded in agency-os/WORKLOG.md:403 (2026-09-07 "Docker Desktop watchdog
根治") + scripts/register-docker-desktop-runtime-tasks.ps1 + scripts/check-smoke-tests.ps1 Check 6
(docker_watchdog). Cycle 1 complete (4 stages); cycle 2 in progress (PLAN+DO), carrying forward cycle 1's
own ACTION-002 -- demonstrates the learning-continuity invariant is a real cross-reference, not decorative.

Run::

    python -m ai_lego.apps.cli.run_pdca_slice
"""

from __future__ import annotations

import argparse
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
from ai_lego.modules.learning.pdca import (
    METHOD_ID,
    action_item,
    all_gates_pass,
    cycle,
    evaluate_pdca_gates,
    generate_pdca_record,
    is_cycle_complete,
    resolve_carried_forward_action_items,
    stage_act,
    stage_check,
    stage_do,
    stage_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PDCA-SYNTHETIC-001"
EXECUTION_ID = "EX-PDCA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PDCA-001"

S = {
    "pdca_cycle_record": "ai-lego://specs/cognitive/typed-objects/pdca-cycle-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pdca-slice"


def run_pdca_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real scenario: agency-os/WORKLOG.md:403, register-docker-desktop-runtime-tasks.ps1,
    # check-smoke-tests.ps1 Check 6 (docker_watchdog). Cycle 1 complete; cycle 2 in progress, carrying
    # forward cycle 1's own ACTION-002. ---
    decision_prov = make_provenance("DECISION", "HUMAN_APPROVED")
    cycle_1 = cycle(
        1,
        [
            stage_plan(
                "Root-cause the 2026-09-06 incident: daemon died once and stayed dead until next login, "
                "nobody watching -- plan a per-minute reconcile task plus a smoke-test detector.",
                decision_prov,
                carried_forward_action_item_ids=None,
            ),
            stage_do(
                "Implement watch-docker-desktop-runtime.ps1 (per-minute reconcile) via "
                "register-docker-desktop-runtime-tasks.ps1, and check-smoke-tests.ps1 Check 6 (docker_watchdog).",
                decision_prov,
            ),
            stage_check(
                "Verified: watchdog restarts a killed daemon within one minute; smoke Check 6 surfaces WARN "
                "when the watchdog's own guard state is unhealthy.",
                decision_prov,
            ),
            stage_act(
                "Standardize the watchdog+Check6 pair as permanent baseline monitoring; adjust scope next "
                "cycle to cover WSL2 backend health, not just daemon liveness.",
                decision_prov,
                [
                    action_item("ACTION-001", "Standardize: keep the per-minute watchdog + smoke Check 6 pair as permanent baseline monitoring."),
                    action_item("ACTION-002", "Adjust: watchdog only checks daemon liveness, not WSL2 backend health specifically -- extend monitoring scope next cycle."),
                ],
            ),
        ],
    )
    cycle_2 = cycle(
        2,
        [
            stage_plan(
                "Extend watchdog scope to WSL2 backend health, per cycle 1's own ACTION-002 finding.",
                decision_prov,
                carried_forward_action_item_ids=["ACTION-002"],
            ),
            stage_do("In progress: drafting a WSL2-backend-specific health probe.", decision_prov),
        ],
    )
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_pdca_record,
        "PDCA-2026-09-07-001",
        "Docker Desktop daemon watchdog system, primary workstation (LAPTOP-R7I86OR5)",
        [cycle_1, cycle_2],
        decision_prov,
    )
    contracts.validate(S["pdca_cycle_record"], record, "pdca cycle record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PdcaRecordGenerated", {"pdca_cycle_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pdca_gates(record, "run_pdca_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"pdca gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PDCA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PdcaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real compute: resolve what cycle 2 actually carried forward, and per-cycle completion status. ---
    carried_forward = resolve_carried_forward_action_items(record, 2)
    completion = {c["cycle_number"]: is_cycle_complete(c) for c in record["cycles"]}
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PdcaContinuityResolved", {"record_id": record["id"], "cycle_2_carried_forward": carried_forward, "cycle_completion": completion}, 1.3)
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
        "pdca_cycle_record": record,
        "gate_results": gate_results,
        "carried_forward_action_items": carried_forward,
        "cycle_completion": completion,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_kill_criteria_slice.py)",
    }
    write_json(runtime / "results" / "pdca_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_pdca_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    cf = result["carried_forward_action_items"] or []
    print(
        f"PASS learning.pdca: 2 cycles (cycle 1 complete/4 stages, cycle 2 in-progress/2 stages), "
        f"gates [{gate_summary}], cycle 2 carried forward {len(cf)} action item(s) from cycle 1: "
        f"{[a['id'] for a in cf]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
