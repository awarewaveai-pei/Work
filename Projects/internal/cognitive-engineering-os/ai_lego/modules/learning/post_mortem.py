"""``learning.post_mortem`` -- F17 learning family, 4th concrete entry after reversal_criteria/kill_criteria/
decision_journal (``methods/contracts/learning.post_mortem.contract.yaml``).

Atlas F17 table row (L805): "Post-mortem | 事故後學習 | timeline→impact→causes→actions | 防重發、非 blame".
Also cited: EC §55 Incident Mode (L1888-1923), 15-step pipeline ending "...Verify -> Post-mortem" (post-mortem
is the TERMINAL step, after diagnosis/fix/deploy/verify already happened); Atlas §13.8 Production Incident
Recipe (L3407-3423) Mermaid diagram, same terminal position, immediately after Barrier Analysis.

Due-diligence vs root_cause.barrier_analysis (read in full first, ai_lego/modules/root_cause/barrier_analysis.py):
NOT a duplicate. Barrier Analysis = single-cause DIAGNOSTIC chain (F05, why one control failed). Post-mortem =
whole-INCIDENT RETROSPECTIVE (F17, timeline/impact/causes/actions), terminal step of EC §55's pipeline, AFTER
diagnostic tools (Fishbone/Fault Tree/Barrier Analysis/5 Whys) already ran. Each ``causes[]`` entry carries an
OPTIONAL soft-link ``source_analysis_ref`` (format-only, unconstrained prefix -- causes may originate from many
different root_cause-family record types) to reference a prior diagnostic record instead of re-diagnosing.
Confirmed distinct, not overlapping.

THREE real invariants, two-layer (construction + gate, re-derived from raw fields, not trusted):
1. NO-BLAME structural (Atlas's own "非 blame") -- ``timeline[]``/``causes[]`` entries are CLOSED key sets
   (no field for a named individual), same mechanism ``root_cause.barrier_analysis`` established.
   ``POSTMORTEM_INVALID_TIMELINE`` / ``POSTMORTEM_INVALID_CAUSES``.
2. Pipeline order -- timeline non-empty (must exist before causes), every ``causes[].timeline_ref`` resolves
   to a real ``timeline[].event_id`` in the SAME record. ``POSTMORTEM_DANGLING_CAUSE_REFERENCE``. Shape check
   (this module's own ``_causes_are_valid``) is deliberately SEPARATE from the referential check (own
   ``_dangling_cause_references``), same 3-way shape/mode/referential split ``root_cause.fault_tree`` uses.
3. Action ownership (Atlas's own "防重發") -- every ``actions[]`` entry names a non-empty ``owner``, same
   shape-then-ownership split ``learning.kill_criteria``'s own gate pair already establishes.
   ``POSTMORTEM_UNOWNED_ACTION``. NOTE: ``owner`` is FORWARD-looking (who prevents recurrence), never fault
   attribution -- the no-blame closed-key-set applies to timeline/causes only, deliberately not to actions.

STRUCTURAL record (``provenance_required`` + 3 integrity gates), not ``genuine_compute`` -- same class
``root_cause.barrier_analysis``'s and ``learning.kill_criteria``'s own invariants already establish.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.post_mortem"
RECORD_ID_PREFIX = "POSTMORTEM-"
TIMELINE_EVENT_ID_PREFIX = "T-"
CAUSE_ID_PREFIX = "C-"
ACTION_ID_PREFIX = "A-"

_KNOWN_TIMELINE_KEYS = frozenset({"event_id", "timestamp", "description"})
_KNOWN_CAUSE_KEYS_REQUIRED = frozenset({"cause_id", "description", "timeline_ref"})
_KNOWN_CAUSE_KEYS_ALL = _KNOWN_CAUSE_KEYS_REQUIRED | {"source_analysis_ref"}
_KNOWN_ACTION_KEYS = frozenset({"action_id", "description", "owner"})

_ERROR_MESSAGES: dict[str, str] = {
    "POSTMORTEM_INVALID_TIMELINE": "timeline must be a non-empty list of well-shaped, uniquely-identified {event_id (T- prefixed), timestamp, description} entries -- exactly these three keys, no field for a named individual/person",
    "POSTMORTEM_INVALID_CAUSES": "causes must be a non-empty list of well-shaped, uniquely-identified {cause_id (C- prefixed), description, timeline_ref, [source_analysis_ref]} entries -- no field for a named individual/person",
    "POSTMORTEM_DANGLING_CAUSE_REFERENCE": "a cause's own timeline_ref does not name a real timeline[] event in THIS record",
    "POSTMORTEM_INVALID_ACTIONS": "actions must be a non-empty list of well-shaped, uniquely-identified {action_id (A- prefixed), description, owner} entries",
}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never Python's own recursive ``repr()``, same
    discipline every sibling module in this family already uses (a bare recursive repr over caller-supplied
    input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --- timeline[] -- invariant #1 (NO-BLAME) + half of invariant #2 ("must exist before causes") -------------


def _timeline_entry_is_valid(entry: Any) -> bool:
    """Shape only. Real invariant #1 (NO-BLAME) lives here: closed key set, no field for a named
    individual/person."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_TIMELINE_KEYS:
        return False
    if not _is_nonempty_str(entry["event_id"]) or not entry["event_id"].startswith(TIMELINE_EVENT_ID_PREFIX):
        return False
    if not _is_nonempty_str(entry["timestamp"]):
        return False
    return _is_nonempty_str(entry["description"])


def _timeline_is_valid(value: Any) -> tuple[bool, frozenset[str], str | None]:
    """Shared predicate (builder + gate). Returns (is_valid, declared_event_ids, error_code_if_invalid).
    Non-empty (invariant #2's "must exist before causes" half) + well-shaped + unique event_id."""
    if not isinstance(value, list) or not value:
        return False, frozenset(), "POSTMORTEM_INVALID_TIMELINE"
    ids: list[str] = []
    for entry in value:
        if not _timeline_entry_is_valid(entry):
            return False, frozenset(), "POSTMORTEM_INVALID_TIMELINE"
        ids.append(entry["event_id"])
    if len(ids) != len(set(ids)):
        return False, frozenset(), "POSTMORTEM_INVALID_TIMELINE"  # duplicate event_id within timeline[] itself
    return True, frozenset(ids), None


# --- causes[] -- invariant #1 (NO-BLAME, shape) + invariant #2 (referential integrity, checked separately) -


def _cause_entry_shape_is_valid(entry: Any) -> bool:
    """Shape only (closed key set -- invariant #1, NO-BLAME, lives here) -- does NOT check timeline_ref
    resolvability; that is invariant #2, checked separately by ``_dangling_cause_references`` (same
    three-concern shape/mode/referential split ``root_cause.fault_tree`` establishes)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _KNOWN_CAUSE_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_CAUSE_KEYS_ALL):
        return False
    if not _is_nonempty_str(entry["cause_id"]) or not entry["cause_id"].startswith(CAUSE_ID_PREFIX):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    if not _is_nonempty_str(entry.get("timeline_ref")):
        return False
    if "source_analysis_ref" in entry and not _is_nonempty_str(entry["source_analysis_ref"]):
        return False
    return True


def _causes_are_valid(value: Any) -> tuple[bool, str | None]:
    """Shared predicate: non-empty, each entry shape-valid, cause_id unique within causes[]. Referential
    integrity (timeline_ref resolvability) is invariant #2, re-derived separately by
    ``_dangling_cause_references``."""
    if not isinstance(value, list) or not value:
        return False, "POSTMORTEM_INVALID_CAUSES"
    ids: list[str] = []
    for entry in value:
        if not _cause_entry_shape_is_valid(entry):
            return False, "POSTMORTEM_INVALID_CAUSES"
        ids.append(entry["cause_id"])
    if len(ids) != len(set(ids)):
        return False, "POSTMORTEM_INVALID_CAUSES"  # duplicate cause_id within causes[] itself
    return True, None


def _dangling_cause_references(causes: list[dict[str, Any]], known_event_ids: frozenset[str]) -> list[str]:
    """Invariant #2, re-derived from raw fields. Precondition: every entry already passed
    ``_cause_entry_shape_is_valid`` (call only after ``_causes_are_valid`` returns True). Returns every
    cause_id whose own timeline_ref does not resolve to a real timeline[] event in the SAME record."""
    return [entry["cause_id"] for entry in causes if entry["timeline_ref"] not in known_event_ids]


# --- actions[] -- invariant #3 (ownership, shape separate from non-empty-owner check) -----------------------


def _action_shape_is_valid(entry: Any) -> bool:
    """Shape only (closed key set, id prefix, non-empty description) -- does NOT check owner non-emptiness;
    that is invariant #3, checked separately (same three-tier split ``learning.kill_criteria``'s own
    ``_threshold_shape_is_valid``/``KILLCRITERIA_UNOWNED_THRESHOLD`` split establishes)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_ACTION_KEYS:
        return False
    if not _is_nonempty_str(entry["action_id"]) or not entry["action_id"].startswith(ACTION_ID_PREFIX):
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    return isinstance(entry["owner"], str)


def _actions_are_valid(value: Any) -> tuple[bool, str | None]:
    """Shared predicate: non-empty, each entry shape-valid, action_id unique within actions[]. Owner
    non-emptiness is invariant #3, re-derived separately by ``_unowned_action_ids``."""
    if not isinstance(value, list) or not value:
        return False, "POSTMORTEM_INVALID_ACTIONS"
    ids: list[str] = []
    for entry in value:
        if not _action_shape_is_valid(entry):
            return False, "POSTMORTEM_INVALID_ACTIONS"
        ids.append(entry["action_id"])
    if len(ids) != len(set(ids)):
        return False, "POSTMORTEM_INVALID_ACTIONS"  # duplicate action_id within actions[] itself
    return True, None


def _unowned_action_ids(value: list[dict[str, Any]]) -> list[str]:
    """Invariant #3, re-derived from raw fields -- does not trust construction already ran. Precondition:
    ``value`` already passed ``_actions_are_valid`` (every entry is a well-shaped dict)."""
    return [entry["action_id"] for entry in value if not (entry.get("owner") or "").strip()]


# --- convenience constructors (not themselves the invariant boundary -- generate_post_mortem_record/the ----
# --- gates validate whatever dict they are handed regardless of how it was built) ---------------------------


def timeline_event(event_id: str, timestamp: str, description: str) -> dict[str, Any]:
    """One ``timeline[]`` entry."""
    if not _is_nonempty_str(event_id) or not event_id.startswith(TIMELINE_EVENT_ID_PREFIX):
        raise InvariantViolation(f"POSTMORTEM_INVALID_TIMELINE: event_id must be a non-empty string beginning with {TIMELINE_EVENT_ID_PREFIX!r}, got {event_id!r}")
    if not _is_nonempty_str(timestamp):
        raise InvariantViolation(f"POSTMORTEM_INVALID_TIMELINE: timestamp must be a non-empty string, got {timestamp!r}")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"POSTMORTEM_INVALID_TIMELINE: description must be a non-empty string, got {description!r}")
    return {"event_id": event_id, "timestamp": timestamp, "description": description}


def cause(cause_id: str, description: str, timeline_ref: str, *, source_analysis_ref: str | None = None) -> dict[str, Any]:
    """One ``causes[]`` entry. ``timeline_ref`` resolvability against a real record's timeline is checked by
    ``generate_post_mortem_record``/the gate (this function has no record to check against). NO field here
    for a named individual/person (invariant #1)."""
    if not _is_nonempty_str(cause_id) or not cause_id.startswith(CAUSE_ID_PREFIX):
        raise InvariantViolation(f"POSTMORTEM_INVALID_CAUSES: cause_id must be a non-empty string beginning with {CAUSE_ID_PREFIX!r}, got {cause_id!r}")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"POSTMORTEM_INVALID_CAUSES: description must be a non-empty string, got {description!r}")
    if not _is_nonempty_str(timeline_ref):
        raise InvariantViolation(f"POSTMORTEM_INVALID_CAUSES: timeline_ref must be a non-empty string, got {timeline_ref!r}")
    if source_analysis_ref is not None and not _is_nonempty_str(source_analysis_ref):
        raise InvariantViolation(f"POSTMORTEM_INVALID_CAUSES: source_analysis_ref must be a non-empty string or None, got {source_analysis_ref!r}")
    record: dict[str, Any] = {"cause_id": cause_id, "description": description, "timeline_ref": timeline_ref}
    if source_analysis_ref is not None:
        record["source_analysis_ref"] = source_analysis_ref
    return record


def action(action_id: str, description: str, owner: str) -> dict[str, Any]:
    """One ``actions[]`` entry. ``owner`` validated non-empty at construction (invariant #3: an unowned
    action cannot actually be invoked to prevent recurrence). FORWARD-looking accountability, never fault
    attribution -- see module docstring."""
    if not _is_nonempty_str(action_id) or not action_id.startswith(ACTION_ID_PREFIX):
        raise InvariantViolation(f"POSTMORTEM_INVALID_ACTIONS: action_id must be a non-empty string beginning with {ACTION_ID_PREFIX!r}, got {action_id!r}")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"POSTMORTEM_INVALID_ACTIONS: description must be a non-empty string, got {description!r}")
    if not isinstance(owner, str) or not owner.strip():
        raise InvariantViolation(f"POSTMORTEM_UNOWNED_ACTION: action {action_id!r} has no owner -- an unowned action cannot actually be invoked to prevent recurrence")
    return {"action_id": action_id, "description": description, "owner": owner}


def generate_post_mortem_record(
    record_id: str,
    incident_name: str,
    timeline: list[dict[str, Any]],
    impact_description: str,
    causes: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/post-mortem-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in Atlas's own L805 formula order (timeline->impact->causes->actions):
    record_id (POSTMORTEM- prefix)/incident_name/impact_description non-empty, version a real string,
    timeline a non-empty list of well-shaped, uniquely-identified entries (NO field for a named individual --
    invariant #1), causes a non-empty list of well-shaped, uniquely-identified entries each resolving its own
    timeline_ref to a REAL timeline[] entry in THIS SAME record (invariant #2), actions a non-empty list of
    well-shaped, uniquely-identified entries each carrying a non-empty owner (invariant #3). REBUILDS every
    nested object it owns; provenance is stored by reference, the same family-wide convention every prior
    module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"POSTMORTEM_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(incident_name):
        raise InvariantViolation(f"POSTMORTEM_EMPTY_RECORD_FIELD: incident_name must be a non-empty string, got {incident_name!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"POSTMORTEM_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(impact_description):
        raise InvariantViolation(f"POSTMORTEM_INVALID_IMPACT: impact_description must be a non-empty string, got {impact_description!r}")

    timeline_ok, known_event_ids, timeline_error = _timeline_is_valid(timeline)
    if not timeline_ok:
        raise InvariantViolation(f"{timeline_error}: {_ERROR_MESSAGES[timeline_error]}, got timeline={_shallow_describe(timeline)}")

    causes_ok, causes_error = _causes_are_valid(causes)
    if not causes_ok:
        raise InvariantViolation(f"{causes_error}: {_ERROR_MESSAGES[causes_error]}, got causes={_shallow_describe(causes)}")
    dangling = _dangling_cause_references(causes, known_event_ids)
    if dangling:
        raise InvariantViolation(f"POSTMORTEM_DANGLING_CAUSE_REFERENCE: {_ERROR_MESSAGES['POSTMORTEM_DANGLING_CAUSE_REFERENCE']} -- cause(s) {dangling}")

    actions_ok, actions_error = _actions_are_valid(actions)
    if not actions_ok:
        raise InvariantViolation(f"{actions_error}: {_ERROR_MESSAGES[actions_error]}, got actions={_shallow_describe(actions)}")
    unowned = _unowned_action_ids(actions)
    if unowned:
        raise InvariantViolation(f"POSTMORTEM_UNOWNED_ACTION: action(s) {unowned} have no owner -- an unowned action cannot actually be invoked to prevent recurrence")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "incident_name": incident_name,
        "timeline": [dict(t) for t in timeline],
        "impact_description": impact_description,
        "causes": [dict(c) for c in causes],
        "actions": [dict(a) for a in actions],
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


def evaluate_post_mortem_structure_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #1 (NO-BLAME shape) for timeline[]/causes[]/actions[] from the record's own raw
    fields -- does not trust any stored value. Reuses the EXACT SAME predicates the builder calls, single
    source of truth for what "valid" means. Does NOT check causes[] referential integrity (separate gate) or
    actions[] ownership (separate gate) -- each gate independently diagnosable."""
    if not isinstance(record, dict):
        return _result("post_mortem_structure", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("post_mortem_structure", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("post_mortem_structure", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("incident_name")):
        return _result("post_mortem_structure", False, [{"reason": "incident_name missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("impact_description")):
        return _result("post_mortem_structure", False, [{"reason": "impact_description missing or empty"}], validator, timestamp)

    timeline_ok, known_event_ids, timeline_error = _timeline_is_valid(record.get("timeline"))
    if not timeline_ok:
        return _result("post_mortem_structure", False, [{"reason": f"{timeline_error}: {_ERROR_MESSAGES[timeline_error]}"}], validator, timestamp)

    causes_ok, causes_error = _causes_are_valid(record.get("causes"))
    if not causes_ok:
        return _result("post_mortem_structure", False, [{"reason": f"{causes_error}: {_ERROR_MESSAGES[causes_error]}"}], validator, timestamp)

    actions_ok, actions_error = _actions_are_valid(record.get("actions"))
    if not actions_ok:
        return _result("post_mortem_structure", False, [{"reason": f"{actions_error}: {_ERROR_MESSAGES[actions_error]}"}], validator, timestamp)

    return _result(
        "post_mortem_structure",
        True,
        [{"timeline_count": len(known_event_ids), "cause_count": len(record["causes"]), "action_count": len(record["actions"])}],
        validator,
        timestamp,
    )


def evaluate_post_mortem_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #2 (every cause traces to a real timeline event) from the record's own raw
    fields -- independent of the structure gate above; fails closed (not merely blocked) if timeline/causes
    are themselves malformed, since a dangling-reference verdict cannot be computed against invalid shape."""
    if not isinstance(record, dict):
        return _result("post_mortem_referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    timeline_ok, known_event_ids, timeline_error = _timeline_is_valid(record.get("timeline"))
    if not timeline_ok:
        return _result("post_mortem_referential_integrity", False, [{"reason": f"timeline invalid: {timeline_error}"}], validator, timestamp)
    causes_ok, causes_error = _causes_are_valid(record.get("causes"))
    if not causes_ok:
        return _result("post_mortem_referential_integrity", False, [{"reason": f"causes invalid: {causes_error}"}], validator, timestamp)
    dangling = _dangling_cause_references(record["causes"], known_event_ids)
    passed = not dangling
    return _result("post_mortem_referential_integrity", passed, [{"dangling_cause_ids": dangling}], validator, timestamp)


def evaluate_post_mortem_action_ownership_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #3 (every action has a real owner) from the record's own raw fields --
    independent of the other two gates. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("post_mortem_action_ownership", False, [{"reason": "record is not a dict"}], validator, timestamp)
    actions_ok, actions_error = _actions_are_valid(record.get("actions"))
    if not actions_ok:
        return _result("post_mortem_action_ownership", False, [{"reason": f"actions invalid: {actions_error}"}], validator, timestamp)
    unowned = _unowned_action_ids(record["actions"])
    passed = not unowned
    return _result("post_mortem_action_ownership", passed, [{"unowned_action_ids": unowned}], validator, timestamp)


def evaluate_post_mortem_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_post_mortem_structure_gate(record, validator, timestamp),
        evaluate_post_mortem_referential_integrity_gate(record, validator, timestamp),
        evaluate_post_mortem_action_ownership_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
