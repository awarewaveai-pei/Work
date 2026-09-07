"""``root_cause.event_tree`` vertical slice -- F05 root_cause family, 7th concrete entry alongside
fishbone/five_whys/pareto/fault_tree/bow_tie/kepner_tregoe. Structural OPPOSITE of `fault_tree` (backward
AND/OR cause-decomposition) and distinct from `bow_tie`'s own flat unordered controls[] -- see
``ai_lego.modules.root_cause.event_tree``'s own module docstring for the full due-diligence comparison.

Builds an INVENTED-BUT-REALISTIC scenario, disclosed honestly as such: a Docker Desktop daemon crash on this
repo's own primary workstation, grounded in the REAL watchdog system this repo actually runs
(``agency-os/WORKLOG.md`` 2026-09-07 "Docker Desktop watchdog 根治" entry;
``scripts/register-docker-desktop-runtime-tasks.ps1``; ``scripts/check-smoke-tests.ps1:386-418``'s own
``docker_watchdog`` Check 6, added by that SAME fix specifically because the pre-fix system had no detection
barrier at all -- WORKLOG's own root-cause line: "死一次就死到下次登入...21:24 出事時無人在看", died once and
stayed dead, nobody watching). Three barriers in order: automated per-minute watchdog restart, the smoke
test's own detector surfacing a WARN if the watchdog itself is unhealthy, then manual operator intervention
once paged. Four outcomes trace every real branch, including the length-2 "smoke also blind" path that IS
the exact pre-2026-09-07 failure mode this repo's own fix closed. Probabilities are ILLUSTRATIVE (disclosed,
not measured) but internally consistent -- they partition to exactly 1.0 across the four outcomes, verified
below as a real arithmetic sanity check, not an enforced schema/gate invariant (exhaustive coverage is
explicitly NOT required in general -- see method contract OQ-EVENTTREE-2).

Then proves BOTH headline invariants are real, at BOTH layers:

1. Referential integrity (``EVENTTREE_DANGLING_BARRIER_REFERENCE``): a hand-crafted outcome path
   referencing a nonexistent barrier_id must be refused at CONSTRUCTION, and the same tamper applied to a
   copy of the valid record must be caught independently at the GATE layer.
2. Ordered-prefix reachability (``EVENTTREE_PATH_NOT_ORDERED_PREFIX``): a hand-crafted outcome path that
   reorders two REAL barrier ids must be refused at CONSTRUCTION, and the same tamper applied to a copy of
   the valid record must be caught independently at the GATE layer.

Finally demonstrates ``outcome_probability`` -- real, freshly-recomputed arithmetic over the SAME
probability fields the schema declares optional -- against the four real outcomes plus a qualitative-only
(no probability) minimal record, showing the "cannot compute" ``None`` path is a real, deliberate state, not
a silent zero.

Run::

    python -m ai_lego.apps.cli.run_event_tree_slice
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
from ai_lego.modules.root_cause.event_tree import (
    METHOD_ID,
    all_gates_pass,
    barrier,
    evaluate_event_tree_gates,
    evaluate_event_tree_integrity_gate,
    generate_event_tree_record,
    outcome,
    outcome_probability,
    path_step,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EVENT-TREE-SYNTHETIC-001"
EXECUTION_ID = "EX-EVENT-TREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EVENT-TREE-001"

S = {
    "event_tree_record": "ai-lego://specs/cognitive/typed-objects/event-tree-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-event-tree-slice"


def run_event_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Invented-but-realistic scenario (disclosed): a Docker Desktop daemon crash on this repo's own
    # primary workstation, grounded in the REAL watchdog system this repo runs (agency-os/WORKLOG.md
    # 2026-09-07 "Docker Desktop watchdog 根治" entry + scripts/check-smoke-tests.ps1:386-418's own
    # docker_watchdog Check 6). ---
    initiating_event = {"description": "Docker Desktop daemon crashes / socket goes stale (vpnkit-bridge backend termination leaves a stale engine.sock)"}
    barriers = [
        barrier("BAR-WATCHDOG", "Per-minute reconcile task (watch-docker-desktop-runtime.ps1) detects the dead daemon and attempts an automated restart"),
        barrier("BAR-SMOKE-DETECT", "Daily smoke test docker_watchdog Check 6 (check-smoke-tests.ps1) surfaces a WARN if the watchdog's own guard state is unhealthy"),
        barrier("BAR-MANUAL", "Operator, having been alerted by the smoke WARN, manually recovers the daemon"),
    ]
    outcomes = [
        outcome("OUT-AUTO-RECOVERED", "Watchdog restarts the daemon successfully; no human paged", [path_step("BAR-WATCHDOG", "success", probability=0.9)]),
        outcome(
            "OUT-DETECTED-MANUAL-RECOVERED",
            "Watchdog fails; smoke detects it; operator manually recovers",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "success", probability=0.95), path_step("BAR-MANUAL", "success", probability=0.9)],
        ),
        outcome(
            "OUT-DETECTED-UNRESOLVED",
            "Watchdog fails; smoke detects it; operator does not resolve it in time",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "success", probability=0.95), path_step("BAR-MANUAL", "failure", probability=0.1)],
        ),
        outcome(
            "OUT-UNDETECTED-UNRESOLVED",
            "Watchdog fails AND smoke itself is blind -- the real pre-2026-09-07 failure mode (died once, stayed dead until next login); nobody was ever paged, so manual intervention never applies",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "failure", probability=0.05)],
        ),
    ]
    descriptor, watchdog_record = catalog.invoke(
        METHOD_ID,
        generate_event_tree_record,
        "EVENTTREE-2026-09-07-001",
        "Docker Desktop daemon watchdog system, primary workstation (LAPTOP-R7I86OR5)",
        initiating_event,
        barriers,
        outcomes,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["event_tree_record"], watchdog_record, "Docker Desktop watchdog event tree record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EventTreeRecordGenerated", {"event_tree_record": watchdog_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_event_tree_gates(watchdog_record, "run_event_tree_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"event tree gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EVENTTREE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EventTreeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal single-barrier, single-outcome, QUALITATIVE-ONLY tree (no probability anywhere) -- proves
    # probability is genuinely optional, not silently required. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_event_tree_record,
        "EVENTTREE-2026-09-07-002",
        "internal reference lookup service",
        {"description": "Upstream dependency times out"},
        [barrier("BAR-RETRY", "Automatic retry with backoff")],
        [outcome("OUT-RECOVERED", "Retry succeeds", [path_step("BAR-RETRY", "success")])],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["event_tree_record"], reference_record, "minimal qualitative-only event tree record")

    # --- Prove invariant #1 (referential integrity) is real at the CONSTRUCTION layer: a hand-crafted
    # outcome path referencing a nonexistent barrier_id must be refused. ---
    dangling_blocked = False
    try:
        generate_event_tree_record(
            "EVENTTREE-2026-09-07-003",
            "some-system",
            {"description": "some initiating event"},
            barriers,
            [outcome("OUT-BAD", "d", [path_step("BAR-WATCHDOG", "failure"), path_step("BAR-DOES-NOT-EXIST", "failure")])],
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        dangling_blocked = "EVENTTREE_DANGLING_BARRIER_REFERENCE" in str(error)
    if not dangling_blocked:
        raise InvariantViolation("EVENTTREE_INVARIANT_GUARD_DID_NOT_FIRE: an outcome path referencing a nonexistent barrier_id was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (ordered-prefix reachability) is real at the CONSTRUCTION layer: a hand-crafted
    # outcome path that REORDERS two real barrier ids must be refused. ---
    phantom_blocked = False
    try:
        generate_event_tree_record(
            "EVENTTREE-2026-09-07-004",
            "some-system",
            {"description": "some initiating event"},
            barriers,
            [outcome("OUT-BAD", "d", [path_step("BAR-SMOKE-DETECT", "success"), path_step("BAR-WATCHDOG", "failure")])],  # reversed: BAR-SMOKE-DETECT before BAR-WATCHDOG
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        phantom_blocked = "EVENTTREE_PATH_NOT_ORDERED_PREFIX" in str(error)
    if not phantom_blocked:
        raise InvariantViolation("EVENTTREE_INVARIANT_GUARD_DID_NOT_FIRE: an outcome path with two real barrier ids reordered was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take COPIES of
    # the real, valid watchdog_record and hand-tamper each invariant separately (bypassing the builder
    # entirely -- direct dict mutation, not a cosmetic re-build). ---
    tampered_dangling = copy.deepcopy(watchdog_record)
    tampered_dangling["outcomes"][1]["path"][1]["barrier_id"] = "BAR-DOES-NOT-EXIST"
    dangling_gate_result = evaluate_event_tree_integrity_gate(tampered_dangling, "run_event_tree_slice", clock.at(1.3))
    dangling_gate_blocked = dangling_gate_result["status"] == "FAIL" and dangling_gate_result["evidence"][0]["reason"] == "dangling barrier reference"
    if not dangling_gate_blocked:
        raise InvariantViolation(f"EVENTTREE_GATE_GUARD_DID_NOT_FIRE: event_tree_integrity did not flag the hand-tampered dangling reference (status={dangling_gate_result['status']}, evidence={dangling_gate_result['evidence']})")

    tampered_phantom = copy.deepcopy(watchdog_record)
    tampered_phantom["outcomes"][1]["path"][0], tampered_phantom["outcomes"][1]["path"][1] = tampered_phantom["outcomes"][1]["path"][1], tampered_phantom["outcomes"][1]["path"][0]
    phantom_gate_result = evaluate_event_tree_integrity_gate(tampered_phantom, "run_event_tree_slice", clock.at(1.4))
    phantom_gate_blocked = phantom_gate_result["status"] == "FAIL" and phantom_gate_result["evidence"][0]["reason"] == "phantom outcome (path not an ordered prefix of barriers)"
    if not phantom_gate_blocked:
        raise InvariantViolation(f"EVENTTREE_GATE_GUARD_DID_NOT_FIRE: event_tree_integrity did not flag the hand-tampered reordered path (status={phantom_gate_result['status']}, evidence={phantom_gate_result['evidence']})")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "EventTreeInvariantVerified",
        {
            "dangling_reference_construction_blocked": dangling_blocked,
            "phantom_outcome_construction_blocked": phantom_blocked,
            "dangling_reference_gate_blocked": dangling_gate_blocked,
            "phantom_outcome_gate_blocked": phantom_gate_blocked,
        },
        1.5,
    )
    milestones.append("VERIFYING")

    # --- Real arithmetic compute: outcome_probability over the four real branches, freshly recomputed, not
    # a stored field. These four outcomes happen to be EXHAUSTIVE for this particular scenario (illustrative
    # probabilities chosen to partition cleanly) -- verified here as a real float sanity check, NOT an
    # enforced schema/gate invariant (exhaustive coverage is explicitly not required in general). ---
    probabilities = {o["outcome_id"]: outcome_probability(watchdog_record, o["outcome_id"]) for o in watchdog_record["outcomes"]}
    expected = {
        "OUT-AUTO-RECOVERED": 0.9,
        "OUT-DETECTED-MANUAL-RECOVERED": 0.1 * 0.95 * 0.9,
        "OUT-DETECTED-UNRESOLVED": 0.1 * 0.95 * 0.1,
        "OUT-UNDETECTED-UNRESOLVED": 0.1 * 0.05,
    }
    for outcome_id, expected_value in expected.items():
        if probabilities[outcome_id] is None or abs(probabilities[outcome_id] - expected_value) > 1e-9:
            raise InvariantViolation(f"EVENTTREE_PROBABILITY_COMPUTE_UNEXPECTED: outcome_id={outcome_id!r} got={probabilities[outcome_id]!r} expected={expected_value!r}")
    probability_sum = sum(probabilities.values())
    if abs(probability_sum - 1.0) > 1e-9:
        raise InvariantViolation(f"EVENTTREE_PROBABILITY_SUM_UNEXPECTED: four illustrative outcomes should partition to 1.0 for this scenario, got {probability_sum!r}")

    # Qualitative-only record: no path step anywhere carries a probability -- outcome_probability must
    # return None (a real "cannot compute" state), never a silent 0.0 or an exception.
    reference_probability = outcome_probability(reference_record, "OUT-RECOVERED")
    if reference_probability is not None:
        raise InvariantViolation(f"EVENTTREE_PROBABILITY_COMPUTE_UNEXPECTED: qualitative-only outcome should compute to None, got {reference_probability!r}")

    # An unknown outcome_id must also return None, not raise or return 0.0.
    unknown_probability = outcome_probability(watchdog_record, "OUT-DOES-NOT-EXIST")
    if unknown_probability is not None:
        raise InvariantViolation(f"EVENTTREE_PROBABILITY_COMPUTE_UNEXPECTED: unknown outcome_id should compute to None, got {unknown_probability!r}")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "EventTreeProbabilitiesEvaluated",
        {"probabilities": probabilities, "probability_sum": probability_sum, "qualitative_only_is_none": reference_probability is None, "unknown_outcome_is_none": unknown_probability is None},
        1.6,
    )
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "watchdog_event_tree_record": watchdog_record,
        "reference_event_tree_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "dangling_reference_construction_blocked": dangling_blocked,
            "phantom_outcome_construction_blocked": phantom_blocked,
            "dangling_reference_gate_blocked": dangling_gate_blocked,
            "phantom_outcome_gate_blocked": phantom_gate_blocked,
        },
        "probability_evaluation": {
            "probabilities": probabilities,
            "probability_sum": probability_sum,
            "qualitative_only_is_none": reference_probability is None,
            "unknown_outcome_is_none": unknown_probability is None,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fault_tree_slice.py)",
    }
    write_json(runtime / "results" / "event_tree_slice_result.json", result)
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
        result = run_event_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    p = result["probability_evaluation"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS root_cause.event_tree: gates [{gate_summary}], "
        f"dangling_reference_invariant(construction={v['dangling_reference_construction_blocked']}, gate={v['dangling_reference_gate_blocked']}), "
        f"phantom_outcome_invariant(construction={v['phantom_outcome_construction_blocked']}, gate={v['phantom_outcome_gate_blocked']}), "
        f"probability_sum={p['probability_sum']:.4f}, qualitative_only_is_none={p['qualitative_only_is_none']}, unknown_outcome_is_none={p['unknown_outcome_is_none']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
