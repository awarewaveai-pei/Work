"""``decision.eisenhower_matrix`` vertical slice -- decision family, added 2026-09-18 alongside
``divergent.reverse_brainstorming`` per direct operator request (see
``ai_lego/modules/decision/eisenhower_matrix.py``'s own module docstring). Primary template:
``run_impact_effort_slice.py`` (read in full first) -- same structural shape (2-axis quadrant
classification, genuine compute, no-automatic-authority guard).

Builds a real weekly task triage of 5 tasks on a shared 1-5 urgency/importance scale split at 3,
computed by ``ai_lego/compute/eisenhower_matrix/classification.py::classify_tasks`` (hand-verified
to land in all 4 quadrants -- do_first/schedule/delegate/eliminate -- before this CLI was written).
Then demonstrates the no-automatic-authority guard (contract ``forbidden_transition: ["Automatic
Authority"]``) is real the same way ``run_impact_effort_slice.py`` already proved it for its own
sibling method: attempts to smuggle an ``approved`` key onto a copy of a valid record and confirms
it is refused at both the runtime layer (``assert_no_automatic_authority_claim``) and the schema
layer (``additionalProperties: false``) independently.

Run::

    python -m ai_lego.apps.cli.run_eisenhower_matrix_slice
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
from ai_lego.modules.decision.eisenhower_matrix import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_eisenhower_matrix_gates,
    generate_eisenhower_matrix_classification,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EISENHOWER-SYNTHETIC-001"
EXECUTION_ID = "EX-EISENHOWER-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EISENHOWER-001"

S = {
    "eisenhower_matrix_classification": "ai-lego://specs/cognitive/typed-objects/eisenhower-matrix-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-eisenhower-matrix-slice"


def run_eisenhower_matrix_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real weekly task triage: 5 tasks on a shared 1-5 urgency/importance scale, split at 3 --
    # deliberately spans all 4 quadrants (2 land in do_first) so the demo shows real classification
    # spread, not a single trivial case. ---
    tasks = [
        {"id": "TASK-1", "label": "回覆客戶緊急工單", "urgency": 5, "importance": 5},
        {"id": "TASK-2", "label": "季度策略規劃", "urgency": 2, "importance": 5},
        {"id": "TASK-3", "label": "整理過期票根報帳", "urgency": 5, "importance": 1},
        {"id": "TASK-4", "label": "瀏覽競品部落格", "urgency": 1, "importance": 1},
        {"id": "TASK-5", "label": "修復生產環境告警", "urgency": 5, "importance": 4},
    ]
    urgency_scale = {"min": 1, "max": 5}
    importance_scale = {"min": 1, "max": 5}
    descriptor, classification = catalog.invoke(
        METHOD_ID,
        generate_eisenhower_matrix_classification,
        "EISENHOWER-2026-09-25-001",
        "本週任務分流",
        tasks,
        urgency_scale,
        importance_scale,
        3,
        3,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["eisenhower_matrix_classification"], classification, "eisenhower matrix classification")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EisenhowerMatrixClassificationGenerated", {"eisenhower_matrix_classification": classification, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_eisenhower_matrix_gates(classification, "run_eisenhower_matrix_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"eisenhower matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EISENHOWER_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EisenhowerMatrixGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the contract's own caution (forbidden_transition: ["Automatic Authority"]) is real:
    # attempt to smuggle an "approved" key onto a COPY of the record, at both layers. Neither
    # attempt may succeed. ---
    tampered = copy.deepcopy(classification)
    tampered["approved"] = True
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["eisenhower_matrix_classification"], tampered, "tampered classification (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"EISENHOWER_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "EisenhowerMatrixNoAutomaticAuthorityVerified",
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
        "eisenhower_matrix_classification": classification,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_impact_effort_slice.py)",
    }
    write_json(runtime / "results" / "eisenhower_matrix_slice_result.json", result)
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
        result = run_eisenhower_matrix_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    classification = result["eisenhower_matrix_classification"]
    quadrant_summary = ", ".join(f"{task['id']}={task['quadrant']}" for task in classification["tasks"])
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    print(
        f"PASS decision.eisenhower_matrix: quadrants=[{quadrant_summary}], gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
