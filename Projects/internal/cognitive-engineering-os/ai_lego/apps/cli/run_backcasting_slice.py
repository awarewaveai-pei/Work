"""``foresight.backcasting`` vertical slice -- F13 foresight family (Atlas F13 table row, L683).

Builds a real ``BackcastingPlan`` for a synthetic 3-year carbon-neutral
target (future state -> 2 milestones strictly decreasing in horizon -> 2
today actions). Then proves the method's two real invariants are not mere
narrative: a construction-time attempt to build a plan with zero
``today_actions`` (a distant milestone that never lands on the present) is
refused, and a hand-tampered valid record (the milestone chain order
reversed after construction, bypassing the builder) is independently
caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_backcasting_slice
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
from ai_lego.modules.foresight.backcasting import (
    METHOD_ID,
    all_gates_pass,
    evaluate_backcasting_gates,
    evaluate_milestone_chain_gate,
    generate_backcasting_plan,
    milestone,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BACKCASTING-SYNTHETIC-001"
EXECUTION_ID = "EX-BACKCASTING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BACKCASTING-001"

S = {
    "backcasting_plan": "ai-lego://specs/cognitive/typed-objects/backcasting-plan.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-backcasting-slice"


def _well_formed_milestones() -> list[dict[str, Any]]:
    return [
        milestone("BCAST-2026-09-12-001-M1", "2028 年完成全數據中心改用再生能源", 2),
        milestone("BCAST-2026-09-12-001-M2", "2027 年完成碳排放全面盤查與基準線建立", 1),
    ]


def run_backcasting_slice(config: SliceConfig) -> dict[str, Any]:
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or default_runtime_dir()).resolve()
    allowed_repo_location = PRODUCT_ROOT / ".runtime"
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, allowed_repo_location)
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    pii_guard = PiiLedgerGuard()
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", RUN_ID, clock, validator=contracts.validate, payload_guard=pii_guard)

    milestones_trace: list[str] = ["RECEIVED"]

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones_trace.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones_trace.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed plan -- future state, 2 milestones strictly decreasing in horizon,
    # 2 today actions. ---
    descriptor, plan = catalog.invoke(
        METHOD_ID,
        generate_backcasting_plan,
        "BCAST-2026-09-12-001",
        "2029 年達成營運碳中和",
        _well_formed_milestones(),
        ["啟動碳排放盤查供應商評選", "指派專責碳中和專案負責人"],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["backcasting_plan"], plan, "backcasting plan")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BackcastingPlanGenerated", {"backcasting_plan": plan, "method_descriptor": descriptor}, 1)
    milestones_trace.append("METHOD_EXECUTED")

    gate_results = evaluate_backcasting_gates(plan, "run_backcasting_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"backcasting gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones_trace.append("BLOCKED")
        raise InvariantViolation(f"BCAST_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BackcastingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones_trace.append("GATES_PASSED")

    # --- Step 2: prove Atlas's own "must land on today" rule is not toothless -- zero today_actions MUST be
    # refused before any record is constructed. ---
    no_landing_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_backcasting_plan(
            "BCAST-NO-LANDING-REFUSED-001",
            "2029 年達成營運碳中和",
            _well_formed_milestones(),
            [],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        if "BCAST_NO_TODAY_ACTIONS" not in str(error):
            raise
        no_landing_refusal_proof["raised"] = True
        no_landing_refusal_proof["error_code"] = "BCAST_NO_TODAY_ACTIONS"
    if not no_landing_refusal_proof["raised"]:
        milestones_trace.append("BLOCKED")
        raise InvariantViolation("BCAST_INVARIANT_NOT_ENFORCED: a plan with zero today_actions was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NoLandingPlanRefused", {"refusal_proof": no_landing_refusal_proof}, 1.3)
    milestones_trace.append("NO_LANDING_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect class even when a caller
    # bypasses the builder entirely (reverses the milestone chain order directly on a copy of a VALID record). ---
    tampered = copy.deepcopy(plan)
    tampered["milestones"] = list(reversed(tampered["milestones"]))
    tampered_gate = evaluate_milestone_chain_gate(tampered, "run_backcasting_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones_trace.append("BLOCKED")
        raise InvariantViolation("BCAST_GATE_NOT_INDEPENDENT: the independent milestone_chain gate did NOT catch a hand-tampered reversed milestone chain")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones_trace.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "backcasting_plan": plan,
        "gate_results": gate_results,
        "no_landing_refusal_proof": no_landing_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones_trace,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "backcasting_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_backcasting_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.backcasting: BackcastingPlan {result['backcasting_plan']['id']} built (2 milestones, 2 today_actions), gates [{gate_summary}]; "
        f"BCAST_NO_TODAY_ACTIONS REFUSED a no-landing plan ({result['no_landing_refusal_proof']['error_code']}); "
        f"hand-tampered record (milestone chain reversed) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
