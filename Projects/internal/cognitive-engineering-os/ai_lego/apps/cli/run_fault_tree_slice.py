"""``root_cause.fault_tree`` vertical slice -- fourth member of the `root_cause` family (F05), after
`root_cause.fishbone`, `root_cause.five_whys`, and `root_cause.pareto`. Same AND/OR-tree STRUCTURE as
`security.attack_tree`, deliberately a DIFFERENT shape (flat basic_events/gates cross-referenced by id, not
embedded nesting -- see ``ai_lego.modules.root_cause.fault_tree``'s own module docstring for why).

Builds an INVENTED-BUT-REALISTIC scenario, disclosed honestly as such: a broken production deploy reaching
customers undetected, grounded in this repo's own real deploy pipeline (``agency-os/AGENTS.md:9`` --
"npm test -> healthcheck -> HTTP smoke -> 失敗自動 rollback"). Top event fires (OR, any one suffices) if
EITHER the test gate was silently skipped, OR both automated detection layers failed (AND, needs both
healthcheck AND smoke test to be blind to the defect), OR the auto-rollback trigger itself is broken.

Then proves BOTH headline invariants are real, at BOTH layers:

1. Gate-mode consistency (``FAULTTREE_GATE_MODE_MISMATCH``): a hand-crafted gate whose ``required_count``
   disagrees with its own ``gate_type`` must be refused at CONSTRUCTION, and a copy of the valid record with
   its own stored ``required_count`` hand-tampered afterward must be caught independently at the GATE layer.
2. Referential integrity (``FAULTTREE_DANGLING_REFERENCE``): a hand-crafted gate referencing a nonexistent
   child id must be refused at CONSTRUCTION, and the same tamper applied to a copy of the valid record must
   be caught independently at the GATE layer.

Finally demonstrates ``evaluate_top_event`` -- real bottom-up boolean propagation over the SAME AND/OR
semantics the gate-mode invariant checks structurally -- against three scenarios, showing the OR/AND logic
actually fire (or not) as the domain semantics require.

Run::

    python -m ai_lego.apps.cli.run_fault_tree_slice
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
from ai_lego.modules.root_cause.fault_tree import (
    METHOD_ID,
    all_gates_pass,
    basic_event,
    evaluate_fault_tree_gates,
    evaluate_fault_tree_integrity_gate,
    evaluate_top_event,
    gate,
    generate_fault_tree_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FAULTTREE-SYNTHETIC-001"
EXECUTION_ID = "EX-FAULTTREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FAULTTREE-001"

S = {
    "fault_tree_record": "ai-lego://specs/cognitive/typed-objects/fault-tree-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-fault-tree-slice"


def run_fault_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Invented-but-realistic scenario (disclosed): a broken production deploy reaching customers
    # undetected, grounded in agency-os/AGENTS.md:9's own real pipeline description
    # ("npm test -> healthcheck -> HTTP smoke -> 失敗自動 rollback"). ---
    top_event = {"description": "Broken production deploy reaches customers undetected", "gate_ref": "GATE-TOP"}
    basic_events = [
        basic_event("BE-TEST-SKIPPED", "npm test gate silently skipped in CI", probability=0.02),
        basic_event("BE-HEALTHCHECK-BLIND", "healthcheck endpoint does not exercise the broken code path", probability=0.1),
        basic_event("BE-SMOKE-BLIND", "HTTP smoke test does not exercise the broken code path", probability=0.1),
        basic_event("BE-ROLLBACK-BROKEN", "auto-rollback trigger itself is disabled or broken", probability=0.01),
    ]
    gates = [
        gate("GATE-TOP", "Broken production deploy reaches customers undetected", "OR", ["BE-TEST-SKIPPED", "GATE-DETECTION-FAILED", "BE-ROLLBACK-BROKEN"]),
        gate("GATE-DETECTION-FAILED", "Both automated detection layers fail to catch the defect", "AND", ["BE-HEALTHCHECK-BLIND", "BE-SMOKE-BLIND"]),
    ]
    descriptor, deploy_record = catalog.invoke(
        METHOD_ID,
        generate_fault_tree_record,
        "FAULTTREE-2026-09-07-001",
        "sg-deploy.sh production deploy pipeline",
        top_event,
        basic_events,
        gates,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["fault_tree_record"], deploy_record, "deploy-pipeline fault tree record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FaultTreeRecordGenerated", {"fault_tree_record": deploy_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_fault_tree_gates(deploy_record, "run_fault_tree_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"fault tree gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"FAULTTREE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FaultTreeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal single-gate, single-basic-event tree. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_fault_tree_record,
        "FAULTTREE-2026-09-07-002",
        "internal-reference lookup service",
        {"description": "Reference table returns stale data", "gate_ref": "GATE-MIN"},
        [basic_event("BE-CACHE-NOT-INVALIDATED", "Cache invalidation job silently stopped running")],
        [gate("GATE-MIN", "Reference table returns stale data", "OR", ["BE-CACHE-NOT-INVALIDATED"])],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["fault_tree_record"], reference_record, "minimal fault tree record")

    # --- Prove invariant #1 (gate-mode consistency) is real at the CONSTRUCTION layer: a hand-crafted gate
    # whose required_count disagrees with its own gate_type must be refused. ---
    mode_mismatch_blocked = False
    try:
        generate_fault_tree_record(
            "FAULTTREE-2026-09-07-003",
            "some-system",
            {"description": "some top event", "gate_ref": "G1"},
            [basic_event("BE-A", "a"), basic_event("BE-B", "b")],
            [{"id": "G1", "description": "d", "gate_type": "AND", "required_count": 1, "children": ["BE-A", "BE-B"]}],  # AND with 2 children needs required_count=2, not 1
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        mode_mismatch_blocked = "FAULTTREE_GATE_MODE_MISMATCH" in str(error)
    if not mode_mismatch_blocked:
        raise InvariantViolation("FAULTTREE_INVARIANT_GUARD_DID_NOT_FIRE: a gate with a mismatched required_count was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (referential integrity) is real at the CONSTRUCTION layer: a hand-crafted gate
    # referencing a nonexistent child id must be refused. ---
    dangling_blocked = False
    try:
        generate_fault_tree_record(
            "FAULTTREE-2026-09-07-004",
            "some-system",
            {"description": "some top event", "gate_ref": "G1"},
            [basic_event("BE-A", "a")],
            [gate("G1", "d", "OR", ["BE-A", "BE-DOES-NOT-EXIST"])],
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        dangling_blocked = "FAULTTREE_DANGLING_REFERENCE" in str(error)
    if not dangling_blocked:
        raise InvariantViolation("FAULTTREE_INVARIANT_GUARD_DID_NOT_FIRE: a gate referencing a nonexistent child id was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take COPIES of
    # the real, valid deploy_record and hand-tamper each invariant separately. ---
    tampered_mode = copy.deepcopy(deploy_record)
    tampered_mode["gates"][1]["required_count"] = 1  # GATE-DETECTION-FAILED is AND with 2 children; 1 disagrees
    mode_gate_result = evaluate_fault_tree_integrity_gate(tampered_mode, "run_fault_tree_slice", clock.at(1.3))
    mode_gate_blocked = mode_gate_result["status"] == "FAIL" and mode_gate_result["evidence"][0]["reason"] == "stored required_count disagrees with gate_type"
    if not mode_gate_blocked:
        raise InvariantViolation(f"FAULTTREE_GATE_GUARD_DID_NOT_FIRE: fault_tree_integrity did not flag the hand-tampered required_count (status={mode_gate_result['status']}, evidence={mode_gate_result['evidence']})")

    tampered_ref = copy.deepcopy(deploy_record)
    tampered_ref["gates"][1]["children"] = ["BE-HEALTHCHECK-BLIND", "BE-DOES-NOT-EXIST"]
    ref_gate_result = evaluate_fault_tree_integrity_gate(tampered_ref, "run_fault_tree_slice", clock.at(1.4))
    ref_gate_blocked = ref_gate_result["status"] == "FAIL" and ref_gate_result["evidence"][0]["reason"] == "dangling reference"
    if not ref_gate_blocked:
        raise InvariantViolation(f"FAULTTREE_GATE_GUARD_DID_NOT_FIRE: fault_tree_integrity did not flag the hand-tampered dangling reference (status={ref_gate_result['status']}, evidence={ref_gate_result['evidence']})")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "FaultTreeInvariantVerified",
        {
            "gate_mode_construction_blocked": mode_mismatch_blocked,
            "gate_mode_gate_blocked": mode_gate_blocked,
            "referential_integrity_construction_blocked": dangling_blocked,
            "referential_integrity_gate_blocked": ref_gate_blocked,
        },
        1.5,
    )
    milestones.append("VERIFYING")

    # --- Real bottom-up boolean propagation, THREE scenarios against the SAME deploy_record, showing the
    # AND/OR semantics actually fire (or not) as the domain requires. ---
    scenario_test_gate_skipped_alone = evaluate_top_event(deploy_record, {"BE-TEST-SKIPPED"})  # OR: one child true -> top event fires
    scenario_healthcheck_blind_alone = evaluate_top_event(deploy_record, {"BE-HEALTHCHECK-BLIND"})  # AND needs BOTH -> GATE-DETECTION-FAILED does not fire -> top event does not fire
    scenario_both_detection_layers_blind = evaluate_top_event(deploy_record, {"BE-HEALTHCHECK-BLIND", "BE-SMOKE-BLIND"})  # AND: both true -> fires -> OR sees one true child -> top event fires
    if not (scenario_test_gate_skipped_alone is True and scenario_healthcheck_blind_alone is False and scenario_both_detection_layers_blind is True):
        raise InvariantViolation(
            "FAULTTREE_SCENARIO_EVALUATION_UNEXPECTED: "
            f"test_skipped_alone={scenario_test_gate_skipped_alone}, healthcheck_blind_alone={scenario_healthcheck_blind_alone}, "
            f"both_detection_layers_blind={scenario_both_detection_layers_blind}"
        )
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "FaultTreeScenariosEvaluated",
        {
            "test_gate_skipped_alone_fires": scenario_test_gate_skipped_alone,
            "healthcheck_blind_alone_fires": scenario_healthcheck_blind_alone,
            "both_detection_layers_blind_fires": scenario_both_detection_layers_blind,
        },
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
        "deploy_fault_tree_record": deploy_record,
        "reference_fault_tree_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "gate_mode_construction_blocked": mode_mismatch_blocked,
            "gate_mode_gate_blocked": mode_gate_blocked,
            "referential_integrity_construction_blocked": dangling_blocked,
            "referential_integrity_gate_blocked": ref_gate_blocked,
        },
        "scenario_evaluation": {
            "test_gate_skipped_alone_fires": scenario_test_gate_skipped_alone,
            "healthcheck_blind_alone_fires": scenario_healthcheck_blind_alone,
            "both_detection_layers_blind_fires": scenario_both_detection_layers_blind,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_attack_tree_slice.py)",
    }
    write_json(runtime / "results" / "fault_tree_slice_result.json", result)
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
        result = run_fault_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    s = result["scenario_evaluation"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS root_cause.fault_tree: gates [{gate_summary}], "
        f"gate_mode_invariant(construction={v['gate_mode_construction_blocked']}, gate={v['gate_mode_gate_blocked']}), "
        f"referential_integrity_invariant(construction={v['referential_integrity_construction_blocked']}, gate={v['referential_integrity_gate_blocked']}), "
        f"scenarios(test_skipped_alone={s['test_gate_skipped_alone_fires']}, healthcheck_blind_alone={s['healthcheck_blind_alone_fires']}, both_detection_blind={s['both_detection_layers_blind_fires']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
