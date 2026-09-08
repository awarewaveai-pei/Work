"""``decision.ice`` vertical slice -- Method Atlas slice, third member of the ``decision`` family (F16).

Unlike `decision.mcda`, ICE scores each item independently (no cross-item
normalization, no caller-supplied weights): impact/confidence/ease are
each rated 1-10 per item, and ``ice_score`` is the arithmetic mean,
computed by ``ai_lego/compute/ice/scoring.py`` (hand-verified against a
known exact-mean case before this CLI was written).

Run::

    python -m ai_lego.apps.cli.run_ice_slice
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
from ai_lego.modules.decision.ice import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ice_gates,
    generate_ice_score_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ICE-SYNTHETIC-001"
EXECUTION_ID = "EX-ICE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ICE-001"

S = {
    "ice_score_record": "ai-lego://specs/cognitive/typed-objects/ice-score-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ice-slice"


def run_ice_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real 4-idea growth backlog, quick-and-rough-sorted by ICE (Atlas L761's own "快速粗排"). ---
    items = [
        {"id": "I1", "label": "在結帳頁加入信任徽章", "impact": 6, "confidence": 8, "ease": 9},
        {"id": "I2", "label": "重寫 onboarding email 系列", "impact": 8, "confidence": 6, "ease": 4},
        {"id": "I3", "label": "推出 referral 計畫", "impact": 9, "confidence": 5, "ease": 3},
        {"id": "I4", "label": "加大首頁 CTA 按鈕", "impact": 3, "confidence": 9, "ease": 10},
    ]
    descriptor, ice_record = catalog.invoke(
        METHOD_ID,
        generate_ice_score_record,
        "ICE-2026-09-07-001",
        "Q4 成長實驗 backlog 初篩",
        items,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["ice_score_record"], ice_record, "ice score record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IceScoreRecordGenerated", {"ice_score_record": ice_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ice_gates(ice_record, "run_ice_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ice gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ICE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IceGatesEvaluated", {"gate_results": gate_results}, 1.2)
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
        "ice_score_record": ice_record,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "ice_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_ice_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["ice_score_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(f"PASS decision.ice: ranking={[(r['item_id'], r['ice_score']) for r in record['ranking']]}, gates [{gate_summary}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
