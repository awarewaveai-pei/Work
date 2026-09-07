"""``root_cause.bow_tie`` -- F05 root_cause family, fourth concrete entry alongside fishbone/five_whys/
pareto (``methods/contracts/root_cause.bow_tie.contract.yaml``).

Atlas gives this method exactly ONE citation, its own F05 tool table row (L439: "threats→event→
consequences", usage "左防止、右緩解" (left=prevention, right=mitigation), benefit "同時管理
prevention/recovery", misuse "控制措施要有 owner/test") -- no dedicated section exists (grep-confirmed
absent from §11.x/§12.x/§13.x). NOT an EC §32 method: EC §32's own closing sentence
(``AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1260``) names exactly
STRIDE/LINDDUN/Attack Tree/PASTA, Bow-Tie is absent.

**Due-diligence finding, comparing against the already-built `security.security_control_mapping`**
(``ai_lego/modules/security/security_control_mapping.py``, read in full before writing a single field
here): that method is a CROSS-RECORD CONSUMER -- it classifies an EXTERNAL StrideThreatModelRecord's or
LinddunPrivacyThreatModelRecord's own ``threats[]`` into preventive/detective/recovery with structured,
auditable evidence. It has no ``owner`` field anywhere, no ``top_event`` concept, no ``consequences[]``.
Bow-Tie is the opposite shape: a fully SELF-CONTAINED, symmetric record -- ``threats[]`` (left,
prevention) and ``consequences[]`` (right, mitigation) both hang off ONE ``top_event_description``, and
every ``controls[]`` entry's own ``target_id`` must resolve to a threat/consequence living INSIDE this
same record, never an external one. Confirmed genuinely distinct, not a duplicate method (see
``root_cause.bow_tie.contract.yaml`` ``compilation_decisions`` for the full citation trail).

Two real invariants, both two-layer (construction + gate, re-derived from raw fields, not trusted),
sharing the SAME predicate functions between the builder and the gate (the same discipline every
sibling module in this family already uses):

1. OWNER/TEST invariant -- Atlas's own literal misuse warning ("控制措施要有 owner/test") transcribed as
   a hard requirement: every ``controls[]`` entry (either side) must carry a non-empty ``owner`` AND a
   non-empty ``test``. Distinct error codes ``BOWTIE_CONTROL_MISSING_OWNER`` /
   ``BOWTIE_CONTROL_MISSING_TEST`` so a control missing only one of the two is diagnosable without
   guessing which.
2. STRUCTURAL invariant -- every ``threats[]``/``consequences[]`` entry's own ``description`` must be
   genuinely distinct (whitespace-trimmed) from ``top_event_description`` (``BOWTIE_THREAT_MATCHES_TOP_EVENT``
   / ``BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT``), AND every ``controls[]`` entry's own ``side``+``target_id``
   must name a real entry on the matching side (``BOWTIE_DANGLING_CONTROL_REFERENCE``) -- a dangling
   reference is refused, not merely flagged.

A STRUCTURAL record (``provenance_required`` + one integrity gate), NOT ``genuine_compute`` -- both
invariants are set-membership/string-comparison derivations, the same class
``security.security_control_mapping``'s own invariants already establish.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.bow_tie"
RECORD_ID_PREFIX = "BOWTIE-"
THREAT_ID_PREFIX = "T-"
CONSEQUENCE_ID_PREFIX = "C-"
CONTROL_ID_PREFIX = "CTRL-"
CONTROL_SIDES = frozenset({"prevention", "mitigation"})

_KNOWN_THREAT_KEYS = frozenset({"threat_id", "description"})
_KNOWN_CONSEQUENCE_KEYS = frozenset({"consequence_id", "description"})
_KNOWN_CONTROL_KEYS = frozenset({"control_id", "side", "target_id", "description", "owner", "test"})

_ERROR_MESSAGES: dict[str, str] = {
    "BOWTIE_INVALID_THREATS": "threats must be a non-empty list of well-shaped, uniquely-identified {threat_id (T- prefixed), description} entries",
    "BOWTIE_THREAT_MATCHES_TOP_EVENT": "a threat's own description is identical (after whitespace-trim) to top_event_description -- a threat cannot BE the top event it is supposed to cause",
    "BOWTIE_INVALID_CONSEQUENCES": "consequences must be a non-empty list of well-shaped, uniquely-identified {consequence_id (C- prefixed), description} entries",
    "BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT": "a consequence's own description is identical (after whitespace-trim) to top_event_description -- a consequence cannot BE the top event it is supposed to result from",
    "BOWTIE_INVALID_CONTROL_SHAPE": "every control must be a well-shaped, uniquely-identified {control_id (CTRL- prefixed), side in {prevention, mitigation}, target_id, description, owner, test} entry",
    "BOWTIE_CONTROL_MISSING_OWNER": "Atlas's own misuse warning ('控制措施要有 owner/test') -- a control with no owner is not a real control, just a wish",
    "BOWTIE_CONTROL_MISSING_TEST": "Atlas's own misuse warning ('控制措施要有 owner/test') -- a control with no test/verification is not a real control, just a wish",
    "BOWTIE_DANGLING_CONTROL_REFERENCE": "a control's own side+target_id does not name a real threats[]/consequences[] entry in THIS record",
}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _threats_are_valid(value: Any, top_event_description: str) -> tuple[bool, frozenset[str], str | None]:
    """Shared predicate (called by BOTH the builder and the gate). Returns (is_valid, declared_threat_ids,
    error_code_if_invalid). Real invariants: at least one entry, each well-shaped, threat_id T- prefixed
    and unique within the record, description non-empty and NOT identical (whitespace-trimmed) to
    top_event_description."""
    if not isinstance(value, list) or not value:
        return False, frozenset(), "BOWTIE_INVALID_THREATS"
    ids: list[str] = []
    for entry in value:
        if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_THREAT_KEYS:
            return False, frozenset(), "BOWTIE_INVALID_THREATS"
        if not _is_nonempty_str(entry["threat_id"]) or not entry["threat_id"].startswith(THREAT_ID_PREFIX):
            return False, frozenset(), "BOWTIE_INVALID_THREATS"
        if not _is_nonempty_str(entry["description"]):
            return False, frozenset(), "BOWTIE_INVALID_THREATS"
        if entry["description"].strip() == top_event_description.strip():
            return False, frozenset(), "BOWTIE_THREAT_MATCHES_TOP_EVENT"
        ids.append(entry["threat_id"])
    if len(ids) != len(set(ids)):
        return False, frozenset(), "BOWTIE_INVALID_THREATS"  # duplicate threat_id within threats[] itself
    return True, frozenset(ids), None


def _consequences_are_valid(value: Any, top_event_description: str) -> tuple[bool, frozenset[str], str | None]:
    """Mirror of ``_threats_are_valid`` for the RIGHT side. Shared predicate, called by BOTH the builder
    and the gate."""
    if not isinstance(value, list) or not value:
        return False, frozenset(), "BOWTIE_INVALID_CONSEQUENCES"
    ids: list[str] = []
    for entry in value:
        if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_CONSEQUENCE_KEYS:
            return False, frozenset(), "BOWTIE_INVALID_CONSEQUENCES"
        if not _is_nonempty_str(entry["consequence_id"]) or not entry["consequence_id"].startswith(CONSEQUENCE_ID_PREFIX):
            return False, frozenset(), "BOWTIE_INVALID_CONSEQUENCES"
        if not _is_nonempty_str(entry["description"]):
            return False, frozenset(), "BOWTIE_INVALID_CONSEQUENCES"
        if entry["description"].strip() == top_event_description.strip():
            return False, frozenset(), "BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT"
        ids.append(entry["consequence_id"])
    if len(ids) != len(set(ids)):
        return False, frozenset(), "BOWTIE_INVALID_CONSEQUENCES"  # duplicate consequence_id within consequences[] itself
    return True, frozenset(ids), None


def _control_entry_error(entry: Any, known_threat_ids: frozenset[str], known_consequence_ids: frozenset[str]) -> str | None:
    """Shared predicate (precondition: threats/consequences already valid): exactly the six known keys,
    control_id CTRL- prefixed, side one of Atlas's own literal two words, target_id/description non-empty,
    THEN owner non-empty (BOWTIE_CONTROL_MISSING_OWNER if not), THEN test non-empty
    (BOWTIE_CONTROL_MISSING_TEST if not), THEN referential integrity against the matching side's known ids
    (BOWTIE_DANGLING_CONTROL_REFERENCE if not). Ordered so a control missing ONLY owner, or ONLY test, is
    diagnosable by its own specific error code rather than a generic shape failure. Called by BOTH the
    builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_CONTROL_KEYS:
        return "BOWTIE_INVALID_CONTROL_SHAPE"
    if not _is_nonempty_str(entry["control_id"]) or not entry["control_id"].startswith(CONTROL_ID_PREFIX):
        return "BOWTIE_INVALID_CONTROL_SHAPE"
    if entry["side"] not in CONTROL_SIDES:
        return "BOWTIE_INVALID_CONTROL_SHAPE"
    if not _is_nonempty_str(entry["target_id"]):
        return "BOWTIE_INVALID_CONTROL_SHAPE"
    if not _is_nonempty_str(entry["description"]):
        return "BOWTIE_INVALID_CONTROL_SHAPE"
    if not _is_nonempty_str(entry.get("owner")):
        return "BOWTIE_CONTROL_MISSING_OWNER"
    if not _is_nonempty_str(entry.get("test")):
        return "BOWTIE_CONTROL_MISSING_TEST"
    valid_targets = known_threat_ids if entry["side"] == "prevention" else known_consequence_ids
    if entry["target_id"] not in valid_targets:
        return "BOWTIE_DANGLING_CONTROL_REFERENCE"
    return None


def _controls_are_valid(value: Any, known_threat_ids: frozenset[str], known_consequence_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Shared predicate: at least one entry, each shape- and referentially-valid, control_id unique within
    the record (a duplicate would let one control's own owner/test silently overwrite another's meaning --
    see method contract compilation_decisions). Returns (is_valid, error_code_if_invalid) -- the FIRST
    error encountered, so the caller gets a specific, actionable code."""
    if not isinstance(value, list) or not value:
        return False, "BOWTIE_INVALID_CONTROL_SHAPE"
    ids: list[str] = []
    for entry in value:
        error = _control_entry_error(entry, known_threat_ids, known_consequence_ids)
        if error is not None:
            return False, error
        ids.append(entry["control_id"])
    if len(ids) != len(set(ids)):
        return False, "BOWTIE_INVALID_CONTROL_SHAPE"  # duplicate control_id within controls[] itself
    return True, None


def generate_bow_tie_analysis_record(
    record_id: str,
    system_or_component: str,
    top_event_description: str,
    threats: list[dict[str, Any]],
    consequences: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/bow-tie-analysis-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed: record_id (BOWTIE- prefix)/system_or_component/top_event_description
    non-empty, version a real string, threats/consequences each a non-empty list of well-shaped,
    uniquely-identified entries whose own description is genuinely distinct from top_event_description,
    and controls a non-empty list of well-shaped, uniquely-identified entries each carrying a non-empty
    owner AND test, whose own side+target_id resolves to a REAL threats[]/consequences[] entry in THIS
    SAME record (self-contained -- unlike security.security_control_mapping's cross-record design).
    REBUILDS every nested object it owns; provenance is stored by reference, the same family-wide
    convention every prior root_cause module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BOWTIE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"BOWTIE_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BOWTIE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(top_event_description):
        raise InvariantViolation(f"BOWTIE_INVALID_TOP_EVENT: top_event_description must be a non-empty string, got {top_event_description!r}")

    threats_ok, known_threat_ids, threats_error = _threats_are_valid(threats, top_event_description)
    if not threats_ok:
        raise InvariantViolation(f"{threats_error}: {_ERROR_MESSAGES[threats_error]}, got threats={threats!r}")

    consequences_ok, known_consequence_ids, consequences_error = _consequences_are_valid(consequences, top_event_description)
    if not consequences_ok:
        raise InvariantViolation(f"{consequences_error}: {_ERROR_MESSAGES[consequences_error]}, got consequences={consequences!r}")

    controls_ok, controls_error = _controls_are_valid(controls, known_threat_ids, known_consequence_ids)
    if not controls_ok:
        raise InvariantViolation(f"{controls_error}: {_ERROR_MESSAGES[controls_error]}, got controls={controls!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "top_event_description": top_event_description,
        "threats": [dict(t) for t in threats],
        "consequences": [dict(c) for c in consequences],
        "controls": [dict(c) for c in controls],
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


def evaluate_bow_tie_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's own raw fields -- does not trust any stored value.
    FAILS CLOSED on malformed input rather than crashing. Reuses the EXACT SAME predicate functions the
    builder calls (``_threats_are_valid``/``_consequences_are_valid``/``_controls_are_valid``), so a
    hand-tampered record that bypassed the builder entirely is caught the identical way construction would
    have refused it -- single source of truth for what "valid" means, not two independently-drifting
    implementations."""
    if not isinstance(record, dict):
        return _result("bow_tie_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("bow_tie_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("bow_tie_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("bow_tie_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)
    top_event_description = record.get("top_event_description")
    if not _is_nonempty_str(top_event_description):
        return _result("bow_tie_integrity", False, [{"reason": "top_event_description missing or empty"}], validator, timestamp)

    threats_ok, known_threat_ids, threats_error = _threats_are_valid(record.get("threats"), top_event_description)
    if not threats_ok:
        return _result("bow_tie_integrity", False, [{"reason": f"{threats_error}: {_ERROR_MESSAGES[threats_error]}"}], validator, timestamp)

    consequences_ok, known_consequence_ids, consequences_error = _consequences_are_valid(record.get("consequences"), top_event_description)
    if not consequences_ok:
        return _result("bow_tie_integrity", False, [{"reason": f"{consequences_error}: {_ERROR_MESSAGES[consequences_error]}"}], validator, timestamp)

    controls_ok, controls_error = _controls_are_valid(record.get("controls"), known_threat_ids, known_consequence_ids)
    if not controls_ok:
        return _result("bow_tie_integrity", False, [{"reason": f"{controls_error}: {_ERROR_MESSAGES[controls_error]}"}], validator, timestamp)

    return _result(
        "bow_tie_integrity",
        True,
        [{"threat_count": len(known_threat_ids), "consequence_count": len(known_consequence_ids), "control_count": len(record["controls"])}],
        validator,
        timestamp,
    )


def evaluate_bow_tie_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_bow_tie_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
