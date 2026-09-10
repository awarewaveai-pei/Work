"""``causal.regression_discontinuity`` vertical slice -- 8th F11 `causal` family member.

Scenario: a completed RDD study estimating the local effect of a scholarship offer on college
enrollment at a standardized-test-score cutoff -- same synthetic style every sibling slice's CLI
demo uses, distinct from ``run_rct_slice.py``'s own onboarding-email scenario (this record does
not reference or depend on that slice's data). Builds a real, well-formed
``RegressionDiscontinuityRecord`` covering Atlas F11 L623's own 4-step pipeline (running
variable→cutoff→bandwidth→checks), then demonstrates each of the 2 real invariants once as a
construction-time REFUSAL (invalid ``cutoff_value``; ``checks`` containing a duplicate entry),
proving neither is toothless, same "show a real refusal, not only a real success" discipline
every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record
directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_regression_discontinuity_slice
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
from ai_lego.modules.causal.regression_discontinuity import (
    METHOD_ID,
    all_gates_pass,
    evaluate_regression_discontinuity_gates,
    generate_regression_discontinuity_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RD-SYNTHETIC-001"
EXECUTION_ID = "EX-RD-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RD-001"

S = {
    "rd_record": "ai-lego://specs/cognitive/typed-objects/regression-discontinuity-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-regression-discontinuity-slice"


def run_regression_discontinuity_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.regression_discontinuity
    # resolves because its contract is ACTIVE in the spec root's methods/contracts/, exactly the
    # mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both real invariants satisfied. ---
    record = generate_regression_discontinuity_record(
        "RD-2026-09-10-001",
        "入學考試標準化分數，0-100 分制，全體考生統一測驗",
        60,
        "cutoff 上下各 8 分（±8），依歷史分數密度圖目視判斷加上 rule-of-thumb 頻寬估算，未做交叉驗證",
        [
            "McCrary density test：cutoff 附近分數密度無明顯跳躍，未偵測到操縱證據（p=0.38）",
            "安慰劑 cutoff 檢定：於樣本中位數另設安慰劑 cutoff，未觀察到不連續（估計效果 ≈ 0，p=0.71）",
            "共變量平衡檢查：cutoff 附近的性別、家庭收入、先前成績等前決定共變量皆無顯著跳躍",
        ],
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        analysis_summary="局部線性迴歸估計 cutoff 附近入學率跳躍約 12 個百分點（p=0.03）。分析方法與結果為研究團隊回報，本紀錄未重新執行迴歸估計",
    )
    contracts.validate(S["rd_record"], record, "regression discontinuity record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RegressionDiscontinuityRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_regression_discontinuity_gates(record, "run_regression_discontinuity_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.regression_discontinuity gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("RD_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness/validity invariant is not toothless -- a deliberately
    # non-finite cutoff_value (NaN) MUST be refused before any record is constructed (a cutoff
    # needs to be a real point on the running variable's own scale, not merely "present"). ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_regression_discontinuity_record(
            "RD-REFUSED-001",
            "考試分數",
            float("nan"),  # invalid cutoff_value -- not a real point on the running variable's own scale
            "±8 分",
            ["密度檢定"],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "RD_INVALID_CUTOFF_VALUE" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "RD_INVALID_CUTOFF_VALUE"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RD_INVARIANT_NOT_ENFORCED: an invalid cutoff_value was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the checks-distinctness invariant is not toothless -- 2 effectively
    # identical checks entries MUST be refused (a list padded with a duplicate has not actually
    # disclosed multiple distinct validation checks). ---
    duplicate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_regression_discontinuity_record(
            "RD-DUPLICATE-REFUSED-001",
            "考試分數",
            60,
            "±8 分",
            ["McCrary density test 無操縱證據", "McCrary  density   test 無操縱證據"],  # whitespace-variant duplicate of the same check
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "RD_CHECKS_CONTAIN_DUPLICATE" not in str(error):
            raise
        duplicate_refusal_proof["raised"] = True
        duplicate_refusal_proof["error_code"] = "RD_CHECKS_CONTAIN_DUPLICATE"
    if not duplicate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RD_INVARIANT_NOT_ENFORCED: a duplicated checks entry was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateChecksRecordRefused", {"duplicate_refusal_proof": duplicate_refusal_proof}, 1.7)
    milestones.append("DUPLICATE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a
    # caller bypasses the builder entirely. ---
    tampered = dict(record)
    tampered["checks"] = [record["checks"][0], record["checks"][0]]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_regression_discontinuity_gates(tampered, "run_regression_discontinuity_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("RD_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered duplicated checks list")
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
        "duplicate_refusal_proof": duplicate_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rct_slice.py)",
    }
    write_json(runtime / "results" / "regression_discontinuity_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_regression_discontinuity_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.regression_discontinuity: RegressionDiscontinuityRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"INVALID_CUTOFF_VALUE invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"CHECKS_CONTAIN_DUPLICATE invariant REFUSED a padded-list attempt ({result['duplicate_refusal_proof']['error_code']}); "
        f"duplicated-checks tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
