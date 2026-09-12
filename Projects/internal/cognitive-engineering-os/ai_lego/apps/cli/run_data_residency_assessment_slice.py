"""``jurisdiction.data_residency_assessment`` vertical slice -- F23 jurisdiction family (Atlas L943).

Builds a well-formed 2-data-class residency assessment (each data class
routed to >=1 region) over a synthetic PII/financial-records scenario, then
proves Atlas's own "regions->routing" pipeline stage is a real invariant, not
mere narrative order: a construction-time attempt to submit a data class with
NO routing decision at all is refused, and a hand-tampered valid record (all
routing decisions for one data class stripped after construction, bypassing
the builder) is independently caught by the routing_completeness gate.

Run::

    python -m ai_lego.apps.cli.run_data_residency_assessment_slice
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
from ai_lego.modules.jurisdiction.data_residency_assessment import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_residency_assessment_gates,
    evaluate_routing_completeness_gate,
    generate_data_residency_assessment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DRA-SYNTHETIC-001"
EXECUTION_ID = "EX-DRA-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DRA-001"

S = {
    "data_residency_assessment": "ai-lego://specs/cognitive/typed-objects/data-residency-assessment-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-data-residency-assessment-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "data_classes": [
            {"data_class_id": "DC-EU-CUSTOMER-PII", "description": "EU customer personally identifiable information", "subjects": ["EU residents"], "applicable_laws": ["LAW-GDPR"]},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "description": "Transaction and billing records", "subjects": ["EU residents", "US residents"], "applicable_laws": ["LAW-GDPR", "LAW-CCPA", "CONTRACT-PSP-DPA"]},
        ],
        "routing_decisions": [
            {"data_class_id": "DC-EU-CUSTOMER-PII", "region": "EU", "rationale": "GDPR data-minimization/localization preference -- no adequacy transfer mechanism in place"},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "region": "EU", "rationale": "Primary processing region for the EU-resident subset"},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "region": "US-EAST", "rationale": "US-resident subset processed under the PSP's US data processing agreement"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_data_residency_assessment_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed assessment -- 2 data classes, every one routed. ---
    descriptor, assessment = catalog.invoke(
        METHOD_ID,
        generate_data_residency_assessment,
        "DRA-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["data_residency_assessment"], assessment, "data residency assessment")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DataResidencyAssessmentGenerated", {"assessment": assessment, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_data_residency_assessment_gates(assessment, "run_data_residency_assessment_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"data residency assessment gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DRA_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DataResidencyAssessmentGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L943's own "regions->routing" pipeline stage is not toothless -- a data
    # class with ZERO routing decisions MUST be refused before any record is constructed. ---
    unrouted_kwargs = copy.deepcopy(_well_formed_kwargs())
    unrouted_kwargs["routing_decisions"] = [r for r in unrouted_kwargs["routing_decisions"] if r["data_class_id"] != "DC-FINANCIAL-RECORDS"]
    unrouted_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_data_residency_assessment("DRA-UNROUTED-REFUSED-001", **unrouted_kwargs)
    except InvariantViolation as error:
        if "DRA_UNROUTED_DATA_CLASS" not in str(error):
            raise
        unrouted_refusal_proof["raised"] = True
        unrouted_refusal_proof["error_code"] = "DRA_UNROUTED_DATA_CLASS"
    if not unrouted_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DRA_INVARIANT_NOT_ENFORCED: a data class with zero routing decisions was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnroutedDataClassRefused", {"refusal_proof": unrouted_refusal_proof}, 1.3)
    milestones.append("UNROUTED_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT routing_completeness gate catches the same
    # defect class even when a caller bypasses the builder entirely (every routing decision for
    # DC-FINANCIAL-RECORDS stripped from an already-valid record). ---
    tampered = copy.deepcopy(assessment)
    tampered["routing_decisions"] = [r for r in tampered["routing_decisions"] if r["data_class_id"] != "DC-FINANCIAL-RECORDS"]
    tampered_gate = evaluate_routing_completeness_gate(tampered, "run_data_residency_assessment_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DRA_GATE_NOT_INDEPENDENT: the independent routing_completeness gate did NOT catch a hand-tampered stripped-routing data class")
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
        "data_residency_assessment": assessment,
        "gate_results": gate_results,
        "unrouted_refusal_proof": unrouted_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "data_residency_assessment_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_data_residency_assessment_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.data_residency_assessment: DataResidencyAssessment {result['data_residency_assessment']['id']} built "
        f"(2 data classes, 3 routing decisions -- every class routed), gates [{gate_summary}]; "
        f"DRA_UNROUTED_DATA_CLASS REFUSED an unrouted-data-class attempt ({result['unrouted_refusal_proof']['error_code']}); "
        f"hand-tampered stripped-routing data class caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
