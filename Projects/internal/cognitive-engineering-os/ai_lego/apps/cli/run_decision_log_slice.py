"""``delivery.decision_log`` vertical slice -- F22 PM/Delivery/Governance Pack (Atlas L924).

Builds a well-formed decision log entry (scheduled revisit) over a synthetic
governance scenario, then proves Atlas's own "避免重複爭論" pipeline stages
are real invariants, not mere narrative order: a construction-time attempt
to submit an entry with EMPTY evidence is refused, and a hand-tampered valid
record (revisit silently flipped to NO_REVISIT_PLANNED while a stale trigger
string is left in place, bypassing the builder) is independently caught by
the revisit_disambiguation gate.

Run::

    python -m ai_lego.apps.cli.run_decision_log_slice
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
from ai_lego.modules.delivery.decision_log import (
    METHOD_ID,
    all_gates_pass,
    evaluate_decision_log_gates,
    evaluate_revisit_disambiguation_gate,
    generate_decision_log_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DLOG-SYNTHETIC-001"
EXECUTION_ID = "EX-DLOG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DLOG-001"

S = {
    "decision_log": "ai-lego://specs/cognitive/typed-objects/decision-log-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-decision-log-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "context": "選擇下一季內容引擎的 SEO 策略方向",
        "decision": "採用 AI-first 內容引擎，不採購付費 SEO API",
        "evidence": ["付費 API 月費超過目前客戶預算上限", "AI-first 原型已驗證可產出可用內容"],
        "owner": "content-engine-lead",
        "revisit": {"mode": "SCHEDULED", "trigger": "2027-Q1 或客戶數超過 20 時重新評估"},
        "provenance": make_provenance("DECISION", "HUMAN_APPROVED", "LOCKED_DECISION"),
    }


def run_decision_log_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed entry -- non-empty decision/evidence, scheduled revisit. ---
    descriptor, entry = catalog.invoke(
        METHOD_ID,
        generate_decision_log_entry,
        "DLOG-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["decision_log"], entry, "decision log entry")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DecisionLogEntryGenerated", {"entry": entry, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_decision_log_gates(entry, "run_decision_log_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decision log gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DLOG_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DecisionLogGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L924's own "避免重複爭論" pipeline is not toothless -- an entry with EMPTY
    # evidence MUST be refused before any record is constructed. ---
    empty_evidence_kwargs = copy.deepcopy(_well_formed_kwargs())
    empty_evidence_kwargs["evidence"] = []
    empty_evidence_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_decision_log_entry("DLOG-EMPTY-EVIDENCE-REFUSED-001", **empty_evidence_kwargs)
    except InvariantViolation as error:
        if "DLOG_INVALID_EVIDENCE" not in str(error):
            raise
        empty_evidence_refusal_proof["raised"] = True
        empty_evidence_refusal_proof["error_code"] = "DLOG_INVALID_EVIDENCE"
    if not empty_evidence_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DLOG_INVARIANT_NOT_ENFORCED: an entry with empty evidence was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EmptyEvidenceRefused", {"refusal_proof": empty_evidence_refusal_proof}, 1.3)
    milestones.append("EMPTY_EVIDENCE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT revisit_disambiguation gate catches the same defect
    # class even when a caller bypasses the builder entirely (mode flipped to NO_REVISIT_PLANNED while a
    # stale trigger string is left in place). ---
    tampered = copy.deepcopy(entry)
    tampered["revisit"] = {"mode": "NO_REVISIT_PLANNED", "trigger": "still says 2027-Q1"}
    tampered_gate = evaluate_revisit_disambiguation_gate(tampered, "run_decision_log_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DLOG_GATE_NOT_INDEPENDENT: the independent revisit_disambiguation gate did NOT catch a hand-tampered NO_REVISIT_PLANNED entry with a stale non-null trigger")
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
        "decision_log_entry": entry,
        "gate_results": gate_results,
        "empty_evidence_refusal_proof": empty_evidence_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "decision_log_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_decision_log_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.decision_log: DecisionLogEntry {result['decision_log_entry']['id']} built "
        f"(non-empty decision+evidence, scheduled revisit), gates [{gate_summary}]; "
        f"DLOG_INVALID_EVIDENCE REFUSED an empty-evidence attempt ({result['empty_evidence_refusal_proof']['error_code']}); "
        f"hand-tampered stale-trigger record caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
