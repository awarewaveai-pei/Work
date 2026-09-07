"""``learning.ooda`` vertical slice -- 6th Method Atlas slice from the `learning` family (F17), after
`learning.reversal_criteria`/`learning.kill_criteria`/`learning.decision_journal`/`learning.pdca`/
`learning.after_action_review`.

Real OODACycleRecord grounded in this repo's own 2026-04-20 incident
(runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md): wordpress-ubuntu-4gb-sin-1 (5.223.93.113)
CPU 99.7%/swap 91.5%, root cause an XMRig miner planted through an exposed PostgreSQL port. Stage
timestamps are same-day but illustrative -- the runbook records the date, not intraday clock times.

Then proves all FOUR invariants are real, at BOTH layers (construction raises before a malformed record
is ever built; the independent gate re-derives from raw fields on a hand-tampered copy):
1. OODA_INVALID_STAGES (stage shape), 2. OODA_STAGE_ORDER_VIOLATED, 3. OODA_NONMONOTONIC_TIMESTAMPS,
4. OODA_ORIENT_NOT_GROUNDED. Finally exercises ``compute_cycle_tempo_seconds`` -- the one piece of
genuine compute, operationalizing Atlas L3011's own "decision tempo" phrase.

Run::

    python -m ai_lego.apps.cli.run_ooda_slice
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
from ai_lego.modules.learning.ooda import (
    METHOD_ID,
    act_stage,
    all_gates_pass,
    compute_cycle_tempo_seconds,
    decide_stage,
    evaluate_ooda_gates,
    evaluate_ooda_integrity_gate,
    generate_ooda_cycle_record,
    observation,
    observe_stage,
    orient_stage,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OODA-SYNTHETIC-001"
EXECUTION_ID = "EX-OODA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-OODA-001"

S = {
    "ooda_cycle_record": "ai-lego://specs/cognitive/typed-objects/ooda-cycle-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ooda-slice"


def run_ooda_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real scenario: runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md (2026-04-20).
    # Stage timestamps same-day but illustrative (the runbook gives the date, not intraday clock times). ---
    observe_prov = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")
    orient_prov = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
    decision_prov = make_provenance("DECISION", "HUMAN_APPROVED")

    obs_1 = observation("OBS-1", "CPU 99.7%, swap 91.5% sustained on wordpress-ubuntu-4gb-sin-1", observe_prov)
    obs_2 = observation("OBS-2", "ps aux | grep xmrig shows a running xmrig-6.24.0 process", observe_prov)
    obs_3 = observation("OBS-3", "supavisor binds PostgreSQL port 5432 to 0.0.0.0, not 127.0.0.1; default Supabase password never changed", observe_prov)

    observe = observe_stage(
        "CPU 99.7%/swap 91.5% sustained; ps aux shows a running xmrig-6.24.0 process; supavisor exposes PostgreSQL port 5432 on 0.0.0.0.",
        "2026-04-20T09:00:00Z",
        observe_prov,
        [obs_1, obs_2, obs_3],
    )
    orient = orient_stage(
        "This is not a resource-exhaustion bug -- it is an active intrusion through the exposed database port.",
        "2026-04-20T09:02:00Z",
        orient_prov,
        ["OBS-2", "OBS-3"],
        "xmrig running (OBS-2) plus PostgreSQL exposed with an unchanged default password (OBS-3) means the attack path is "
        "COPY/pg_cron command execution through the open port, not a runaway legitimate process -- fixing CPU alone would "
        "not close the entry point.",
    )
    decide = decide_stage(
        "Kill the miner immediately, then close the actual entry point (port binding + password rotation), not just the CPU symptom.",
        "2026-04-20T09:05:00Z",
        decision_prov,
    )
    act = act_stage(
        "kill -9 the xmrig PID; rm -rf the xmrig binary directory; rebind PostgreSQL to 127.0.0.1 in docker-compose.yml; "
        "rotate all Supabase internal passwords; ufw deny 5432/5433.",
        "2026-04-20T09:20:00Z",
        decision_prov,
    )

    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_ooda_cycle_record,
        "OODA-2026-04-20-001",
        "wordpress-ubuntu-4gb-sin-1 (5.223.93.113): CPU 99.7%, swap 91.5%, root cause unknown",
        [observe, orient, decide, act],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["ooda_cycle_record"], record, "xmrig-incident ooda cycle record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OodaRecordGenerated", {"ooda_cycle_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ooda_gates(record, "run_ooda_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"ooda gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"OODA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OodaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal single-observation reference record. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_ooda_cycle_record,
        "OODA-2026-09-07-002",
        "A single upstream API call started timing out intermittently mid-incident.",
        [
            observe_stage(
                "3 consecutive timeouts on the payment-webhook endpoint.",
                "2026-09-07T00:00:00Z",
                make_provenance("AI_INFERENCE", "AI_GENERATED"),
                [observation("OBS-1", "3 consecutive timeouts on payment-webhook", make_provenance("AI_INFERENCE", "AI_GENERATED"))],
            ),
            orient_stage(
                "Likely the upstream provider, not our own service -- other endpoints are unaffected.",
                "2026-09-07T00:01:00Z",
                make_provenance("AI_INFERENCE", "AI_GENERATED"),
                ["OBS-1"],
                "Isolated to one upstream dependency, not a general outage -- narrows the fix to a fallback/retry policy for that one integration.",
            ),
            decide_stage("Switch to the cached fallback for this endpoint for the next 10 minutes.", "2026-09-07T00:02:00Z", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            act_stage("Fallback flag enabled; alert posted to on-call channel.", "2026-09-07T00:03:00Z", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        ],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["ooda_cycle_record"], reference_record, "minimal ooda cycle record")

    # --- Prove all FOUR invariants are real at the CONSTRUCTION layer: each hand-crafted variant must be
    # refused with its own distinct error code. ---
    def _expect_blocked(label: str, code: str, build) -> bool:
        try:
            build()
        except InvariantViolation as error:
            return code in str(error)
        raise InvariantViolation(f"OODA_INVARIANT_GUARD_DID_NOT_FIRE: {label} was accepted (expected {code})")

    shape_blocked = _expect_blocked(
        "3-stage record (missing ACT)",
        "OODA_INVALID_STAGES",
        lambda: generate_ooda_cycle_record("OODA-BAD-001", "s", [observe, orient, decide], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")),
    )
    order_blocked = _expect_blocked(
        "ORIENT/DECIDE swapped",
        "OODA_STAGE_ORDER_VIOLATED",
        lambda: generate_ooda_cycle_record("OODA-BAD-002", "s", [observe, decide, orient, act], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")),
    )
    bad_act = act_stage("acted before observing", "2026-04-20T08:00:00Z", decision_prov)  # before observe's own 09:00
    monotonicity_blocked = _expect_blocked(
        "ACT timestamped before OBSERVE",
        "OODA_NONMONOTONIC_TIMESTAMPS",
        lambda: generate_ooda_cycle_record("OODA-BAD-003", "s", [observe, orient, decide, bad_act], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")),
    )
    bad_orient = orient_stage("ungrounded orient", "2026-04-20T09:02:00Z", orient_prov, ["OBS-GHOST"], "cites nothing real")
    grounding_blocked = _expect_blocked(
        "observation_refs pointing at a nonexistent id",
        "OODA_ORIENT_NOT_GROUNDED",
        lambda: generate_ooda_cycle_record("OODA-BAD-004", "s", [observe, bad_orient, decide, act], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")),
    )

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take copies of
    # the real, valid record and hand-tamper each invariant separately, scoped so each isolates cleanly. ---
    tampered_shape = copy.deepcopy(record)
    del tampered_shape["stages"][1]["mental_model_update"]  # ORIENT now missing a required key -> shape invalid
    shape_gate = evaluate_ooda_integrity_gate(tampered_shape, "run_ooda_slice", clock.at(1.3))
    shape_gate_blocked = shape_gate["status"] == "FAIL" and "stages invalid" in shape_gate["evidence"][0]["reason"]

    tampered_order = copy.deepcopy(record)
    tampered_order["stages"] = [tampered_order["stages"][0], tampered_order["stages"][2], tampered_order["stages"][1], tampered_order["stages"][3]]  # swap positions 1/2
    order_gate = evaluate_ooda_integrity_gate(tampered_order, "run_ooda_slice", clock.at(1.4))
    order_gate_blocked = order_gate["status"] == "FAIL" and order_gate["evidence"][0]["reason"] == "stage order violated"

    tampered_monotonicity = copy.deepcopy(record)
    tampered_monotonicity["stages"][3]["timestamp"] = "2026-04-20T08:00:00Z"  # ACT before OBSERVE's own 09:00
    monotonicity_gate = evaluate_ooda_integrity_gate(tampered_monotonicity, "run_ooda_slice", clock.at(1.5))
    monotonicity_gate_blocked = monotonicity_gate["status"] == "FAIL" and monotonicity_gate["evidence"][0]["reason"] == "timestamps not monotonic"

    tampered_grounding = copy.deepcopy(record)
    tampered_grounding["stages"][1]["observation_refs"] = ["OBS-GHOST"]
    grounding_gate = evaluate_ooda_integrity_gate(tampered_grounding, "run_ooda_slice", clock.at(1.6))
    grounding_gate_blocked = grounding_gate["status"] == "FAIL" and grounding_gate["evidence"][0]["reason"] == "orient not grounded"

    invariant_verification = {
        "stage_shape": {"construction_blocked": shape_blocked, "gate_blocked": shape_gate_blocked},
        "stage_order": {"construction_blocked": order_blocked, "gate_blocked": order_gate_blocked},
        "timestamp_monotonicity": {"construction_blocked": monotonicity_blocked, "gate_blocked": monotonicity_gate_blocked},
        "orient_grounding": {"construction_blocked": grounding_blocked, "gate_blocked": grounding_gate_blocked},
    }
    if not all(v["construction_blocked"] and v["gate_blocked"] for v in invariant_verification.values()):
        raise InvariantViolation(f"OODA_GATE_GUARD_DID_NOT_FIRE: {invariant_verification}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OodaInvariantVerified", invariant_verification, 1.7)
    milestones.append("VERIFYING")

    # --- Real compute: elapsed decision tempo over the SAME xmrig-incident record, operationalizing
    # Atlas L3011's own "decision tempo" phrase. ---
    tempo_seconds = compute_cycle_tempo_seconds(record)
    reference_tempo_seconds = compute_cycle_tempo_seconds(reference_record)
    if tempo_seconds != 1200.0:  # 09:00 -> 09:20, hand-computed
        raise InvariantViolation(f"OODA_TEMPO_COMPUTE_UNEXPECTED: expected 1200.0 seconds, got {tempo_seconds}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OodaTempoComputed", {"xmrig_incident_tempo_seconds": tempo_seconds, "reference_tempo_seconds": reference_tempo_seconds}, 1.8)
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "xmrig_incident_ooda_record": record,
        "reference_ooda_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": invariant_verification,
        "xmrig_incident_tempo_seconds": tempo_seconds,
        "reference_tempo_seconds": reference_tempo_seconds,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_pdca_slice.py)",
    }
    write_json(runtime / "results" / "ooda_slice_result.json", result)
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
        result = run_ooda_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    inv_summary = ", ".join(f"{name}(construction={d['construction_blocked']},gate={d['gate_blocked']})" for name, d in v.items())
    print(
        f"PASS learning.ooda: gates [{gate_summary}], invariants [{inv_summary}], "
        f"xmrig-incident decision tempo={result['xmrig_incident_tempo_seconds']:.0f}s, reference tempo={result['reference_tempo_seconds']:.0f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
