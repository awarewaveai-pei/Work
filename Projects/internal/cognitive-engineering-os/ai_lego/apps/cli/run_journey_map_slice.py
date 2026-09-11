"""``insight.journey_map`` vertical slice -- F06 人類／顧客洞察 (Human/Customer Insight) family (see
``ai_lego/apps/cli/run_lotus_blossom_slice.py`` for the fixed-N numeric-slot-completeness CLI-demo template
this reuses and generalizes to a caller-determined length, not edited).

Scenario: a 4-stage Journey Map for "SaaS 免費試用轉付費旅程" (SaaS free-trial-to-paid-conversion journey)
-- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``JourneyMap``
covering stage_number 1..4 with no gaps or duplicates, then demonstrates the real invariant is not toothless
via THREE distinct construction-time refusals (a gap in the stage_number sequence; a duplicate stage_number;
a bool masquerading as a stage_number), same "show a real refusal, not only a real success" discipline every
sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record directly (bypassing
the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_journey_map_slice
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
from ai_lego.modules.insight.journey_map import (
    METHOD_ID,
    all_gates_pass,
    evaluate_journey_map_gates,
    generate_journey_map,
    stage_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-JOURNEYMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-JOURNEYMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-JOURNEYMAP-001"
JOURNEY_SUBJECT = "SaaS 免費試用轉付費旅程"

S = {
    "journey_map": "ai-lego://specs/cognitive/typed-objects/journey-map.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-journey-map-slice"


def _well_formed_stages() -> list[dict[str, Any]]:
    return [
        stage_entry(1, "註冊試用", "填寫表單並啟用帳號", "期待但略有疑慮", "表單欄位過多", "縮短表單、延後選填欄位", evidence="用戶訪談 N=12，8 人提到表單太長"),
        stage_entry(2, "首次使用", "探索核心功能", "好奇，容易迷失", "找不到核心價值功能", "加入導覽或範本"),
        stage_entry(3, "試用中期評估", "比較付費方案", "猶豫", "定價頁資訊不清楚", "加入方案比較表與 ROI 試算"),
        stage_entry(4, "轉換決策", "選擇方案並付款", "謹慎", "付款流程步驟過多", "簡化付款、支援更多金流"),
    ]


def run_journey_map_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.journey_map resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed journey map -- the real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, journey_map = catalog.invoke(
        METHOD_ID,
        generate_journey_map,
        "JOURNEY-2026-09-11-001",
        JOURNEY_SUBJECT,
        _well_formed_stages(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["journey_map"], journey_map, "journey map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "JourneyMapGenerated", {"journey_map": journey_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_journey_map_gates(journey_map, "run_journey_map_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.journey_map gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("JOURNEY_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the invariant is not toothless (gap) -- a stage sequence missing stage_number 3 (out
    # of 4) MUST be refused before any record is constructed. ---
    gap_stages = [_well_formed_stages()[0], _well_formed_stages()[1], _well_formed_stages()[3]]  # 1, 2, 4 -- drops 3, still "3 stages" but wrong numbering
    gap_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_journey_map("JOURNEY-GAP-REFUSED-001", JOURNEY_SUBJECT, gap_stages, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "JOURNEY_STAGE_NUMBER_GAP" not in str(error):
            raise
        gap_refusal_proof["raised"] = True
        gap_refusal_proof["error_code"] = "JOURNEY_STAGE_NUMBER_GAP"
    if not gap_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JOURNEY_INVARIANT_NOT_ENFORCED: a stage sequence with a gap (missing stage_number 3) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StageNumberGapRefused", {"refusal_proof": gap_refusal_proof}, 1.3)
    milestones.append("GAP_REFUSAL_PROVEN")

    # --- Step 3: proof the invariant is not toothless (duplicate) -- stage_number 1 appearing twice, with
    # stage_number 4 entirely missing, MUST be refused. ---
    base = _well_formed_stages()
    duplicate_stages = [base[0], base[1], base[2], {**base[0]}]  # 1, 2, 3, 1 (duplicate) -- 4 never appears
    duplicate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_journey_map("JOURNEY-DUP-REFUSED-001", JOURNEY_SUBJECT, duplicate_stages, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "JOURNEY_DUPLICATE_STAGE_NUMBER" not in str(error):
            raise
        duplicate_refusal_proof["raised"] = True
        duplicate_refusal_proof["error_code"] = "JOURNEY_DUPLICATE_STAGE_NUMBER"
    if not duplicate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JOURNEY_INVARIANT_NOT_ENFORCED: a stage sequence with a duplicated stage_number 1 was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateStageNumberRefused", {"refusal_proof": duplicate_refusal_proof}, 1.5)
    milestones.append("DUPLICATE_REFUSAL_PROVEN")

    # --- Step 4: proof a bool can never masquerade as a stage_number (bool is a subclass of int in Python --
    # the exact bug class a critic pass caught in the sibling F03 lotus_blossom.py). Constructed as a raw
    # dict (bypassing stage_entry's own guard) to exercise generate_journey_map's own check directly. ---
    bool_stages = _well_formed_stages()
    bool_stages[0] = {**bool_stages[0], "stage_number": True}  # was 1
    bool_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_journey_map("JOURNEY-BOOL-REFUSED-001", JOURNEY_SUBJECT, bool_stages, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "JOURNEY_INVALID_STAGE_NUMBER" not in str(error):
            raise
        bool_refusal_proof["raised"] = True
        bool_refusal_proof["error_code"] = "JOURNEY_INVALID_STAGE_NUMBER"
    if not bool_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JOURNEY_INVARIANT_NOT_ENFORCED: a bool (True) masquerading as stage_number 1 was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BoolStageNumberRefused", {"refusal_proof": bool_refusal_proof}, 1.7)
    milestones.append("BOOL_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops stage_number 4 from a raw copy of an already-valid record, duplicating
    # stage_number 1 in its place). ---
    tampered = dict(journey_map)
    tampered["stages"] = [s for s in journey_map["stages"] if s["stage_number"] != 4] + [journey_map["stages"][0]]  # bypasses the builder directly
    tampered_gate = evaluate_journey_map_gates(tampered, "run_journey_map_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("JOURNEY_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete stage sequence")
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
        "journey_map": journey_map,
        "gate_results": gate_results,
        "gap_refusal_proof": gap_refusal_proof,
        "duplicate_refusal_proof": duplicate_refusal_proof,
        "bool_refusal_proof": bool_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_lotus_blossom_slice.py)",
    }
    write_json(runtime / "results" / "journey_map_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_journey_map_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.journey_map: JourneyMap {result['journey_map']['id']} built, "
        f"gates [{gate_summary}]; "
        f"STAGE_NUMBER_GAP/DUPLICATE_STAGE_NUMBER/bool-masquerade invariants each REFUSED a malformed attempt "
        f"({result['gap_refusal_proof']['error_code']}, {result['duplicate_refusal_proof']['error_code']}, {result['bool_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete stage sequence caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
