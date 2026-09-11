"""``stakeholders.stakeholder_map`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member
(F07 had zero built methods before this batch; 1 of 10 concurrent agents opening every F07 member in this
same parallel batch).

Scenario: a stakeholder map for a municipal transit-fare pilot, covering 3 of the 4 relationship_types --
same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``StakeholderMap``
satisfying all 3 real invariants (non-empty map, per-entry shape, whole-map relationship_types coverage
>=2), then demonstrates 2 invariants each as a construction-time REFUSAL (an entry with an empty name; a map
where every entry is tagged only DIRECT), proving neither is toothless, same "show a real refusal, not only a
real success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_stakeholder_map_slice
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
from ai_lego.modules.stakeholders.stakeholder_map import (
    BENEFICIARY,
    DIRECT,
    INDIRECT,
    METHOD_ID,
    RISK_BEARER,
    all_gates_pass,
    evaluate_stakeholder_map_gates,
    generate_stakeholder_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STKMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-STKMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STKMAP-001"

S = {
    "stakeholder_map": "ai-lego://specs/cognitive/typed-objects/stakeholder-map.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-stakeholder-map-slice"


def _well_formed_stakeholders() -> list[dict[str, Any]]:
    return [
        {"name": "市府交通局長", "category": "Policy Maker", "relationship_types": [DIRECT]},
        {"name": "每日通勤的市民", "category": "User", "relationship_types": [INDIRECT, BENEFICIARY]},
        {"name": "公車司機工會", "category": "Employee", "relationship_types": [DIRECT, RISK_BEARER]},
        {"name": "承包票證系統的廠商", "category": None, "relationship_types": [BENEFICIARY, RISK_BEARER]},
    ]


def run_stakeholder_map_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.stakeholder_map resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed map -- all 3 real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, stakeholder_map = catalog.invoke(
        METHOD_ID,
        generate_stakeholder_map,
        "STKMAP-2026-09-11-001",
        _well_formed_stakeholders(),
        make_provenance("EVIDENCE", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["stakeholder_map"], stakeholder_map, "stakeholder map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StakeholderMapGenerated", {"stakeholder_map": stakeholder_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stakeholder_map_gates(stakeholder_map, "run_stakeholder_map_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.stakeholder_map gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("STKMAP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant #2 (per-entry shape) is not toothless -- an entry with an empty name MUST
    # be refused before any record is constructed. ---
    empty_name_stakeholders = [*_well_formed_stakeholders(), {"name": "   ", "category": None, "relationship_types": [DIRECT]}]
    empty_name_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stakeholder_map("STKMAP-EMPTY-NAME-REFUSED-001", empty_name_stakeholders, make_provenance("EVIDENCE", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        if "STKMAP_INVALID_ENTRY" not in str(error):
            raise
        empty_name_refusal_proof["raised"] = True
        empty_name_refusal_proof["error_code"] = "STKMAP_INVALID_ENTRY"
    if not empty_name_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STKMAP_INVARIANT_NOT_ENFORCED: an entry with an empty name was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyNameEntryRefused", {"refusal_proof": empty_name_refusal_proof}, 1.3)
    milestones.append("EMPTY_NAME_REFUSAL_PROVEN")

    # --- Step 3: proof invariant #3 (whole-map relationship_types coverage) is not toothless -- a map where
    # every entry is tagged only DIRECT MUST be refused before any record is constructed. ---
    only_direct_stakeholders = [
        {"name": "決策者甲", "category": None, "relationship_types": [DIRECT]},
        {"name": "決策者乙", "category": None, "relationship_types": [DIRECT]},
    ]
    narrow_coverage_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stakeholder_map("STKMAP-NARROW-COVERAGE-REFUSED-001", only_direct_stakeholders, make_provenance("EVIDENCE", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        if "STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW" not in str(error):
            raise
        narrow_coverage_refusal_proof["raised"] = True
        narrow_coverage_refusal_proof["error_code"] = "STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW"
    if not narrow_coverage_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STKMAP_INVARIANT_NOT_ENFORCED: a map where every entry is tagged only DIRECT was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NarrowCoverageRefused", {"refusal_proof": narrow_coverage_refusal_proof}, 1.5)
    milestones.append("NARROW_COVERAGE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (collapses every entry's own relationship_types down to just [DIRECT] directly in
    # a VALID record's own raw dict, after construction). ---
    tampered = {**stakeholder_map, "stakeholders": [{**entry, "relationship_types": [DIRECT]} for entry in stakeholder_map["stakeholders"]]}
    tampered_gate = evaluate_stakeholder_map_gates(tampered, "run_stakeholder_map_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("STKMAP_GATE_NOT_INDEPENDENT: the independent relationship-coverage gate did NOT catch a hand-tampered all-DIRECT map")
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
        "stakeholder_map": stakeholder_map,
        "gate_results": gate_results,
        "empty_name_refusal_proof": empty_name_refusal_proof,
        "narrow_coverage_refusal_proof": narrow_coverage_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "stakeholder_map_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_stakeholder_map_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.stakeholder_map: StakeholderMap {result['stakeholder_map']['id']} built, gates [{gate_summary}]; "
        f"STKMAP_INVALID_ENTRY/STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW invariants each REFUSED a malformed attempt "
        f"({result['empty_name_refusal_proof']['error_code']}, {result['narrow_coverage_refusal_proof']['error_code']}); "
        f"hand-tampered all-DIRECT map caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
