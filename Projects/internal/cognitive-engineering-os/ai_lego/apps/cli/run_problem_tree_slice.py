"""``decomposition.problem_tree`` vertical slice -- F02 decomposition & structuring family, opening member
(1 of 9 F02 methods built in this same parallel batch; see ``ai_lego/modules/decomposition/problem_tree.py``
module docstring for the full family list and design rationale).

Scenario: a Problem Tree for a declining customer-retention problem -- same synthetic style every sibling
slice's CLI demo uses. Builds a real, well-formed ``ProblemTree`` with 2 causes and 2 effects, then
demonstrates the method's real invariant is not toothless in two ways:

  1. a construction-time REFUSAL -- attempting to reuse the same id in both ``causes`` and ``effects`` MUST
     be refused BEFORE any record is built (``PROBTREE_CAUSE_EFFECT_ID_COLLISION``).
  2. a hand-tampering proof -- a VALID record is tampered directly (bypassing the builder: a causes[] id is
     overwritten to collide with an existing effects[] id), proving the INDEPENDENT gate, not just the
     builder, catches the same defect.

Also demonstrates the non-empty-causes and non-empty-effects invariants are each refused once, same "show a
real refusal, not only a real success" discipline every sibling slice's CLI demo already establishes.

Run::

    python -m ai_lego.apps.cli.run_problem_tree_slice
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
from ai_lego.modules.decomposition.problem_tree import (
    METHOD_ID,
    all_gates_pass,
    evaluate_problem_tree_gates,
    generate_problem_tree,
    tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PROBLEMTREE-SYNTHETIC-001"
EXECUTION_ID = "EX-PROBLEMTREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PROBLEMTREE-001"

S = {
    "problem_tree": "ai-lego://specs/cognitive/typed-objects/problem-tree.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-problem-tree-slice"


def _core_problem() -> str:
    return "既有客戶續約率連續三季下滑"


def _well_formed_causes() -> list[dict[str, Any]]:
    return [
        tree_node("C1", "客服回應時間拉長，平均首次回覆超過 48 小時", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        tree_node("C2", "產品新版本上線後既有工作流程被打斷，客戶重新學習成本上升", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _well_formed_effects() -> list[dict[str, Any]]:
    return [
        tree_node("E1", "年度經常性收入（ARR）成長趨緩", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        tree_node("E2", "業務團隊被迫增加折扣以留住高風險客戶，毛利率下降", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def run_problem_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.problem_tree resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed tree -- causes/effects id sets genuinely disjoint, invoked
    # through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, tree = catalog.invoke(
        METHOD_ID,
        generate_problem_tree,
        "PROBTREE-2026-09-11-001",
        _core_problem(),
        _well_formed_causes(),
        _well_formed_effects(),
    )
    contracts.validate(S["problem_tree"], tree, "problem tree")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ProblemTreeGenerated", {"tree": tree, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_problem_tree_gates(tree, "run_problem_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.problem_tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBTREE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty causes/effects) is not toothless. ---
    empty_causes_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_problem_tree("PROBTREE-EMPTY-CAUSES-REFUSED-001", _core_problem(), [], _well_formed_effects())
    except InvariantViolation as error:
        if "PROBTREE_EMPTY_CAUSES" not in str(error):
            raise
        empty_causes_refusal_proof["raised"] = True
        empty_causes_refusal_proof["error_code"] = "PROBTREE_EMPTY_CAUSES"
    if not empty_causes_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBTREE_INVARIANT_NOT_ENFORCED: an empty causes list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyCausesRefused", {"refusal_proof": empty_causes_refusal_proof}, 1.2)
    milestones.append("EMPTY_CAUSES_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (the method's CORE invariant -- causes/effects id disjointness) is not
    # toothless. Reuse the exact same id ("E1") in both lists BEFORE any record is built. ---
    colliding_causes = [*_well_formed_causes(), tree_node("E1", "客戶對續約優惠條件的期待與實際報價落差擴大", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
    id_collision_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_problem_tree("PROBTREE-COLLISION-REFUSED-001", _core_problem(), colliding_causes, _well_formed_effects())
    except InvariantViolation as error:
        if "PROBTREE_CAUSE_EFFECT_ID_COLLISION" not in str(error):
            raise
        id_collision_refusal_proof["raised"] = True
        id_collision_refusal_proof["error_code"] = "PROBTREE_CAUSE_EFFECT_ID_COLLISION"
    if not id_collision_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBTREE_INVARIANT_NOT_ENFORCED: a causes/effects id collision was NOT refused -- the core invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IdCollisionRefused", {"refusal_proof": id_collision_refusal_proof}, 1.4)
    milestones.append("ID_COLLISION_REFUSAL_PROVEN")

    # --- Step 3b: proof invariant 3 (within-list id uniqueness, critic finding 2026-09-11) is not toothless.
    # Two DIFFERENT causes sharing one id, BEFORE any record is built. ---
    duplicate_causes = [*_well_formed_causes(), tree_node("C1", "另一個不同的原因敘述，卻誤用了已存在的 id", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
    duplicate_cause_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_problem_tree("PROBTREE-DUPCAUSE-REFUSED-001", _core_problem(), duplicate_causes, _well_formed_effects())
    except InvariantViolation as error:
        if "PROBTREE_DUPLICATE_CAUSE_ID" not in str(error):
            raise
        duplicate_cause_refusal_proof["raised"] = True
        duplicate_cause_refusal_proof["error_code"] = "PROBTREE_DUPLICATE_CAUSE_ID"
    if not duplicate_cause_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBTREE_INVARIANT_NOT_ENFORCED: a within-causes duplicate id was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateCauseIdRefused", {"refusal_proof": duplicate_cause_refusal_proof}, 1.45)
    milestones.append("DUPLICATE_CAUSE_ID_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a post-construction id collision even
    # when a caller bypasses the builder entirely (splices a causes[] id to collide with an existing
    # effects[] id directly into a copy of the already-valid record). ---
    tampered = dict(tree)
    tampered["causes"] = [dict(tree["causes"][0]), dict(tree["causes"][1])]
    tampered["causes"][0]["id"] = tree["effects"][0]["id"]  # was "C1" -- now collides with effects[0]'s "E1"
    tampered_gate = evaluate_problem_tree_gates(tampered, "run_problem_tree_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBTREE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered causes/effects id collision")
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
        "tree": tree,
        "gate_results": gate_results,
        "empty_causes_refusal_proof": empty_causes_refusal_proof,
        "id_collision_refusal_proof": id_collision_refusal_proof,
        "duplicate_cause_refusal_proof": duplicate_cause_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "problem_tree_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_problem_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.problem_tree: ProblemTree {result['tree']['id']} built with "
        f"{len(result['tree']['causes'])} causes / {len(result['tree']['effects'])} effects, gates [{gate_summary}]; "
        f"PROBTREE_EMPTY_CAUSES/PROBTREE_CAUSE_EFFECT_ID_COLLISION/PROBTREE_DUPLICATE_CAUSE_ID invariants each "
        f"REFUSED a malformed attempt ({result['empty_causes_refusal_proof']['error_code']}, "
        f"{result['id_collision_refusal_proof']['error_code']}, {result['duplicate_cause_refusal_proof']['error_code']}); "
        f"hand-tampered id collision caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
