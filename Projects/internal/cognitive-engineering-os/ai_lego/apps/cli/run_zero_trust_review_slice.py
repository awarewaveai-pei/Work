"""``security.zero_trust_review`` vertical slice -- the forty-ninth Method Atlas slice, SIXTH member of the
`security` family (F20), and the SECOND F20 member (after `security.dpia_pia`) that is NOT one of Execution
Contract §32's own four named Threat Review methods.

Builds an ILLUSTRATIVE, fully-compliant Zero Trust Review grounded in `docs/adr/ADR-016
-zero-trust-workload-identity-and-pdp-selection.md`'s own REAL ratified values (Zitadel / cloud-native mTLS
strategy / Cedar) -- explicitly NOT a claim that a real deployed access path was reviewed, since ADR-016's
own Migration section states infrastructure build-out is future work, not yet done (the same class of
disclosed gap `run_pasta_slice.py`'s own due diligence already establishes: no real-world usage instance
exists yet, for a different reason). Then proves TWO real invariants: the STAGE-1 REQUIRED-SET invariant at
the CONSTRUCTION layer (dropping the `resource` sub-entity must be refused even though subject/workload are
untouched), and the FORBIDDEN-CREDENTIAL-TYPE denylist at BOTH the CONSTRUCTION layer (a `shared_password`
credential_type must be refused) and the independent GATE layer (hand-tampering a copy's own credential_type
back to a forbidden value must be caught).

Run::

    python -m ai_lego.apps.cli.run_zero_trust_review_slice
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
from ai_lego.modules.security.zero_trust_review import (
    METHOD_ID,
    all_gates_pass,
    evaluate_zero_trust_review_gates,
    generate_zero_trust_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ZERO-TRUST-REVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-ZERO-TRUST-REVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ZERO-TRUST-REVIEW-001"

S = {
    "zero_trust_review_record": "ai-lego://specs/cognitive/typed-objects/zero-trust-review-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _identity_context(*, subject: dict[str, Any], workload: dict[str, Any], resource: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "identity_context", "subject": subject, "workload": workload, "resource": resource}


def _access_decision(**fields: Any) -> dict[str, Any]:
    base = {"stage_id": "access_decision", "pdp_engine_ref": None}
    base.update(fields)
    return base


def _credential_issuance(**fields: Any) -> dict[str, Any]:
    base = {"stage_id": "credential_issuance"}
    base.update(fields)
    return base


def _audit_trail(**fields: Any) -> dict[str, Any]:
    base = {"stage_id": "audit_trail"}
    base.update(fields)
    return base


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-zero-trust-review-slice"


def run_zero_trust_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- An ILLUSTRATIVE, fully-compliant Zero Trust Review, grounded in ADR-016's own REAL ratified values
    # (Zitadel / cloud-native mTLS strategy / Cedar) -- NOT a claim that a real deployed access path was
    # reviewed. See module docstring and method contract's own description for the full disclosure. ---
    compliant_stages = [
        _identity_context(
            subject={"subject_id": "agent:cognitive-os-runtime-001", "description": "AI agent executing an ai_lego method invocation on behalf of a tenant operator.", "idp_ref": "Zitadel"},
            workload={"workload_id": "workload:ai-lego-method-executor", "description": "The method-execution workload process that performs the invocation.", "workload_identity_strategy_ref": "cloud-native workload identity + short-lived-credential mTLS"},
            resource={"resource_id": "resource:event-ledger-nordbrook", "description": "The tenant's append-only Event Ledger.", "sensitivity_classification": "Confidential"},
        ),
        _access_decision(
            authn_method="mTLS client certificate, issued by the cloud-native workload identity provider",
            authn_verified=True,
            authz_decision="permit",
            least_privilege_confirmed=True,
            pdp_engine_ref="Cedar",
        ),
        _credential_issuance(
            credential_type="mtls_short_lived_cert",
            ttl_seconds=3600,
            issued_at="2026-09-06T00:00:00Z",
            mutual_authentication_confirmed=True,
        ),
        _audit_trail(
            audit_log_ref="ledger://nordbrook/audit/2026-09-06-001",
            continuous_monitoring_confirmed=True,
            resource_access_granted=True,
        ),
    ]
    descriptor, compliant_record = catalog.invoke(
        METHOD_ID,
        generate_zero_trust_review_record,
        "ZTR-2026-09-06-001",
        "AI agent invoking a Method Atlas capability against the tenant Event Ledger, as specified to comply with ADR-016 once its ratified infrastructure is deployed",
        compliant_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["zero_trust_review_record"], compliant_record, "compliant Zero Trust Review record")
    if [s["stage_id"] for s in compliant_record["stages"]] != list(("identity_context", "access_decision", "credential_issuance", "audit_trail")):
        raise InvariantViolation(f"ZTR_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in compliant_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZeroTrustReviewRecordGenerated", {"zero_trust_review_record": compliant_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_zero_trust_review_gates(compliant_record, "run_zero_trust_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"zero_trust_review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ZTR_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZeroTrustReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the STAGE-1 REQUIRED-SET invariant is real, at the CONSTRUCTION layer: dropping the
    # `resource` sub-entity must be refused, even though subject/workload are both untouched and well-shaped
    # (Atlas's own '/'-joined notation names a required set, not an optional or partial one). ---
    missing_resource_stages = copy.deepcopy(compliant_stages)
    del missing_resource_stages[0]["resource"]
    identity_set_guard_fired = False
    try:
        generate_zero_trust_review_record("ZTR-2026-09-06-002", "some-system", missing_resource_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        identity_set_guard_fired = "ZTR_INVALID_STAGES" in str(error)
    if not identity_set_guard_fired:
        raise InvariantViolation("ZTR_IDENTITY_SET_GUARD_DID_NOT_FIRE: identity_context missing its own required resource sub-entity was accepted (or a different guard fired instead)")

    # --- Prove the FORBIDDEN-CREDENTIAL-TYPE denylist is real, at the CONSTRUCTION layer: the SAME
    # compliant content, but credential_issuance's own credential_type downgraded to Master Plan §62's own
    # explicitly forbidden `shared_password` (L2652-2656). ---
    forbidden_credential_stages = copy.deepcopy(compliant_stages)
    forbidden_credential_stages[2]["credential_type"] = "shared_password"
    denylist_guard_fired = False
    try:
        generate_zero_trust_review_record("ZTR-2026-09-06-003", "some-system", forbidden_credential_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        denylist_guard_fired = "ZTR_INVALID_STAGES" in str(error)
    if not denylist_guard_fired:
        raise InvariantViolation("ZTR_DENYLIST_GUARD_DID_NOT_FIRE: a shared_password credential_type was accepted (or a different guard fired instead)")
    # Confirm the SAME record legalizes once credential_type is switched to a non-forbidden value (proves the
    # guard checks the SPECIFIC denylisted value, not merely "any string different from the original").
    forbidden_credential_stages[2]["credential_type"] = "oauth_token"
    _, relegalized_record = catalog.invoke(
        METHOD_ID,
        generate_zero_trust_review_record,
        "ZTR-2026-09-06-003",
        "some-system",
        forbidden_credential_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["zero_trust_review_record"], relegalized_record, "re-legalized non-forbidden-credential record")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid compliant record, hand-tamper its OWN credential_type back to a forbidden value (leaving
    # every other raw field untouched), pinned to the SPECIFIC zero_trust_review_integrity gate. ---
    tampered = copy.deepcopy(compliant_record)
    tampered["stages"][2]["credential_type"] = "long_lived_api_key"
    tampered_gate_results = evaluate_zero_trust_review_gates(tampered, "run_zero_trust_review_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "zero_trust_review_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"ZTR_GATE_GUARD_DID_NOT_FIRE: zero_trust_review_integrity did not flag the tampered forbidden credential_type "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ZeroTrustReviewInvariantVerified",
        {"identity_set_guard_fired": identity_set_guard_fired, "denylist_guard_fired": denylist_guard_fired, "gate_layer_blocked": gate_layer_blocked},
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
        "compliant_zero_trust_review_record": compliant_record,
        "relegalized_zero_trust_review_record": relegalized_record,
        "gate_results": gate_results,
        "invariant_verification": {"identity_set_guard_fired": identity_set_guard_fired, "denylist_guard_fired": denylist_guard_fired, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "zero_trust_review_slice_result.json", result)
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
        result = run_zero_trust_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["compliant_zero_trust_review_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.zero_trust_review: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(identity_set={v['identity_set_guard_fired']}, denylist={v['denylist_guard_fired']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
