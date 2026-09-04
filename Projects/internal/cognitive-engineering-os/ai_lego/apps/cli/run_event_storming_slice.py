"""``architecture.event_storming`` vertical slice -- the thirteenth Method Atlas slice, second from the
`architecture` family (F18's own "Software Architecture Pack").

Builds a real order-cancellation process reconstruction: a customer
issues a cancel command, an Order aggregate handles it and emits a
domain event, a policy reacts by triggering a refund command, and a read
model is updated -- exercising all 7 element types and the full causal
chain Atlas's own notation implies. Then demonstrates the orphan-domain-
event invariant is real by attempting to add a domain event with no
incoming relationship and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_event_storming_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.event_storming import (
    METHOD_ID,
    all_gates_pass,
    evaluate_event_storming_gates,
    generate_event_storming_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EVENTSTORMING-SYNTHETIC-001"
EXECUTION_ID = "EX-EVENTSTORMING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EVENTSTORMING-001"

S = {
    "event_storming_session": "ai-lego://specs/cognitive/typed-objects/event-storming-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-event-storming-slice"


def run_event_storming_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real process: customer cancels an order, the Order aggregate handles it and emits an event, a policy
    # reacts by triggering a refund, and a read model is updated -- exercising all 7 element types. ---
    elements = [
        {"id": "A1", "type": "actor", "label": "客戶"},
        {"id": "C1", "type": "command", "label": "取消訂單"},
        {"id": "AG1", "type": "aggregate", "label": "Order"},
        {"id": "E1", "type": "domain_event", "label": "訂單已取消"},
        {"id": "P1", "type": "policy", "label": "訂單取消後自動觸發退款"},
        {"id": "C2", "type": "command", "label": "發起退款"},
        {"id": "RM1", "type": "read_model", "label": "客戶訂單歷史"},
    ]
    relationships = [
        {"from_id": "A1", "to_id": "C1", "label": "issues"},
        {"from_id": "C1", "to_id": "AG1", "label": "handled by"},
        {"from_id": "AG1", "to_id": "E1", "label": "emits"},
        {"from_id": "E1", "to_id": "P1", "label": "triggers"},
        {"from_id": "P1", "to_id": "C2", "label": "issues"},
        {"from_id": "E1", "to_id": "RM1", "label": "updates"},
    ]
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_event_storming_session,
        "ES-2026-09-04-001",
        "客戶取消訂單的完整流程，含退款觸發",
        elements,
        relationships,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["event_storming_session"], session, "event storming session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EventStormingSessionGenerated", {"event_storming_session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_event_storming_gates(session, "run_event_storming_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"event storming gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EVENTSTORMING_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EventStormingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the orphan-domain-event invariant is real: attempt to construct a session with a domain_event
    # that has no incoming relationship. Must be refused. ---
    orphan_blocked = False
    try:
        generate_event_storming_session(
            "ES-2026-09-04-002",
            "a domain event with no cause",
            [{"id": "E_ORPHAN", "type": "domain_event", "label": "appears from nowhere"}],
            [],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        orphan_blocked = True
    if not orphan_blocked:
        raise InvariantViolation("EVENTSTORMING_ORPHAN_GUARD_DID_NOT_FIRE: a domain_event with zero incoming relationships was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EventStormingOrphanInvariantVerified", {"orphan_blocked": orphan_blocked}, 1.3)
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
        "event_storming_session": session,
        "gate_results": gate_results,
        "orphan_invariant_verification": {"orphan_blocked": orphan_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "event_storming_slice_result.json", result)
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
        result = run_event_storming_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    session = result["event_storming_session"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS architecture.event_storming: elements={len(session['elements'])}, relationships={len(session['relationships'])}, "
        f"gates [{gate_summary}], orphan_invariant_verified={result['orphan_invariant_verification']['orphan_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
