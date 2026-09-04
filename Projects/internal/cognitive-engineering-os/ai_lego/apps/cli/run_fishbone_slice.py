"""``root_cause.fishbone`` vertical slice -- the second Method Atlas slice (TASKS.md 2026-09-04 "全部做好" item).

Deliberately picked to be structurally UNLIKE ``research.qualitative_coding``
(no coder-agreement loop, no eval harness, no Kappa): a single hypothesis-
generation step with a hard type boundary immediately after it. Question this
run answers: does a second, differently-shaped method assemble against the
SAME LEGO framework (``MethodCatalog``, ``SchemaContracts``, ``EventLedger``,
``PiiLedgerGuard``, the fail-closed-gate discipline) with zero changes to any
of that shared infrastructure? Every import below except
``ai_lego.modules.root_cause.fishbone`` itself is unchanged, reused code.

This slice deliberately does NOT complete the ``ProblemStatement -> Fishbone
-> CauseHypothesisSet -> Evidence Search -> Causal DAG -> Validation ->
RootCauseFact`` chain past CauseHypothesisSet: the contract's own recorded
open question (root_cause.fishbone.contract.yaml OQ-FISHBONE-1) says plainly
that none of Fishbone's ``recommended_next`` methods (root_cause.pareto,
root_cause.five_whys, causal.dag, validation.experiment) have a contract in
this spec root yet -- so recording any of them as "applied" here would be
exactly the fabricated-evidence class of defect this codebase's gates exist
to catch. The run instead proves the forbidden-transition guard for real: a
direct promotion attempt is made and MUST be refused
(``attempt_promote_to_root_cause_fact`` raising ``InvariantViolation``
before any ``RootCauseFact`` record is constructed), then the run reports
that state honestly rather than faking the legal path.

Scope decision (deliberate, not an oversight): this slice does NOT walk the
EC section 10 14-state execution machine (``execution-state-machine.schema.yaml``)
that ``run_research_slice.py`` does -- ``build_current_state``'s EC section 11
dimension text is hard-coded to that slice's own modules/events, and
re-purposing it here without rewriting its content would be exactly the kind
of unearned/fabricated record this codebase does not tolerate. The EC
envelope is orthogonal to the question this slice answers (does a
differently-shaped METHOD assemble against the shared method/schema/ledger/
gate machinery); wiring it up for real is separate follow-up work, not a
silent gap.

Run::

    python -m ai_lego.apps.cli.run_fishbone_slice
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
from ai_lego.modules.root_cause.fishbone import (
    METHOD_ID,
    all_gates_pass,
    attempt_promote_to_root_cause_fact,
    build_problem_statement,
    cause_hypothesis,
    evaluate_fishbone_gates,
    generate_cause_hypothesis_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FISHBONE-SYNTHETIC-001"
EXECUTION_ID = "EX-FISHBONE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-FISHBONE-001"

S = {
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "cause_hypothesis_set": "ai-lego://specs/cognitive/typed-objects/cause-hypothesis-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-fishbone-slice"


def run_fishbone_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. root_cause.fishbone resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the same mechanism research.qualitative_coding uses. --
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: ProblemStatement (Atlas §12.2 content shape), validated, status=validated per the contract's own
    # precondition. Synthetic Cascadia People Ops scenario -- same synthetic tenant the research slice uses. ---
    problem_statement = build_problem_statement(
        "PROB-FISHBONE-2026-09-04-001",
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
    milestones.append("PROBLEM_STATEMENT_VALIDATED")

    # --- Step 2: root_cause.fishbone invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's
    # pattern, unchanged): the implementation only runs if the descriptor names an ACTIVE contract. ---
    hypotheses = [
        cause_hypothesis(
            "CHS-FISHBONE-001-H1",
            "新排班系統造成連續夜班增加,員工疲勞累積",
            "Process",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["shift_scheduling_change_log.csv"],
        ),
        cause_hypothesis(
            "CHS-FISHBONE-001-H2",
            "新系統上線後缺乏在職培訓,客服代表操作出錯率上升",
            "Process",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        cause_hypothesis(
            "CHS-FISHBONE-001-H3",
            "同期薪資調整未同步,產生外部比較落差",
            "Policy",
            make_provenance("UNKNOWN", "AI_SUGGESTED"),
        ),
    ]
    descriptor, cause_hypothesis_set = catalog.invoke(
        METHOD_ID,
        generate_cause_hypothesis_set,
        "CHS-FISHBONE-2026-09-04-001",
        problem_statement,
        hypotheses,
    )
    contracts.validate(S["cause_hypothesis_set"], cause_hypothesis_set, "cause hypothesis set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CauseHypothesisSetGenerated", {"cause_hypothesis_set": cause_hypothesis_set, "method_descriptor": descriptor}, 2)
    milestones.append("METHOD_EXECUTED")

    # --- Gates: the contract's own quality block (provenance_required, evidence_labeling_required), evaluated for
    # real against this run's actual hypotheses -- a FAIL raises before anything downstream is written. ---
    timestamp = clock.at(2.2)
    gate_results = evaluate_fishbone_gates(cause_hypothesis_set, "run_fishbone_slice", timestamp)
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        failing = [gate["gate_id"] for gate in gate_results if gate["status"] not in {"PASS", "NOT_APPLICABLE"}]
        raise InvariantViolation(f"FISHBONE_GATE_FAILED: {', '.join(failing)}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FishboneGatesEvaluated", {"gate_results": gate_results}, 2.3)
    milestones.append("GATES_PASSED")

    # --- The forbidden-transition guard, exercised for real: a direct promotion attempt on a set that has not been
    # through any of Fishbone's recommended_next validation methods MUST be refused. ---
    try:
        attempt_promote_to_root_cause_fact(
            "RCF-FISHBONE-2026-09-04-001",
            cause_hypothesis_set,
            "CHS-FISHBONE-001-H1",
            "新排班系統造成連續夜班增加,導致離職率上升",
            evidence_and_causal_validation_pass=False,
            provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
        forbidden_transition_blocked = False
        forbidden_transition_error = None
    except InvariantViolation as error:
        forbidden_transition_blocked = True
        forbidden_transition_error = str(error)
    if not forbidden_transition_blocked:
        # A structural safety guarantee failed to fire -- this must never happen; fail loudly rather than continue.
        raise InvariantViolation("FISHBONE_FORBIDDEN_TRANSITION_GUARD_DID_NOT_FIRE: direct CauseHypothesisSet -> RootCauseFact promotion was NOT refused")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RootCauseFactPromotionBlocked", {"cause_hypothesis_set_ref": cause_hypothesis_set["id"], "reason": forbidden_transition_error}, 2.5)
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
        "problem_statement": problem_statement,
        "cause_hypothesis_set": cause_hypothesis_set,
        "gate_results": gate_results,
        "forbidden_transition": {
            "attempted": True,
            "blocked": forbidden_transition_blocked,
            "error": forbidden_transition_error,
            "honest_limit": (
                "Promotion to RootCauseFact requires one of Fishbone's recommended_next methods "
                "(root_cause.pareto, root_cause.five_whys, causal.dag, validation.experiment) to actually run first "
                "(Atlas SS11.4 L1267); none has a methods/contracts/ entry yet "
                "(root_cause.fishbone.contract.yaml OQ-FISHBONE-1), so this slice stops here rather than "
                "fabricating a validation record."
            ),
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice)",
    }
    write_json(runtime / "results" / "fishbone_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_fishbone_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(f"PASS root_cause.fishbone: 3 hypotheses, gates [{gate_summary}], forbidden_transition_blocked={result['forbidden_transition']['blocked']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
