"""``delivery.raid_log`` vertical slice -- F22 PM/Delivery/Governance family (Atlas L918, §11.51).

Builds a 3-item RAID log (one OPEN risk, one CLOSED issue with evidence, one MONITORING assumption) then
proves §11.51's own "formalize scattered knowledge" benefit is a real invariant, not mere narrative
order: a construction-time attempt to CLOSE an item with no evidence is refused, and a hand-tampered
valid record (evidence blanked out AFTER a CLOSED status was already set, bypassing the builder) is
independently caught by the closure_evidence gate.

Run::

    python -m ai_lego.apps.cli.run_raid_log_slice
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
from ai_lego.modules.delivery.raid_log import (
    METHOD_ID,
    all_gates_pass,
    evaluate_closure_evidence_gate,
    evaluate_raid_log_gates,
    generate_raid_log,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RAID-SYNTHETIC-001"
EXECUTION_ID = "EX-RAID-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-RAID-001"

S = {
    "raid_log": "ai-lego://specs/cognitive/typed-objects/raid-log-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-raid-log-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "items": [
            {
                "item_id": "R1",
                "type": "RISK",
                "statement": "供應商可能延遲交貨",
                "owner": "採購",
                "impact": "上線延後 2 週",
                "status": "OPEN",
                "next_action": "每週跟催",
                "due_review_date": "2026-09-19",
                "evidence": "",
            },
            {
                "item_id": "I1",
                "type": "ISSUE",
                "statement": "API 回應逾時",
                "owner": "後端",
                "impact": "結帳失敗率上升",
                "status": "CLOSED",
                "next_action": "已修復並上線",
                "due_review_date": "2026-09-05",
                "evidence": "commit d00d3b99c + production error rate back to baseline",
            },
            {
                "item_id": "A1",
                "type": "ASSUMPTION",
                "statement": "假設第三方金流 SLA 99.9%",
                "owner": "架構",
                "impact": "若不成立需加重試機制",
                "status": "MONITORING",
                "next_action": "季度覆核 SLA 報告",
                "due_review_date": "2026-12-01",
                "evidence": "",
            },
        ],
        "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    }


def run_raid_log_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed RAID log -- OPEN item with no evidence yet, CLOSED item WITH evidence. ---
    descriptor, log = catalog.invoke(
        METHOD_ID,
        generate_raid_log,
        "RAID-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["raid_log"], log, "raid log")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RaidLogGenerated", {"log": log, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_raid_log_gates(log, "run_raid_log_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"raid log gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RAID_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RaidLogGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §11.51's own closure-requires-evidence rule is not toothless -- CLOSING an item
    # with NO evidence MUST be refused before any record is constructed. ---
    closed_no_evidence_kwargs = copy.deepcopy(_well_formed_kwargs())
    closed_no_evidence_kwargs["items"][0]["status"] = "CLOSED"  # R1 was OPEN with evidence=="" -- now CLOSED, still no evidence
    closure_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_raid_log("RAID-CLOSED-NO-EVIDENCE-REFUSED-001", **closed_no_evidence_kwargs)
    except InvariantViolation as error:
        if "RAID_CLOSED_WITHOUT_EVIDENCE" not in str(error):
            raise
        closure_refusal_proof["raised"] = True
        closure_refusal_proof["error_code"] = "RAID_CLOSED_WITHOUT_EVIDENCE"
    if not closure_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RAID_INVARIANT_NOT_ENFORCED: a CLOSED item with no evidence was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ClosureWithoutEvidenceRefused", {"refusal_proof": closure_refusal_proof}, 1.3)
    milestones.append("CLOSURE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT closure_evidence gate catches the same defect
    # class even when a caller bypasses the builder entirely (evidence blanked on an already-CLOSED item). ---
    tampered = copy.deepcopy(log)
    tampered["items"][1]["evidence"] = ""  # I1 was CLOSED with real evidence -- blank it out post-construction
    tampered_gate = evaluate_closure_evidence_gate(tampered, "run_raid_log_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("RAID_GATE_NOT_INDEPENDENT: the independent closure_evidence gate did NOT catch a hand-tampered CLOSED item with blanked evidence")
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
        "raid_log": log,
        "gate_results": gate_results,
        "closure_refusal_proof": closure_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "raid_log_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_raid_log_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.raid_log: RaidLogRecord {result['raid_log']['id']} built "
        f"(3 items -- OPEN/CLOSED/MONITORING), gates [{gate_summary}]; "
        f"RAID_CLOSED_WITHOUT_EVIDENCE REFUSED a close-with-no-evidence attempt ({result['closure_refusal_proof']['error_code']}); "
        f"hand-tampered blanked-evidence-after-close caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
