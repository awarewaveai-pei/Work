"""``epistemic.evidence_matrix`` vertical slice -- F10 epistemic-quality family (Atlas L575).

Builds a real `EvidenceMatrix` aligning 2 claims against 3 evidence items
(a growth claim supported by one market report, a price-sensitivity claim
both supported by a customer interview AND contradicted by a competitor
pricing analysis) -- every declared claim covered by at least 1 link. Then
proves Atlas's own "快速看到薄弱 claim" purpose is real, not mere narrative
intent: a construction-time attempt to declare a third claim with zero
links is refused, and a hand-tampered valid record (that same claim's only
link deleted, bypassing the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_evidence_matrix_slice
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
from ai_lego.modules.epistemic.evidence_matrix import (
    METHOD_ID,
    all_gates_pass,
    evaluate_evidence_matrix_gates,
    evaluate_no_orphan_claim_gate,
    generate_evidence_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EVIDMATRIX-SYNTHETIC-001"
EXECUTION_ID = "EX-EVIDMATRIX-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-EVIDMATRIX-001"

S = {
    "evidence_matrix": "ai-lego://specs/cognitive/typed-objects/evidence-matrix.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-evidence-matrix-slice"


def _claims() -> list[dict[str, Any]]:
    return [
        {"claim_id": "C-1", "statement": "本產品在東南亞市場有成長潛力", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")},
        {"claim_id": "C-2", "statement": "目標客群的價格敏感度高於預期", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")},
    ]


def _evidence_items() -> list[dict[str, Any]]:
    return [
        {"evidence_id": "E-1", "content": "東南亞電商年成長報告", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
        {"evidence_id": "E-2", "content": "客戶訪談紀錄顯示對價格敏感", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
        {"evidence_id": "E-3", "content": "競品定價分析", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
    ]


def _links() -> list[dict[str, Any]]:
    return [
        {"claim_id": "C-1", "evidence_id": "E-1", "relation": "SUPPORTS"},
        {"claim_id": "C-2", "evidence_id": "E-2", "relation": "SUPPORTS"},
        {"claim_id": "C-2", "evidence_id": "E-3", "relation": "CONTRADICTS"},
    ]


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "claims": _claims(),
        "evidence_items": _evidence_items(),
        "links": _links(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_evidence_matrix_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed matrix -- 2 claims, 3 evidence items, 3 links, every claim covered
    # by at least 1 link. ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_evidence_matrix,
        "EVIDMATRIX-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["evidence_matrix"], matrix, "evidence matrix")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceMatrixGenerated", {"evidence_matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_evidence_matrix_gates(matrix, "run_evidence_matrix_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"evidence matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EVIDMATRIX_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceMatrixGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L575's own "快速看到薄弱 claim" is not toothless -- a 3rd claim declared with
    # ZERO links MUST be refused before any record is constructed. ---
    orphan_claim = {"claim_id": "C-3", "statement": "新功能會顯著提升留存率", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")}
    orphan_kwargs = {**_well_formed_kwargs(), "claims": _claims() + [orphan_claim]}
    orphan_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_evidence_matrix("EVIDMATRIX-ORPHAN-CLAIM-REFUSED-001", **orphan_kwargs)
    except InvariantViolation as error:
        if "EVIDMATRIX_ORPHAN_CLAIM" not in str(error):
            raise
        orphan_refusal_proof["raised"] = True
        orphan_refusal_proof["error_code"] = "EVIDMATRIX_ORPHAN_CLAIM"
    if not orphan_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("EVIDMATRIX_INVARIANT_NOT_ENFORCED: an orphan claim was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OrphanClaimRefused", {"refusal_proof": orphan_refusal_proof}, 1.3)
    milestones.append("ORPHAN_CLAIM_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (deletes C-2's only remaining SUPPORTS link directly on a VALID record's
    # own raw dict, leaving C-2 an orphan while its CONTRADICTS link to E-3 stays -- still covered, so instead
    # strip BOTH of C-2's links to genuinely orphan it). ---
    tampered = copy.deepcopy(matrix)
    tampered["links"] = [l for l in tampered["links"] if l["claim_id"] != "C-2"]
    tampered_gate = evaluate_no_orphan_claim_gate(tampered, "run_evidence_matrix_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("EVIDMATRIX_GATE_NOT_INDEPENDENT: the independent no_orphan_claim gate did NOT catch a hand-tampered record with an orphaned claim")
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
        "evidence_matrix": matrix,
        "gate_results": gate_results,
        "orphan_claim_refusal_proof": orphan_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_behavior_over_time_slice.py)",
    }
    write_json(runtime / "results" / "evidence_matrix_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_evidence_matrix_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.evidence_matrix: EvidenceMatrix {result['evidence_matrix']['id']} built (2 claims, 3 evidence items, 3 links), gates [{gate_summary}]; "
        f"EVIDMATRIX_ORPHAN_CLAIM REFUSED a claim declared with zero links ({result['orphan_claim_refusal_proof']['error_code']}); "
        f"hand-tampered record (a claim's only links deleted) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
