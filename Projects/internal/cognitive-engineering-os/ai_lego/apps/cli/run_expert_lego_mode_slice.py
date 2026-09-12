"""``representation.expert_lego_mode`` vertical slice -- F24 representation family (Atlas L972, §11.57).

Builds a 3-step expert-assembled chain with all 7 Atlas §11.57 compiler
checks PASS (compile_status mechanically derives COMPILED), then proves the
method's real invariant is not mere narrative order: a construction-time
attempt to compile with a MISSING check is refused, a chain with one check
FAIL correctly derives REJECTED (never COMPILED, even though the other 6
checks PASS -- Atlas's own "自由組裝，不是自由破壞" rule), and a hand-built
record that bypasses the builder entirely and asserts ``compile_status:
COMPILED`` alongside a FAILing check is independently caught by the
compile_status_consistency gate.

Run::

    python -m ai_lego.apps.cli.run_expert_lego_mode_slice
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
from ai_lego.modules.representation.expert_lego_mode import (
    METHOD_ID,
    all_gates_pass,
    evaluate_compile_status_consistency_gate,
    evaluate_expert_lego_chain_gates,
    generate_expert_lego_chain,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ELEGO-SYNTHETIC-001"
EXECUTION_ID = "EX-ELEGO-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ELEGO-001"

S = {
    "expert_lego_chain": "ai-lego://specs/cognitive/typed-objects/expert-lego-chain.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-representation-expert-lego-mode-slice"


def _all_pass_checks() -> list[dict[str, Any]]:
    return [
        {"check": "type_check", "status": "PASS", "note": "every step's output type feeds the next step's required input"},
        {"check": "precondition_check", "status": "PASS", "note": "all preconditions satisfied"},
        {"check": "policy_check", "status": "PASS", "note": "no policy violation"},
        {"check": "jurisdiction_check", "status": "PASS", "note": "no jurisdiction conflict"},
        {"check": "cost_estimate", "status": "PASS", "note": "within budget"},
        {"check": "risk_estimate", "status": "PASS", "note": "within risk tolerance"},
        {"check": "required_gate_injection", "status": "PASS", "note": "mandatory gates injected per risk tier"},
    ]


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "chain": [
            {"step_id": "S1", "method_id": "insight.interview"},
            {"step_id": "S2", "method_id": "foresight.scenario_planning"},
            {"step_id": "S3", "method_id": "decision.decision_tree"},
        ],
        "checks": _all_pass_checks(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_expert_lego_mode_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed chain -- all 7 checks PASS -> compile_status derives COMPILED. ---
    descriptor, chain = catalog.invoke(
        METHOD_ID,
        generate_expert_lego_chain,
        "ELEGO-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["expert_lego_chain"], chain, "expert lego chain")
    if chain["compile_status"] != "COMPILED":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ELEGO_UNEXPECTED_STATUS: all-PASS chain derived {chain['compile_status']!r}, expected COMPILED")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ExpertLegoChainGenerated", {"chain": chain, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_expert_lego_chain_gates(chain, "run_expert_lego_mode_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"expert lego chain gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ELEGO_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ExpertLegoChainGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.57's own 7-check completeness requirement is not toothless -- a MISSING
    # check MUST be refused before any record is constructed. ---
    missing_check_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_check_kwargs["checks"] = missing_check_kwargs["checks"][:-1]  # drop required_gate_injection
    missing_check_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_expert_lego_chain("ELEGO-MISSING-CHECK-REFUSED-001", **missing_check_kwargs)
    except InvariantViolation as error:
        if "ELEGO_MISSING_CHECK" not in str(error):
            raise
        missing_check_refusal_proof["raised"] = True
        missing_check_refusal_proof["error_code"] = "ELEGO_MISSING_CHECK"
    if not missing_check_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ELEGO_INVARIANT_NOT_ENFORCED: a chain with a missing check was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingCheckRefused", {"refusal_proof": missing_check_refusal_proof}, 1.3)
    milestones.append("MISSING_CHECK_REFUSAL_PROVEN")

    # --- Step 3: prove compile_status is genuinely DERIVED, not narrative order -- one FAILing check among 7
    # PASS MUST still derive REJECTED (Atlas's own "自由組裝，不是自由破壞"). ---
    one_fail_kwargs = copy.deepcopy(_well_formed_kwargs())
    one_fail_kwargs["checks"][3]["status"] = "FAIL"  # jurisdiction_check FAILs; the other 6 still PASS
    one_fail_kwargs["checks"][3]["note"] = "cross-border data transfer not cleared"
    rejected_chain = generate_expert_lego_chain("ELEGO-2026-09-12-002", **one_fail_kwargs)
    if rejected_chain["compile_status"] != "REJECTED":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ELEGO_DERIVATION_NOT_ENFORCED: a chain with 1 FAILing check among 7 derived {rejected_chain['compile_status']!r}, expected REJECTED")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OneFailDerivesRejected", {"rejected_chain": rejected_chain}, 1.4)
    milestones.append("REJECTED_DERIVATION_PROVEN")

    # --- Step 4: hand-tampering proof -- a record that bypasses the builder entirely and hand-asserts
    # `compile_status: COMPILED` alongside a FAILing check is independently caught by the
    # compile_status_consistency gate (the builder itself has NO parameter for this at all). ---
    tampered = copy.deepcopy(rejected_chain)
    tampered["compile_status"] = "COMPILED"
    tampered_gate = evaluate_compile_status_consistency_gate(tampered, "run_expert_lego_mode_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ELEGO_GATE_NOT_INDEPENDENT: the independent compile_status_consistency gate did NOT catch a hand-asserted COMPILED status alongside a FAILing check")
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
        "expert_lego_chain": chain,
        "gate_results": gate_results,
        "missing_check_refusal_proof": missing_check_refusal_proof,
        "rejected_chain": rejected_chain,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "expert_lego_mode_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_expert_lego_mode_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.expert_lego_mode: ExpertLegoChain {result['expert_lego_chain']['id']} built "
        f"(3 steps, 7/7 checks PASS -> {result['expert_lego_chain']['compile_status']}), gates [{gate_summary}]; "
        f"ELEGO_MISSING_CHECK REFUSED a 6-check attempt ({result['missing_check_refusal_proof']['error_code']}); "
        f"1 FAILing check among 7 correctly derived {result['rejected_chain']['compile_status']} (never COMPILED); "
        f"hand-asserted COMPILED-despite-FAIL caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
