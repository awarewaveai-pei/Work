"""``representation.guided_mode`` vertical slice -- F24 representation family (Atlas L971, §11.56).

Builds Atlas §11.56's own worked Fishbone example (one question, one
answer, auto-selecting ``root_cause.fishbone``), then proves the method's
two real invariants are not mere narrative order: a construction-time
attempt to select a method with an EMPTY answer trail is refused, a
construction-time attempt to select a method with NO real contract in this
corpus is refused, and a hand-tampered valid record (selected_method_id
swapped to an unregistered id after construction, bypassing the builder) is
independently caught by the method_registered gate.

Run::

    python -m ai_lego.apps.cli.run_guided_mode_slice
"""

from __future__ import annotations

import argparse
import copy
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.representation.guided_mode import (
    METHOD_ID,
    all_gates_pass,
    evaluate_guided_mode_gates,
    evaluate_method_registered_gate,
    generate_guided_mode_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-GUIDEDMODE-SYNTHETIC-001"
EXECUTION_ID = "EX-GUIDEDMODE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-GUIDEDMODE-001"

S = {
    "guided_mode_session": "ai-lego://specs/cognitive/typed-objects/guided-mode-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-representation-guided-mode-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "qa_trail": [
            {"question": "你目前是在找「可能原因」，還是已經有數據想驗證原因？", "answer": "在找可能原因"},
        ],
        "selected_method_id": "root_cause.fishbone",
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_guided_mode_slice(config: SliceConfig) -> dict[str, Any]:
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
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: Atlas §11.56's own worked Fishbone example -- 1 real question, resolves to a real method. ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_guided_mode_session,
        "GUIDED-2026-09-12-001",
        method_catalog=catalog,
        **_well_formed_kwargs(),
    )
    contracts.validate(S["guided_mode_session"], session, "guided mode session")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "GuidedModeSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_guided_mode_gates(session, catalog, "run_guided_mode_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"guided mode session gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"GUIDED_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "GuidedModeSessionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.56's own answer-trail requirement is not toothless -- an EMPTY qa_trail
    # MUST be refused before any record is constructed. ---
    empty_trail_kwargs = copy.deepcopy(_well_formed_kwargs())
    empty_trail_kwargs["qa_trail"] = []
    empty_trail_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_guided_mode_session("GUIDED-EMPTY-TRAIL-REFUSED-001", method_catalog=catalog, **empty_trail_kwargs)
    except InvariantViolation as error:
        if "GUIDED_EMPTY_QA_TRAIL" not in str(error):
            raise
        empty_trail_refusal_proof["raised"] = True
        empty_trail_refusal_proof["error_code"] = "GUIDED_EMPTY_QA_TRAIL"
    if not empty_trail_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GUIDED_INVARIANT_NOT_ENFORCED: a session with an empty qa_trail was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EmptyTrailRefused", {"refusal_proof": empty_trail_refusal_proof}, 1.3)
    milestones.append("EMPTY_TRAIL_REFUSAL_PROVEN")

    # --- Step 3: prove the live-MethodCatalog-resolution requirement is not toothless -- selecting a method
    # with NO real contract in this corpus MUST be refused before any record is constructed. ---
    unregistered_kwargs = copy.deepcopy(_well_formed_kwargs())
    unregistered_kwargs["selected_method_id"] = "representation.does_not_exist"
    unregistered_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_guided_mode_session("GUIDED-UNREGISTERED-REFUSED-001", method_catalog=catalog, **unregistered_kwargs)
    except InvariantViolation as error:
        if "GUIDED_METHOD_NOT_REGISTERED" not in str(error):
            raise
        unregistered_refusal_proof["raised"] = True
        unregistered_refusal_proof["error_code"] = "GUIDED_METHOD_NOT_REGISTERED"
    if not unregistered_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GUIDED_INVARIANT_NOT_ENFORCED: a session selecting an unregistered method was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnregisteredMethodRefused", {"refusal_proof": unregistered_refusal_proof}, 1.4)
    milestones.append("UNREGISTERED_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT method_registered gate catches the same defect class
    # even when a caller bypasses the builder entirely (selected_method_id swapped after construction). ---
    tampered = copy.deepcopy(session)
    tampered["selected_method_id"] = "representation.does_not_exist"
    tampered_gate = evaluate_method_registered_gate(tampered, catalog, "run_guided_mode_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("GUIDED_GATE_NOT_INDEPENDENT: the independent method_registered gate did NOT catch a hand-tampered unregistered selected_method_id")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "guided_mode_session": session,
        "gate_results": gate_results,
        "empty_trail_refusal_proof": empty_trail_refusal_proof,
        "unregistered_refusal_proof": unregistered_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "guided_mode_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_guided_mode_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.guided_mode: GuidedModeSession {result['guided_mode_session']['id']} built "
        f"(1 question -> selected {result['guided_mode_session']['selected_method_id']}), gates [{gate_summary}]; "
        f"GUIDED_EMPTY_QA_TRAIL REFUSED a no-question attempt ({result['empty_trail_refusal_proof']['error_code']}); "
        f"GUIDED_METHOD_NOT_REGISTERED REFUSED an unregistered-method attempt ({result['unregistered_refusal_proof']['error_code']}); "
        f"hand-tampered unregistered selected_method_id caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
