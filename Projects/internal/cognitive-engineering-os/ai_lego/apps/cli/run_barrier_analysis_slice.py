"""``root_cause.barrier_analysis`` vertical slice -- F05 root_cause family, seventh concrete entry
alongside fishbone/five_whys/pareto/fault_tree/bow_tie/kepner_tregoe.

Synthetic scenario, invented-but-realistic (no real deployed instance exists in this repository to model
this on, disclosed honestly rather than overclaiming one): grounded in this repo's own real deploy
pipeline (agency-os/AGENTS.md:9 -- sg-deploy.sh, npm test -> healthcheck -> HTTP smoke -> auto-rollback).
Hazard: an unreviewed/unauthorized code change reaching the production deploy path. Target: the production
environment (ks-aw-01 lobster-phase1 services). Two barriers stand between them: the deploy-approval gate
(a second-reviewer sign-off) and the npm test gate inside sg-deploy.sh. ONE failure mode is recorded -- the
deploy-approval gate's own bypass path (a direct SSH deploy route that skipped the second-reviewer check
entirely) -- described SYSTEMICALLY (a process/tooling gap), never naming an individual, honoring Atlas's
own "避免責怪個人" (avoid blaming individuals) misuse warning. The second barrier is left un-diagnosed on
purpose: nothing in this record requires every barrier to have a failure_mode, only that every DECLARED
failure_mode reference a real barrier.

Proves both real invariants at BOTH layers:

1. NO-BLAME structural -- barriers[]/failure_modes[] entries accept ONLY their own closed key set; an
   entry carrying an extra key (simulating an attempted individual-attribution field) is refused at
   construction with the same generic shape code a malformed/typo'd key would trigger, then independently
   caught by the gate on a hand-tampered copy that bypassed the builder entirely.
2. CHAIN CONNECTIVITY -- an empty target_description, and a failure_mode whose own barrier_ref names no
   real barrier in this SAME record, are each refused at construction, then independently caught by the
   gate on a hand-tampered copy.

Run::

    python -m ai_lego.apps.cli.run_barrier_analysis_slice
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
from ai_lego.modules.root_cause.barrier_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_barrier_analysis_gates,
    evaluate_barrier_analysis_integrity_gate,
    generate_barrier_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BARRIER-ANALYSIS-SYNTHETIC-001"
EXECUTION_ID = "EX-BARRIER-ANALYSIS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BARRIER-ANALYSIS-001"

S = {
    "barrier_analysis_record": "ai-lego://specs/cognitive/typed-objects/barrier-analysis-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _barrier(barrier_id: str, description: str) -> dict[str, Any]:
    return {"barrier_id": barrier_id, "description": description}


def _failure_mode(failure_mode_id: str, barrier_ref: str, description: str) -> dict[str, Any]:
    return {"failure_mode_id": failure_mode_id, "barrier_ref": barrier_ref, "description": description}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-barrier-analysis-slice"


def run_barrier_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the REAL barrier analysis record -- one hazard, one target, two barriers standing
    # between them, and ONE failure mode diagnosing which barrier actually failed (systemically, never
    # naming an individual). The second barrier is deliberately left un-diagnosed: nothing in this record
    # requires every barrier to have a failure_mode. ---
    hazard_description = "An unreviewed code change is pushed toward the production deploy path"
    target_description = "Production environment (ks-aw-01 lobster-phase1 services)"
    barriers = [
        _barrier("B-001", "Deploy-approval gate requiring a second reviewer's sign-off before sg-deploy.sh runs against prod"),
        _barrier("B-002", "npm test gate inside sg-deploy.sh, must pass before healthcheck/smoke proceed"),
    ]
    failure_modes = [
        _failure_mode("FM-001", "B-001", "Gate configuration allowed a direct SSH deploy path that bypassed the second-reviewer check entirely -- a process/tooling gap, not a specific reviewer's individual failure"),
    ]
    descriptor, barrier_analysis_record = catalog.invoke(
        METHOD_ID,
        generate_barrier_analysis_record,
        "BARRIER-2026-09-07-001",
        "sg-deploy.sh production deploy pipeline, unauthorized deploy incident",
        hazard_description,
        target_description,
        barriers,
        failure_modes,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["barrier_analysis_record"], barrier_analysis_record, "barrier analysis record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BarrierAnalysisRecordGenerated", {"barrier_analysis_record": barrier_analysis_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_barrier_analysis_gates(barrier_analysis_record, "run_barrier_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"barrier_analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BARRIER_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BarrierAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the NO-BLAME invariant is real, at the CONSTRUCTION layer: an entry carrying an extra key
    # (simulating an attempted individual-attribution field) must be refused. ---
    blame_shaped_failure_modes = [dict(failure_modes[0], responsible_person="a named engineer")]
    blame_field_guard_fired = False
    try:
        generate_barrier_analysis_record("BARRIER-2026-09-07-002", "s", hazard_description, target_description, barriers, blame_shaped_failure_modes, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        blame_field_guard_fired = "BARRIER_INVALID_FAILURE_MODES" in str(error)
    if not blame_field_guard_fired:
        raise InvariantViolation("BARRIER_BLAME_FIELD_GUARD_DID_NOT_FIRE: a failure_mode entry carrying an individual-attribution field was accepted (or a different guard fired instead)")

    blame_shaped_barriers = [dict(barriers[0], owner_name="a named engineer")]
    blame_barrier_guard_fired = False
    try:
        generate_barrier_analysis_record("BARRIER-2026-09-07-003", "s", hazard_description, target_description, blame_shaped_barriers, failure_modes, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        blame_barrier_guard_fired = "BARRIER_INVALID_BARRIERS" in str(error)
    if not blame_barrier_guard_fired:
        raise InvariantViolation("BARRIER_BLAME_BARRIER_GUARD_DID_NOT_FIRE: a barrier entry carrying an individual-attribution field was accepted (or a different guard fired instead)")

    # --- Prove the CHAIN CONNECTIVITY invariant is real, at the CONSTRUCTION layer: an empty target, and
    # a failure_mode referencing a nonexistent barrier, must each be refused. ---
    empty_target_guard_fired = False
    try:
        generate_barrier_analysis_record("BARRIER-2026-09-07-004", "s", hazard_description, "   ", barriers, failure_modes, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        empty_target_guard_fired = "BARRIER_INVALID_TARGET" in str(error)
    if not empty_target_guard_fired:
        raise InvariantViolation("BARRIER_EMPTY_TARGET_GUARD_DID_NOT_FIRE: an empty target_description was accepted (or a different guard fired instead)")

    dangling_failure_modes = [_failure_mode("FM-999", "B-999", "d")]
    dangling_reference_guard_fired = False
    try:
        generate_barrier_analysis_record("BARRIER-2026-09-07-005", "s", hazard_description, target_description, barriers, dangling_failure_modes, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        dangling_reference_guard_fired = "BARRIER_DANGLING_FAILURE_REFERENCE" in str(error)
    if not dangling_reference_guard_fired:
        raise InvariantViolation("BARRIER_DANGLING_REFERENCE_GUARD_DID_NOT_FIRE: a failure_mode referencing a nonexistent barrier was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: hand-tamper a
    # COPY of the real, valid record directly (bypassing the builder entirely) and confirm the gate --
    # which shares the SAME predicate functions the builder uses, not a second drifting implementation --
    # still catches both invariant classes. ---
    tampered_blame = copy.deepcopy(barrier_analysis_record)
    tampered_blame["failure_modes"][0]["responsible_person"] = "a named engineer"
    gate_blame_result = evaluate_barrier_analysis_integrity_gate(tampered_blame, "run_barrier_analysis_slice", clock.at(1.3))
    gate_blame_blocked = gate_blame_result["status"] == "FAIL" and "BARRIER_INVALID_FAILURE_MODES" in gate_blame_result["evidence"][0]["reason"]
    if not gate_blame_blocked:
        raise InvariantViolation(f"BARRIER_GATE_BLAME_GUARD_DID_NOT_FIRE: hand-tampered blame field was not caught by the gate (status={gate_blame_result['status']}, evidence={gate_blame_result['evidence']})")

    tampered_reference = copy.deepcopy(barrier_analysis_record)
    tampered_reference["failure_modes"][0]["barrier_ref"] = "B-DOES-NOT-EXIST"
    gate_reference_result = evaluate_barrier_analysis_integrity_gate(tampered_reference, "run_barrier_analysis_slice", clock.at(1.4))
    gate_reference_blocked = gate_reference_result["status"] == "FAIL" and "BARRIER_DANGLING_FAILURE_REFERENCE" in gate_reference_result["evidence"][0]["reason"]
    if not gate_reference_blocked:
        raise InvariantViolation(f"BARRIER_GATE_REFERENCE_GUARD_DID_NOT_FIRE: hand-tampered dangling reference was not caught by the gate (status={gate_reference_result['status']}, evidence={gate_reference_result['evidence']})")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "BarrierAnalysisInvariantVerified",
        {
            "blame_field_guard_fired": blame_field_guard_fired,
            "blame_barrier_guard_fired": blame_barrier_guard_fired,
            "empty_target_guard_fired": empty_target_guard_fired,
            "dangling_reference_guard_fired": dangling_reference_guard_fired,
            "gate_blame_blocked": gate_blame_blocked,
            "gate_reference_blocked": gate_reference_blocked,
        },
        1.5,
    )
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
        "barrier_analysis_record": barrier_analysis_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "blame_field_guard_fired": blame_field_guard_fired,
            "blame_barrier_guard_fired": blame_barrier_guard_fired,
            "empty_target_guard_fired": empty_target_guard_fired,
            "dangling_reference_guard_fired": dangling_reference_guard_fired,
            "gate_blame_blocked": gate_blame_blocked,
            "gate_reference_blocked": gate_reference_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "barrier_analysis_slice_result.json", result)
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
        result = run_barrier_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["barrier_analysis_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS root_cause.barrier_analysis: {len(record['barriers'])} barriers, {len(record['failure_modes'])} failure_modes, "
        f"gates [{gate_summary}], "
        f"invariant_verified(blame_field={v['blame_field_guard_fired']}, blame_barrier={v['blame_barrier_guard_fired']}, "
        f"empty_target={v['empty_target_guard_fired']}, dangling_reference={v['dangling_reference_guard_fired']}, "
        f"gate_blame={v['gate_blame_blocked']}, gate_reference={v['gate_reference_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
