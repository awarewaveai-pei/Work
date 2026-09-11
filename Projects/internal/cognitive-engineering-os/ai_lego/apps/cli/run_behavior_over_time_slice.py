"""``systems.behavior_over_time`` vertical slice -- F09 systems-thinking family (Atlas L551).

Plots a synthetic "每週客服工單量" variable across 5 weekly points, then
proves Atlas's own literal purpose ("畫變數隨時間變化") is mechanized as a
real invariant, not mere narrative intent: a construction-time attempt to
submit a duplicate/out-of-order timestamp is refused, and a hand-tampered
valid record (a duplicate timestamp spliced in, bypassing the builder) is
independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_behavior_over_time_slice
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
from ai_lego.modules.systems.behavior_over_time import (
    METHOD_ID,
    all_gates_pass,
    evaluate_behavior_over_time_gates,
    evaluate_chronological_order_gate,
    generate_behavior_over_time_chart,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BOT-SYNTHETIC-001"
EXECUTION_ID = "EX-BOT-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BOT-001"

S = {
    "behavior_over_time_chart": "ai-lego://specs/cognitive/typed-objects/behavior-over-time-chart.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-behavior-over-time-slice"


def _points() -> list[dict[str, Any]]:
    return [
        {"time": "2026-08-10", "value": 42},
        {"time": "2026-08-17", "value": 45},
        {"time": "2026-08-24", "value": 138},
        {"time": "2026-08-31", "value": 120},
        {"time": "2026-09-07", "value": 95},
    ]


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "variable_name": "每週客服工單量",
        "points": _points(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_behavior_over_time_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed chart -- 5 strictly-increasing weekly points. ---
    descriptor, chart = catalog.invoke(
        METHOD_ID,
        generate_behavior_over_time_chart,
        "BOT-2026-09-11-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["behavior_over_time_chart"], chart, "behavior over time chart")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BehaviorOverTimeChartGenerated", {"chart": chart, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_behavior_over_time_gates(chart, "run_behavior_over_time_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"behavior over time gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BOT_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BehaviorOverTimeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L551's own "畫變數隨時間變化" is not toothless -- a duplicate/out-of-order
    # timestamp MUST be refused before any record is constructed. ---
    out_of_order_points = _points()[:3] + [{"time": "2026-08-24", "value": 130}] + _points()[3:]
    out_of_order_kwargs = {**_well_formed_kwargs(), "points": out_of_order_points}
    out_of_order_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_behavior_over_time_chart("BOT-OUT-OF-ORDER-REFUSED-001", **out_of_order_kwargs)
    except InvariantViolation as error:
        if "BOT_POINTS_NOT_STRICTLY_INCREASING" not in str(error):
            raise
        out_of_order_refusal_proof["raised"] = True
        out_of_order_refusal_proof["error_code"] = "BOT_POINTS_NOT_STRICTLY_INCREASING"
    if not out_of_order_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BOT_INVARIANT_NOT_ENFORCED: a duplicate timestamp was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OutOfOrderPointsRefused", {"refusal_proof": out_of_order_refusal_proof}, 1.3)
    milestones.append("OUT_OF_ORDER_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (splices a duplicate timestamp directly into a VALID record's own raw
    # dict's points). ---
    tampered = copy.deepcopy(chart)
    tampered["points"] = tampered["points"][:3] + [dict(tampered["points"][2])] + tampered["points"][3:]
    tampered_gate = evaluate_chronological_order_gate(tampered, "run_behavior_over_time_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("BOT_GATE_NOT_INDEPENDENT: the independent chronological_order gate did NOT catch a hand-tampered record with a duplicate timestamp")
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
        "behavior_over_time_chart": chart,
        "gate_results": gate_results,
        "out_of_order_refusal_proof": out_of_order_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "behavior_over_time_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_behavior_over_time_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.behavior_over_time: BehaviorOverTimeChart {result['behavior_over_time_chart']['id']} built (5 points), gates [{gate_summary}]; "
        f"BOT_POINTS_NOT_STRICTLY_INCREASING REFUSED an out-of-order/duplicate timestamp attempt ({result['out_of_order_refusal_proof']['error_code']}); "
        f"hand-tampered record (duplicate timestamp spliced in) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
