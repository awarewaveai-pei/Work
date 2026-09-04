"""``learning.reversal_criteria`` vertical slice -- the eighth Method Atlas slice, first from the ``learning``
family (F17).

Builds a real ``ReversalCriteriaSet`` monitoring a synthetic pricing
decision: Atlas's own worked example (CAC > 300 USD for 3 consecutive
months -> re_review) transcribed directly, plus a second, deliberately
qualitative criterion with no structured rule. Then evaluates the
structured criterion against two different observation histories via
``ai_lego/compute/monitoring/triggers.py`` -- one that does NOT trigger
(a dip breaks the streak) and one that DOES -- to demonstrate the trigger
check is real comparison logic, not a constant.

Run::

    python -m ai_lego.apps.cli.run_reversal_criteria_slice
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
from ai_lego.modules.learning.reversal_criteria import (
    METHOD_ID,
    all_gates_pass,
    evaluate_criterion_trigger,
    evaluate_reversal_criteria_gates,
    generate_reversal_criteria_set,
    reversal_criterion,
    structured_rule,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-REVERSALCRITERIA-SYNTHETIC-001"
EXECUTION_ID = "EX-REVERSALCRITERIA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-REVERSALCRITERIA-001"

S = {
    "reversal_criteria_set": "ai-lego://specs/cognitive/typed-objects/reversal-criteria-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-reversal-criteria-slice"


def run_reversal_criteria_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Atlas's own worked example (SS11.33 L1980-1985), transcribed, plus a second qualitative criterion the
    # structured_rule mechanism deliberately does not cover. ---
    criteria = [
        reversal_criterion(
            "RCS-2026-09-04-001-C1",
            "CAC",
            "> 300 USD for 3 consecutive months",
            "re_review",
            "growth_lead",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            rule=structured_rule(">", 300, 3),
        ),
        reversal_criterion(
            "RCS-2026-09-04-001-C2",
            "platform escalation count",
            "two platform-team escalations within one quarter",
            "escalate_to_leadership_review",
            "product_lead",
            make_provenance("DECISION", "HUMAN_APPROVED"),
        ),
    ]
    descriptor, criteria_set = catalog.invoke(
        METHOD_ID,
        generate_reversal_criteria_set,
        "RCS-2026-09-04-001",
        "DEC-2026-09-04-001: raise subscription price 15%",
        criteria,
        make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    contracts.validate(S["reversal_criteria_set"], criteria_set, "reversal criteria set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReversalCriteriaSetGenerated", {"reversal_criteria_set": criteria_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_reversal_criteria_gates(criteria_set, "run_reversal_criteria_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"reversal criteria gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"REVERSALCRITERIA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReversalCriteriaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real trigger evaluation against two different observation histories: one that stays under the streak
    # requirement (a dip breaks it), one that genuinely crosses it. ---
    structured_criterion = criteria_set["criteria"][0]
    not_triggered = evaluate_criterion_trigger(structured_criterion, [250, 310, 290, 305])  # dip at month 2 breaks the streak
    triggered = evaluate_criterion_trigger(structured_criterion, [250, 310, 320, 305])  # last 3 all > 300
    qualitative_criterion = criteria_set["criteria"][1]
    not_evaluable = evaluate_criterion_trigger(qualitative_criterion, [1, 2, 3])  # no structured_rule -> None, never guessed
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ReversalCriteriaTriggerEvaluated",
        {"criterion_id": structured_criterion["id"], "not_triggered_case": not_triggered, "triggered_case": triggered, "qualitative_criterion_not_evaluable": not_evaluable},
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
        "reversal_criteria_set": criteria_set,
        "gate_results": gate_results,
        "trigger_evaluation": {"not_triggered_case": not_triggered, "triggered_case": triggered, "qualitative_criterion_not_evaluable": not_evaluable},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "reversal_criteria_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_reversal_criteria_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    te = result["trigger_evaluation"]
    print(f"PASS learning.reversal_criteria: 2 criteria, gates [{gate_summary}], trigger dip-case={te['not_triggered_case']}, trigger crossing-case={te['triggered_case']}, qualitative-criterion-evaluable={te['qualitative_criterion_not_evaluable']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
