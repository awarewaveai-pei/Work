"""``learning.post_mortem`` vertical slice -- F17 learning family, 4th concrete entry after
reversal_criteria/kill_criteria/decision_journal.

Builds a real ``PostMortemRecord`` grounded in this repo's own real, currently-enforced rule (AGENTS.md R0:
"git log -10 before every Edit", memory note ``feedback_git_log_before_edit.md``, real 2026-05-22 14:38
incident date) -- specific sub-timestamps/wording are disclosed-invented, not a verbatim historical
transcript (same "grounded theme, disclosed invented specifics" convention every prior CLI slice in this
package uses). Demonstrates: a 4-event timeline, two causes (one with an optional source_analysis_ref soft
link to an illustrative prior BarrierAnalysisRecord id, one without), and two owned preventive actions --
one of which (the git-log-injector.js mechanical gate) is this repo's own REAL subsequent fix.

Run::

    python -m ai_lego.apps.cli.run_post_mortem_slice
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
from ai_lego.modules.learning.post_mortem import (
    METHOD_ID,
    action,
    all_gates_pass,
    cause,
    evaluate_post_mortem_gates,
    generate_post_mortem_record,
    timeline_event,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-POSTMORTEM-SYNTHETIC-001"
EXECUTION_ID = "EX-POSTMORTEM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-POSTMORTEM-001"

S = {
    "post_mortem_record": "ai-lego://specs/cognitive/typed-objects/post-mortem-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-post-mortem-slice"


def run_post_mortem_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real-theme, disclosed-invented-specifics incident (see module docstring). ---
    timeline = [
        timeline_event("T-001", "2026-05-22T14:38:00+08:00", "Session A begins editing agency-os/WORKLOG.md without first running git log --oneline -10"),
        timeline_event("T-002", "2026-05-22T14:41:00+08:00", "Concurrent Session B had already pushed a commit touching the same file minutes earlier"),
        timeline_event("T-003", "2026-05-22T14:52:00+08:00", "Session A's push rejected; merge conflict discovered, manual reconciliation required"),
        timeline_event("T-004", "2026-05-22T15:10:00+08:00", "Rework complete"),
    ]
    causes = [
        cause("C-001", "No pre-Edit git log check, so a concurrent session's already-pushed commit to the same file went unseen", "T-001"),
        cause(
            "C-002", "No mechanical enforcement existed yet to block an Edit before a git log check", "T-002",
            source_analysis_ref="BARRIER-2026-05-22-001",  # illustrative soft link, existence not verified -- see contract OQ-POSTMORTEM-2
        ),
    ]
    actions = [
        action("A-001", "Codify 'git log --oneline -10 before every Edit' as a standing AGENTS.md R0 rule", "operator"),
        action("A-002", "Add git-log-injector.js mechanical gate blocking the first Edit until git log has been shown", "operator"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_post_mortem_record,
        "POSTMORTEM-2026-05-22-001",
        "2026-05-22 concurrent-session rework incident (git log not checked before Edit)",
        timeline,
        "~30 minutes of duplicated edit plus manual conflict reconciliation on one file; no data loss.",
        causes,
        actions,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["post_mortem_record"], record, "post-mortem record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PostMortemRecordGenerated", {"post_mortem_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_post_mortem_gates(record, "run_post_mortem_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"post-mortem gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"POSTMORTEM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PostMortemGatesEvaluated", {"gate_results": gate_results}, 1.2)
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
        "post_mortem_record": record,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_kill_criteria_slice.py)",
    }
    write_json(runtime / "results" / "post_mortem_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_post_mortem_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["post_mortem_record"]
    print(
        f"PASS learning.post_mortem: {len(record['timeline'])} timeline events, {len(record['causes'])} causes, "
        f"{len(record['actions'])} owned actions, gates [{gate_summary}]"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
