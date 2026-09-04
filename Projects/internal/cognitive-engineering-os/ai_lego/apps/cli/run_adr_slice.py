"""``architecture.adr`` vertical slice -- the twelfth Method Atlas slice, first from the `architecture` family
(F18's own "Software Architecture Pack", one member tool built, not the whole 10-tool pack).

Builds a real-shaped ADR (the same class of decision this repository's
own real ADR-008 already made: native fulfillment vs. a WooCommerce
plugin), exercising all 11 Atlas-cited template sections plus the
non-Atlas `status` field. The first CLI slice this session writes with no
compute layer and no forbidden-authority attack-and-confirm step --
Atlas's own §22.3 table has no ADR row, so there is nothing to attack.

Run::

    python -m ai_lego.apps.cli.run_adr_slice
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
from ai_lego.modules.architecture.adr import (
    METHOD_ID,
    all_gates_pass,
    evaluate_adr_gates,
    generate_architecture_decision_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ADR-SYNTHETIC-001"
EXECUTION_ID = "EX-ADR-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ADR-001"

S = {
    "adr": "ai-lego://specs/cognitive/typed-objects/architecture-decision-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-adr-slice"


def run_adr_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real architecture decision: POD fulfillment goes native, not via a WooCommerce plugin -- all 11
    # Atlas-cited template sections filled with real content, not placeholders. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_architecture_decision_record,
        "ADR-2026-09-04-001",
        "POD 訂單履約走 native 架構，不走 WooCommerce 外掛",
        "accepted",
        "多客戶／多平台需求成長，app 本身定位是操作台而非商店本體，既有外掛方案耦合單一平台且難以擴充。",
        "新客戶一律走 native fulfillment pipeline；既有客戶不強制遷移。",
        ["維持 WooCommerce 外掛方案，接受單平台限制", "自建 adapter 層同時支援外掛與 native，複雜度換取相容性"],
        "訂單資料不再經過第三方外掛儲存層，降低資料外洩面。",
        "訂單 schema 需要一次性遷移腳本，既有客戶資料不動。",
        "新增一條獨立 pipeline 需要維運，短期維運成本上升。",
        "既有外掛客戶不受影響，向前相容。",
        "新客戶直接走 native；既有客戶維持現狀，無強制遷移時程。",
        "native pipeline 若出問題，個別客戶可退回外掛方案（一次性、非自動）。",
        "上線後追蹤前 3 個 native 客戶的訂單成功率與人工介入率。",
        "若 native pipeline 維運成本超過外掛方案 2 倍，重新評估。",
        make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    contracts.validate(S["adr"], record, "architecture decision record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ArchitectureDecisionRecordGenerated", {"architecture_decision_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_adr_gates(record, "run_adr_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"adr gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ADR_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AdrGatesEvaluated", {"gate_results": gate_results}, 1.2)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("GATES_PASSED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "architecture_decision_record": record,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "adr_slice_result.json", result)
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
        result = run_adr_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["architecture_decision_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(f"PASS architecture.adr: title={record['title']!r}, status={record['status']}, alternatives_considered={len(record['alternatives_considered'])}, gates [{gate_summary}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
