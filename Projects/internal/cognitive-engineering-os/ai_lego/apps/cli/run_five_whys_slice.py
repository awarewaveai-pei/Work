"""``root_cause.five_whys`` vertical slice -- the fourth Method Atlas slice, and the first to complete the FULL
``ProblemStatement -> Fishbone -> CauseHypothesisSet -> Validation -> RootCauseFact`` chain for real.

``run_fishbone_slice.py`` (the second slice, 2026-09-04) proved the
forbidden-transition guard blocks a direct promotion attempt, then stopped
-- honestly, because no validation method had a contract yet
(root_cause.fishbone.contract.yaml OQ-FISHBONE-1). This slice builds that
missing method (``root_cause.five_whys``, Atlas §11.5) and reuses fishbone's
OWN promotion functions (``record_validation_applied`` /
``attempt_promote_to_root_cause_fact``) UNCHANGED to actually complete the
chain: a real ``RootCauseFact`` is constructed and validated against its
schema, for the first time in this codebase's history, not just proven
possible in a unit test with a synthetic method-name string.

Everything upstream of Five Whys (``MethodCatalog``, ``SchemaContracts``,
``EventLedger``, ``PiiLedgerGuard``, ``provenance.py``, AND the fishbone
module's own builders/promotion functions) is reused with zero changes --
the fourth data point for "does the LEGO framework compose", and the first
one that composes two DIFFERENT method modules into a single real chain
rather than exercising one method in isolation.

Run::

    python -m ai_lego.apps.cli.run_five_whys_slice
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
from ai_lego.modules.root_cause.fishbone import (
    METHOD_ID as FISHBONE_METHOD_ID,
)
from ai_lego.modules.root_cause.fishbone import (
    attempt_promote_to_root_cause_fact,
    build_problem_statement,
    cause_hypothesis,
    evaluate_fishbone_gates,
    generate_cause_hypothesis_set,
    record_validation_applied,
)
from ai_lego.modules.root_cause.fishbone import all_gates_pass as fishbone_gates_pass
from ai_lego.modules.root_cause.five_whys import (
    METHOD_ID as FIVE_WHYS_METHOD_ID,
)
from ai_lego.modules.root_cause.five_whys import (
    evaluate_five_whys_gates,
    generate_five_whys_validation,
    why_chain_step,
)
from ai_lego.modules.root_cause.five_whys import all_gates_pass as five_whys_gates_pass
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FIVEWHYS-SYNTHETIC-001"
EXECUTION_ID = "EX-FIVEWHYS-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-FIVEWHYS-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "cause_hypothesis_set": "ai-lego://specs/cognitive/typed-objects/cause-hypothesis-set.schema.yaml",
    "five_whys_validation": "ai-lego://specs/cognitive/typed-objects/five-whys-validation.schema.yaml",
    "root_cause_fact": "ai-lego://specs/cognitive/typed-objects/root-cause-fact.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-five-whys-slice"


def run_five_whys_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution for BOTH methods this slice composes, through the unmodified shared resolver. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([FISHBONE_METHOD_ID, FIVE_WHYS_METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: ProblemStatement + CauseHypothesisSet, exactly as run_fishbone_slice.py builds them -- same
    # synthetic Cascadia scenario, same builder functions, zero duplication. ---
    problem_statement = build_problem_statement(
        "PROB-FIVEWHYS-2026-09-04-001",
        {
            "current_state": "Cascadia 客服團隊本季離職率上升至 22%",
            "expected_state": "離職率維持在 8% 基準線",
            "gap": "14 個百分點的異常上升,起始於兩個月前的排班系統更換",
            "affected_stakeholders": ["Customer Support", "People Ops", "Finance"],
            "impact": "招募與訓練成本預估上升 30%;團隊士氣下降",
            "evidence": ["exit_interview_summary_2026-08.csv", "shift_scheduling_change_log.csv"],
            "constraints": ["不可暫停客服排班做實驗"],
            "scope_non_goals": "只涵蓋客服團隊;業務團隊離職率另案處理",
        },
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        origin_method="problem_framing.problem_statement",
    )
    contracts.validate(S["problem_statement"], problem_statement, "problem statement")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProblemStatementValidated", {"problem_statement": problem_statement}, 1)

    hypotheses = [
        cause_hypothesis(
            "CHS-FIVEWHYS-001-H1",
            "新排班系統造成連續夜班增加,員工疲勞累積",
            "Process",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["shift_scheduling_change_log.csv"],
        ),
        cause_hypothesis(
            "CHS-FIVEWHYS-001-H2",
            "新系統上線後缺乏在職培訓,客服代表操作出錯率上升",
            "Process",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]
    descriptor, cause_hypothesis_set = catalog.invoke(FISHBONE_METHOD_ID, generate_cause_hypothesis_set, "CHS-FIVEWHYS-2026-09-04-001", problem_statement, hypotheses)
    contracts.validate(S["cause_hypothesis_set"], cause_hypothesis_set, "cause hypothesis set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CauseHypothesisSetGenerated", {"cause_hypothesis_set": cause_hypothesis_set, "method_descriptor": descriptor}, 2)

    fishbone_gate_results = evaluate_fishbone_gates(cause_hypothesis_set, "run_five_whys_slice", clock.at(2.1))
    for gate in fishbone_gate_results:
        contracts.validate(S["gate_result"], gate, f"fishbone gate {gate['gate_id']}")
    if not fishbone_gates_pass(fishbone_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FISHBONE_GATE_FAILED before Five Whys could run")
    milestones.append("CAUSE_HYPOTHESIS_SET_READY")

    # --- Step 2: root_cause.five_whys drills into hypothesis H1 (the one with real supporting evidence already
    # attached), producing a genuine why_chain, not a synthetic placeholder. supporting_evidence_refs point at real
    # evidence/evidence.schema.yaml record ids (^E-[0-9]+$), same convention every other typed-object schema uses --
    # not the source filenames themselves (those are evidence.schema.yaml's own `source` field, one layer down). ---
    exit_interview_evidence = evidence_record("E-501", "客服代表反映連續夜班負擔過重", "exit_interview_summary_2026-08.csv", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    scheduling_log_evidence = evidence_record("E-502", "新排班系統把原本輪替的夜班改為連續排班", "shift_scheduling_change_log.csv", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    for record in (exit_interview_evidence, scheduling_log_evidence):
        contracts.validate(S["evidence"], record, f"evidence {record['evidence_id']}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [exit_interview_evidence, scheduling_log_evidence]}, 2.5)

    why_chain = [
        why_chain_step(1, "為何客服團隊離職率上升？", "客服代表反映連續夜班負擔過重", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        why_chain_step(2, "為何連續夜班負擔加重？", "新排班系統把原本輪替的夜班改為連續排班", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-502"]),
        why_chain_step(3, "為何新系統會這樣排班？", "系統上線時的排班規則設定沿用舊系統的樣板，未針對連續夜班設上限", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-502"]),
    ]
    descriptor2, five_whys_validation = catalog.invoke(
        FIVE_WHYS_METHOD_ID,
        generate_five_whys_validation,
        "FWV-FIVEWHYS-2026-09-04-001",
        cause_hypothesis_set,
        "CHS-FIVEWHYS-001-H1",
        why_chain,
        ["CONTROLLABLE_BY_ORGANIZATION", "CLEAR_EVIDENCE_TO_VERIFY", "FOUND_SYSTEM_PROCESS_MECHANISM"],
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["five_whys_validation"], five_whys_validation, "five whys validation")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FiveWhysValidationGenerated", {"five_whys_validation": five_whys_validation, "method_descriptor": descriptor2}, 3)

    five_whys_gate_results = evaluate_five_whys_gates(five_whys_validation, "run_five_whys_slice", clock.at(3.1))
    for gate in five_whys_gate_results:
        contracts.validate(S["gate_result"], gate, f"five_whys gate {gate['gate_id']}")
    if not five_whys_gates_pass(five_whys_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FIVEWHYS_GATE_FAILED")
    milestones.append("FIVE_WHYS_VALIDATED")

    # --- Step 3: the real promotion -- reusing fishbone.py's OWN functions unchanged. This is the first time in
    # this codebase a CauseHypothesisSet is legally promoted to a RootCauseFact for real. ---
    validated_chs = record_validation_applied(cause_hypothesis_set, [FIVE_WHYS_METHOD_ID])
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CauseHypothesisSetValidationRecorded", {"cause_hypothesis_set": validated_chs}, 3.2)
    root_cause_fact = attempt_promote_to_root_cause_fact(
        "RCF-FIVEWHYS-2026-09-04-001",
        validated_chs,
        "CHS-FIVEWHYS-001-H1",
        "新排班系統排班規則未針對連續夜班設上限，導致員工疲勞累積並提高離職率",
        evidence_and_causal_validation_pass=True,
        provenance=make_provenance("SOURCE_FACT", "HUMAN_APPROVED"),
    )
    contracts.validate(S["root_cause_fact"], root_cause_fact, "root cause fact")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RootCauseFactPromoted", {"root_cause_fact": root_cause_fact}, 3.3)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("ROOT_CAUSE_FACT_PROMOTED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_ids": [FISHBONE_METHOD_ID, FIVE_WHYS_METHOD_ID],
        "method_resolution": resolution,
        "problem_statement": problem_statement,
        "cause_hypothesis_set": cause_hypothesis_set,
        "fishbone_gate_results": fishbone_gate_results,
        "five_whys_validation": five_whys_validation,
        "five_whys_gate_results": five_whys_gate_results,
        "root_cause_fact": root_cause_fact,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "five_whys_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_five_whys_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS root_cause.five_whys: RootCauseFact {result['root_cause_fact']['id']} legally promoted from {result['cause_hypothesis_set']['id']} via {result['root_cause_fact']['legal_promotion_path']['validation_methods_applied']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
