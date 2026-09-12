"""``representation.causal_view`` vertical slice -- F24 representation family (Atlas L969).

Builds a 2-edge Causal View over a pre-existing (synthetic) causal DAG's edge
ids, each edge carrying its own assumption, then proves Atlas's own "避免一
般圖誤當因果" benefit is a real invariant, not mere narrative order: a
construction-time attempt to render an edge with NO assumption is refused,
and a hand-tampered valid record (an assumption blanked out after the fact,
bypassing the builder) is independently caught by the
edge_assumption_required gate.

Run::

    python -m ai_lego.apps.cli.run_causal_view_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.representation.causal_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_causal_view_gates,
    evaluate_edge_assumption_required_gate,
    generate_causal_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-CVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CVIEW-001"

S = {
    "causal_view": "ai-lego://specs/cognitive/typed-objects/causal-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-causal-view-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "knowledge_ref": "CDAG-2026-09-01-001",
        "rendered_edges": [
            {"edge_id": "E-price-to-demand", "assumption": "價格上升在需求彈性 > 0.3 的市場中降低需求（非僅相關）"},
            {"edge_id": "E-demand-to-revenue", "assumption": "需求變動在庫存充足時線性轉換為營收變動"},
        ],
        "state": {"visible_fields": ["edge_id", "assumption"]},
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_causal_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed View -- 2 edges, each with a non-empty assumption. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_causal_view,
        "CVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["causal_view"], view, "causal view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CausalViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_causal_view_gates(view, "run_causal_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CausalViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L969's own "避免一般圖誤當因果" benefit is not toothless -- an edge with NO
    # assumption MUST be refused before any record is constructed. ---
    missing_assumption_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_assumption_kwargs["rendered_edges"][0]["assumption"] = ""
    missing_assumption_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_causal_view("CVIEW-MISSING-ASSUMPTION-REFUSED-001", **missing_assumption_kwargs)
    except InvariantViolation as error:
        if "CVIEW_MISSING_ASSUMPTION" not in str(error):
            raise
        missing_assumption_refusal_proof["raised"] = True
        missing_assumption_refusal_proof["error_code"] = "CVIEW_MISSING_ASSUMPTION"
    if not missing_assumption_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CVIEW_INVARIANT_NOT_ENFORCED: an edge with no assumption was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingAssumptionRefused", {"refusal_proof": missing_assumption_refusal_proof}, 1.3)
    milestones.append("MISSING_ASSUMPTION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT edge_assumption_required gate catches the same
    # defect class even when a caller bypasses the builder entirely (an assumption blanked out on an
    # already-built record). ---
    tampered = copy.deepcopy(view)
    tampered["rendered_edges"][0]["assumption"] = ""
    tampered_gate = evaluate_edge_assumption_required_gate(tampered, "run_causal_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CVIEW_GATE_NOT_INDEPENDENT: the independent edge_assumption_required gate did NOT catch a hand-tampered blanked-out assumption")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "causal_view": view,
        "gate_results": gate_results,
        "missing_assumption_refusal_proof": missing_assumption_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "causal_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_causal_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.causal_view: CausalViewRecord {result['causal_view']['id']} built "
        f"(2 edges, each with a declared assumption), gates [{gate_summary}]; "
        f"CVIEW_MISSING_ASSUMPTION REFUSED an unassumed-edge attempt ({result['missing_assumption_refusal_proof']['error_code']}); "
        f"hand-tampered blanked-out assumption caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
