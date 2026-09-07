"""``learning.after_action_review`` vertical slice -- Method Atlas slice from the ``learning`` family (F17).

Builds a real ``AfterActionReviewRecord`` for a REAL, disclosed repo incident (not invented -- operator's
own memory note ``feedback_crosscheck_incident_runbooks``, 2026-08-18): a draft KS-6 host firewall plan
nearly repeated the exact UFW-only gap the 2026-04-20 crypto-mining intrusion runbook already documents
(Docker's own iptables chain executes before UFW's INPUT chain, silently bypassing UFW rules for any
published container port), caught before execution by cross-checking ``runbooks/*SECURITY*`` first.

Run::

    python -m ai_lego.apps.cli.run_after_action_review_slice
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
from ai_lego.modules.learning.after_action_review import (
    METHOD_ID,
    all_gates_pass,
    evaluate_after_action_review_gates,
    generate_after_action_review_record,
    next_action,
    why_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-AAR-SYNTHETIC-001"
EXECUTION_ID = "EX-AAR-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-AAR-001"

S = {
    "after_action_review_record": "ai-lego://specs/cognitive/typed-objects/after-action-review-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-after-action-review-slice"


def run_after_action_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real, disclosed repo incident (memory note feedback_crosscheck_incident_runbooks, 2026-08-18): a
    # draft KS-6 firewall plan nearly repeated the exact UFW-only gap the 2026-04-20 crypto-mining intrusion
    # runbook already documents. ---
    why_factors = [
        why_factor("WHY-1", "New infra plans were drafted before cross-checking runbooks/*SECURITY* for prior incidents covering the same host/service class"),
        why_factor("WHY-2", "Docker's own iptables chain executes before UFW's INPUT chain, silently bypassing UFW rules for any published container port -- an ordering most UFW documentation never calls out"),
    ]
    next_actions = [
        next_action("ACT-1", "Grep runbooks/*SECURITY* for the target host/service class before drafting any new infra plan, not after", "operator"),
        next_action("ACT-2", "Add a UFW-vs-Docker-chain-ordering check to the standard pre-provision checklist so this class of gap cannot recur silently", "devops_lead"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_after_action_review_record,
        "AAR-2026-09-07-001",
        "The new KS-6 host firewall plan would follow the existing UFW ruleset cleanly, no further cross-check needed.",
        "The draft plan reused the same UFW-only pattern that let the 2026-04-20 crypto-mining intrusion through -- caught before execution by cross-checking runbooks/*SECURITY* first.",
        why_factors,
        next_actions,
        make_provenance("DECISION", "HUMAN_APPROVED"),
        activity_ref="KS-6 firewall plan review, 2026-08-18 (memory note feedback_crosscheck_incident_runbooks)",
    )
    contracts.validate(S["after_action_review_record"], record, "after action review record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AfterActionReviewRecordGenerated", {"after_action_review_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_after_action_review_gates(record, "run_after_action_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"after action review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"AAR_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AfterActionReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")
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
        "after_action_review_record": record,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_reversal_criteria_slice.py)",
    }
    write_json(runtime / "results" / "after_action_review_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_after_action_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["after_action_review_record"]
    print(f"PASS learning.after_action_review: {len(record['why_factors'])} why_factors, {len(record['next_actions'])} next_actions, gates [{gate_summary}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
