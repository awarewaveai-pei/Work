"""``delivery.raci`` vertical slice -- F22 PM/delivery/governance family (Atlas L927).

Builds a 2-deliverable matrix (one AVAILABLE Accountable with a null escalation_path, one UNAVAILABLE
Accountable with a declared fallback), then proves this method's own genuinely new invariant beyond
``stakeholders.raci`` (F07) is real, not mere narrative order: a construction-time attempt to leave an
UNAVAILABLE Accountable's escalation_path null is refused, and a hand-tampered valid record (escalation_path
erased AFTER construction, bypassing the builder) is independently caught by the deliverable_governance gate.

Run::

    python -m ai_lego.apps.cli.run_delivery_raci_slice
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
from ai_lego.modules.delivery.raci import (
    METHOD_ID,
    all_gates_pass,
    evaluate_deliverable_governance_gate,
    evaluate_delivery_raci_gates,
    generate_delivery_raci_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DRACI-SYNTHETIC-001"
EXECUTION_ID = "EX-DRACI-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DRACI-001"

S = {
    "delivery_raci_matrix": "ai-lego://specs/cognitive/typed-objects/delivery-raci-matrix.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-delivery-raci-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "deliverables": [
            {
                "deliverable_name": "V2 API 規格文件",
                "due_date": "2026-10-15",
                "assignments": [
                    {"stakeholder_name": "技術寫手", "role": "R", "status": "AVAILABLE"},
                    {"stakeholder_name": "架構師", "role": "A", "status": "AVAILABLE"},
                    {"stakeholder_name": "產品經理", "role": "C", "status": "AVAILABLE"},
                    {"stakeholder_name": "QA 團隊", "role": "I", "status": "AVAILABLE"},
                ],
                "escalation_path": None,
            },
            {
                "deliverable_name": "上線前資安審查報告",
                "due_date": "2026-11-01",
                "assignments": [
                    {"stakeholder_name": "資安工程師", "role": "R", "status": "AVAILABLE"},
                    {"stakeholder_name": "資安主管", "role": "A", "status": "UNAVAILABLE"},
                    {"stakeholder_name": "法務", "role": "C", "status": "AVAILABLE"},
                ],
                "escalation_path": "副資安主管",
            },
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_delivery_raci_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed matrix -- 2 deliverables, one with an AVAILABLE Accountable, one with an
    # UNAVAILABLE Accountable that HAS a declared escalation_path. ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_delivery_raci_matrix,
        "DRACI-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["delivery_raci_matrix"], matrix, "delivery raci matrix")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DeliveryRaciMatrixGenerated", {"matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_delivery_raci_gates(matrix, "run_delivery_raci_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"delivery raci matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DRACI_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DeliveryRaciMatrixGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove L927's own "防責任空洞" pipeline stage is not toothless -- an UNAVAILABLE Accountable
    # with NO declared escalation_path MUST be refused before any record is constructed. ---
    missing_escalation_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_escalation_kwargs["deliverables"][1]["escalation_path"] = None
    escalation_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_delivery_raci_matrix("DRACI-MISSING-ESCALATION-REFUSED-001", **missing_escalation_kwargs)
    except InvariantViolation as error:
        if "DRACI_MISSING_ESCALATION_PATH" not in str(error):
            raise
        escalation_refusal_proof["raised"] = True
        escalation_refusal_proof["error_code"] = "DRACI_MISSING_ESCALATION_PATH"
    if not escalation_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DRACI_INVARIANT_NOT_ENFORCED: an UNAVAILABLE Accountable with no escalation_path was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingEscalationPathRefused", {"refusal_proof": escalation_refusal_proof}, 1.3)
    milestones.append("MISSING_ESCALATION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT deliverable_governance gate catches the same defect
    # class even when a caller bypasses the builder entirely (escalation_path erased on an already-built valid
    # record whose Accountable is UNAVAILABLE). ---
    tampered = copy.deepcopy(matrix)
    tampered["deliverables"][1]["escalation_path"] = None
    tampered_gate = evaluate_deliverable_governance_gate(tampered, "run_delivery_raci_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DRACI_GATE_NOT_INDEPENDENT: the independent deliverable_governance gate did NOT catch a hand-tampered erased escalation_path on an UNAVAILABLE Accountable")
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
        "delivery_raci_matrix": matrix,
        "gate_results": gate_results,
        "escalation_refusal_proof": escalation_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "delivery_raci_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_delivery_raci_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.raci: DeliveryRaciMatrix {result['delivery_raci_matrix']['id']} built "
        f"(2 deliverables, 1 UNAVAILABLE Accountable with a declared escalation_path), gates [{gate_summary}]; "
        f"DRACI_MISSING_ESCALATION_PATH REFUSED an unescalated-unavailable-Accountable attempt ({result['escalation_refusal_proof']['error_code']}); "
        f"hand-tampered erased escalation_path caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
