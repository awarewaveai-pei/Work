"""``divergent.brainwriting`` -- F03 divergent-ideation family, FIRST member (family previously
entirely unbuilt; grep-confirmed zero pre-existing ``ai_lego/modules/divergent/`` directory before
writing this file; 1 of 10 agents opening independent F03 members in this same parallel batch).

Atlas cites this method at the F03 tool table row (L380: "Brainwriting｜降低權威/外向者主導｜先各自寫→
再分享/合併｜降低 anchoring、groupthink｜適合跨階級團隊") PLUS a dedicated §12.9 section (L2642-2646:
"每人先獨立產 idea，避免權威、聲量、性格主導") -- a substantive citation, not the thinnest possible
class. Grep-confirmed these are the only real hits (plus 4 corroborating mentions elsewhere in the
Atlas that merely name Brainwriting as a typical member of a recipe chain, never define new content)
before writing any of this method's own files -- zero pre-existing implementation.

**Real invariant #1 (GENUINE_COMPUTE contributor diversity)**: ``individual_contributions`` must carry
2 OR MORE DISTINCT ``contributor_id`` values -- Atlas's own "先各自寫" (write individually FIRST) /
"降低權威/外向者主導" (reduce authority/extrovert dominance) made real: a "brainwriting" session where
every contribution shares one ``contributor_id`` has not actually reduced single-voice dominance,
regardless of how many ideas it lists. Enforced at BOTH construction (``generate_brainwriting_session``
raises before any record is built) AND an independent gate
(``evaluate_brainwriting_integrity_gate``, re-derives from the record's OWN raw
``individual_contributions``, never trusts a stored flag).

**Real invariant #2 (GENUINE_COMPUTE referential integrity)**: every ``merged_ideas[].
source_contribution_refs`` entry must resolve to a real ``individual_contributions[].id`` in the SAME
record -- Atlas's own "再分享/合併" (then share/merge) made real as a same-record referential-integrity
check, generalized from ``ai_lego.modules.decomposition.objective_tree``'s own bijective-coverage
discipline into a LOOSER one-directional version: every ref must resolve, but (unlike objective_tree)
there is no requirement that every contribution be referenced, and the same contribution MAY be
referenced by more than one merged idea (a real brainwriting merge/affinity step routinely discards or
duplicates raw contributions -- see contract's own compilation_decisions).

No hard cross-method import exists: F03 has no other built member at this write (this is the first),
so there is nothing yet to import.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.brainwriting"
RECORD_ID_PREFIX = "BRAINWRITE-"

MIN_DISTINCT_CONTRIBUTORS = 2
# Atlas's own "先各自寫→再分享/合併" / "降低權威/外向者主導": a session that has not actually gathered
# input from 2+ distinct voices has not reduced anything -- see module docstring and contract's own
# compilation_decisions.

_CONTRIBUTION_KEYS = frozenset({"id", "contributor_id", "idea_text", "provenance"})
_MERGED_IDEA_KEYS = frozenset({"id", "source_contribution_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def individual_contribution(contribution_id: str, contributor_id: str, idea_text: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One entry of ``generate_brainwriting_session``'s own ``individual_contributions`` parameter.
    Convenience constructor, fails closed on malformed input. Does NOT itself check cross-item id
    uniqueness or the 2+-distinct-contributor invariant -- both need the full list, checked only by
    ``generate_brainwriting_session``/the gate."""
    if not _is_nonempty_str(contribution_id):
        raise InvariantViolation(f"BRAINWRITE_EMPTY_CONTRIBUTION_ID: id must be a non-empty string, got {contribution_id!r}")
    if not _is_nonempty_str(contributor_id):
        raise InvariantViolation(f"BRAINWRITE_EMPTY_CONTRIBUTOR_ID: contributor_id must be a non-empty string, got {contributor_id!r}")
    if not _is_nonempty_str(idea_text):
        raise InvariantViolation(f"BRAINWRITE_EMPTY_IDEA_TEXT: idea_text must be a non-empty string, got {idea_text!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BRAINWRITE_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")
    return {"id": contribution_id, "contributor_id": contributor_id, "idea_text": idea_text, "provenance": provenance}


def merged_idea(merged_idea_id: str, source_contribution_refs: list[str]) -> dict[str, Any]:
    """One entry of ``generate_brainwriting_session``'s own ``merged_ideas`` parameter. Convenience
    constructor only -- fails closed on malformed input, but does NOT itself check that
    ``source_contribution_refs`` entries resolve to real contributions: that needs the full
    ``individual_contributions`` list, checked only by ``generate_brainwriting_session``/the gate."""
    if not _is_nonempty_str(merged_idea_id):
        raise InvariantViolation(f"BRAINWRITE_EMPTY_MERGED_IDEA_ID: id must be a non-empty string, got {merged_idea_id!r}")
    if not isinstance(source_contribution_refs, list) or not source_contribution_refs or not all(_is_nonempty_str(ref) for ref in source_contribution_refs):
        raise InvariantViolation(f"BRAINWRITE_EMPTY_SOURCE_REFS: source_contribution_refs must be a non-empty list of non-empty strings, got {source_contribution_refs!r}")
    return {"id": merged_idea_id, "source_contribution_refs": list(source_contribution_refs)}


def _contribution_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _CONTRIBUTION_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("contributor_id")):
        return False
    if not _is_nonempty_str(entry.get("idea_text")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _merged_idea_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _MERGED_IDEA_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    refs = entry.get("source_contribution_refs")
    return isinstance(refs, list) and bool(refs) and all(_is_nonempty_str(ref) for ref in refs)


def _contribution_id_map(individual_contributions: Any) -> dict[str, dict[str, Any]]:
    """Validates ``individual_contributions`` is a real list of at least ``MIN_DISTINCT_CONTRIBUTORS``
    well-formed, UNIQUELY-id'd entries and returns its ``id -> entry`` map. Shared by the builder and
    the gate so neither can drift from the other. Raises with a specific code on every distinct
    failure mode. Does NOT itself check contributor diversity -- see ``_verify_contributor_diversity``."""
    if not isinstance(individual_contributions, list) or len(individual_contributions) < MIN_DISTINCT_CONTRIBUTORS:
        raise InvariantViolation(
            f"BRAINWRITE_INSUFFICIENT_CONTRIBUTIONS: individual_contributions must be a list of at least "
            f"{MIN_DISTINCT_CONTRIBUTORS} entries (Atlas's own '先各自寫' presumes real independent input to "
            f"reduce single-voice dominance), got {individual_contributions!r}"
        )
    if not all(_contribution_entry_is_valid(entry) for entry in individual_contributions):
        raise InvariantViolation(
            f"BRAINWRITE_INVALID_CONTRIBUTION: every entry must have exactly the keys {sorted(_CONTRIBUTION_KEYS)}, "
            f"non-empty id/contributor_id/idea_text, and schema-valid provenance, got {individual_contributions!r}"
        )
    mapping: dict[str, dict[str, Any]] = {}
    for entry in individual_contributions:
        if entry["id"] in mapping:
            raise InvariantViolation(f"BRAINWRITE_DUPLICATE_CONTRIBUTION_ID: individual_contributions id {entry['id']!r} appears more than once")
        mapping[entry["id"]] = entry
    return mapping


def _verify_contributor_diversity(individual_contributions: list[dict[str, Any]]) -> None:
    """Real invariant #1 core, shared by the builder and the gate. Raises with a specific code --
    never silently guesses. ``individual_contributions`` entries are assumed already shape-valid
    (called only after ``_contribution_entry_is_valid``-equivalent checks)."""
    distinct_contributors = {entry["contributor_id"] for entry in individual_contributions}
    if len(distinct_contributors) < MIN_DISTINCT_CONTRIBUTORS:
        raise InvariantViolation(
            f"BRAINWRITE_SINGLE_CONTRIBUTOR: individual_contributions carries only {len(distinct_contributors)} "
            f"distinct contributor_id value(s) ({sorted(distinct_contributors)}) -- Atlas's own '先各自寫' / "
            f"'降低權威/外向者主導' requires at least {MIN_DISTINCT_CONTRIBUTORS} distinct contributors; a "
            "session with a single voice has reduced nothing"
        )


def _verify_merge_referential_integrity(contribution_ids: set[str], merged_ideas: list[dict[str, Any]]) -> None:
    """Real invariant #2 core, shared by the builder and the gate. Raises with a specific code on
    every distinct failure mode -- never silently guesses. ``merged_ideas`` entries are assumed
    already shape-valid (called only after ``_merged_idea_entry_is_valid``-equivalent checks). NOT a
    bijection: does not require every contribution_id to be referenced, and does not forbid the same
    contribution_id being referenced by more than one merged idea (see module docstring)."""
    dangling: set[str] = set()
    for entry in merged_ideas:
        for ref in entry["source_contribution_refs"]:
            if ref not in contribution_ids:
                dangling.add(ref)
    if dangling:
        raise InvariantViolation(f"BRAINWRITE_DANGLING_SOURCE_REF: source_contribution_refs entry/entries {sorted(dangling)} do not resolve to any individual_contributions[].id")


def generate_brainwriting_session(
    session_id: str,
    individual_contributions: list[dict[str, Any]],
    merged_ideas: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/brainwriting-session.schema.yaml``. Enforces both real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in this
    package already establishes."""
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BRAINWRITE_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BRAINWRITE_INVALID_VERSION: version must be a string, got {version!r}")

    contribution_map = _contribution_id_map(individual_contributions)
    _verify_contributor_diversity(list(contribution_map.values()))

    if not isinstance(merged_ideas, list) or not merged_ideas:
        raise InvariantViolation(f"BRAINWRITE_EMPTY_MERGED_IDEAS: merged_ideas must be a non-empty list, got {merged_ideas!r}")
    if not all(_merged_idea_entry_is_valid(entry) for entry in merged_ideas):
        raise InvariantViolation(
            f"BRAINWRITE_INVALID_MERGED_IDEA: every entry must have exactly the keys {sorted(_MERGED_IDEA_KEYS)} with a non-empty "
            f"id and a non-empty source_contribution_refs list of non-empty strings, got {merged_ideas!r}"
        )
    seen_merged_ids: set[str] = set()
    for entry in merged_ideas:
        if entry["id"] in seen_merged_ids:
            raise InvariantViolation(f"BRAINWRITE_DUPLICATE_MERGED_IDEA_ID: merged_ideas id {entry['id']!r} appears more than once")
        seen_merged_ids.add(entry["id"])

    _verify_merge_referential_integrity(set(contribution_map.keys()), merged_ideas)

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "individual_contributions": [dict(entry) for entry in individual_contributions],
        "merged_ideas": [dict(entry) for entry in merged_ideas],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every individual_contributions[] entry
    carries a schema-valid provenance_record. Fails closed on non-dict input. No merged_ideas[]
    provenance to check -- see module docstring/contract's own compilation_decisions on why that
    field carries none."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    contributions = record.get("individual_contributions")
    contributions = contributions if isinstance(contributions, list) else []
    invalid = [c.get("id") for c in contributions if isinstance(c, dict) and not provenance_is_valid(c.get("provenance"))]
    passed = bool(contributions) and not invalid
    return _result("provenance_required", passed, [{"contributions_checked": len(contributions), "invalid_provenance_contributions": invalid}], validator, timestamp)


def evaluate_brainwriting_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_brainwriting_session``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been. Fails closed
    on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("brainwriting_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("brainwriting_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("brainwriting_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    try:
        contribution_map = _contribution_id_map(record.get("individual_contributions"))
    except InvariantViolation as error:
        return _result("brainwriting_integrity", False, [{"reason": str(error)}], validator, timestamp)

    try:
        _verify_contributor_diversity(list(contribution_map.values()))
    except InvariantViolation as error:
        return _result("brainwriting_integrity", False, [{"reason": str(error)}], validator, timestamp)

    merged_ideas = record.get("merged_ideas")
    if not isinstance(merged_ideas, list) or not merged_ideas:
        return _result("brainwriting_integrity", False, [{"reason": "BRAINWRITE_EMPTY_MERGED_IDEAS: merged_ideas missing, not a list, or empty"}], validator, timestamp)
    if not all(_merged_idea_entry_is_valid(entry) for entry in merged_ideas):
        return _result("brainwriting_integrity", False, [{"reason": "BRAINWRITE_INVALID_MERGED_IDEA: malformed entry"}], validator, timestamp)

    seen_merged_ids: set[str] = set()
    for entry in merged_ideas:
        if entry["id"] in seen_merged_ids:
            return _result("brainwriting_integrity", False, [{"reason": f"BRAINWRITE_DUPLICATE_MERGED_IDEA_ID: {entry['id']!r}"}], validator, timestamp)
        seen_merged_ids.add(entry["id"])

    try:
        _verify_merge_referential_integrity(set(contribution_map.keys()), merged_ideas)
    except InvariantViolation as error:
        return _result("brainwriting_integrity", False, [{"reason": str(error)}], validator, timestamp)

    return _result(
        "brainwriting_integrity",
        True,
        [{"contribution_count": len(contribution_map), "distinct_contributor_count": len({c["contributor_id"] for c in contribution_map.values()}), "merged_idea_count": len(merged_ideas)}],
        validator,
        timestamp,
    )


def evaluate_brainwriting_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property,
    then the independent structural-and-referential-integrity re-derivation. No
    ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see
    divergent.brainwriting.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit
    gates for what is actually declared true" discipline ``strategy.ansoff``'s own
    ``evaluate_ansoff_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_brainwriting_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
