"""``epistemic.bayesian_updating`` vertical slice -- F10 epistemic family, quantitative pair member 1/2 built
this batch.

Builds a real, well-formed ``BayesianUpdate`` from a hand-computed worked example (prior=0.3,
likelihood_given_true=0.8, likelihood_given_false=0.2 -> posterior=0.63157895), then demonstrates THE real
invariant (the zero-denominator trap is refused, never crashes, never silently returns 0) is not toothless,
demonstrates ``posterior`` cannot be smuggled in as a caller-supplied argument, demonstrates an out-of-range
probability is refused, and finally hand-tampers a VALID record's own ``posterior`` directly (bypassing the
builder) to prove the independent gate, not just the builder, catches the defect.

Run::

    python -m ai_lego.apps.cli.run_bayesian_updating_slice
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
from ai_lego.modules.epistemic.bayesian_updating import (
    METHOD_ID,
    all_gates_pass,
    evaluate_bayesian_gates,
    generate_bayesian_update,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BAYESIANUPDATING-SYNTHETIC-001"
EXECUTION_ID = "EX-BAYESIANUPDATING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BAYESIANUPDATING-001"

S = {
    "bayesian_update": "ai-lego://specs/cognitive/typed-objects/bayesian-update.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-bayesian-updating-slice"


def _well_formed_update_kwargs() -> dict[str, Any]:
    return {
        "hypothesis": "生產環境延遲上升的根本原因是資料庫連線池耗盡",
        "prior": 0.3,
        "likelihood_given_true": 0.8,
        "likelihood_given_false": 0.2,
        "evidence_ref": "新觀測：連線池使用率在延遲升高的同一分鐘內衝到 98%",
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_bayesian_updating_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed update -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate. Hand-computed: (0.8*0.3)/(0.8*0.3+0.2*0.7) = 0.24/0.38 = 12/19 ~=
    # 0.63157895 (rounded to 8dp). ---
    descriptor, update = catalog.invoke(
        METHOD_ID,
        generate_bayesian_update,
        "BAYES-2026-09-12-001",
        **_well_formed_update_kwargs(),
    )
    contracts.validate(S["bayesian_update"], update, "bayesian update")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BayesianUpdateGenerated", {"update": update, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    if update["posterior"] != 0.63157895:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BAYES_HAND_COMPUTED_MISMATCH: expected 0.63157895, got {update['posterior']!r}")

    gate_results = evaluate_bayesian_gates(update, "run_bayesian_updating_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"epistemic.bayesian_updating gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BAYES_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (the zero-denominator trap) is not toothless. prior=0, likelihood_given_false=0
    # -> denominator = likelihood_given_true*0 + 0*(1-0) = 0, regardless of likelihood_given_true. ---
    zero_denominator_kwargs = {**_well_formed_update_kwargs(), "prior": 0.0, "likelihood_given_true": 0.9, "likelihood_given_false": 0.0}
    zero_denominator_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_bayesian_update("BAYES-ZERODENOM-REFUSED-001", **zero_denominator_kwargs)
    except InvariantViolation as error:
        if "BAYES_UNDEFINED_POSTERIOR" not in str(error):
            raise
        zero_denominator_proof["raised"] = True
        zero_denominator_proof["error_code"] = "BAYES_UNDEFINED_POSTERIOR"
    if not zero_denominator_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BAYES_INVARIANT_NOT_ENFORCED: a zero-denominator posterior was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZeroDenominatorRefused", {"refusal_proof": zero_denominator_proof}, 1.2)
    milestones.append("ZERO_DENOMINATOR_REFUSAL_PROVEN")

    # --- Step 3: proof posterior cannot be smuggled in as a caller-supplied argument -- the builder has no such
    # parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_bayesian_update("BAYES-SMUGGLE-REFUSED-001", **_well_formed_update_kwargs(), posterior=0.99)  # type: ignore[call-arg]
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BAYES_INVARIANT_NOT_ENFORCED: a smuggled posterior= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SmuggledPosteriorRefused", {"refusal_proof": smuggle_proof}, 1.3)
    milestones.append("SMUGGLED_POSTERIOR_REFUSAL_PROVEN")

    # --- Step 4: proof an out-of-range probability is not toothless. ---
    out_of_range_kwargs = {**_well_formed_update_kwargs(), "likelihood_given_true": 1.5}
    range_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_bayesian_update("BAYES-BADPROB-REFUSED-001", **out_of_range_kwargs)
    except InvariantViolation as error:
        if "BAYES_INVALID_PROBABILITY" not in str(error):
            raise
        range_refusal_proof["raised"] = True
        range_refusal_proof["error_code"] = "BAYES_INVALID_PROBABILITY"
    if not range_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BAYES_INVARIANT_NOT_ENFORCED: an out-of-range probability was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OutOfRangeProbabilityRefused", {"refusal_proof": range_refusal_proof}, 1.4)
    milestones.append("OUT_OF_RANGE_PROBABILITY_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID record's own posterior directly). ---
    tampered = dict(update)
    tampered["posterior"] = 0.99  # was 0.63157895 -- bypasses the builder directly
    tampered_gate = evaluate_bayesian_gates(tampered, "run_bayesian_updating_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BAYES_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered posterior")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "update": update,
        "gate_results": gate_results,
        "zero_denominator_proof": zero_denominator_proof,
        "smuggle_proof": smuggle_proof,
        "range_refusal_proof": range_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fmea_slice.py)",
    }
    write_json(runtime / "results" / "bayesian_updating_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_bayesian_updating_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.bayesian_updating: BayesianUpdate {result['update']['id']} posterior={result['update']['posterior']} "
        f"(hand-computed 12/19~=0.63157895), gates [{gate_summary}]; zero-denominator/smuggled-posterior/out-of-range-probability "
        f"invariants each REFUSED a malformed attempt; hand-tampered posterior caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
