"""``database_data.schema_compatibility_analysis`` vertical slice -- Method Atlas slice, TENTH and LAST
member of the `database_data` family (F21), closing F21 10/10. See
``ai_lego.modules.database_data.schema_compatibility_analysis``'s own module docstring for the full
due-diligence read (confirmed distinct from expand_contract_migration's own compatibility_analysis STAGE and
data_contract's own compatibility_policy FIELD, zero pre-existing implementation confirmed by whole-tree
grep).

Ties into `database_data.expand_contract_migration`'s own existing demo scenario (``run_expand_contract_
migration_slice.py``, "orders table: add customer_tier column, 2026-Q3", record id ``ECMIG-2026-09-05-002``)
via ``migration_ref`` -- a format-only soft link, not fetched (that other module is NOT invoked here).

Demonstrates both real invariants, each at BOTH layers:

1. A SAFE record (2 compatible changes -> overall_verdict=safe_for_zero_downtime) and a RISKY record (3
   breaking + 1 compatible change -> overall_verdict=requires_coordinated_deploy, the WORST-OF-ALL reduction
   forced by a minority of breaking changes) are both built and schema-validated.
2. Construction-time REFUSAL: an unknown change_type is refused before any record is built
   (SCHEMACOMPAT_INVALID_CHANGE_SHAPE).
3. Gate-layer GENUINE_COMPUTE mismatch: a hand-tampered COPY of the risky record, with its stored
   overall_verdict overwritten to falsely claim safe_for_zero_downtime (lying to downplay 3 real breaking
   changes), bypasses the builder entirely -- the independent gate must catch the mismatch by re-deriving
   from changes[] itself, never trusting the stored field.

Run::

    python -m ai_lego.apps.cli.run_schema_compatibility_analysis_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.schema_compatibility_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_schema_compatibility_analysis_gates,
    generate_schema_compatibility_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SCHEMACOMPAT-SYNTHETIC-001"
EXECUTION_ID = "EX-SCHEMACOMPAT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SCHEMACOMPAT-001"

S = {
    "schema_compatibility_analysis_record": "ai-lego://specs/cognitive/typed-objects/schema-compatibility-analysis-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-schema-compatibility-analysis-slice"


def run_schema_compatibility_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A safe record: 2 compatible changes for the SAME migration expand_contract_migration's own demo
    # already tracks (ECMIG-2026-09-05-002) -- overall_verdict must be safe_for_zero_downtime. ---
    safe_changes = [
        {"change_type": "add_nullable_column", "target": "orders.customer_tier"},
        {"change_type": "add_index", "target": "orders.customer_tier", "notes": "supports the new tier-filter query path"},
    ]
    descriptor, safe_record = catalog.invoke(
        METHOD_ID,
        generate_schema_compatibility_analysis_record,
        "SCA-2026-09-10-001",
        "orders table: add customer_tier column, 2026-Q3",
        safe_changes,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
        migration_ref="ECMIG-2026-09-05-002",
    )
    contracts.validate(S["schema_compatibility_analysis_record"], safe_record, "safe schema compatibility analysis record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SchemaCompatibilityAnalysisRecordGenerated", {"schema_compatibility_analysis_record": safe_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    safe_gate_results = evaluate_schema_compatibility_analysis_gates(safe_record, "run_schema_compatibility_analysis_slice", clock.at(1.1))
    for gate in safe_gate_results:
        contracts.validate(S["gate_result"], gate, f"safe record gate {gate['gate_id']}")
    if not all_gates_pass(safe_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCHEMACOMPAT_GATE_FAILED: {[g['gate_id'] for g in safe_gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    if safe_record["overall_verdict"] != "safe_for_zero_downtime":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCHEMACOMPAT_DEMO_INVARIANT: expected safe_for_zero_downtime, got {safe_record['overall_verdict']!r}")
    milestones.append("GATES_PASSED")

    # --- A risky record: 3 breaking changes + 1 compatible one -- the WORST-OF-ALL reduction must still force
    # requires_coordinated_deploy, even though breaking changes are a minority. ---
    risky_changes = [
        {"change_type": "rename_column", "target": "orders.legacy_status", "notes": "renaming to orders.status"},
        {"change_type": "narrow_type", "target": "orders.amount_cents", "notes": "BIGINT -> INT"},
        {"change_type": "drop_column", "target": "orders.legacy_flag"},
        {"change_type": "add_index", "target": "orders.status"},
    ]
    _, risky_record = catalog.invoke(
        METHOD_ID,
        generate_schema_compatibility_analysis_record,
        "SCA-2026-09-10-002",
        "orders table: legacy_status rename + amount_cents narrowing, 2026-Q4",
        risky_changes,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["schema_compatibility_analysis_record"], risky_record, "risky schema compatibility analysis record")
    if risky_record["overall_verdict"] != "requires_coordinated_deploy":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCHEMACOMPAT_DEMO_INVARIANT: expected requires_coordinated_deploy (worst-of-all over 3 breaking + 1 compatible), got {risky_record['overall_verdict']!r}")

    # --- Prove the closed change_type vocabulary is real, at the CONSTRUCTION layer: an unknown change_type
    # must be refused BEFORE any record is built. ---
    construction_layer_blocked = False
    try:
        generate_schema_compatibility_analysis_record(
            "SCA-2026-09-10-003", "x", [{"change_type": "drop_table_entirely", "target": "orders"}], make_provenance("AI_INFERENCE", "AI_GENERATED")
        )
    except InvariantViolation as error:
        construction_layer_blocked = "SCHEMACOMPAT_INVALID_CHANGE_SHAPE" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("SCHEMACOMPAT_INVARIANT_GUARD_DID_NOT_FIRE: a change with an unknown change_type was accepted (or a different guard fired instead)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"construction_layer_blocked": construction_layer_blocked}, 1.3)
    milestones.append("REFUSAL_PROVEN")

    # --- Prove the GENUINE_COMPUTE invariant is real, at the independent GATE layer: hand-tamper a COPY of
    # the risky record's own overall_verdict to falsely claim safe_for_zero_downtime, lying about 3 real
    # breaking changes -- the gate must catch this by re-deriving from changes[] itself, not the builder. ---
    tampered = copy.deepcopy(risky_record)
    tampered["overall_verdict"] = "safe_for_zero_downtime"
    tampered_gate_results = evaluate_schema_compatibility_analysis_gates(tampered, "run_schema_compatibility_analysis_slice", clock.at(1.6))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "schema_compatibility_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0].get("reason") == "SCHEMACOMPAT_VERDICT_MISMATCH"
    if not gate_layer_blocked:
        raise InvariantViolation(f"SCHEMACOMPAT_GATE_GUARD_DID_NOT_FIRE: schema_compatibility_integrity did not flag the tampered overall_verdict (status={integrity_result['status']}, evidence={integrity_result['evidence']})")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedVerdictCaughtByGate", {"tampered_gate_results": tampered_gate_results}, 1.7)
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
        "safe_schema_compatibility_analysis_record": safe_record,
        "risky_schema_compatibility_analysis_record": risky_record,
        "gate_results": safe_gate_results,
        "invariant_verification": {
            "construction_layer_blocked": construction_layer_blocked,
            "gate_layer_blocked": gate_layer_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_expand_contract_migration_slice.py)",
    }
    write_json(runtime / "results" / "schema_compatibility_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_schema_compatibility_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    safe_record = result["safe_schema_compatibility_analysis_record"]
    risky_record = result["risky_schema_compatibility_analysis_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.schema_compatibility_analysis: safe record {safe_record['id']} verdict={safe_record['overall_verdict']!r}, "
        f"risky record {risky_record['id']} verdict={risky_record['overall_verdict']!r}, "
        f"gates [{gate_summary}], "
        f"invariant_verified(unknown_change_type_construction={v['construction_layer_blocked']}, tampered_verdict_gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
