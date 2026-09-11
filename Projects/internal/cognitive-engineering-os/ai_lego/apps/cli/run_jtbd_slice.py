"""``insight.jtbd`` vertical slice -- F06 human/customer insight family, OPENING member (F06 had zero built
methods before this batch; 1 of 9 concurrent agents opening F02/F03/F04/F06/F08 members in this same parallel
batch).

Scenario: a JTBD statement for a small-studio owner's monthly invoicing job, with a cited local workaround and
local evidence -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``JtbdStatement`` satisfying both real invariants (3-clause completeness, mandatory non-empty local_evidence),
then demonstrates each invariant once as a construction-time REFUSAL (an empty local_evidence; an empty
situation clause), proving neither is toothless, same "show a real refusal, not only a real success" discipline
every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record directly (bypassing
the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_jtbd_slice
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
from ai_lego.modules.insight.jtbd import (
    METHOD_ID,
    all_gates_pass,
    evaluate_jtbd_gates,
    generate_jtbd_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-JTBD-SYNTHETIC-001"
EXECUTION_ID = "EX-JTBD-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-JTBD-001"

S = {
    "jtbd_statement": "ai-lego://specs/cognitive/typed-objects/jtbd-statement.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-jtbd-slice"


def _well_formed_statement_kwargs() -> dict[str, Any]:
    return {
        "situation": "小型工作室老闆每個月月底要同時處理 5-10 個客戶的請款單，且大多客戶用 LINE 而非 email 溝通",
        "motivation": "想要在不切換到電腦、不用另外學新系統的情況下，把請款單正確送到對的客戶手上",
        "desired_outcome": "月底請款流程縮短到 30 分鐘內完成，且不再因為單號或金額打錯而跟客戶來回澄清",
        "local_evidence": "訪談 6 位台灣工作室老闆，5 位表示 LINE 是主要客戶溝通管道，僅 1 位使用 email 為主（2026-08 訪談紀錄）",
        "provenance": make_provenance("EVIDENCE", "HUMAN_ORIGINAL"),
        "workaround": "目前用手機拍 Excel 截圖傳 LINE，金額用小算盤先算好再手動填入",
    }


def run_jtbd_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.jtbd resolves because its contract is
    # ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed statement -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, statement = catalog.invoke(
        METHOD_ID,
        generate_jtbd_statement,
        "JTBD-2026-09-11-001",
        **_well_formed_statement_kwargs(),
    )
    contracts.validate(S["jtbd_statement"], statement, "jtbd statement")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "JtbdStatementGenerated", {"statement": statement, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_jtbd_gates(statement, "run_jtbd_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.jtbd gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("JTBD_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 2 (mandatory local_evidence) is not toothless -- an empty local_evidence
    # string MUST be refused before any record is constructed. ---
    empty_evidence_kwargs = {**_well_formed_statement_kwargs(), "local_evidence": "   "}
    empty_evidence_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_jtbd_statement("JTBD-EMPTY-EVIDENCE-REFUSED-001", **empty_evidence_kwargs)
    except InvariantViolation as error:
        if "JTBD_EMPTY_LOCAL_EVIDENCE" not in str(error):
            raise
        empty_evidence_refusal_proof["raised"] = True
        empty_evidence_refusal_proof["error_code"] = "JTBD_EMPTY_LOCAL_EVIDENCE"
    if not empty_evidence_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JTBD_INVARIANT_NOT_ENFORCED: an empty local_evidence was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyLocalEvidenceRefused", {"refusal_proof": empty_evidence_refusal_proof}, 1.3)
    milestones.append("EMPTY_LOCAL_EVIDENCE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 1 (3-clause completeness) is not toothless -- an empty situation clause MUST
    # be refused before any record is constructed. ---
    empty_situation_kwargs = {**_well_formed_statement_kwargs(), "situation": "   "}
    empty_situation_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_jtbd_statement("JTBD-EMPTY-SITUATION-REFUSED-001", **empty_situation_kwargs)
    except InvariantViolation as error:
        if "JTBD_EMPTY_SITUATION" not in str(error):
            raise
        empty_situation_refusal_proof["raised"] = True
        empty_situation_refusal_proof["error_code"] = "JTBD_EMPTY_SITUATION"
    if not empty_situation_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JTBD_INVARIANT_NOT_ENFORCED: an empty situation was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptySituationRefused", {"refusal_proof": empty_situation_refusal_proof}, 1.5)
    milestones.append("EMPTY_SITUATION_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices an empty desired_outcome directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(statement)
    tampered["desired_outcome"] = ""  # was a real sentence -- bypasses the builder directly
    tampered_gate = evaluate_jtbd_gates(tampered, "run_jtbd_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("JTBD_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered empty desired_outcome")
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
        "statement": statement,
        "gate_results": gate_results,
        "empty_evidence_refusal_proof": empty_evidence_refusal_proof,
        "empty_situation_refusal_proof": empty_situation_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "jtbd_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_jtbd_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.jtbd: JtbdStatement {result['statement']['id']} built, gates [{gate_summary}]; "
        f"JTBD_EMPTY_LOCAL_EVIDENCE/JTBD_EMPTY_SITUATION invariants each REFUSED a malformed attempt "
        f"({result['empty_evidence_refusal_proof']['error_code']}, {result['empty_situation_refusal_proof']['error_code']}); "
        f"hand-tampered empty desired_outcome caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
