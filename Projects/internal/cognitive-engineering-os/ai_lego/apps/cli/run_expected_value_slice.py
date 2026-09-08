"""``decision.expected_value`` vertical slice -- Method Atlas slice, 7th member of the ``decision`` family
(F16), after ``decision.ahp``, ``decision.mcda``, ``decision.impact_effort``, ``decision.ice``,
``decision.rice``, ``decision.moscow``.

Builds a real expected-value calculation for a risky product launch decision:
30% chance of a $50,000 gain, 70% chance of a $10,000 loss -- computed by
``ai_lego/compute/expected_value/calculation.py::compute_expected_value``
(hand-verified: 0.3*50000 + 0.7*(-10000) = 15000 - 7000 = 8000.0). Then
demonstrates BOTH of this method's own real invariants are actually
enforced, not merely documented:

1. Invariant #1 (states mutually exclusive and exhaustive) is real at BOTH
   layers: a construction attempt with probabilities that do not sum to 1.0
   is refused by ``generate_expected_value_record`` itself, AND a
   hand-crafted record that bypasses construction (built as a raw dict,
   never passed through the constructor) is independently caught by
   ``evaluate_states_mutually_exclusive_exhaustive_gate``.
2. Invariant #2 (``genuine_compute``) is real, not a rubber stamp: a copy of
   the valid record has its ``expected_value`` hand-tampered to an inflated
   value (never re-derived from the real states) and the gate is confirmed
   to FAIL -- proving the gate actually re-invokes ``compute_expected_value``
   against the record's own raw ``states`` rather than trusting whatever
   ``expected_value`` happens to be stored.

Run::

    python -m ai_lego.apps.cli.run_expected_value_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.expected_value import (
    METHOD_ID,
    all_gates_pass,
    evaluate_expected_value_gates,
    evaluate_expected_value_genuine_compute_gate,
    evaluate_states_mutually_exclusive_exhaustive_gate,
    generate_expected_value_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EXPECTEDVALUE-SYNTHETIC-001"
EXECUTION_ID = "EX-EXPECTEDVALUE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EXPECTEDVALUE-001"

S = {
    "expected_value_record": "ai-lego://specs/cognitive/typed-objects/expected-value-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-expected-value-slice"


def run_expected_value_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real decision: launch a new product line. 30% chance of a $50,000 gain, 70% chance of a
    # $10,000 loss -- mutually exclusive and exhaustive (0.3 + 0.7 = 1.0). ---
    decision_subject = "投資新產品線 Q1 launch"
    states = [
        {"id": "STATE-SUCCESS", "label": "產品成功", "probability": 0.3, "outcome_value": 50000},
        {"id": "STATE-FAILURE", "label": "產品失敗", "probability": 0.7, "outcome_value": -10000},
    ]
    descriptor, ev_record = catalog.invoke(
        METHOD_ID,
        generate_expected_value_record,
        "EXPECTEDVALUE-2026-09-08-001",
        decision_subject,
        states,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["expected_value_record"], ev_record, "expected value record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ExpectedValueRecordGenerated", {"expected_value_record": ev_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_expected_value_gates(ev_record, "run_expected_value_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"expected value gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EXPECTEDVALUE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ExpectedValueGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove invariant #1 (mutually exclusive and exhaustive) is real at BOTH layers. ---
    # Layer A: construction itself refuses probabilities that do not sum to 1.0.
    non_exhaustive_states = [
        {"id": "STATE-SUCCESS", "label": "產品成功", "probability": 0.3, "outcome_value": 50000},
        {"id": "STATE-FAILURE", "label": "產品失敗", "probability": 0.5, "outcome_value": -10000},  # 0.3 + 0.5 = 0.8, not 1.0
    ]
    construction_layer_blocked = False
    try:
        generate_expected_value_record("EXPECTEDVALUE-BAD-001", decision_subject, non_exhaustive_states, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
    except InvariantViolation:
        construction_layer_blocked = True
    # Layer B: a hand-crafted record that BYPASSES the constructor (built as a raw dict) is still caught
    # by the gate, independently re-deriving the sum from the record's own raw states.
    hand_crafted_bypass = copy.deepcopy(ev_record)
    hand_crafted_bypass["states"] = non_exhaustive_states
    gate_layer_blocked = evaluate_states_mutually_exclusive_exhaustive_gate(hand_crafted_bypass, "run_expected_value_slice", clock.at(1.3))["status"] == "FAIL"
    if not (construction_layer_blocked and gate_layer_blocked):
        raise InvariantViolation(
            f"EXPECTEDVALUE_EXHAUSTIVENESS_GUARD_DID_NOT_FIRE: construction_layer_blocked={construction_layer_blocked}, gate_layer_blocked={gate_layer_blocked} -- "
            "both layers must independently refuse a non-exhaustive state set"
        )
    ledger.append(
        NORDBROOK.tenant_id, AGGREGATE_ID, "ExpectedValueExhaustivenessVerified", {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked}, 1.4
    )
    milestones.append("VERIFYING")

    # --- Prove the genuine_compute gate actually re-derives, never trusts, the stored expected_value: a
    # copy of the record has its expected_value hand-inflated (never recomputed from states) -- the gate
    # must catch this, schema-valid shape notwithstanding. ---
    tampered_score = copy.deepcopy(ev_record)
    tampered_score["expected_value"] = ev_record["expected_value"] + 999999  # a caller inflating the baseline by fiat
    tampered_gate = evaluate_expected_value_genuine_compute_gate(tampered_score, "run_expected_value_slice", clock.at(1.5))
    if tampered_gate["status"] != "FAIL":
        raise InvariantViolation(f"EXPECTEDVALUE_GENUINE_COMPUTE_GUARD_DID_NOT_FIRE: tampered expected_value was not caught by evaluate_expected_value_genuine_compute_gate (status={tampered_gate['status']})")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ExpectedValueGenuineComputeGuardVerified", {"tampered_gate_status": tampered_gate["status"]}, 1.6)
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "expected_value_record": ev_record,
        "gate_results": gate_results,
        "exhaustiveness_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "genuine_compute_guard_verification": {"tampered_gate_status": tampered_gate["status"]},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rice_slice.py)",
    }
    write_json(runtime / "results" / "expected_value_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_expected_value_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["expected_value_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["exhaustiveness_verification"]
    g = result["genuine_compute_guard_verification"]
    print(
        f"PASS decision.expected_value: expected_value={record['expected_value']}, gates [{gate_summary}], "
        f"exhaustiveness_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']}), "
        f"genuine_compute_guard_verified(tampered_gate={g['tampered_gate_status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
