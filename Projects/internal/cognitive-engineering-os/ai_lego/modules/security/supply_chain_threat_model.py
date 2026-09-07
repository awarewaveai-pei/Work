"""``security.supply_chain_threat_model`` -- fifty-first Method Atlas slice (this session), SIXTH member of
the `security` family (F20), after `security.stride` (44th), `security.linddun` (45th),
`security.attack_tree` (46th), `security.pasta` (47th), and `security.dpia_pia` (48th).

**Duplication check performed first**: `docs/adr/ADR-015-supply-chain-security-tooling-selection.md`
(ACCEPTED) and `policies/security/supply-chain-security.policy.yaml` (ACTIVE) already exist under the same
"Supply Chain Security" name. Confirmed a DIFFERENT LAYER, not a duplicate: that ADR/policy is a singleton,
static TOOL-SELECTION decision (SBOM format, signing mechanism, SLSA target, vuln-scan tooling) with no
record-identity field at all. This module builds a PER-REVIEW RECORD ("did System X's supply chain actually
follow the seven-stage flow correctly, with real dependency-consideration and production-verification
evidence") -- the same distinction `policies/security/zero-trust.policy.yaml` (static) already draws against
`security.zero_trust_review` (a sibling F20 per-access review).

Atlas gives this method exactly ONE structural citation anywhere in this spec root -- the F20 tool table's
own row (L889: "source→dependency→CI→artifact→registry→deploy→sign/verify"), no dedicated section. This is
the SECOND F20 member confirmed genuinely absent from Execution Contract §32 entirely (after
`security.dpia_pia`, the first) -- EC §32's own ten-item trigger list never mentions supply chain,
dependencies, CI/CD, or build, and its own closing sentence names exactly four methods, not this one.
Consequently this record carries NONE of assets/trust_boundaries/entry_points/test_evidence.

Shares PASTA's/DPIA-PIA's own "fixed-length, positionally-ordered pipeline" structural class (seven stages).
Five of the seven stages (source/ci/artifact/registry/deploy) are deliberately minimal (stage_id/summary
only, matching PASTA's own restraint). TWO stages carry richer, citation-grounded structure, from
Execution Contract §34 "Supply Chain Contract" (L1304-1343) and Master Plan §66 "Supply Chain Security"
(L2740-2758) -- NEITHER from Atlas itself, disclosed as such:

1. `dependency` -- dependency_entries[], each with ALL SEVEN of EC §34's own named consideration dimensions
   (L1334-1342): maintenance/license/vulnerability_history/replaceability/transitive_dependencies
   /size_performance/long_term_support.
2. `sign_verify` (terminal stage) -- artifact_verified/production_deployment_occurred booleans plus
   verification_method (soft-referencing the sibling ADR-015 policy's own signing.mechanism, no hard $ref
   since policies/ is outside SchemaContracts's own specs/-only indexing). Real invariant: production
   _deployment_occurred may not be True while artifact_verified is False -- grounded in TWO independently
   converging citations: EC §34 L1328-1332 ("Production 只部署：verified artifact") and Master Plan §66
   L2758 ("Production 只接受 Signed Artifact").

Honest disclosure: Atlas's own literal word order places sign_verify AFTER deploy (the last word), which if
read as real-time pipeline causality would contradict both other mother documents' own orderings (Master
Plan §66 bundles verification into the terminal "Verified Deployment" step; EC §34 places Sign at position 7
of 9, before Registry/Deploy). Not silently reordered here -- this record documents a RETROSPECTIVE REVIEW's
own account (the same category every other F20 Threat Model record already is), and the production-verified
-artifact invariant is deliberately field-local to the single sign_verify stage object for exactly this
reason -- it does not depend on resolving which document's ordering is operationally "more correct".

A STRUCTURAL record (provenance_required + one integrity gate), NOT genuine_compute: both invariants are
structural/conditional derivations, the same class STRIDE/LINDDUN/PASTA/DPIA-PIA's own structural
derivations already establish -- no numeric/ordinal aggregation like `security.attack_tree`'s own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.supply_chain_threat_model"
RECORD_ID_PREFIX = "SCTM-"
STAGE_ORDER: tuple[str, ...] = ("source", "dependency", "ci", "artifact", "registry", "deploy", "sign_verify")
# Atlas's own literal seven-word F20 table row (L889), transcribed verbatim and in Atlas's own order --
# deliberately NOT reconciled against Master Plan §66's or Execution Contract §34's own different orderings
# for the same underlying flow (see method contract's own compilation_decisions).
_MINIMAL_STAGE_IDS = ("source", "ci", "artifact", "registry", "deploy")
_KNOWN_PROCESS_STAGE_KEYS = frozenset({"stage_id", "summary"})
_KNOWN_CONSIDERATIONS_KEYS = frozenset({"maintenance", "license", "vulnerability_history", "replaceability", "transitive_dependencies", "size_performance", "long_term_support"})
_KNOWN_DEPENDENCY_ENTRY_KEYS = frozenset({"name", "considerations"})
_KNOWN_SIGN_VERIFY_KEYS = frozenset({"stage_id", "summary", "artifact_verified", "production_deployment_occurred", "verification_method"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _process_stage_is_valid(stage: Any, expected_stage_id: str) -> bool:
    """Shared predicate: exactly the two known process-stage keys, stage_id matching the EXPECTED value at
    this position (not merely 'a legal stage_id'), summary non-empty. Called by BOTH the builder and the
    gate."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_PROCESS_STAGE_KEYS:
        return False
    if stage["stage_id"] != expected_stage_id:
        return False
    return _is_nonempty_str(stage["summary"])


def _considerations_are_valid(value: Any) -> bool:
    """EC §34's own 7-item 'new dependency to consider' checklist (L1334-1342), transcribed verbatim as
    required, non-empty string fields. ALL SEVEN must be present -- no subset."""
    if not isinstance(value, dict) or set(value.keys()) != _KNOWN_CONSIDERATIONS_KEYS:
        return False
    return all(_is_nonempty_str(value[key]) for key in _KNOWN_CONSIDERATIONS_KEYS)


def _dependency_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_DEPENDENCY_ENTRY_KEYS:
        return False
    if not _is_nonempty_str(entry["name"]):
        return False
    return _considerations_are_valid(entry["considerations"])


def _dependency_stage_is_valid(stage: Any) -> bool:
    """Real invariant: at least one dependency_entries[] entry, EVERY entry with all seven EC §34
    considerations non-empty -- the one stage this record gives richer structure than a bare
    stage_id/summary, because EC §34 (unlike Atlas) actually names further detail for it."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "dependency_entries"}:
        return False
    if stage["stage_id"] != "dependency":
        return False
    entries = stage["dependency_entries"]
    if not isinstance(entries, list) or not entries:
        return False
    return all(_dependency_entry_is_valid(e) for e in entries)


def _sign_verify_stage_is_valid(stage: Any) -> bool:
    """Real invariant: production_deployment_occurred may not be True while artifact_verified is False --
    EC §34 L1328-1332 / Master Plan §66 L2758's own converging 'production only accepts a verified/signed
    artifact' rule."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_SIGN_VERIFY_KEYS:
        return False
    if stage["stage_id"] != "sign_verify":
        return False
    if not _is_nonempty_str(stage["summary"]) or not _is_nonempty_str(stage["verification_method"]):
        return False
    artifact_verified = stage["artifact_verified"]
    production_deployment_occurred = stage["production_deployment_occurred"]
    if not isinstance(artifact_verified, bool) or not isinstance(production_deployment_occurred, bool):
        return False
    if production_deployment_occurred and not artifact_verified:
        return False
    return True


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the full real invariant set): seven entries, positionally matching STAGE_ORDER,
    dependency-consideration completeness, and the production-verified-artifact gate. Called by BOTH the
    builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    if not _process_stage_is_valid(stages[0], "source"):
        return False
    if not _dependency_stage_is_valid(stages[1]):
        return False
    for position, expected_stage_id in ((2, "ci"), (3, "artifact"), (4, "registry"), (5, "deploy")):
        if not _process_stage_is_valid(stages[position], expected_stage_id):
            return False
    return _sign_verify_stage_is_valid(stages[6])


def generate_supply_chain_threat_model_record(
    record_id: str,
    system_or_component: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/supply-chain-threat-model-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (SCTM- prefix)/system_or_component non-empty,
    version a real string, and stages EXACTLY Atlas's own seven-stage F20 chain in Atlas's own literal
    order, WITH dependency-consideration completeness and the production-verified-artifact gate satisfied.
    REBUILDS every nested object it owns; provenance is stored by reference, the same family-wide convention
    every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SCTM_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"SCTM_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SCTM_INVALID_VERSION: version must be a string, got {version!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"SCTM_INVALID_STAGES: stages must be EXACTLY the seven entries {STAGE_ORDER} in that literal order, with dependency-consideration "
            f"completeness and the production-verified-artifact gate satisfied, got {stages!r}"
        )

    rebuilt_stages: list[dict[str, Any]] = [{"stage_id": "source", "summary": stages[0]["summary"]}]
    dependency_stage = stages[1]
    rebuilt_stages.append(
        {
            "stage_id": "dependency",
            "dependency_entries": [
                {"name": e["name"], "considerations": {key: e["considerations"][key] for key in _KNOWN_CONSIDERATIONS_KEYS}}
                for e in dependency_stage["dependency_entries"]
            ],
        }
    )
    for position, stage_id in ((2, "ci"), (3, "artifact"), (4, "registry"), (5, "deploy")):
        rebuilt_stages.append({"stage_id": stage_id, "summary": stages[position]["summary"]})
    sign_verify = stages[6]
    rebuilt_stages.append(
        {
            "stage_id": "sign_verify",
            "summary": sign_verify["summary"],
            "artifact_verified": sign_verify["artifact_verified"],
            "production_deployment_occurred": sign_verify["production_deployment_occurred"],
            "verification_method": sign_verify["verification_method"],
        }
    )

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


def evaluate_supply_chain_threat_model_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    SCTM- prefix), a real string version, system_or_component, AND that stages is EXACTLY Atlas's own
    seven-stage F20 chain in Atlas's own literal order, with dependency-consideration completeness and the
    production-verified-artifact gate satisfied. Does not trust any stored value. FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("supply_chain_threat_model_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("supply_chain_threat_model_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("supply_chain_threat_model_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("supply_chain_threat_model_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "supply_chain_threat_model_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the seven entries {STAGE_ORDER} in that literal order, correct shape, dependency-consideration completeness, and the production-verified-artifact gate satisfied)"}],
            validator,
            timestamp,
        )

    dependency_count = len(stages[1]["dependency_entries"])
    return _result("supply_chain_threat_model_integrity", True, [{"stage_count": len(stages), "dependency_count": dependency_count}], validator, timestamp)


def evaluate_supply_chain_threat_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_supply_chain_threat_model_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
