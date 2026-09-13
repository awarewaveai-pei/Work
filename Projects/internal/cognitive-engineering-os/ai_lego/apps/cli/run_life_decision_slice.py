"""Executable life-decision vertical slice for the shared Recipe runtime.

The fixture is intentionally explicit: the engine may route and compute the
chain, but it must not invent options, criteria, scores, or evidence. Replace
the ``source`` object in ``run_life_decision`` with caller-owned data for a
real invocation.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.support import write_json
from ai_lego.modules.decision.weighted_decision_matrix import (
    all_gates_pass as wdm_gates_pass,
    evaluate_weighted_decision_matrix_gates,
    generate_weighted_decision_matrix_analysis,
)
from ai_lego.modules.framing.problem_statement import (
    all_gates_pass as problem_gates_pass,
    evaluate_problem_statement_gates,
    generate_problem_statement,
)
from ai_lego.modules.strategy.swot import (
    all_gates_pass as swot_gates_pass,
    evaluate_swot_gates,
    generate_swot_analysis,
    swot_factor,
)
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.workflow.executor import execute_workflow_ir
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir, project_workflow_ir

RECIPE_ID = "life-decision-v1"
WORKFLOW_ID = "life-decision-v1:runtime"
VALIDATOR = "life-decision-slice"

SCHEMAS = {
    "problem": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "swot": "ai-lego://specs/cognitive/typed-objects/swot-analysis.schema.yaml",
    "wdm": "ai-lego://specs/cognitive/typed-objects/weighted-decision-matrix-record.schema.yaml",
}


def fixture_source() -> dict[str, Any]:
    provenance = make_provenance("EVIDENCE", "HUMAN_APPROVED")
    evidence = evidence_record("E-001", "The current schedule leaves two evenings unavailable.", "LIFE-NOTE-001", provenance)
    return {
        "problem": {
            "problem_id": "PROB-LIFE-001",
            "current_state": "Two evenings each week are consumed by the current commitment.",
            "expected_state": "Choose a sustainable commitment that preserves two evenings for recovery and study.",
            "gap": "The current commitment conflicts with the required recovery and study time.",
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        },
        "swot": {
            "analysis_id": "SWOT-LIFE-001",
            "knowledge_set_ref": "KS-LIFE-001",
            "knowledge_set": [evidence],
            "factors": [
                swot_factor("SWOT-LIFE-001-F1", "STRENGTH", "Existing skills make the transition feasible.", "personal", "2026-Q3", "LIFE-NOTE-001", provenance, supporting_evidence_refs=["E-001"]),
                swot_factor("SWOT-LIFE-001-F2", "WEAKNESS", "Energy is already constrained on weekdays.", "personal", "2026-Q3", "LIFE-NOTE-001", provenance, supporting_evidence_refs=["E-001"]),
                swot_factor("SWOT-LIFE-001-F3", "OPPORTUNITY", "A flexible alternative is available.", "personal", "2026-Q3", "LIFE-NOTE-001", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
                swot_factor("SWOT-LIFE-001-F4", "THREAT", "Overcommitment could reduce recovery time.", "personal", "2026-Q3", "LIFE-NOTE-001", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            ],
        },
        "decision": {
            "analysis_id": "WDM-LIFE-001",
            "options": [{"id": "O1", "label": "Keep current commitment"}, {"id": "O2", "label": "Choose flexible alternative"}],
            "criteria": [{"id": "C1", "label": "recovery time"}, {"id": "C2", "label": "financial value"}, {"id": "C3", "label": "growth value"}],
            "scores": [
                {"option_id": "O1", "criterion_id": "C1", "value": 2}, {"option_id": "O1", "criterion_id": "C2", "value": 5}, {"option_id": "O1", "criterion_id": "C3", "value": 4},
                {"option_id": "O2", "criterion_id": "C1", "value": 5}, {"option_id": "O2", "criterion_id": "C2", "value": 4}, {"option_id": "O2", "criterion_id": "C3", "value": 4},
            ],
            "weights": [{"criterion_id": "C1", "weight": 0.4}, {"criterion_id": "C2", "weight": 0.2}, {"criterion_id": "C3", "weight": 0.4}],
            "scale_min": 1,
            "scale_max": 5,
            "sensitivity_notes": "The recommendation changes if recovery-time weight falls materially below 0.2; human review is required.",
            "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        },
    }


def run_life_decision(spec_root: Path | None = None, runtime_dir: Path | None = None) -> dict[str, Any]:
    spec_root = resolve_spec_root(spec_root)
    source = fixture_source()
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve(["framing.problem_statement", "strategy.swot", "decision.weighted_decision_matrix"])
    if resolution.get("blocked"):
        raise RuntimeError(f"METHOD_RESOLUTION_BLOCKED: {resolution['blocked']}")

    compiled = compile_recipe_to_workflow_ir(spec_root, RECIPE_ID, "R1")
    workflow = project_workflow_ir(compiled, [0, 1, 2], workflow_id=WORKFLOW_ID)
    contracts = SchemaContracts(spec_root)

    def problem(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        return generate_problem_statement(**payload["source.problem"])

    def swot(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        return generate_swot_analysis(**payload["source.swot"])

    def matrix(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        # The upstream SWOT is deliberately required and resolved here. Its
        # fields are not copied into the WDM record because that typed object
        # has a closed schema; lineage remains in the workflow journal.
        if payload["outputs.SWOT_analysis"]["id"] != "SWOT-LIFE-001":
            raise RuntimeError("LIFE_DECISION_UPSTREAM_SWOT_MISSING")
        return generate_weighted_decision_matrix_analysis(**payload["source.decision"])

    journal = (runtime_dir or Path(tempfile.gettempdir()) / "ai-lego-life-decision") / "life_decision.journal.json"
    result = execute_workflow_ir(
        workflow,
        {"source": source},
        {"framing.problem_statement": problem, "strategy.swot": swot, "decision.weighted_decision_matrix": matrix},
        catalogs={"method": catalog},
        journal_path=journal,
    )
    if result.status != "SUCCEEDED":
        raise RuntimeError(f"LIFE_DECISION_WORKFLOW_FAILED: {result.as_dict()}")
    outputs = result.context["outputs"]
    contracts.validate(SCHEMAS["problem"], outputs["problem_statement"], "problem statement")
    contracts.validate(SCHEMAS["swot"], outputs["SWOT_analysis"], "SWOT analysis")
    contracts.validate(SCHEMAS["wdm"], outputs["weighted_decision_matrix"], "weighted decision matrix")
    gates = {
        "problem_statement": evaluate_problem_statement_gates(outputs["problem_statement"], VALIDATOR, "2026-09-14T00:00:00Z"),
        "SWOT_analysis": evaluate_swot_gates(outputs["SWOT_analysis"], VALIDATOR, "2026-09-14T00:00:00Z"),
        "weighted_decision_matrix": evaluate_weighted_decision_matrix_gates(outputs["weighted_decision_matrix"], VALIDATOR, "2026-09-14T00:00:00Z"),
    }
    if not (problem_gates_pass(gates["problem_statement"]) and swot_gates_pass(gates["SWOT_analysis"]) and wdm_gates_pass(gates["weighted_decision_matrix"])):
        raise RuntimeError(f"LIFE_DECISION_GATE_FAILED: {gates}")
    report = {"status": "PASS", "workflow": result.as_dict(), "method_resolution": resolution, "gates": gates, "journal": str(journal)}
    output_path = (runtime_dir or journal.parent) / "life_decision.result.json"
    write_json(output_path, report)
    report["result_path"] = str(output_path)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-dir", type=Path)
    args = parser.parse_args()
    report = run_life_decision(runtime_dir=args.runtime_dir)
    print(f"PASS: {report['workflow']['workflow_id']} ({len(report['workflow']['steps'])} steps); journal={report['journal']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
