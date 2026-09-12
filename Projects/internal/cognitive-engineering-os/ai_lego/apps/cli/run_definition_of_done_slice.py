"""``delivery.definition_of_done`` vertical slice -- F22 PM/Delivery/Governance Pack (Atlas L923, §12.42).

Builds a fully-DONE record (all 12 §12.42 dimensions MET or NOT_APPLICABLE)
over a synthetic bugfix PR, then proves §12.42's own "防止...修到能跑就關單"
benefit is a real invariant, not mere narrative order: a construction-time
attempt to submit a record MISSING one of the 12 dimensions (Rollback) is
refused, and a hand-tampered record (a genuinely NOT_MET Security dimension,
with ``overall_status`` forced to DONE anyway, bypassing the builder) is
independently caught by the ``status_derivation`` gate.

Run::

    python -m ai_lego.apps.cli.run_definition_of_done_slice
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
from ai_lego.modules.delivery.definition_of_done import (
    DIMENSIONS,
    METHOD_ID,
    all_gates_pass,
    evaluate_definition_of_done_gates,
    evaluate_status_derivation_gate,
    generate_definition_of_done,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DOD-SYNTHETIC-001"
EXECUTION_ID = "EX-DOD-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DOD-001"

S = {
    "definition_of_done": "ai-lego://specs/cognitive/typed-objects/definition-of-done-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-definition-of-done-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "target": "PR #482: hybrid retrieval vector half no longer trusts implicit RPC row order",
        "dimensions": {
            "functional": {"status": "MET", "note": "manual repro + fix verified against production query"},
            "tests": {"status": "MET", "note": "3 new unit tests, all pass"},
            "security": {"status": "NOT_APPLICABLE", "note": "no auth/permission surface touched"},
            "privacy": {"status": "NOT_APPLICABLE", "note": "no PII field touched"},
            "data": {"status": "MET", "note": "no schema change; read-path only"},
            "observability": {"status": "MET", "note": "existing query logs already capture the affected path"},
            "capacity": {"status": "NOT_APPLICABLE", "note": "no new load introduced"},
            "documentation": {"status": "MET", "note": "WORKLOG 2026-09-12 entry written"},
            "migration": {"status": "NOT_APPLICABLE", "note": "no DB migration involved"},
            "rollback": {"status": "MET", "note": "single-commit revert, no data migration to undo"},
            "recovery": {"status": "NOT_APPLICABLE", "note": "no new failure mode introduced"},
            "evidence": {"status": "MET", "note": "REALTEST_EVIDENCE line in WORKLOG"},
        },
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_definition_of_done_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed, fully-DONE record -- all 12 §12.42 dimensions MET or NOT_APPLICABLE. ---
    descriptor, dod = catalog.invoke(
        METHOD_ID,
        generate_definition_of_done,
        "DOD-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["definition_of_done"], dod, "definition of done record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DefinitionOfDoneGenerated", {"definition_of_done": dod, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_definition_of_done_gates(dod, "run_definition_of_done_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"definition of done gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DOD_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DefinitionOfDoneGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §12.42's own 12-dimension gate is not toothless -- a record MISSING one dimension
    # (Rollback dropped entirely) MUST be refused before any record is constructed. ---
    missing_dimension_kwargs = copy.deepcopy(_well_formed_kwargs())
    del missing_dimension_kwargs["dimensions"]["rollback"]
    missing_dimension_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_definition_of_done("DOD-MISSING-DIMENSION-REFUSED-001", **missing_dimension_kwargs)
    except InvariantViolation as error:
        if "DOD_INVALID_DIMENSIONS" not in str(error):
            raise
        missing_dimension_refusal_proof["raised"] = True
        missing_dimension_refusal_proof["error_code"] = "DOD_INVALID_DIMENSIONS"
    if not missing_dimension_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DOD_INVARIANT_NOT_ENFORCED: a record missing a required §12.42 dimension was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingDimensionRefused", {"refusal_proof": missing_dimension_refusal_proof}, 1.3)
    milestones.append("MISSING_DIMENSION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT status_derivation gate catches the same defect
    # class even when a caller bypasses the builder entirely (Security flipped to a genuine NOT_MET, but
    # overall_status left forced at DONE -- exactly the "修到能跑就關單" anti-pattern §12.42 names). ---
    tampered = copy.deepcopy(dod)
    tampered["dimensions"]["security"] = {"status": "NOT_MET", "note": "known XSS in the affected form, fix deferred"}
    tampered_gate = evaluate_status_derivation_gate(tampered, "run_definition_of_done_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DOD_GATE_NOT_INDEPENDENT: the independent status_derivation gate did NOT catch a NOT_MET dimension left under a forced DONE overall_status")
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
        "definition_of_done": dod,
        "gate_results": gate_results,
        "missing_dimension_refusal_proof": missing_dimension_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "dimension_count": len(DIMENSIONS),
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "definition_of_done_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_definition_of_done_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.definition_of_done: DefinitionOfDoneRecord {result['definition_of_done']['id']} built "
        f"(all {result['dimension_count']} §12.42 dimensions declared, overall_status={result['definition_of_done']['overall_status']!r}), gates [{gate_summary}]; "
        f"DOD_INVALID_DIMENSIONS REFUSED a missing-dimension attempt ({result['missing_dimension_refusal_proof']['error_code']}); "
        f"hand-tampered NOT_MET-under-forced-DONE caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
