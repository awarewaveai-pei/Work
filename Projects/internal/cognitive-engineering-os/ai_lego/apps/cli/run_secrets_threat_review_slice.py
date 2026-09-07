"""``security.secrets_threat_review`` vertical slice -- the fiftieth Method Atlas slice (provisional
ordinal), SIXTH member of the `security` family (F20), and the SECOND F20 member (after
`security.dpia_pia`) that is NOT one of Execution Contract Section 32's own four named Threat Review
methods.

Builds a REAL secrets threat review record modeling an ILLUSTRATIVE RECONSTRUCTION of `CLAUDE.md:17`'s
own real, closed, dated event ("前公司桌機憑證善後已於 2026-08-15 結案" -- former-employer desktop
machine credential cleanup, closed 2026-08-15, cross-confirmed by `agency-os/WORKLOG.md:3102` and
`:10499`) -- not a purely fabricated scenario, though the granular per-secret breakdown is disclosed as
a reasonable reconstruction, not verbatim source content (no mother document enumerates it). Then
proves TWO real invariants: the crypto-key-defers-to-vault rule at the CONSTRUCTION layer (a crypto_key
secret with a null key_vault_ref, and a non-crypto_key secret WITH one, must both be refused), and the
EC Section 33 exposure-response-flow rule (one-directional: an exposed secret left at NOT_TRIGGERED must
be refused; an UNEXPOSED secret may still be legitimately, proactively revoked -- the cleanup record's
own two secrets prove this is legal, not an over-constrained "no exposure implies no revocation" rule)
plus its own internal-consistency sub-check (triggered must always agree with flow_stage_reached), all
at the CONSTRUCTION layer, and the independent GATE layer (hand-tampering a copy back to a bare
NOT_TRIGGERED disposition over a real exposure finding must be caught).

Run::

    python -m ai_lego.apps.cli.run_secrets_threat_review_slice
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
from ai_lego.modules.security.secrets_threat_review import (
    METHOD_ID,
    all_gates_pass,
    evaluate_secrets_threat_review_gates,
    generate_secrets_threat_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SECRETS-THREAT-REVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-SECRETS-THREAT-REVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SECRETS-THREAT-REVIEW-001"

S = {
    "secrets_threat_review_record": "ai-lego://specs/cognitive/typed-objects/secrets-threat-review-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _inventory(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "inventory", "secrets": list(entries)}


def _storage(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "storage", "entries": list(entries)}


def _access(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "access", "entries": list(entries)}


def _rotation(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "rotation", "entries": list(entries)}


def _exposure(*findings: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "exposure", "findings": list(findings)}


def _revocation(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "revocation", "entries": list(entries)}


def _not_triggered() -> dict[str, Any]:
    return {"triggered": False, "flow_stage_reached": "NOT_TRIGGERED"}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-secrets-threat-review-slice"


def run_secrets_threat_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A REAL secrets threat review, illustrative reconstruction of CLAUDE.md:17's own closed
    # "former-employer desktop machine credential cleanup" (closed 2026-08-15). Two secrets: a crypto_key
    # (SSH client key material, defers to the Key Vault) and an ssh_key (git remote deploy key, no Vault
    # involvement). Both revoked on departure; no exposure found for either. ---
    cleanup_stages = [
        _inventory(
            {"secret_id": "SECRET-001", "secret_type": "crypto_key", "owner": "operator", "system_or_component": "local SSH client key material used for former-employer VPS access"},
            {"secret_id": "SECRET-002", "secret_type": "ssh_key", "owner": "operator", "system_or_component": "former-employer git remote deploy key"},
        ),
        _storage(
            {"secret_id": "SECRET-001", "storage_mechanism": "OS_KEYCHAIN", "exception_justification": None, "key_vault_ref": "kek:former-employer-desktop"},
            {"secret_id": "SECRET-002", "storage_mechanism": "OS_KEYCHAIN", "exception_justification": None, "key_vault_ref": None},
        ),
        _access(
            {"secret_id": "SECRET-001", "authorized_identities": ["operator (sole account on that desktop)"], "last_access_review_at": "2026-08-15"},
            {"secret_id": "SECRET-002", "authorized_identities": ["operator (sole account on that desktop)"], "last_access_review_at": "2026-08-15"},
        ),
        _rotation(
            {"secret_id": "SECRET-001", "rotation_interval": "NOT_APPLICABLE_SUPERSEDED_BY_REVOCATION", "last_rotated_at": None, "rotation_overdue": False},
            {"secret_id": "SECRET-002", "rotation_interval": "NOT_APPLICABLE_SUPERSEDED_BY_REVOCATION", "last_rotated_at": None, "rotation_overdue": False},
        ),
        _exposure(),  # no exposure findings for either secret
        _revocation(
            {"secret_id": "SECRET-001", "response_flow": {"triggered": True, "flow_stage_reached": "RESUMED"}},
            {"secret_id": "SECRET-002", "response_flow": {"triggered": True, "flow_stage_reached": "RESUMED"}},
        ),
    ]
    descriptor, cleanup_record = catalog.invoke(
        METHOD_ID,
        generate_secrets_threat_review_record,
        "SECR-2026-09-06-001",
        "former-employer-issued desktop workstation, post-departure credential cleanup",
        cleanup_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["secrets_threat_review_record"], cleanup_record, "former-employer desktop cleanup record")
    if [s["stage_id"] for s in cleanup_record["stages"]] != list(("inventory", "storage", "access", "rotation", "exposure", "revocation")):
        raise InvariantViolation(f"SECR_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in cleanup_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SecretsThreatReviewRecordGenerated", {"secrets_threat_review_record": cleanup_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_secrets_threat_review_gates(cleanup_record, "run_secrets_threat_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"secrets_threat_review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SECR_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SecretsThreatReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal second record: a single api_key secret with an ACTUAL exposure finding, properly
    # revoked -- proves the exposed-secret side of the EC Section 33 flow, not just the clean side. ---
    exposed_stages = [
        _inventory({"secret_id": "SECRET-001", "secret_type": "api_key", "owner": "operator", "system_or_component": "third-party analytics API key"}),
        _storage({"secret_id": "SECRET-001", "storage_mechanism": "SECRET_MANAGER", "exception_justification": None, "key_vault_ref": None}),
        _access({"secret_id": "SECRET-001", "authorized_identities": ["deploy service account"], "last_access_review_at": "2026-09-06"}),
        _rotation({"secret_id": "SECRET-001", "rotation_interval": "P90D", "last_rotated_at": "2026-06-01", "rotation_overdue": True}),
        _exposure({"secret_id": "SECRET-001", "location": "LOGS", "detected_at": "2026-09-05", "detected_by": "log-scrubbing scanner"}),
        _revocation({"secret_id": "SECRET-001", "response_flow": {"triggered": True, "flow_stage_reached": "INVESTIGATED"}}),
    ]
    _, exposed_record = catalog.invoke(
        METHOD_ID,
        generate_secrets_threat_review_record,
        "SECR-2026-09-06-002",
        "third-party analytics integration",
        exposed_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["secrets_threat_review_record"], exposed_record, "exposed api_key record")

    # --- Prove the CRYPTO-KEY-DEFERS-TO-VAULT invariant is real, at the CONSTRUCTION layer: the SAME
    # cleanup content, but with SECRET-001's own key_vault_ref (a crypto_key secret) nulled out. ---
    vault_defer_stages = copy.deepcopy(cleanup_stages)
    vault_defer_stages[1]["entries"][0]["key_vault_ref"] = None
    vault_guard_fired = False
    try:
        generate_secrets_threat_review_record("SECR-2026-09-06-003", "some-system", vault_defer_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        vault_guard_fired = "SECR_INVALID_STAGES" in str(error)
    if not vault_guard_fired:
        raise InvariantViolation("SECR_VAULT_DEFER_GUARD_DID_NOT_FIRE: a crypto_key secret with a null key_vault_ref was accepted (or a different guard fired instead)")
    # Confirm the REVERSE direction too: a non-crypto_key secret (SECRET-002, an ssh_key) must NOT carry
    # a key_vault_ref either -- giving it one must also be refused.
    reverse_stages = copy.deepcopy(cleanup_stages)
    reverse_stages[1]["entries"][1]["key_vault_ref"] = "dek:should-not-be-here"
    reverse_guard_fired = False
    try:
        generate_secrets_threat_review_record("SECR-2026-09-06-004", "some-system", reverse_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        reverse_guard_fired = "SECR_INVALID_STAGES" in str(error)
    if not reverse_guard_fired:
        raise InvariantViolation("SECR_VAULT_DEFER_REVERSE_GUARD_DID_NOT_FIRE: a non-crypto_key secret with a key_vault_ref was accepted (or a different guard fired instead)")

    # --- Prove the EC Section 33 EXPOSURE-RESPONSE-FLOW rule is real, at the CONSTRUCTION layer: the SAME
    # exposed-secret content, but with the revocation entry's own response_flow left at NOT_TRIGGERED
    # despite a real exposure finding staying UNCHANGED. ---
    unresponsive_stages = copy.deepcopy(exposed_stages)
    unresponsive_stages[5]["entries"][0]["response_flow"] = _not_triggered()
    exposure_guard_fired = False
    try:
        generate_secrets_threat_review_record("SECR-2026-09-06-005", "some-system", unresponsive_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        exposure_guard_fired = "SECR_INVALID_STAGES" in str(error)
    if not exposure_guard_fired:
        raise InvariantViolation("SECR_EXPOSURE_FLOW_GUARD_DID_NOT_FIRE: an exposed secret with a bare NOT_TRIGGERED disposition was accepted (or a different guard fired instead)")
    # Confirm an UNEXPOSED secret legitimately revoked for OTHER real reasons (departure, scheduled
    # decommission) is LEGAL -- EC Section 33's own flow is a MINIMUM for exposed secrets, not an
    # exclusive trigger; a secret with no exposure finding carries no requirement in either direction.
    # This is exactly the real-world case the cleanup_record above already demonstrates (both its own
    # secrets are proactively revoked with no exposure finding), so this step re-validates that same
    # record rather than fabricating a new one.
    proactive_revocation_is_legal = cleanup_record["stages"][5]["entries"][0]["response_flow"] == {"triggered": True, "flow_stage_reached": "RESUMED"}
    if not proactive_revocation_is_legal:
        raise InvariantViolation("SECR_PROACTIVE_REVOCATION_UNEXPECTEDLY_ILLEGAL: the cleanup record's own unexposed-but-revoked secret should have validated")
    # Confirm response_flow's own INTERNAL CONSISTENCY invariant is real, independent of exposure: a
    # secret (exposed or not) claiming triggered=True while flow_stage_reached=NOT_TRIGGERED is
    # self-contradictory and must be refused.
    inconsistent_stages = copy.deepcopy(cleanup_stages)
    inconsistent_stages[5]["entries"][0]["response_flow"] = {"triggered": True, "flow_stage_reached": "NOT_TRIGGERED"}
    consistency_guard_fired = False
    try:
        generate_secrets_threat_review_record("SECR-2026-09-06-006", "some-system", inconsistent_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        consistency_guard_fired = "SECR_INVALID_STAGES" in str(error)
    if not consistency_guard_fired:
        raise InvariantViolation("SECR_FLOW_CONSISTENCY_GUARD_DID_NOT_FIRE: a self-contradictory response_flow (triggered=True, flow_stage_reached=NOT_TRIGGERED) was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY
    # of the real, valid exposed-api-key record, hand-tamper its OWN response_flow back to NOT_TRIGGERED
    # (leaving the exposure finding itself untouched), pinned to the SPECIFIC integrity gate. ---
    tampered = copy.deepcopy(exposed_record)
    tampered["stages"][5]["entries"][0]["response_flow"] = _not_triggered()
    tampered_gate_results = evaluate_secrets_threat_review_gates(tampered, "run_secrets_threat_review_slice", clock.at(1.3))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "secrets_threat_review_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"SECR_GATE_GUARD_DID_NOT_FIRE: secrets_threat_review_integrity did not flag the tampered exposure response "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "SecretsThreatReviewInvariantVerified",
        {
            "vault_defer_guard_fired": vault_guard_fired,
            "vault_defer_reverse_guard_fired": reverse_guard_fired,
            "exposure_flow_guard_fired": exposure_guard_fired,
            "proactive_revocation_is_legal": proactive_revocation_is_legal,
            "consistency_guard_fired": consistency_guard_fired,
            "gate_layer_blocked": gate_layer_blocked,
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
        "cleanup_secrets_threat_review_record": cleanup_record,
        "exposed_secrets_threat_review_record": exposed_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "vault_defer_guard_fired": vault_guard_fired,
            "vault_defer_reverse_guard_fired": reverse_guard_fired,
            "exposure_flow_guard_fired": exposure_guard_fired,
            "proactive_revocation_is_legal": proactive_revocation_is_legal,
            "consistency_guard_fired": consistency_guard_fired,
            "gate_layer_blocked": gate_layer_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "secrets_threat_review_slice_result.json", result)
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
        result = run_secrets_threat_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["cleanup_secrets_threat_review_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.secrets_threat_review: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(vault_defer={v['vault_defer_guard_fired']}, vault_defer_reverse={v['vault_defer_reverse_guard_fired']}, "
        f"exposure_flow={v['exposure_flow_guard_fired']}, proactive_revocation_legal={v['proactive_revocation_is_legal']}, "
        f"consistency_guard={v['consistency_guard_fired']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
