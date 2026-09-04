"""``architecture.dependency_mapping`` vertical slice -- the seventeenth Method Atlas slice, sixth from the
`architecture` family.

Builds a real checkout-flow dependency map: a critical vendor dependency
(with a fallback) and a non-critical data dependency. Then demonstrates
the fallback invariant is real by attempting to mark an edge critical
with no fallback and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_dependency_mapping_slice
"""

from __future__ import annotations

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
from ai_lego.modules.architecture.dependency_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_dependency_map_gates,
    generate_dependency_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DEPMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-DEPMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DEPMAP-001"

S = {
    "dependency_map": "ai-lego://specs/cognitive/typed-objects/dependency-map.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-depmap-slice"


def run_dependency_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    nodes = [
        {"id": "N1", "node_type": "service", "label": "Checkout API"},
        {"id": "N2", "node_type": "vendor", "label": "第三方金流"},
        {"id": "N3", "node_type": "data", "label": "商品庫存快照"},
    ]
    edges = [
        {"from_id": "N1", "to_id": "N2", "is_critical": True, "fallback": "切換備援金流供應商，SLA 內完成"},
        {"from_id": "N1", "to_id": "N3", "is_critical": False},
    ]
    descriptor, dep_map = catalog.invoke(
        METHOD_ID,
        generate_dependency_map,
        "DEPMAP-2026-09-04-001",
        "訂單結帳流程",
        nodes,
        edges,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["dependency_map"], dep_map, "dependency map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DependencyMapGenerated", {"dependency_map": dep_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_dependency_map_gates(dep_map, "run_dependency_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"depmap gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DEPMAP_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DepmapGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the fallback invariant is real: attempt to mark an edge critical with no fallback. Must be refused. ---
    fallback_blocked = False
    try:
        generate_dependency_map(
            "DEPMAP-2026-09-04-002",
            "x",
            [{"id": "N1", "node_type": "service", "label": "x"}, {"id": "N2", "node_type": "vendor", "label": "x"}],
            [{"from_id": "N1", "to_id": "N2", "is_critical": True}],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        fallback_blocked = True
    if not fallback_blocked:
        raise InvariantViolation("DEPMAP_FALLBACK_GUARD_DID_NOT_FIRE: a critical edge with no fallback was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DepmapFallbackInvariantVerified", {"fallback_blocked": fallback_blocked}, 1.3)
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
        "dependency_map": dep_map,
        "gate_results": gate_results,
        "fallback_invariant_verification": {"fallback_blocked": fallback_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "depmap_slice_result.json", result)
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
        result = run_dependency_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    dep_map = result["dependency_map"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS architecture.dependency_mapping: nodes={len(dep_map['nodes'])}, edges={len(dep_map['edges'])}, gates [{gate_summary}], "
        f"fallback_invariant_verified={result['fallback_invariant_verification']['fallback_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
