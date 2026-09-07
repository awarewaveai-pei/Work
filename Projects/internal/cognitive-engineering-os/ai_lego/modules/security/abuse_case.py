"""``security.abuse_case`` -- fifty-second Method Atlas slice (task-assigned ordinal), NINTH of Atlas's
own TEN F20 table rows by table position (STRIDE, Attack Tree, PASTA, LINDDUN, DPIA/PIA, Zero Trust
Review, Secrets Threat Review, Supply Chain Threat Model, **Abuse Case**, Security Control Mapping --
L882-891). Four other F20 rows are being built concurrently by separate agents this same session; this
module does not assert a relative build-order among them.

Atlas gives this method exactly ONE citation -- the F20 tool table's own row (L890: "actor→goal→abuse
flow→controls→detection", benefit "補足正常 use case"). Grep-confirmed absent from BOTH Execution
Contract §32's own four named Threat Review methods (STRIDE/LINDDUN/Attack Tree/PASTA, L1260) AND
Atlas's own §13.11 twelve-step Security Review Recipe (L3472-3487) -- the SECOND F20 member (after
DPIA/PIA) confirmed absent from EC §32, and the FIRST also confirmed absent from Atlas's own default
recipe. Consequently this record carries NONE of assets/trust_boundaries/entry_points/test_evidence,
the second F20 typed object to omit that quad entirely.

Real usage precedent in THIS repository, drawn from an ALREADY-DOCUMENTED threat, not invented from
scratch: `docs/architecture/SECURITY_THREAT_MODEL.md` names two real scenarios this module's own CLI
demo models directly, landing on OPPOSITE sides of this module's own central invariant:

1. T1 (Supply Chain 簽章金鑰) / `docs/adr/ADR-015-supply-chain-security-tooling-selection.md` -- a
   real, CLOSED case: Sigstore/cosign keyless signing (no long-lived key to steal) is the control, and
   Rekor's public transparency log (named explicitly in SECURITY_THREAT_MODEL.md's own T1 row) is the
   detection mechanism. VALIDATES.
2. T2/E4/Uw1 (Untrusted Content -> AI 決策流 -> Knowledge Memory) / Prioritized Threat List item 6 -- a
   real, STILL-OPEN gap: EC §35's structural principle is a control, but SECURITY_THREAT_MODEL.md's own
   Residual Risk column explicitly discloses NO landed detection mechanism exists. REFUSED by this
   module's own construction-time invariant -- not because the record is malformed, but because Atlas's
   own two named final chain elements (controls AND detection) are genuinely not both present.

The core real invariant, grounded DIRECTLY in Atlas's own citation (stronger grounding than DPIA/PIA's
own two invariants, disclosed as real external GDPR practice, NOT Atlas): Atlas's own chain lists
`controls` and `detection` as TWO SEPARATE, DISTINCT final elements. Every step_id declared in the
`abuse_flow` stage must therefore be addressed by AT LEAST ONE control entry AND, INDEPENDENTLY, by AT
LEAST ONE detection entry -- checked in both directions (forward: every addresses_step_ids entry
references a real step_id; reverse: every step_id is covered).

A STRUCTURAL record (provenance_required + one integrity gate), NOT genuine_compute: the dual
completeness invariant is a set-membership/referential derivation, the same class STRIDE/LINDDUN's own
`elements_with_no_recorded_threats` and DPIA/PIA's own risk-traceability already establish -- no numeric
/ordinal aggregation like `security.attack_tree`'s own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.abuse_case"
RECORD_ID_PREFIX = "ABUSE-"
STAGE_ORDER: tuple[str, ...] = ("actor", "goal", "abuse_flow", "controls", "detection")
# Atlas's own literal five-word F20 row (L890), transcribed verbatim and in Atlas's own order -- the
# same "positionally-ordered pipeline" invariant class security.pasta/security.dpia_pia already
# establish, three stages shorter than DPIA/PIA's own eight.
_NARRATIVE_STAGE_IDS = frozenset(STAGE_ORDER[:2])
_KNOWN_NARRATIVE_STAGE_KEYS = frozenset({"stage_id", "summary"})
_KNOWN_STEP_KEYS = frozenset({"step_id", "description"})
_KNOWN_CONTROL_ENTRY_KEYS = frozenset({"control_id", "description", "addresses_step_ids"})
_KNOWN_DETECTION_ENTRY_KEYS = frozenset({"detection_id", "description", "addresses_step_ids"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _narrative_stage_is_valid(stage: Any, expected_stage_id: str) -> bool:
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_NARRATIVE_STAGE_KEYS:
        return False
    if stage["stage_id"] != expected_stage_id:
        return False
    return _is_nonempty_str(stage["summary"])


def _abuse_flow_step_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_STEP_KEYS:
        return False
    if not (_is_nonempty_str(entry["step_id"]) and entry["step_id"].startswith("STEP-")):
        return False
    return _is_nonempty_str(entry["description"])


def _abuse_flow_stage_is_valid(stage: Any) -> tuple[bool, frozenset[str]]:
    """Returns (is_valid, declared_step_ids) -- the id set is needed by callers to cross-check controls
    /detection, so this predicate returns it rather than forcing a second pass. Real invariant: step_id
    values are unique within the abuse_flow stage itself (the same duplicate-id restraint
    security.dpia_pia's own risks stage already establishes for ITS OWN variable-cardinality array)."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "steps"}:
        return False, frozenset()
    if stage["stage_id"] != "abuse_flow":
        return False, frozenset()
    steps = stage["steps"]
    if not isinstance(steps, list) or not steps or not all(_abuse_flow_step_is_valid(s) for s in steps):
        return False, frozenset()
    ids = [s["step_id"] for s in steps]
    if len(ids) != len(set(ids)):
        return False, frozenset()  # duplicate step_id within the abuse_flow stage itself
    return True, frozenset(ids)


def _addresses_step_ids_is_valid(value: Any, known_step_ids: frozenset[str]) -> bool:
    if not isinstance(value, list) or not value:
        return False
    return all(isinstance(sid, str) and sid in known_step_ids for sid in value)


def _control_entry_is_valid(entry: Any, known_step_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_CONTROL_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["control_id"]) and entry["control_id"].startswith("CTRL-")):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    return _addresses_step_ids_is_valid(entry["addresses_step_ids"], known_step_ids)


def _controls_stage_is_valid(stage: Any, known_step_ids: frozenset[str]) -> tuple[bool, frozenset[str]]:
    """Returns (is_valid, step_ids_covered_by_at_least_one_control). Forward direction (every control's
    addresses_step_ids references a real step_id) is enforced inside _control_entry_is_valid; the
    caller compares the returned covered set against known_step_ids for the REVERSE direction (every
    step addressed by at least one control)."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "controls"}:
        return False, frozenset()
    if stage["stage_id"] != "controls":
        return False, frozenset()
    controls = stage["controls"]
    if not isinstance(controls, list) or not controls or not all(_control_entry_is_valid(c, known_step_ids) for c in controls):
        return False, frozenset()
    covered: set[str] = set()
    for c in controls:
        covered.update(c["addresses_step_ids"])
    return True, frozenset(covered)


def _detection_entry_is_valid(entry: Any, known_step_ids: frozenset[str]) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_DETECTION_ENTRY_KEYS:
        return False
    if not (_is_nonempty_str(entry["detection_id"]) and entry["detection_id"].startswith("DET-")):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    return _addresses_step_ids_is_valid(entry["addresses_step_ids"], known_step_ids)


def _detection_stage_is_valid(stage: Any, known_step_ids: frozenset[str]) -> tuple[bool, frozenset[str]]:
    """Same shape as _controls_stage_is_valid, INDEPENDENTLY applied -- Atlas names detection as its own
    distinct chain element, not a subtype of controls (see method contract's own compilation_decisions
    for why these two are never merged into one 'mitigations' array)."""
    if not isinstance(stage, dict) or set(stage.keys()) != {"stage_id", "detections"}:
        return False, frozenset()
    if stage["stage_id"] != "detection":
        return False, frozenset()
    detections = stage["detections"]
    if not isinstance(detections, list) or not detections or not all(_detection_entry_is_valid(d, known_step_ids) for d in detections):
        return False, frozenset()
    covered: set[str] = set()
    for d in detections:
        covered.update(d["addresses_step_ids"])
    return True, frozenset(covered)


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the full real invariant set): five entries, actor/goal narrative stages
    positionally matching STAGE_ORDER, then abuse_flow with unique step_ids, then controls AND
    detection each independently required to fully cover every declared step_id (both directions, both
    arrays). Called by BOTH the builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    for position, expected_stage_id in enumerate(STAGE_ORDER[:2]):
        if not _narrative_stage_is_valid(stages[position], expected_stage_id):
            return False
    flow_ok, known_step_ids = _abuse_flow_stage_is_valid(stages[2])
    if not flow_ok:
        return False
    controls_ok, covered_by_controls = _controls_stage_is_valid(stages[3], known_step_ids)
    if not controls_ok or covered_by_controls != known_step_ids:
        return False  # covered_by_controls is always a subset of known_step_ids by construction, so
        # inequality here means at least one abuse_flow step has ZERO mitigating controls.
    detection_ok, covered_by_detection = _detection_stage_is_valid(stages[4], known_step_ids)
    if not detection_ok or covered_by_detection != known_step_ids:
        return False  # same reasoning, independently, for detection coverage.
    return True


def generate_abuse_case_record(
    record_id: str,
    system_or_component: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/abuse-case-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id (ABUSE- prefix)/system_or_component non-empty, version a real
    string, and stages EXACTLY Atlas's own five-stage F20-row chain in Atlas's own literal order, WITH
    every abuse_flow step_id addressed by at least one control AND, independently, at least one
    detection entry. REBUILDS every nested object it owns; provenance is stored by reference, the same
    family-wide convention every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ABUSE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"ABUSE_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ABUSE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"ABUSE_INVALID_STAGES: stages must be EXACTLY the five entries {STAGE_ORDER} in that literal order, with EVERY abuse_flow step_id "
            f"addressed by at least one control AND, independently, at least one detection entry, got {stages!r}"
        )

    actor, goal, flow_stage, controls_stage, detection_stage = stages
    rebuilt_stages: list[dict[str, Any]] = [
        {"stage_id": actor["stage_id"], "summary": actor["summary"]},
        {"stage_id": goal["stage_id"], "summary": goal["summary"]},
        {
            "stage_id": "abuse_flow",
            "steps": [{"step_id": s["step_id"], "description": s["description"]} for s in flow_stage["steps"]],
        },
        {
            "stage_id": "controls",
            "controls": [
                {"control_id": c["control_id"], "description": c["description"], "addresses_step_ids": list(c["addresses_step_ids"])}
                for c in controls_stage["controls"]
            ],
        },
        {
            "stage_id": "detection",
            "detections": [
                {"detection_id": d["detection_id"], "description": d["description"], "addresses_step_ids": list(d["addresses_step_ids"])}
                for d in detection_stage["detections"]
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


def evaluate_abuse_case_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    ABUSE- prefix), a real string version, system_or_component, AND that stages is EXACTLY Atlas's own
    five-stage F20-row chain in Atlas's own literal order, with every abuse_flow step_id addressed by at
    least one control AND, independently, at least one detection entry. Does not trust any stored value.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("abuse_case_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("abuse_case_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("abuse_case_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("abuse_case_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "abuse_case_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the five entries {STAGE_ORDER} in that literal order, correct shape, and every abuse_flow step covered by at least one control AND at least one detection)"}],
            validator,
            timestamp,
        )

    step_count = len(stages[2]["steps"])
    control_count = len(stages[3]["controls"])
    detection_count = len(stages[4]["detections"])
    return _result("abuse_case_integrity", True, [{"stage_count": len(stages), "step_count": step_count, "control_count": control_count, "detection_count": detection_count}], validator, timestamp)


def evaluate_abuse_case_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_abuse_case_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
