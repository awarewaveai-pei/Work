"""``root_cause.pareto`` vertical slice -- the fifth Method Atlas slice, and the second REAL validation path
completing fishbone's ``CauseHypothesisSet -> RootCauseFact`` chain (``root_cause.five_whys`` was the first).

Deliberately quantitative rather than narrative: this slice builds a
``Dataset`` of real (synthetic) incident counts against the SAME
``CauseHypothesisSet`` shape the fishbone/five_whys slices use, computes a
genuine Pareto ranking via ``ai_lego/compute/pareto/ranking.py`` (real code,
never an LLM "mental calculation" -- Master Plan §39), and promotes the
top-ranked hypothesis to a ``RootCauseFact`` using fishbone's OWN
``record_validation_applied`` / ``attempt_promote_to_root_cause_fact``,
UNCHANGED for the second time. Two independently-built method modules
(``five_whys.py`` and now ``pareto.py``) both compose into fishbone's same
promotion functions -- the chain is not a one-off, it is a real, reusable
seam.

Run::

    python -m ai_lego.apps.cli.run_pareto_slice
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
from ai_lego.modules.root_cause.pareto import (
    METHOD_ID as PARETO_METHOD_ID,
)
from ai_lego.modules.root_cause.pareto import (
    evaluate_pareto_gates,
    generate_pareto_analysis,
)
from ai_lego.modules.root_cause.pareto import all_gates_pass as pareto_gates_pass
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PARETO-SYNTHETIC-001"
EXECUTION_ID = "EX-PARETO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PARETO-001"
VITAL_FEW_THRESHOLD_PERCENT = 80.0

S = {
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "cause_hypothesis_set": "ai-lego://specs/cognitive/typed-objects/cause-hypothesis-set.schema.yaml",
    "pareto_analysis": "ai-lego://specs/cognitive/typed-objects/pareto-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pareto-slice"


def run_pareto_slice(config: SliceConfig) -> dict[str, Any]:
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
    resolution = catalog.resolve([FISHBONE_METHOD_ID, PARETO_METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: ProblemStatement + CauseHypothesisSet -- a different synthetic scenario from the fishbone/
    # five_whys slices (production defect categories, not HR attrition), better suited to a quantitative dataset. ---
    problem_statement = build_problem_statement(
        "PROB-PARETO-2026-09-04-001",
        {
            "current_state": "Nordbrook 生產線本季客訴工單數上升至 210 件",
            "expected_state": "客訴工單數維持在 60 件基準線",
            "gap": "150 件的異常上升,起始於六週前的供應商批次更換",
            "affected_stakeholders": ["Quality", "Manufacturing", "Customer Support"],
            "impact": "保固維修成本預估上升 45%",
            "evidence": ["defect_ticket_log_2026-08.csv"],
            "constraints": ["不可暫停現有產線做實驗"],
            "scope_non_goals": "只涵蓋本季新增工單;歷史工單另案處理",
        },
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        origin_method="problem_framing.problem_statement",
    )
    contracts.validate(S["problem_statement"], problem_statement, "problem statement")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ProblemStatementValidated", {"problem_statement": problem_statement}, 1)

    hypotheses = [
        cause_hypothesis("CHS-PARETO-001-H1", "新供應商批次的公差超出原規格,導致組裝不良", "Technology", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["defect_ticket_log_2026-08.csv"]),
        cause_hypothesis("CHS-PARETO-001-H2", "產線作業員未接受新批次的操作差異訓練", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        cause_hypothesis("CHS-PARETO-001-H3", "包裝材料本季更換供應商,運送途中破損率上升", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    descriptor, cause_hypothesis_set = catalog.invoke(FISHBONE_METHOD_ID, generate_cause_hypothesis_set, "CHS-PARETO-2026-09-04-001", problem_statement, hypotheses)
    contracts.validate(S["cause_hypothesis_set"], cause_hypothesis_set, "cause hypothesis set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CauseHypothesisSetGenerated", {"cause_hypothesis_set": cause_hypothesis_set, "method_descriptor": descriptor}, 2)

    fishbone_gate_results = evaluate_fishbone_gates(cause_hypothesis_set, "run_pareto_slice", clock.at(2.1))
    for gate in fishbone_gate_results:
        contracts.validate(S["gate_result"], gate, f"fishbone gate {gate['gate_id']}")
    if not fishbone_gates_pass(fishbone_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FISHBONE_GATE_FAILED before Pareto could run")
    milestones.append("CAUSE_HYPOTHESIS_SET_READY")

    # --- Step 2: root_cause.pareto -- a real dataset (defect ticket counts per candidate-cause category),
    # ranked, cumulative-share computed, with an EXPLICIT operator-set threshold (not a silent 80/20 default). ---
    dataset = [
        {"hypothesis_id": "CHS-PARETO-001-H1", "metric_value": 168},
        {"hypothesis_id": "CHS-PARETO-001-H2", "metric_value": 27},
        {"hypothesis_id": "CHS-PARETO-001-H3", "metric_value": 15},
    ]
    descriptor2, pareto_analysis = catalog.invoke(
        PARETO_METHOD_ID,
        generate_pareto_analysis,
        "PA-PARETO-2026-09-04-001",
        cause_hypothesis_set,
        "defect_ticket_count",
        dataset,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        vital_few_threshold_percent=VITAL_FEW_THRESHOLD_PERCENT,
    )
    contracts.validate(S["pareto_analysis"], pareto_analysis, "pareto analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ParetoAnalysisGenerated", {"pareto_analysis": pareto_analysis, "method_descriptor": descriptor2}, 3)

    pareto_gate_results = evaluate_pareto_gates(pareto_analysis, "run_pareto_slice", clock.at(3.1))
    for gate in pareto_gate_results:
        contracts.validate(S["gate_result"], gate, f"pareto gate {gate['gate_id']}")
    if not pareto_gates_pass(pareto_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PARETO_GATE_FAILED")
    milestones.append("PARETO_VALIDATED")

    if not pareto_analysis["vital_few_hypothesis_ids"]:
        raise InvariantViolation("PARETO_NO_VITAL_FEW: expected at least one hypothesis to cross the explicit threshold")
    top_hypothesis_id = pareto_analysis["vital_few_hypothesis_ids"][0]

    # --- Step 3: the real promotion -- reusing fishbone.py's OWN functions unchanged, for the SECOND time with a
    # DIFFERENT validation method (root_cause.pareto instead of root_cause.five_whys). ---
    validated_chs = record_validation_applied(cause_hypothesis_set, [PARETO_METHOD_ID])
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CauseHypothesisSetValidationRecorded", {"cause_hypothesis_set": validated_chs}, 3.2)
    root_cause_fact = attempt_promote_to_root_cause_fact(
        "RCF-PARETO-2026-09-04-001",
        validated_chs,
        top_hypothesis_id,
        "新供應商批次公差超出原規格造成組裝不良,佔本季客訴工單的絕大多數",
        evidence_and_causal_validation_pass=True,
        provenance=make_provenance("SOURCE_FACT", "HUMAN_APPROVED"),
    )
    contracts.validate(S["root_cause_fact"], root_cause_fact, "root cause fact")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RootCauseFactPromoted", {"root_cause_fact": root_cause_fact}, 3.3)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("ROOT_CAUSE_FACT_PROMOTED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_ids": [FISHBONE_METHOD_ID, PARETO_METHOD_ID],
        "method_resolution": resolution,
        "problem_statement": problem_statement,
        "cause_hypothesis_set": cause_hypothesis_set,
        "fishbone_gate_results": fishbone_gate_results,
        "pareto_analysis": pareto_analysis,
        "pareto_gate_results": pareto_gate_results,
        "root_cause_fact": root_cause_fact,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "pareto_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_pareto_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS root_cause.pareto: vital_few={result['pareto_analysis']['vital_few_hypothesis_ids']}, "
        f"RootCauseFact {result['root_cause_fact']['id']} legally promoted via {result['root_cause_fact']['legal_promotion_path']['validation_methods_applied']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
