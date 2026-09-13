"""``feasibility.cost_benefit_analysis`` vertical slice -- F14 feasibility/economics family (Atlas L723, §12.25).

Builds a genuine 2-alternative cost-benefit comparison (build in-house vs.
buy from a vendor), including one benefit item flagged non-monetizable
(value: null, honoring Atlas §12.25's own limitation), then proves Atlas
§12.25's own two verbatim rules are real invariants, not mere narrative:
(1) a construction-time attempt to submit an alternative with an empty
``sensitivity_analysis`` disclosure is refused, and (2) a hand-tampered
valid record (a non-monetizable item given a smuggled numeric value --
exactly the "fake precise price" Atlas L2852 forbids -- bypassing the
builder) is independently caught by the ``alternative_integrity`` gate.

Run::

    python -m ai_lego.apps.cli.run_cost_benefit_analysis_slice
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
from ai_lego.modules.feasibility.cost_benefit_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_alternative_integrity_gate,
    evaluate_cost_benefit_analysis_gates,
    generate_cost_benefit_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CBA-SYNTHETIC-001"
EXECUTION_ID = "EX-CBA-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CBA-001"

S = {
    "cost_benefit_analysis": "ai-lego://specs/cognitive/typed-objects/cost-benefit-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-cost-benefit-analysis-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "alternatives": [
            {
                "id": "ALT-BUILD-INHOUSE",
                "costs": [{"id": "C1", "description": "工程師薪資（12 個月）", "value": 3600000, "non_monetizable": False}],
                "benefits": [
                    {"id": "B1", "description": "降低第三方授權費", "value": 800000, "non_monetizable": False},
                    {"id": "B2", "description": "團隊留才與士氣提升", "value": None, "non_monetizable": True},
                ],
                "discount_rate": 0.08,
                "sensitivity_analysis": "若人力成本上升 20%，淨效益仍為正；若延遲交付超過 3 個月則轉為負值",
                "distributional_effects": "成本由工程團隊承擔，效益主要歸屬產品團隊與客戶",
            },
            {
                "id": "ALT-BUY-VENDOR",
                "costs": [{"id": "C2", "description": "第三方授權費（年約）", "value": 900000, "non_monetizable": False}],
                "benefits": [{"id": "B3", "description": "上線時間縮短 6 個月", "value": 1200000, "non_monetizable": False}],
                "discount_rate": 0.08,
                "sensitivity_analysis": "若匯率波動超過 10%，授權費淨現值變動 +/- 90000",
                "distributional_effects": "成本由採購預算承擔，效益歸屬全公司交付速度",
            },
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_cost_benefit_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed 2-alternative comparison. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_cost_benefit_analysis,
        "CBA-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["cost_benefit_analysis"], analysis, "cost benefit analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CostBenefitAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_cost_benefit_analysis_gates(analysis, "run_cost_benefit_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"cost benefit analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CBA_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CostBenefitAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §12.25's own required-disclosure rule is not toothless -- an alternative with an
    # EMPTY sensitivity_analysis disclosure MUST be refused before any record is constructed. ---
    missing_sensitivity_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_sensitivity_kwargs["alternatives"][0]["sensitivity_analysis"] = ""
    missing_disclosure_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_cost_benefit_analysis("CBA-MISSING-SENSITIVITY-REFUSED-001", **missing_sensitivity_kwargs)
    except InvariantViolation as error:
        if "CBA_INVALID_ALTERNATIVES" not in str(error):
            raise
        missing_disclosure_refusal_proof["raised"] = True
        missing_disclosure_refusal_proof["error_code"] = "CBA_INVALID_ALTERNATIVES (sensitivity_analysis empty)"
    if not missing_disclosure_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CBA_INVARIANT_NOT_ENFORCED: an alternative with an empty sensitivity_analysis was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingDisclosureRefused", {"refusal_proof": missing_disclosure_refusal_proof}, 1.3)
    milestones.append("MISSING_DISCLOSURE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT alternative_integrity gate catches the same defect
    # class even when a caller bypasses the builder entirely (a non-monetizable benefit item given a smuggled
    # numeric value -- exactly the "fake precise price" Atlas L2852 forbids). ---
    tampered = copy.deepcopy(analysis)
    tampered["alternatives"][0]["benefits"][1]["value"] = 999999  # B2 is non_monetizable:true
    tampered_gate = evaluate_alternative_integrity_gate(tampered, "run_cost_benefit_analysis_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CBA_GATE_NOT_INDEPENDENT: the independent alternative_integrity gate did NOT catch a hand-tampered non-monetizable item carrying a fake precise price")
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
        "cost_benefit_analysis": analysis,
        "gate_results": gate_results,
        "missing_disclosure_refusal_proof": missing_disclosure_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_red_team_slice.py)",
    }
    write_json(runtime / "results" / "cost_benefit_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_cost_benefit_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.cost_benefit_analysis: CostBenefitAnalysis {result['cost_benefit_analysis']['id']} built "
        f"(2 alternatives, 1 non-monetizable item), gates [{gate_summary}]; "
        f"empty-sensitivity-disclosure call REFUSED ({result['missing_disclosure_refusal_proof']['error_code']}); "
        f"hand-tampered fake-precise-price caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
