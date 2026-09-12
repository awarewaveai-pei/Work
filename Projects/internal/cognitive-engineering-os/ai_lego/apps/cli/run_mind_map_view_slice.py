"""``representation.mind_map_view`` vertical slice -- F24 Representation family (Atlas L966).

Builds a 3-node radial layout (one declared center) over a synthetic Knowledge Object, then proves two real
invariants are not toothless: (1) a construction-time attempt to declare `layout.center_node_id` pointing at
a node that was never rendered is refused, and (2) a hand-tampered valid record (a duplicate `node_id`
appended directly, bypassing the builder) is independently caught by the reference_integrity gate.

Also demonstrates the disambiguation from ``association.mind_map``: this record carries no `central_topic`/
`label`/`keywords` field anywhere -- only `node_id` references and numeric coordinates.

Run::

    python -m ai_lego.apps.cli.run_mind_map_view_slice
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
from ai_lego.modules.representation.mind_map_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_mind_map_view_gates,
    evaluate_reference_integrity_gate,
    generate_mind_map_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MMVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-MMVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-MMVIEW-001"

S = {
    "mind_map_view": "ai-lego://specs/cognitive/typed-objects/mind-map-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-mind-map-view-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "source_knowledge_object_id": "KO-2026-09-12-003",
        "node_positions": [
            {"node_id": "KNODE-CENTER", "x": 0, "y": 0, "distance_from_center": 0},
            {"node_id": "KNODE-A", "x": 100, "y": 0, "distance_from_center": 100},
            {"node_id": "KNODE-B", "x": -70.7, "y": 70.7, "distance_from_center": 100},
        ],
        "layout": {"center_node_id": "KNODE-CENTER", "orientation": "radial"},
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_mind_map_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- 3 nodes, a valid declared center, no content field anywhere. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_mind_map_view,
        "MMVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["mind_map_view"], view, "mind map view")
    assert "central_topic" not in view and "keywords" not in view, "MMVIEW must never carry association.mind_map's own content fields"
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MindMapViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_mind_map_view_gates(view, "run_mind_map_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"mind map view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MMVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MindMapViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove the center-referential-integrity invariant is not toothless -- a center_node_id
    # pointing at a node that was never rendered MUST be refused before any record is constructed. ---
    dangling_center_kwargs = copy.deepcopy(_well_formed_kwargs())
    dangling_center_kwargs["layout"]["center_node_id"] = "KNODE-NEVER-RENDERED"
    dangling_center_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_mind_map_view("MMVIEW-DANGLING-CENTER-REFUSED-001", **dangling_center_kwargs)
    except InvariantViolation as error:
        if "MMVIEW_DANGLING_CENTER_REF" not in str(error):
            raise
        dangling_center_refusal_proof["raised"] = True
        dangling_center_refusal_proof["error_code"] = "MMVIEW_DANGLING_CENTER_REF"
    if not dangling_center_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("MMVIEW_INVARIANT_NOT_ENFORCED: a dangling center_node_id was NOT refused -- the referential-integrity invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingCenterRefused", {"refusal_proof": dangling_center_refusal_proof}, 1.3)
    milestones.append("DANGLING_CENTER_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT reference_integrity gate catches a duplicate
    # node_id appended directly onto an already-valid record, bypassing the builder entirely. ---
    tampered = copy.deepcopy(view)
    tampered["node_positions"].append({"node_id": "KNODE-A", "x": 5, "y": 5})
    tampered_gate = evaluate_reference_integrity_gate(tampered, "run_mind_map_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("MMVIEW_GATE_NOT_INDEPENDENT: the independent reference_integrity gate did NOT catch a hand-tampered duplicate node_id")
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
        "mind_map_view": view,
        "gate_results": gate_results,
        "dangling_center_refusal_proof": dangling_center_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "mind_map_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_mind_map_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.mind_map_view: MindMapViewRecord {result['mind_map_view']['id']} built "
        f"(3 rendered nodes, radial layout, no content fields -- disambiguated from association.mind_map's MINDMAP- records), "
        f"gates [{gate_summary}]; "
        f"MMVIEW_DANGLING_CENTER_REF REFUSED a dangling-center attempt ({result['dangling_center_refusal_proof']['error_code']}); "
        f"hand-tampered duplicate node_id caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
