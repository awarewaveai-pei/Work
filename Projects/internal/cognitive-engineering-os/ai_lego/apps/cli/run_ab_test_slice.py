"""``experiment.ab_test`` vertical slice -- F15 experiment & validation family (Atlas L746, §12.30).

Builds a well-formed, pre-registered A/B test over a synthetic checkout-flow scenario, then proves
Atlas §12.30's own explicit "avoid peeking" warning is a real invariant, not mere narrative advice: a
construction-time attempt to register the hypothesis/metric/sample size AFTER the analysis already
happened (peeking) is refused, and a hand-tampered valid record (a guardrail metric silently rewritten
to collide with the already-declared primary_metric, bypassing the builder) is independently caught by
the primary_metric_isolation gate.

Run::

    python -m ai_lego.apps.cli.run_ab_test_slice
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
from ai_lego.modules.experiment.ab_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ab_test_gates,
    evaluate_primary_metric_isolation_gate,
    generate_ab_test_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ABTEST-SYNTHETIC-001"
EXECUTION_ID = "EX-ABTEST-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ABTEST-001"

S = {
    "ab_test_experiment": "ai-lego://specs/cognitive/typed-objects/ab-test-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ab-test-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "hypothesis": "新結帳流程（單頁式）能提升轉換率",
        "primary_metric": "checkout_conversion_rate",
        "guardrail_metrics": ["cart_abandonment_rate", "avg_page_load_ms"],
        "sample_size_per_arm": 5000,
        "randomization_unit": "user_id",
        "registered_at": "2026-08-01T00:00:00Z",
        "analyzed_at": "2026-08-22T00:00:00Z",
        "decision": "SHIP",
        "provenance": make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"),
    }


def run_ab_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the pre-registered, isolated-primary-metric record. ---
    descriptor, experiment = catalog.invoke(
        METHOD_ID,
        generate_ab_test_experiment,
        "ABTEST-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["ab_test_experiment"], experiment, "ab test experiment")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ABTestExperimentGenerated", {"experiment": experiment, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ab_test_gates(experiment, "run_ab_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ab test experiment gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ABTEST_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ABTestExperimentGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §12.30's own "avoid peeking" warning is not toothless -- registering
    # the hypothesis/metric/sample size AFTER the analysis already happened MUST be refused before
    # any record is constructed. ---
    peeking_kwargs = copy.deepcopy(_well_formed_kwargs())
    peeking_kwargs["registered_at"] = "2026-08-23T00:00:00Z"  # AFTER analyzed_at (2026-08-22)
    peeking_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_ab_test_experiment("ABTEST-PEEKING-REFUSED-001", **peeking_kwargs)
    except InvariantViolation as error:
        if "ABTEST_NOT_PREREGISTERED" not in str(error):
            raise
        peeking_refusal_proof["raised"] = True
        peeking_refusal_proof["error_code"] = "ABTEST_NOT_PREREGISTERED"
    if not peeking_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ABTEST_INVARIANT_NOT_ENFORCED: a post-analysis (peeking) registration was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PeekingRefused", {"refusal_proof": peeking_refusal_proof}, 1.3)
    milestones.append("PEEKING_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT primary_metric_isolation gate catches a
    # guardrail metric silently rewritten to collide with the already-declared primary_metric,
    # bypassing the builder entirely. ---
    tampered = copy.deepcopy(experiment)
    tampered["guardrail_metrics"][0] = "  Checkout_Conversion_Rate  "  # NFKC/case/whitespace-collides with primary_metric
    tampered_gate = evaluate_primary_metric_isolation_gate(tampered, "run_ab_test_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ABTEST_GATE_NOT_INDEPENDENT: the independent primary_metric_isolation gate did NOT catch a hand-tampered guardrail metric colliding with the primary metric")
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
        "ab_test_experiment": experiment,
        "gate_results": gate_results,
        "peeking_refusal_proof": peeking_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "ab_test_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_ab_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.ab_test: ABTestExperiment {result['ab_test_experiment']['id']} built "
        f"(primary_metric={result['ab_test_experiment']['primary_metric']!r} -> {result['ab_test_experiment']['decision']}), "
        f"gates [{gate_summary}]; ABTEST_NOT_PREREGISTERED REFUSED a peeking attempt ({result['peeking_refusal_proof']['error_code']}); "
        f"hand-tampered guardrail/primary-metric collision caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
