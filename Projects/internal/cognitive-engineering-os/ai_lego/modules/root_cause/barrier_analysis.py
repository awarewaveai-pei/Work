"""``root_cause.barrier_analysis`` -- F05 root_cause family, seventh concrete entry alongside
fishbone/five_whys/pareto/fault_tree/bow_tie/kepner_tregoe (``methods/contracts/root_cause.barrier_analysis.contract.yaml``).

Atlas gives this method exactly ONE citation, its own F05 tool table row (L442: "Hazard→Target→Barrier→
failure", usage "聚焦系統控制" (focus on the systemic control), purpose "找本應阻止事件的控制失效" (find
the control failure that should have stopped the event), misuse "避免責怪個人" (avoid blaming individuals))
-- no dedicated section exists (grep-confirmed absent from the whole Atlas file; the only other hits are
L438, a DIFFERENT row -- Event Tree, whose own formula happens to also use the word "barriers" -- L1109, an
incident-playbook row citing "Barrier" as one step in "Timeline→Change Analysis→Fault/Fishbone→Barrier→
CAPA", and L3417, a Mermaid diagram node).

**Due-diligence finding, comparing against the already-built `root_cause.bow_tie`** (``ai_lego/modules/
root_cause/bow_tie.py``, read in full before writing a single field here): Bow-Tie is a SELF-CONTAINED,
SYMMETRIC record -- ``threats[]`` (left) AND ``consequences[]`` (right) both hang off ONE
``top_event_description``, and its own core invariant is ACCOUNTABILITY (every ``controls[]`` entry
REQUIRES a named ``owner`` + ``test``, Atlas's own L439 misuse warning "控制措施要有 owner/test"). Barrier
Analysis is the structural opposite on both axes: (1) a single LINEAR chain (one ``hazard_description``,
one ``target_description``, a set of ``barriers[]`` standing between them, and ``failure_modes[]``
diagnosing which barrier(s) actually failed), not a two-sided landscape map; (2) its own misuse warning
("避免責怪個人") is a NO-BLAME constraint -- the exact opposite thrust of Bow-Tie's owner-mandate. Atlas's
own L1109 incident-playbook row places Barrier Analysis AFTER Fault Tree/Fishbone and BEFORE CAPA in a
single-incident retrospective, a different usage context from Bow-Tie's proactive landscape-mapping role.
Confirmed genuinely distinct, not a duplicate method (see ``root_cause.barrier_analysis.contract.yaml``
``compilation_decisions`` for the full citation trail).

TWO real invariants, both two-layer (construction + gate, re-derived from raw fields, not trusted), sharing
the SAME predicate functions between the builder and the gate (the same discipline every sibling module in
this family already uses):

1. **NO-BLAME structural invariant** -- Atlas's own literal misuse warning ("避免責怪個人") made mechanical,
   not merely documented: ``barriers[]`` and ``failure_modes[]`` entries each have a CLOSED key set
   (``_KNOWN_BARRIER_KEYS`` / ``_KNOWN_FAILURE_MODE_KEYS``) with NO field anywhere for a named
   individual/person -- only the BARRIER (the systemic control) itself is ever named. An entry carrying an
   extra key (e.g. a hypothetical ``responsible_person``) is refused the same way a malformed/typo'd key
   would be (``BARRIER_INVALID_BARRIERS`` / ``BARRIER_INVALID_FAILURE_MODES``). This is DELIBERATELY the
   structural mechanism, not a runtime free-text scan for blame-shaped language -- a text-scanning
   heuristic would be false-positive-prone, undisclosed-scope NLP; the honest, defensible enforcement is
   "this field cannot exist", disclosed here as the real, sole mechanism (see contract
   ``compilation_decisions``).
2. **Chain connectivity invariant** -- the record must trace Hazard→Target→Barrier→failure as an actual
   connected chain: ``hazard_description``/``target_description`` must be non-empty
   (``BARRIER_INVALID_HAZARD`` / ``BARRIER_INVALID_TARGET``), and every ``failure_modes[]`` entry's own
   ``barrier_ref`` must resolve to a real ``barriers[].barrier_id`` in the SAME record
   (``BARRIER_DANGLING_FAILURE_REFERENCE``) -- a dangling reference is refused, not merely flagged, the
   same bug class ``root_cause.fault_tree``'s own ``FAULTTREE_DANGLING_REFERENCE`` guards against.

A STRUCTURAL record (``provenance_required`` + one integrity gate), NOT ``genuine_compute`` -- both
invariants are set-membership/closed-key derivations, the same class ``root_cause.bow_tie``'s and
``root_cause.fault_tree``'s own invariants already establish.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.barrier_analysis"
RECORD_ID_PREFIX = "BARRIER-"
BARRIER_ID_PREFIX = "B-"
FAILURE_MODE_ID_PREFIX = "FM-"

_KNOWN_BARRIER_KEYS = frozenset({"barrier_id", "description"})
_KNOWN_FAILURE_MODE_KEYS = frozenset({"failure_mode_id", "barrier_ref", "description"})

_ERROR_MESSAGES: dict[str, str] = {
    "BARRIER_INVALID_BARRIERS": "barriers must be a non-empty list of well-shaped, uniquely-identified {barrier_id (B- prefixed), description} entries -- exactly these two keys, no field for a named individual/person",
    "BARRIER_INVALID_FAILURE_MODES": "failure_modes must be a non-empty list of well-shaped, uniquely-identified {failure_mode_id (FM- prefixed), barrier_ref, description} entries -- exactly these three keys, no field for a named individual/person",
    "BARRIER_DANGLING_FAILURE_REFERENCE": "a failure_mode's own barrier_ref does not name a real barriers[] entry in THIS record",
}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline every sibling module in this family already uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _barriers_are_valid(value: Any) -> tuple[bool, frozenset[str], str | None]:
    """Shared predicate (called by BOTH the builder and the gate). Returns (is_valid, declared_barrier_ids,
    error_code_if_invalid). Real invariant #1 (NO-BLAME) lives HERE: ``_KNOWN_BARRIER_KEYS`` admits ONLY
    barrier_id/description -- there is no key this predicate would ever accept for a named
    individual/person. An entry carrying an extra key is rejected the same way a malformed/typo'd key
    would be."""
    if not isinstance(value, list) or not value:
        return False, frozenset(), "BARRIER_INVALID_BARRIERS"
    ids: list[str] = []
    for entry in value:
        if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_BARRIER_KEYS:
            return False, frozenset(), "BARRIER_INVALID_BARRIERS"
        if not _is_nonempty_str(entry["barrier_id"]) or not entry["barrier_id"].startswith(BARRIER_ID_PREFIX):
            return False, frozenset(), "BARRIER_INVALID_BARRIERS"
        if not _is_nonempty_str(entry["description"]):
            return False, frozenset(), "BARRIER_INVALID_BARRIERS"
        ids.append(entry["barrier_id"])
    if len(ids) != len(set(ids)):
        return False, frozenset(), "BARRIER_INVALID_BARRIERS"  # duplicate barrier_id within barriers[] itself
    return True, frozenset(ids), None


def _failure_mode_entry_error(entry: Any, known_barrier_ids: frozenset[str]) -> str | None:
    """Shared predicate (precondition: barriers already valid): exactly the three known keys (real
    invariant #1, NO-BLAME, lives here too -- symmetric with ``_barriers_are_valid``), failure_mode_id
    FM- prefixed, description non-empty, THEN barrier_ref non-empty AND resolving to a real
    barriers[].barrier_id (real invariant #2, chain connectivity -- ``BARRIER_DANGLING_FAILURE_REFERENCE``
    if not). Called by BOTH the builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_FAILURE_MODE_KEYS:
        return "BARRIER_INVALID_FAILURE_MODES"
    if not _is_nonempty_str(entry["failure_mode_id"]) or not entry["failure_mode_id"].startswith(FAILURE_MODE_ID_PREFIX):
        return "BARRIER_INVALID_FAILURE_MODES"
    if not _is_nonempty_str(entry["description"]):
        return "BARRIER_INVALID_FAILURE_MODES"
    if not _is_nonempty_str(entry.get("barrier_ref")):
        return "BARRIER_INVALID_FAILURE_MODES"
    if entry["barrier_ref"] not in known_barrier_ids:
        return "BARRIER_DANGLING_FAILURE_REFERENCE"
    return None


def _failure_modes_are_valid(value: Any, known_barrier_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Shared predicate: at least one entry, each shape- and referentially-valid, failure_mode_id unique
    within the record (a duplicate would let one failure mode's own description silently overwrite
    another's meaning). Returns (is_valid, error_code_if_invalid) -- the FIRST error encountered, so the
    caller gets a specific, actionable code."""
    if not isinstance(value, list) or not value:
        return False, "BARRIER_INVALID_FAILURE_MODES"
    ids: list[str] = []
    for entry in value:
        error = _failure_mode_entry_error(entry, known_barrier_ids)
        if error is not None:
            return False, error
        ids.append(entry["failure_mode_id"])
    if len(ids) != len(set(ids)):
        return False, "BARRIER_INVALID_FAILURE_MODES"  # duplicate failure_mode_id within failure_modes[] itself
    return True, None


def generate_barrier_analysis_record(
    record_id: str,
    system_or_incident: str,
    hazard_description: str,
    target_description: str,
    barriers: list[dict[str, Any]],
    failure_modes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/barrier-analysis-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed: record_id (BARRIER- prefix)/system_or_incident/hazard_description/
    target_description non-empty, version a real string, barriers a non-empty list of well-shaped,
    uniquely-identified entries (NO field for a named individual -- real invariant #1), and failure_modes a
    non-empty list of well-shaped, uniquely-identified entries each carrying a barrier_ref that resolves to
    a REAL barriers[] entry in THIS SAME record (real invariant #2). REBUILDS every nested object it owns;
    provenance is stored by reference, the same family-wide convention every prior root_cause module
    already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BARRIER_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_incident):
        raise InvariantViolation(f"BARRIER_EMPTY_RECORD_FIELD: system_or_incident must be a non-empty string, got {system_or_incident!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BARRIER_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(hazard_description):
        raise InvariantViolation(f"BARRIER_INVALID_HAZARD: hazard_description must be a non-empty string, got {hazard_description!r}")
    if not _is_nonempty_str(target_description):
        raise InvariantViolation(f"BARRIER_INVALID_TARGET: target_description must be a non-empty string, got {target_description!r}")

    barriers_ok, known_barrier_ids, barriers_error = _barriers_are_valid(barriers)
    if not barriers_ok:
        raise InvariantViolation(f"{barriers_error}: {_ERROR_MESSAGES[barriers_error]}, got barriers={_shallow_describe(barriers)}")

    failure_modes_ok, failure_modes_error = _failure_modes_are_valid(failure_modes, known_barrier_ids)
    if not failure_modes_ok:
        raise InvariantViolation(f"{failure_modes_error}: {_ERROR_MESSAGES[failure_modes_error]}, got failure_modes={_shallow_describe(failure_modes)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_incident": system_or_incident,
        "hazard_description": hazard_description,
        "target_description": target_description,
        "barriers": [dict(b) for b in barriers],
        "failure_modes": [dict(f) for f in failure_modes],
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


def evaluate_barrier_analysis_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's own raw fields -- does not trust any stored value.
    FAILS CLOSED on malformed input rather than crashing. Reuses the EXACT SAME predicate functions the
    builder calls (``_barriers_are_valid``/``_failure_modes_are_valid``), so a hand-tampered record that
    bypassed the builder entirely is caught the identical way construction would have refused it -- single
    source of truth for what "valid" means, not two independently-drifting implementations."""
    if not isinstance(record, dict):
        return _result("barrier_analysis_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("barrier_analysis_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("barrier_analysis_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_incident")):
        return _result("barrier_analysis_integrity", False, [{"reason": "system_or_incident missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("hazard_description")):
        return _result("barrier_analysis_integrity", False, [{"reason": "hazard_description missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("target_description")):
        return _result("barrier_analysis_integrity", False, [{"reason": "target_description missing or empty"}], validator, timestamp)

    barriers_ok, known_barrier_ids, barriers_error = _barriers_are_valid(record.get("barriers"))
    if not barriers_ok:
        return _result("barrier_analysis_integrity", False, [{"reason": f"{barriers_error}: {_ERROR_MESSAGES[barriers_error]}"}], validator, timestamp)

    failure_modes_ok, failure_modes_error = _failure_modes_are_valid(record.get("failure_modes"), known_barrier_ids)
    if not failure_modes_ok:
        return _result("barrier_analysis_integrity", False, [{"reason": f"{failure_modes_error}: {_ERROR_MESSAGES[failure_modes_error]}"}], validator, timestamp)

    return _result(
        "barrier_analysis_integrity",
        True,
        [{"barrier_count": len(known_barrier_ids), "failure_mode_count": len(record["failure_modes"])}],
        validator,
        timestamp,
    )


def evaluate_barrier_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_barrier_analysis_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
