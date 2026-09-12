"""``jurisdiction.resolver`` vertical slice -- F23 jurisdiction family (Atlas L935, §11.53).

Builds a well-formed 3-dimension -> 2-jurisdiction resolution over a
synthetic cross-border processing scenario, then proves Atlas §11.53's own
"not country == XX" purpose is a real invariant, not mere narrative order: a
construction-time attempt to submit a resolution collapsed onto a SINGLE
declared dimension (when 3 were declared) is refused, and a hand-tampered
valid record (every ``derived_from_dimensions`` entry rewritten to the same
single dimension, bypassing the builder) is independently caught by the
dimension_coverage gate.

Run::

    python -m ai_lego.apps.cli.run_resolver_slice
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
from ai_lego.modules.jurisdiction.resolver import (
    METHOD_ID,
    all_gates_pass,
    evaluate_dimension_coverage_gate,
    evaluate_jurisdiction_resolution_gates,
    generate_jurisdiction_resolution,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-JRES-SYNTHETIC-001"
EXECUTION_ID = "EX-JRES-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-JRES-001"

S = {
    "jurisdiction_resolution": "ai-lego://specs/cognitive/typed-objects/jurisdiction-resolution-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-jurisdiction-resolver-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "declared_dimensions": [
            {"dimension": "USER_LOCATION", "value": "DE"},
            {"dimension": "DATA_SUBJECT_LOCATION", "value": "FR"},
            {"dimension": "PROCESSING_LOCATION", "value": "US"},
        ],
        "resolved_jurisdictions": [
            {"jurisdiction_id": "EU-GDPR", "derived_from_dimensions": ["USER_LOCATION", "DATA_SUBJECT_LOCATION"], "basis": "Users and data subjects both located in EU member states"},
            {"jurisdiction_id": "US-Federal", "derived_from_dimensions": ["PROCESSING_LOCATION"], "basis": "Processing occurs on US soil"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_resolver_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed resolution -- 3 declared dimensions, 2 jurisdictions, coverage = 3 distinct. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_jurisdiction_resolution,
        "JRES-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["jurisdiction_resolution"], record, "jurisdiction resolution")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "JurisdictionResolutionGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_jurisdiction_resolution_gates(record, "run_resolver_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"jurisdiction resolution gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"JRES_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "JurisdictionResolutionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.53's own "not country == XX" purpose is not toothless -- a resolution
    # collapsed onto a SINGLE declared dimension (when 3 were declared) MUST be refused before construction. ---
    collapsed_kwargs = copy.deepcopy(_well_formed_kwargs())
    collapsed_kwargs["resolved_jurisdictions"] = [
        {"jurisdiction_id": "EU-GDPR", "derived_from_dimensions": ["USER_LOCATION"], "basis": "Collapsed to user location only"},
    ]
    collapse_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_jurisdiction_resolution("JRES-COLLAPSED-REFUSED-001", **collapsed_kwargs)
    except InvariantViolation as error:
        if "JRES_INSUFFICIENT_DIMENSION_COVERAGE" not in str(error):
            raise
        collapse_refusal_proof["raised"] = True
        collapse_refusal_proof["error_code"] = "JRES_INSUFFICIENT_DIMENSION_COVERAGE"
    if not collapse_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("JRES_INVARIANT_NOT_ENFORCED: a single-dimension-collapsed resolution was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DimensionCollapseRefused", {"refusal_proof": collapse_refusal_proof}, 1.3)
    milestones.append("DIMENSION_COLLAPSE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT dimension_coverage gate catches the same defect
    # class even when a caller bypasses the builder entirely (rewriting every derived_from_dimensions entry
    # to the same single dimension after construction). ---
    tampered = copy.deepcopy(record)
    for j in tampered["resolved_jurisdictions"]:
        j["derived_from_dimensions"] = ["USER_LOCATION"]
    tampered_gate = evaluate_dimension_coverage_gate(tampered, "run_resolver_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("JRES_GATE_NOT_INDEPENDENT: the independent dimension_coverage gate did NOT catch a hand-tampered single-dimension collapse")
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
        "jurisdiction_resolution": record,
        "gate_results": gate_results,
        "collapse_refusal_proof": collapse_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "resolver_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_resolver_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.resolver: JurisdictionResolution {result['jurisdiction_resolution']['id']} built "
        f"(3 dimensions, 2 jurisdictions, coverage=3 distinct dimensions), gates [{gate_summary}]; "
        f"JRES_INSUFFICIENT_DIMENSION_COVERAGE REFUSED a single-dimension-collapse attempt ({result['collapse_refusal_proof']['error_code']}); "
        f"hand-tampered single-dimension collapse caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
