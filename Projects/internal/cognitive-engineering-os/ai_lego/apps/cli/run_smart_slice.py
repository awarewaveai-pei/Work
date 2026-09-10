"""``framing.smart`` vertical slice -- Method Atlas slice for the F01 framing family's SMART criteria
checklist (Atlas F01 table row L335 + dedicated §12.4 section L2584-2589).

Scenario: this batch's own task -- refining "build framing.smart" into 5 justified SMART criteria.
Self-referential and disclosed as such rather than an invented external narrative, matching this
session's own lean-doc restraint.

Demonstrates BOTH real invariants twice each: a construction-time PASS (a complete, well-formed
record), a construction-time REFUSAL (a deliberately malformed TIME_BOUND date), and a gate-only catch
of a hand-tampered valid record that bypassed the builder entirely -- the same "show a real refusal,
not only a real success" discipline root_cause.kepner_tregoe's own CLI demo already establishes.

Run::

    python -m ai_lego.apps.cli.run_smart_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.smart import (
    METHOD_ID,
    all_gates_pass,
    criterion_entry,
    evaluate_smart_gates,
    generate_smart_goal_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SMART-SYNTHETIC-001"
EXECUTION_ID = "EX-SMART-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SMART-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "smart_goal_record": "ai-lego://specs/cognitive/typed-objects/smart-goal-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-smart-slice"


def _valid_criteria() -> list[dict[str, Any]]:
    # SPECIFIC/MEASURABLE/TIME_BOUND are forward-looking commitments (this task's own scope, acceptance
    # bar, deadline) -- HYPOTHESIS/AI_SUGGESTED, no supporting_evidence_refs needed (the evidence_labeling
    # gate only requires refs for EVIDENCE-labeled entries). ACHIEVABLE/RELEVANT cite facts this same
    # session directly grep-verified (contract-backlog.yaml's own ordinal count, method-inventory.yaml's
    # own F01 rows) -- EVIDENCE, with real refs into the two evidence records built below.
    return [
        criterion_entry("SPECIFIC", "明確產出 framing.smart 的 contract/schema/module/CLI/test 五個檔案", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        criterion_entry("MEASURABLE", "5 個檔案全部存在、測試全綠、CLI 兩個 PASS 案例皆驗證通過", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        criterion_entry(
            "ACHIEVABLE", "已有 76 個既有切片可直接複製結構樣板，非從零設計", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"]
        ),
        criterion_entry(
            "RELEVANT", "F01 框定家族目前 0/11 有合約，是本批次唯一新開的認知方法家族", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-2"]
        ),
        criterion_entry("TIME_BOUND", "在指定截止日前完成並通過驗證", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), target_date="2026-12-31"),
    ]


def run_smart_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the ACHIEVABLE/RELEVANT criteria cite -- both facts this same session directly
    # grep-verified (not invented): contract-backlog.yaml's own ordinal count, method-inventory.yaml's F01 rows. ---
    slice_count_evidence = evidence_record(
        "E-1", "methods/registry/contract-backlog.yaml tier_1 has 76 concrete entries (seventysixth_concrete_entry) at task start", "grep -n \"_concrete_entry:\" contract-backlog.yaml", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    f01_gap_evidence = evidence_record(
        "E-2", "method-inventory.yaml's 11 F01 rows (L206-260) all carry has_contract: false at task start", "Read method-inventory.yaml L195-261", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    contracts.validate(S["evidence"], slice_count_evidence, "evidence E-1")
    contracts.validate(S["evidence"], f01_gap_evidence, "evidence E-2")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [slice_count_evidence, f01_gap_evidence]}, 0.5)

    # --- Step 2: the complete, well-formed record -- both invariants satisfied. ---
    record = generate_smart_goal_record(
        "SMART-2026-09-08-001",
        "在 2026 Q4 結束前，為 F01 框定家族的 SMART 方法建立完整合約/schema/gate/CLI/test 五件套",
        _valid_criteria(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["smart_goal_record"], record, "smart goal record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmartGoalRecordGenerated", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_smart_gates(record, "run_smart_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"smart gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SMART_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the invariant is not toothless -- a deliberately malformed TIME_BOUND date
    # (calendrically impossible, February has no 30th) MUST be refused before any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    malformed_criteria = _valid_criteria()
    malformed_criteria[4] = criterion_entry("TIME_BOUND", "截止日不存在", make_provenance("EVIDENCE", "HUMAN_APPROVED"), target_date="2026-02-30")
    try:
        generate_smart_goal_record("SMART-REFUSED-001", "goal", malformed_criteria, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "SMART_INVALID_TARGET_DATE" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "SMART_INVALID_TARGET_DATE"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SMART_INVARIANT_NOT_ENFORCED: the calendrically-invalid target_date was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the gate catches a corrupted record even when a caller bypasses
    # the builder entirely (blank out MEASURABLE's justification directly on a raw copy). ---
    tampered = dict(record)
    tampered["criteria"] = [dict(c) for c in record["criteria"]]
    tampered["criteria"][1]["justification"] = "   "  # whitespace-only -- the builder would have refused this
    tampered_gate = evaluate_smart_gates(tampered, "run_smart_slice", clock.at(1.6))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SMART_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered blank justification")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 1.7)
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
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_kepner_tregoe_slice.py)",
    }
    write_json(runtime / "results" / "smart_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_smart_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.smart: SmartGoalRecord {result['record']['id']} built with "
        f"{len(result['record']['criteria'])}/5 criteria, {len(result['gate_results'])} gates all PASS; "
        f"invalid TIME_BOUND date invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"blank-justification invariant caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
