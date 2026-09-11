"""``challenge.fmea`` vertical slice -- eighth built member of the challenge/red-team/risk family (F12).

Scenario: an FMEA over a payment-retry background job. Builds a real, well-formed ``FmeaAnalysis`` satisfying
every real invariant, then demonstrates THE real invariant (Atlas §11.26 L1799-1800's own "不要只依賴 RPN；高
Severity 即使機率低仍可能需強制控制" warning) is not toothless: a severity=10/occurrence=1/detection=1 failure
mode (rpn=10, which an rpn-only tier table would call LOW) still resolves to ``MANDATORY_CONTROL_REQUIRED`` --
the single most important behavior this whole method exists to encode. Also proves two structural refusals
(zero failure modes; an out-of-range score) are not toothless, and a final step hand-tampers a VALID record's
``action_priority`` directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the defect.

Run::

    python -m ai_lego.apps.cli.run_fmea_slice
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
from ai_lego.modules.challenge.fmea import (
    METHOD_ID,
    all_gates_pass,
    evaluate_fmea_gates,
    generate_fmea_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FMEA-SYNTHETIC-001"
EXECUTION_ID = "EX-FMEA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FMEA-001"

S = {
    "fmea_analysis": "ai-lego://specs/cognitive/typed-objects/fmea-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-fmea-slice"


def _failure_modes() -> list[dict[str, Any]]:
    return [
        {
            "id": "FMEA-2026-09-11-001-FM1",
            "function": "重試失敗的付款請求，最多 3 次",
            "failure_mode": "重試邏輯把同一筆款項重複扣款兩次",
            "effect": "客戶被重複收費，需人工退款",
            "cause": "重試前未先查詢是否已有成功交易記錄（幂等鍵缺失）",
            "existing_control": "",
            # THE demonstration case: severity=10 (top of scale) but occurrence=1/detection=1 (rpn=10, which an
            # rpn-only tier table would call LOW) -- Atlas L1799-1800's own warning says this must still be
            # MANDATORY_CONTROL_REQUIRED. Proven below, not just asserted.
            "severity": 10,
            "occurrence": 1,
            "detection": 1,
        },
        {
            "id": "FMEA-2026-09-11-001-FM2",
            "function": "重試失敗的付款請求，最多 3 次",
            "failure_mode": "重試間隔過短導致第三方 API rate limit",
            "effect": "整批重試被拒絕，付款延遲",
            "cause": "固定 1 秒間隔，未實作指數退避",
            "existing_control": "重試次數上限 3 次",
            "severity": 5,
            "occurrence": 8,
            "detection": 6,
        },
    ]


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "subject_ref": "付款重試背景工作（payment-retry-worker）",
        "failure_modes": _failure_modes(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_fmea_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.fmea resolves because its contract is
    # ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
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
        generate_fmea_analysis,
        "FMEA-2026-09-11-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["fmea_analysis"], analysis, "fmea analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FmeaAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_fmea_gates(analysis, "run_fmea_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.fmea gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FMEA_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (Atlas §11.26 L1799-1800's own "不要只依賴 RPN" warning) is not
    # toothless -- the high-severity/low-rpn failure mode (FM1: severity=10, rpn=10) must have been forced to
    # MANDATORY_CONTROL_REQUIRED, NOT derived as LOW from the rpn tier table alone. ---
    fm1 = next(fm for fm in analysis["failure_modes"] if fm["id"] == "FMEA-2026-09-11-001-FM1")
    severity_override_proof = {"failure_mode_id": fm1["id"], "severity": fm1["severity"], "rpn": fm1["rpn"], "action_priority": fm1["action_priority"]}
    if fm1["rpn"] >= 50 or fm1["action_priority"] != "MANDATORY_CONTROL_REQUIRED":
        milestones.append("BLOCKED")
        raise InvariantViolation(
            f"FMEA_INVARIANT_NOT_ENFORCED: expected rpn<50 (LOW by the tier table alone) but action_priority forced to "
            f"MANDATORY_CONTROL_REQUIRED by the severity>=9 override -- got rpn={fm1['rpn']}, action_priority={fm1['action_priority']!r}"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SeverityOverrideProven", {"severity_override_proof": severity_override_proof}, 1.2)
    milestones.append("SEVERITY_OVERRIDE_PROVEN")

    # --- Step 3: proof a structural invariant (zero failure modes) is not toothless. ---
    empty_kwargs = {**_well_formed_analysis_kwargs(), "failure_modes": []}
    empty_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_fmea_analysis("FMEA-EMPTY-REFUSED-001", **empty_kwargs)
    except InvariantViolation as error:
        if "FMEA_NO_FAILURE_MODES" not in str(error):
            raise
        empty_refusal_proof["raised"] = True
        empty_refusal_proof["error_code"] = "FMEA_NO_FAILURE_MODES"
    if not empty_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FMEA_INVARIANT_NOT_ENFORCED: zero failure modes was NOT refused -- the precondition is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyFailureModesRefused", {"refusal_proof": empty_refusal_proof}, 1.3)
    milestones.append("EMPTY_FAILURE_MODES_REFUSAL_PROVEN")

    # --- Step 4: proof an out-of-range score is not toothless. ---
    out_of_range_failure_modes = [{**_failure_modes()[0], "severity": 11}, _failure_modes()[1]]
    out_of_range_kwargs = {**_well_formed_analysis_kwargs(), "failure_modes": out_of_range_failure_modes}
    score_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_fmea_analysis("FMEA-BAD-SCORE-REFUSED-001", **out_of_range_kwargs)
    except InvariantViolation as error:
        if "FMEA_INVALID_SCORE" not in str(error):
            raise
        score_refusal_proof["raised"] = True
        score_refusal_proof["error_code"] = "FMEA_INVALID_SCORE"
    if not score_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FMEA_INVARIANT_NOT_ENFORCED: an out-of-range severity score was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "OutOfRangeScoreRefused", {"refusal_proof": score_refusal_proof}, 1.4)
    milestones.append("OUT_OF_RANGE_SCORE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites FM1's action_priority to LOW directly on a VALID record's own raw dict). ---
    tampered = dict(analysis)
    tampered["failure_modes"] = [dict(fm) for fm in analysis["failure_modes"]]
    tampered["failure_modes"][0]["action_priority"] = "LOW"  # was MANDATORY_CONTROL_REQUIRED -- bypasses the builder directly
    tampered_gate = evaluate_fmea_gates(tampered, "run_fmea_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FMEA_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered action_priority")
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
        "severity_override_proof": severity_override_proof,
        "empty_refusal_proof": empty_refusal_proof,
        "score_refusal_proof": score_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "fmea_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_fmea_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.fmea: FmeaAnalysis {result['analysis']['id']} built, gates [{gate_summary}]; "
        f"severity>=9 override PROVEN (rpn={result['severity_override_proof']['rpn']} -> action_priority="
        f"{result['severity_override_proof']['action_priority']!r}, not the rpn-tier LOW a naive RPN-only "
        f"reading would give -- Atlas §11.26 L1799-1800); FMEA_NO_FAILURE_MODES/FMEA_INVALID_SCORE invariants "
        f"each REFUSED a malformed attempt; hand-tampered action_priority caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
