"""``divergent.scamper`` vertical slice -- F03 divergent ideation family, 1st member (F03 entirely
unbuilt before this entry; see ``run_bcg_matrix_slice.py`` for the most recent sibling slice's CLI-demo
structure, reused here).

Scenario: a SCAMPER session improving an existing subscription-box product -- same synthetic style every
sibling slice's CLI demo uses. Builds a real, well-formed ``ScamperSession`` covering 4 of the 7 lenses,
then demonstrates each of the 2 real invariants once as a construction-time REFUSAL (an illegal lens value;
an attempt to caller-supply ``validation_status`` -- exercised as a smuggled raw-dict key, since the builder
has no such parameter at all), proving neither is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID
record directly (bypassing the builder) to prove the independent gate, not just the builder, catches a
hand-tampered claim of a different ``validation_status``.

Run::

    python -m ai_lego.apps.cli.run_scamper_slice
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
from ai_lego.modules.divergent.scamper import (
    METHOD_ID,
    VALIDATION_STATUS,
    all_gates_pass,
    entry,
    evaluate_scamper_gates,
    generate_scamper_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SCAMPER-SYNTHETIC-001"
EXECUTION_ID = "EX-SCAMPER-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SCAMPER-001"

S = {
    "scamper_session": "ai-lego://specs/cognitive/typed-objects/scamper-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-scamper-slice"


def _well_formed_entries() -> list[dict[str, Any]]:
    return [
        entry("SUBSTITUTE", "把紙箱包裝換成可重複使用的帆布袋", "降低一次性包材成本，同時呼應永續訴求"),
        entry("COMBINE", "與在地咖啡烘豆商合作，加入每月限定的搭配包", "用跨品牌組合提高單次訂閱的感知價值"),
        entry("ELIMINATE", "移除紙本說明書，改成掃碼看影片教學", "減少印刷成本與物流重量"),
        entry("REVERSE", "讓訂閱者自己選擇出貨順序，而不是照公司排定的月曆", "把控制權交給使用者，可能提高續訂率"),
    ]


def run_scamper_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.scamper resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_scamper_session,
        "SCAMPER-2026-09-11-001",
        _well_formed_entries(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["scamper_session"], session, "scamper session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ScamperSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_scamper_gates(session, "run_scamper_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.scamper gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SCAMPER_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (only the 7 real lenses are legal) is not toothless -- an illegal lens
    # value MUST be refused before any record is constructed. ---
    invalid_lens_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_scamper_session(
            "SCAMPER-BADLENS-REFUSED-001",
            [{"lens": "AMPLIFY", "transformed_idea": "x", "reasoning": "y"}],
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "SCAMPER_UNKNOWN_LENS" not in str(error):
            raise
        invalid_lens_refusal_proof["raised"] = True
        invalid_lens_refusal_proof["error_code"] = "SCAMPER_UNKNOWN_LENS"
    if not invalid_lens_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SCAMPER_INVARIANT_NOT_ENFORCED: an illegal lens value 'AMPLIFY' was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidLensRefused", {"refusal_proof": invalid_lens_refusal_proof}, 1.3)
    milestones.append("INVALID_LENS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (validation_status is never caller-settable) is not toothless -- a
    # caller attempting to smuggle validation_status into the entries list (the only path into
    # generate_scamper_session) MUST be refused, because "validation_status" is not one of the 3 legal
    # entry keys at all. ---
    caller_supplied_validation_status_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_scamper_session(
            "SCAMPER-SMUGGLEDSTATUS-REFUSED-001",
            [{"lens": "SUBSTITUTE", "transformed_idea": "x", "reasoning": "y", "validation_status": "VALIDATED"}],
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "SCAMPER_INVALID_ENTRY_SHAPE" not in str(error):
            raise
        caller_supplied_validation_status_refusal_proof["raised"] = True
        caller_supplied_validation_status_refusal_proof["error_code"] = "SCAMPER_INVALID_ENTRY_SHAPE"
    if not caller_supplied_validation_status_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            "SCAMPER_INVARIANT_NOT_ENFORCED: a caller-supplied validation_status smuggled via a raw entry dict was NOT refused -- the "
            "structural-elimination invariant is toothless"
        )
    ledger.append(
        NORDBROOK.tenant_id, AGGREGATE_ID, "CallerSuppliedValidationStatusRefused", {"refusal_proof": caller_supplied_validation_status_refusal_proof}, 1.5
    )
    milestones.append("VALIDATION_STATUS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips the stored validation_status to a fabricated "VALIDATED" claim, directly
    # contradicting Atlas's own F03 caution "不等於市場驗證"). ---
    tampered = dict(session)
    tampered["validation_status"] = "VALIDATED"  # was UNVALIDATED_IDEATION -- bypasses the builder directly
    tampered_gate = evaluate_scamper_gates(tampered, "run_scamper_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SCAMPER_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered validation_status claim")
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
        "session": session,
        "gate_results": gate_results,
        "invalid_lens_refusal_proof": invalid_lens_refusal_proof,
        "caller_supplied_validation_status_refusal_proof": caller_supplied_validation_status_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "scamper_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_scamper_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.scamper: ScamperSession {result['session']['id']} built with "
        f"{len(result['session']['entries'])} lens entries (validation_status={VALIDATION_STATUS}), gates [{gate_summary}]; "
        f"SCAMPER_UNKNOWN_LENS/SCAMPER_INVALID_ENTRY_SHAPE invariants each REFUSED a malformed attempt "
        f"({result['invalid_lens_refusal_proof']['error_code']}, {result['caller_supplied_validation_status_refusal_proof']['error_code']}); "
        f"hand-tampered validation_status claim caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
