"""``decision.pareto_frontier`` vertical slice -- Method Atlas slice, seventh member of the ``decision`` family
(F16), after ``decision.ahp``, ``decision.mcda``, ``decision.impact_effort``, ``decision.ice``,
``decision.rice``, ``decision.moscow``.

Builds a real 4-option/2-objective vendor shortlist (cost in USD-thousands, minimize; quality score 1-10,
maximize), computed by ``ai_lego/compute/pareto_frontier/dominance.py::compute_frontier`` (hand-verified
against the exact same worked example before this CLI was written: B/C form a genuine cost/quality tradeoff
and are both on_frontier; A is dominated by B alone; D is dominated by all three others). Then demonstrates
BOTH of this method's own real invariants are actually enforced, not merely documented:

1. The inferred no-automatic-authority rule (see the method contract's own compilation_decisions for why this
   is disclosed as the weakest-grounded such citation in the decision family) is real the same way
   ``run_impact_effort_slice.py`` already proved it for a sibling method: attempts to smuggle a
   ``recommended_option`` key onto a copy of a valid record and confirms it is refused at both the runtime
   layer and the schema layer independently.
2. The ``frontier_integrity`` gate is real, not a rubber stamp: a copy of the valid record has option
   OPT-A's own ``status`` hand-tampered from ``dominated`` to ``on_frontier`` (never re-derived from the real
   objective values) and the gate is confirmed to FAIL -- proving the gate actually re-invokes
   ``compute_frontier`` against the record's own raw fields rather than trusting whatever
   ``frontier_classification`` happens to be stored.

Run::

    python -m ai_lego.apps.cli.run_pareto_frontier_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.pareto_frontier import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_frontier_integrity_gate,
    evaluate_pareto_frontier_gates,
    generate_pareto_frontier_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PARETOFRONTIER-SYNTHETIC-001"
EXECUTION_ID = "EX-PARETOFRONTIER-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PARETOFRONTIER-001"

S = {
    "pareto_frontier_record": "ai-lego://specs/cognitive/typed-objects/pareto-frontier-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pareto-frontier-slice"


def run_pareto_frontier_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real vendor shortlist: 4 options, 2 objectives (cost USD-thousands, minimize; quality 1-10,
    # maximize). Hand-verifiable: B(8,8) and C(12,9) are a genuine tradeoff pair (neither dominates the
    # other) -- both on_frontier. A(10,8) is dominated by B alone (same quality, strictly higher cost).
    # D(15,5) is dominated by all three others (worse on both axes than everyone). ---
    objectives = [
        {"id": "OBJ-COST", "label": "成本 (USD, 千)", "direction": "minimize"},
        {"id": "OBJ-QUALITY", "label": "品質評分 (1-10)", "direction": "maximize"},
    ]
    options = [
        {"id": "OPT-A", "label": "廠商 A"},
        {"id": "OPT-B", "label": "廠商 B"},
        {"id": "OPT-C", "label": "廠商 C"},
        {"id": "OPT-D", "label": "廠商 D"},
    ]
    option_values = [
        {"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": 10},
        {"option_id": "OPT-A", "objective_id": "OBJ-QUALITY", "value": 8},
        {"option_id": "OPT-B", "objective_id": "OBJ-COST", "value": 8},
        {"option_id": "OPT-B", "objective_id": "OBJ-QUALITY", "value": 8},
        {"option_id": "OPT-C", "objective_id": "OBJ-COST", "value": 12},
        {"option_id": "OPT-C", "objective_id": "OBJ-QUALITY", "value": 9},
        {"option_id": "OPT-D", "objective_id": "OBJ-COST", "value": 15},
        {"option_id": "OPT-D", "objective_id": "OBJ-QUALITY", "value": 5},
    ]
    descriptor, frontier_record = catalog.invoke(
        METHOD_ID,
        generate_pareto_frontier_record,
        "PARETOFRONTIER-2026-09-08-001",
        "vendor shortlist -- cost vs quality",
        objectives,
        options,
        option_values,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["pareto_frontier_record"], frontier_record, "pareto frontier record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ParetoFrontierRecordGenerated", {"pareto_frontier_record": frontier_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pareto_frontier_gates(frontier_record, "run_pareto_frontier_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"pareto frontier gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PARETOFRONTIER_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ParetoFrontierGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the inferred no-automatic-authority rule is real: attempt to smuggle a "recommended_option"
    # key onto a COPY of the record, at both layers. Neither attempt may succeed. ---
    tampered_authority = copy.deepcopy(frontier_record)
    tampered_authority["recommended_option"] = "OPT-B"
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered_authority)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["pareto_frontier_record"], tampered_authority, "tampered record (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"PARETOFRONTIER_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ParetoFrontierNoAutomaticAuthorityVerified",
        {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        1.3,
    )
    milestones.append("VERIFYING")

    # --- Prove the frontier_integrity gate actually re-derives, never trusts, the stored classification: a
    # copy of the record has OPT-A's own status hand-flipped to on_frontier (never recomputed from the real
    # cost/quality values, where B still strictly dominates A) -- the gate must catch this, schema-valid shape
    # notwithstanding. ---
    tampered_status = copy.deepcopy(frontier_record)
    for entry in tampered_status["frontier_classification"]:
        if entry["option_id"] == "OPT-A":
            entry["status"] = "on_frontier"
            entry["dominated_by"] = []
    tampered_gate = evaluate_frontier_integrity_gate(tampered_status, "run_pareto_frontier_slice", clock.at(1.4))
    if tampered_gate["status"] != "FAIL":
        raise InvariantViolation(f"PARETOFRONTIER_GENUINE_COMPUTE_GUARD_DID_NOT_FIRE: tampered frontier_classification was not caught by evaluate_frontier_integrity_gate (status={tampered_gate['status']})")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ParetoFrontierGenuineComputeGuardVerified", {"tampered_gate_status": tampered_gate["status"]}, 1.5)
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "pareto_frontier_record": frontier_record,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "genuine_compute_guard_verification": {"tampered_gate_status": tampered_gate["status"]},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_mcda_slice.py)",
    }
    write_json(runtime / "results" / "pareto_frontier_slice_result.json", result)
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
        result = run_pareto_frontier_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["pareto_frontier_record"]
    frontier_summary = ", ".join(f"{e['option_id']}={e['status']}" for e in record["frontier_classification"])
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    g = result["genuine_compute_guard_verification"]
    print(
        f"PASS decision.pareto_frontier: frontier=[{frontier_summary}], gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']}), "
        f"genuine_compute_guard_verified(tampered_gate={g['tampered_gate_status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
