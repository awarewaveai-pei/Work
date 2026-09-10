"""``strategy.three_c`` vertical slice -- 2nd F08 `context/strategy` family member (after
``strategy.swot``).

Scenario: a checkout-flow A/B-testing opportunity assessed across Customer/
Competitor/Company -- same synthetic style every sibling slice's CLI demo
uses, distinct from ``run_swot_slice.py``'s own renewal/market-entrant
scenario (this record does not reference or depend on that slice's data).
Builds a real, well-formed ``ThreeCAnalysis`` covering Atlas F08 L517's own
"三面向分析→找 fit" pipeline, then demonstrates each of the 2 real invariants
once as a construction-time REFUSAL (a findings set missing the COMPANY
dimension entirely; an empty ``fit_summary``), proving neither is toothless,
same "show a real refusal, not only a real success" discipline every sibling
slice's CLI demo already establishes. A final step hand-tampers a VALID
analysis directly (bypassing the builder) to prove the independent gate, not
just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_three_c_slice
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
from ai_lego.modules.strategy.three_c import (
    METHOD_ID,
    all_gates_pass,
    evaluate_three_c_gates,
    generate_three_c_analysis,
    three_c_finding,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-THREEC-SYNTHETIC-001"
EXECUTION_ID = "EX-THREEC-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-THREEC-001"

S = {
    "three_c_analysis": "ai-lego://specs/cognitive/typed-objects/three-c-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-three-c-slice"


def _valid_findings() -> list[dict[str, Any]]:
    return [
        three_c_finding("3C-2026-09-11-001-F1", "CUSTOMER", "目標客群為中小型電商，最在意結帳流程的轉換率", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        three_c_finding("3C-2026-09-11-001-F2", "COMPETITOR", "現有兩家主要競品皆未提供結帳流程 A/B 測試工具", make_provenance("EVIDENCE", "AI_SUGGESTED")),
        three_c_finding("3C-2026-09-11-001-F3", "COMPANY", "團隊既有 A/B 測試框架可直接重用於結帳流程", make_provenance("SOURCE_FACT", "HUMAN_APPROVED")),
    ]


FIT_SUMMARY = "客戶需求（結帳轉換率）、競品空白（無 A/B 工具）與公司既有能力（可重用框架）三者一致，指向「結帳流程 A/B 測試」為高優先切入點"


def run_three_c_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.three_c resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- both real invariants satisfied (all 3 dimensions covered,
    # fit_summary disclosed), invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's
    # pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_three_c_analysis,
        "3C-2026-09-11-001",
        _valid_findings(),
        FIT_SUMMARY,
    )
    contracts.validate(S["three_c_analysis"], analysis, "3C analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ThreeCAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("ANALYSIS_BUILT")

    gate_results = evaluate_three_c_gates(analysis, "run_three_c_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.three_c gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"THREEC_GATE_FAILED on the deliberately well-formed analysis: {gate_results}")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the dimension-coverage invariant is not toothless -- a findings set missing the COMPANY
    # dimension entirely MUST be refused before any record is constructed (a 3C analysis with only 2 of 3 C's is
    # not a 3C analysis). ---
    missing_dimension_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_three_c_analysis(
            "3C-REFUSED-001",
            [
                three_c_finding("3C-REFUSED-001-F1", "CUSTOMER", "客戶在意轉換率", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
                three_c_finding("3C-REFUSED-001-F2", "COMPETITOR", "競品無此功能", make_provenance("EVIDENCE", "AI_SUGGESTED")),
                # deliberately NO COMPANY finding -- this is the defect under test
            ],
            "缺少 Company 面向，仍嘗試下結論",
        )
    except InvariantViolation as error:
        if "THREEC_MISSING_DIMENSION_COVERAGE" not in str(error):
            raise
        missing_dimension_refusal_proof["raised"] = True
        missing_dimension_refusal_proof["error_code"] = "THREEC_MISSING_DIMENSION_COVERAGE"
    if not missing_dimension_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("THREEC_INVARIANT_NOT_ENFORCED: a findings set missing COMPANY was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingDimensionRecordRefused", {"refusal_proof": missing_dimension_refusal_proof}, 1.5)
    milestones.append("MISSING_DIMENSION_REFUSAL_PROVEN")

    # --- Step 3: proof the fit-disclosure invariant is not toothless -- an empty fit_summary MUST be refused (3C's
    # whole stated purpose is "找 fit"; a record that never states it has not delivered the method's own purpose). ---
    empty_fit_summary_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_three_c_analysis("3C-FIT-REFUSED-001", _valid_findings(), "")
    except InvariantViolation as error:
        if "THREEC_EMPTY_FIT_SUMMARY" not in str(error):
            raise
        empty_fit_summary_refusal_proof["raised"] = True
        empty_fit_summary_refusal_proof["error_code"] = "THREEC_EMPTY_FIT_SUMMARY"
    if not empty_fit_summary_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("THREEC_INVARIANT_NOT_ENFORCED: an empty fit_summary was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyFitSummaryRecordRefused", {"refusal_proof": empty_fit_summary_refusal_proof}, 1.7)
    milestones.append("EMPTY_FIT_SUMMARY_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (mutate the COMPANY finding's own dimension to CUSTOMER on a raw copy of the valid analysis). ---
    tampered = copy.deepcopy(analysis)
    tampered["findings"][2]["dimension"] = "CUSTOMER"  # was COMPANY -- now zero COMPANY findings remain
    tampered_gate_results = evaluate_three_c_gates(tampered, "run_three_c_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate_results)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("THREEC_GATE_NOT_INDEPENDENT: the independent dimension_coverage gate did NOT catch a hand-tampered missing-COMPANY analysis")
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
        "missing_dimension_refusal_proof": missing_dimension_refusal_proof,
        "empty_fit_summary_refusal_proof": empty_fit_summary_refusal_proof,
        "tampered_gate_results": tampered_gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "three_c_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_three_c_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.three_c: ThreeCAnalysis {result['analysis']['id']} built with {len(result['analysis']['findings'])} findings, "
        f"gates [{gate_summary}]; "
        f"MISSING_DIMENSION_COVERAGE invariant REFUSED a COMPANY-less attempt ({result['missing_dimension_refusal_proof']['error_code']}); "
        f"EMPTY_FIT_SUMMARY invariant REFUSED an unstated-fit attempt ({result['empty_fit_summary_refusal_proof']['error_code']}); "
        f"missing-dimension tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
