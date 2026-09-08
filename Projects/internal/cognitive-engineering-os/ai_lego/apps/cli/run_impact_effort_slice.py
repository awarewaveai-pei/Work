"""``decision.impact_effort`` vertical slice -- Method Atlas slice, third member of the ``decision`` family
(F16), after ``decision.ahp`` and ``decision.mcda``.

Builds a real Q4 backlog triage of 5 ideas on a shared 1-5 impact/effort scale split at 3, computed by
``ai_lego/compute/impact_effort/classification.py::classify_ideas`` (hand-verified to land in 3 different
quadrants -- quick_wins/major_projects/fill_ins/avoid_reconsider -- before this CLI was written). Then
demonstrates the no-automatic-authority guard (Atlas §11.30 L1905-1906) is real the same way
``run_mcda_slice.py`` already proved it for a sibling method: attempts to smuggle an ``approved`` key onto a
copy of a valid record and confirms it is refused at both the runtime layer and the schema layer
independently.

Run::

    python -m ai_lego.apps.cli.run_impact_effort_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.impact_effort import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_impact_effort_gates,
    generate_impact_effort_classification,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-IMPACTEFFORT-SYNTHETIC-001"
EXECUTION_ID = "EX-IMPACTEFFORT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-IMPACTEFFORT-001"

S = {
    "impact_effort_classification": "ai-lego://specs/cognitive/typed-objects/impact-effort-classification.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-impact-effort-slice"


def run_impact_effort_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real Q4 backlog triage: 5 ideas on a shared 1-5 impact/effort scale, split at 3 -- Atlas §11.30's
    # own "大量 ideas 的第一輪快速篩選" (first-round quick screening of many ideas). Deliberately spans 3 of
    # the 4 quadrants (2 land in major_projects) so the demo shows real classification spread, not a single
    # trivial case. ---
    ideas = [
        {"id": "IDEA-1", "label": "自助密碼重設", "impact": 5, "effort": 2},
        {"id": "IDEA-2", "label": "SSO 整合", "impact": 5, "effort": 5},
        {"id": "IDEA-3", "label": "登入頁換色", "impact": 1, "effort": 1},
        {"id": "IDEA-4", "label": "客製舊版報表匯出格式", "impact": 2, "effort": 5},
        {"id": "IDEA-5", "label": "行動裝置推播通知", "impact": 4, "effort": 3},
    ]
    impact_scale = {"min": 1, "max": 5}
    effort_scale = {"min": 1, "max": 5}
    descriptor, classification = catalog.invoke(
        METHOD_ID,
        generate_impact_effort_classification,
        "IMPACTEFFORT-2026-09-08-001",
        "Q4 backlog 初篩",
        ideas,
        impact_scale,
        effort_scale,
        3,
        3,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["impact_effort_classification"], classification, "impact effort classification")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ImpactEffortClassificationGenerated", {"impact_effort_classification": classification, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_impact_effort_gates(classification, "run_impact_effort_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"impact effort gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"IMPACTEFFORT_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ImpactEffortGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove Atlas §11.30's own caution (L1905-1906) is real: attempt to smuggle an "approved" key onto a
    # COPY of the record, at both layers. Neither attempt may succeed. ---
    tampered = copy.deepcopy(classification)
    tampered["approved"] = True
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["impact_effort_classification"], tampered, "tampered classification (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"IMPACTEFFORT_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ImpactEffortNoAutomaticAuthorityVerified",
        {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
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
        "impact_effort_classification": classification,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "impact_effort_slice_result.json", result)
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
        result = run_impact_effort_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    classification = result["impact_effort_classification"]
    quadrant_summary = ", ".join(f"{idea['id']}={idea['quadrant']}" for idea in classification["ideas"])
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    print(
        f"PASS decision.impact_effort: quadrants=[{quadrant_summary}], gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
