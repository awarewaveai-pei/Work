"""``security.secrets_threat_review`` -- fiftieth Method Atlas slice (provisional ordinal -- four
sibling F20 members are being built concurrently this same session by other agents), SIXTH member of
the `security` family (F20), after `security.stride` (44th), `security.linddun` (45th),
`security.attack_tree` (46th), `security.pasta` (47th), and `security.dpia_pia` (48th).

**Duplication check performed first**: `specs/security/key-vault-lifecycle.schema.yaml` was read in
full and confirmed to be a narrower, different-purpose object -- it models the internal STATE of one
Key Vault's cryptographic key records (`key_use` enum EXACTLY [KEK, DEK, HMAC_SIGNING_KEY]), not a
REVIEW PROCESS walking a broader secret inventory (API keys, DB credentials, OAuth tokens, webhook
secrets, TLS certificates, SSH keys, crypto keys, other) through six staged, gated checkpoints. This
module cross-references (does not duplicate) that schema via `storage.entries[].key_vault_ref` for the
one secret type both touch (`crypto_key`).

Atlas gives this method NO dedicated section (grep-confirmed: zero section headings anywhere in the
Atlas file). Its only DIRECT citation is the F20 table row (L888: "inventory -> storage -> access ->
rotation -> exposure -> revocation"). THREE additional citations converge on the same concept: Atlas
Section 13.11's own Security Review Recipe (L3472-3487, naming "Secret / Identity Review" as recipe
step 7), this repository's own real `docs/architecture/SECURITY_THREAT_MODEL.md` (honestly disclosing
that exact recipe step as an undone Phase 3 backlog item), and Execution Contract Section 33's own
dedicated "Secrets Contract" (L1264-1300, a real, load-bearing sibling section to Section 32, not part
of it). Section 32's own closing sentence (L1260, grep-reconfirmed) names exactly
STRIDE/LINDDUN/Attack-Tree/PASTA -- this is the SECOND F20 member (after DPIA/PIA) that is not one of
those four, so this record carries none of assets/trust_boundaries/entry_points/test_evidence.

Two invariants beyond stage completeness-and-order, both grounded in EC Section 33's own real content:

1. Exposure-triggers-mandatory-response-flow (one-directional) -- if a secret has ANY exposure finding,
   the matching revocation entry's response_flow must show flow_stage_reached past NOT_TRIGGERED
   (triggered=true). A secret with NO exposure finding carries no such requirement in either direction
   -- it may legitimately be revoked for other real reasons (departure, scheduled decommission), so the
   flow is not forced to stay untouched. response_flow.triggered must always internally agree with
   flow_stage_reached (true iff not NOT_TRIGGERED) for every secret, exposed or not. Directly encodes EC
   Section 33's own mandatory "STOP -> REVOKE/ROTATE -> INVESTIGATE -> RESUME" flow (L1290-1300) without
   over-constraining the un-exposed case beyond what that section actually states.
2. Crypto-key-defers-to-key-vault -- every storage entry for a crypto_key secret must carry a non-null
   key_vault_ref (soft pointer into key-vault-lifecycle.schema.yaml's own key_record.key_id); every
   other secret_type must carry key_vault_ref: null. This is the concrete anti-duplication mechanism.

A STRUCTURAL record (provenance_required + gates), NOT genuine_compute: both invariants are
set-membership/conditional-pointer derivations, the same class STRIDE/LINDDUN/DPIA-PIA's own real
invariants already establish -- no numeric/ordinal aggregation like security.attack_tree's own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.secrets_threat_review"
RECORD_ID_PREFIX = "SECR-"
STAGE_ORDER: tuple[str, ...] = (
    "inventory",
    "storage",
    "access",
    "rotation",
    "exposure",
    "revocation",
)
# Atlas's own literal six-word F20 table row L888 chain, transcribed verbatim and in Atlas's own order
# -- the same "positionally-ordered pipeline" invariant class security.pasta/security.dpia_pia already
# establish.

_SECRET_TYPES = frozenset({"api_key", "db_credential", "crypto_key", "oauth_token", "webhook_secret", "tls_certificate", "ssh_key", "other"})
_STORAGE_MECHANISMS = frozenset({"SECRET_MANAGER", "OS_KEYCHAIN", "SHORT_LIVED_CREDENTIAL", "WORKLOAD_IDENTITY", "OTHER"})
_EXPOSURE_LOCATIONS = frozenset({"GIT", "PROMPT", "CHAT_TRANSCRIPT", "CLI_ARGV", "LOGS", "CRASH_DUMP", "ARTIFACT", "TEST_FIXTURE", "MARKDOWN", "SCREENSHOT"})
_FLOW_STAGES: tuple[str, ...] = ("NOT_TRIGGERED", "STOPPED", "REVOKED_OR_ROTATED", "INVESTIGATED", "RESUMED")
_FLOW_STAGE_SET = frozenset(_FLOW_STAGES)

_KNOWN_SECRET_ENTRY_KEYS = frozenset({"secret_id", "secret_type", "owner", "system_or_component"})
_KNOWN_STORAGE_ENTRY_KEYS = frozenset({"secret_id", "storage_mechanism", "exception_justification", "key_vault_ref"})
_KNOWN_ACCESS_ENTRY_KEYS = frozenset({"secret_id", "authorized_identities", "last_access_review_at"})
_KNOWN_ROTATION_ENTRY_KEYS = frozenset({"secret_id", "rotation_interval", "last_rotated_at", "rotation_overdue"})
_KNOWN_EXPOSURE_FINDING_KEYS = frozenset({"secret_id", "location", "detected_at", "detected_by"})
_KNOWN_RESPONSE_FLOW_KEYS = frozenset({"triggered", "flow_stage_reached"})
_KNOWN_REVOCATION_ENTRY_KEYS = frozenset({"secret_id", "response_flow"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _secret_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_SECRET_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["secret_id"]) and entry["secret_id"].startswith("SECRET-")):
        return False
    if entry["secret_type"] not in _SECRET_TYPES:
        return False
    return _is_nonempty_str(entry["owner"]) and _is_nonempty_str(entry["system_or_component"])


def _inventory_stage_is_valid(stage: Any) -> tuple[bool, dict[str, str]]:
    """Returns (is_valid, {secret_id: secret_type}) -- callers need the type map to check the
    crypto-key-defers-to-vault invariant against the storage stage, so this predicate returns it rather
    than forcing a second pass."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "secrets"}:
        return False, {}
    if stage["stage_id"] != "inventory":
        return False, {}
    secrets = stage["secrets"]
    if not isinstance(secrets, list) or not secrets or not all(_secret_entry_is_valid(s) for s in secrets):
        return False, {}
    ids = [s["secret_id"] for s in secrets]
    if len(ids) != len(set(ids)):
        return False, {}  # duplicate secret_id within the inventory stage itself
    return True, {s["secret_id"]: s["secret_type"] for s in secrets}


def _storage_entry_is_valid(entry: Any, known_secret_ids: frozenset[str], secret_types: dict[str, str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_STORAGE_ENTRY_KEYS:
        return False
    secret_id = entry["secret_id"]
    if not (isinstance(secret_id, str) and secret_id in known_secret_ids):
        return False
    if entry["storage_mechanism"] not in _STORAGE_MECHANISMS:
        return False
    justification = entry["exception_justification"]
    if entry["storage_mechanism"] == "OTHER":
        if not _is_nonempty_str(justification):
            return False  # EC Section 33 "優先" list deviation must be disclosed, not silent
    elif justification is not None:
        return False  # no justification text on a conforming (preferred-mechanism) entry
    key_vault_ref = entry["key_vault_ref"]
    if secret_types.get(secret_id) == "crypto_key":
        if not (isinstance(key_vault_ref, str) and key_vault_ref.strip()):
            return False  # crypto_key MUST defer to the Key Vault
    elif key_vault_ref is not None:
        return False  # every other secret_type MUST NOT carry a key_vault_ref
    return True


def _entries_cover_exactly(entries: Any, known_secret_ids: frozenset[str], key: str = "secret_id") -> bool:
    if not isinstance(entries, list) or not entries:
        return False
    ids = [e.get(key) if isinstance(e, dict) else None for e in entries]
    if any(not isinstance(i, str) for i in ids):
        return False
    return set(ids) == known_secret_ids and len(ids) == len(known_secret_ids)


def _storage_stage_is_valid(stage: Any, known_secret_ids: frozenset[str], secret_types: dict[str, str]) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "entries"}:
        return False
    if stage["stage_id"] != "storage":
        return False
    entries = stage["entries"]
    if not (isinstance(entries, list) and entries and all(_storage_entry_is_valid(e, known_secret_ids, secret_types) for e in entries)):
        return False
    return _entries_cover_exactly(entries, known_secret_ids)


def _access_entry_is_valid(entry: Any, known_secret_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_ACCESS_ENTRY_KEYS:
        return False
    if not (isinstance(entry["secret_id"], str) and entry["secret_id"] in known_secret_ids):
        return False
    identities = entry["authorized_identities"]
    if not isinstance(identities, list) or not identities or not all(_is_nonempty_str(i) for i in identities):
        return False
    return _is_nonempty_str(entry["last_access_review_at"])


def _access_stage_is_valid(stage: Any, known_secret_ids: frozenset[str]) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "entries"}:
        return False
    if stage["stage_id"] != "access":
        return False
    entries = stage["entries"]
    if not (isinstance(entries, list) and entries and all(_access_entry_is_valid(e, known_secret_ids) for e in entries)):
        return False
    return _entries_cover_exactly(entries, known_secret_ids)


def _rotation_entry_is_valid(entry: Any, known_secret_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_ROTATION_ENTRY_KEYS:
        return False
    if not (isinstance(entry["secret_id"], str) and entry["secret_id"] in known_secret_ids):
        return False
    if not _is_nonempty_str(entry["rotation_interval"]):
        return False
    last_rotated = entry["last_rotated_at"]
    if last_rotated is not None and not isinstance(last_rotated, str):
        return False
    return isinstance(entry["rotation_overdue"], bool)


def _rotation_stage_is_valid(stage: Any, known_secret_ids: frozenset[str]) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "entries"}:
        return False
    if stage["stage_id"] != "rotation":
        return False
    entries = stage["entries"]
    if not (isinstance(entries, list) and entries and all(_rotation_entry_is_valid(e, known_secret_ids) for e in entries)):
        return False
    return _entries_cover_exactly(entries, known_secret_ids)


def _exposure_finding_is_valid(entry: Any, known_secret_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_EXPOSURE_FINDING_KEYS:
        return False
    if not (isinstance(entry["secret_id"], str) and entry["secret_id"] in known_secret_ids):
        return False
    if entry["location"] not in _EXPOSURE_LOCATIONS:
        return False
    return _is_nonempty_str(entry["detected_at"]) and _is_nonempty_str(entry["detected_by"])


def _exposure_stage_is_valid(stage: Any, known_secret_ids: frozenset[str]) -> tuple[bool, frozenset[str]]:
    """Returns (is_valid, secret_ids_with_findings) -- the sparse-findings set is needed by the
    revocation-stage check, so this predicate returns it rather than forcing a second pass. Unlike
    storage/access/rotation, findings is NOT required to cover every secret -- it is a sparse list of
    ACTUAL hits only, may legitimately be empty."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "findings"}:
        return False, frozenset()
    if stage["stage_id"] != "exposure":
        return False, frozenset()
    findings = stage["findings"]
    if not isinstance(findings, list):
        return False, frozenset()
    if not all(_exposure_finding_is_valid(f, known_secret_ids) for f in findings):
        return False, frozenset()
    return True, frozenset(f["secret_id"] for f in findings)


def _response_flow_is_valid(flow: Any) -> bool:
    if not isinstance(flow, dict) or set(flow.keys()) != _KNOWN_RESPONSE_FLOW_KEYS:
        return False
    if not isinstance(flow["triggered"], bool):
        return False
    return flow["flow_stage_reached"] in _FLOW_STAGE_SET


def _revocation_entry_is_valid(entry: Any, known_secret_ids: frozenset[str], secret_ids_with_findings: frozenset[str]) -> bool:
    """Two real invariants, both checked here:

    1. INTERNAL CONSISTENCY -- response_flow.triggered must agree with flow_stage_reached: triggered is
       True if and only if flow_stage_reached is anything other than NOT_TRIGGERED. A record claiming
       triggered=True while flow_stage_reached=NOT_TRIGGERED (or vice versa) is self-contradictory.
    2. EXPOSURE-TRIGGERS-MANDATORY-RESPONSE (EC Section 33, one-directional only) -- a secret WITH an
       exposure finding MUST show the flow has moved past NOT_TRIGGERED (a bare "no action" disposition
       over a confirmed exposure is refused). A secret with NO exposure finding has NO such requirement
       in EITHER direction: EC Section 33's own flow is triggered "若 secret 可能曝光" (IF a secret may be
       exposed), but nothing in that section says revocation may ONLY happen because of an exposure
       finding -- a secret may be legitimately, proactively revoked for other real reasons (departure,
       scheduled decommission, suspected-but-unconfirmed compromise). Asserting the reverse direction
       ("no exposure finding implies the flow MUST stay untouched") would be an UNDISCLOSED
       over-constraint with no real EC Section 33 basis -- exactly the anti-pattern this corpus already
       flags elsewhere, and the FIRST version of this module (caught by this module's own real test
       suite, see docs/FIFTIETH_SLICE_SECURITY_SECRETS_THREAT_REVIEW.md's own honest-limits section)
       fabricated it."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_REVOCATION_ENTRY_KEYS:
        return False
    secret_id = entry["secret_id"]
    if not (isinstance(secret_id, str) and secret_id in known_secret_ids):
        return False
    flow = entry["response_flow"]
    if not _response_flow_is_valid(flow):
        return False
    triggered_consistent = flow["triggered"] is (flow["flow_stage_reached"] != "NOT_TRIGGERED")
    if not triggered_consistent:
        return False
    if secret_id in secret_ids_with_findings:
        return flow["flow_stage_reached"] != "NOT_TRIGGERED"
    return True


def _revocation_stage_is_valid(stage: Any, known_secret_ids: frozenset[str], secret_ids_with_findings: frozenset[str]) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "entries"}:
        return False
    if stage["stage_id"] != "revocation":
        return False
    entries = stage["entries"]
    if not (isinstance(entries, list) and entries and all(_revocation_entry_is_valid(e, known_secret_ids, secret_ids_with_findings) for e in entries)):
        return False
    return _entries_cover_exactly(entries, known_secret_ids)


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the full real invariant set): six entries, positionally matching STAGE_ORDER,
    inventory declares the secret set, storage/access/rotation/revocation each cover it EXACTLY, exposure
    is a sparse findings list referencing only declared secrets, and revocation's own response_flow obeys
    EC Section 33's own exposure-conditional flow rule. Called by BOTH the builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    inventory_ok, secret_types = _inventory_stage_is_valid(stages[0])
    if not inventory_ok:
        return False
    known_secret_ids = frozenset(secret_types.keys())
    if not _storage_stage_is_valid(stages[1], known_secret_ids, secret_types):
        return False
    if not _access_stage_is_valid(stages[2], known_secret_ids):
        return False
    if not _rotation_stage_is_valid(stages[3], known_secret_ids):
        return False
    exposure_ok, secret_ids_with_findings = _exposure_stage_is_valid(stages[4], known_secret_ids)
    if not exposure_ok:
        return False
    return _revocation_stage_is_valid(stages[5], known_secret_ids, secret_ids_with_findings)


def generate_secrets_threat_review_record(
    record_id: str,
    system_or_component: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/secrets-threat-review-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (SECR- prefix)/system_or_component non-empty,
    version a real string, and stages EXACTLY Atlas's own six-stage F20 table row L888 chain in Atlas's
    own literal order, WITH full cross-stage secret traceability, the crypto-key-defers-to-vault rule,
    and the EC Section 33 exposure-response-flow rule. REBUILDS every nested object it owns; provenance
    is stored by reference, the same family-wide convention every prior security module already
    follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SECR_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"SECR_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SECR_INVALID_VERSION: version must be a string, got {version!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"SECR_INVALID_STAGES: stages must be EXACTLY the six entries {STAGE_ORDER} in that literal order, with full cross-stage secret "
            f"traceability, the crypto-key-defers-to-vault rule, and the exposure-response-flow rule all satisfied, got {stages!r}"
        )

    inventory_stage = stages[0]
    storage_stage = stages[1]
    access_stage = stages[2]
    rotation_stage = stages[3]
    exposure_stage = stages[4]
    revocation_stage = stages[5]

    rebuilt_stages: list[dict[str, Any]] = [
        {
            "stage_id": "inventory",
            "secrets": [
                {"secret_id": s["secret_id"], "secret_type": s["secret_type"], "owner": s["owner"], "system_or_component": s["system_or_component"]}
                for s in inventory_stage["secrets"]
            ],
        },
        {
            "stage_id": "storage",
            "entries": [
                {"secret_id": e["secret_id"], "storage_mechanism": e["storage_mechanism"], "exception_justification": e["exception_justification"], "key_vault_ref": e["key_vault_ref"]}
                for e in storage_stage["entries"]
            ],
        },
        {
            "stage_id": "access",
            "entries": [
                {"secret_id": e["secret_id"], "authorized_identities": list(e["authorized_identities"]), "last_access_review_at": e["last_access_review_at"]}
                for e in access_stage["entries"]
            ],
        },
        {
            "stage_id": "rotation",
            "entries": [
                {"secret_id": e["secret_id"], "rotation_interval": e["rotation_interval"], "last_rotated_at": e["last_rotated_at"], "rotation_overdue": e["rotation_overdue"]}
                for e in rotation_stage["entries"]
            ],
        },
        {
            "stage_id": "exposure",
            "findings": [
                {"secret_id": f["secret_id"], "location": f["location"], "detected_at": f["detected_at"], "detected_by": f["detected_by"]}
                for f in exposure_stage["findings"]
            ],
        },
        {
            "stage_id": "revocation",
            "entries": [
                {"secret_id": e["secret_id"], "response_flow": {"triggered": e["response_flow"]["triggered"], "flow_stage_reached": e["response_flow"]["flow_stage_reached"]}}
                for e in revocation_stage["entries"]
            ],
        },
    ]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "stages": rebuilt_stages,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_secrets_threat_review_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    SECR- prefix), a real string version, system_or_component, AND that stages is EXACTLY Atlas's own
    six-stage F20 table row L888 chain in Atlas's own literal order, with full cross-stage secret
    traceability, the crypto-key-defers-to-vault rule, and the EC Section 33 exposure-response-flow rule.
    Does not trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("secrets_threat_review_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("secrets_threat_review_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("secrets_threat_review_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("secrets_threat_review_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "secrets_threat_review_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the six entries {STAGE_ORDER} in that literal order, correct shape, full secret traceability, "
                        f"the crypto-key-defers-to-vault rule, and the exposure-response-flow rule all satisfied)"}],
            validator,
            timestamp,
        )

    secret_count = len(stages[0]["secrets"])
    exposure_count = len(stages[4]["findings"])
    return _result("secrets_threat_review_integrity", True, [{"stage_count": len(stages), "secret_count": secret_count, "exposure_finding_count": exposure_count}], validator, timestamp)


def evaluate_secrets_threat_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_secrets_threat_review_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
