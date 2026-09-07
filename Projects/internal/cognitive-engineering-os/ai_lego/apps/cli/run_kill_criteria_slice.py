"""``learning.kill_criteria`` vertical slice -- second Method Atlas slice from the ``learning`` family (F17),
immediately after ``learning.reversal_criteria``.

Builds a real ``KillCriteriaSet`` for an INVENTED-BUT-PLAUSIBLE scenario
(disclosed, not a real historical decision) grounded in this repo's own
recurring "multi-provider" theme (memory note
``project_multi_provider_provisioning``: the client hosting stack is not
locked to one provider; Hostinger/SiteGround/Cloudways are all live
options alongside the current Hetzner/OVH host): piloting a new client's
hosting on a non-Hetzner provider, with three independently-owned stop
thresholds covering all of Atlas's own L808 vocabulary at once (a max_loss
migration-cost cap, a max_time pilot-duration cap, a min_quality
post-migration uptime floor). Then evaluates ``evaluate_threshold_breach``
against a within-bounds and a crossed observation for each dimension, to
demonstrate the derived breach direction is real comparison logic, not a
constant.

Run::

    python -m ai_lego.apps.cli.run_kill_criteria_slice
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
from ai_lego.modules.learning.kill_criteria import (
    METHOD_ID,
    all_gates_pass,
    evaluate_kill_criteria_gates,
    evaluate_threshold_breach,
    generate_kill_criteria_set,
    kill_threshold,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-KILLCRITERIA-SYNTHETIC-001"
EXECUTION_ID = "EX-KILLCRITERIA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-KILLCRITERIA-001"

S = {
    "kill_criteria_set": "ai-lego://specs/cognitive/typed-objects/kill-criteria-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-kill-criteria-slice"


def run_kill_criteria_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Synthetic (invented-but-plausible, disclosed) hosting-pilot scenario, covering all three of Atlas's
    # own L808 dimensions at once: piloting a new client's hosting on a non-Hetzner provider (this repo's own
    # recurring multi-provider theme). ---
    thresholds = [
        kill_threshold(
            "KCS-2026-09-07-001-T1", "max_loss", 2000, "USD", "ops_lead",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            stop_action="終止試點，遷回 Hetzner 或維持原主機商",
        ),
        kill_threshold(
            "KCS-2026-09-07-001-T2", "max_time", 21, "days", "devops_lead",
            make_provenance("DECISION", "HUMAN_APPROVED"),
        ),
        kill_threshold(
            "KCS-2026-09-07-001-T3", "min_quality", 95, "uptime_score_pct", "client_success_lead",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            stop_action="判定新主機商不合格，中止試點",
        ),
    ]
    descriptor, criteria_set = catalog.invoke(
        METHOD_ID,
        generate_kill_criteria_set,
        "KCS-2026-09-07-001",
        "DEC-2026-09-07-002: 試點新客戶案使用替代主機商（非 Hetzner）",
        thresholds,
        make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    contracts.validate(S["kill_criteria_set"], criteria_set, "kill criteria set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KillCriteriaSetGenerated", {"kill_criteria_set": criteria_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_kill_criteria_gates(criteria_set, "run_kill_criteria_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"kill criteria gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"KILLCRITERIA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KillCriteriaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real breach evaluation: a within-bounds and a crossed observation per dimension, to demonstrate the
    # derived comparison direction is real logic, not a constant. ---
    loss_t, time_t, quality_t = criteria_set["thresholds"]
    breach_checks = {
        "max_loss_within_bounds": evaluate_threshold_breach(loss_t, 1500),
        "max_loss_breached": evaluate_threshold_breach(loss_t, 2500),
        "max_time_within_bounds": evaluate_threshold_breach(time_t, 14),
        "max_time_breached": evaluate_threshold_breach(time_t, 25),
        "min_quality_within_bounds": evaluate_threshold_breach(quality_t, 98),
        "min_quality_breached": evaluate_threshold_breach(quality_t, 90),
    }
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KillCriteriaBreachEvaluated", {"criteria_set_id": criteria_set["id"], "breach_checks": breach_checks}, 1.3)
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
        "kill_criteria_set": criteria_set,
        "gate_results": gate_results,
        "breach_evaluation": breach_checks,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_reversal_criteria_slice.py)",
    }
    write_json(runtime / "results" / "kill_criteria_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_kill_criteria_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    bc = result["breach_evaluation"]
    print(
        f"PASS learning.kill_criteria: 3 thresholds (max_loss/max_time/min_quality), gates [{gate_summary}], "
        f"breach checks: max_loss={bc['max_loss_within_bounds']}/{bc['max_loss_breached']}, "
        f"max_time={bc['max_time_within_bounds']}/{bc['max_time_breached']}, "
        f"min_quality={bc['min_quality_within_bounds']}/{bc['min_quality_breached']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
