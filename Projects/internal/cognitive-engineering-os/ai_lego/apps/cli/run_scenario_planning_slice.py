"""``foresight.scenario_planning`` vertical slice -- F13 foresight family (Atlas §11.27, L1804-1836).

Builds a real ``ScenarioSet`` over two critical uncertainties (regulation,
AI cost) yielding four scenarios, each carrying Atlas §11.27's own nine
required elements. Then proves the method's two real invariants are not
mere narrative: a construction-time attempt to omit a required element from
one scenario is refused, and a hand-tampered valid record (an element wiped
after construction, bypassing the builder) is independently caught by the
gate.

Run::

    python -m ai_lego.apps.cli.run_scenario_planning_slice
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
from ai_lego.modules.foresight.scenario_planning import (
    METHOD_ID,
    all_gates_pass,
    evaluate_nine_element_completeness_gate,
    evaluate_scenario_planning_gates,
    generate_scenario_set,
    scenario,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SCENARIOPLANNING-SYNTHETIC-001"
EXECUTION_ID = "EX-SCENARIOPLANNING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SCENARIOPLANNING-001"

S = {
    "scenario_set": "ai-lego://specs/cognitive/typed-objects/scenario-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-scenario-planning-slice"


def _well_formed_scenario_kwargs() -> list[dict[str, Any]]:
    return [
        dict(
            scenario_id="SCEN-2026-09-12-001-S1",
            drivers=["寬鬆監管持續", "AI 推論成本快速下降"],
            assumptions=["主要司法管轄區不祭出新的 AI 限制"],
            narrative="低成本、低監管的世界：AI 應用快速擴散",
            stakeholder_responses=["中小企業加速導入"],
            competitor_responses=["新進者以低價策略搶市"],
            second_third_order_effects=["人力需求結構轉移"],
            signposts=["主要雲端供應商連續三季調降推論定價"],
            strategy_performance="現行策略表現良好",
            reversal_condition="任一主要司法管轄區通過強制 AI 稽核法規",
        ),
        dict(
            scenario_id="SCEN-2026-09-12-001-S2",
            drivers=["寬鬆監管持續", "AI 推論成本維持高檔"],
            assumptions=["硬體供應鏈持續吃緊"],
            narrative="高成本、低監管的世界：只有資本雄厚的玩家能規模化部署",
            stakeholder_responses=["中小企業轉向委外/共享算力"],
            competitor_responses=["大型企業併購中小型 AI 團隊"],
            second_third_order_effects=["市場集中度上升"],
            signposts=["主要 GPU 現貨價格連續兩季上漲"],
            strategy_performance="現行策略需調整成本結構",
            reversal_condition="新一代晶片架構使推論成本大幅下降",
        ),
        dict(
            scenario_id="SCEN-2026-09-12-001-S3",
            drivers=["嚴格監管上路", "AI 推論成本快速下降"],
            assumptions=["合規成本可被自動化工具吸收"],
            narrative="低成本、高監管的世界：合規即產品",
            stakeholder_responses=["企業採購優先考慮合規認證供應商"],
            competitor_responses=["出現專門的 AI 合規工具新創"],
            second_third_order_effects=["合規標準逐漸成為事實上的技術規格"],
            signposts=["主要市場公布強制 AI 稽核細則"],
            strategy_performance="現行策略需補強合規能力",
            reversal_condition="監管機關撤回或大幅放寬稽核細則",
        ),
        dict(
            scenario_id="SCEN-2026-09-12-001-S4",
            drivers=["嚴格監管上路", "AI 推論成本維持高檔"],
            assumptions=["中小企業無力同時負擔算力與合規成本"],
            narrative="高成本、高監管的世界：只有具規模與合規能力的企業能存活",
            stakeholder_responses=["中小企業退出或被併購"],
            competitor_responses=["大型企業以合規壁壘鞏固市占"],
            second_third_order_effects=["產業集中度大幅上升"],
            signposts=["連續兩季中小型 AI 新創退場數上升"],
            strategy_performance="現行策略在此世界表現最弱",
            reversal_condition="同時出現低成本算力與監管放寬",
        ),
    ]


def run_scenario_planning_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed scenario set -- two critical uncertainties, four scenarios, each
    # carrying all nine of Atlas §11.27's own required elements. ---
    well_formed_scenarios = [scenario(**kwargs) for kwargs in _well_formed_scenario_kwargs()]
    descriptor, scenario_set = catalog.invoke(
        METHOD_ID,
        generate_scenario_set,
        "SCEN-2026-09-12-001",
        ["Regulation: Loose<->Strict", "AI Cost: High<->Low"],
        well_formed_scenarios,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["scenario_set"], scenario_set, "scenario set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ScenarioSetGenerated", {"scenario_set": scenario_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_scenario_planning_gates(scenario_set, "run_scenario_planning_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"scenario planning gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCEN_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ScenarioPlanningGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.27's own nine-element completeness rule is not toothless -- omitting a
    # required element from one scenario MUST be refused before any record is constructed. ---
    incomplete_scenarios = [scenario(**kwargs) for kwargs in _well_formed_scenario_kwargs()]
    del incomplete_scenarios[0]["reversal_condition"]
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_scenario_set(
            "SCEN-INCOMPLETE-REFUSED-001",
            ["Regulation: Loose<->Strict", "AI Cost: High<->Low"],
            incomplete_scenarios,
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        if "SCEN_INVALID_SCENARIO" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "SCEN_INVALID_SCENARIO"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SCEN_INVARIANT_NOT_ENFORCED: a scenario missing reversal_condition was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IncompleteScenarioRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_SCENARIO_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (wipes a required element directly on a copy of a VALID record's own raw dict). ---
    tampered = copy.deepcopy(scenario_set)
    tampered["scenarios"][0]["signposts"] = []
    tampered_gate = evaluate_nine_element_completeness_gate(tampered, "run_scenario_planning_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("SCEN_GATE_NOT_INDEPENDENT: the independent nine_element_completeness gate did NOT catch a hand-tampered record with signposts wiped")
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
        "scenario_set": scenario_set,
        "gate_results": gate_results,
        "incomplete_scenario_refusal_proof": incomplete_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "scenario_planning_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_scenario_planning_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.scenario_planning: ScenarioSet {result['scenario_set']['id']} built (2 uncertainties, 4 scenarios), gates [{gate_summary}]; "
        f"SCEN_INVALID_SCENARIO REFUSED an incomplete scenario ({result['incomplete_scenario_refusal_proof']['error_code']}); "
        f"hand-tampered record (signposts wiped) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
