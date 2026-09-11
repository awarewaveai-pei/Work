"""``insight.empathy_map`` vertical slice -- F06 human/customer-insight family, 3rd member built (see
``run_scamper_slice.py`` for the open-ended-list CLI-demo structure, reused here, and
``insight/persona.py`` for the family's own record-level-only-provenance convention).

Scenario: an empathy map for a small-studio owner evaluating a new invoicing tool -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``EmpathyMap`` covering all 4 Says/Thinks/
Does/Feels quadrants (5 entries total -- SAYS appears twice, proving more-than-4 is accepted), then
demonstrates each of the 3 real invariants once as a construction-time REFUSAL (an entries list missing the
FEELS quadrant; an entry with an invalid ``basis`` value; an empty ``subject``), proving none is toothless,
same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo already
establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_empathy_map_slice
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
from ai_lego.modules.insight.empathy_map import (
    METHOD_ID,
    all_gates_pass,
    entry,
    evaluate_empathy_map_gates,
    generate_empathy_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EMPATHYMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-EMPATHYMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EMPATHYMAP-001"

S = {
    "empathy_map": "ai-lego://specs/cognitive/typed-objects/empathy-map.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

SUBJECT = "小型工作室老闆，正在評估是否換用新的請款工具"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-empathy-map-slice"


def _well_formed_entries() -> list[dict[str, Any]]:
    return [
        entry("SAYS", "「現在的請款流程太麻煩，每次都要重複輸入客戶資料」", "FACT"),
        entry("THINKS", "可能擔心換工具會讓既有客戶的付款紀錄遺失或對不上帳", "INFERENCE"),
        entry("DOES", "訪談觀察到她每次請款都手動複製上一份估價單再修改金額", "FACT"),
        entry("FEELS", "在示範新工具的自動化功能時明顯放鬆，語氣從防備轉為好奇", "INFERENCE"),
        entry("SAYS", "「只要學習曲線不要太陡，我願意試試看」", "FACT"),
    ]


def run_empathy_map_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.empathy_map resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed empathy map -- all 3 real invariants satisfied (5 entries
    # covering all 4 quadrants, SAYS appearing twice), invoked through the catalog's own per-invocation gate
    # (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, empathy_map = catalog.invoke(
        METHOD_ID,
        generate_empathy_map,
        "EMPATHY-2026-09-11-001",
        SUBJECT,
        _well_formed_entries(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["empathy_map"], empathy_map, "empathy map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmpathyMapGenerated", {"empathy_map": empathy_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_empathy_map_gates(empathy_map, "run_empathy_map_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.empathy_map gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("EMPATHY_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (4-quadrant completeness) is not toothless -- an entries list missing the
    # FEELS quadrant MUST be refused before any record is constructed. ---
    missing_feels_entries = [e for e in _well_formed_entries() if e["quadrant"] != "FEELS"]
    missing_quadrant_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_empathy_map("EMPATHY-MISSINGFEELS-REFUSED-001", SUBJECT, missing_feels_entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "EMPATHY_MISSING_QUADRANTS" not in str(error):
            raise
        missing_quadrant_refusal_proof["raised"] = True
        missing_quadrant_refusal_proof["error_code"] = "EMPATHY_MISSING_QUADRANTS"
    if not missing_quadrant_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("EMPATHY_INVARIANT_NOT_ENFORCED: an entries list missing the FEELS quadrant was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingQuadrantRefused", {"refusal_proof": missing_quadrant_refusal_proof}, 1.3)
    milestones.append("MISSING_QUADRANT_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (basis is required and closed) is not toothless -- an entry with an
    # illegal basis value MUST be refused. entry() itself validates basis, so the defect is constructed
    # directly as a raw dict to exercise generate_empathy_map's own check. ---
    invalid_basis_entries = _well_formed_entries()
    invalid_basis_entries[0] = {**invalid_basis_entries[0], "basis": "GUESS"}
    invalid_basis_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_empathy_map("EMPATHY-BADBASIS-REFUSED-001", SUBJECT, invalid_basis_entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "EMPATHY_INVALID_BASIS" not in str(error):
            raise
        invalid_basis_refusal_proof["raised"] = True
        invalid_basis_refusal_proof["error_code"] = "EMPATHY_INVALID_BASIS"
    if not invalid_basis_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("EMPATHY_INVARIANT_NOT_ENFORCED: an entry with an illegal basis value 'GUESS' was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidBasisRefused", {"refusal_proof": invalid_basis_refusal_proof}, 1.5)
    milestones.append("INVALID_BASIS_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (subject required) is not toothless -- a blank subject MUST be refused:
    # an empathy map with no named subject has not disclosed who is being observed. ---
    empty_subject_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_empathy_map("EMPATHY-EMPTYSUBJECT-REFUSED-001", "   ", _well_formed_entries(), make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "EMPATHY_EMPTY_SUBJECT" not in str(error):
            raise
        empty_subject_refusal_proof["raised"] = True
        empty_subject_refusal_proof["error_code"] = "EMPATHY_EMPTY_SUBJECT"
    if not empty_subject_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("EMPATHY_INVARIANT_NOT_ENFORCED: an empty subject was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptySubjectRefused", {"refusal_proof": empty_subject_refusal_proof}, 1.7)
    milestones.append("EMPTY_SUBJECT_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops every DOES entry from a raw copy of an already-valid record). ---
    tampered = dict(empathy_map)
    tampered["entries"] = [e for e in empathy_map["entries"] if e["quadrant"] != "DOES"]  # bypasses the builder directly
    tampered_gate = evaluate_empathy_map_gates(tampered, "run_empathy_map_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("EMPATHY_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered missing-quadrant entries list")
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
        "empathy_map": empathy_map,
        "gate_results": gate_results,
        "missing_quadrant_refusal_proof": missing_quadrant_refusal_proof,
        "invalid_basis_refusal_proof": invalid_basis_refusal_proof,
        "empty_subject_refusal_proof": empty_subject_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_scamper_slice.py)",
    }
    write_json(runtime / "results" / "empathy_map_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_empathy_map_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.empathy_map: EmpathyMap {result['empathy_map']['id']} built with "
        f"{len(result['empathy_map']['entries'])} entries covering all 4 quadrants, gates [{gate_summary}]; "
        f"EMPATHY_MISSING_QUADRANTS/EMPATHY_INVALID_BASIS/EMPATHY_EMPTY_SUBJECT invariants each REFUSED a malformed attempt "
        f"({result['missing_quadrant_refusal_proof']['error_code']}, {result['invalid_basis_refusal_proof']['error_code']}, "
        f"{result['empty_subject_refusal_proof']['error_code']}); "
        f"hand-tampered missing-quadrant entries list caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
