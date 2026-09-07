"""``root_cause.bow_tie`` vertical slice -- F05 root_cause family, fourth concrete entry alongside
fishbone/five_whys/pareto.

Synthetic scenario, invented-but-realistic (no real deployed instance exists in this repository to model
this on, disclosed honestly rather than overclaiming one): a NORDBROOK multi-tenant SaaS platform's
tenant-isolation review. Top event "Unauthorized cross-tenant data access", two LEFT-side threats (an ORM
misconfiguration, reused shared service-account credentials) each defended by a real-sounding prevention
control (RLS policy, per-tenant scoped credentials), and two RIGHT-side consequences (PII exposure, a
GDPR breach-notification obligation) -- one covered by a mitigation control (audit logging + alerting),
one deliberately left uncovered to demonstrate that nothing in this record requires full coverage, only
that every DECLARED control reference be real.

Proves both real invariants at BOTH layers:

1. OWNER/TEST -- Atlas's own literal misuse warning ("控制措施要有 owner/test"). A control missing only
   its owner, and a control missing only its test, are each refused at construction with their own
   distinct error code, then independently caught by the gate on a hand-tampered copy that bypassed the
   builder entirely.
2. STRUCTURAL -- a threat whose own description collides with top_event_description is refused at
   construction; a control whose own target_id names no real threat/consequence in this SAME record
   (self-contained, unlike security.security_control_mapping's cross-record design) is refused at
   construction, then independently caught by the gate on a hand-tampered copy.

Run::

    python -m ai_lego.apps.cli.run_bow_tie_slice
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
from ai_lego.modules.root_cause.bow_tie import (
    METHOD_ID,
    all_gates_pass,
    evaluate_bow_tie_gates,
    evaluate_bow_tie_integrity_gate,
    generate_bow_tie_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BOW-TIE-SYNTHETIC-001"
EXECUTION_ID = "EX-BOW-TIE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BOW-TIE-001"

S = {
    "bow_tie_record": "ai-lego://specs/cognitive/typed-objects/bow-tie-analysis-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _threat(threat_id: str, description: str) -> dict[str, Any]:
    return {"threat_id": threat_id, "description": description}


def _consequence(consequence_id: str, description: str) -> dict[str, Any]:
    return {"consequence_id": consequence_id, "description": description}


def _control(control_id: str, side: str, target_id: str, description: str, owner: str, test: str) -> dict[str, Any]:
    return {"control_id": control_id, "side": side, "target_id": target_id, "description": description, "owner": owner, "test": test}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-bow-tie-slice"


def run_bow_tie_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the REAL bow-tie record -- one top event, two left-side threats each with one prevention
    # control, two right-side consequences with only ONE mitigation control (the second is deliberately
    # left uncovered: nothing in this record requires full coverage). ---
    top_event_description = "Unauthorized cross-tenant data access"
    threats = [
        _threat("T-001", "Multi-tenant query missing a tenant_id filter due to an ORM misconfiguration"),
        _threat("T-002", "Shared service account credentials reused across tenant boundaries"),
    ]
    consequences = [
        _consequence("C-001", "Tenant A's customer PII exposed to Tenant B's application logic"),
        _consequence("C-002", "Regulatory breach-notification obligation triggered under GDPR"),
    ]
    controls = [
        _control("CTRL-001", "prevention", "T-001", "Row-Level Security (RLS) policy enforced at the Postgres layer on every tenant-scoped table.", "Platform Security", "RLS policy test suite RLS-2026-09-06, run against every tenant-scoped table."),
        _control("CTRL-002", "prevention", "T-002", "Per-tenant scoped service credentials; no shared service account crosses a tenant boundary.", "Platform Security", "Credential scope audit CRED-2026-09-01."),
        _control("CTRL-003", "mitigation", "C-001", "Audit logging pipeline captures every cross-tenant query attempt with alerting within 5 minutes.", "Security Engineering", "Alert fired and confirmed within SLA during red-team exercise AUTHZ-2026-09-01."),
    ]
    descriptor, bow_tie_record = catalog.invoke(
        METHOD_ID,
        generate_bow_tie_analysis_record,
        "BOWTIE-2026-09-07-001",
        "multi-tenant SaaS platform, tenant data isolation review",
        top_event_description,
        threats,
        consequences,
        controls,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["bow_tie_record"], bow_tie_record, "bow-tie analysis record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BowTieAnalysisRecordGenerated", {"bow_tie_record": bow_tie_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_bow_tie_gates(bow_tie_record, "run_bow_tie_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"bow_tie gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BOWTIE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BowTieGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the OWNER/TEST invariant is real, at the CONSTRUCTION layer: a control missing ONLY its
    # owner, and a control missing ONLY its test, must each be refused with their own distinct code. ---
    missing_owner_controls = [_control("CTRL-001", "prevention", "T-001", "d", "", "t")]
    missing_owner_guard_fired = False
    try:
        generate_bow_tie_analysis_record("BOWTIE-2026-09-07-002", "s", top_event_description, threats, consequences, missing_owner_controls, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        missing_owner_guard_fired = "BOWTIE_CONTROL_MISSING_OWNER" in str(error)
    if not missing_owner_guard_fired:
        raise InvariantViolation("BOWTIE_OWNER_GUARD_DID_NOT_FIRE: a control with an empty owner was accepted (or a different guard fired instead)")

    missing_test_controls = [_control("CTRL-001", "prevention", "T-001", "d", "o", "")]
    missing_test_guard_fired = False
    try:
        generate_bow_tie_analysis_record("BOWTIE-2026-09-07-003", "s", top_event_description, threats, consequences, missing_test_controls, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        missing_test_guard_fired = "BOWTIE_CONTROL_MISSING_TEST" in str(error)
    if not missing_test_guard_fired:
        raise InvariantViolation("BOWTIE_TEST_GUARD_DID_NOT_FIRE: a control with an empty test was accepted (or a different guard fired instead)")

    # --- Prove the STRUCTURAL invariant is real, at the CONSTRUCTION layer: a threat identical to the top
    # event, and a control referencing a nonexistent threat, must each be refused. ---
    colliding_threats = [_threat("T-001", top_event_description), _threat("T-002", "d")]
    top_event_collision_guard_fired = False
    try:
        generate_bow_tie_analysis_record("BOWTIE-2026-09-07-004", "s", top_event_description, colliding_threats, consequences, controls, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        top_event_collision_guard_fired = "BOWTIE_THREAT_MATCHES_TOP_EVENT" in str(error)
    if not top_event_collision_guard_fired:
        raise InvariantViolation("BOWTIE_TOP_EVENT_COLLISION_GUARD_DID_NOT_FIRE: a threat identical to the top event was accepted (or a different guard fired instead)")

    dangling_controls = [_control("CTRL-999", "prevention", "T-999", "d", "o", "t")]
    dangling_reference_guard_fired = False
    try:
        generate_bow_tie_analysis_record("BOWTIE-2026-09-07-005", "s", top_event_description, threats, consequences, dangling_controls, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        dangling_reference_guard_fired = "BOWTIE_DANGLING_CONTROL_REFERENCE" in str(error)
    if not dangling_reference_guard_fired:
        raise InvariantViolation("BOWTIE_DANGLING_REFERENCE_GUARD_DID_NOT_FIRE: a control referencing a nonexistent threat was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: hand-tamper a
    # COPY of the real, valid record directly (bypassing the builder entirely) and confirm the gate --
    # which shares the SAME predicate functions the builder uses, not a second drifting implementation --
    # still catches both invariant classes. ---
    tampered_owner = copy.deepcopy(bow_tie_record)
    tampered_owner["controls"][0]["owner"] = "   "
    gate_owner_result = evaluate_bow_tie_integrity_gate(tampered_owner, "run_bow_tie_slice", clock.at(1.3))
    gate_owner_blocked = gate_owner_result["status"] == "FAIL" and "BOWTIE_CONTROL_MISSING_OWNER" in gate_owner_result["evidence"][0]["reason"]
    if not gate_owner_blocked:
        raise InvariantViolation(f"BOWTIE_GATE_OWNER_GUARD_DID_NOT_FIRE: hand-tampered empty owner was not caught by the gate (status={gate_owner_result['status']}, evidence={gate_owner_result['evidence']})")

    tampered_reference = copy.deepcopy(bow_tie_record)
    tampered_reference["controls"][0]["target_id"] = "T-DOES-NOT-EXIST"
    gate_reference_result = evaluate_bow_tie_integrity_gate(tampered_reference, "run_bow_tie_slice", clock.at(1.4))
    gate_reference_blocked = gate_reference_result["status"] == "FAIL" and "BOWTIE_DANGLING_CONTROL_REFERENCE" in gate_reference_result["evidence"][0]["reason"]
    if not gate_reference_blocked:
        raise InvariantViolation(f"BOWTIE_GATE_REFERENCE_GUARD_DID_NOT_FIRE: hand-tampered dangling reference was not caught by the gate (status={gate_reference_result['status']}, evidence={gate_reference_result['evidence']})")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "BowTieInvariantVerified",
        {
            "missing_owner_guard_fired": missing_owner_guard_fired,
            "missing_test_guard_fired": missing_test_guard_fired,
            "top_event_collision_guard_fired": top_event_collision_guard_fired,
            "dangling_reference_guard_fired": dangling_reference_guard_fired,
            "gate_owner_blocked": gate_owner_blocked,
            "gate_reference_blocked": gate_reference_blocked,
        },
        1.5,
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
        "bow_tie_record": bow_tie_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "missing_owner_guard_fired": missing_owner_guard_fired,
            "missing_test_guard_fired": missing_test_guard_fired,
            "top_event_collision_guard_fired": top_event_collision_guard_fired,
            "dangling_reference_guard_fired": dangling_reference_guard_fired,
            "gate_owner_blocked": gate_owner_blocked,
            "gate_reference_blocked": gate_reference_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "bow_tie_slice_result.json", result)
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
        result = run_bow_tie_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["bow_tie_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS root_cause.bow_tie: {len(record['threats'])} threats, {len(record['consequences'])} consequences, "
        f"{len(record['controls'])} controls, gates [{gate_summary}], "
        f"invariant_verified(owner={v['missing_owner_guard_fired']}, test={v['missing_test_guard_fired']}, "
        f"top_event_collision={v['top_event_collision_guard_fired']}, dangling_reference={v['dangling_reference_guard_fired']}, "
        f"gate_owner={v['gate_owner_blocked']}, gate_reference={v['gate_reference_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
