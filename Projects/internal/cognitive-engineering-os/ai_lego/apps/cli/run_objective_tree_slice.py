"""``decomposition.objective_tree`` vertical slice -- F02 decomposition family, FIRST member (family
previously entirely unbuilt; see the module's own docstring for the concurrent-build-order reasoning
behind NOT importing ``decomposition.problem_tree``).

Scenario: an Objective Tree converting 3 self-contained Problem-Tree-shaped source items (2 CAUSE, 1
EFFECT) into 3 real positive objectives -- same synthetic style every sibling slice's CLI demo uses.
Builds a real, well-formed ``ObjectiveTree``, then demonstrates each of the 2 real invariants once as
a construction-time REFUSAL (one source item left unconverted -- bijective-coverage invariant; one
objective's positive_statement copied verbatim from its own source item -- anti-passthrough
invariant), proving neither is toothless, same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final pair of steps hand-tamper a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder,
catches the same defect class: a dangling ``source_item_ref``, and a duplicate ``source_item_ref``
(which simultaneously leaves another source item uncovered).

Run::

    python -m ai_lego.apps.cli.run_objective_tree_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decomposition.objective_tree import (
    METHOD_ID,
    all_gates_pass,
    evaluate_objective_tree_gates,
    generate_objective_tree,
    objective,
    source_problem_item,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OBJECTIVETREE-SYNTHETIC-001"
EXECUTION_ID = "EX-OBJECTIVETREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-OBJECTIVETREE-001"

S = {
    "objective_tree": "ai-lego://specs/cognitive/typed-objects/objective-tree.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-objective-tree-slice"


def _well_formed_source_items() -> list[dict[str, Any]]:
    return [
        source_problem_item("PT-1", "第一線客服人員流動率過高", "CAUSE"),
        source_problem_item("PT-2", "客服系統回應速度緩慢", "CAUSE"),
        source_problem_item("PT-3", "客戶滿意度持續下滑", "EFFECT"),
    ]


def _well_formed_objectives() -> list[dict[str, Any]]:
    return [
        objective("OBJ-1", "PT-1", "提升第一線客服人員留任率"),
        objective("OBJ-2", "PT-2", "縮短客服系統平均回應時間"),
        objective("OBJ-3", "PT-3", "提升客戶滿意度至目標水準以上"),
    ]


def run_objective_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.objective_tree
    # resolves because its contract is ACTIVE in the spec root's methods/contracts/, exactly the
    # mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed tree -- both real invariants satisfied, invoked through
    # the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, tree = catalog.invoke(
        METHOD_ID,
        generate_objective_tree,
        "OBJTREE-2026-09-11-001",
        _well_formed_source_items(),
        _well_formed_objectives(),
    )
    contracts.validate(S["objective_tree"], tree, "objective tree")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ObjectiveTreeGenerated", {"tree": tree, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_objective_tree_gates(tree, "run_objective_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.objective_tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("OBJTREE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (bijective coverage) is not toothless -- omitting the conversion
    # of one source item (PT-3 gets no objective) MUST be refused before any record is constructed. ---
    missing_coverage_objectives = _well_formed_objectives()[:2]  # PT-3 left unconverted
    missing_coverage_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_objective_tree("OBJTREE-MISSING-COVERAGE-REFUSED-001", _well_formed_source_items(), missing_coverage_objectives)
    except InvariantViolation as error:
        if "OBJTREE_MISSING_COVERAGE" not in str(error):
            raise
        missing_coverage_refusal_proof["raised"] = True
        missing_coverage_refusal_proof["error_code"] = "OBJTREE_MISSING_COVERAGE"
    if not missing_coverage_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OBJTREE_INVARIANT_NOT_ENFORCED: a source item left unconverted was NOT refused -- the bijective-coverage invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingCoverageRefused", {"refusal_proof": missing_coverage_refusal_proof}, 1.3)
    milestones.append("MISSING_COVERAGE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (anti-passthrough) is not toothless -- a positive_statement copied
    # verbatim from its own source item's negative statement MUST be refused. ---
    passthrough_objectives = _well_formed_objectives()
    passthrough_objectives[0] = {**passthrough_objectives[0], "positive_statement": "第一線客服人員流動率過高"}  # verbatim copy of PT-1's own statement
    passthrough_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_objective_tree("OBJTREE-PASSTHROUGH-REFUSED-001", _well_formed_source_items(), passthrough_objectives)
    except InvariantViolation as error:
        if "OBJTREE_PASSTHROUGH_STATEMENT" not in str(error):
            raise
        passthrough_refusal_proof["raised"] = True
        passthrough_refusal_proof["error_code"] = "OBJTREE_PASSTHROUGH_STATEMENT"
    if not passthrough_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OBJTREE_INVARIANT_NOT_ENFORCED: a verbatim-copied positive_statement was NOT refused -- the anti-passthrough invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PassthroughRefused", {"refusal_proof": passthrough_refusal_proof}, 1.5)
    milestones.append("PASSTHROUGH_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof (dangling ref) -- the INDEPENDENT gate catches a defect even
    # when a caller bypasses the builder entirely (flips the first objective's stored
    # source_item_ref to an id that resolves to no real source_problem_items[].id). ---
    tampered_dangling = dict(tree)
    tampered_dangling["objectives"] = [dict(tree["objectives"][0]), *tree["objectives"][1:]]
    tampered_dangling["objectives"][0]["source_item_ref"] = "PT-NONEXISTENT"  # was "PT-1" -- bypasses the builder directly
    tampered_dangling_gate = evaluate_objective_tree_gates(tampered_dangling, "run_objective_tree_slice", clock.at(2.0))
    dangling_tamper_caught = not all_gates_pass(tampered_dangling_gate)
    if not dangling_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("OBJTREE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered dangling source_item_ref")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedDanglingRefCaughtByGate", {"tampered_gate_results": tampered_dangling_gate}, 2.1)
    milestones.append("DANGLING_TAMPER_CAUGHT_BY_GATE")

    # --- Step 5: hand-tampering proof (duplicate ref) -- flips the second objective's stored
    # source_item_ref to the same value as the first (PT-1 now double-covered, PT-2 no longer
    # covered at all: a single tamper that trips BOTH the duplicate-coverage and missing-coverage
    # halves of invariant 1 at once). ---
    tampered_duplicate = dict(tree)
    tampered_duplicate["objectives"] = [dict(o) for o in tree["objectives"]]
    tampered_duplicate["objectives"][1]["source_item_ref"] = tampered_duplicate["objectives"][0]["source_item_ref"]  # was "PT-2", now "PT-1"
    tampered_duplicate_gate = evaluate_objective_tree_gates(tampered_duplicate, "run_objective_tree_slice", clock.at(2.2))
    duplicate_tamper_caught = not all_gates_pass(tampered_duplicate_gate)
    if not duplicate_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("OBJTREE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered duplicate source_item_ref")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedDuplicateRefCaughtByGate", {"tampered_gate_results": tampered_duplicate_gate}, 2.3)
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
        "missing_coverage_refusal_proof": missing_coverage_refusal_proof,
        "passthrough_refusal_proof": passthrough_refusal_proof,
        "tampered_dangling_gate_results": tampered_dangling_gate,
        "tampered_duplicate_gate_results": tampered_duplicate_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "objective_tree_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_objective_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.objective_tree: ObjectiveTree {result['tree']['id']} built with "
        f"{len(result['tree']['source_problem_items'])} source items converted to "
        f"{len(result['tree']['objectives'])} objectives, gates [{gate_summary}]; "
        f"OBJTREE_MISSING_COVERAGE/OBJTREE_PASSTHROUGH_STATEMENT invariants each REFUSED a malformed "
        f"attempt ({result['missing_coverage_refusal_proof']['error_code']}, "
        f"{result['passthrough_refusal_proof']['error_code']}); hand-tampered dangling AND duplicate "
        f"source_item_ref each caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
