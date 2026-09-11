"""``stakeholders.raci`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member (F07 had
zero built methods before this batch; 1 of 10 concurrent agents opening F07 in this same parallel batch).

Scenario: a 2-task RACI matrix for a small product launch, with one task showing a genuine RACI real-world
pattern (a single person holding BOTH Responsible and Accountable on the same task -- legitimate, not a
defect), same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``RaciMatrix``
satisfying every real invariant, then demonstrates each of the 2 core counting invariants once as a
construction-time REFUSAL (2 Accountable on one task; 0 Responsible on another), proving neither is toothless,
same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo already
establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent
gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_raci_slice
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
from ai_lego.modules.stakeholders.raci import (
    METHOD_ID,
    all_gates_pass,
    evaluate_raci_gates,
    generate_raci_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RACI-SYNTHETIC-001"
EXECUTION_ID = "EX-RACI-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RACI-001"

S = {
    "raci_matrix": "ai-lego://specs/cognitive/typed-objects/stakeholder-raci.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-raci-slice"


def _well_formed_tasks() -> list[dict[str, Any]]:
    return [
        {
            "task_name": "撰寫發佈公告文案",
            "assignments": [
                {"stakeholder_name": "行銷經理", "role": "A"},
                {"stakeholder_name": "文案編輯", "role": "R"},
                {"stakeholder_name": "產品負責人", "role": "C"},
                {"stakeholder_name": "客服團隊", "role": "I"},
            ],
        },
        {
            "task_name": "核准最終定價",
            "assignments": [
                {"stakeholder_name": "產品負責人", "role": "R"},
                {"stakeholder_name": "產品負責人", "role": "A"},
                {"stakeholder_name": "財務長", "role": "C"},
            ],
        },
    ]


def run_raci_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.raci resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed matrix -- every real invariant satisfied (including one task where
    # a single stakeholder legitimately holds both R and A), invoked through the catalog's own per-invocation
    # gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_raci_matrix,
        "SRACI-2026-09-11-001",
        tasks=_well_formed_tasks(),
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    contracts.validate(S["raci_matrix"], matrix, "raci matrix")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RaciMatrixGenerated", {"matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_raci_gates(matrix, "run_raci_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.raci gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("RACI_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 3 (exactly 1 Accountable) is not toothless -- 2 Accountable on one task MUST
    # be refused before any record is constructed. ---
    two_accountable_tasks = [
        {
            "task_name": "核准最終定價",
            "assignments": [
                {"stakeholder_name": "產品負責人", "role": "A"},
                {"stakeholder_name": "財務長", "role": "A"},
                {"stakeholder_name": "業務代表", "role": "R"},
            ],
        }
    ]
    two_accountable_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_raci_matrix("SRACI-TWO-ACCOUNTABLE-REFUSED-001", two_accountable_tasks, make_provenance("DECISION", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE" not in str(error):
            raise
        two_accountable_refusal_proof["raised"] = True
        two_accountable_refusal_proof["error_code"] = "RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE"
    if not two_accountable_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RACI_INVARIANT_NOT_ENFORCED: 2 Accountable assignments on one task were NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TwoAccountableRefused", {"refusal_proof": two_accountable_refusal_proof}, 1.3)
    milestones.append("TWO_ACCOUNTABLE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 4 (at least 1 Responsible) is not toothless -- 0 Responsible on a task MUST
    # be refused before any record is constructed. ---
    zero_responsible_tasks = [
        {
            "task_name": "核准最終定價",
            "assignments": [
                {"stakeholder_name": "產品負責人", "role": "A"},
                {"stakeholder_name": "財務長", "role": "C"},
            ],
        }
    ]
    zero_responsible_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_raci_matrix("SRACI-ZERO-RESPONSIBLE-REFUSED-001", zero_responsible_tasks, make_provenance("DECISION", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "RACI_TASK_MISSING_RESPONSIBLE" not in str(error):
            raise
        zero_responsible_refusal_proof["raised"] = True
        zero_responsible_refusal_proof["error_code"] = "RACI_TASK_MISSING_RESPONSIBLE"
    if not zero_responsible_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RACI_INVARIANT_NOT_ENFORCED: zero Responsible assignments on a task were NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZeroResponsibleRefused", {"refusal_proof": zero_responsible_refusal_proof}, 1.5)
    milestones.append("ZERO_RESPONSIBLE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a 2nd Accountable directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = {**matrix, "tasks": [dict(task) for task in matrix["tasks"]]}
    tampered["tasks"][0] = {**tampered["tasks"][0], "assignments": [*tampered["tasks"][0]["assignments"], {"stakeholder_name": "額外插入的第二個 Accountable", "role": "A"}]}
    tampered_gate = evaluate_raci_gates(tampered, "run_raci_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("RACI_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered 2nd Accountable")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "matrix": matrix,
        "gate_results": gate_results,
        "two_accountable_refusal_proof": two_accountable_refusal_proof,
        "zero_responsible_refusal_proof": zero_responsible_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "raci_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_raci_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.raci: RaciMatrix {result['matrix']['id']} built, gates [{gate_summary}]; "
        f"RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE/RACI_TASK_MISSING_RESPONSIBLE invariants each REFUSED a malformed attempt "
        f"({result['two_accountable_refusal_proof']['error_code']}, {result['zero_responsible_refusal_proof']['error_code']}); "
        f"hand-tampered 2nd Accountable caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
