"""``challenge.pre_mortem`` vertical slice -- F12 challenge/red-team/risk family, 4th built member.

Scenario: a fictional fully-automated AI content-publishing launch, pre-mortem'd a year into an assumed total
failure (Atlas §11.25 step 1's own framing) -- same synthetic-but-plausible style every sibling slice's CLI
demo uses. Builds a real, well-formed ``PreMortemAnalysis`` satisfying every real invariant, then demonstrates
two of them each as a construction-time REFUSAL (a cause left with zero covering controls; an out-of-vocabulary
likelihood value), proving neither is toothless. A final step hand-tampers a VALID record directly (bypassing
the builder, deleting one covering control) to prove the independent gate, not just the builder, catches the
same defect.

Run::

    python -m ai_lego.apps.cli.run_pre_mortem_slice
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
from ai_lego.modules.challenge.pre_mortem import (
    METHOD_ID,
    all_gates_pass,
    evaluate_pre_mortem_gates,
    generate_pre_mortem_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PREMORTEM-SYNTHETIC-001"
EXECUTION_ID = "EX-PREMORTEM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PREMORTEM-001"

S = {
    "pre_mortem_analysis": "ai-lego://specs/cognitive/typed-objects/pre-mortem-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pre-mortem-slice"


def _failure_causes() -> list[dict[str, Any]]:
    return [
        {"id": "FC-001", "description": "AI 產出內容沒有任何自動品質監控，錯誤內容直接曝光給客戶", "cluster": "監控缺口", "likelihood": "HIGH", "impact": "HIGH"},
        {"id": "FC-002", "description": "上線前跳過人工審核步驟，趕時程優先於品質", "cluster": "流程缺口", "likelihood": "MEDIUM", "impact": "HIGH"},
    ]


def _controls() -> list[dict[str, Any]]:
    return [
        {"id": "CTRL-001", "control_type": "PREVENTION", "description": "上線前導入強制人工審核步驟，未過審不得發布", "addresses_cause_id": "FC-002"},
        {"id": "CTRL-002", "control_type": "DETECTION", "description": "加入內容品質異常自動告警", "addresses_cause_id": "FC-001"},
        {"id": "CTRL-003", "control_type": "RECOVERY", "description": "保留一鍵回滾到人工審核流程的開關", "addresses_cause_id": "FC-001"},
    ]


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "failure_scenario": "一年後，這次全自動 AI 內容發布上線徹底失敗了，為什麼？",
        "failure_causes": _failure_causes(),
        "controls": _controls(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_pre_mortem_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.pre_mortem resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_pre_mortem_analysis,
        "PREMORTEM-2026-09-11-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["pre_mortem_analysis"], analysis, "pre-mortem analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PreMortemAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pre_mortem_gates(analysis, "run_pre_mortem_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.pre_mortem gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PREMORTEM_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (cause-to-control coverage, Atlas §11.25 step 5's own "建
    # prevention/detection/recovery control") is not toothless -- dropping the only control covering FC-002
    # MUST be refused before any record is constructed. ---
    uncovered_kwargs = {**_well_formed_analysis_kwargs(), "controls": [c for c in _controls() if c["id"] != "CTRL-001"]}
    uncovered_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_pre_mortem_analysis("PREMORTEM-UNCOVERED-CAUSE-REFUSED-001", **uncovered_kwargs)
    except InvariantViolation as error:
        if "PREMORTEM_UNCOVERED_CAUSE" not in str(error):
            raise
        uncovered_refusal_proof["raised"] = True
        uncovered_refusal_proof["error_code"] = "PREMORTEM_UNCOVERED_CAUSE"
    if not uncovered_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PREMORTEM_INVARIANT_NOT_ENFORCED: an uncovered failure cause was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UncoveredCauseRefused", {"refusal_proof": uncovered_refusal_proof}, 1.3)
    milestones.append("UNCOVERED_CAUSE_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (likelihood/impact closed vocabulary) is not toothless -- an
    # out-of-vocabulary likelihood value MUST be refused before any record is constructed. ---
    bad_causes = _failure_causes()
    bad_causes[0] = {**bad_causes[0], "likelihood": "EXTREME"}
    invalid_level_kwargs = {**_well_formed_analysis_kwargs(), "failure_causes": bad_causes}
    invalid_level_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_pre_mortem_analysis("PREMORTEM-INVALID-LEVEL-REFUSED-001", **invalid_level_kwargs)
    except InvariantViolation as error:
        if "PREMORTEM_INVALID_CAUSE_ENTRY" not in str(error):
            raise
        invalid_level_refusal_proof["raised"] = True
        invalid_level_refusal_proof["error_code"] = "PREMORTEM_INVALID_CAUSE_ENTRY"
    if not invalid_level_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PREMORTEM_INVARIANT_NOT_ENFORCED: an out-of-vocabulary likelihood value was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidLevelRefused", {"refusal_proof": invalid_level_refusal_proof}, 1.5)
    milestones.append("INVALID_LEVEL_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (deletes one covering control directly from a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(analysis)
    tampered["controls"] = [c for c in analysis["controls"] if c["id"] != "CTRL-001"]  # was the only control covering FC-002
    tampered_gate = evaluate_pre_mortem_gates(tampered, "run_pre_mortem_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PREMORTEM_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered, uncovered failure cause")
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
        "analysis": analysis,
        "gate_results": gate_results,
        "uncovered_refusal_proof": uncovered_refusal_proof,
        "invalid_level_refusal_proof": invalid_level_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "pre_mortem_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_pre_mortem_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.pre_mortem: PreMortemAnalysis {result['analysis']['id']} built, gates [{gate_summary}]; "
        f"PREMORTEM_UNCOVERED_CAUSE/PREMORTEM_INVALID_CAUSE_ENTRY invariants each REFUSED a malformed attempt "
        f"({result['uncovered_refusal_proof']['error_code']}, {result['invalid_level_refusal_proof']['error_code']}); "
        f"hand-tampered uncovered failure cause caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
