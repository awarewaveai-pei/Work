"""``epistemic.confidence_calibration`` vertical slice -- F10 epistemic family, quantitative pair member 2/2
built this batch.

Builds a real, well-formed ``ConfidenceCalibration`` from a hand-computed worked example (3 predictions,
stated_confidence 0.9/0.6/0.5, actual_outcome true/false/true -> brier_score=0.20666667), then demonstrates THE
real invariant (brier_score cannot be smuggled in as a caller-supplied argument) is not toothless, demonstrates
too-few-predictions and a non-bool actual_outcome are both refused, and finally hand-tampers a VALID record's own
``brier_score`` directly (bypassing the builder) to prove the independent gate, not just the builder, catches the
defect.

Run::

    python -m ai_lego.apps.cli.run_confidence_calibration_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.epistemic.confidence_calibration import (
    METHOD_ID,
    all_gates_pass,
    evaluate_confidence_calibration_gates,
    generate_confidence_calibration,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CONFIDENCECALIBRATION-SYNTHETIC-001"
EXECUTION_ID = "EX-CONFIDENCECALIBRATION-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CONFIDENCECALIBRATION-001"

S = {
    "confidence_calibration": "ai-lego://specs/cognitive/typed-objects/confidence-calibration.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-confidence-calibration-slice"


def _predictions() -> list[dict[str, Any]]:
    return [
        {"id": "P1", "stated_confidence": 0.9, "actual_outcome": True},
        {"id": "P2", "stated_confidence": 0.6, "actual_outcome": False},
        {"id": "P3", "stated_confidence": 0.5, "actual_outcome": True},
    ]


def _well_formed_calibration_kwargs() -> dict[str, Any]:
    return {
        "predictions": _predictions(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_confidence_calibration_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed calibration record -- every real invariant satisfied, invoked
    # through the catalog's own per-invocation gate. Hand-computed: squared errors (0.9-1)^2=0.01, (0.6-0)^2=0.36,
    # (0.5-1)^2=0.25 -> mean = 0.62/3 = 0.20666667 (rounded to 8dp). ---
    descriptor, calibration = catalog.invoke(
        METHOD_ID,
        generate_confidence_calibration,
        "CALIB-2026-09-12-001",
        **_well_formed_calibration_kwargs(),
    )
    contracts.validate(S["confidence_calibration"], calibration, "confidence calibration")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConfidenceCalibrationGenerated", {"calibration": calibration, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    if calibration["brier_score"] != 0.20666667:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CALIB_HAND_COMPUTED_MISMATCH: expected 0.20666667, got {calibration['brier_score']!r}")

    gate_results = evaluate_confidence_calibration_gates(calibration, "run_confidence_calibration_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"epistemic.confidence_calibration gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CALIB_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof brier_score cannot be smuggled in as a caller-supplied argument -- the builder has no
    # such parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_confidence_calibration("CALIB-SMUGGLE-REFUSED-001", **_well_formed_calibration_kwargs(), brier_score=0.0)  # type: ignore[call-arg]
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CALIB_INVARIANT_NOT_ENFORCED: a smuggled brier_score= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmuggledBrierScoreRefused", {"refusal_proof": smuggle_proof}, 1.2)
    milestones.append("SMUGGLED_BRIER_SCORE_REFUSAL_PROVEN")

    # --- Step 3: proof too-few-predictions (Atlas's own plural pipeline) is not toothless. ---
    too_few_kwargs = {**_well_formed_calibration_kwargs(), "predictions": [_predictions()[0]]}
    too_few_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_confidence_calibration("CALIB-TOOFEW-REFUSED-001", **too_few_kwargs)
    except InvariantViolation as error:
        if "CALIB_TOO_FEW_PREDICTIONS" not in str(error):
            raise
        too_few_proof["raised"] = True
        too_few_proof["error_code"] = "CALIB_TOO_FEW_PREDICTIONS"
    if not too_few_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CALIB_INVARIANT_NOT_ENFORCED: a single-prediction calibration was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TooFewPredictionsRefused", {"refusal_proof": too_few_proof}, 1.3)
    milestones.append("TOO_FEW_PREDICTIONS_REFUSAL_PROVEN")

    # --- Step 4: proof a non-bool actual_outcome (an int 0/1 disguised as a boolean) is not toothless. ---
    non_bool_predictions = [{**_predictions()[0], "actual_outcome": 1}, _predictions()[1]]
    non_bool_kwargs = {**_well_formed_calibration_kwargs(), "predictions": non_bool_predictions}
    non_bool_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_confidence_calibration("CALIB-NONBOOL-REFUSED-001", **non_bool_kwargs)
    except InvariantViolation as error:
        if "CALIB_INVALID_PREDICTION" not in str(error):
            raise
        non_bool_proof["raised"] = True
        non_bool_proof["error_code"] = "CALIB_INVALID_PREDICTION"
    if not non_bool_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CALIB_INVARIANT_NOT_ENFORCED: an int actual_outcome was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NonBoolOutcomeRefused", {"refusal_proof": non_bool_proof}, 1.4)
    milestones.append("NON_BOOL_OUTCOME_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID record's own brier_score directly). ---
    tampered = dict(calibration)
    tampered["predictions"] = [dict(prediction) for prediction in calibration["predictions"]]
    tampered["brier_score"] = 0.0  # was 0.20666667 -- bypasses the builder directly
    tampered_gate = evaluate_confidence_calibration_gates(tampered, "run_confidence_calibration_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("CALIB_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered brier_score")
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
        "calibration": calibration,
        "gate_results": gate_results,
        "smuggle_proof": smuggle_proof,
        "too_few_proof": too_few_proof,
        "non_bool_proof": non_bool_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fmea_slice.py)",
    }
    write_json(runtime / "results" / "confidence_calibration_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_confidence_calibration_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.confidence_calibration: ConfidenceCalibration {result['calibration']['id']} "
        f"brier_score={result['calibration']['brier_score']} (hand-computed 0.62/3~=0.20666667), gates [{gate_summary}]; "
        f"smuggled-brier_score/too-few-predictions/non-bool-outcome invariants each REFUSED a malformed attempt; "
        f"hand-tampered brier_score caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
