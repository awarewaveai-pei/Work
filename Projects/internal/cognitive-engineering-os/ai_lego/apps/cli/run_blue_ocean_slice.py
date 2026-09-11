"""``strategy.blue_ocean`` vertical slice -- 14th and LAST F08 `context/strategy` family member.

Scenario: a checkout-flow / customer-experience Blue Ocean assessment with 3 competing factors
(ELIMINATE a high-cost physical sales-point factor, RAISE checkout speed above industry standard,
CREATE a post-purchase co-creation feedback loop the industry has never offered) -- same synthetic
style every sibling slice's CLI demo uses, distinct from ``run_three_c_slice.py``'s own checkout-A/B
scenario (this record does not reference or depend on that slice's data). Builds a real, well-formed
``BlueOceanAnalysis`` covering Atlas F08 L526's own "Strategy Canvas→ERRC" pipeline, then demonstrates
each of the 4 real invariants once as a construction-time REFUSAL (an insufficient factor count; an
out-of-enum errc_action; a CREATE factor illegally carrying an industry_standard_level; an empty
new_value_curve_summary), proving none is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID analysis directly (bypassing the builder) to prove the independent gate, not just the builder,
catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_blue_ocean_slice
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
from ai_lego.modules.strategy.blue_ocean import (
    METHOD_ID,
    all_gates_pass,
    blue_ocean_factor,
    evaluate_blue_ocean_gates,
    generate_blue_ocean_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BLUEOCEAN-SYNTHETIC-001"
EXECUTION_ID = "EX-BLUEOCEAN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BLUEOCEAN-001"

S = {
    "blue_ocean_analysis": "ai-lego://specs/cognitive/typed-objects/blue-ocean-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-blue-ocean-slice"


def _valid_factors() -> list[dict[str, Any]]:
    return [
        blue_ocean_factor(
            "BLUEOCEAN-2026-09-11-001-F1",
            "業務員人力銷售據點數量",
            "ELIMINATE",
            "傳統據點成本高昂且與線上客群重疊率低，全數線上化可去除此成本而不損及目標客群體驗",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            industry_standard_level="HIGH",
        ),
        blue_ocean_factor(
            "BLUEOCEAN-2026-09-11-001-F2",
            "結帳流程速度",
            "RAISE",
            "現有競品結帳流程平均 5 步驟，拉高至一鍵結帳可直接放大既有 A/B 測試框架優勢",
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
            industry_standard_level="MEDIUM",
        ),
        blue_ocean_factor(
            "BLUEOCEAN-2026-09-11-001-F3",
            "購後社群共創回饋機制",
            "CREATE",
            "產業內尚無此功能，創造購後即時共創回饋可建立差異化黏著度，非既有競爭維度的延伸",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]


NEW_VALUE_CURVE_SUMMARY = "去除高成本實體據點、拉高結帳速度至業界之上、並創造購後共創回饋機制，三者共同構成一條脫離現有據點/速度紅海競爭的新價值曲線"


def run_blue_ocean_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.blue_ocean resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism
    # every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- all 4 real invariants satisfied (>=2 factors,
    # every errc_action valid, CREATE-vs-existing-factor asymmetry respected, new_value_curve_summary
    # disclosed), invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's
    # pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_blue_ocean_analysis,
        "BLUEOCEAN-2026-09-11-001",
        _valid_factors(),
        NEW_VALUE_CURVE_SUMMARY,
    )
    contracts.validate(S["blue_ocean_analysis"], analysis, "Blue Ocean analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BlueOceanAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("ANALYSIS_BUILT")

    gate_results = evaluate_blue_ocean_gates(analysis, "run_blue_ocean_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.blue_ocean gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BLUEOCEAN_GATE_FAILED on the deliberately well-formed analysis: {gate_results}")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the factor-count invariant is not toothless -- a competing_factors set with
    # only 1 entry MUST be refused before any record is constructed (a value curve plotted through a
    # single point is not a curve). ---
    insufficient_factors_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_blue_ocean_analysis(
            "BLUEOCEAN-REFUSED-001",
            [
                blue_ocean_factor(
                    "BLUEOCEAN-REFUSED-001-F1", "結帳流程速度", "RAISE", "唯一因素，仍嘗試下結論", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="MEDIUM"
                ),
                # deliberately NO second factor -- this is the defect under test
            ][:1],
            "只有一個因素，仍嘗試下結論",
        )
    except InvariantViolation as error:
        if "BLUEOCEAN_INSUFFICIENT_FACTORS" not in str(error):
            raise
        insufficient_factors_refusal_proof["raised"] = True
        insufficient_factors_refusal_proof["error_code"] = "BLUEOCEAN_INSUFFICIENT_FACTORS"
    if not insufficient_factors_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BLUEOCEAN_INVARIANT_NOT_ENFORCED: a single-factor competing_factors set was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InsufficientFactorsRecordRefused", {"refusal_proof": insufficient_factors_refusal_proof}, 1.3)
    milestones.append("INSUFFICIENT_FACTORS_REFUSAL_PROVEN")

    # --- Step 3: proof the ERRC-action-validity invariant is not toothless -- an out-of-enum
    # errc_action MUST be refused at the per-factor builder, before it ever reaches the analysis
    # builder. ---
    invalid_errc_action_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        blue_ocean_factor("BLUEOCEAN-REFUSED-002-F1", "結帳流程速度", "OPTIMIZE", "無效動作", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="MEDIUM")
    except InvariantViolation as error:
        if "BLUEOCEAN_INVALID_ERRC_ACTION" not in str(error):
            raise
        invalid_errc_action_refusal_proof["raised"] = True
        invalid_errc_action_refusal_proof["error_code"] = "BLUEOCEAN_INVALID_ERRC_ACTION"
    if not invalid_errc_action_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BLUEOCEAN_INVARIANT_NOT_ENFORCED: an out-of-enum errc_action was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidErrcActionRecordRefused", {"refusal_proof": invalid_errc_action_refusal_proof}, 1.5)
    milestones.append("INVALID_ERRC_ACTION_REFUSAL_PROVEN")

    # --- Step 4: proof the CREATE-vs-existing-factor asymmetry is not toothless -- a CREATE factor
    # illegally carrying an industry_standard_level MUST be refused (a never-before-offered factor has
    # no industry standard to record). ---
    create_with_level_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        blue_ocean_factor(
            "BLUEOCEAN-REFUSED-003-F1", "購後社群共創回饋機制", "CREATE", "不應帶有產業標準水準", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), industry_standard_level="LOW"
        )
    except InvariantViolation as error:
        if "BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE" not in str(error):
            raise
        create_with_level_refusal_proof["raised"] = True
        create_with_level_refusal_proof["error_code"] = "BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE"
    if not create_with_level_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BLUEOCEAN_INVARIANT_NOT_ENFORCED: a CREATE factor carrying industry_standard_level was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CreateWithLevelRecordRefused", {"refusal_proof": create_with_level_refusal_proof}, 1.7)
    milestones.append("CREATE_WITH_LEVEL_REFUSAL_PROVEN")

    # --- Step 5: proof the new-value-curve-disclosure invariant is not toothless -- an empty
    # new_value_curve_summary MUST be refused (Blue Ocean's whole stated purpose is "創造新價值曲線";
    # a record that never states it has not delivered the method's own purpose). ---
    empty_summary_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_blue_ocean_analysis("BLUEOCEAN-REFUSED-004", _valid_factors(), "")
    except InvariantViolation as error:
        if "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY" not in str(error):
            raise
        empty_summary_refusal_proof["raised"] = True
        empty_summary_refusal_proof["error_code"] = "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY"
    if not empty_summary_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BLUEOCEAN_INVARIANT_NOT_ENFORCED: an empty new_value_curve_summary was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptySummaryRecordRefused", {"refusal_proof": empty_summary_refusal_proof}, 1.9)
    milestones.append("EMPTY_SUMMARY_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller
    # bypasses the builder entirely (strip the CREATE factor's provenance-adjacent industry_standard_
    # level rule by smuggling one directly onto the raw dict copy of the valid analysis). ---
    tampered = copy.deepcopy(analysis)
    tampered["competing_factors"][2]["industry_standard_level"] = "LOW"  # F3 is CREATE -- must never carry this key
    tampered_gate_results = evaluate_blue_ocean_gates(tampered, "run_blue_ocean_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate_results)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BLUEOCEAN_GATE_NOT_INDEPENDENT: the independent industry_standard_level_consistency gate did NOT catch a hand-tampered CREATE factor")
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
        "insufficient_factors_refusal_proof": insufficient_factors_refusal_proof,
        "invalid_errc_action_refusal_proof": invalid_errc_action_refusal_proof,
        "create_with_level_refusal_proof": create_with_level_refusal_proof,
        "empty_summary_refusal_proof": empty_summary_refusal_proof,
        "tampered_gate_results": tampered_gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_three_c_slice.py)",
    }
    write_json(runtime / "results" / "blue_ocean_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_blue_ocean_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.blue_ocean: BlueOceanAnalysis {result['analysis']['id']} built with {len(result['analysis']['competing_factors'])} factors, "
        f"gates [{gate_summary}]; "
        f"BLUEOCEAN_INSUFFICIENT_FACTORS invariant REFUSED a single-factor attempt ({result['insufficient_factors_refusal_proof']['error_code']}); "
        f"BLUEOCEAN_INVALID_ERRC_ACTION invariant REFUSED an out-of-enum action ({result['invalid_errc_action_refusal_proof']['error_code']}); "
        f"BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE invariant REFUSED a CREATE factor carrying a level ({result['create_with_level_refusal_proof']['error_code']}); "
        f"BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY invariant REFUSED an unstated-curve attempt ({result['empty_summary_refusal_proof']['error_code']}); "
        f"CREATE-with-level tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
