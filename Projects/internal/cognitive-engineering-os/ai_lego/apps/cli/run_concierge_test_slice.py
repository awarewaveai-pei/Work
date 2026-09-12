"""``experiment.concierge_test`` vertical slice -- F15 experiment & validation family (Atlas L742).

Builds a well-formed concierge test record over a synthetic hand-delivered
meal-planning service (zero automation declared, two measured signals), then
proves Atlas's own "manual service->measure use/pay" pipeline is a real
invariant, not mere narrative order: a construction-time attempt to submit a
record that declares an automation component in scope is refused, and a
hand-tampered valid record (its measurements[] emptied, bypassing the
builder) is independently caught by the measurement_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_concierge_test_slice
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
from ai_lego.modules.experiment.concierge_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_concierge_test_gates,
    evaluate_measurement_integrity_gate,
    generate_concierge_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CONCIERGE-SYNTHETIC-001"
EXECUTION_ID = "EX-CONCIERGE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CONCIERGE-001"

S = {
    "concierge_test": "ai-lego://specs/cognitive/typed-objects/concierge-test-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-concierge-test-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "service_description": "Weekly personalized meal plan, hand-assembled and emailed by a human nutritionist",
        "manual_delivery": {
            "delivered_by": "founder acting as the nutritionist",
            "automation_components": [],
        },
        "measurements": [
            {"metric_type": "USAGE_COUNT", "value": 34, "unit": "plans requested", "sample_size": 40, "measured_at": "2026-09-11T00:00:00Z"},
            {"metric_type": "WILLINGNESS_TO_PAY_AMOUNT", "value": 19.99, "unit": "USD/month median stated price", "sample_size": 40, "measured_at": "2026-09-11T00:00:00Z"},
        ],
        "provenance": make_provenance("EVIDENCE", "HUMAN_ORIGINAL"),
    }


def run_concierge_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed, fully-manual record with 2 measured signals. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_concierge_test_record,
        "CONCIERGE-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["concierge_test"], record, "concierge test record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConciergeTestRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_concierge_test_gates(record, "run_concierge_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"concierge test gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CONCIERGE_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConciergeTestGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L742's own "人工" (manual) half is not toothless -- a record declaring even one
    # automation component in scope MUST be refused before any record is constructed. ---
    automated_kwargs = copy.deepcopy(_well_formed_kwargs())
    automated_kwargs["manual_delivery"]["automation_components"] = ["auto-email-scheduler"]
    not_manual_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_concierge_test_record("CONCIERGE-NOT-MANUAL-REFUSED-001", **automated_kwargs)
    except InvariantViolation as error:
        if "CONCIERGE_NOT_MANUAL" not in str(error):
            raise
        not_manual_refusal_proof["raised"] = True
        not_manual_refusal_proof["error_code"] = "CONCIERGE_NOT_MANUAL"
    if not not_manual_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CONCIERGE_INVARIANT_NOT_ENFORCED: a record declaring an automation component was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NotManualRefused", {"refusal_proof": not_manual_refusal_proof}, 1.3)
    milestones.append("NOT_MANUAL_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT measurement_integrity gate catches an emptied
    # measurements[] even though the builder never re-runs on this record. ---
    tampered = copy.deepcopy(record)
    tampered["measurements"] = []
    tampered_gate = evaluate_measurement_integrity_gate(tampered, "run_concierge_test_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CONCIERGE_GATE_NOT_INDEPENDENT: the independent measurement_integrity gate did NOT catch a hand-tampered emptied measurements[]")
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
        "concierge_test_record": record,
        "gate_results": gate_results,
        "not_manual_refusal_proof": not_manual_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "concierge_test_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_concierge_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.concierge_test: ConciergeTestRecord {result['concierge_test_record']['id']} built "
        f"(zero automation, 2 measured signals), gates [{gate_summary}]; "
        f"CONCIERGE_NOT_MANUAL REFUSED a declared-automation attempt ({result['not_manual_refusal_proof']['error_code']}); "
        f"hand-tampered emptied measurements caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
