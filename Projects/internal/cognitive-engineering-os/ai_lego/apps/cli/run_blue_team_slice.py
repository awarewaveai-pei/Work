"""``challenge.blue_team`` vertical slice -- the twenty-sixth Method Atlas slice, second from the ``challenge``
family (F12).

Builds a real ``BlueTeamReview`` strengthening the SAME synthetic
deployment proposal ``run_red_team_slice.py`` attacks (Atlas's own
pairing, L1751: "Blue Team → Red Team → Independent Judge") across two
of Atlas's own 5 named categories (FALLBACK, MONITORING) -- directly
addressing the rollback-plan gap Red Team's own example run found. Then
demonstrates the at-least-one-improvement invariant is real by
attempting to construct a review with zero improvements and confirming
it is refused.

Run::

    python -m ai_lego.apps.cli.run_blue_team_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.challenge.blue_team import (
    METHOD_ID,
    all_gates_pass,
    evaluate_blue_team_gates,
    generate_blue_team_review,
    improvement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BLUETEAM-SYNTHETIC-001"
EXECUTION_ID = "EX-BLUETEAM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BLUETEAM-001"

S = {
    "blue_team_review": "ai-lego://specs/cognitive/typed-objects/blue-team-review.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-blue-team-slice"


def run_blue_team_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Strengthen the same proposal Red Team's own example run attacked, directly answering its finding
    # (no rollback plan) with a real fallback and a real monitoring addition. ---
    improvements = [
        improvement(
            "BTR-2026-09-05-001-I1",
            "FALLBACK",
            "加入明確 rollback 步驟：任何階段失敗立即回退到舊機房快照，並記錄觸發條件",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        ),
        improvement(
            "BTR-2026-09-05-001-I2",
            "MONITORING",
            "遷移過程每 5 分鐘回報進度與健康狀態到值班頻道，即使週末無人值班窗口",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        ),
    ]
    descriptor, review = catalog.invoke(
        METHOD_ID,
        generate_blue_team_review,
        "BTR-2026-09-05-001",
        "PROP-2026-09-04-001: 週末自動把所有客戶資料庫遷移到新機房",
        improvements,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["blue_team_review"], review, "blue team review")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BlueTeamReviewGenerated", {"blue_team_review": review, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_blue_team_gates(review, "run_blue_team_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"blue team gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BLUETEAM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BlueTeamGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the at-least-one-improvement invariant is real: attempt to construct a review with zero
    # improvements. Must be refused. ---
    invariant_blocked = False
    try:
        generate_blue_team_review(
            "BTR-2026-09-05-002",
            "PROP-2026-09-04-001",
            [],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        invariant_blocked = "BLUETEAM_NO_IMPROVEMENTS_RECORDED" in str(error)
    if not invariant_blocked:
        raise InvariantViolation("BLUETEAM_INVARIANT_GUARD_DID_NOT_FIRE: a zero-improvement review was accepted (or a different guard fired instead)")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BlueTeamAtLeastOneInvariantVerified", {"invariant_blocked": invariant_blocked}, 1.3)
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
        "blue_team_review": review,
        "gate_results": gate_results,
        "invariant_verification": {"invariant_blocked": invariant_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "blue_team_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_blue_team_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.blue_team: {len(result['blue_team_review']['improvements'])} improvements recorded, "
        f"gates [{gate_summary}], invariant_verified={result['invariant_verification']['invariant_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
