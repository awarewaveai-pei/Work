"""``jurisdiction.market_admission_control`` vertical slice -- F23 jurisdiction family (Atlas L942, §11.54).

Builds a well-formed, fully-PASSing 7-stage admission with a human sign-off
(ENABLE), then proves Atlas §11.54's own "任一 critical unknown：FAIL
CLOSED" rule is a real invariant, not mere narrative order: a
construction-time attempt to directly ASSERT ``admission_decision`` past a
FAIL/UNKNOWN stage is structurally impossible (the builder has no such
parameter -- proven by calling it and observing the value is always
derived), and a hand-tampered valid record (one stage rewritten to UNKNOWN,
``admission_decision`` left at "ENABLE", bypassing the builder) is
independently caught by the admission_decision_consistency gate.

Run::

    python -m ai_lego.apps.cli.run_market_admission_control_slice
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
from ai_lego.modules.jurisdiction.market_admission_control import (
    METHOD_ID,
    STAGE_NAMES,
    all_gates_pass,
    evaluate_admission_decision_gate,
    evaluate_market_admission_gates,
    generate_market_admission,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MADM-SYNTHETIC-001"
EXECUTION_ID = "EX-MADM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-MADM-001"

S = {
    "market_admission": "ai-lego://specs/cognitive/typed-objects/market-admission-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-market-admission-control-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "market_id": "DE",
        "stages": [{"stage": name, "status": "PASS", "note": f"{name} verified"} for name in STAGE_NAMES],
        "human_signoff": "legal-reviewer-042",
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_market_admission_control_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed admission -- all 7 stages PASS, sign-off present -> ENABLE. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_market_admission,
        "MADM-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["market_admission"], record, "market admission record")
    if record["admission_decision"] != "ENABLE":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MADM_UNEXPECTED_DECISION: expected ENABLE for the deliberately all-PASS record, got {record['admission_decision']!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MarketAdmissionGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_market_admission_gates(record, "run_market_admission_control_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"market admission gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MADM_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MarketAdmissionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.54's own 'FAIL CLOSED' rule is not toothless -- one stage UNKNOWN, sign-off
    # present, MUST derive FAIL_CLOSED, never ENABLE, and the builder has no way to be told otherwise. ---
    unknown_stage_kwargs = copy.deepcopy(_well_formed_kwargs())
    unknown_stage_kwargs["stages"][2]["status"] = "UNKNOWN"  # data_residency
    unknown_stage_kwargs["stages"][2]["note"] = "Residency assessment not yet run"
    unknown_record = generate_market_admission("MADM-UNKNOWN-STAGE-002", **unknown_stage_kwargs)
    fail_closed_proof: dict[str, Any] = {"attempted": True, "derived_correctly": unknown_record["admission_decision"] == "FAIL_CLOSED"}
    if not fail_closed_proof["derived_correctly"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MADM_INVARIANT_NOT_ENFORCED: a record with an UNKNOWN stage derived {unknown_record['admission_decision']!r} instead of FAIL_CLOSED -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnknownStageForcesFailClosed", {"fail_closed_proof": fail_closed_proof}, 1.3)
    milestones.append("FAIL_CLOSED_DERIVATION_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT admission_decision_consistency gate catches the same
    # defect class even when a caller bypasses the builder entirely (one stage rewritten to UNKNOWN,
    # admission_decision left at "ENABLE" post-construction). ---
    tampered = copy.deepcopy(record)
    tampered["stages"][2]["status"] = "UNKNOWN"
    tampered_gate = evaluate_admission_decision_gate(tampered, "run_market_admission_control_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("MADM_GATE_NOT_INDEPENDENT: the independent admission_decision_consistency gate did NOT catch a hand-tampered ENABLE with an UNKNOWN stage")
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
        "market_admission": record,
        "gate_results": gate_results,
        "fail_closed_proof": fail_closed_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "market_admission_control_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_market_admission_control_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.market_admission_control: MarketAdmissionRecord {result['market_admission']['id']} built "
        f"(7/7 stages PASS + sign-off -> {result['market_admission']['admission_decision']}), gates [{gate_summary}]; "
        f"an UNKNOWN stage mechanically derived FAIL_CLOSED (never ENABLE); "
        f"hand-tampered ENABLE-with-UNKNOWN-stage caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
