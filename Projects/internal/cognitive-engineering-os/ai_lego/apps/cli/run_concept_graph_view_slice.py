"""``representation.concept_graph_view`` vertical slice -- F24 representation family (Atlas L967).

Renders a 2-edge concept graph over a synthetic knowledge-object scenario (one "supports" relation, one
"contradicts" relation, proving Atlas's own "可視化知識與矛盾" benefit), faithfully mirroring each edge's
relation_type/provenance_ref from a ground-truth source_relations[] list, then proves Atlas L967's own "render
relations/provenance" pipeline stage is a real invariant, not mere narrative order: a construction-time
attempt to FABRICATE a relation_type the source data does not have is refused, and a hand-tampered valid
record (an edge's relation_type silently rewritten after construction) is independently caught by the
rendering_fidelity gate.

Run::

    python -m ai_lego.apps.cli.run_concept_graph_view_slice
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
from ai_lego.modules.representation.concept_graph_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_concept_graph_view_gates,
    evaluate_rendering_fidelity_gate,
    generate_concept_graph_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CGRAPH-SYNTHETIC-001"
EXECUTION_ID = "EX-CGRAPH-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CGRAPH-001"

S = {
    "concept_graph_view": "ai-lego://specs/cognitive/typed-objects/concept-graph-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-concept-graph-view-slice"


def _source_relations() -> list[dict[str, Any]]:
    return [
        {"relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-REL-1"},
        {"relation_id": "REL-2", "relation_type": "contradicts", "provenance_ref": "PROV-REL-2"},
    ]


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "knowledge_ref": "KO-2026-09-12-001",
        "source_relations": _source_relations(),
        "edges": [
            {"edge_id": "EDGE-1", "relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-REL-1", "layout_position": {"x": 0, "y": 0}, "visible": True},
            {"edge_id": "EDGE-2", "relation_id": "REL-2", "relation_type": "contradicts", "provenance_ref": "PROV-REL-2", "layout_position": {"x": 10, "y": 20}, "visible": True},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_concept_graph_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed graph -- 2 edges, both faithful to their source relations. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_concept_graph_view,
        "CGRAPH-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["concept_graph_view"], view, "concept graph view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConceptGraphViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_concept_graph_view_gates(view, _source_relations(), "run_concept_graph_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"concept graph view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CGRAPH_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConceptGraphViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L967's own "render relations/provenance" pipeline stage is not toothless -- an
    # edge FABRICATING a relation_type the source data does not have MUST be refused before any record is
    # constructed. ---
    fabricated_kwargs = copy.deepcopy(_well_formed_kwargs())
    fabricated_kwargs["edges"][1]["relation_type"] = "supports"  # REL-2 is actually "contradicts" -- fabricated
    fabrication_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_concept_graph_view("CGRAPH-FABRICATION-REFUSED-001", **fabricated_kwargs)
    except InvariantViolation as error:
        if "CGRAPH_RELATION_TYPE_MISMATCH" not in str(error):
            raise
        fabrication_refusal_proof["raised"] = True
        fabrication_refusal_proof["error_code"] = "CGRAPH_RELATION_TYPE_MISMATCH"
    if not fabrication_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CGRAPH_INVARIANT_NOT_ENFORCED: an edge fabricating a relation_type the source data does not have was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FabricationRefused", {"refusal_proof": fabrication_refusal_proof}, 1.3)
    milestones.append("FABRICATION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT rendering_fidelity gate catches the same defect
    # class even when a caller bypasses the builder entirely (EDGE-1's relation_type silently rewritten from
    # "supports" to "contradicts" after construction). ---
    tampered = copy.deepcopy(view)
    tampered["edges"][0]["relation_type"] = "contradicts"
    tampered_gate = evaluate_rendering_fidelity_gate(tampered, _source_relations(), "run_concept_graph_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CGRAPH_GATE_NOT_INDEPENDENT: the independent rendering_fidelity gate did NOT catch a hand-tampered relation_type rewrite")
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
        "concept_graph_view": view,
        "gate_results": gate_results,
        "fabrication_refusal_proof": fabrication_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "concept_graph_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_concept_graph_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.concept_graph_view: ConceptGraphView {result['concept_graph_view']['id']} built "
        f"(2 edges, both faithful to source relations), gates [{gate_summary}]; "
        f"CGRAPH_RELATION_TYPE_MISMATCH REFUSED a fabricated relation_type ({result['fabrication_refusal_proof']['error_code']}); "
        f"hand-tampered relation_type rewrite caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
