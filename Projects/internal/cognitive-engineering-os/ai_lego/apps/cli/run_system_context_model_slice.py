"""``architecture.system_context_model`` vertical slice -- the sixteenth Method Atlas slice, fifth from the
`architecture` family (real-world method name "C4 Model").

Builds a real 3-level model (system context, 1 container, 1 component
inside it, no code level -- exercising Atlas's own explicit optional
qualifier on the Code level). Then demonstrates the hierarchy-integrity
invariant is real by attempting to construct a component referencing a
nonexistent container and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_system_context_model_slice
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
from ai_lego.modules.architecture.system_context_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_system_context_model_gates,
    generate_system_context_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SCM-SYNTHETIC-001"
EXECUTION_ID = "EX-SCM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SCM-001"

S = {
    "scm": "ai-lego://specs/cognitive/typed-objects/system-context-model.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-scm-slice"


def run_system_context_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    containers = [{"id": "CT1", "label": "Order API"}]
    components = [{"id": "CP1", "container_id": "CT1", "label": "OrderController"}]
    descriptor, model = catalog.invoke(
        METHOD_ID,
        generate_system_context_model,
        "SCM-2026-09-04-001",
        "訂單服務，外部使用者透過網頁下單，串接第三方金流",
        containers,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
        components=components,
    )
    contracts.validate(S["scm"], model, "system context model")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SystemContextModelGenerated", {"system_context_model": model, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_system_context_model_gates(model, "run_system_context_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"scm gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ScmGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the hierarchy-integrity invariant is real: attempt to build a component referencing a
    # nonexistent container. Must be refused. ---
    integrity_blocked = False
    try:
        generate_system_context_model(
            "SCM-2026-09-04-002",
            "x",
            [{"id": "CT1", "label": "x"}],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            components=[{"id": "CP1", "container_id": "GHOST", "label": "x"}],
        )
    except InvariantViolation:
        integrity_blocked = True
    if not integrity_blocked:
        raise InvariantViolation("SCM_INTEGRITY_GUARD_DID_NOT_FIRE: a component referencing a nonexistent container was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ScmHierarchyIntegrityVerified", {"integrity_blocked": integrity_blocked}, 1.3)
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
        "system_context_model": model,
        "gate_results": gate_results,
        "integrity_verification": {"integrity_blocked": integrity_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "scm_slice_result.json", result)
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
        result = run_system_context_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    model = result["system_context_model"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS architecture.system_context_model: containers={len(model['containers'])}, components={len(model['components'])}, code={len(model['code'])}, "
        f"gates [{gate_summary}], integrity_invariant_verified={result['integrity_verification']['integrity_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
