"""``causal.difference_in_differences`` vertical slice -- 7th F11 `causal` family member.

Scenario: a completed natural-experiment DiD on a city-level minimum-wage
change and fast-food employment -- same synthetic style every sibling
slice's CLI demo uses, distinct from ``run_rct_slice.py``'s own onboarding-
email scenario (this record does not reference or depend on that slice's
data). Builds a real, well-formed ``DifferenceInDifferencesRecord`` covering
Atlas F11 L622's own 3-step pipeline (treated/control→pre/post→parallel
trends), then demonstrates each of the 3 real invariants once as a
construction-time REFUSAL (missing ``parallel_trends_justification``
disclosure; ``control_group`` echoing ``treated_group``; ``post_period``
echoing ``pre_period``), proving none is toothless, same "show a real
refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record directly
(bypassing the builder) to prove the independent gate, not just the
builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_difference_in_differences_slice
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
from ai_lego.modules.causal.difference_in_differences import (
    METHOD_ID,
    all_gates_pass,
    evaluate_difference_in_differences_gates,
    generate_difference_in_differences_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DID-SYNTHETIC-001"
EXECUTION_ID = "EX-DID-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DID-001"

S = {
    "did_record": "ai-lego://specs/cognitive/typed-objects/difference-in-differences-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-difference-in-differences-slice"


def run_difference_in_differences_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.difference_in_differences resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- all 3 real invariants satisfied. ---
    record = generate_difference_in_differences_record(
        "DID-2026-09-10-001",
        "A市：2025年第3季實施最低工資調升的速食業僱主",
        "鄰近未調升最低工資的B市：同期速食業僱主",
        "2025年第1-2季（調升前2季）",
        "2025年第4季-2026年第1季（調升後2季）",
        "調升前4季A、B兩市速食業僱用人數走勢以平行趨勢圖比對，兩市季增率差異均在1個百分點內且無統計顯著差異，支持平行趨勢假設",
        "DiD 估計顯示處置組相對於對照組僱用人數變動 -2.1%（標準誤 0.9%），研究團隊回報之結果，本紀錄未重新執行迴歸分析",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["did_record"], record, "difference-in-differences record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DifferenceInDifferencesRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_difference_in_differences_gates(record, "run_difference_in_differences_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.difference_in_differences gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("DID_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness invariant is not toothless -- a deliberately empty
    # parallel_trends_justification MUST be refused before any record is constructed (Atlas's own "parallel
    # trends" stage is a required pipeline step, not optional metadata). ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_difference_in_differences_record(
            "DID-REFUSED-001",
            "A市速食業僱主",
            "B市速食業僱主",
            "調升前",
            "調升後",
            "",  # empty parallel_trends_justification -- no disclosed basis for the identifying assumption
            "僱用人數比較",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "DID_EMPTY_PARALLEL_TRENDS_JUSTIFICATION" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "DID_EMPTY_PARALLEL_TRENDS_JUSTIFICATION"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DID_INVARIANT_NOT_ENFORCED: an empty parallel_trends_justification was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the treated/control distinctness invariant is not toothless -- control_group identical to
    # treated_group MUST be refused (a single-arm 'natural experiment' has not identified 2 groups to compare). ---
    group_echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_difference_in_differences_record(
            "DID-GROUP-ECHO-REFUSED-001",
            "A市速食業僱主",
            "A市速食業僱主",  # identical to treated_group -- an echo, not a real control arm
            "調升前",
            "調升後",
            "平行趨勢比對",
            "僱用人數比較",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP" not in str(error):
            raise
        group_echo_refusal_proof["raised"] = True
        group_echo_refusal_proof["error_code"] = "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP"
    if not group_echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DID_INVARIANT_NOT_ENFORCED: control_group==treated_group was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "GroupEchoRecordRefused", {"group_echo_refusal_proof": group_echo_refusal_proof}, 1.7)
    milestones.append("GROUP_ECHO_REFUSAL_PROVEN")

    # --- Step 4: proof the pre/post distinctness invariant is not toothless -- post_period identical to
    # pre_period MUST be refused (an identical period twice cannot express a before/after difference). ---
    period_echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_difference_in_differences_record(
            "DID-PERIOD-ECHO-REFUSED-001",
            "A市速食業僱主",
            "B市速食業僱主",
            "2025年第3季",
            "2025年第3季",  # identical to pre_period -- an echo, not a real before/after split
            "平行趨勢比對",
            "僱用人數比較",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "DID_POST_PERIOD_ECHOES_PRE_PERIOD" not in str(error):
            raise
        period_echo_refusal_proof["raised"] = True
        period_echo_refusal_proof["error_code"] = "DID_POST_PERIOD_ECHOES_PRE_PERIOD"
    if not period_echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DID_INVARIANT_NOT_ENFORCED: post_period==pre_period was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PeriodEchoRecordRefused", {"period_echo_refusal_proof": period_echo_refusal_proof}, 1.9)
    milestones.append("PERIOD_ECHO_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = dict(record)
    tampered["control_group"] = tampered["treated_group"]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_difference_in_differences_gates(tampered, "run_difference_in_differences_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("DID_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered echoing control_group")
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
        "record": record,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "group_echo_refusal_proof": group_echo_refusal_proof,
        "period_echo_refusal_proof": period_echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rct_slice.py)",
    }
    write_json(runtime / "results" / "difference_in_differences_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_difference_in_differences_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.difference_in_differences: DifferenceInDifferencesRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_PARALLEL_TRENDS_JUSTIFICATION invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"CONTROL_GROUP_ECHOES_TREATED_GROUP invariant REFUSED a single-arm attempt ({result['group_echo_refusal_proof']['error_code']}); "
        f"POST_PERIOD_ECHOES_PRE_PERIOD invariant REFUSED a single-period attempt ({result['period_echo_refusal_proof']['error_code']}); "
        f"echoing-control_group tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
