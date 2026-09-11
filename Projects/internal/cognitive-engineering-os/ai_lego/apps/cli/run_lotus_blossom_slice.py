"""``divergent.lotus_blossom`` vertical slice -- F03 發散式創意 (Divergent Ideation) family (see
``ai_lego/apps/cli/run_ansoff_slice.py`` for the closed-set-with-completeness CLI-demo template this reuses,
not edited).

Scenario: a Lotus Blossom expansion for "提升新用戶 onboarding 留存率" (improve new-user onboarding
retention) -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``LotusBlossomSession`` covering all 8 branches, each with exactly 8 ideas, then demonstrates each of the 2
real invariants once as a construction-time REFUSAL (a branch set missing branch_number 8; one branch with
only 7 ideas), proving neither is toothless, same "show a real refusal, not only a real success" discipline
every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record directly
(bypassing the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_lotus_blossom_slice
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
from ai_lego.modules.divergent.lotus_blossom import (
    METHOD_ID,
    all_gates_pass,
    branch_entry,
    evaluate_lotus_blossom_gates,
    generate_lotus_blossom_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LOTUS-SYNTHETIC-001"
EXECUTION_ID = "EX-LOTUS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LOTUS-001"
CENTER_THEME = "提升新用戶 onboarding 留存率"

S = {
    "lotus_blossom_session": "ai-lego://specs/cognitive/typed-objects/lotus-blossom-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-lotus-blossom-slice"


def _well_formed_branches() -> list[dict[str, Any]]:
    return [
        branch_entry(1, "首次登入體驗", ["簡化註冊表單", "社交登入選項", "首屏價值主張", "進度指示器", "跳過選項", "預填測試資料", "行動裝置優化", "載入速度優化"]),
        branch_entry(2, "教學導覽", ["互動式 tooltip", "影片導覽", "漸進式揭露", "可跳過步驟", "情境提示", "成就徽章", "導覽進度儲存", "個人化導覽路徑"]),
        branch_entry(3, "首次價值時刻", ["快速達成第一個成果", "範本庫", "AI 自動建議", "示範資料集", "一鍵匯入", "即時預覽", "成功慶祝動畫", "分享首個成果"]),
        branch_entry(4, "電子郵件序列", ["歡迎信", "使用秘訣信", "未完成提醒信", "案例分享信", "限時優惠信", "問卷回饋信", "里程碑祝賀信", "重新邀請信"]),
        branch_entry(5, "客服與支援", ["即時聊天", "FAQ 搜尋", "影片客服", "社群論壇", "工單系統", "AI 客服機器人", "電話支援", "自助知識庫"]),
        branch_entry(6, "遊戲化機制", ["每日簽到", "進度條", "等級系統", "排行榜", "解鎖獎勵", "連續使用獎勵", "任務清單", "虛擬貨幣"]),
        branch_entry(7, "社群與推薦", ["邀請好友獎勵", "使用者社群", "案例研究", "使用者見證", "推薦計畫", "社群活動", "使用者生成內容", "口碑分享按鈕"]),
        branch_entry(8, "數據驅動個人化", ["行為觸發提示", "個人化首頁", "使用習慣分析", "流失預警", "A/B 測試導覽", "分群式訊息", "使用量儀表板", "智慧提醒時機"]),
    ]


def run_lotus_blossom_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.lotus_blossom resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_lotus_blossom_session,
        "LOTUS-2026-09-11-001",
        CENTER_THEME,
        _well_formed_branches(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["lotus_blossom_session"], session, "lotus blossom session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LotusBlossomSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_lotus_blossom_gates(session, "run_lotus_blossom_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.lotus_blossom gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("LOTUS_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (top-level completeness) is not toothless -- a branch set missing
    # branch_number 8 (only 7 of the 8 required branches) MUST be refused before any record is constructed.
    incomplete_branches = _well_formed_branches()[:7]  # drops branch_number 8
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_lotus_blossom_session("LOTUS-INCOMPLETE-REFUSED-001", CENTER_THEME, incomplete_branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "LOTUS_INCOMPLETE_BRANCH_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "LOTUS_INCOMPLETE_BRANCH_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOTUS_INVARIANT_NOT_ENFORCED: a branch set missing branch_number 8 was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteBranchSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-branch nested 8-idea count) is not toothless -- one branch with only
    # 7 ideas MUST be refused. branch_entry() itself validates the ideas count via its own builder path, so
    # the defect is constructed directly as a raw dict to exercise generate_lotus_blossom_session's own
    # check. ---
    short_ideas_branches = _well_formed_branches()
    short_ideas_branches[0] = {**short_ideas_branches[0], "ideas": short_ideas_branches[0]["ideas"][:7]}
    short_ideas_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_lotus_blossom_session("LOTUS-SHORT-IDEAS-REFUSED-001", CENTER_THEME, short_ideas_branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "LOTUS_INVALID_IDEAS_COUNT" not in str(error):
            raise
        short_ideas_refusal_proof["raised"] = True
        short_ideas_refusal_proof["error_code"] = "LOTUS_INVALID_IDEAS_COUNT"
    if not short_ideas_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOTUS_INVARIANT_NOT_ENFORCED: a branch with only 7 ideas was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ShortIdeasCountRefused", {"refusal_proof": short_ideas_refusal_proof}, 1.5)
    milestones.append("SHORT_IDEAS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops branch_number 7 from a raw copy of an already-valid record, duplicating
    # branch_number 1 in its place). ---
    tampered = dict(session)
    tampered["branches"] = [b for b in session["branches"] if b["branch_number"] != 7] + [session["branches"][0]]  # bypasses the builder directly
    tampered_gate = evaluate_lotus_blossom_gates(tampered, "run_lotus_blossom_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOTUS_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete branch set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "session": session,
        "gate_results": gate_results,
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "short_ideas_refusal_proof": short_ideas_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_ansoff_slice.py)",
    }
    write_json(runtime / "results" / "lotus_blossom_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_lotus_blossom_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.lotus_blossom: LotusBlossomSession {result['session']['id']} built, "
        f"gates [{gate_summary}]; "
        f"INCOMPLETE_BRANCH_SET/INVALID_IDEAS_COUNT invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['short_ideas_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete branch set caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
