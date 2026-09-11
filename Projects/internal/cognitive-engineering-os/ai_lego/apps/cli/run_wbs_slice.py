"""``decomposition.wbs`` vertical slice -- F02 "拆解與結構化" family, one of 9 concurrent members opening this
family this same batch (see ``run_issue_tree_slice.py``/etc. for sibling CLI demos, where they already exist).

Scenario: a 2-level Work Breakdown Structure for a website-launch deliverable -- 3 leaf work packages
(4h/6h/10h) under one intermediate "視覺設計" deliverable branch and the root deliverable, same synthetic style
every sibling slice's CLI demo uses. Hand-verified rollup: the "視覺設計" branch totals 4+6=10; the whole
deliverable totals 4+6+10=20. Builds a real, well-formed ``WorkBreakdownStructure``, then demonstrates EACH of
the 2 real invariants once as a construction-time REFUSAL (a leaf missing owner/estimate_hours; a non-leaf
illegally carrying a non-null owner/estimate_hours), each attempted BEFORE any record is built, proving
neither is toothless. A final step hand-tampers a VALID record's stored ``total_estimate_hours`` directly
(bypassing the builder) to prove the independent rollup gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_wbs_slice
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
from ai_lego.modules.decomposition.wbs import (
    METHOD_ID,
    all_gates_pass,
    evaluate_wbs_gates,
    generate_wbs,
    list_leaf_work_packages,
    wbs_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WBS-SYNTHETIC-001"
EXECUTION_ID = "EX-WBS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-WBS-001"

S = {
    "wbs": "ai-lego://specs/cognitive/typed-objects/work-breakdown-structure.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-wbs-slice"


def _well_formed_deliverable() -> dict[str, Any]:
    return wbs_node(
        "D-ROOT",
        "公司官網改版上線",
        children=[
            wbs_node(
                "D-DESIGN",
                "視覺設計",
                children=[
                    wbs_node("WP-WIREFRAME", "線框稿", owner="設計師A", estimate_hours=4),
                    wbs_node("WP-VISUALDESIGN", "視覺稿", owner="設計師A", estimate_hours=6),
                ],
            ),
            wbs_node("WP-FRONTEND", "前端切版與串接", owner="工程師B", estimate_hours=10),
        ],
    )


def run_wbs_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.wbs resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed WBS -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, wbs = catalog.invoke(
        METHOD_ID,
        generate_wbs,
        "WBS-2026-09-11-001",
        _well_formed_deliverable(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["wbs"], wbs, "work breakdown structure")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WorkBreakdownStructureGenerated", {"wbs": wbs, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    # Hand-verified 100%-rule arithmetic, independent of any code path: 4 + 6 = 10 ("視覺設計" branch);
    # 4 + 6 + 10 = 20 (whole deliverable).
    design_branch = wbs["deliverable"]["children"][0]
    if design_branch["total_estimate_hours"] != 10:
        raise InvariantViolation(f"WBS_HAND_VERIFICATION_FAILED: expected 視覺設計 branch total_estimate_hours=10, got {design_branch['total_estimate_hours']!r}")
    if wbs["deliverable"]["total_estimate_hours"] != 20:
        raise InvariantViolation(f"WBS_HAND_VERIFICATION_FAILED: expected root total_estimate_hours=20, got {wbs['deliverable']['total_estimate_hours']!r}")
    milestones.append("HAND_VERIFIED_ROLLUP")

    gate_results = evaluate_wbs_gates(wbs, "run_wbs_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.wbs gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("WBS_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1's LEAF direction is not toothless -- a leaf node missing owner/
    # estimate_hours MUST be refused before any record is constructed. ---
    leaf_missing_owner_deliverable = _well_formed_deliverable()
    leaf_missing_owner_deliverable["children"][1] = {**leaf_missing_owner_deliverable["children"][1], "owner": None}
    leaf_missing_owner_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_wbs("WBS-LEAF-REFUSED-001", leaf_missing_owner_deliverable, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE" not in str(error):
            raise
        leaf_missing_owner_refusal_proof["raised"] = True
        leaf_missing_owner_refusal_proof["error_code"] = "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"
    if not leaf_missing_owner_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("WBS_INVARIANT_NOT_ENFORCED: a leaf node missing owner was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LeafMissingOwnerRefused", {"refusal_proof": leaf_missing_owner_refusal_proof}, 1.3)
    milestones.append("LEAF_MISSING_OWNER_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 1's NON-LEAF direction is not toothless -- a non-leaf node illegally
    # carrying a non-null owner/estimate_hours MUST be refused before any record is constructed. ---
    nonleaf_with_owner_deliverable = _well_formed_deliverable()
    nonleaf_with_owner_deliverable["children"][0] = {**nonleaf_with_owner_deliverable["children"][0], "owner": "不應該有人"}
    nonleaf_with_owner_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_wbs("WBS-NONLEAF-REFUSED-001", nonleaf_with_owner_deliverable, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE" not in str(error):
            raise
        nonleaf_with_owner_refusal_proof["raised"] = True
        nonleaf_with_owner_refusal_proof["error_code"] = "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE"
    if not nonleaf_with_owner_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("WBS_INVARIANT_NOT_ENFORCED: a non-leaf node illegally carrying an owner was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NonLeafWithOwnerRefused", {"refusal_proof": nonleaf_with_owner_refusal_proof}, 1.5)
    milestones.append("NONLEAF_WITH_OWNER_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT rollup gate catches a defect even when a caller
    # bypasses the builder entirely (flips the root's own stored total_estimate_hours to a value that
    # disagrees with a fresh bottom-up recomputation from the record's own raw tree). ---
    tampered = dict(wbs)
    tampered["deliverable"] = dict(wbs["deliverable"])
    tampered["deliverable"]["total_estimate_hours"] = 999  # was 20 -- bypasses the builder directly
    tampered_gate = evaluate_wbs_gates(tampered, "run_wbs_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("WBS_GATE_NOT_INDEPENDENT: the independent rollup gate did NOT catch a hand-tampered total_estimate_hours that disagrees with a fresh recomputation")
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
        "wbs": wbs,
        "leaf_work_packages": list_leaf_work_packages(wbs),
        "gate_results": gate_results,
        "leaf_missing_owner_refusal_proof": leaf_missing_owner_refusal_proof,
        "nonleaf_with_owner_refusal_proof": nonleaf_with_owner_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "wbs_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_wbs_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.wbs: WorkBreakdownStructure {result['wbs']['id']} built with "
        f"{len(result['leaf_work_packages'])} leaf work packages, root total_estimate_hours="
        f"{result['wbs']['deliverable']['total_estimate_hours']}, gates [{gate_summary}]; "
        f"WBS_LEAF_MISSING_OWNER_OR_ESTIMATE/WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE invariants each REFUSED a "
        f"malformed attempt ({result['leaf_missing_owner_refusal_proof']['error_code']}, "
        f"{result['nonleaf_with_owner_refusal_proof']['error_code']}); hand-tampered total_estimate_hours "
        f"caught via the INDEPENDENT rollup gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
