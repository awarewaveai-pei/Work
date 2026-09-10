"""``framing.success_criteria`` vertical slice -- Method Atlas slice for the F01 framing family's "Success
Criteria" tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:338 -- the
method's only citation).

Scenario (grounded, disclosed honestly, self-referential): this run's own SuccessCriteriaRecord IS this
slice's own real task brief, restated in the method's 4-category shape -- not a synthetic Cascadia scenario.
The Must/Should/Guardrail/Stop criteria below are the literal terms this session was given for building
``framing.success_criteria`` itself (operator task brief, this session, 2026-09-10). Disclosed as
self-referential rather than presented as an independent example, same honesty discipline every sibling
slice in this family already applies to its own scenario grounding.

Question this run answers: does a method whose record holds FOUR fixed category arrays (unlike
framing.goal_statement's 5 flat scalar/list fields, unlike learning.kill_criteria's single closed-3-enum
threshold set) assemble against the same shared LEGO framework with zero changes to any of it? Every import
below except ``ai_lego.modules.framing.success_criteria`` itself is unchanged, reused code.

This run demonstrates BOTH real invariants twice each: once as a construction-time PASS (a complete,
well-formed record), and once as a construction-time REFUSAL (a deliberately malformed attempt), proving
neither invariant is toothless -- same "show a real refusal, not only a real success" discipline
``framing.goal_statement``'s own CLI demo already establishes. A final step then hand-tampers a VALID record
directly (bypassing the builder) to prove the independent gate, not just the builder, catches the same
defect.

Run::

    python -m ai_lego.apps.cli.run_success_criteria_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.success_criteria import (
    METHOD_ID,
    all_gates_pass,
    evaluate_success_criteria_gates,
    generate_success_criteria_record,
    success_criterion,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SUCCESSCRITERIA-SYNTHETIC-001"
EXECUTION_ID = "EX-SUCCESSCRITERIA-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SUCCESSCRITERIA-001"

S = {
    "success_criteria": "ai-lego://specs/cognitive/typed-objects/success-criteria-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-success-criteria-slice"


def run_success_criteria_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.success_criteria resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both invariants satisfied. Self-referential scenario,
    # see module docstring: this IS this slice's own real task brief. ---
    provenance = make_provenance("EVIDENCE", "HUMAN_APPROVED")
    record = generate_success_criteria_record(
        "SC-2026-09-10-001",
        "DEC-2026-09-10-001: 建置 framing.success_criteria（F01 第 4 個成員）",
        [
            success_criterion("SC-2026-09-10-001-M1", "contract、schema、gate、CLI demo、測試五個檔案齊備且 unittest 全綠", provenance),
            success_criterion("SC-2026-09-10-001-M2", "兩個真實不變量（EMPTY_MUST、DUPLICATE_CRITERION_ID）各自的 InvariantViolation 拒絕都証實", provenance),
        ],
        [
            success_criterion("SC-2026-09-10-001-S1", "與另外 5 個並行 agent 建置的 F01 成員零檔案重疊", provenance),
        ],
        [
            success_criterion("SC-2026-09-10-001-G1", "不得修改 contract-backlog.yaml / method-inventory.yaml（留給整合階段）", provenance),
        ],
        [
            success_criterion("SC-2026-09-10-001-T1", "若獨立 gate 未能攔截手動竄改的記錄，本次切片視為失敗並中止", provenance),
        ],
        provenance,
        reversal_criteria_ref="RCS-2026-09-04-001",
    )
    contracts.validate(S["success_criteria"], record, "success criteria record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SuccessCriteriaRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_success_criteria_gates(record, "run_success_criteria_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"success_criteria gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SUCCESSCRITERIA_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof Invariant #1 is not toothless -- an empty must list MUST be refused before any
    # record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_success_criteria_record(
            "SC-REFUSED-001",
            "同上",
            [],  # empty must -- a success-criteria record with zero non-negotiable items commits to nothing
            [],
            [],
            [],
            provenance,
        )
    except InvariantViolation as error:
        if "SUCCESSCRITERIA_EMPTY_MUST" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "SUCCESSCRITERIA_EMPTY_MUST"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SUCCESSCRITERIA_INVARIANT_NOT_ENFORCED: an empty must list was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof Invariant #2 is not toothless -- a duplicate criterion id reused across two
    # different categories MUST be refused. ---
    duplicate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_success_criteria_record(
            "SC-DUP-REFUSED-001",
            "同上",
            [success_criterion("SC-DUP-001", "must 條件", provenance)],
            [success_criterion("SC-DUP-001", "should 條件，id 跟 must 的重複", provenance)],  # duplicate id, different category
            [],
            [],
            provenance,
        )
    except InvariantViolation as error:
        if "SUCCESSCRITERIA_DUPLICATE_CRITERION_ID" not in str(error):
            raise
        duplicate_refusal_proof["raised"] = True
        duplicate_refusal_proof["error_code"] = "SUCCESSCRITERIA_DUPLICATE_CRITERION_ID"
    if not duplicate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SUCCESSCRITERIA_INVARIANT_NOT_ENFORCED: a cross-category duplicate id was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DuplicateIdRecordRefused", {"duplicate_refusal_proof": duplicate_refusal_proof}, 1.7)
    milestones.append("DUPLICATE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["must"] = []  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_success_criteria_gates(tampered, "run_success_criteria_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SUCCESSCRITERIA_GATE_NOT_INDEPENDENT: the independent must_category_coverage gate did NOT catch a hand-tampered empty must list")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "duplicate_refusal_proof": duplicate_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_goal_statement_slice.py)",
    }
    write_json(runtime / "results" / "success_criteria_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_success_criteria_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    must_count = len(result["record"]["must"])
    total_count = sum(len(result["record"][c]) for c in ("must", "should", "guardrail", "stop"))
    print(
        f"PASS framing.success_criteria: SuccessCriteriaRecord {result['record']['id']} built with "
        f"{must_count} must / {total_count} total criteria across 4 categories, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_MUST invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"DUPLICATE_CRITERION_ID invariant REFUSED a cross-category duplicate ({result['duplicate_refusal_proof']['error_code']}); "
        f"empty-must tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
