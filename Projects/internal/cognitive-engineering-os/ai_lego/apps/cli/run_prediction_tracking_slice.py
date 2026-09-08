"""``learning.prediction_tracking`` vertical slice -- F17 learning family, 9th and LAST concrete entry after
reversal_criteria/kill_criteria/decision_journal/pdca/ooda/build_measure_learn/after_action_review/
post_mortem. CLOSES F17 9/9.

Builds a real ``PredictionTrackingRecord`` for BOTH prediction shapes this method supports, grounded in this
repo's own real architecture (same "grounded theme, disclosed invented specifics" convention every prior CLI
slice in this package uses):

* PROBABILITY -- "will the file-backed queue decision (decision_journal's own worked example, DJ-2026-09-07-001)
  still be operating without needing the managed service by year end", predicted at 65% confidence, resolved
  true. Brier score computed for real.
* POINT_ESTIMATE -- "how many wall-clock hours will this F17 batch take", predicted at 3.0, resolved at 3.4.
  Absolute/relative error computed for real.

Run::

    python -m ai_lego.apps.cli.run_prediction_tracking_slice
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
from ai_lego.modules.learning.prediction_tracking import (
    METHOD_ID,
    all_gates_pass,
    evaluate_prediction_tracking_gates,
    generate_prediction_tracking_record,
    record_actual,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PREDICTIONTRACKING-SYNTHETIC-001"
EXECUTION_ID = "EX-PREDICTIONTRACKING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PREDICTIONTRACKING-001"

S = {
    "prediction_tracking_record": "ai-lego://specs/cognitive/typed-objects/prediction-tracking-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-prediction-tracking-slice"


def run_prediction_tracking_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- PROBABILITY prediction: real-theme, disclosed-invented-specifics (see module docstring). ---
    descriptor_p, prediction_p = catalog.invoke(
        METHOD_ID,
        generate_prediction_tracking_record,
        "PREDICT-2026-09-08-001",
        "Cognitive OS Phase 5 runtime will handle real manifest-execution retry load without needing a managed queue service.",
        "PROBABILITY",
        "2026-12-31 (end of Q4 2026)",
        make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
        predicted_probability=0.65,
    )
    contracts.validate(S["prediction_tracking_record"], prediction_p, "prediction tracking record (PROBABILITY, stage 1)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PredictionTrackingRecordGenerated", {"prediction_tracking_record": prediction_p, "method_descriptor": descriptor_p}, 1)

    record_p = record_actual(prediction_p, make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-12-30T00:00:00Z", observed_outcome=True)
    contracts.validate(S["prediction_tracking_record"], record_p, "prediction tracking record (PROBABILITY, stage 2)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PredictionTrackingActualRecorded", {"prediction_tracking_record": record_p}, 1.1)

    # --- POINT_ESTIMATE prediction: same real theme, second prediction shape. ---
    descriptor_e, prediction_e = catalog.invoke(
        METHOD_ID,
        generate_prediction_tracking_record,
        "PREDICT-2026-09-08-002",
        "The F17 learning family batch (9 methods) will take under 3 hours of wall-clock session time to complete.",
        "POINT_ESTIMATE",
        "when this build session ends",
        make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
        predicted_value=3.0,
    )
    contracts.validate(S["prediction_tracking_record"], prediction_e, "prediction tracking record (POINT_ESTIMATE, stage 1)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PredictionTrackingRecordGenerated", {"prediction_tracking_record": prediction_e, "method_descriptor": descriptor_e}, 1.2)

    record_e = record_actual(prediction_e, make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-09-08T12:00:00Z", observed_value=3.4)
    contracts.validate(S["prediction_tracking_record"], record_e, "prediction tracking record (POINT_ESTIMATE, stage 2)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PredictionTrackingActualRecorded", {"prediction_tracking_record": record_e}, 1.3)
    milestones.append("METHOD_EXECUTED")

    gate_results_p = evaluate_prediction_tracking_gates(record_p, "run_prediction_tracking_slice", clock.at(1.4))
    gate_results_e = evaluate_prediction_tracking_gates(record_e, "run_prediction_tracking_slice", clock.at(1.4))
    for gate in gate_results_p + gate_results_e:
        contracts.validate(S["gate_result"], gate, f"prediction tracking gate {gate['gate_id']}")
    if not all_gates_pass(gate_results_p) or not all_gates_pass(gate_results_e):
        milestones.append("BLOCKED")
        failed = [g["gate_id"] for g in gate_results_p + gate_results_e if g["status"] not in {"PASS", "NOT_APPLICABLE"}]
        raise InvariantViolation(f"PREDICTIONTRACKING_GATE_FAILED: {failed}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PredictionTrackingGatesEvaluated", {"probability_gates": gate_results_p, "point_estimate_gates": gate_results_e}, 1.5)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocations": [descriptor_p, descriptor_e],
        "probability_record": record_p,
        "point_estimate_record": record_e,
        "gate_results": {"probability": gate_results_p, "point_estimate": gate_results_e},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_post_mortem_slice.py)",
    }
    write_json(runtime / "results" / "prediction_tracking_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_prediction_tracking_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary_p = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"]["probability"])
    gate_summary_e = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"]["point_estimate"])
    p_error = result["probability_record"]["error"]
    e_error = result["point_estimate_record"]["error"]
    print(
        f"PASS learning.prediction_tracking: PROBABILITY brier_score={p_error['value']} [{gate_summary_p}]; "
        f"POINT_ESTIMATE absolute_error={e_error['value']} relative_error={e_error['relative_value']} [{gate_summary_e}]"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
