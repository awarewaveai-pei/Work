"""``strategy.tows`` vertical slice -- F08 context/strategy family, 2nd member (after ``strategy.swot``).

Demonstrates the REAL SWOT -> TOWS chain end-to-end: builds an actual ``SwotAnalysis`` via
``ai_lego.modules.strategy.swot``'s own real functions (``generate_swot_analysis``/``swot_factor`` -- same
scenario ``run_swot_slice.py`` uses, real imports, no duplicated mock), then builds a real ``TowsMatrix`` that
genuinely validates its pairings against that SwotAnalysis's real factor categories. Proves each of TOWS's own
real invariants once as a construction-time REFUSAL (a caller-supplied pairing_type; a category-mismatched
factor placement; an unknown factor id), same "show a real refusal, not only a real success" discipline every
sibling slice's CLI demo already establishes. A final step hand-tampers a VALID TowsMatrix directly (bypassing
the builder) to prove the independent gate, not just the builder, catches the same defect against the real
SwotAnalysis.

Run::

    python -m ai_lego.apps.cli.run_tows_slice
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
from ai_lego.modules.strategy.swot import generate_swot_analysis, swot_factor
from ai_lego.modules.strategy.tows import (
    METHOD_ID,
    all_gates_pass,
    evaluate_tows_gates,
    generate_tows_matrix,
    tows_pairing,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TOWS-SYNTHETIC-001"
EXECUTION_ID = "EX-TOWS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-TOWS-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "swot_analysis": "ai-lego://specs/cognitive/typed-objects/swot-analysis.schema.yaml",
    "tows_matrix": "ai-lego://specs/cognitive/typed-objects/tows-matrix.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-tows-slice"


def run_tows_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution for BOTH real methods in this chain -- zero new code in method_resolver.py. Both
    # resolve because their contracts are ACTIVE in the spec root's methods/contracts/. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID, "strategy.swot"])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: build a REAL SwotAnalysis via strategy.swot's own real functions (same scenario
    # run_swot_slice.py uses) -- this is the literal upstream data TOWS pairs against, not a mock. ---
    knowledge_set = [
        evidence_record("E-201", "既有客戶續約率連續三季維持在 92% 以上", "SRC-RENEWAL-REPORT", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        evidence_record("E-202", "同區域出現兩家提供相同服務的新進入者", "SRC-MARKET-BRIEF", make_provenance("EVIDENCE", "AI_SUGGESTED")),
    ]
    for record in knowledge_set:
        contracts.validate(S["evidence"], record, f"evidence {record['evidence_id']}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KnowledgeSetAssembled", {"knowledge_set": knowledge_set}, 1)
    milestones.append("KNOWLEDGE_SET_ASSEMBLED")

    factors = [
        swot_factor("SWOT-2026-09-11-001-F1", "STRENGTH", "既有客戶續約率連續三季維持在 92% 以上", "TW", "2026-Q3", "內部訂閱續約報表", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-201"]),
        swot_factor("SWOT-2026-09-11-001-F2", "THREAT", "同區域出現兩家提供相同服務的新進入者", "TW", "2026-Q3", "市場情報簡報 2026-08", make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["E-202"]),
        swot_factor("SWOT-2026-09-11-001-F3", "OPPORTUNITY", "鄰近市場本季法規鬆綁", "SG", "2026-Q3", "現場觀察筆記", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        swot_factor("SWOT-2026-09-11-001-F4", "WEAKNESS", "客服團隊僅支援單一時區，跨區回應延遲", "TW", "2026-Q3", "客服工單分析", make_provenance("EVIDENCE", "AI_SUGGESTED")),
    ]
    swot_descriptor, swot_analysis = catalog.invoke(
        "strategy.swot",
        generate_swot_analysis,
        "SWOT-2026-09-11-001",
        "KS-2026-09-11-001",
        knowledge_set,
        factors,
    )
    contracts.validate(S["swot_analysis"], swot_analysis, "swot analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SwotAnalysisGenerated", {"swot_analysis": swot_analysis, "method_descriptor": swot_descriptor}, 1.5)
    milestones.append("SWOT_ANALYSIS_BUILT")

    # --- Step 2: build a REAL TowsMatrix against that SwotAnalysis -- 2 pairings, genuinely resolved from the
    # SwotAnalysis's own factor categories (SO from F1 STRENGTH + F3 OPPORTUNITY; WT from F4 WEAKNESS + F2 THREAT). ---
    pairings = [
        tows_pairing(
            "TOWS-2026-09-11-001-P1",
            "SWOT-2026-09-11-001-F1",
            "SWOT-2026-09-11-001-F3",
            "既有 92% 續約率證明客戶信任度高，可將此信任資產包裝為進入 SG 市場的背書，優先在法規鬆綁的鄰近市場複製既有訂閱方案",
        ),
        tows_pairing(
            "TOWS-2026-09-11-001-P2",
            "SWOT-2026-09-11-001-F4",
            "SWOT-2026-09-11-001-F2",
            "在新進入者搶市前，優先擴編客服跨時區排班以降低回應延遲，避免既有客戶因服務體驗流失給新進入者",
        ),
    ]
    tows_descriptor, tows_matrix = catalog.invoke(
        METHOD_ID,
        generate_tows_matrix,
        "TOWS-2026-09-11-001",
        swot_analysis,
        pairings,
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["tows_matrix"], tows_matrix, "tows matrix")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TowsMatrixGenerated", {"tows_matrix": tows_matrix, "method_descriptor": tows_descriptor}, 2)
    milestones.append("TOWS_MATRIX_BUILT")

    gate_results = evaluate_tows_gates(tows_matrix, swot_analysis, "run_tows_slice", clock.at(2.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.tows gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("TOWS_GATE_FAILED on the deliberately well-formed matrix")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the pairing_type-must-not-be-caller-supplied invariant is not toothless -- a pairing
    # dict smuggling its own pairing_type key MUST be refused before any record is constructed. ---
    caller_type_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    smuggled_pairing = {**tows_pairing("TOWS-BAD-001", "SWOT-2026-09-11-001-F1", "SWOT-2026-09-11-001-F3", "some option"), "pairing_type": "SO"}
    try:
        generate_tows_matrix("TOWS-REFUSED-CALLERTYPE-001", swot_analysis, [smuggled_pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED" not in str(error):
            raise
        caller_type_refusal_proof["raised"] = True
        caller_type_refusal_proof["error_code"] = "TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED"
    if not caller_type_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TOWS_INVARIANT_NOT_ENFORCED: a caller-supplied pairing_type was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CallerSuppliedPairingTypeRefused", {"refusal_proof": caller_type_refusal_proof}, 2.3)
    milestones.append("CALLER_TYPE_REFUSAL_PROVEN")

    # --- Step 4: proof the internal/external category invariant is not toothless -- swapping F1 (STRENGTH) and
    # F3 (OPPORTUNITY) into the WRONG slots (internal_factor_id pointing at an EXTERNAL factor) MUST be refused. ---
    category_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    swapped_pairing = tows_pairing("TOWS-BAD-002", "SWOT-2026-09-11-001-F3", "SWOT-2026-09-11-001-F1", "some option")
    try:
        generate_tows_matrix("TOWS-REFUSED-SWAPPEDCATEGORY-001", swot_analysis, [swapped_pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "TOWS_INTERNAL_FACTOR_NOT_INTERNAL" not in str(error):
            raise
        category_refusal_proof["raised"] = True
        category_refusal_proof["error_code"] = "TOWS_INTERNAL_FACTOR_NOT_INTERNAL"
    if not category_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TOWS_INVARIANT_NOT_ENFORCED: an internal_factor_id pointing at an EXTERNAL factor was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SwappedCategoryPairingRefused", {"refusal_proof": category_refusal_proof}, 2.4)
    milestones.append("CATEGORY_REFUSAL_PROVEN")

    # --- Step 5: proof the unknown-factor-id invariant is not toothless -- a factor id absent from the real
    # SwotAnalysis MUST be refused. ---
    unknown_id_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    unknown_pairing = tows_pairing("TOWS-BAD-003", "SWOT-2026-09-11-001-F1", "SWOT-DOES-NOT-EXIST-F9", "some option")
    try:
        generate_tows_matrix("TOWS-REFUSED-UNKNOWNID-001", swot_analysis, [unknown_pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "TOWS_UNKNOWN_FACTOR_ID" not in str(error):
            raise
        unknown_id_refusal_proof["raised"] = True
        unknown_id_refusal_proof["error_code"] = "TOWS_UNKNOWN_FACTOR_ID"
    if not unknown_id_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TOWS_INVARIANT_NOT_ENFORCED: an unknown external_factor_id was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnknownFactorIdPairingRefused", {"refusal_proof": unknown_id_refusal_proof}, 2.5)
    milestones.append("UNKNOWN_ID_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely, re-checked against the SAME real SwotAnalysis. ---
    tampered = {**tows_matrix, "pairings": [dict(p) for p in tows_matrix["pairings"]]}
    tampered["pairings"][0]["pairing_type"] = "WT"  # was genuinely SO (F1 STRENGTH + F3 OPPORTUNITY) -- now a lie
    tampered_gate = evaluate_tows_gates(tampered, swot_analysis, "run_tows_slice", clock.at(2.6))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("TOWS_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered pairing_type")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.7)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "swot_analysis": swot_analysis,
        "tows_matrix": tows_matrix,
        "gate_results": gate_results,
        "caller_type_refusal_proof": caller_type_refusal_proof,
        "category_refusal_proof": category_refusal_proof,
        "unknown_id_refusal_proof": unknown_id_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "tows_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_tows_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.tows: real SWOT->TOWS chain built ({result['swot_analysis']['id']} -> {result['tows_matrix']['id']}, "
        f"{len(result['tows_matrix']['pairings'])} pairings [{', '.join(p['pairing_type'] for p in result['tows_matrix']['pairings'])}]), "
        f"gates [{gate_summary}]; "
        f"CALLER_SUPPLIED_PAIRING_TYPE REFUSED ({result['caller_type_refusal_proof']['error_code']}); "
        f"SWAPPED_CATEGORY REFUSED ({result['category_refusal_proof']['error_code']}); "
        f"UNKNOWN_FACTOR_ID REFUSED ({result['unknown_id_refusal_proof']['error_code']}); "
        f"tampered pairing_type caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
