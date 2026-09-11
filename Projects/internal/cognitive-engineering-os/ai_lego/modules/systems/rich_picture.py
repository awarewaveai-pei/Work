"""``systems.rich_picture`` -- F09 systems-thinking family (Atlas L541-559), 1 of 2 members this agent opens
in a parallel batch alongside ``systems.systems_archetypes`` (family had 0 real methods built before this
batch except a concurrent sibling agent's own ``leverage_point_analysis.py`` -- zero file overlap).

Atlas cites this method ONCE: the F09 tool table row (L549: "Rich Picture｜自由畫 actors/process/conflict｜
問題尚無法形式化時｜建立複雜問題共同理解"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section.

Two objects, transcribed from the row's own "actors/process/conflict" (minus 'process', see the schema's
own ``open_questions``): ``actors`` (who is in the picture) and ``issues`` (the tensions the picture
surfaces, each referencing >=1 of the declared actors).

Two real invariants, EACH enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. **Structural minimum** (``RICHPIC_INVALID_ACTORS`` / ``RICHPIC_DUPLICATE_ACTOR_ID`` /
   ``RICHPIC_EMPTY_ISSUES``): ``actors`` has >=1 well-shaped ``{id, name}`` entry with unique ids; ``issues``
   has >=1 well-shaped ``{id, description, involves_actor_ids}`` entry with unique ids -- an empty picture
   captured no one and no tension, same "floor tied to the method's own defining structural point" reasoning
   ``association.concept_map``'s own ``edges: minItems 1`` already establishes.
2. **Issue referential integrity + evidence minimum** (``RICHPIC_ISSUE_NO_ACTORS_INVOLVED`` /
   ``RICHPIC_ISSUE_DANGLING_ACTOR_REF`` / ``RICHPIC_DUPLICATE_ISSUE_ID``): every ``issues[].involves_actor_ids``
   has >=1 entry (an issue naming zero actors is not grounded in the picture) and EVERY entry must resolve to
   a real ``actors[].id`` declared in the SAME record -- a dangling reference to an actor who was never drawn
   is refused, same referential-integrity class ``stakeholders.coalition_mapping``'s own
   ``COALMAP_SCENARIO_DANGLING_MEMBER_REF`` already establishes for its own sibling member_ids/profile-id
   shape (this method's own floor is >=1, not coalition_mapping's >=2 -- see the contract's own
   ``compilation_decisions`` for why that departure is deliberate, not an oversight).

This method does NOT generate or lay out the picture itself -- ``actors``/``issues`` are caller-supplied
content, same "validate-only" scope ``stakeholders.coalition_mapping``'s own identical decision already
establishes; only structural completeness and referential integrity are mechanically enforced.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "rich picture"/"archetype" before
writing any of this batch's own files: zero pre-existing implementation (only the table row itself and the
``method-inventory.yaml``/``contract-backlog.yaml`` backlog entries, both read, neither edited).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.rich_picture"
RECORD_ID_PREFIX = "RP-"

_ACTOR_KEYS = frozenset({"id", "name"})
_ISSUE_KEYS = frozenset({"id", "description", "involves_actor_ids"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_id(value: Any) -> bool:
    """An id must be non-empty AND carry no leading/trailing whitespace -- same shape-boundary rejection
    ``stakeholders.coalition_mapping``'s own ``_is_valid_id`` establishes (2026-09-11 critic fix: reject a
    whitespace-padded id outright rather than silently stripping it, so a `involves_actor_ids` reference can
    never disagree byte-for-byte with the `actors[].id` it was supposed to resolve to)."""
    return _is_nonempty_str(value) and value == value.strip()


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _shaped(entry: Any, required_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == required_keys


# --------------------------------------------------------------------------
# Shared predicates -- reused by BOTH the builder and the gate so neither can drift from the other, same
# discipline ``stakeholders.coalition_mapping``'s own ``_stakeholder_profiles_are_valid``/
# ``_coalition_scenarios_are_valid`` already establishes.
# --------------------------------------------------------------------------


def _actors_are_valid(actors: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``.

    Real invariant: a list of at least 1 well-shaped ``{id, name}`` entry, unique whitespace-free ``id``
    values (see ``_is_valid_id``), non-empty ``name`` per entry.
    """
    if not isinstance(actors, list) or not actors:
        return False, "TOO_FEW"
    seen_ids: set[str] = set()
    for actor in actors:
        if not _shaped(actor, _ACTOR_KEYS):
            return False, "SHAPE"
        if not _is_valid_id(actor.get("id")) or not _is_nonempty_str(actor.get("name")):
            return False, "SHAPE"
        if actor["id"] in seen_ids:
            return False, "DUPLICATE_ID"
        seen_ids.add(actor["id"])
    return True, None


def _issues_are_valid(issues: Any, actor_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``.

    Real invariant: a non-empty list of well-shaped ``{id, description, involves_actor_ids}`` entries with
    unique whitespace-free issue ``id`` values (see ``_is_valid_id``); every ``involves_actor_ids`` has >=1
    entry (see the module docstring for why the floor is 1, not 2), each a whitespace-free string resolving
    to a real id in ``actor_ids`` -- a dangling reference is refused, never silently accepted.
    """
    if not isinstance(issues, list) or not issues:
        return False, "EMPTY"
    seen_issue_ids: set[str] = set()
    for issue in issues:
        if not _shaped(issue, _ISSUE_KEYS):
            return False, "SHAPE"
        if not _is_valid_id(issue.get("id")) or not _is_nonempty_str(issue.get("description")):
            return False, "SHAPE"
        if issue["id"] in seen_issue_ids:
            return False, "DUPLICATE_ID"
        seen_issue_ids.add(issue["id"])
        involves = issue.get("involves_actor_ids")
        if not isinstance(involves, list) or not all(_is_valid_id(a) for a in involves):
            return False, "SHAPE"
        if not involves:
            return False, "NO_ACTORS_INVOLVED"
        if not all(a in actor_ids for a in involves):
            return False, "DANGLING_REF"
    return True, None


# --------------------------------------------------------------------------
# Convenience constructors -- thin, do NOT themselves enforce shape/uniqueness (``generate_...`` validates
# whatever list it is handed regardless of how it was built, same "helper is not the invariant boundary"
# discipline every sibling module in this suite already establishes; mutation tests build entries directly,
# bypassing these helpers, to prove the builder itself enforces the invariants).
# --------------------------------------------------------------------------


def actor(actor_id: str, name: str) -> dict[str, Any]:
    """One item of ``typed-objects/rich-picture.schema.yaml#/properties/actors``."""
    return {"id": actor_id, "name": name}


def issue(issue_id: str, description: str, involves_actor_ids: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/rich-picture.schema.yaml#/properties/issues``."""
    return {"id": issue_id, "description": description, "involves_actor_ids": list(involves_actor_ids)}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_rich_picture_record(
    record_id: str,
    context: str,
    actors: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/rich-picture.schema.yaml``.

    Enforces both real invariants fail-closed, in order: id/version/context/provenance shape, the
    actor-structural-minimum invariant, then the issue referential-integrity + evidence-minimum invariant. A
    ``RichPictureRecord`` failing any one of these is refused at construction, never silently stored with a
    dangling actor reference or an issue naming zero actors.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RICHPIC_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RICHPIC_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"RICHPIC_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"RICHPIC_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    actors_ok, actors_reason = _actors_are_valid(actors)
    if not actors_ok:
        if actors_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"RICHPIC_DUPLICATE_ACTOR_ID: actors ids must be unique within one record, got {_shallow_describe(actors)}")
        raise InvariantViolation(f"RICHPIC_INVALID_ACTORS: actors must be a list of >=1 well-shaped {{id, name}} entries with unique ids, got {_shallow_describe(actors)}")

    actor_ids = frozenset(a["id"] for a in actors)
    issues_ok, issues_reason = _issues_are_valid(issues, actor_ids)
    if not issues_ok:
        if issues_reason == "EMPTY":
            raise InvariantViolation("RICHPIC_EMPTY_ISSUES: rich_picture is defined by its own captured tensions (Atlas L549's own 'conflict') -- at least 1 issue is required")
        if issues_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"RICHPIC_DUPLICATE_ISSUE_ID: issues ids must be unique within one record, got {_shallow_describe(issues)}")
        if issues_reason == "NO_ACTORS_INVOLVED":
            raise InvariantViolation(f"RICHPIC_ISSUE_NO_ACTORS_INVOLVED: every issues entry's involves_actor_ids must have at least 1 entry -- an issue grounded in no actor is not part of the picture, got {_shallow_describe(issues)}")
        if issues_reason == "DANGLING_REF":
            raise InvariantViolation(f"RICHPIC_ISSUE_DANGLING_ACTOR_REF: every issues involves_actor_ids entry must resolve to an actors id declared in this record, got {_shallow_describe(issues)}")
        raise InvariantViolation(f"RICHPIC_INVALID_ISSUES: issues must be a non-empty list of well-shaped {{id, description, involves_actor_ids}} entries, got {_shallow_describe(issues)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "actors": [dict(a) for a in actors],
        "issues": [{**i, "involves_actor_ids": list(i["involves_actor_ids"])} for i in issues],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never
# call generate_rich_picture_record -- a hand-tampered record that bypassed the builder entirely must be
# caught here exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid
    (record-level ONLY, see module docstring -- no per-actor or per-issue provenance field exists to check).
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_rich_picture_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_rich_picture_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Checks id/version/context shape,
    actor structural minimum, and issue referential integrity + evidence minimum, all independently. Fails
    closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("rich_picture_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("rich_picture_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("rich_picture_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("context")):
        return _result("rich_picture_integrity", False, [{"reason": "context missing or empty"}], validator, timestamp)

    actors_ok, actors_reason = _actors_are_valid(record.get("actors"))
    if not actors_ok:
        return _result("rich_picture_integrity", False, [{"reason": f"actors invalid ({actors_reason})"}], validator, timestamp)
    actor_ids = frozenset(a["id"] for a in record["actors"])

    issues_ok, issues_reason = _issues_are_valid(record.get("issues"), actor_ids)
    if not issues_ok:
        return _result("rich_picture_integrity", False, [{"reason": f"issues invalid ({issues_reason})"}], validator, timestamp)

    return _result(
        "rich_picture_integrity",
        True,
        [{"actor_count": len(record["actors"]), "issue_count": len(record["issues"])}],
        validator,
        timestamp,
    )


def evaluate_rich_picture_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_rich_picture_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
