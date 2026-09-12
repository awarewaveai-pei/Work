"""``foresight.cross_industry_transfer`` vertical slice -- F13 (Unknown Unknowns & Foresight) family.

Builds a real ``CrossIndustryTransferSet`` transferring aviation's pre-flight
checklist mechanism to surgical operating rooms, then demonstrates the real
invariant is enforced at both layers: (1) a construction-time refusal when a
transfer's ``source_industry``/``target_industry`` are the same (not actually
cross-industry), and (2) an independent gate catching the same defect on a
hand-tampered record that bypassed the builder entirely.

Run::

    python -m ai_lego.apps.cli.run_cross_industry_transfer_slice
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
from ai_lego.modules.foresight.cross_industry_transfer import (
    METHOD_ID,
    all_gates_pass,
    evaluate_cross_industry_transfer_gates,
    generate_cross_industry_transfer_set,
    transfer,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CROSSINDUSTRYTRANSFER-SYNTHETIC-001"
EXECUTION_ID = "EX-CROSSINDUSTRYTRANSFER-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CROSSINDUSTRYTRANSFER-001"

S = {
    "cross_industry_transfer_set": "ai-lego://specs/cognitive/typed-objects/cross-industry-transfer.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-cross-industry-transfer-slice"


def run_cross_industry_transfer_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real transfer: shared job/constraint AND a recorded adaptation AND genuinely different industries. ---
    transfers = [
        transfer(
            "XT-1",
            "commercial aviation",
            "surgery",
            "多人團隊在高風險、不可逆操作前，需要在時間壓力下確認一致的前置狀態",
            "起飛前強制唸出的紙本檢查清單，由非機長角色複誦確認",
            "改為手術室團隊在切皮前口頭複誦病患身分/部位/器械清點，由非主刀醫師主導唸誦，保留角色制衡但拿掉機艙專屬術語",
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_cross_industry_transfer_set,
        "XIND-2026-09-12-001",
        transfers,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["cross_industry_transfer_set"], record, "cross-industry transfer set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CrossIndustryTransferSetGenerated", {"cross_industry_transfer_set": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_cross_industry_transfer_gates(record, "run_cross_industry_transfer_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"cross-industry transfer gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"XIND_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CrossIndustryTransferGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the real invariant is real, at both layers. ---
    # Layer 1: construction-time refusal -- source_industry == target_industry is not a cross-industry transfer.
    construction_refused = False
    try:
        transfer("XT-BAD", "surgery", "surgery", "shared job", "some mechanism", "some adaptation")
    except InvariantViolation:
        construction_refused = True

    # Layer 2: independent gate catches a hand-tampered record that bypassed the builder entirely (mutate a
    # deep copy so the already-validated `record` above is untouched).
    tampered = copy.deepcopy(record)
    tampered["transfers"][0]["target_industry"] = tampered["transfers"][0]["source_industry"]
    gate_on_tampered = evaluate_cross_industry_transfer_gates(tampered, "run_cross_industry_transfer_slice", clock.at(1.3))
    gate_caught_tamper = not all_gates_pass(gate_on_tampered)

    if not (construction_refused and gate_caught_tamper):
        raise InvariantViolation(
            f"XIND_INVARIANT_GUARD_DID_NOT_FIRE: construction_refused={construction_refused}, gate_caught_tamper={gate_caught_tamper} -- "
            "both layers must independently refuse a same-industry transfer"
        )
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CrossIndustryTransferInvariantVerified", {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper}, 1.4)
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
        "cross_industry_transfer_set": record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "cross_industry_transfer_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_cross_industry_transfer_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    print(f"PASS foresight.cross_industry_transfer: 1 transfer, gates [{gate_summary}], same_industry_transfer_refused(construction={v['construction_refused']}, gate={v['gate_caught_tamper']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
