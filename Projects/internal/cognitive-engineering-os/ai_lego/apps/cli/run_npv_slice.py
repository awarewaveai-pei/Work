"""``feasibility.npv`` vertical slice -- F14 feasibility family, second of two members built this batch.

Builds a real, well-formed ``NetPresentValueAnalysis`` from a hand-computed worked example
(cash_flows=[{period:0,amount:-1000},{period:1,amount:600},{period:2,amount:600}], discount_rate=0.1 ->
npv=-1000+600/1.1+600/1.21=41.32231405), independently re-verified here via ``fractions.Fraction`` rather than
trusting the implementation's own arithmetic, then demonstrates THE real invariant (discount_rate<=-1 is refused,
never crashes, never silently returns inf/nan) is not toothless, demonstrates the duplicate-period invariant is
not toothless, demonstrates ``npv`` cannot be smuggled in as a caller-supplied argument, and finally hand-tampers a
VALID record's own ``npv`` directly (bypassing the builder) to prove the independent gate, not just the builder,
catches the defect.

Run::

    python -m ai_lego.apps.cli.run_npv_slice
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from fractions import Fraction
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
from ai_lego.modules.feasibility.npv import (
    METHOD_ID,
    all_gates_pass,
    evaluate_npv_gates,
    generate_npv_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-NPV-SYNTHETIC-001"
EXECUTION_ID = "EX-NPV-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-NPV-001"

S = {
    "npv_analysis": "ai-lego://specs/cognitive/typed-objects/net-present-value-analysis.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

_CASH_FLOWS = [{"period": 0, "amount": -1000}, {"period": 1, "amount": 600}, {"period": 2, "amount": 600}]
_DISCOUNT_RATE = 0.1


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-npv-slice"


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "subject_ref": "設備汰換投資案 -- 兩年回收期評估",
        "cash_flows": [dict(cf) for cf in _CASH_FLOWS],
        "discount_rate": _DISCOUNT_RATE,
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def _hand_computed_npv_via_fraction() -> float:
    """Independent hand-computation via ``fractions.Fraction`` -- does not call ``compute_npv`` at all, so this
    genuinely cross-checks the implementation's own arithmetic rather than trusting it."""
    rate = Fraction(11, 10)  # 1 + 0.1
    total = Fraction(-1000, 1) + Fraction(600, 1) / rate + Fraction(600, 1) / (rate * rate)
    return round(float(total), 8)


def run_npv_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate. Independently hand-computed via fractions.Fraction (not the
    # implementation's own arithmetic): -1000 + 600/1.1 + 600/1.21 = 41.32231405 (rounded to 8dp). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_npv_analysis,
        "NPV-2026-09-12-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["npv_analysis"], analysis, "npv analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NpvAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    hand_computed = _hand_computed_npv_via_fraction()
    if analysis["npv"] != hand_computed:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"NPV_HAND_COMPUTED_MISMATCH: independently hand-computed {hand_computed!r}, got {analysis['npv']!r}")

    gate_results = evaluate_npv_gates(analysis, "run_npv_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"feasibility.npv gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("NPV_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (the discount_rate<=-1 trap) is not toothless. ---
    invalid_rate_kwargs = {**_well_formed_analysis_kwargs(), "discount_rate": -1.0}
    rate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_npv_analysis("NPV-BADRATE-REFUSED-001", **invalid_rate_kwargs)
    except InvariantViolation as error:
        if "NPV_INVALID_DISCOUNT_RATE" not in str(error):
            raise
        rate_refusal_proof["raised"] = True
        rate_refusal_proof["error_code"] = "NPV_INVALID_DISCOUNT_RATE"
    if not rate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("NPV_INVARIANT_NOT_ENFORCED: discount_rate=-1 was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "InvalidDiscountRateRefused", {"refusal_proof": rate_refusal_proof}, 1.2)
    milestones.append("DISCOUNT_RATE_REFUSAL_PROVEN")

    # --- Step 3: proof the duplicate-period invariant is not toothless. ---
    duplicate_period_kwargs = {**_well_formed_analysis_kwargs(), "cash_flows": [{"period": 0, "amount": -1000}, {"period": 0, "amount": 600}]}
    duplicate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_npv_analysis("NPV-DUPPERIOD-REFUSED-001", **duplicate_period_kwargs)
    except InvariantViolation as error:
        if "NPV_INVALID_CASH_FLOWS" not in str(error) or "duplicates" not in str(error):
            raise
        duplicate_refusal_proof["raised"] = True
        duplicate_refusal_proof["error_code"] = "NPV_INVALID_CASH_FLOWS"
    if not duplicate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("NPV_INVARIANT_NOT_ENFORCED: a duplicate period was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DuplicatePeriodRefused", {"refusal_proof": duplicate_refusal_proof}, 1.3)
    milestones.append("DUPLICATE_PERIOD_REFUSAL_PROVEN")

    # --- Step 4: proof npv cannot be smuggled in as a caller-supplied argument -- the builder has no such
    # parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_npv_analysis("NPV-SMUGGLE-REFUSED-001", **_well_formed_analysis_kwargs(), npv=999.0)  # type: ignore[call-arg]
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("NPV_INVARIANT_NOT_ENFORCED: a smuggled npv= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmuggledNpvRefused", {"refusal_proof": smuggle_proof}, 1.4)
    milestones.append("SMUGGLED_NPV_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID record's own npv directly, off by more than 1% of the true value). ---
    tampered = dict(analysis)
    tampered["npv"] = round(hand_computed * 1.5, 8)  # 50% off -- well beyond the 1e-9 tolerance
    tampered_gate = evaluate_npv_gates(tampered, "run_npv_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("NPV_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered npv")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "analysis": analysis,
        "hand_computed_npv": hand_computed,
        "gate_results": gate_results,
        "rate_refusal_proof": rate_refusal_proof,
        "duplicate_refusal_proof": duplicate_refusal_proof,
        "smuggle_proof": smuggle_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bayesian_updating_slice.py)",
    }
    write_json(runtime / "results" / "npv_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_npv_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.npv: NetPresentValueAnalysis {result['analysis']['id']} npv={result['analysis']['npv']} "
        f"(independently hand-computed via fractions.Fraction: {result['hand_computed_npv']}), gates [{gate_summary}]; "
        f"discount_rate<=-1/duplicate-period/smuggled-npv invariants each REFUSED a malformed attempt; hand-tampered npv "
        f"caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
