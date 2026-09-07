"""``security.security_control_mapping`` vertical slice -- the fifty-third Method Atlas slice, TENTH and
LAST member of the `security` family (F20), closing F20 10/10.

Builds a REAL STRIDE record first (via `security.stride`, an already-built sibling method -- this method's
own consumption design means it has nothing to map controls against without one), then builds a
`security.security_control_mapping` record that classifies that STRIDE record's own `threats[]` into
Atlas's own literal preventive/detective/recovery vocabulary with structured, auditable evidence. Then
proves the two real invariants at BOTH layers: WITHIN-RECORD control_id referential integrity and
CROSS-RECORD source_threat_index/element_name/category integrity, at the CONSTRUCTION layer (both must
refuse malformed input) and at the GATE layer in BOTH its disclosed modes -- full cross-record
re-verification (source_record supplied) and the weaker, fully self-contained fallback (source_record
omitted), confirming the fallback still catches a real tamper case (the "delete the last unmapped entry"
gap the source_threat_count field exists to close) even with zero access to the external record's live
content.

Run::

    python -m ai_lego.apps.cli.run_security_control_mapping_slice
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
from ai_lego.modules.security.security_control_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_security_control_mapping_gates,
    evaluate_security_control_mapping_integrity_gate,
    generate_security_control_mapping_record,
)
from ai_lego.modules.security.stride import METHOD_ID as STRIDE_METHOD_ID
from ai_lego.modules.security.stride import generate_stride_threat_model_record
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SECURITY-CONTROL-MAPPING-SYNTHETIC-001"
EXECUTION_ID = "EX-SECURITY-CONTROL-MAPPING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SECURITY-CONTROL-MAPPING-001"

S = {
    "stride_record": "ai-lego://specs/cognitive/typed-objects/stride-threat-model-record.schema.yaml",
    "scm_record": "ai-lego://specs/cognitive/typed-objects/security-control-mapping-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _evidence(description: str, verified_by: str, verified_date: str) -> dict[str, str]:
    return {"description": description, "verified_by": verified_by, "verified_date": verified_date}


def _control(control_id: str, category: str, description: str, evidence: dict[str, str]) -> dict[str, Any]:
    return {"control_id": control_id, "category": category, "description": description, "evidence": evidence}


def _mapping(index: int, element_name: str, category: str, control_id: str) -> dict[str, Any]:
    return {"source_threat_index": index, "source_threat_element_name": element_name, "source_threat_category": category, "control_id": control_id}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-security-control-mapping-slice"


def run_security_control_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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
    resolution = catalog.resolve([METHOD_ID, STRIDE_METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: a REAL upstream STRIDE record (security.security_control_mapping's own consumption design
    # means it has nothing to classify without one). Two threats against an internal admin-tools RBAC
    # service, so this slice can demonstrate BOTH a fully-covered threat (defense in depth: preventive AND
    # detective controls) and a genuinely uncovered one (surfaced, not enforced). ---
    _, stride_record = catalog.invoke(
        STRIDE_METHOD_ID,
        generate_stride_threat_model_record,
        "STRIDE-2026-09-06-010",
        "internal admin-tools RBAC service",
        ["role assignment records", "admin session tokens"],
        [{"name": "public internet to admin console", "description": "Unauthenticated traffic crosses into the authenticated admin perimeter here."}],
        ["POST /admin/roles/assign"],
        [
            {"name": "admin_console_process", "element_type": "process"},
            {"name": "role_assignment_store", "element_type": "data_store"},
        ],
        [
            {
                "element_name": "admin_console_process",
                "category": "elevation_of_privilege",
                "description": "A malformed role-assignment request could bypass server-side checks and grant an admin role to an unprivileged account.",
                "control": "Role checks enforced server-side via a shared authorization middleware, not client-supplied claims.",
                "residual_risk": "Low -- middleware is covered by its own unit tests.",
                "test_evidence": "Verified via authorization bypass test suite, run AUTHZ-2026-09-01.",
            },
            {
                "element_name": "role_assignment_store",
                "category": "tampering",
                "description": "Direct database access could alter a role assignment row without going through the audited application path.",
                "control": "Database access restricted to the application's own service account; no direct operator write access in production.",
                "residual_risk": "Medium -- break-glass operator access still exists for incident response.",
                "test_evidence": "Access control policy audit, 2026-08-20.",
            },
        ],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["stride_record"], stride_record, "upstream STRIDE record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StrideThreatModelRecordGenerated", {"stride_record": stride_record}, 1)
    milestones.append("UPSTREAM_METHOD_EXECUTED")

    # --- Step 2: the REAL security.security_control_mapping record. Threat 0 (elevation_of_privilege) gets
    # TWO controls (defense in depth); threat 1 (tampering) is deliberately left unmapped. ---
    controls = [
        _control("CTRL-001", "preventive", "Role checks enforced server-side via a shared authorization middleware, not client-supplied claims.", _evidence("Authorization bypass test suite, run AUTHZ-2026-09-01, zero bypasses found.", "Security Engineering", "2026-09-01")),
        _control("CTRL-002", "detective", "Anomalous role-elevation attempts against admin_console_process are alerted via the audit log pipeline within 5 minutes.", _evidence("Alert fired and confirmed within SLA during the same AUTHZ-2026-09-01 exercise.", "Security Engineering", "2026-09-01")),
    ]
    control_mappings = [
        _mapping(0, "admin_console_process", "elevation_of_privilege", "CTRL-001"),
        _mapping(0, "admin_console_process", "elevation_of_privilege", "CTRL-002"),
    ]
    descriptor, scm_record = catalog.invoke(
        METHOD_ID,
        generate_security_control_mapping_record,
        "SCM-2026-09-06-001",
        "internal admin-tools RBAC service, control-mapping pass",
        stride_record,
        "stride",
        controls,
        control_mappings,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["scm_record"], scm_record, "security control mapping record")
    if scm_record["source_threats_with_no_control_mapping"] != [{"source_threat_index": 1, "source_threat_element_name": "role_assignment_store", "source_threat_category": "tampering"}]:
        raise InvariantViolation(f"SCM_EXPECTED_REAL_GAP: expected the tampering threat to surface as unmapped, got {scm_record['source_threats_with_no_control_mapping']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SecurityControlMappingRecordGenerated", {"scm_record": scm_record, "method_descriptor": descriptor}, 1.1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_security_control_mapping_gates(scm_record, "run_security_control_mapping_slice", clock.at(1.15), source_record=stride_record)
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"security_control_mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SecurityControlMappingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the CROSS-RECORD referential integrity invariant is real, at the CONSTRUCTION layer: a
    # control_mappings entry whose own denormalized element_name disagrees with what the REAL stride_record
    # actually has at that index must be refused, even though every other field is well-shaped. ---
    mismatched_mappings = [_mapping(0, "the_wrong_element_name", "elevation_of_privilege", "CTRL-001")]
    cross_record_guard_fired = False
    try:
        generate_security_control_mapping_record("SCM-2026-09-06-002", "s", stride_record, "stride", controls, mismatched_mappings, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        cross_record_guard_fired = "SCM_INVALID_CONTROL_MAPPINGS" in str(error)
    if not cross_record_guard_fired:
        raise InvariantViolation("SCM_CROSS_RECORD_GUARD_DID_NOT_FIRE: a control_mapping whose element_name disagrees with the real source_record was accepted (or a different guard fired instead)")

    # --- Prove the WITHIN-RECORD referential integrity invariant is real, at the CONSTRUCTION layer: a
    # control_mappings entry naming a control_id that does not exist in controls[] must be refused. ---
    dangling_control_mappings = [_mapping(0, "admin_console_process", "elevation_of_privilege", "CTRL-999")]
    within_record_guard_fired = False
    try:
        generate_security_control_mapping_record("SCM-2026-09-06-003", "s", stride_record, "stride", controls, dangling_control_mappings, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        within_record_guard_fired = "SCM_INVALID_CONTROL_MAPPINGS" in str(error)
    if not within_record_guard_fired:
        raise InvariantViolation("SCM_WITHIN_RECORD_GUARD_DID_NOT_FIRE: a control_mapping naming a nonexistent control_id was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer, FULL mode: take
    # a COPY of the real, valid record, hand-tamper its OWN source_threats_with_no_control_mapping to hide
    # the real gap (claim full coverage), and confirm the gate catches it WHEN given the real stride_record. ---
    tampered_hidden_gap = copy.deepcopy(scm_record)
    tampered_hidden_gap["source_threats_with_no_control_mapping"] = []
    full_mode_result = evaluate_security_control_mapping_integrity_gate(tampered_hidden_gap, "run_security_control_mapping_slice", clock.at(1.25), source_record=stride_record)
    full_mode_blocked = full_mode_result["status"] == "FAIL" and "disagrees with recomputation" in full_mode_result["evidence"][0]["reason"]
    if not full_mode_blocked:
        raise InvariantViolation(f"SCM_GATE_FULL_MODE_GUARD_DID_NOT_FIRE: hidden coverage gap was not caught with the real source_record supplied (status={full_mode_result['status']}, evidence={full_mode_result['evidence']})")

    # --- Prove the WEAKER, fully self-contained fallback (no source_record passed) still catches the SAME
    # tamper -- this is the real value of storing source_threat_count: without it, deleting the only unmapped
    # entry would leave the remaining (fully covered) indices looking accidentally contiguous. First confirm
    # the UNTAMPERED record legitimately passes in self-contained mode. ---
    self_contained_valid = evaluate_security_control_mapping_integrity_gate(scm_record, "run_security_control_mapping_slice", clock.at(1.3))
    if self_contained_valid["status"] != "PASS" or self_contained_valid["evidence"][0].get("mode") != "self_contained_no_source_record":
        raise InvariantViolation(f"SCM_SELF_CONTAINED_MODE_UNEXPECTED_RESULT: {self_contained_valid}")
    self_contained_result = evaluate_security_control_mapping_integrity_gate(tampered_hidden_gap, "run_security_control_mapping_slice", clock.at(1.35))
    self_contained_blocked = self_contained_result["status"] == "FAIL" and "0..source_threat_count-1" in self_contained_result["evidence"][0]["reason"]
    if not self_contained_blocked:
        raise InvariantViolation(
            f"SCM_GATE_SELF_CONTAINED_GUARD_DID_NOT_FIRE: hidden coverage gap was not caught WITHOUT the real source_record "
            f"(status={self_contained_result['status']}, evidence={self_contained_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "SecurityControlMappingInvariantVerified",
        {
            "cross_record_guard_fired": cross_record_guard_fired,
            "within_record_guard_fired": within_record_guard_fired,
            "full_mode_blocked": full_mode_blocked,
            "self_contained_blocked": self_contained_blocked,
        },
        1.4,
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
        "stride_record": stride_record,
        "scm_record": scm_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "cross_record_guard_fired": cross_record_guard_fired,
            "within_record_guard_fired": within_record_guard_fired,
            "full_mode_blocked": full_mode_blocked,
            "self_contained_blocked": self_contained_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "security_control_mapping_slice_result.json", result)
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
        result = run_security_control_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["scm_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.security_control_mapping: {len(record['controls'])} controls, {len(record['control_mappings'])} mappings, "
        f"{len(record['source_threats_with_no_control_mapping'])} unmapped threat(s), gates [{gate_summary}], "
        f"invariant_verified(cross_record={v['cross_record_guard_fired']}, within_record={v['within_record_guard_fired']}, "
        f"gate_full={v['full_mode_blocked']}, gate_self_contained={v['self_contained_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
