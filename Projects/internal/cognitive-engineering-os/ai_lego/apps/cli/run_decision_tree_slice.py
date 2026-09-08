"""``decision.decision_tree`` vertical slice -- 7th Method Atlas slice from the ``decision`` family (F16),
after ``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/``decision.rice``/
``decision.moscow``.

Invented-but-realistic (disclosed) product-launch decision, same convention ``run_pdca_slice.py``'s own
worked example follows for its own disclosure style: launch immediately (chance: high/low demand), invest
in R&D first (chance: R&D succeeds -> a SECOND decision, launch-after-success vs abandon; R&D fails -> sunk
cost), or do not launch. Hand-verified arithmetic (also in the typed-object schema's own example and
``tests/unit/test_decision_tree.py``'s own ``ComputeRollupHandVerifiedTests``)::

    EV(launch immediately)      = 0.6*500000 + 0.4*(-100000)         = 260000
    EV(post-R&D launch)         = 0.8*800000 + 0.2*(-50000)          = 630000  -> max(630000, -80000) = 630000, optimal="Launch after success"
    EV(R&D outcome)             = 0.7*630000 + 0.3*(-150000)         = 396000
    EV(root)                    = max(260000, 396000, 0)             = 396000, optimal="Invest in R&D first"

Run::

    python -m ai_lego.apps.cli.run_decision_tree_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.decision_tree import (
    METHOD_ID,
    all_gates_pass,
    chance_branch,
    chance_node,
    decision_branch,
    decision_node,
    evaluate_decision_tree_gates,
    evaluate_expected_value_integrity_gate,
    generate_decision_tree_record,
    list_decision_points,
    terminal_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DECISIONTREE-SYNTHETIC-001"
EXECUTION_ID = "EX-DECISIONTREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DECISIONTREE-001"

S = {
    "decision_tree_record": "ai-lego://specs/cognitive/typed-objects/decision-tree-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-decision-tree-slice"


def run_decision_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real scenario: invented-but-realistic product-launch decision (see module docstring for the
    # hand-verified arithmetic). Root is a DECISION with 3 alternatives; the middle one branches through a
    # CHANCE node into a SECOND, nested decision -- exercises both node types at multiple depths. ---
    calc_prov = make_provenance("CALCULATED_RESULT", "AI_GENERATED")

    post_rd_market = chance_node(
        "Post-R&D market response",
        [
            chance_branch("High demand", 0.8, terminal_node("High demand outcome", 800000)),
            chance_branch("Low demand", 0.2, terminal_node("Low demand outcome", -50000)),
        ],
    )
    post_rd_decision = decision_node(
        "Post-R&D launch decision",
        [
            decision_branch("Launch after success", post_rd_market),
            decision_branch("Abandon after success", terminal_node("Abandon after successful R&D", -80000)),
        ],
    )
    rd_outcome = chance_node(
        "R&D outcome",
        [
            chance_branch("R&D succeeds", 0.7, post_rd_decision),
            chance_branch("R&D fails", 0.3, terminal_node("R&D failure outcome", -150000)),
        ],
    )
    immediate_market = chance_node(
        "Immediate market response",
        [
            chance_branch("High demand", 0.6, terminal_node("High demand outcome", 500000)),
            chance_branch("Low demand", 0.4, terminal_node("Low demand outcome", -100000)),
        ],
    )
    root = decision_node(
        "Product launch strategy",
        [
            decision_branch("Launch immediately", immediate_market),
            decision_branch("Invest in R&D first", rd_outcome),
            decision_branch("Do not launch", terminal_node("No launch", 0)),
        ],
    )

    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_decision_tree_record,
        "DECISIONTREE-2026-09-08-001",
        "Should the team launch the new product now, invest in R&D first, or not launch at all?",
        root,
        calc_prov,
    )
    contracts.validate(S["decision_tree_record"], record, "decision tree record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionTreeRecordGenerated", {"decision_tree_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_decision_tree_gates(record, "run_decision_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decision tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DECISIONTREE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionTreeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real compute: flatten every decision point in the rolled-up tree into a summary table. ---
    decision_points = list_decision_points(record)
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionTreePointsResolved", {"record_id": record["id"], "decision_points": decision_points}, 1.3)
    milestones.append("VERIFYING")

    # --- Prove evaluate_expected_value_integrity_gate actually re-derives, never trusts, the stored
    # root_expected_value: a copy of the record has root_expected_value hand-inflated (never recomputed via
    # roll_up_node) -- the gate must catch this, schema-valid shape notwithstanding. Same convention
    # run_expected_value_slice.py's own genuine_compute tamper-demo follows (critic finding, 2026-09-08:
    # this slice was the only one of its 4 siblings without a live tamper-demo step). ---
    tampered_record = copy.deepcopy(record)
    tampered_record["root_expected_value"] = record["root_expected_value"] + 999999
    tampered_gate = evaluate_expected_value_integrity_gate(tampered_record, "run_decision_tree_slice", clock.at(1.4))
    if tampered_gate["status"] != "FAIL":
        raise InvariantViolation(
            f"DECISIONTREE_EXPECTED_VALUE_INTEGRITY_GUARD_DID_NOT_FIRE: tampered root_expected_value was not caught by "
            f"evaluate_expected_value_integrity_gate (status={tampered_gate['status']})"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionTreeExpectedValueIntegrityGuardVerified", {"tampered_gate_status": tampered_gate["status"]}, 1.4)
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "decision_tree_record": record,
        "gate_results": gate_results,
        "decision_points": decision_points,
        "genuine_compute_guard_verification": {"tampered_gate_status": tampered_gate["status"]},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_pdca_slice.py)",
    }
    write_json(runtime / "results" / "decision_tree_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_decision_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    points = result["decision_points"]
    g = result["genuine_compute_guard_verification"]
    print(
        f"PASS decision.decision_tree: root_expected_value={result['decision_tree_record']['root_expected_value']}, "
        f"optimal first choice={result['decision_tree_record']['root']['optimal_branch_label']!r}, "
        f"gates [{gate_summary}], {len(points)} decision point(s): " + "; ".join(f"{p['label']}->{p['optimal_branch_label']} (EV={p['expected_value']})" for p in points) +
        f", genuine_compute_guard_verified(tampered_gate={g['tampered_gate_status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
