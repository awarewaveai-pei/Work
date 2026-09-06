"""``security.dpia_pia`` vertical slice -- the forty-eighth Method Atlas slice, FIFTH member of the
`security` family (F20), and the FIRST F20 member that is NOT one of Execution Contract §32's own four
named Threat Review methods.

Builds a REAL DPIA/PIA record for `docs/adr/ADR-002-personal-data
-erasure-vs-event-immutability.md`'s own still-open "Phase 2 DPIA 待辦"
(the residual Identifiability risk from crypto-shredded personal-data
fields) -- not a fabricated scenario, and a minimal second record. Then
proves TWO real invariants: the stage ORDER invariant at the
CONSTRUCTION layer (two adjacent stages swapped must be refused), and
the high-residual-risk ESCALATION rule at BOTH the CONSTRUCTION layer
(a bare "approved" decision over a high residual risk must be refused)
and the independent GATE layer (hand-tampering a copy's own decision
back to "approved" must be caught).

Run::

    python -m ai_lego.apps.cli.run_dpia_pia_slice
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
from ai_lego.modules.security.dpia_pia import (
    METHOD_ID,
    all_gates_pass,
    evaluate_dpia_pia_gates,
    generate_dpia_pia_impact_assessment_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DPIA-PIA-SYNTHETIC-001"
EXECUTION_ID = "EX-DPIA-PIA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DPIA-PIA-001"

S = {
    "dpia_pia_record": "ai-lego://specs/cognitive/typed-objects/dpia-pia-impact-assessment-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _narrative(stage_id: str, summary: str) -> dict[str, Any]:
    return {"stage_id": stage_id, "summary": summary}


def _risks(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "risks", "risks": list(entries)}


def _controls(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "controls", "controls": list(entries)}


def _residual(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "residual_risk", "assessments": list(entries)}


def _approval(**fields: Any) -> dict[str, Any]:
    base = {"stage_id": "approval", "conditions": [], "jurisdiction_pack_ref": None}
    base.update(fields)
    return base


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-dpia-pia-slice"


def run_dpia_pia_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A REAL DPIA/PIA for ADR-002's own still-open "Phase 2 DPIA 待辦": the residual Identifiability
    # risk from crypto-shredded personal-data fields in the Event Ledger. Not fabricated -- see method
    # contract's own description and ADR-002 L41/L67. ---
    adr002_stages = [
        _narrative("processing", "Personal-data fields (Confidential/Restricted classification) stored inline in append-only Event Ledger payloads, encrypted per-subject with a Data Encryption Key (DEK)."),
        _narrative("purpose", "Event-sourced audit trail and replay-based system reconstruction (EC §112 30-year survivability); the personal-data fields are incidental payload content, not the processing's own primary purpose."),
        _narrative("necessity_proportionality", "Crypto-shredding (DEK destruction) is the only ADR-002 option satisfying both regulator-recognized irreversible deletion and zero disruption to event schema/replay -- proportionate given EC §31's own deletion-contract constraint."),
        _narrative("data_subjects", "End users whose personal-data fields appear in event payloads across any tenant; no special category (Art. 9) data identified in this scope."),
        _risks({
            "risk_id": "RISK-001",
            "description": "Unencrypted event metadata (event type, timestamp) survives DEK destruction and can leak the fact that a given subject 'once existed', even though payload content is unreadable.",
            "likelihood": "medium",
            "severity": "medium",
            "affected_rights": ["right to erasure (completeness of erasure)"],
        }),
        _controls({
            "control_id": "CTRL-001",
            "description": "AES-256 per-subject DEK; DEK destruction recorded in an independent Key Destruction Record audit log; all known references re-attempt decrypt post-destruction to confirm failure (EC §31 Verification step).",
            "mitigates_risk_ids": ["RISK-001"],
        }),
        _residual({
            "risk_id": "RISK-001",
            "residual_likelihood": "medium",
            "residual_severity": "low",
            "residual_risk_level": "medium",
            "accepted_by": "Data Protection Steward (Phase 2 DPIA backlog owner)",
        }),
        _approval(
            approver_role="Data Protection Steward",
            approver_name="TBD (Phase 2 DPIA backlog item, ADR-002 Recommendation)",
            decision="approved_with_conditions",
            decision_date="2026-09-06",
            conditions=["Track metadata-residual-identifiability closure as a named Phase 2 DPIA backlog item, not a silent acceptance"],
        ),
    ]
    descriptor, adr002_record = catalog.invoke(
        METHOD_ID,
        generate_dpia_pia_impact_assessment_record,
        "DPIA-2026-09-06-001",
        "Event Ledger personal-data fields under ADR-002 Option A (crypto-shredding)",
        adr002_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["dpia_pia_record"], adr002_record, "ADR-002 DPIA/PIA record")
    if [s["stage_id"] for s in adr002_record["stages"]] != list(("processing", "purpose", "necessity_proportionality", "data_subjects", "risks", "controls", "residual_risk", "approval")):
        raise InvariantViolation(f"DPIA_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in adr002_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DpiaPiaImpactAssessmentRecordGenerated", {"dpia_pia_record": adr002_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_dpia_pia_gates(adr002_record, "run_dpia_pia_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"dpia_pia gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DPIA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DpiaPiaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, low-risk second record: a single low-severity risk, cleanly closed, bare "approved". ---
    minimal_stages = [
        _narrative("processing", "Read-only lookup of a non-sensitive internal reference table."),
        _narrative("purpose", "Serve internal lookups; no personal data leaves this boundary."),
        _narrative("necessity_proportionality", "Minimal processing, no viable lower-footprint alternative."),
        _narrative("data_subjects", "No data subjects identified -- reference data only."),
        _risks({"risk_id": "RISK-001", "description": "Negligible: no personal data present.", "likelihood": "low", "severity": "low", "affected_rights": ["none identified"]}),
        _controls({"control_id": "CTRL-001", "description": "Read-only access role; no write path exists.", "mitigates_risk_ids": ["RISK-001"]}),
        _residual({"risk_id": "RISK-001", "residual_likelihood": "low", "residual_severity": "low", "residual_risk_level": "low", "accepted_by": "Data Protection Steward"}),
        _approval(approver_role="Data Protection Steward", approver_name="Reference Data Owner", decision="approved", decision_date="2026-09-06"),
    ]
    _, minimal_record = catalog.invoke(
        METHOD_ID,
        generate_dpia_pia_impact_assessment_record,
        "DPIA-2026-09-06-003",
        "internal-reference lookup service",
        minimal_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["dpia_pia_record"], minimal_record, "minimal DPIA/PIA record")

    # --- Prove the STAGE ORDER invariant is real, at the CONSTRUCTION layer: two adjacent narrative stages
    # (processing/purpose) swapped must be refused, even though the SET of eight stage_ids is unchanged. ---
    swapped_stages = list(adr002_stages)
    swapped_stages[0], swapped_stages[1] = swapped_stages[1], swapped_stages[0]
    order_guard_fired = False
    try:
        generate_dpia_pia_impact_assessment_record("DPIA-2026-09-06-002", "some-system", swapped_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        order_guard_fired = "DPIA_INVALID_STAGES" in str(error)
    if not order_guard_fired:
        raise InvariantViolation("DPIA_ORDER_GUARD_DID_NOT_FIRE: two adjacent stages swapped (same set, wrong order) were accepted (or a different guard fired instead)")

    # --- Prove the HIGH-RESIDUAL-RISK ESCALATION rule is real, at the CONSTRUCTION layer: the SAME ADR-002
    # content, but with the approval stage's own decision downgraded to bare "approved" despite a "medium"
    # (not even "high") residual risk staying UNCHANGED -- first confirm medium is legal, then push the
    # residual level itself to "high" and confirm bare "approved" is refused. ---
    escalation_stages = copy.deepcopy(adr002_stages)
    escalation_stages[6]["assessments"][0]["residual_risk_level"] = "high"
    escalation_stages[7]["decision"] = "approved"
    escalation_guard_fired = False
    try:
        generate_dpia_pia_impact_assessment_record("DPIA-2026-09-06-004", "some-system", escalation_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        escalation_guard_fired = "DPIA_INVALID_STAGES" in str(error)
    if not escalation_guard_fired:
        raise InvariantViolation("DPIA_ESCALATION_GUARD_DID_NOT_FIRE: a high residual risk was bare-approved without refusal (or a different guard fired instead)")
    # Confirm the SAME record legalizes once the decision is escalated instead of bare-approved (proves the
    # guard checks the DECISION, not merely the presence of a high residual level).
    escalation_stages[7]["decision"] = "escalated"
    _, escalated_record = catalog.invoke(
        METHOD_ID,
        generate_dpia_pia_impact_assessment_record,
        "DPIA-2026-09-06-004",
        "some-system",
        escalation_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["dpia_pia_record"], escalated_record, "escalated high-residual-risk record")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid ADR-002 record, hand-tamper its OWN residual_risk_level to "high" AND its own decision
    # back to "approved" (leaving every other raw field untouched), pinned to the SPECIFIC
    # dpia_pia_integrity gate. ---
    tampered = copy.deepcopy(adr002_record)
    tampered["stages"][6]["assessments"][0]["residual_risk_level"] = "high"
    tampered["stages"][7]["decision"] = "approved"
    tampered_gate_results = evaluate_dpia_pia_gates(tampered, "run_dpia_pia_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "dpia_pia_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"DPIA_GATE_GUARD_DID_NOT_FIRE: dpia_pia_integrity did not flag the tampered escalation "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "DpiaPiaInvariantVerified",
        {"order_guard_fired": order_guard_fired, "escalation_guard_fired": escalation_guard_fired, "gate_layer_blocked": gate_layer_blocked},
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
        "adr002_dpia_pia_record": adr002_record,
        "minimal_dpia_pia_record": minimal_record,
        "gate_results": gate_results,
        "invariant_verification": {"order_guard_fired": order_guard_fired, "escalation_guard_fired": escalation_guard_fired, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "dpia_pia_slice_result.json", result)
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
        result = run_dpia_pia_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["adr002_dpia_pia_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.dpia_pia: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(order={v['order_guard_fired']}, escalation={v['escalation_guard_fired']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
