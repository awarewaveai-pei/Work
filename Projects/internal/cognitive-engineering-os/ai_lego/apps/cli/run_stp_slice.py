"""``strategy.stp`` vertical slice -- F08 context/strategy family, 7th member (after ``strategy.swot``/
``strategy.pestel``/``strategy.steepv``/``strategy.three_c``/``strategy.tows``/``strategy.porter_five_forces``).

Self-contained scenario (the method contract's own ``inputs.required: []`` -- no external upstream typed-object
input, unlike ``strategy.tows``'s real SwotAnalysis dependency): Nordbrook Research Lab segments its market
into 2 candidate segments, targets 1 of them, and states a disclosed positioning for it. Proves each of STP's
own real invariants once as a construction-time REFUSAL (empty segments; targeting a segment id that was never
identified; an empty positioning statement), same "show a real refusal, not only a real success" discipline
every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID StpAnalysis directly
(bypassing the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_stp_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.stp import (
    METHOD_ID,
    all_gates_pass,
    evaluate_stp_gates,
    generate_stp_analysis,
    segment,
    targeting_decision,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STP-SYNTHETIC-001"
EXECUTION_ID = "EX-STP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STP-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "stp_analysis": "ai-lego://specs/cognitive/typed-objects/stp-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-stp-slice"


def _valid_segments() -> list[dict[str, Any]]:
    return [
        segment(
            "STP-2026-09-11-001-S1",
            "價格敏感的獨立接案者",
            ["個人工作室規模", "月預算低於 $50", "自助服務偏好高"],
        ),
        segment(
            "STP-2026-09-11-001-S2",
            "中型行銷代理商",
            ["5-50 人團隊規模", "需要多客戶白牌功能", "願付年約"],
            supporting_evidence_refs=["E-301"],
        ),
    ]


def run_stp_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution -- zero new code in method_resolver.py. strategy.stp resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the WHITE-LABEL segment's own supporting_evidence_refs cites. ---
    segment_evidence = evidence_record("E-301", "中型代理商客戶訪談：5 家中,4 家表示需要白牌多客戶報表", "SRC-AGENCY-INTERVIEWS-Q3", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], segment_evidence, "evidence E-301")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [segment_evidence]}, 1)

    # --- Step 2: Segmentation (stage 1) -- 2 real candidate segments. ---
    segments = _valid_segments()

    # --- Step 3: Targeting (stage 2) + Positioning (stage 3) -- the complete, well-formed StpAnalysis. ---
    target = targeting_decision(
        "STP-2026-09-11-001-S2",
        "中型代理商的年約續約率與客單價都顯著高於獨立接案者區段，且白牌需求與現有產品能力直接吻合",
    )
    positioning = (
        "For 中型行銷代理商 who need to run multiple client brands from one workspace, Nordbrook Insights is the "
        "white-label campaign platform that lets a 5-person team deliver agency-grade reporting without hiring "
        "a dedicated ops person."
    )
    stp_descriptor, stp_analysis = catalog.invoke(
        METHOD_ID,
        generate_stp_analysis,
        "STP-2026-09-11-001",
        segments,
        target,
        positioning,
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["stp_analysis"], stp_analysis, "stp analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StpAnalysisGenerated", {"stp_analysis": stp_analysis, "method_descriptor": stp_descriptor}, 1.5)
    milestones.append("STP_ANALYSIS_BUILT")

    gate_results = evaluate_stp_gates(stp_analysis, "run_stp_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.stp gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("STP_GATE_FAILED on the deliberately well-formed analysis")
    milestones.append("GATES_PASSED")

    # --- Step 4: proof the empty-segments invariant is not toothless -- Segmentation producing zero segments
    # MUST be refused before any record is constructed. ---
    empty_segments_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stp_analysis("STP-REFUSED-EMPTYSEGMENTS-001", [], target, positioning, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STP_EMPTY_SEGMENTS" not in str(error):
            raise
        empty_segments_refusal_proof["raised"] = True
        empty_segments_refusal_proof["error_code"] = "STP_EMPTY_SEGMENTS"
    if not empty_segments_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STP_INVARIANT_NOT_ENFORCED: empty segments was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptySegmentsRefused", {"refusal_proof": empty_segments_refusal_proof}, 1.7)
    milestones.append("EMPTY_SEGMENTS_REFUSAL_PROVEN")

    # --- Step 5: proof the referential-integrity invariant is not toothless -- targeting a segment id that was
    # never identified in segments[] MUST be refused. ---
    unknown_target_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    unknown_target = targeting_decision("STP-DOES-NOT-EXIST", "some rationale")
    try:
        generate_stp_analysis("STP-REFUSED-UNKNOWNTARGET-001", segments, unknown_target, positioning, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STP_UNKNOWN_TARGET_SEGMENT_ID" not in str(error):
            raise
        unknown_target_refusal_proof["raised"] = True
        unknown_target_refusal_proof["error_code"] = "STP_UNKNOWN_TARGET_SEGMENT_ID"
    if not unknown_target_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STP_INVARIANT_NOT_ENFORCED: a targeting_decision referencing an unidentified segment was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnknownTargetSegmentRefused", {"refusal_proof": unknown_target_refusal_proof}, 1.8)
    milestones.append("UNKNOWN_TARGET_REFUSAL_PROVEN")

    # --- Step 6: proof the empty-positioning-statement invariant is not toothless -- Positioning (stage 3)
    # producing no disclosed content MUST be refused. ---
    empty_positioning_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stp_analysis("STP-REFUSED-EMPTYPOSITIONING-001", segments, target, "   ", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STP_EMPTY_POSITIONING_STATEMENT" not in str(error):
            raise
        empty_positioning_refusal_proof["raised"] = True
        empty_positioning_refusal_proof["error_code"] = "STP_EMPTY_POSITIONING_STATEMENT"
    if not empty_positioning_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STP_INVARIANT_NOT_ENFORCED: an empty positioning_statement was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyPositioningRefused", {"refusal_proof": empty_positioning_refusal_proof}, 1.9)
    milestones.append("EMPTY_POSITIONING_REFUSAL_PROVEN")

    # --- Step 7: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = {**stp_analysis, "targeting_decision": {**stp_analysis["targeting_decision"], "targeted_segment_id": "STP-DOES-NOT-EXIST"}}
    tampered_gate = evaluate_stp_gates(tampered, "run_stp_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("STP_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered targeted_segment_id")
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
        "stp_analysis": stp_analysis,
        "gate_results": gate_results,
        "empty_segments_refusal_proof": empty_segments_refusal_proof,
        "unknown_target_refusal_proof": unknown_target_refusal_proof,
        "empty_positioning_refusal_proof": empty_positioning_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_tows_slice.py)",
    }
    write_json(runtime / "results" / "stp_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_stp_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.stp: StpAnalysis {result['stp_analysis']['id']} built "
        f"({len(result['stp_analysis']['segments'])} segments, targeting {result['stp_analysis']['targeting_decision']['targeted_segment_id']}), "
        f"gates [{gate_summary}]; "
        f"EMPTY_SEGMENTS REFUSED ({result['empty_segments_refusal_proof']['error_code']}); "
        f"UNKNOWN_TARGET_SEGMENT REFUSED ({result['unknown_target_refusal_proof']['error_code']}); "
        f"EMPTY_POSITIONING_STATEMENT REFUSED ({result['empty_positioning_refusal_proof']['error_code']}); "
        f"tampered targeted_segment_id caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
