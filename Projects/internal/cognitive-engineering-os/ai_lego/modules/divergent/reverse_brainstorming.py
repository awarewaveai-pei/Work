"""``divergent.reverse_brainstorming`` -- divergent ideation family, added 2026-09-18 per direct
operator request after comparing this system's method catalog against MindManager's template
gallery (its "Reverse Brainstorming" template has no counterpart here). NOT Atlas-cited (grep-
confirmed: zero "reverse brainstorm"/"反向腦力" hits anywhere in
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md) -- external grounding instead: a
well-documented creativity technique (inversion/"prospective hindsight" family of methods) --
instead of asking "how do we solve X", ask "how could we CAUSE or WORSEN X", then invert each
answer into a genuine candidate solution. Surfaces failure mechanisms a direct "how do we fix
this" framing tends to route around.

Due-diligence comparison against ``divergent.classic_brainstorming`` (read in full first): same
family, same flat-list-plus-referential-integrity shape (a list of generated items, a second list
of entries that each reference back to one), but a distinct operation -- classic_brainstorming's
``evaluations`` judge an idea that was already a candidate SOLUTION; here, ``worsening_ideas`` are
never solutions at all (they describe ways to make the problem WORSE), and ``inversions`` is the
one and only mechanism that turns one into a genuine solution candidate, by inverting it. No
score/verdict field on a worsening idea, same "don't reject while generating" discipline
classic_brainstorming's own ``idea()`` establishes -- judging comes later, and here it comes via
inversion, not a verdict.

Two invariants, both re-derived independently at construction and gate time (never trusting a
stored flag), same class classic_brainstorming's own two invariants establish for this shape:

1. **Worsening-idea id uniqueness** (``REVERSEBRAINSTORM_DUPLICATE_IDEA_ID``).
2. **Inversion referential integrity** (``REVERSEBRAINSTORM_DANGLING_IDEA_REF``): every
   ``inversions[].worsening_idea_ref`` must resolve to a real ``worsening_ideas[].id``.

No genuine-compute gate: this is qualitative ideation, not deterministic compute (same class
classic_brainstorming already establishes -- neither module reuses
``ai_lego.modules.research.gates.evaluate_statistical_gate``, avoiding the provenance-default
mismatch bug found elsewhere in this codebase 2026-09-18 for the genuinely-computed quadrant
methods).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.reverse_brainstorming"
RECORD_ID_PREFIX = "REVERSEBRAINSTORM-"

_WORSENING_IDEA_KEYS = frozenset({"id", "text", "provenance"})
_INVERSION_KEYS = frozenset({"worsening_idea_ref", "inverted_solution", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _worsening_idea_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _WORSENING_IDEA_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("text")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _inversion_is_valid(entry: Any) -> bool:
    """Per-field shape only -- does NOT check referential integrity; that is the second
    invariant's own job, checked once the whole worsening_ideas[] list's real ids are known."""
    if not isinstance(entry, dict) or set(entry.keys()) != _INVERSION_KEYS:
        return False
    if not _is_nonempty_str(entry.get("worsening_idea_ref")) or not _is_nonempty_str(entry.get("inverted_solution")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _rebuild_worsening_idea(entry: dict[str, Any]) -> dict[str, Any]:
    return {"id": entry["id"], "text": entry["text"], "provenance": entry["provenance"]}


def _rebuild_inversion(entry: dict[str, Any]) -> dict[str, Any]:
    return {"worsening_idea_ref": entry["worsening_idea_ref"], "inverted_solution": entry["inverted_solution"], "provenance": entry["provenance"]}


def collect_worsening_idea_ids(worsening_ideas: list[dict[str, Any]]) -> list[str]:
    return [entry["id"] for entry in worsening_ideas]


def _duplicate_values(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def _dangling_inversion_refs(inversions: list[dict[str, Any]], valid_ids: set[str]) -> list[dict[str, Any]]:
    return [{"worsening_idea_ref": entry["worsening_idea_ref"]} for entry in inversions if entry["worsening_idea_ref"] not in valid_ids]


def worsening_idea(idea_id: str, text: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """Convenience constructor for one ``worsening_ideas`` INPUT entry. Does not itself enforce
    cross-idea id uniqueness -- ``generate_reverse_brainstorming_session`` validates the whole list."""
    if not _is_nonempty_str(idea_id):
        raise InvariantViolation(f"REVERSEBRAINSTORM_EMPTY_IDEA_ID: id must be a non-empty string, got {idea_id!r}")
    if not _is_nonempty_str(text):
        raise InvariantViolation(f"REVERSEBRAINSTORM_EMPTY_IDEA_TEXT: text must be a non-empty string, got {text!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"REVERSEBRAINSTORM_INVALID_IDEA_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    return {"id": idea_id, "text": text, "provenance": provenance}


def inversion(worsening_idea_ref: str, inverted_solution: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """Convenience constructor for one ``inversions`` INPUT entry. Does not itself check that
    ``worsening_idea_ref`` resolves to a real id -- that requires the whole ``worsening_ideas``
    list, which this function is never handed."""
    if not _is_nonempty_str(worsening_idea_ref):
        raise InvariantViolation(f"REVERSEBRAINSTORM_EMPTY_IDEA_REF: worsening_idea_ref must be a non-empty string, got {worsening_idea_ref!r}")
    if not _is_nonempty_str(inverted_solution):
        raise InvariantViolation(f"REVERSEBRAINSTORM_EMPTY_INVERTED_SOLUTION: inverted_solution must be a non-empty string, got {inverted_solution!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"REVERSEBRAINSTORM_INVALID_INVERSION_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    return {"worsening_idea_ref": worsening_idea_ref, "inverted_solution": inverted_solution, "provenance": provenance}


def generate_reverse_brainstorming_session(
    record_id: str,
    problem_statement: str,
    worsening_ideas: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    inversions: list[dict[str, Any]] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Enforces both invariants fail-closed, in this order: id/version/problem_statement/
    record-level-provenance shape, worsening_ideas per-field shape, invariant #1 (id uniqueness),
    inversions per-field shape, THEN invariant #2 (referential integrity). ``inversions`` MAY be
    empty -- a session that has only generated worsening ideas so far, inversion deferred to a
    later pass, is a legal, incomplete-but-valid state."""
    inversions = inversions if inversions is not None else []

    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"REVERSEBRAINSTORM_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(problem_statement):
        raise InvariantViolation(f"REVERSEBRAINSTORM_EMPTY_PROBLEM_STATEMENT: problem_statement must be a non-empty string, got {problem_statement!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"REVERSEBRAINSTORM_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"REVERSEBRAINSTORM_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(worsening_ideas, list) or not worsening_ideas or not all(_worsening_idea_is_valid(entry) for entry in worsening_ideas):
        raise InvariantViolation(
            f"REVERSEBRAINSTORM_INVALID_IDEAS: worsening_ideas must be a non-empty list of entries with exactly the keys {sorted(_WORSENING_IDEA_KEYS)}, "
            f"non-empty id/text, and schema-valid provenance; got {_shallow_describe(worsening_ideas)}"
        )

    all_ids = collect_worsening_idea_ids(worsening_ideas)
    duplicate_ids = _duplicate_values(all_ids)
    if duplicate_ids:
        raise InvariantViolation(f"REVERSEBRAINSTORM_DUPLICATE_IDEA_ID: {duplicate_ids} appear more than once in worsening_ideas -- every id must be unique")

    if not isinstance(inversions, list) or not all(_inversion_is_valid(entry) for entry in inversions):
        raise InvariantViolation(
            f"REVERSEBRAINSTORM_INVALID_INVERSION: every inversions[] entry must have exactly the keys {sorted(_INVERSION_KEYS)}, "
            f"non-empty worsening_idea_ref/inverted_solution, and schema-valid provenance; got {_shallow_describe(inversions)}"
        )

    valid_ids = set(all_ids)
    dangling = _dangling_inversion_refs(inversions, valid_ids)
    if dangling:
        raise InvariantViolation(f"REVERSEBRAINSTORM_DANGLING_IDEA_REF: {dangling} inversion(s) reference a worsening_idea id not present anywhere in worsening_ideas")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "problem_statement": problem_statement,
        "worsening_ideas": [_rebuild_worsening_idea(entry) for entry in worsening_ideas],
        "inversions": [_rebuild_inversion(entry) for entry in inversions],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- BOTH the record's own top-level
    provenance AND every worsening idea's own per-item provenance are schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    worsening_ideas = record.get("worsening_ideas")
    worsening_ideas = worsening_ideas if isinstance(worsening_ideas, list) else []
    invalid_idea_ids = [entry.get("id") for entry in worsening_ideas if isinstance(entry, dict) and not provenance_is_valid(entry.get("provenance"))]
    passed = record_provenance_valid and bool(worsening_ideas) and not invalid_idea_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "ideas_checked": len(worsening_ideas), "invalid_provenance_idea_ids": invalid_idea_ids}],
        validator,
        timestamp,
    )


def evaluate_idea_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently: re-checks id/version plus a full
    ``_worsening_idea_is_valid`` pass over the record's own stored ``worsening_ideas``, then
    re-derives id uniqueness from those same raw ids. FAILS CLOSED on malformed input."""
    if not isinstance(record, dict):
        return _result("idea_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("idea_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("idea_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    worsening_ideas = record.get("worsening_ideas")
    if not isinstance(worsening_ideas, list) or not worsening_ideas or not all(_worsening_idea_is_valid(entry) for entry in worsening_ideas):
        return _result("idea_integrity", False, [{"reason": "worsening_ideas missing, not a list, empty, or containing a malformed entry"}], validator, timestamp)

    all_ids = collect_worsening_idea_ids(worsening_ideas)
    duplicate_ids = _duplicate_values(all_ids)
    return _result("idea_integrity", not duplicate_ids, [{"duplicate_ids": duplicate_ids, "idea_count": len(all_ids)}], validator, timestamp)


def evaluate_idea_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: re-walks the record's OWN raw worsening_ideas to
    collect every real id (never trusts evaluate_idea_integrity_gate already ran), then checks
    every inversions[] entry's own worsening_idea_ref against that fresh set."""
    if not isinstance(record, dict):
        return _result("idea_referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    worsening_ideas = record.get("worsening_ideas")
    if not isinstance(worsening_ideas, list) or not worsening_ideas or not all(_worsening_idea_is_valid(entry) for entry in worsening_ideas):
        return _result("idea_referential_integrity", False, [{"reason": "worsening_ideas invalid -- cannot evaluate idea references"}], validator, timestamp)

    inversions = record.get("inversions")
    if not isinstance(inversions, list) or not all(_inversion_is_valid(entry) for entry in inversions):
        return _result("idea_referential_integrity", False, [{"reason": "inversions missing, not a list, or contains a malformed entry"}], validator, timestamp)

    valid_ids = set(collect_worsening_idea_ids(worsening_ideas))
    dangling = _dangling_inversion_refs(inversions, valid_ids)
    return _result("idea_referential_integrity", not dangling, [{"dangling_inversions": dangling, "inversion_count": len(inversions)}], validator, timestamp)


def evaluate_reverse_brainstorming_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_idea_integrity_gate(record, validator, timestamp),
        evaluate_idea_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
