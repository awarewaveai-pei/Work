"""``architecture.ddd`` vertical slice -- the ninth Method Atlas slice from the `architecture` family (real-world
method name "Domain-Driven Design").

Real-world-grounded scenario: this repository's own
``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/
REPOSITORY_ARCHITECTURE.md`` (ACCEPTED 2026-08-30) already ran a real
"Bounded Context Analysis" over the wider AI LEGO Cognitive Engineering OS
product's 23-object Domain Model (L11-48). That document's own two-layer
test literally uses the term "Shared Kernel" for the 17 objects shared by
3+ unrelated verticals (L17, L48), names Knowledge as a "schema in kernel,
engine independent" special case (L30, L48), and finds 5 objects (Dataset/
AnalysisPlan/AnalysisRun/Simulation/Experiment) naturally cluster into one
bounded context (L41-48). This slice models that same real conclusion as
a BoundedContextMap: 3 subdomains, 3 bounded contexts, 2 shared_kernel
context_map relationships (the pattern LABEL match is not a coincidence --
REPOSITORY_ARCHITECTURE.md itself already uses the words "Shared Kernel"
for exactly this relationship). The wider product scope this document
describes is DRAFT_PENDING_PHASE_4 (not yet built as ai_lego modules),
disclosed honestly -- this slice demonstrates the METHOD against a real,
already-written analysis, not a live runtime dependency.

Then demonstrates both real invariants are enforced by attempting (1) a
bounded_context with subdomain lineage pointing at a nonexistent
subdomain, and (2) a context_map relationship pointing at a nonexistent
bounded_context. Both must be refused.

Run::

    python -m ai_lego.apps.cli.run_ddd_slice
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
from ai_lego.modules.architecture.ddd import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ddd_gates,
    generate_bounded_context_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DDD-SYNTHETIC-001"
EXECUTION_ID = "EX-DDD-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DDD-001"

S = {
    "ddd": "ai-lego://specs/cognitive/typed-objects/bounded-context-map.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ddd-slice"


def run_ddd_slice(config: SliceConfig) -> dict[str, Any]:
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

    # REPOSITORY_ARCHITECTURE.md L22-48's own real Bounded Context Analysis conclusion, modeled as a
    # BoundedContextMap: Shared Kernel (17 objects, L17/L48), Knowledge (schema-in-kernel special case,
    # L30/L48), Data Science cluster (5 objects, L41-48).
    subdomains = [
        {"id": "SD-KERNEL", "label": "Shared Kernel (Tenant/Workspace/Project/... 17 objects, L17/L48)", "type": "generic"},
        {"id": "SD-KNOWLEDGE", "label": "Knowledge (schema-in-kernel, engine independent, L30/L48)", "type": "supporting"},
        {"id": "SD-DATASCIENCE", "label": "Data Science cluster (Dataset/AnalysisPlan/AnalysisRun/Simulation/Experiment, L41-48)", "type": "core"},
    ]
    bounded_contexts = [
        {"id": "BC-KERNEL", "label": "Shared Kernel Context", "subdomain_ids": ["SD-KERNEL"]},
        {"id": "BC-KNOWLEDGE", "label": "Knowledge Context", "subdomain_ids": ["SD-KNOWLEDGE"]},
        {"id": "BC-DATASCIENCE", "label": "Data Science Context", "subdomain_ids": ["SD-DATASCIENCE"]},
    ]
    context_map = [
        {"pattern": "shared_kernel", "from_context_id": "BC-KERNEL", "to_context_id": "BC-DATASCIENCE", "notes": "L17's own Shared Kernel test: read/written by 3+ unrelated verticals, single schema in /core/domain"},
        {"pattern": "shared_kernel", "from_context_id": "BC-KERNEL", "to_context_id": "BC-KNOWLEDGE", "notes": "Same Shared Kernel test applied to the Knowledge special case (L30)"},
    ]

    descriptor, model = catalog.invoke(
        METHOD_ID,
        generate_bounded_context_map,
        "BCM-2026-09-07-001",
        "AI LEGO Cognitive Engineering OS 的 23-object Domain Model（REPOSITORY_ARCHITECTURE.md L11-48 已核准的真實 Bounded Context Analysis 結論建模，Phase 4 前為 DRAFT_PENDING_PHASE_4，尚未落地為 ai_lego modules）",
        subdomains,
        make_provenance("HUMAN_OPINION", "AI_GENERATED"),
        bounded_contexts=bounded_contexts,
        context_map=context_map,
    )
    contracts.validate(S["ddd"], model, "bounded context map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BoundedContextMapGenerated", {"bounded_context_map": model, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ddd_gates(model, "run_ddd_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ddd gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DDD_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DddGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove BOTH real invariants are real. ---

    # (1) Subdomain lineage: a bounded_context referencing a subdomain id that does not exist. Must be refused.
    lineage_blocked = False
    try:
        generate_bounded_context_map(
            "BCM-2026-09-07-002",
            "x",
            [{"id": "SD1", "label": "x"}],
            make_provenance("HUMAN_OPINION", "AI_GENERATED"),
            bounded_contexts=[{"id": "BC1", "label": "x", "subdomain_ids": ["SD-GHOST"]}],
        )
    except InvariantViolation:
        lineage_blocked = True
    if not lineage_blocked:
        raise InvariantViolation("DDD_LINEAGE_GUARD_DID_NOT_FIRE: a bounded_context referencing a nonexistent subdomain was accepted")

    # (2) Context map integrity: a context_map relationship referencing a bounded_context id that does not exist.
    # Must be refused.
    context_map_blocked = False
    try:
        generate_bounded_context_map(
            "BCM-2026-09-07-003",
            "x",
            [{"id": "SD1", "label": "x"}],
            make_provenance("HUMAN_OPINION", "AI_GENERATED"),
            bounded_contexts=[{"id": "BC1", "label": "x", "subdomain_ids": ["SD1"]}],
            context_map=[{"pattern": "partnership", "from_context_id": "BC1", "to_context_id": "BC-GHOST"}],
        )
    except InvariantViolation:
        context_map_blocked = True
    if not context_map_blocked:
        raise InvariantViolation("DDD_CONTEXT_MAP_GUARD_DID_NOT_FIRE: a context_map entry referencing a nonexistent bounded_context was accepted")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "DddInvariantsVerified",
        {"subdomain_lineage_invariant_verified": lineage_blocked, "context_map_integrity_invariant_verified": context_map_blocked},
        1.3,
    )
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
        "bounded_context_map": model,
        "gate_results": gate_results,
        "invariant_verification": {"subdomain_lineage_invariant_verified": lineage_blocked, "context_map_integrity_invariant_verified": context_map_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "ddd_slice_result.json", result)
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
        result = run_ddd_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    model = result["bounded_context_map"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    verification = result["invariant_verification"]
    print(
        f"PASS architecture.ddd: subdomains={len(model['subdomains'])}, bounded_contexts={len(model['bounded_contexts'])}, context_map={len(model['context_map'])}, "
        f"gates [{gate_summary}], subdomain_lineage_invariant_verified={verification['subdomain_lineage_invariant_verified']}, "
        f"context_map_integrity_invariant_verified={verification['context_map_integrity_invariant_verified']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
