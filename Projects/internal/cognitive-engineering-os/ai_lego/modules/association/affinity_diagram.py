"""``association.affinity_diagram`` -- F04 "Associative Mapping & Combination" family (methods/contracts/
association.affinity_diagram.contract.yaml), 1st real method built in this family (grep-confirmed 0/many
before this batch -- no ``ai_lego/modules/association/`` directory existed). Built in parallel with
``association.mind_map`` / ``association.concept_map`` / ``association.morphological_analysis`` /
``association.attribute_listing`` (4 other concurrent agents, same batch -- not read or depended on here, per
this task's own scope boundary).

Atlas's citations: F04 table row (L413: "Affinity Diagram｜大量 idea 自然分群｜一卡一 idea→靜默分群→命名｜
找 pattern、降低資訊量｜Thematic Analysis") plus dedicated §11.3 (L1206-1224, the 5-step 使用方式: one card =
one idea -> do NOT pre-define category names -> let similar cards cluster silently, no forced framework ->
name the groups AFTER they form -> find higher-level cross-group themes). Grep-confirmed 6 total "Affinity
Diagram" hits in the whole Atlas file: the table row, §11.3, Mind Map's own §11.x step 4 prose (L1134), the
F04 recipe chain "推薦搭配" line (L1172, "Mind Map → Affinity Diagram → Concept Map / Issue Tree"), a Simple
Brainstorm Recipe mermaid node (L3218), a Phase 1 priority-implementation list entry (L4277), and the §28
quick-tool-selection table (L4467) -- all read and confirmed consistent, no field-level shape given beyond
what this module's own docstring cites.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"affinity" -- zero pre-existing implementation.

**Structural point, taken literally (not just as a docstring claim):** Atlas's own 5-step order IS the whole
discipline -- grouping happens BEFORE naming, category names are NEVER pre-defined. Step 2 ("先不預設分類
名稱") is a PROCESS constraint about how the analyst worked; a finished record cannot prove naming happened
after clustering rather than before, so no field is invented to fake-enforce it (see the typed-object
schema's own compilation_decisions for the full honesty note). What IS genuinely checkable on the finished
data shape:

1. ``cards``/``groups`` shape + referential integrity: every ``groups[].item_refs`` entry must resolve to a
   real ``cards[].id``, and no card is referenced by more than one group (mutual exclusivity -- Atlas's own
   physical sticky-note-pile metaphor has no multi-membership concept). If ``higher_level_themes`` is present,
   every entry's ``group_refs`` must resolve to real ``groups[].id`` and carry >=2 of them (a "theme" naming
   one group is a rename, not a cross-group relationship).
2. ``ungrouped_card_refs`` is GENUINE_COMPUTE (``cards[].id`` minus every group's ``item_refs``, in ``cards[]``
   order) -- re-derived by both the builder and an independent gate, never caller-supplied. This is the
   explicit-non-coverage-over-silent-omission choice: forcing 100% grouping would pressure a producer to
   invent a fake cluster just to pass validation, directly contradicting Atlas's own step-3 "no forced
   framework" discipline -- same precedent ``framing.five_w_one_h``'s own UNKNOWN state and
   ``framing.boundary_critique``'s own DECLARED_EMPTY category already establish for their own coverage
   questions.

Both real invariants are enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.affinity_diagram"
RECORD_ID_PREFIX = "AFFINITY-"
MIN_GROUP_REFS_FOR_THEME = 2
# Atlas step 5's own "跨群關係" (cross-group relationship) -- a theme naming a single group is a rename, not
# a genuinely cross-group pattern.

_CARD_REQUIRED_KEYS = frozenset({"id", "text", "provenance"})
_CARD_ALLOWED_KEYS = _CARD_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})
_GROUP_REQUIRED_KEYS = frozenset({"id", "name", "item_refs", "provenance"})
_THEME_REQUIRED_KEYS = frozenset({"theme", "group_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``ai_lego/modules/framing/frame_storming.py``'s own ``_shallow_describe`` already uses (a bare
    recursive repr over caller-supplied input of unknown size is itself a small denial-of-service surface in
    an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _card_shape_ok(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not (_CARD_REQUIRED_KEYS <= keys <= _CARD_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("text")):
        return False
    return _refs_shape_ok(entry)


def _cards_are_valid(cards: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this suite already establishes.

    Real invariant: >=1 well-shaped entry (Atlas step 1, "一卡一 idea"), every id unique across the array.
    """
    if not isinstance(cards, list) or len(cards) < 1:
        return False, "TOO_FEW"
    if not all(_card_shape_ok(c) for c in cards):
        return False, "SHAPE"
    ids = [c["id"] for c in cards]
    if len(set(ids)) != len(ids):
        return False, "DUPLICATE_ID"
    return True, None


def _group_shape_ok(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _GROUP_REQUIRED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("name")):
        return False
    item_refs = entry.get("item_refs")
    if not isinstance(item_refs, list) or len(item_refs) < 1:
        return False
    if not all(isinstance(r, str) and r.strip() for r in item_refs):
        return False
    return len(set(item_refs)) == len(item_refs)


def _groups_are_valid(groups: Any, card_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate.

    Real invariants: >=1 well-shaped entry (Atlas steps 3-4, clustering then naming); every group id unique;
    every ``item_refs`` entry resolves to a real card id (referential integrity); no card id referenced by
    more than one group (mutual exclusivity -- see module docstring).
    """
    if not isinstance(groups, list) or len(groups) < 1:
        return False, "TOO_FEW"
    if not all(_group_shape_ok(g) for g in groups):
        return False, "SHAPE"
    ids = [g["id"] for g in groups]
    if len(set(ids)) != len(ids):
        return False, "DUPLICATE_ID"
    seen_card_refs: set[str] = set()
    for group in groups:
        for ref in group["item_refs"]:
            if ref not in card_ids:
                return False, "UNKNOWN_CARD_REF"
            if ref in seen_card_refs:
                return False, "CARD_IN_MULTIPLE_GROUPS"
            seen_card_refs.add(ref)
    return True, None


def _theme_shape_ok(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _THEME_REQUIRED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("theme")):
        return False
    group_refs = entry.get("group_refs")
    if not isinstance(group_refs, list) or not all(isinstance(r, str) and r.strip() for r in group_refs):
        return False
    return len(set(group_refs)) == len(group_refs)


def _higher_level_themes_are_valid(themes: Any, group_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Only called when ``themes`` is truthy (present and non-empty)
    -- an empty or omitted ``higher_level_themes`` is legal (Atlas step 5 is optional, see module docstring).

    Real invariants: every entry well-shaped; every ``group_refs`` entry resolves to a real group id
    (referential integrity); every entry carries >=``MIN_GROUP_REFS_FOR_THEME`` group_refs (a genuinely
    cross-group relationship, not a single-group rename).
    """
    if not isinstance(themes, list) or not all(_theme_shape_ok(t) for t in themes):
        return False, "SHAPE"
    for theme in themes:
        group_refs = theme["group_refs"]
        if len(group_refs) < MIN_GROUP_REFS_FOR_THEME:
            return False, "TOO_FEW_GROUP_REFS"
        if not set(group_refs) <= group_ids:
            return False, "UNKNOWN_GROUP_REF"
    return True, None


def derive_ungrouped_card_refs(cards: list[dict[str, Any]], groups: list[dict[str, Any]]) -> list[str]:
    """GENUINE_COMPUTE -- ``cards[].id`` minus every group's ``item_refs``, in ``cards[]`` array order. The
    ONLY place this list is produced; never a caller-supplied value (see module docstring)."""
    grouped: set[str] = set()
    for group in groups:
        grouped.update(group["item_refs"])
    return [c["id"] for c in cards if c["id"] not in grouped]


def card_entry(
    card_id: str,
    text: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/affinity-diagram-record.schema.yaml#/properties/cards``. A thin
    convenience constructor that emits ONLY the keys the caller actually passed -- it does NOT itself enforce
    the shape/uniqueness invariants (``generate_affinity_diagram_record`` validates whatever list of dicts it
    is handed regardless of how each entry was built), same "helper is not the invariant boundary" discipline
    every sibling module in this suite already establishes -- mutation tests build entries directly, bypassing
    this helper, to prove the builder itself enforces the invariants."""
    record: dict[str, Any] = {"id": card_id, "text": text, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def group_entry(group_id: str, name: str, item_refs: list[str], provenance: dict[str, Any]) -> dict[str, Any]:
    """One item of ``typed-objects/affinity-diagram-record.schema.yaml#/properties/groups``. Same
    "thin constructor, not the invariant boundary" discipline as ``card_entry`` above."""
    return {"id": group_id, "name": name, "item_refs": list(item_refs), "provenance": provenance}


def higher_level_theme_entry(theme: str, group_refs: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/affinity-diagram-record.schema.yaml#/properties/higher_level_themes``.
    Same "thin constructor, not the invariant boundary" discipline as ``card_entry``/``group_entry`` above.
    No ``provenance`` field -- Atlas step 5's cross-group theme is a soft synthesis label over already
    evidence-backed groups/cards, not itself a first-class evidence-bearing claim, same restraint
    ``decision.weighted_decision_matrix``'s own un-provenanced ``sensitivity_notes`` field already
    establishes for an equally uncomputed Atlas-cited stage."""
    return {"theme": theme, "group_refs": list(group_refs)}


def generate_affinity_diagram_record(
    record_id: str,
    topic: str,
    cards: list[dict[str, Any]],
    groups: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    higher_level_themes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/affinity-diagram-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before-
    construction" discipline every sibling module in this suite already establishes -- never a record that
    itself proves it was built illegally. ``ungrouped_card_refs`` is NOT an accepted parameter: it is ALWAYS
    computed here via ``derive_ungrouped_card_refs``, so there is no code path through which a caller could
    construct a record whose stored coverage disagrees with its own cards/groups (see module docstring,
    "structural point, taken literally").
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"AFFINITYDIAGRAM_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"AFFINITYDIAGRAM_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(topic):
        raise InvariantViolation(f"AFFINITYDIAGRAM_EMPTY_TOPIC: topic must be a non-empty string, got {topic!r}")

    cards_ok, cards_reason = _cards_are_valid(cards)
    if not cards_ok:
        if cards_reason == "TOO_FEW":
            raise InvariantViolation(f"AFFINITYDIAGRAM_TOO_FEW_CARDS: cards must carry at least 1 entry (Atlas step 1, '一卡一 idea'), got {_shallow_describe(cards)}")
        if cards_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"AFFINITYDIAGRAM_DUPLICATE_CARD_ID: cards ids must be unique, got {[c.get('id') for c in cards]!r}")
        raise InvariantViolation(f"AFFINITYDIAGRAM_INVALID_CARD_SHAPE: every cards entry must carry a non-empty id, a non-empty text, and a valid provenance, got {_shallow_describe(cards)}")

    card_ids = frozenset(c["id"] for c in cards)
    groups_ok, groups_reason = _groups_are_valid(groups, card_ids)
    if not groups_ok:
        if groups_reason == "TOO_FEW":
            raise InvariantViolation(f"AFFINITYDIAGRAM_TOO_FEW_GROUPS: groups must carry at least 1 entry (Atlas steps 3-4, clustering then naming), got {_shallow_describe(groups)}")
        if groups_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"AFFINITYDIAGRAM_DUPLICATE_GROUP_ID: groups ids must be unique, got {[g.get('id') for g in groups]!r}")
        if groups_reason == "UNKNOWN_CARD_REF":
            raise InvariantViolation(f"AFFINITYDIAGRAM_GROUP_REFERENCES_UNKNOWN_CARD: every groups[].item_refs entry must resolve to a real cards[].id, got groups={_shallow_describe(groups)}, known card ids={sorted(card_ids)!r}")
        if groups_reason == "CARD_IN_MULTIPLE_GROUPS":
            raise InvariantViolation(f"AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS: a card must not be referenced by more than one group (Atlas's own single-pile clustering metaphor), got groups={_shallow_describe(groups)}")
        raise InvariantViolation(f"AFFINITYDIAGRAM_INVALID_GROUP_SHAPE: every groups entry must carry a non-empty id, a non-empty name, a non-empty unique item_refs list, and a valid provenance, got {_shallow_describe(groups)}")

    if higher_level_themes:
        group_ids = frozenset(g["id"] for g in groups)
        themes_ok, themes_reason = _higher_level_themes_are_valid(higher_level_themes, group_ids)
        if not themes_ok:
            if themes_reason == "TOO_FEW_GROUP_REFS":
                raise InvariantViolation(f"AFFINITYDIAGRAM_THEME_TOO_FEW_GROUP_REFS: every higher_level_themes entry must carry >={MIN_GROUP_REFS_FOR_THEME} group_refs (a genuinely cross-group relationship), got {_shallow_describe(higher_level_themes)}")
            if themes_reason == "UNKNOWN_GROUP_REF":
                raise InvariantViolation(f"AFFINITYDIAGRAM_THEME_REFERENCES_UNKNOWN_GROUP: every higher_level_themes[].group_refs entry must resolve to a real groups[].id, got {_shallow_describe(higher_level_themes)}, known group ids={sorted(group_ids)!r}")
            raise InvariantViolation(f"AFFINITYDIAGRAM_INVALID_THEME_SHAPE: every higher_level_themes entry must carry a non-empty theme and a unique-string group_refs list, got {_shallow_describe(higher_level_themes)}")

    ungrouped_card_refs = derive_ungrouped_card_refs(cards, groups)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "topic": topic,
        "cards": [dict(c) for c in cards],
        "groups": [dict(g) for g in groups],
        "ungrouped_card_refs": ungrouped_card_refs,
        "provenance": provenance,
    }
    if higher_level_themes:
        record["higher_level_themes"] = [dict(t) for t in higher_level_themes]
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every card, every group, AND the overall record
    carry a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    cards = record.get("cards")
    cards = cards if isinstance(cards, list) else []
    groups = record.get("groups")
    groups = groups if isinstance(groups, list) else []
    invalid_cards = [c.get("id") for c in cards if isinstance(c, dict) and not provenance_is_valid(c.get("provenance"))]
    invalid_groups = [g.get("id") for g in groups if isinstance(g, dict) and not provenance_is_valid(g.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(cards) and bool(groups) and not invalid_cards and not invalid_groups and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"cards_checked": len(cards), "groups_checked": len(groups), "invalid_provenance_cards": invalid_cards, "invalid_provenance_groups": invalid_groups, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check every sibling
    module in this suite already uses: a card labeled EVIDENCE must actually cite supporting_evidence_refs.
    Scoped to ``cards`` only -- ``groups`` are structural containers formed by clustering already-labeled
    cards, not themselves a new evidentiary claim requiring a separate label."""
    cards = record.get("cards") if isinstance(record, dict) else None
    cards = cards if isinstance(cards, list) else []
    problems: list[dict[str, Any]] = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        epistemic_type = (c.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"id": c.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not c.get("supporting_evidence_refs"):
            problems.append({"id": c.get("id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(cards) and not problems
    return _result("evidence_labeling_required", passed, [{"cards_checked": len(cards), "problems": problems}], validator, timestamp)


def evaluate_affinity_diagram_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_affinity_diagram_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the ONLY
    place ``ungrouped_card_refs`` is checked against reality: re-derives it via ``derive_ungrouped_card_refs``
    and compares to the stored value -- a record whose ``cards``/``groups`` were edited without recomputing
    ``ungrouped_card_refs`` (or vice versa) fails here even though each field is, in isolation, individually
    well-shaped. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("affinity_diagram_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("affinity_diagram_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("affinity_diagram_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("topic")):
        return _result("affinity_diagram_integrity", False, [{"reason": "topic missing or empty"}], validator, timestamp)

    cards_ok, cards_reason = _cards_are_valid(record.get("cards"))
    if not cards_ok:
        return _result("affinity_diagram_integrity", False, [{"reason": f"cards invalid ({cards_reason})"}], validator, timestamp)

    cards = record["cards"]
    card_ids = frozenset(c["id"] for c in cards)
    groups_ok, groups_reason = _groups_are_valid(record.get("groups"), card_ids)
    if not groups_ok:
        return _result("affinity_diagram_integrity", False, [{"reason": f"groups invalid ({groups_reason})"}], validator, timestamp)

    groups = record["groups"]
    themes = record.get("higher_level_themes")
    if themes is not None:
        group_ids = frozenset(g["id"] for g in groups)
        themes_ok, themes_reason = _higher_level_themes_are_valid(themes, group_ids)
        if not themes_ok:
            return _result("affinity_diagram_integrity", False, [{"reason": f"higher_level_themes invalid ({themes_reason})"}], validator, timestamp)

    recomputed_ungrouped = derive_ungrouped_card_refs(cards, groups)
    stored_ungrouped = record.get("ungrouped_card_refs")
    if not isinstance(stored_ungrouped, list) or stored_ungrouped != recomputed_ungrouped:
        return _result(
            "affinity_diagram_integrity",
            False,
            [{"reason": "AFFINITYDIAGRAM_UNGROUPED_MISMATCH", "stored": stored_ungrouped, "recomputed": recomputed_ungrouped}],
            validator,
            timestamp,
        )

    return _result(
        "affinity_diagram_integrity",
        True,
        [{"card_count": len(cards), "group_count": len(groups), "ungrouped_count": len(recomputed_ungrouped)}],
        validator,
        timestamp,
    )


def evaluate_affinity_diagram_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation (which also re-derives ungrouped_card_refs)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_affinity_diagram_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
