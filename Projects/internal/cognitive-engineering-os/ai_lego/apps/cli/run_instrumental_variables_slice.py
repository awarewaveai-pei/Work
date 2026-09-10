"""``causal.instrumental_variables`` vertical slice -- 9th F11 `causal` family member.

Scenario: a completed IV study estimating the effect of education on
earnings using a quarter-of-birth compulsory-schooling instrument -- same
synthetic style every sibling slice's CLI demo uses, distinct from
``run_rct_slice.py``'s own onboarding-email scenario (this record does not
reference or depend on that slice's data). Builds a real, well-formed
``InstrumentalVariablesRecord`` covering Atlas F11 L624's own 3-step
pipeline (instrument→relevance/exclusion→2SLS), then demonstrates each of
the 2 real invariants once as a construction-time REFUSAL (missing
``exclusion_justification`` disclosure; ``instrument`` echoing
``endogenous_variable``), proving neither is toothless, same "show a real
refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record directly
(bypassing the builder) to prove the independent gate, not just the
builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_instrumental_variables_slice
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
from ai_lego.modules.causal.instrumental_variables import (
    METHOD_ID,
    all_gates_pass,
    evaluate_instrumental_variables_gates,
    generate_instrumental_variables_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-IV-SYNTHETIC-001"
EXECUTION_ID = "EX-IV-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-IV-001"

S = {
    "iv_record": "ai-lego://specs/cognitive/typed-objects/instrumental-variables-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-instrumental-variables-slice"


def run_instrumental_variables_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.instrumental_variables resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both real invariants satisfied. ---
    record = generate_instrumental_variables_record(
        "IV-2026-09-10-001",
        "個人出生季別所隱含的義務教育最低就學年限差異（quarter-of-birth compulsory schooling instrument）",
        "個人完成之教育年數（years of completed schooling）",
        "第一階段迴歸中出生季別對教育年數的係數統計顯著（F 統計量 > 10），顯示出生季別確實與教育年數相關，滿足 relevance 條件",
        "出生季別除透過義務教育年限影響教育年數外，無其他管道直接影響成年後薪資（已控制出生年度與地區固定效果），滿足 exclusion 條件",
        "2SLS 估計顯示教育年數每增加一年，薪資提高約 7.5%（標準誤 1.2%）。分析方法與結果為研究團隊回報，本紀錄未重新執行迴歸估計",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["iv_record"], record, "instrumental variables record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InstrumentalVariablesRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_instrumental_variables_gates(record, "run_instrumental_variables_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.instrumental_variables gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("IV_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness invariant is not toothless -- a deliberately empty
    # exclusion_justification MUST be refused before any record is constructed (Atlas's own "relevance/exclusion"
    # stage names exclusion as a required validity condition, not optional metadata). ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_instrumental_variables_record(
            "IV-REFUSED-001",
            "出生季別",
            "教育年數",
            "第一階段係數顯著",
            "",  # empty exclusion_justification -- no disclosed no-direct-effect argument is a real IV validity gap
            "2SLS 估計結果",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "IV_EMPTY_EXCLUSION_JUSTIFICATION" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "IV_EMPTY_EXCLUSION_JUSTIFICATION"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("IV_INVARIANT_NOT_ENFORCED: an empty exclusion_justification was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the echo invariant is not toothless -- instrument identical to endogenous_variable MUST
    # be refused (an instrument that IS the variable it instruments for is not a valid IV design). ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_instrumental_variables_record(
            "IV-ECHO-REFUSED-001",
            "教育年數",
            "教育年數",  # identical to endogenous_variable -- an echo, not a real external instrument
            "第一階段係數顯著",
            "無其他直接影響管道",
            "2SLS 估計結果",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("IV_INVARIANT_NOT_ENFORCED: instrument==endogenous_variable was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = dict(record)
    tampered["instrument"] = tampered["endogenous_variable"]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_instrumental_variables_gates(tampered, "run_instrumental_variables_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("IV_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered echoing instrument")
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
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rct_slice.py)",
    }
    write_json(runtime / "results" / "instrumental_variables_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_instrumental_variables_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.instrumental_variables: InstrumentalVariablesRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_EXCLUSION_JUSTIFICATION invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE invariant REFUSED a degenerate attempt ({result['echo_refusal_proof']['error_code']}); "
        f"echoing-instrument tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
