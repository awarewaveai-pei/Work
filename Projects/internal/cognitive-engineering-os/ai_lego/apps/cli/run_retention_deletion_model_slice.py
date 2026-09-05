"""``database_data.retention_deletion_model`` vertical slice -- the forty-third Method Atlas slice, ninth
and FINAL member of the `database_data` family. F21's own ten-row table is now fully accounted for (nine
built machine_ids plus one, Schema Compatibility Analysis, confirmed already covered by an existing sibling).

Builds a real customer-PII policy with two simultaneously active holds
(legal + regulatory) requiring a recorded conflict resolution, plus a
deletion_evidence_ref to an already-executed EC §31 deletion, and a
minimal internal-reference policy with zero holds. Then proves the
conflict-resolution invariant is real by attempting to construct a
record with two active holds and no conflict_resolution (construction
layer), and proves the "re-derived, not trusted" discipline at the
independent gate layer by hand-tampering a COPY of the valid record to
strip its own conflict_resolution while leaving both holds active
(gate layer).

Run::

    python -m ai_lego.apps.cli.run_retention_deletion_model_slice
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
from ai_lego.modules.database_data.retention_deletion_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_retention_deletion_gates,
    generate_retention_deletion_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RETENTIONDELETION-SYNTHETIC-001"
EXECUTION_ID = "EX-RETENTIONDELETION-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RETENTIONDELETION-001"

S = {
    "retention_deletion_record": "ai-lego://specs/cognitive/typed-objects/retention-deletion-model-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _hold(hold_type: str, reason: str, active: bool) -> dict[str, Any]:
    return {"hold_type": hold_type, "reason": reason, "active": active}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-retention-deletion-model-slice"


def run_retention_deletion_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real customer-PII policy: two simultaneously active holds (legal + regulatory) requiring a
    # recorded conflict resolution, plus a deletion_evidence_ref to an already-executed EC §31 deletion. ---
    descriptor, pii_record = catalog.invoke(
        METHOD_ID,
        generate_retention_deletion_model_record,
        "RDM-2026-09-06-001",
        "customer PII",
        "Fraud investigation and regulatory reporting for completed transactions.",
        "7 years from transaction completion date, per financial record-keeping regulation.",
        "Automated purge job, 30 days after retention period ends and no active holds remain.",
        [
            _hold("legal_hold", "Litigation hold, Smith v. Acme, filed 2026-08-01", True),
            _hold("regulatory_hold", "Open regulatory inquiry, Case #RQ-2026-4471", True),
            _hold("user_deletion_request", "GDPR erasure request DSAR-2026-0912, superseded by active holds", False),
        ],
        "Legal review approved retention schedule 2026-01-15, see LEGAL-REVIEW-2026-001.",
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        conflict_resolution="Legal and regulatory holds both take precedence over the user deletion request until both are lifted; counsel confirmed 2026-09-01.",
        schema_ref="ERD-2026-09-05-001",
        deletion_evidence_ref="DEL-2026-01-001",
    )
    contracts.validate(S["retention_deletion_record"], pii_record, "customer-PII retention/deletion record")
    if len(pii_record["holds"]) != 3 or sum(1 for h in pii_record["holds"] if h["active"]) != 2:
        raise InvariantViolation(f"RETENTIONDELETION_EXPECTED_TWO_ACTIVE_HOLDS: got {pii_record['holds']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RetentionDeletionModelRecordGenerated", {"retention_deletion_record": pii_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_retention_deletion_gates(pii_record, "run_retention_deletion_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"retention/deletion gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RETENTIONDELETION_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RetentionDeletionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal policy for an internal reference dataset, zero holds, no optional fields. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_retention_deletion_model_record,
        "RDM-2026-09-06-002",
        "internal reference: country codes",
        "Reference lookup data with no personal or regulated content.",
        "Retained indefinitely; no regulatory retention period applies.",
        "Manual deletion only, if the dataset is decommissioned.",
        [],
        "Data classification review confirmed no PII or regulated content, 2026-09-01.",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["retention_deletion_record"], reference_record, "internal-reference retention/deletion record")
    if "conflict_resolution" in reference_record:
        raise InvariantViolation("RETENTIONDELETION_UNEXPECTED_CONFLICT_RESOLUTION: should be absent when there are zero holds")

    # --- Prove the conflict-resolution invariant is real, at the CONSTRUCTION layer: two active holds, no
    # conflict_resolution. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_retention_deletion_model_record(
            "RDM-2026-09-06-003",
            "some data class",
            "some purpose",
            "some retention rule",
            "some deletion trigger",
            [_hold("legal_hold", "hold A", True), _hold("regulatory_hold", "hold B", True)],
            "some evidence",
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("RETENTIONDELETION_INVARIANT_GUARD_DID_NOT_FIRE: two active holds with no conflict_resolution was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid PII record (genuinely 2 active holds + a real conflict_resolution) and hand-tamper it
    # to DELETE its own conflict_resolution, leaving both holds' own active:true UNTOUCHED. Pinned to the
    # SPECIFIC retention_deletion_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(pii_record)
    del tampered["conflict_resolution"]
    tampered_gate_results = evaluate_retention_deletion_gates(tampered, "run_retention_deletion_model_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "retention_deletion_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0]["reason"] == "conflict_resolution inconsistent with the active-hold count"
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"RETENTIONDELETION_GATE_GUARD_DID_NOT_FIRE: retention_deletion_integrity did not flag the missing conflict_resolution "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "RetentionDeletionInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        1.3,
    )
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
        "pii_retention_deletion_record": pii_record,
        "reference_retention_deletion_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_data_quality_dimensions_slice.py)",
    }
    write_json(runtime / "results" / "retention_deletion_model_slice_result.json", result)
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
        result = run_retention_deletion_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["pii_retention_deletion_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    active_holds = sum(1 for h in record["holds"] if h["active"])
    print(
        f"PASS database_data.retention_deletion_model: {len(record['holds'])} holds ({active_holds} active), "
        f"conflict_resolution={'present' if 'conflict_resolution' in record else 'absent'}, "
        f"deletion_evidence_ref={record.get('deletion_evidence_ref')}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
