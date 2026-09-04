"""``challenge.independent_judge`` vertical slice -- the twenty-seventh Method Atlas slice, third and final from
the ``challenge`` family (F12), completing the full pairing.

Builds a real ``IndependentJudgeRuling`` over the SAME synthetic
deployment proposal ``run_red_team_slice.py`` attacks and
``run_blue_team_slice.py`` strengthens -- weighing Red Team's own
finding (no rollback plan) against Blue Team's own two improvements
(rollback + monitoring), reaching a criteria-based judgment with a
minority opinion and a real reversal condition. Then demonstrates the
majority-vote-as-truth invariant is real at BOTH independent layers:
construction-time (attempting to build a ruling with zero criteria) and
gate re-derivation (hand-tampering a COPY of the real ruling to weigh
zero positions and confirming the gate layer independently refuses it,
without going through the builder at all).

Run::

    python -m ai_lego.apps.cli.run_independent_judge_slice
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
from ai_lego.modules.challenge.independent_judge import (
    METHOD_ID,
    all_gates_pass,
    evaluate_independent_judge_gates,
    generate_independent_judge_ruling,
    position,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-INDEPENDENTJUDGE-SYNTHETIC-001"
EXECUTION_ID = "EX-INDEPENDENTJUDGE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-INDEPENDENTJUDGE-001"

S = {
    "independent_judge_ruling": "ai-lego://specs/cognitive/typed-objects/independent-judge-ruling.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-independent-judge-slice"


def run_independent_judge_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Weigh Red Team's own finding against Blue Team's own improvements for the SAME proposal, reach a
    # criteria-based judgment (not a headcount), with a real minority opinion and reversal condition. ---
    positions = [
        position(
            "IJR-2026-09-05-001-P1",
            "Red Team: 遷移計畫沒有寫明失敗時的 rollback 步驟與觸發條件,週末執行且無人值班窗口",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            source_ref="RTC-2026-09-04-001-F1",
        ),
        position(
            "IJR-2026-09-05-001-P2",
            "Blue Team: 已加入明確 rollback 步驟與每 5 分鐘進度回報，回應 Red Team 的發現",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            source_ref="BTR-2026-09-05-001-I1",
        ),
    ]
    descriptor, ruling = catalog.invoke(
        METHOD_ID,
        generate_independent_judge_ruling,
        "IJR-2026-09-05-001",
        "PROP-2026-09-04-001: 週末自動把所有客戶資料庫遷移到新機房",
        positions,
        [
            "Red Team 找到的每個高嚴重度發現都必須有對應的 Blue Team 改善項目才能核准",
            "核准後仍須有明確的 reversal 條件,不得視為一次性決定",
        ],
        "核准週末遷移執行,前提是 Blue Team 的 rollback 與監控改善項目已到位",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
        minority_opinion="仍有一票保留意見:建議延後到平日執行以確保有完整值班支援",
        reversal_conditions=["若遷移過程中 rollback 步驟實際觸發,暫停後續所有週末遷移直到根因排除"],
    )
    contracts.validate(S["independent_judge_ruling"], ruling, "independent judge ruling")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IndependentJudgeRulingGenerated", {"independent_judge_ruling": ruling, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_independent_judge_gates(ruling, "run_independent_judge_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"independent judge gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"INDEPENDENTJUDGE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IndependentJudgeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the criteria-required invariant is real at the CONSTRUCTION layer: attempt to build a ruling
    # with zero criteria. Must be refused. ---
    invariant_blocked = False
    try:
        generate_independent_judge_ruling(
            "IJR-2026-09-05-002",
            "PROP-2026-09-04-001",
            [position("IJR-2026-09-05-002-P1", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"))],
            [],
            "approved by headcount only",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        invariant_blocked = "INDEPENDENTJUDGE_NO_CRITERIA_CITED" in str(error)
    if not invariant_blocked:
        raise InvariantViolation("INDEPENDENTJUDGE_INVARIANT_GUARD_DID_NOT_FIRE: a zero-criteria ruling was accepted (or a different guard fired instead)")

    # --- Prove the SAME invariant is real at the independent GATE layer too: take a COPY of the real, valid
    # ruling built above and hand-tamper positions_considered to empty (bypassing the builder entirely, the
    # way a corrupted or hand-crafted record would). The positions_required gate must independently refuse
    # it -- a critic review of this slice's first draft found NO gate re-derived this precondition at all. ---
    tampered = copy.deepcopy(ruling)
    tampered["positions_considered"] = []
    tampered_gate_results = evaluate_independent_judge_gates(tampered, "run_independent_judge_slice", clock.at(1.25))
    gate_layer_blocked = not all_gates_pass(tampered_gate_results)
    if not gate_layer_blocked:
        raise InvariantViolation("INDEPENDENTJUDGE_GATE_GUARD_DID_NOT_FIRE: a ruling hand-tampered to weigh zero positions passed every gate")
    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "IndependentJudgeInvariantVerified",
        {"construction_layer_blocked": invariant_blocked, "gate_layer_blocked": gate_layer_blocked},
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
        "independent_judge_ruling": ruling,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": invariant_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "independent_judge_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_independent_judge_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    ruling = result["independent_judge_ruling"]
    v = result["invariant_verification"]
    print(
        f"PASS challenge.independent_judge: {len(ruling['positions_considered'])} positions, {len(ruling['criteria_used'])} criteria, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
