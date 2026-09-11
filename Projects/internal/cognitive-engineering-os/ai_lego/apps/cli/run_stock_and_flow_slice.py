"""``systems.stock_and_flow`` vertical slice -- F09 systems thinking family (Atlas L541-559), second member this
batch.

Builds a real ``StockAndFlowModel``: one stock (active subscribers) with an IN flow (new signups) and an OUT
flow (churn), Atlas's own L546 stocks->in/out flows->rates sequence. Then proves BOTH real invariants are
enforced BEFORE construction -- a flow referencing a stock that does not exist (``SNF_FLOW_UNKNOWN_STOCK``), and
a declared stock with zero associated flows (``SNF_STOCK_WITHOUT_FLOW``) -- and, independently, that a
hand-tampered record bypassing the builder entirely (a stock spliced in post-hoc) is still caught by the gate's
own re-derivation.

Run::

    python -m ai_lego.apps.cli.run_stock_and_flow_slice
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
from ai_lego.modules.systems.stock_and_flow import (
    METHOD_ID,
    all_gates_pass,
    evaluate_stock_and_flow_gates,
    flow,
    generate_stock_and_flow_model,
    stock,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SNF-SYNTHETIC-001"
EXECUTION_ID = "EX-SNF-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SNF-001"

S = {
    "stock_and_flow_model": "ai-lego://specs/cognitive/typed-objects/stock-and-flow-model.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-stock-and-flow-slice"


def run_stock_and_flow_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A subscription-growth model: one stock, one IN flow, one OUT flow -- Atlas L546's own stocks->in/out
    # flows->rates sequence. ---
    stocks = [stock("S1", "活躍訂閱數", 10000)]
    flows = [
        flow("F1", "新註冊", "IN", "S1", "每週新註冊訂閱數,依行銷活動而異"),
        flow("F2", "流失", "OUT", "S1", "每週取消訂閱數,約為活躍訂閱數的 1.2%"),
    ]
    descriptor, model = catalog.invoke(
        METHOD_ID,
        generate_stock_and_flow_model,
        "SNF-2026-09-11-001",
        stocks,
        flows,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["stock_and_flow_model"], model, "stock and flow model")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StockAndFlowModelGenerated", {"stock_and_flow_model": model, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stock_and_flow_gates(model, "run_stock_and_flow_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stock and flow gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SNF_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StockAndFlowGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove both real invariants fire BEFORE construction: a dangling target_stock_id, and a declared stock
    # with zero associated flows. ---
    dangling_ref_blocked = False
    try:
        generate_stock_and_flow_model("SNF-2026-09-11-002", stocks, [flow("F1", "新註冊", "IN", "S-DOES-NOT-EXIST", "x")], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        dangling_ref_blocked = "SNF_FLOW_UNKNOWN_STOCK" in str(error)

    flowless_stock_blocked = False
    try:
        generate_stock_and_flow_model(
            "SNF-2026-09-11-003",
            [stock("S1", "活躍訂閱數", 10000), stock("S2", "未接觸的孤立庫存", 0)],
            flows,
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        flowless_stock_blocked = "SNF_STOCK_WITHOUT_FLOW" in str(error)

    # --- Independently, a hand-tampered record bypassing the builder entirely (a stock spliced in post-hoc, no
    # flow touching it) is still caught by the gate's own re-derivation. ---
    tampered = copy.deepcopy(model)
    tampered["stocks"].append(stock("S-INJECTED", "事後加入但沒有連接任何 flow 的孤立庫存", 0))
    tampered_gate_results = evaluate_stock_and_flow_gates(tampered, "run_stock_and_flow_slice", clock.at(1.3))
    gate_layer_blocked = not all_gates_pass(tampered_gate_results)

    if not (dangling_ref_blocked and flowless_stock_blocked and gate_layer_blocked):
        raise InvariantViolation(
            f"SNF_INVARIANT_GUARD_DID_NOT_FIRE: dangling_ref_blocked={dangling_ref_blocked}, "
            f"flowless_stock_blocked={flowless_stock_blocked}, gate_layer_blocked={gate_layer_blocked} -- "
            "every real invariant must independently refuse its own violation"
        )
    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "StockAndFlowInvariantGuardsVerified",
        {"dangling_ref_blocked": dangling_ref_blocked, "flowless_stock_blocked": flowless_stock_blocked, "gate_layer_blocked": gate_layer_blocked},
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
        "stock_and_flow_model": model,
        "gate_results": gate_results,
        "invariant_guard_verification": {"dangling_ref_blocked": dangling_ref_blocked, "flowless_stock_blocked": flowless_stock_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "stock_and_flow_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_stock_and_flow_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_guard_verification"]
    print(
        f"PASS systems.stock_and_flow: {len(result['stock_and_flow_model']['stocks'])} stocks, "
        f"{len(result['stock_and_flow_model']['flows'])} flows, gates [{gate_summary}], "
        f"dangling_ref_blocked={v['dangling_ref_blocked']}, flowless_stock_blocked={v['flowless_stock_blocked']}, gate_layer_blocked={v['gate_layer_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
