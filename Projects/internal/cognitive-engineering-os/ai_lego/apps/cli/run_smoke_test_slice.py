"""``experiment.smoke_test`` vertical slice -- F15 experiment & validation family (Atlas L745).

Builds a well-formed, pre-registered smoke test over a synthetic preorder-page scenario, then proves
Atlas L745's own "threshold" pipeline stage is a real invariant, not mere narrative order: a
construction-time attempt to declare the threshold AFTER measurement already happened (post-hoc
rationalization) is refused, and a hand-tampered valid record (decision flipped to "GO" against a
measured_signups count that did not clear the threshold, bypassing the builder) is independently
caught by the decision_consistency gate.

Run::

    python -m ai_lego.apps.cli.run_smoke_test_slice
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
from ai_lego.modules.experiment.smoke_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_decision_consistency_gate,
    evaluate_smoke_test_gates,
    generate_smoke_test_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SMOKETEST-SYNTHETIC-001"
EXECUTION_ID = "EX-SMOKETEST-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SMOKETEST-001"

S = {
    "smoke_test_experiment": "ai-lego://specs/cognitive/typed-objects/smoke-test-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-smoke-test-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "offer_description": "「AI 週報自動生成」預售頁，Facebook 廣告導流",
        "signup_or_preorder_threshold": 100,
        "threshold_declared_at": "2026-09-01T00:00:00Z",
        "measured_signups": 143,
        "measured_at": "2026-09-08T00:00:00Z",
        "decision": "GO",
        "provenance": make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"),
    }


def run_smoke_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the pre-registered, decision-consistent record. ---
    descriptor, experiment = catalog.invoke(
        METHOD_ID,
        generate_smoke_test_experiment,
        "SMOKETEST-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["smoke_test_experiment"], experiment, "smoke test experiment")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmokeTestExperimentGenerated", {"experiment": experiment, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_smoke_test_gates(experiment, "run_smoke_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"smoke test experiment gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SMOKETEST_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmokeTestExperimentGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L745's own "threshold" pipeline stage is not toothless -- a threshold
    # declared AFTER measurement already happened (post-hoc rationalization) MUST be refused before
    # any record is constructed. ---
    post_hoc_kwargs = copy.deepcopy(_well_formed_kwargs())
    post_hoc_kwargs["threshold_declared_at"] = "2026-09-09T00:00:00Z"  # AFTER measured_at (2026-09-08)
    not_preregistered_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_smoke_test_experiment("SMOKETEST-POSTHOC-REFUSED-001", **post_hoc_kwargs)
    except InvariantViolation as error:
        if "SMOKETEST_THRESHOLD_NOT_PREREGISTERED" not in str(error):
            raise
        not_preregistered_refusal_proof["raised"] = True
        not_preregistered_refusal_proof["error_code"] = "SMOKETEST_THRESHOLD_NOT_PREREGISTERED"
    if not not_preregistered_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SMOKETEST_INVARIANT_NOT_ENFORCED: a post-hoc-declared threshold was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NotPreregisteredRefused", {"refusal_proof": not_preregistered_refusal_proof}, 1.3)
    milestones.append("NOT_PREREGISTERED_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT decision_consistency gate catches a decision
    # flipped to GO against measured_signups that did not clear the threshold, bypassing the builder. ---
    tampered = copy.deepcopy(experiment)
    tampered["measured_signups"] = tampered["signup_or_preorder_threshold"] - 1  # below threshold
    # decision field left as "GO" -- now inconsistent with the (lowered) measured_signups.
    tampered_gate = evaluate_decision_consistency_gate(tampered, "run_smoke_test_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("SMOKETEST_GATE_NOT_INDEPENDENT: the independent decision_consistency gate did NOT catch a hand-tampered GO decision against a below-threshold measured_signups")
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
        "smoke_test_experiment": experiment,
        "gate_results": gate_results,
        "not_preregistered_refusal_proof": not_preregistered_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "smoke_test_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_smoke_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.smoke_test: SmokeTestExperiment {result['smoke_test_experiment']['id']} built "
        f"({result['smoke_test_experiment']['measured_signups']}/{result['smoke_test_experiment']['signup_or_preorder_threshold']} -> "
        f"{result['smoke_test_experiment']['decision']}), gates [{gate_summary}]; "
        f"SMOKETEST_THRESHOLD_NOT_PREREGISTERED REFUSED a post-hoc-declared threshold ({result['not_preregistered_refusal_proof']['error_code']}); "
        f"hand-tampered inconsistent decision caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
