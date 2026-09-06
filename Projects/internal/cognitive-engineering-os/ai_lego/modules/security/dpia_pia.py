"""``security.dpia_pia`` -- forty-eighth Method Atlas slice, FIFTH member of the `security` family (F20),
after `security.stride` (44th), `security.linddun` (45th), `security.attack_tree` (46th), and
`security.pasta` (47th).

Atlas gives this method its own DEDICATED section, §11.46 (L2269-2296):
"Processing → Purpose → Necessity/Proportionality → Data Subjects →
Risks → Controls → Residual Risk → Approval" (EIGHT words) -- richer
grounding than PASTA's own single-citation case. Grep-confirmed ZERO
mentions of "DPIA"/"PIA" anywhere in the Execution Contract: this is
the FIRST F20 member built this session that is NOT one of EC §32's
own four named Threat Review methods (STRIDE/LINDDUN/Attack
Tree/PASTA). Its own trigger is personal-data processing, genuinely
distinct from EC §32's own authn/authz/secrets/crypto/etc list --
consequently this record carries NONE of
assets/trust_boundaries/entry_points/test_evidence, the first F20
typed object to omit that triplet entirely.

Real usage precedent in THIS repository: `docs/adr/ADR-002-personal
-data-erasure-vs-event-immutability.md` (ACCEPTED) explicitly used
Atlas §11.46's own formula as the skeleton for that ADR's own
Recommendation section, and named a real, still-open "Phase 2 DPIA
待辦" (unencrypted event metadata surviving crypto-shred DEK
destruction can leak that a subject "once existed") -- this module's
own CLI demo models that real item, not a fabricated scenario.

Shares PASTA's own "fixed-length, positionally-ordered pipeline"
structural class (eight stages here, not seven), but adds TWO
invariants beyond stage completeness-and-order, both grounded in real,
external DPIA/GDPR practice, NOT an Atlas citation:

1. Risk traceability -- every risk_id in the `risks` stage must be
   addressed by at least one `controls` entry and have EXACTLY ONE
   `residual_risk` assessment (GDPR Art. 35 risk-register practice).
2. High-residual-risk escalation -- if any residual assessment's
   `residual_risk_level` is "high", the `approval` stage's `decision`
   may not be bare "approved" (GDPR Art. 36 Prior Consultation).

A STRUCTURAL record (provenance_required + one integrity gate), NOT
genuine_compute: both invariants are set-membership/referential
derivations, the same class STRIDE/LINDDUN's own
`elements_with_no_recorded_threats` already establishes -- no numeric
/ordinal aggregation like `security.attack_tree`'s own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.dpia_pia"
RECORD_ID_PREFIX = "DPIA-"
STAGE_ORDER: tuple[str, ...] = (
    "processing",
    "purpose",
    "necessity_proportionality",
    "data_subjects",
    "risks",
    "controls",
    "residual_risk",
    "approval",
)
# Atlas's own literal eight-word §11.46 chain (L2278-2287), transcribed verbatim and in Atlas's own order --
# the same "positionally-ordered pipeline" invariant class security.pasta already establishes, one stage
# longer.
_NARRATIVE_STAGE_IDS = frozenset(STAGE_ORDER[:4])
_KNOWN_NARRATIVE_STAGE_KEYS = frozenset({"stage_id", "summary"})
_KNOWN_RISK_ENTRY_KEYS = frozenset({"risk_id", "description", "likelihood", "severity", "affected_rights"})
_KNOWN_CONTROL_ENTRY_KEYS = frozenset({"control_id", "description", "mitigates_risk_ids"})
_KNOWN_RESIDUAL_ENTRY_KEYS = frozenset({"risk_id", "residual_likelihood", "residual_severity", "residual_risk_level", "accepted_by"})
_KNOWN_APPROVAL_KEYS = frozenset({"stage_id", "approver_role", "approver_name", "decision", "decision_date", "conditions", "jurisdiction_pack_ref"})
_LEVELS = frozenset({"low", "medium", "high"})
_DECISIONS = frozenset({"approved", "approved_with_conditions", "escalated", "rejected"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_str_list_is_valid(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _narrative_stage_is_valid(stage: Any, expected_stage_id: str) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_NARRATIVE_STAGE_KEYS:
        return False
    if stage["stage_id"] != expected_stage_id:
        return False
    return _is_nonempty_str(stage["summary"])


def _risk_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_RISK_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["risk_id"]) and entry["risk_id"].startswith("RISK-")):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    if entry["likelihood"] not in _LEVELS or entry["severity"] not in _LEVELS:
        return False
    return _nonempty_str_list_is_valid(entry["affected_rights"])


def _risks_stage_is_valid(stage: Any) -> tuple[bool, frozenset[str]]:
    """Returns (is_valid, declared_risk_ids) -- the id set is needed by callers to cross-check controls
    /residual_risk, so this predicate returns it rather than forcing a second pass."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "risks"}:
        return False, frozenset()
    if stage["stage_id"] != "risks":
        return False, frozenset()
    risks = stage["risks"]
    if not isinstance(risks, list) or not risks or not all(_risk_entry_is_valid(r) for r in risks):
        return False, frozenset()
    ids = [r["risk_id"] for r in risks]
    if len(ids) != len(set(ids)):
        return False, frozenset()  # duplicate risk_id within the risks stage itself
    return True, frozenset(ids)


def _control_entry_is_valid(entry: Any, known_risk_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_CONTROL_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["control_id"]) and entry["control_id"].startswith("CTRL-")):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    mitigates = entry["mitigates_risk_ids"]
    if not isinstance(mitigates, list) or not mitigates:
        return False
    return all(isinstance(rid, str) and rid in known_risk_ids for rid in mitigates)


def _controls_stage_is_valid(stage: Any, known_risk_ids: frozenset[str]) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "controls"}:
        return False
    if stage["stage_id"] != "controls":
        return False
    controls = stage["controls"]
    if not isinstance(controls, list) or not controls:
        return False
    return all(_control_entry_is_valid(c, known_risk_ids) for c in controls)


def _residual_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_RESIDUAL_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["risk_id"]) and entry["risk_id"].startswith("RISK-")):
        return False
    if entry["residual_likelihood"] not in _LEVELS or entry["residual_severity"] not in _LEVELS or entry["residual_risk_level"] not in _LEVELS:
        return False
    return _is_nonempty_str(entry["accepted_by"])


def _residual_risk_stage_is_valid(stage: Any, known_risk_ids: frozenset[str]) -> bool:
    """Real invariant: EXACTLY ONE residual assessment per risk_id declared in the risks stage -- no
    dangling risk (zero assessments) and no duplicate assessment (more than one)."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "assessments"}:
        return False
    if stage["stage_id"] != "residual_risk":
        return False
    assessments = stage["assessments"]
    if not isinstance(assessments, list) or not assessments or not all(_residual_entry_is_valid(a) for a in assessments):
        return False
    covered = [a["risk_id"] for a in assessments]
    return set(covered) == known_risk_ids and len(covered) == len(known_risk_ids)


def _highest_residual_level(residual_risk_stage: dict[str, Any]) -> str:
    rank = {"low": 0, "medium": 1, "high": 2}
    return max((a["residual_risk_level"] for a in residual_risk_stage["assessments"]), key=lambda level: rank[level])


def _approval_stage_is_valid(stage: Any, residual_risk_stage: dict[str, Any]) -> bool:
    """Real invariant: if any residual assessment is 'high', decision must NOT be bare 'approved' (GDPR
    Art. 36 Prior Consultation grounding -- disclosed in the method contract, not an Atlas citation)."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_APPROVAL_KEYS:
        return False
    if stage["stage_id"] != "approval":
        return False
    if not (_is_nonempty_str(stage["approver_role"]) and _is_nonempty_str(stage["approver_name"]) and _is_nonempty_str(stage["decision_date"])):
        return False
    if stage["decision"] not in _DECISIONS:
        return False
    conditions = stage["conditions"]
    if not isinstance(conditions, list) or not all(_is_nonempty_str(c) for c in conditions):
        return False
    ref = stage["jurisdiction_pack_ref"]
    if ref is not None and not (isinstance(ref, str) and ref.startswith("JPACK-")):
        return False
    if _highest_residual_level(residual_risk_stage) == "high" and stage["decision"] == "approved":
        return False
    return True


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the full real invariant set): eight entries, first four narrative stages
    positionally matching STAGE_ORDER, then risks/controls/residual_risk with cross-stage risk_id
    traceability, then approval with the escalation rule. Called by BOTH the builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    for position, expected_stage_id in enumerate(STAGE_ORDER[:4]):
        if not _narrative_stage_is_valid(stages[position], expected_stage_id):
            return False
    risks_ok, known_risk_ids = _risks_stage_is_valid(stages[4])
    if not risks_ok:
        return False
    if not _controls_stage_is_valid(stages[5], known_risk_ids):
        return False
    if not _residual_risk_stage_is_valid(stages[6], known_risk_ids):
        return False
    return _approval_stage_is_valid(stages[7], stages[6])


def generate_dpia_pia_impact_assessment_record(
    record_id: str,
    system_or_component: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/dpia-pia-impact-assessment-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (DPIA- prefix)/system_or_component non-empty,
    version a real string, and stages EXACTLY Atlas's own eight-stage §11.46 chain in Atlas's own literal
    order, WITH full risk-to-control-to-residual traceability and the high-residual-risk escalation rule.
    REBUILDS every nested object it owns; provenance is stored by reference, the same family-wide convention
    every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DPIA_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"DPIA_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DPIA_INVALID_VERSION: version must be a string, got {version!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"DPIA_INVALID_STAGES: stages must be EXACTLY the eight entries {STAGE_ORDER} in that literal order, with full risk-to-control-to-residual "
            f"traceability and the high-residual-risk escalation rule satisfied, got {stages!r}"
        )

    rebuilt_stages: list[dict[str, Any]] = []
    for stage in stages[:4]:
        rebuilt_stages.append({"stage_id": stage["stage_id"], "summary": stage["summary"]})
    risks_stage = stages[4]
    rebuilt_stages.append(
        {
            "stage_id": "risks",
            "risks": [
                {"risk_id": r["risk_id"], "description": r["description"], "likelihood": r["likelihood"], "severity": r["severity"], "affected_rights": list(r["affected_rights"])}
                for r in risks_stage["risks"]
            ],
        }
    )
    controls_stage = stages[5]
    rebuilt_stages.append(
        {
            "stage_id": "controls",
            "controls": [
                {"control_id": c["control_id"], "description": c["description"], "mitigates_risk_ids": list(c["mitigates_risk_ids"])}
                for c in controls_stage["controls"]
            ],
        }
    )
    residual_stage = stages[6]
    rebuilt_stages.append(
        {
            "stage_id": "residual_risk",
            "assessments": [
                {
                    "risk_id": a["risk_id"],
                    "residual_likelihood": a["residual_likelihood"],
                    "residual_severity": a["residual_severity"],
                    "residual_risk_level": a["residual_risk_level"],
                    "accepted_by": a["accepted_by"],
                }
                for a in residual_stage["assessments"]
            ],
        }
    )
    approval = stages[7]
    rebuilt_stages.append(
        {
            "stage_id": "approval",
            "approver_role": approval["approver_role"],
            "approver_name": approval["approver_name"],
            "decision": approval["decision"],
            "decision_date": approval["decision_date"],
            "conditions": list(approval["conditions"]),
            "jurisdiction_pack_ref": approval["jurisdiction_pack_ref"],
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


def evaluate_dpia_pia_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    DPIA- prefix), a real string version, system_or_component, AND that stages is EXACTLY Atlas's own
    eight-stage §11.46 chain in Atlas's own literal order, with full risk-to-control-to-residual
    traceability and the high-residual-risk escalation rule. Does not trust any stored value. FAILS CLOSED
    on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("dpia_pia_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("dpia_pia_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("dpia_pia_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("dpia_pia_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "dpia_pia_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the eight entries {STAGE_ORDER} in that literal order, correct shape, full risk traceability, and the escalation rule satisfied)"}],
            validator,
            timestamp,
        )

    risk_count = len(stages[4]["risks"])
    return _result("dpia_pia_integrity", True, [{"stage_count": len(stages), "risk_count": risk_count}], validator, timestamp)


def evaluate_dpia_pia_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_dpia_pia_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
