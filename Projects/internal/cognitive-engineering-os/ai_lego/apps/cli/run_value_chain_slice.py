"""``strategy.value_chain`` vertical slice -- 7th F08 `context/strategy` family member (after
``strategy.swot``, ``strategy.pestel``, ``strategy.steepv``, ``strategy.three_c``, ``strategy.tows``,
``strategy.porter_five_forces``).

Scenario: the same checkout-flow e-commerce opportunity ``run_three_c_slice.py`` uses, decomposed here
into a value chain instead (this record does not reference or depend on that slice's data) -- a PRIMARY
outbound-logistics activity and a SUPPORT technology-development activity, each carrying a cost and/or
value driver, synthesizing to one high-leverage conclusion. Builds a real, well-formed
``ValueChainAnalysis`` covering Atlas F08 L522's own "primary/support→cost/value drivers→找高槓桿點"
pipeline, then demonstrates each of the 3 real invariants once as a construction-time REFUSAL (an
activities set missing the SUPPORT category entirely; an activity disclosing neither driver; an empty
``leverage_points``), proving none is toothless, same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID
analysis directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_value_chain_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.value_chain import (
    METHOD_ID,
    all_gates_pass,
    evaluate_value_chain_gates,
    generate_value_chain_analysis,
    value_chain_activity,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-VALUECHAIN-SYNTHETIC-001"
EXECUTION_ID = "EX-VALUECHAIN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-VALUECHAIN-001"

S = {
    "value_chain_analysis": "ai-lego://specs/cognitive/typed-objects/value-chain-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-value-chain-slice"


def _valid_activities() -> list[dict[str, Any]]:
    return [
        value_chain_activity(
            "VALUECHAIN-2026-09-11-001-A1",
            "PRIMARY",
            "結帳流程出貨作業（outbound logistics）",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            cost_driver="人工揀貨與包裝耗時，隨訂單量線性增加",
            value_driver="出貨時效直接影響客戶回購率",
        ),
        value_chain_activity(
            "VALUECHAIN-2026-09-11-001-A2",
            "SUPPORT",
            "結帳頁面前端開發（technology development）",
            make_provenance("SOURCE_FACT", "HUMAN_APPROVED"),
            value_driver="既有 A/B 測試框架可直接重用，縮短新功能上線時間",
        ),
    ]


LEVERAGE_POINTS = "結帳頁面前端開發（SUPPORT，既有框架可重用）對出貨作業（PRIMARY，時效驅動回購率）的支援槓桿最大，優先投資此處可同時降低開發成本並提升主活動價值"


def run_value_chain_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.value_chain resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- all 3 real invariants satisfied (both categories
    # covered, every activity discloses a driver, leverage_points disclosed), invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_value_chain_analysis,
        "VALUECHAIN-2026-09-11-001",
        _valid_activities(),
        LEVERAGE_POINTS,
    )
    contracts.validate(S["value_chain_analysis"], analysis, "value chain analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ValueChainAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("ANALYSIS_BUILT")

    gate_results = evaluate_value_chain_gates(analysis, "run_value_chain_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.value_chain gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"VALUECHAIN_GATE_FAILED on the deliberately well-formed analysis: {gate_results}")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the category-coverage invariant is not toothless -- an activities set missing
    # the SUPPORT category entirely MUST be refused before any record is constructed (a value chain with
    # only PRIMARY activities has not decomposed primary/support). ---
    missing_category_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_chain_analysis(
            "VALUECHAIN-REFUSED-001",
            [
                value_chain_activity(
                    "VALUECHAIN-REFUSED-001-A1",
                    "PRIMARY",
                    "出貨作業",
                    make_provenance("EVIDENCE", "HUMAN_APPROVED"),
                    cost_driver="人工揀貨耗時",
                ),
                # deliberately NO SUPPORT activity -- this is the defect under test
            ],
            "缺少 Support 面向，仍嘗試下結論",
        )
    except InvariantViolation as error:
        if "VALUECHAIN_MISSING_CATEGORY_COVERAGE" not in str(error):
            raise
        missing_category_refusal_proof["raised"] = True
        missing_category_refusal_proof["error_code"] = "VALUECHAIN_MISSING_CATEGORY_COVERAGE"
    if not missing_category_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VALUECHAIN_INVARIANT_NOT_ENFORCED: an activities set missing SUPPORT was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingCategoryRecordRefused", {"refusal_proof": missing_category_refusal_proof}, 1.5)
    milestones.append("MISSING_CATEGORY_REFUSAL_PROVEN")

    # --- Step 3: proof the driver-disclosure invariant is not toothless -- an activity disclosing
    # neither cost_driver nor value_driver MUST be refused at construction (Atlas's own citation names
    # "cost/value drivers" as this method's whole analytical output). ---
    missing_driver_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        value_chain_activity("VALUECHAIN-REFUSED-002-A1", "SUPPORT", "人資招募流程", make_provenance("HYPOTHESIS", "AI_GENERATED"))
    except InvariantViolation as error:
        if "VALUECHAIN_MISSING_DRIVER" not in str(error):
            raise
        missing_driver_refusal_proof["raised"] = True
        missing_driver_refusal_proof["error_code"] = "VALUECHAIN_MISSING_DRIVER"
    if not missing_driver_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VALUECHAIN_INVARIANT_NOT_ENFORCED: an activity disclosing neither driver was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingDriverActivityRefused", {"refusal_proof": missing_driver_refusal_proof}, 1.7)
    milestones.append("MISSING_DRIVER_REFUSAL_PROVEN")

    # --- Step 4: proof the leverage-points-disclosure invariant is not toothless -- an empty
    # leverage_points MUST be refused (Value Chain's whole stated benefit is "找高槓桿點"; a record that
    # never states it has not delivered the method's own purpose). ---
    empty_leverage_points_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_chain_analysis("VALUECHAIN-LEVERAGE-REFUSED-001", _valid_activities(), "")
    except InvariantViolation as error:
        if "VALUECHAIN_EMPTY_LEVERAGE_POINTS" not in str(error):
            raise
        empty_leverage_points_refusal_proof["raised"] = True
        empty_leverage_points_refusal_proof["error_code"] = "VALUECHAIN_EMPTY_LEVERAGE_POINTS"
    if not empty_leverage_points_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VALUECHAIN_INVARIANT_NOT_ENFORCED: an empty leverage_points was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyLeveragePointsRecordRefused", {"refusal_proof": empty_leverage_points_refusal_proof}, 1.9)
    milestones.append("EMPTY_LEVERAGE_POINTS_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller
    # bypasses the builder entirely (mutate the SUPPORT activity's own category to PRIMARY on a raw copy
    # of the valid analysis, leaving zero SUPPORT activities). ---
    tampered = copy.deepcopy(analysis)
    tampered["activities"][1]["category"] = "PRIMARY"  # was SUPPORT -- now zero SUPPORT activities remain
    tampered_gate_results = evaluate_value_chain_gates(tampered, "run_value_chain_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate_results)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("VALUECHAIN_GATE_NOT_INDEPENDENT: the independent category_coverage gate did NOT catch a hand-tampered missing-SUPPORT analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate_results}, 2.1)
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
        "analysis": analysis,
        "gate_results": gate_results,
        "missing_category_refusal_proof": missing_category_refusal_proof,
        "missing_driver_refusal_proof": missing_driver_refusal_proof,
        "empty_leverage_points_refusal_proof": empty_leverage_points_refusal_proof,
        "tampered_gate_results": tampered_gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "value_chain_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_value_chain_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.value_chain: ValueChainAnalysis {result['analysis']['id']} built with {len(result['analysis']['activities'])} activities, "
        f"gates [{gate_summary}]; "
        f"MISSING_CATEGORY_COVERAGE invariant REFUSED a SUPPORT-less attempt ({result['missing_category_refusal_proof']['error_code']}); "
        f"MISSING_DRIVER invariant REFUSED a driver-less activity ({result['missing_driver_refusal_proof']['error_code']}); "
        f"EMPTY_LEVERAGE_POINTS invariant REFUSED an unstated-leverage attempt ({result['empty_leverage_points_refusal_proof']['error_code']}); "
        f"missing-category tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
