"""``challenge.counterexample_search`` vertical slice -- F12 challenge/red-team/risk family, sixth built member
(red_team, blue_team, independent_judge already exist).

Scenario: the claim "所有使用者都可以透過 email 重設密碼" (all users can reset their password via email) tested
against two boundary cases -- a phone-only registered account (no email field at all) and a disabled-but-active
email account. One boundary case turns out to be a TRUE counterexample (phone-only breaks the claim); the other
survives (claim holds), demonstrating ``true_counterexamples`` is a proper SUBSET of ``boundary_cases``, not a
mirror. Builds a real, well-formed ``CounterexampleSearchResult`` satisfying every real invariant, then
demonstrates two of them each as a construction-time REFUSAL (a dangling ``boundary_case_id`` reference; zero
boundary cases examined), proving neither is toothless, same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record directly
(bypassing the builder, splicing in a dangling reference) to prove the independent gate, not just the builder,
catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_counterexample_search_slice
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
from ai_lego.modules.challenge.counterexample_search import (
    METHOD_ID,
    all_gates_pass,
    evaluate_counterexample_search_gates,
    generate_counterexample_search,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CES-SYNTHETIC-001"
EXECUTION_ID = "EX-CES-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CES-001"

S = {
    "counterexample_search_result": "ai-lego://specs/cognitive/typed-objects/counterexample-search.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-counterexample-search-slice"


def _boundary_cases() -> list[dict[str, Any]]:
    return [
        {"id": "BC-1", "description": "使用者帳號沒有綁定 email，只用手機號碼註冊"},
        {"id": "BC-2", "description": "使用者的 email 已停用但帳號仍是 active 狀態"},
    ]


def _true_counterexamples() -> list[dict[str, Any]]:
    # BC-2 deliberately has NO matching entry here -- the claim SURVIVES that boundary case (a merely-disabled
    # mailbox can still receive mail with many providers), demonstrating true_counterexamples is a proper
    # SUBSET, not a mirror, of boundary_cases.
    return [
        {"boundary_case_id": "BC-1", "contradiction_explanation": "純手機號碼註冊帳號的 email 欄位為 null，重設密碼流程寄不出信，直接卡住 -- 規則在這個邊界案例下不成立"},
    ]


def _well_formed_result_kwargs() -> dict[str, Any]:
    return {
        "claim": "所有使用者都可以透過 email 重設密碼",
        "boundary_cases": _boundary_cases(),
        "true_counterexamples": _true_counterexamples(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_counterexample_search_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.counterexample_search resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed result -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_counterexample_search,
        "CES-2026-09-11-001",
        **_well_formed_result_kwargs(),
    )
    contracts.validate(S["counterexample_search_result"], record, "counterexample search result")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CounterexampleSearchResultGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_counterexample_search_gates(record, "run_counterexample_search_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.counterexample_search gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CES_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (referential integrity -- a case cannot be confirmed a counterexample
    # if it was never examined as a boundary case) is not toothless -- a dangling boundary_case_id reference
    # MUST be refused before any record is constructed. ---
    dangling_kwargs = {**_well_formed_result_kwargs(), "true_counterexamples": _true_counterexamples() + [{"boundary_case_id": "BC-99", "contradiction_explanation": "幽靈邊界案例，從未被列入 boundary_cases"}]}
    dangling_reference_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_counterexample_search("CES-DANGLING-REF-REFUSED-001", **dangling_kwargs)
    except InvariantViolation as error:
        if "CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE" not in str(error):
            raise
        dangling_reference_refusal_proof["raised"] = True
        dangling_reference_refusal_proof["error_code"] = "CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE"
    if not dangling_reference_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CES_INVARIANT_NOT_ENFORCED: a dangling boundary_case_id reference was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingReferenceRefused", {"refusal_proof": dangling_reference_refusal_proof}, 1.3)
    milestones.append("DANGLING_REFERENCE_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (at least one boundary case examined) is not toothless -- a search
    # that examined zero boundary cases MUST be refused before any record is constructed. ---
    zero_boundary_cases_kwargs = {**_well_formed_result_kwargs(), "boundary_cases": [], "true_counterexamples": []}
    zero_boundary_cases_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_counterexample_search("CES-ZERO-BOUNDARY-CASES-REFUSED-001", **zero_boundary_cases_kwargs)
    except InvariantViolation as error:
        if "CES_INVALID_BOUNDARY_CASES" not in str(error):
            raise
        zero_boundary_cases_refusal_proof["raised"] = True
        zero_boundary_cases_refusal_proof["error_code"] = "CES_INVALID_BOUNDARY_CASES"
    if not zero_boundary_cases_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CES_INVARIANT_NOT_ENFORCED: zero boundary cases was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZeroBoundaryCasesRefused", {"refusal_proof": zero_boundary_cases_refusal_proof}, 1.5)
    milestones.append("ZERO_BOUNDARY_CASES_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling true_counterexamples entry directly into a VALID record's own raw
    # dict, after construction). ---
    tampered = dict(record)
    tampered["true_counterexamples"] = record["true_counterexamples"] + [{"boundary_case_id": "BC-99", "contradiction_explanation": "幽靈邊界案例，繞過 builder 直接塞入"}]
    tampered_gate = evaluate_counterexample_search_gates(tampered, "run_counterexample_search_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("CES_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered dangling reference")
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
        "record": record,
        "gate_results": gate_results,
        "dangling_reference_refusal_proof": dangling_reference_refusal_proof,
        "zero_boundary_cases_refusal_proof": zero_boundary_cases_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "counterexample_search_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_counterexample_search_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.counterexample_search: CounterexampleSearchResult {result['record']['id']} built, gates [{gate_summary}]; "
        f"CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE/CES_INVALID_BOUNDARY_CASES invariants each REFUSED a malformed attempt "
        f"({result['dangling_reference_refusal_proof']['error_code']}, {result['zero_boundary_cases_refusal_proof']['error_code']}); "
        f"hand-tampered dangling reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
