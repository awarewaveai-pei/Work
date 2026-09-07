"""``security.zero_trust_review`` -- forty-ninth Method Atlas slice, SIXTH member of the `security`
family (F20), after `security.stride` (44th), `security.linddun` (45th), `security.attack_tree` (46th),
`security.pasta` (47th), and `security.dpia_pia` (48th).

THREE sources name this method across TWO mother documents: Atlas's own F20 table table row
("subject/workload/resource->authn/authz->short-lived credential->audit", L887, a real four-position "->"
chain whose FIRST position is itself "/"-joined -- three PARALLEL entities, not a sub-sequence); Atlas's OWN
dedicated section, S12.37 (L3027-3042, a deliberately UNORDERED six-item checklist -- Strong identity/
Workload identity/Short-lived credentials/Least privilege/Explicit policy decision/Continuous logging-audit);
and Master Plan S62 (L2636-2657, a DIFFERENT document, a real ORDERED six-step chain PLUS an explicit
"forbidden" list: Shared Password/Long-lived API Key/Hard-coded Secret).

Atlas's own F20 table row is chosen as the `stages` shape authority -- the mirror image of
`security.dpia_pia`'s own precedent (there, the dedicated section won because it was richer AND
better-ordered; here Atlas's OWN dedicated section is LESS useful for staging, since it drops all
sequencing). Master Plan S62's and Atlas S12.37's own distinctive content (Mutual Authentication, Resource
Access, Least privilege, "continuous" logging/audit) are folded in as real per-stage field enrichment, not
additional top-level stages -- see the method contract's own compilation_decisions.

Grep-confirmed ZERO mentions of "Zero Trust"/"zero_trust"/"zero trust" anywhere in the Execution Contract
(whole document, case-insensitive) -- even stronger absence evidence than DPIA/PIA's own EC search. This is
the SECOND F20 member built this session that is NOT one of EC S32's own four named Threat Review methods,
for a MORE NUANCED reason than DPIA/PIA's own orthogonal-trigger case: this method's own subject matter
(authn/authz, credentials) genuinely overlaps EC S32's own trigger vocabulary, but EC S32's own closing
sentence is still a closed four-method list that never names this method -- see the method contract's own
description for the full disclosure, including the real consequence that a Zero Trust Review does not
substitute for the EC S32 gate on an authn/authz-touching change.

Two real invariants beyond stage completeness-and-order, both enforced at BOTH the construction (builder)
layer AND the independent gate (re-derivation) layer:

1. STAGE-1 REQUIRED SET -- `identity_context` must carry all three of subject/workload/resource, each
   independently well-shaped (Atlas's own F20 table row, L887).
2. FORBIDDEN CREDENTIAL DENYLIST -- `credential_issuance.credential_type` may never be `shared_password`,
   `long_lived_api_key`, or `hardcoded_secret` (Master Plan S62's own explicit "forbidden" list, L2652-2656).
   Unlike DPIA/PIA's own two cross-`prefixItems`-sibling invariants (schema-inexpressible), this ONE is also
   enforced at the SCHEMA layer (`not: {enum: [...]}`), since it is a single-field check -- this module's own
   runtime checks are defense in depth on top of that, not a substitute for it.

Three soft-reference fields (`identity_context.subject.idp_ref`, `identity_context.workload
.workload_identity_strategy_ref`, `access_decision.pdp_engine_ref`) cite the REAL, ratified singleton values
`docs/adr/ADR-016-zero-trust-workload-identity-and-pdp-selection.md` / `policies/security/zero-trust.policy
.yaml` already ratify (Zitadel / cloud-native mTLS strategy / Cedar) -- kept as free text, not `const`, so a
genuine non-compliance finding remains representable rather than schema-illegal (this record's whole reason
to exist is reviewing whether a SPECIFIC access path actually complies, not restating the singleton policy).

A STRUCTURAL record (provenance_required + one integrity gate), NOT genuine_compute: both invariants are
structural/set-membership derivations, the same class STRIDE/LINDDUN/PASTA/DPIA-PIA's own structural
invariants already establish -- no numeric/ordinal aggregation like `security.attack_tree`'s own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.zero_trust_review"
RECORD_ID_PREFIX = "ZTR-"
STAGE_ORDER: tuple[str, ...] = (
    "identity_context",
    "access_decision",
    "credential_issuance",
    "audit_trail",
)
# Atlas's own literal four-position F20 table row chain (L887), transcribed verbatim and in Atlas's own
# order -- position 0 (identity_context) is internally a required SET of three sub-entities, the genuinely
# new sub-variant this module adds beyond security.pasta/security.dpia_pia's own pure-scalar-per-position
# shape.
FORBIDDEN_CREDENTIAL_TYPES = frozenset({"shared_password", "long_lived_api_key", "hardcoded_secret"})
# Master Plan S62's own explicit "forbidden" list (L2652-2656: Shared Password / Long-lived API Key /
# Hard-coded Secret), transcribed as canonical snake_case slugs.

_KNOWN_SUBJECT_KEYS = frozenset({"subject_id", "description", "idp_ref"})
_KNOWN_WORKLOAD_KEYS = frozenset({"workload_id", "description", "workload_identity_strategy_ref"})
_KNOWN_RESOURCE_KEYS = frozenset({"resource_id", "description", "sensitivity_classification"})
_KNOWN_IDENTITY_CONTEXT_KEYS = frozenset({"stage_id", "subject", "workload", "resource"})
_KNOWN_ACCESS_DECISION_KEYS = frozenset({"stage_id", "authn_method", "authn_verified", "authz_decision", "least_privilege_confirmed", "pdp_engine_ref"})
_KNOWN_CREDENTIAL_KEYS = frozenset({"stage_id", "credential_type", "ttl_seconds", "issued_at", "mutual_authentication_confirmed"})
_KNOWN_AUDIT_KEYS = frozenset({"stage_id", "audit_log_ref", "continuous_monitoring_confirmed", "resource_access_granted"})
_SENSITIVITY_LEVELS = frozenset({"Public", "Internal", "Confidential", "Restricted"})
_AUTHZ_DECISIONS = frozenset({"permit", "deny"})
_CREDENTIAL_TYPE_SLUG_CHARSET = frozenset("abcdefghijklmnopqrstuvwxyz0123456789_")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nullable_str(value: Any) -> bool:
    return value is None or isinstance(value, str)


def _credential_type_slug_is_valid(value: Any) -> bool:
    """`^[a-z][a-z0-9_]*$` re-derived without importing `re`, matching this module's own house style of
    explicit character-set checks (mirrors the schema's own pattern exactly)."""
    if not isinstance(value, str) or not value:
        return False
    if value[0] not in "abcdefghijklmnopqrstuvwxyz":
        return False
    return all(ch in _CREDENTIAL_TYPE_SLUG_CHARSET for ch in value)


def _subject_is_valid(subject: Any) -> bool:
    if not isinstance(subject, dict) or set(subject.keys()) != _KNOWN_SUBJECT_KEYS:
        return False
    if not (_is_nonempty_str(subject["subject_id"]) and _is_nonempty_str(subject["description"])):
        return False
    return _is_nullable_str(subject["idp_ref"])


def _workload_is_valid(workload: Any) -> bool:
    if not isinstance(workload, dict) or set(workload.keys()) != _KNOWN_WORKLOAD_KEYS:
        return False
    if not (_is_nonempty_str(workload["workload_id"]) and _is_nonempty_str(workload["description"])):
        return False
    return _is_nullable_str(workload["workload_identity_strategy_ref"])


def _resource_is_valid(resource: Any) -> bool:
    if not isinstance(resource, dict) or set(resource.keys()) != _KNOWN_RESOURCE_KEYS:
        return False
    if not (_is_nonempty_str(resource["resource_id"]) and _is_nonempty_str(resource["description"])):
        return False
    return resource["sensitivity_classification"] in _SENSITIVITY_LEVELS


def _identity_context_stage_is_valid(stage: Any) -> bool:
    """Real invariant #1: ALL THREE of subject/workload/resource are required (Atlas's own '/'-joined
    notation names a set, not an optional or partial one)."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_IDENTITY_CONTEXT_KEYS:
        return False
    if stage["stage_id"] != "identity_context":
        return False
    return _subject_is_valid(stage["subject"]) and _workload_is_valid(stage["workload"]) and _resource_is_valid(stage["resource"])


def _access_decision_stage_is_valid(stage: Any) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_ACCESS_DECISION_KEYS:
        return False
    if stage["stage_id"] != "access_decision":
        return False
    if not _is_nonempty_str(stage["authn_method"]):
        return False
    if not isinstance(stage["authn_verified"], bool):
        return False
    if stage["authz_decision"] not in _AUTHZ_DECISIONS:
        return False
    if not isinstance(stage["least_privilege_confirmed"], bool):
        return False
    return _is_nullable_str(stage["pdp_engine_ref"])


def _credential_issuance_stage_is_valid(stage: Any) -> bool:
    """Real invariant #2: credential_type must be a well-formed slug AND not one of Master Plan S62's own
    three explicitly forbidden values."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_CREDENTIAL_KEYS:
        return False
    if stage["stage_id"] != "credential_issuance":
        return False
    credential_type = stage["credential_type"]
    if not _credential_type_slug_is_valid(credential_type):
        return False
    if credential_type in FORBIDDEN_CREDENTIAL_TYPES:
        return False
    ttl_seconds = stage["ttl_seconds"]
    if not isinstance(ttl_seconds, int) or isinstance(ttl_seconds, bool) or ttl_seconds < 1:
        return False
    if not _is_nonempty_str(stage["issued_at"]):
        return False
    return isinstance(stage["mutual_authentication_confirmed"], bool)


def _audit_trail_stage_is_valid(stage: Any) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_AUDIT_KEYS:
        return False
    if stage["stage_id"] != "audit_trail":
        return False
    if not _is_nonempty_str(stage["audit_log_ref"]):
        return False
    return isinstance(stage["continuous_monitoring_confirmed"], bool) and isinstance(stage["resource_access_granted"], bool)


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the full real invariant set): four entries, positionally matching STAGE_ORDER,
    identity_context carrying its own required subject/workload/resource set, and credential_issuance
    refusing the forbidden-credential denylist. Called by BOTH the builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    return (
        _identity_context_stage_is_valid(stages[0])
        and _access_decision_stage_is_valid(stages[1])
        and _credential_issuance_stage_is_valid(stages[2])
        and _audit_trail_stage_is_valid(stages[3])
    )


def generate_zero_trust_review_record(
    record_id: str,
    system_or_component: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/zero-trust-review-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id (ZTR- prefix)/system_or_component non-empty, version a real string,
    and stages EXACTLY Atlas's own four-stage F20 table row chain in Atlas's own literal order, WITH
    identity_context's own required subject/workload/resource set and the forbidden-credential-type denylist
    satisfied. REBUILDS every nested object it owns; provenance is stored by reference, the same family-wide
    convention every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ZTR_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"ZTR_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ZTR_INVALID_VERSION: version must be a string, got {version!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"ZTR_INVALID_STAGES: stages must be EXACTLY the four entries {STAGE_ORDER} in that literal order, with identity_context's own required "
            f"subject/workload/resource set and the forbidden-credential-type denylist satisfied, got {stages!r}"
        )

    identity_context, access_decision, credential_issuance, audit_trail = stages

    rebuilt_stages: list[dict[str, Any]] = [
        {
            "stage_id": "identity_context",
            "subject": dict(identity_context["subject"]),
            "workload": dict(identity_context["workload"]),
            "resource": dict(identity_context["resource"]),
        },
        {
            "stage_id": "access_decision",
            "authn_method": access_decision["authn_method"],
            "authn_verified": access_decision["authn_verified"],
            "authz_decision": access_decision["authz_decision"],
            "least_privilege_confirmed": access_decision["least_privilege_confirmed"],
            "pdp_engine_ref": access_decision["pdp_engine_ref"],
        },
        {
            "stage_id": "credential_issuance",
            "credential_type": credential_issuance["credential_type"],
            "ttl_seconds": credential_issuance["ttl_seconds"],
            "issued_at": credential_issuance["issued_at"],
            "mutual_authentication_confirmed": credential_issuance["mutual_authentication_confirmed"],
        },
        {
            "stage_id": "audit_trail",
            "audit_log_ref": audit_trail["audit_log_ref"],
            "continuous_monitoring_confirmed": audit_trail["continuous_monitoring_confirmed"],
            "resource_access_granted": audit_trail["resource_access_granted"],
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


def evaluate_zero_trust_review_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    ZTR- prefix), a real string version, system_or_component, AND that stages is EXACTLY Atlas's own
    four-stage F20 table row chain in Atlas's own literal order, with identity_context's own required set and
    the forbidden-credential-type denylist satisfied. Does not trust any stored value. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("zero_trust_review_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("zero_trust_review_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("zero_trust_review_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("zero_trust_review_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "zero_trust_review_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the four entries {STAGE_ORDER} in that literal order, correct shape, identity_context's own required subject/workload/resource set, and the forbidden-credential-type denylist satisfied)"}],
            validator,
            timestamp,
        )

    return _result("zero_trust_review_integrity", True, [{"stage_count": len(stages), "credential_type": stages[2]["credential_type"]}], validator, timestamp)


def evaluate_zero_trust_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_zero_trust_review_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
