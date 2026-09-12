"""``delivery.dependency_graph`` vertical slice -- F22 PM/Delivery/Governance Pack (Atlas L920).

Builds a 3-node delivery dependency graph (2 tasks + 1 milestone) with one
critical edge (owner + fallback both declared) over a synthetic DB migration
plan, then proves Atlas L920's own "critical edges→owner→fallback" pipeline
stage is a real invariant, not mere narrative order: a construction-time
attempt to declare a CRITICAL edge with no fallback is refused, and a
hand-tampered valid record (the fallback on an already-constructed critical
edge cleared to "", bypassing the builder) is independently caught by the
``critical_edge_completeness`` gate.

Run::

    python -m ai_lego.apps.cli.run_dependency_graph_slice
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
from ai_lego.modules.delivery.dependency_graph import (
    METHOD_ID,
    all_gates_pass,
    evaluate_critical_edge_completeness_gate,
    evaluate_dependency_graph_gates,
    generate_dependency_graph,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DEPGRAPH-SYNTHETIC-001"
EXECUTION_ID = "EX-DEPGRAPH-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DEPGRAPH-001"

S = {
    "dependency_graph": "ai-lego://specs/cognitive/typed-objects/dependency-graph-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-dependency-graph-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "nodes": [
            {"node_id": "T1", "node_type": "task", "description": "資料庫 schema migration"},
            {"node_id": "T2", "node_type": "task", "description": "API 層改動"},
            {"node_id": "M1", "node_type": "milestone", "description": "v2 API 上線"},
        ],
        "edges": [
            {"from_node_id": "T1", "to_node_id": "T2", "critical": True, "owner": "資料庫團隊", "fallback": "改用 expand-contract 分兩階段上線，先不砍舊欄位"},
            {"from_node_id": "T2", "to_node_id": "M1", "critical": False, "owner": "", "fallback": ""},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_dependency_graph_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed graph -- 3 nodes, 1 critical edge with owner + fallback both declared. ---
    descriptor, graph = catalog.invoke(
        METHOD_ID,
        generate_dependency_graph,
        "DEPGRAPH-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["dependency_graph"], graph, "dependency graph")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DependencyGraphGenerated", {"dependency_graph": graph, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_dependency_graph_gates(graph, "run_dependency_graph_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"dependency graph gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DEPGRAPH_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DependencyGraphGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L920's own "critical edges->owner->fallback" pipeline stage is not toothless --
    # a CRITICAL edge declared with NO fallback MUST be refused before any record is constructed. ---
    no_fallback_kwargs = copy.deepcopy(_well_formed_kwargs())
    no_fallback_kwargs["edges"][0]["fallback"] = ""
    critical_edge_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_dependency_graph("DEPGRAPH-CRITICAL-EDGE-INCOMPLETE-REFUSED-001", **no_fallback_kwargs)
    except InvariantViolation as error:
        if "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE" not in str(error):
            raise
        critical_edge_refusal_proof["raised"] = True
        critical_edge_refusal_proof["error_code"] = "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE"
    if not critical_edge_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DEPGRAPH_INVARIANT_NOT_ENFORCED: a critical edge with no fallback was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CriticalEdgeIncompleteRefused", {"refusal_proof": critical_edge_refusal_proof}, 1.3)
    milestones.append("CRITICAL_EDGE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT critical_edge_completeness gate catches the same
    # defect class even when a caller bypasses the builder entirely (the already-constructed critical edge's
    # fallback cleared to "" post-construction). ---
    tampered = copy.deepcopy(graph)
    tampered["edges"][0]["fallback"] = ""
    tampered_gate = evaluate_critical_edge_completeness_gate(tampered, "run_dependency_graph_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DEPGRAPH_GATE_NOT_INDEPENDENT: the independent critical_edge_completeness gate did NOT catch a hand-cleared fallback on a critical edge")
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
        "dependency_graph": graph,
        "gate_results": gate_results,
        "critical_edge_refusal_proof": critical_edge_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "dependency_graph_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_dependency_graph_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.dependency_graph: DependencyGraph {result['dependency_graph']['id']} built "
        f"({len(result['dependency_graph']['nodes'])} nodes, {len(result['dependency_graph']['edges'])} edges, 1 critical), gates [{gate_summary}]; "
        f"DEPGRAPH_CRITICAL_EDGE_INCOMPLETE REFUSED a no-fallback critical edge attempt ({result['critical_edge_refusal_proof']['error_code']}); "
        f"hand-cleared fallback on a critical edge caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
