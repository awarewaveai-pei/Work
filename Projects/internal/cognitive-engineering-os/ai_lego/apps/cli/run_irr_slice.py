"""``feasibility.irr`` vertical slice -- F14 feasibility family (Atlas L730).

Builds a real ``IrrAnalysis`` for a 2-cash-flow investment with a
hand-verifiable closed-form IRR (-1000 at period 0, +1200 at period 1 ->
IRR = 0.2 exactly), asserts the solver's output matches that closed form
within tolerance, then proves the real invariant is not toothless: a
construction-time attempt with all-same-sign cash flows is refused, and a
hand-tampered valid record (stored ``irr`` spliced to a wrong value,
bypassing the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_irr_slice
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
from ai_lego.modules.feasibility.irr import (
    METHOD_ID,
    all_gates_pass,
    evaluate_irr_content_integrity_gate,
    evaluate_irr_gates,
    generate_irr_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-IRR-SYNTHETIC-001"
EXECUTION_ID = "EX-IRR-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-IRR-001"

S = {
    "irr_analysis": "ai-lego://specs/cognitive/typed-objects/irr-analysis.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

_CLOSED_FORM_CASH_FLOWS = [{"period": 0, "amount": -1000}, {"period": 1, "amount": 1200}]
_CLOSED_FORM_IRR = 0.2  # 1200/1000 - 1, hand-derived from NPV(r) = -1000 + 1200/(1+r) = 0


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-irr-slice"


def run_irr_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: a real 2-cash-flow investment with a hand-verifiable closed-form IRR. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_irr_analysis,
        "IRR-2026-09-12-001",
        "設備採購案 A：一年期短期投資",
        _CLOSED_FORM_CASH_FLOWS,
        0.1,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["irr_analysis"], record, "irr analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IrrAnalysisGenerated", {"irr_analysis": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    closed_form_check = {"expected": _CLOSED_FORM_IRR, "solved": record["irr"], "difference": abs(record["irr"] - _CLOSED_FORM_IRR)}
    if closed_form_check["difference"] > 1e-6:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"IRR_SOLVER_MISMATCH: bisection solved irr={record['irr']!r}, hand-computed closed form is {_CLOSED_FORM_IRR!r} -- difference {closed_form_check['difference']!r} exceeds tolerance")
    milestones.append("CLOSED_FORM_VERIFIED")

    gate_results = evaluate_irr_gates(record, "run_irr_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"irr gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"IRR_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IrrGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove the same-sign refusal is real -- an all-negative cash_flows series MUST be refused
    # before any solve is attempted. ---
    same_sign_cash_flows = [{"period": 0, "amount": -1000}, {"period": 1, "amount": -500}]
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_irr_analysis("IRR-SAME-SIGN-REFUSED-001", "X", same_sign_cash_flows, 0.1, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("IRR_INVARIANT_NOT_ENFORCED: an all-same-sign cash_flows series was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SameSignCashFlowsRefused", {"refusal_proof": refusal_proof}, 1.3)
    milestones.append("SAME_SIGN_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a spliced-in wrong irr even when a
    # caller bypasses the builder entirely. ---
    tampered = copy.deepcopy(record)
    tampered["irr"] = 0.999  # far outside the real solved value for this record's own cash_flows
    tampered_gate = evaluate_irr_content_integrity_gate(tampered, "run_irr_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("IRR_GATE_NOT_INDEPENDENT: the independent irr_content_integrity gate did NOT catch a hand-tampered wrong irr")
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
        "irr_analysis": record,
        "closed_form_check": closed_form_check,
        "gate_results": gate_results,
        "same_sign_refusal_proof": refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_horizon_scanning_slice.py)",
    }
    write_json(runtime / "results" / "irr_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_irr_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    cf = result["closed_form_check"]
    print(
        f"PASS feasibility.irr: IrrAnalysis {result['irr_analysis']['id']} solved irr={cf['solved']!r} (closed-form expected {cf['expected']!r}, diff={cf['difference']!r}), gates [{gate_summary}]; "
        f"IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS REFUSED an all-negative cash_flows series ({result['same_sign_refusal_proof']['error_code']}); "
        f"hand-tampered irr caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
