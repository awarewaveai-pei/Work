"""``experiment.pilot`` vertical slice -- F15 experiment & validation family (Atlas L747, §12.31).

Builds a well-formed Pilot record over a synthetic checkout-flow rollout,
then proves Atlas §12.31's own 強制 (MANDATORY) rule is a real invariant, not
mere narrative order: a construction-time attempt to submit a Pilot with a
MISSING criteria set (rollback_criteria omitted) is refused, and a hand-
tampered valid record (rollback_criteria emptied out after construction,
bypassing the builder) is independently caught by the criteria_mandate gate.

Run::

    python -m ai_lego.apps.cli.run_pilot_slice
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
from ai_lego.modules.experiment.pilot import (
    METHOD_ID,
    all_gates_pass,
    evaluate_criteria_mandate_gate,
    evaluate_pilot_gates,
    generate_pilot,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PILOT-SYNTHETIC-001"
EXECUTION_ID = "EX-PILOT-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-PILOT-001"

S = {
    "pilot_record": "ai-lego://specs/cognitive/typed-objects/pilot-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pilot-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "scope": {
            "description": "New checkout flow, one region, opt-in cohort only",
            "boundaries": ["region=TW", "cohort=opt-in-beta", "duration<=30 days"],
        },
        "success_criteria": ["conversion rate >= baseline + 2pp"],
        "stop_criteria": ["error rate > 1% for 2 consecutive hours"],
        "rollback_criteria": ["feature flag off within 15 minutes of a STOP trigger"],
        "monitoring_metrics": ["conversion_rate", "error_rate", "checkout_latency_p95"],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_pilot_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed Pilot -- all 3 mandated criteria sets declared. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_pilot,
        "PILOT-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["pilot_record"], record, "pilot record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PilotGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pilot_gates(record, "run_pilot_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"pilot gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PILOT_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PilotGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §12.31's own 強制 (MANDATORY) rule is not toothless -- a Pilot with a
    # MISSING criteria set (rollback_criteria omitted entirely) MUST be refused before any record
    # is constructed. ---
    missing_criteria_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_criteria_kwargs["rollback_criteria"] = []
    missing_mandate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_pilot("PILOT-MISSING-CRITERIA-REFUSED-001", **missing_criteria_kwargs)
    except InvariantViolation as error:
        if "PILOT_CRITERIA_MANDATE_VIOLATION" not in str(error):
            raise
        missing_mandate_refusal_proof["raised"] = True
        missing_mandate_refusal_proof["error_code"] = "PILOT_CRITERIA_MANDATE_VIOLATION"
    if not missing_mandate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PILOT_INVARIANT_NOT_ENFORCED: a Pilot missing rollback_criteria was NOT refused -- Atlas §12.31's 強制 rule is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CriteriaMandateRefused", {"refusal_proof": missing_mandate_refusal_proof}, 1.3)
    milestones.append("CRITERIA_MANDATE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT criteria_mandate gate catches the same
    # defect class even when a caller bypasses the builder entirely (stop_criteria emptied out
    # after construction). ---
    tampered = copy.deepcopy(record)
    tampered["stop_criteria"] = []
    tampered_gate = evaluate_criteria_mandate_gate(tampered, "run_pilot_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("PILOT_GATE_NOT_INDEPENDENT: the independent criteria_mandate gate did NOT catch a hand-tampered emptied-out stop_criteria")
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
        "pilot_record": record,
        "gate_results": gate_results,
        "missing_mandate_refusal_proof": missing_mandate_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "pilot_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_pilot_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.pilot: PilotRecord {result['pilot_record']['id']} built "
        f"(success/stop/rollback criteria all declared), gates [{gate_summary}]; "
        f"PILOT_CRITERIA_MANDATE_VIOLATION REFUSED a missing-rollback-criteria attempt "
        f"({result['missing_mandate_refusal_proof']['error_code']}); "
        f"hand-tampered emptied-out stop_criteria caught via the INDEPENDENT gate "
        f"({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
