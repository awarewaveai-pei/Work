"""``foresight.futures_wheel`` vertical slice -- F13 foresight family (Atlas §11.28, L1837-1860).

Builds a real ``FuturesWheel`` reproducing Atlas §11.28's own worked example
(AI cost decline fanned out to 3 order-1 and 3 order-2 effects), then proves
the method's order-parent consistency invariant is not mere narrative: a
construction-time attempt to attach an order-2 impact whose parent skips
straight to the center (never naming an order-1 parent) is refused, and a
hand-tampered valid record (an order-1 impact's parent_id rewritten away
from the center sentinel, bypassing the builder) is independently caught by
the gate.

Run::

    python -m ai_lego.apps.cli.run_futures_wheel_slice
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
from ai_lego.modules.foresight.futures_wheel import (
    CENTER_EVENT_PARENT_ID,
    METHOD_ID,
    all_gates_pass,
    evaluate_futures_wheel_gates,
    evaluate_order_parent_consistency_gate,
    generate_futures_wheel,
    impact,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FUTURESWHEEL-SYNTHETIC-001"
EXECUTION_ID = "EX-FUTURESWHEEL-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-FUTURESWHEEL-001"

S = {
    "futures_wheel": "ai-lego://specs/cognitive/typed-objects/futures-wheel.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-futures-wheel-slice"


def _well_formed_impacts() -> list[dict[str, Any]]:
    return [
        impact("FWHEEL-2026-09-12-001-B1", 1, CENTER_EVENT_PARENT_ID, "採用增加"),
        impact("FWHEEL-2026-09-12-001-B2", 1, CENTER_EVENT_PARENT_ID, "功能商品化"),
        impact("FWHEEL-2026-09-12-001-B3", 1, CENTER_EVENT_PARENT_ID, "算力需求增加"),
        impact("FWHEEL-2026-09-12-001-C1", 2, "FWHEEL-2026-09-12-001-B1", "工作角色改變"),
        impact("FWHEEL-2026-09-12-001-C2", 2, "FWHEEL-2026-09-12-001-B2", "價格競爭"),
        impact("FWHEEL-2026-09-12-001-C3", 2, "FWHEEL-2026-09-12-001-B3", "能源壓力"),
    ]


def run_futures_wheel_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed wheel -- Atlas §11.28's own worked example, 3 order-1 + 3 order-2. ---
    descriptor, wheel = catalog.invoke(
        METHOD_ID,
        generate_futures_wheel,
        "FWHEEL-2026-09-12-001",
        "AI 成本下降",
        _well_formed_impacts(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["futures_wheel"], wheel, "futures wheel")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FuturesWheelGenerated", {"futures_wheel": wheel, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_futures_wheel_gates(wheel, "run_futures_wheel_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"futures wheel gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"FWHEEL_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FuturesWheelGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.28's own order-parent consistency is not toothless -- an order-2 impact whose
    # parent_id skips straight to the center (never naming a real order-1 parent) MUST be refused. ---
    skip_order_impacts = _well_formed_impacts() + [impact("FWHEEL-SKIP-ORDER-001", 2, CENTER_EVENT_PARENT_ID, "跳過一階直接宣稱二階效果")]
    skip_order_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_futures_wheel("FWHEEL-SKIP-ORDER-REFUSED-001", "AI 成本下降", skip_order_impacts, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "FWHEEL_ORPHAN_OR_SKIPPED_ORDER" not in str(error):
            raise
        skip_order_refusal_proof["raised"] = True
        skip_order_refusal_proof["error_code"] = "FWHEEL_ORPHAN_OR_SKIPPED_ORDER"
    if not skip_order_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FWHEEL_INVARIANT_NOT_ENFORCED: an order-2 impact whose parent_id skipped order-1 was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SkipOrderImpactRefused", {"refusal_proof": skip_order_refusal_proof}, 1.3)
    milestones.append("SKIP_ORDER_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect class even when a caller
    # bypasses the builder entirely (rewrites an order-1 impact's parent_id away from the center sentinel). ---
    tampered = copy.deepcopy(wheel)
    tampered["impacts"][0]["parent_id"] = "NOT-THE-CENTER"
    tampered_gate = evaluate_order_parent_consistency_gate(tampered, "run_futures_wheel_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("FWHEEL_GATE_NOT_INDEPENDENT: the independent order_parent_consistency gate did NOT catch a hand-tampered order-1 parent_id")
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
        "futures_wheel": wheel,
        "gate_results": gate_results,
        "skip_order_refusal_proof": skip_order_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "futures_wheel_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_futures_wheel_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.futures_wheel: FuturesWheel {result['futures_wheel']['id']} built (3 order-1 + 3 order-2 impacts), gates [{gate_summary}]; "
        f"FWHEEL_ORPHAN_OR_SKIPPED_ORDER REFUSED a skip-order attempt ({result['skip_order_refusal_proof']['error_code']}); "
        f"hand-tampered record (order-1 parent_id rewritten) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
