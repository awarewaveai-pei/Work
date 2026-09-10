"""``strategy.porter_five_forces`` vertical slice -- F08 context/strategy family, 2nd member (``strategy.swot``
was the 1st, see ``run_swot_slice.py``).

Scenario: a Porter Five Forces analysis for a regional SaaS market-entry decision -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``PorterFiveForcesAnalysis`` covering all 5
Atlas §12.11 forces, then demonstrates each of the 3 real invariants once as a construction-time REFUSAL
(an incomplete force set missing BUYER_POWER; an empty ``assessment``; a missing ``overall_attractiveness``),
proving none is toothless, same "show a real refusal, not only a real success" discipline every sibling
slice's CLI demo already establishes. A final step hand-tampers a VALID record directly (bypassing the
builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_porter_five_forces_slice
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
from ai_lego.modules.strategy.porter_five_forces import (
    METHOD_ID,
    all_gates_pass,
    evaluate_porter_five_forces_gates,
    force_entry,
    generate_porter_five_forces_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PFF-SYNTHETIC-001"
EXECUTION_ID = "EX-PFF-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PFF-001"

S = {
    "pff_analysis": "ai-lego://specs/cognitive/typed-objects/porter-five-forces-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-porter-five-forces-slice"


def _well_formed_forces() -> list[dict[str, Any]]:
    return [
        force_entry(
            "INDUSTRY_RIVALRY", "HIGH", "現有 5 家同類 SaaS 供應商，價格競爭激烈，客戶轉換成本低", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-401"]
        ),
        force_entry("NEW_ENTRANTS", "MEDIUM", "技術門檻中等，但既有品牌與通路關係形成一定進入障礙", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        force_entry("SUBSTITUTES", "LOW", "尚無功能對等的替代方案，人工流程轉換成本高", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        force_entry("SUPPLIER_POWER", "LOW", "雲端基礎設施供應商眾多，可自由更換，議價力弱", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        force_entry(
            "BUYER_POWER", "MEDIUM", "中大型客戶集中採購具議價力，但長尾客戶議價力低", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-402"]
        ),
    ]


def run_porter_five_forces_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.porter_five_forces resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- all 3 real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_porter_five_forces_analysis,
        "PFF-2026-09-11-001",
        _well_formed_forces(),
        "整體產業吸引力中等偏低：現有競爭與買方議價力壓縮利潤空間，但進入障礙與替代品威脅有限，仍具長期經營價值，建議搭配 Benchmark 分析既有領導者定位後再決策",
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["pff_analysis"], analysis, "porter five forces analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PorterFiveForcesAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_porter_five_forces_gates(analysis, "run_porter_five_forces_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.porter_five_forces gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PORTER_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a force set missing BUYER_POWER (only
    # 4 of the 5 required forces) MUST be refused before any record is constructed. ---
    incomplete_forces = _well_formed_forces()[:4]  # drops BUYER_POWER
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_porter_five_forces_analysis("PFF-INCOMPLETE-REFUSED-001", incomplete_forces, "some conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "PORTER_INCOMPLETE_FORCE_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "PORTER_INCOMPLETE_FORCE_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PORTER_INVARIANT_NOT_ENFORCED: an incomplete force set (missing BUYER_POWER) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteForceSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-force content) is not toothless -- an empty assessment on one force
    # MUST be refused. force_entry() itself validates force/intensity only, so the empty-assessment defect
    # is constructed directly as a raw dict to exercise generate_porter_five_forces_analysis's own check. ---
    empty_assessment_forces = _well_formed_forces()
    empty_assessment_forces[0] = {**empty_assessment_forces[0], "assessment": "   "}
    empty_assessment_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_porter_five_forces_analysis("PFF-EMPTY-ASSESSMENT-REFUSED-001", empty_assessment_forces, "some conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "PORTER_EMPTY_ASSESSMENT" not in str(error):
            raise
        empty_assessment_refusal_proof["raised"] = True
        empty_assessment_refusal_proof["error_code"] = "PORTER_EMPTY_ASSESSMENT"
    if not empty_assessment_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PORTER_INVARIANT_NOT_ENFORCED: an empty force assessment was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyAssessmentRefused", {"refusal_proof": empty_assessment_refusal_proof}, 1.5)
    milestones.append("EMPTY_ASSESSMENT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (overall_attractiveness) is not toothless -- a blank conclusion MUST be
    # refused: labeling all 5 forces but never concluding is not the method's own defining benefit. ---
    empty_conclusion_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_porter_five_forces_analysis("PFF-EMPTY-CONCLUSION-REFUSED-001", _well_formed_forces(), "   ", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "PORTER_EMPTY_OVERALL_ATTRACTIVENESS" not in str(error):
            raise
        empty_conclusion_refusal_proof["raised"] = True
        empty_conclusion_refusal_proof["error_code"] = "PORTER_EMPTY_OVERALL_ATTRACTIVENESS"
    if not empty_conclusion_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PORTER_INVARIANT_NOT_ENFORCED: an empty overall_attractiveness was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyOverallAttractivenessRefused", {"refusal_proof": empty_conclusion_refusal_proof}, 1.7)
    milestones.append("EMPTY_CONCLUSION_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops SUPPLIER_POWER from a raw copy of an already-valid record). ---
    tampered = dict(analysis)
    tampered["forces"] = [f for f in analysis["forces"] if f["force"] != "SUPPLIER_POWER"] + [analysis["forces"][0]]  # bypasses the builder directly
    tampered_gate = evaluate_porter_five_forces_gates(tampered, "run_porter_five_forces_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PORTER_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete force set")
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
        "analysis": analysis,
        "gate_results": gate_results,
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_assessment_refusal_proof": empty_assessment_refusal_proof,
        "empty_conclusion_refusal_proof": empty_conclusion_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "porter_five_forces_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_porter_five_forces_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.porter_five_forces: PorterFiveForcesAnalysis {result['analysis']['id']} built, "
        f"gates [{gate_summary}]; "
        f"INCOMPLETE_FORCE_SET/EMPTY_ASSESSMENT/EMPTY_OVERALL_ATTRACTIVENESS invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_assessment_refusal_proof']['error_code']}, "
        f"{result['empty_conclusion_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete force set caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
