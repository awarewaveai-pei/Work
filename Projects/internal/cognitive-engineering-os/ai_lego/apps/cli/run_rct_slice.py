"""``causal.rct`` vertical slice -- 2nd F11 `causal` family member (after ``causal.dag``).

Scenario: a completed onboarding-email RCT on new-signup 7-day retention --
same synthetic style every sibling slice's CLI demo uses, distinct from
``run_causal_dag_slice.py``'s own churn-analytics scenario (this record does
not reference or depend on that slice's data). Builds a real, well-formed
``RCTRecord`` covering Atlas F11 L621's own 4-step pipeline
(randomize→power→treatment/control→analysis), then demonstrates each of the
2 real invariants once as a construction-time REFUSAL (missing
``power_analysis`` disclosure; ``control_group`` echoing ``treatment_group``),
proving neither is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A
final step hand-tampers a VALID record directly (bypassing the builder) to
prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_rct_slice
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
from ai_lego.modules.causal.rct import (
    METHOD_ID,
    all_gates_pass,
    evaluate_rct_gates,
    generate_rct_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RCT-SYNTHETIC-001"
EXECUTION_ID = "EX-RCT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RCT-001"

S = {
    "rct_record": "ai-lego://specs/cognitive/typed-objects/rct-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-rct-slice"


def run_rct_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.rct resolves because its contract is
    # ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both real invariants satisfied. ---
    record = generate_rct_record(
        "RCT-2026-09-10-001",
        "以個別新註冊帳號為隨機分派單位，系統於註冊完成當下以亂數產生器等機率指派至 treatment/control，分派後不可切換組別",
        "資料蒐集前先驗設定 α=0.05、power=0.8，依歷史 7 日留存率 35% 估算，偵測至少 5 個百分點差異所需樣本數為每組 1,600 人",
        "新註冊帳號於第 0/2/5 天收到 3 封 onboarding email",
        "新註冊帳號不收到任何 onboarding email，僅維持既有產品內引導流程",
        "雙尾 t 檢定比較兩組 7 日留存率：treatment 組 41.2% vs control 組 35.6%，差異 5.6 個百分點（p=0.021）。分析方法與結果為研究團隊回報，本紀錄未重新執行統計檢定",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["rct_record"], record, "rct record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RCTRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_rct_gates(record, "run_rct_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.rct gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("RCT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness invariant is not toothless -- a deliberately empty power_analysis MUST
    # be refused before any record is constructed (Atlas's own power stage is a required pipeline step, not
    # optional metadata). ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_rct_record(
            "RCT-REFUSED-001",
            "個別帳號隨機指派",
            "",  # empty power_analysis -- no disclosed sample-size justification is a real methodological red flag
            "收到 onboarding email",
            "不收到 onboarding email",
            "留存率比較",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "RCT_EMPTY_POWER_ANALYSIS" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "RCT_EMPTY_POWER_ANALYSIS"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RCT_INVARIANT_NOT_ENFORCED: an empty power_analysis was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the echo invariant is not toothless -- control_group identical to treatment_group MUST
    # be refused (a single-arm 'trial' is not a randomized CONTROLLED trial). ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_rct_record(
            "RCT-ECHO-REFUSED-001",
            "個別帳號隨機指派",
            "每組 1,600 人",
            "新註冊帳號收到 onboarding email 序列",
            "新註冊帳號收到 onboarding email 序列",  # identical to treatment_group -- an echo, not a real control arm
            "留存率比較",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RCT_INVARIANT_NOT_ENFORCED: control_group==treatment_group was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = dict(record)
    tampered["control_group"] = tampered["treatment_group"]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_rct_gates(tampered, "run_rct_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("RCT_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered echoing control_group")
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
        "echo_refusal_proof": echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_how_might_we_slice.py)",
    }
    write_json(runtime / "results" / "rct_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_rct_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.rct: RCTRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_POWER_ANALYSIS invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"CONTROL_GROUP_ECHOES_TREATMENT_GROUP invariant REFUSED a single-arm attempt ({result['echo_refusal_proof']['error_code']}); "
        f"echoing-control_group tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
