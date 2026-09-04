"""``causal.dag`` vertical slice -- the sixth Method Atlas slice, and the THIRD real validation path completing
fishbone's ``CauseHypothesisSet -> RootCauseFact`` chain (``root_cause.five_whys`` and ``root_cause.pareto`` came
first).

The first slice from a family other than ``root_cause``/``strategy``:
``causal`` (F11). Builds a real causal graph (nodes with causal roles,
directed edges as causal hypotheses) against the SAME CauseHypothesisSet
shape fishbone's other consumers use, verifies it is genuinely acyclic via
``ai_lego/compute/graph/dag.py`` (a real DFS cycle-detection algorithm, not
an assertion), then promotes the target hypothesis to a ``RootCauseFact``
using fishbone's OWN promotion functions -- for the THIRD time, with a
THIRD different validation method.

Run::

    python -m ai_lego.apps.cli.run_causal_dag_slice
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
from ai_lego.modules.causal.dag import (
    METHOD_ID as CAUSAL_DAG_METHOD_ID,
)
from ai_lego.modules.causal.dag import (
    dag_edge,
    dag_node,
    evaluate_dag_gates,
    generate_causal_dag_analysis,
)
from ai_lego.modules.causal.dag import all_gates_pass as dag_gates_pass
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
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CAUSALDAG-SYNTHETIC-001"
EXECUTION_ID = "EX-CAUSALDAG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CAUSALDAG-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "cause_hypothesis_set": "ai-lego://specs/cognitive/typed-objects/cause-hypothesis-set.schema.yaml",
    "causal_dag_analysis": "ai-lego://specs/cognitive/typed-objects/causal-dag-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-causal-dag-slice"


def run_causal_dag_slice(config: SliceConfig) -> dict[str, Any]:
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
    resolution = catalog.resolve([FISHBONE_METHOD_ID, CAUSAL_DAG_METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: ProblemStatement + CauseHypothesisSet -- a churn-analytics scenario, distinct from the fishbone/
    # five_whys (HR attrition) and pareto (manufacturing defects) slices. ---
    problem_statement = build_problem_statement(
        "PROB-CAUSALDAG-2026-09-04-001",
        {
            "current_state": "Cascadia 訂閱制產品次月流失率上升至 9.5%",
            "expected_state": "次月流失率維持在 4% 基準線",
            "gap": "5.5 個百分點的異常上升,起始於七週前的價格調整",
            "affected_stakeholders": ["Growth", "Product", "Finance"],
            "impact": "月經常性收入預估下降 12%",
            "evidence": ["churn_cohort_analysis_2026-08.csv"],
            "constraints": ["不可對既有付費用戶做隨機對照實驗"],
            "scope_non_goals": "只涵蓋自助方案;企業合約用戶另案處理",
        },
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        origin_method="problem_framing.problem_statement",
    )
    contracts.validate(S["problem_statement"], problem_statement, "problem statement")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProblemStatementValidated", {"problem_statement": problem_statement}, 1)

    hypotheses = [
        cause_hypothesis("CHS-CAUSALDAG-001-H1", "價格調整直接推升低黏著度用戶的流失", "Policy", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["churn_cohort_analysis_2026-08.csv"]),
        cause_hypothesis("CHS-CAUSALDAG-001-H2", "同期新版介面上線,可能是混淆因子而非真正原因", "Technology", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    descriptor, cause_hypothesis_set = catalog.invoke(FISHBONE_METHOD_ID, generate_cause_hypothesis_set, "CHS-CAUSALDAG-2026-09-04-001", problem_statement, hypotheses)
    contracts.validate(S["cause_hypothesis_set"], cause_hypothesis_set, "cause hypothesis set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CauseHypothesisSetGenerated", {"cause_hypothesis_set": cause_hypothesis_set, "method_descriptor": descriptor}, 2)

    fishbone_gate_results = evaluate_fishbone_gates(cause_hypothesis_set, "run_causal_dag_slice", clock.at(2.1))
    for gate in fishbone_gate_results:
        contracts.validate(S["gate_result"], gate, f"fishbone gate {gate['gate_id']}")
    if not fishbone_gates_pass(fishbone_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FISHBONE_GATE_FAILED before Causal DAG could run")
    milestones.append("CAUSE_HYPOTHESIS_SET_READY")

    # --- Step 2: causal.dag -- a real graph naming the price-change treatment, the new-UI confounder Atlas's own
    # method exists to surface, and the churn outcome, evidence-backed where real cohort data exists. ---
    evidence = evidence_record("E-801", "價格調整世代的次月流失率顯著高於對照世代,新介面上線前後兩世代流失率無顯著差異", "churn_cohort_analysis_2026-08.csv", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], evidence, f"evidence {evidence['evidence_id']}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [evidence]}, 2.5)

    nodes = [
        dag_node("N1", "價格調整", "TREATMENT"),
        dag_node("N2", "新版介面上線", "CONFOUNDER"),
        dag_node("N3", "低黏著度用戶比例", "MEDIATOR"),
        dag_node("N4", "次月流失率", "OUTCOME"),
    ]
    edges = [
        dag_edge("N1", "N3", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-801"]),
        dag_edge("N3", "N4", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-801"]),
        dag_edge("N2", "N4", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    descriptor2, causal_dag_analysis = catalog.invoke(
        CAUSAL_DAG_METHOD_ID,
        generate_causal_dag_analysis,
        "CDA-CAUSALDAG-2026-09-04-001",
        cause_hypothesis_set,
        nodes,
        edges,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["causal_dag_analysis"], causal_dag_analysis, "causal dag analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CausalDagAnalysisGenerated", {"causal_dag_analysis": causal_dag_analysis, "method_descriptor": descriptor2}, 3)

    dag_gate_results = evaluate_dag_gates(causal_dag_analysis, "run_causal_dag_slice", clock.at(3.1))
    for gate in dag_gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.dag gate {gate['gate_id']}")
    if not dag_gates_pass(dag_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CAUSALDAG_GATE_FAILED")
    milestones.append("CAUSAL_DAG_VALIDATED")

    # --- Step 3: the real promotion -- fishbone.py's OWN functions, unchanged, for the THIRD time, with a THIRD
    # different validation method (causal.dag instead of root_cause.five_whys / root_cause.pareto). ---
    validated_chs = record_validation_applied(cause_hypothesis_set, [CAUSAL_DAG_METHOD_ID])
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CauseHypothesisSetValidationRecorded", {"cause_hypothesis_set": validated_chs}, 3.2)
    root_cause_fact = attempt_promote_to_root_cause_fact(
        "RCF-CAUSALDAG-2026-09-04-001",
        validated_chs,
        "CHS-CAUSALDAG-001-H1",
        "價格調整直接推升低黏著度用戶流失,新介面上線是混淆因子而非真正原因(世代比較無顯著差異)",
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
        "method_ids": [FISHBONE_METHOD_ID, CAUSAL_DAG_METHOD_ID],
        "method_resolution": resolution,
        "problem_statement": problem_statement,
        "cause_hypothesis_set": cause_hypothesis_set,
        "fishbone_gate_results": fishbone_gate_results,
        "causal_dag_analysis": causal_dag_analysis,
        "dag_gate_results": dag_gate_results,
        "root_cause_fact": root_cause_fact,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "causal_dag_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_causal_dag_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.dag: {len(result['causal_dag_analysis']['nodes'])} nodes, "
        f"{len(result['causal_dag_analysis']['edges'])} edges, acyclic_verified={result['causal_dag_analysis']['acyclic_verified']}, "
        f"RootCauseFact {result['root_cause_fact']['id']} legally promoted via {result['root_cause_fact']['legal_promotion_path']['validation_methods_applied']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
