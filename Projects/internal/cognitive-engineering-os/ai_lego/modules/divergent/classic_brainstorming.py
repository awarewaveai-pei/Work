"""``divergent.classic_brainstorming`` -- F03 divergent ideation family, opening member (1 of 10 agents opening
this family in one parallel batch, disjoint files, no shared state with any sibling ``divergent.*`` module).

Atlas cites this method ONCE: the F03 tool table row (L379: "Classic Brainstorming｜快速產生大量 ideas｜先禁止
批判→追數量→延伸→最後評估｜快速發散｜不要邊想邊否決"). Grep-confirmed the only real hit case-insensitively
across the whole Atlas file -- no dedicated section, same thin-citation class ``strategy.bcg_matrix``/
``decomposition.functional_decomposition`` already establish for this Wave.

The method's own literal procedure is ORDERED and separates generation from evaluation: "先禁止批判→追數量→
延伸→最後評估" (first forbid criticism -> chase quantity -> extend -> evaluate last), with an explicit caution
"不要邊想邊否決" (don't reject while generating). Two real invariants, BOTH re-derived independently at
construction time and at gate time (never trusting a stored flag):

1. **Idea id uniqueness** (``BRAINSTORM_DUPLICATE_IDEA_ID``): every ``ideas[]`` entry's ``id`` must be unique
   within the record -- a prerequisite for invariant #2 below to be unambiguous at all (same
   check-before-referential-integrity ordering ``decomposition.functional_decomposition``'s own whole-tree id
   uniqueness invariant already establishes for this Wave, generalized here from a recursive tree to a flat
   list).

2. **Idea referential integrity** (``BRAINSTORM_DANGLING_IDEA_REF``): every ``evaluations[].idea_ref`` must
   resolve to a real ``ideas[].id`` that actually exists in this same record -- directly grounded in Atlas's own
   literal ordering ("先...→最後評估", evaluation always refers back to something already generated): an
   evaluation naming an idea that was never generated is a real structural defect (a dangling reference), not a
   legal record. Same class ``decomposition.functional_decomposition``'s own
   ``FUNCDECOMP_DANGLING_INTERFACE_REF`` already establishes for ``interfaces`` referencing function nodes --
   reused here for ``evaluations`` referencing ideas, not imported (that module's ids are scattered across a
   recursive tree, this one's are a flat list, so the "collect every real id first" step differs even though the
   check-membership shape is the same idea).

Atlas's own caution ("不要邊想邊否決", don't reject while generating) is why ``ideas[]`` entries carry EXACTLY
``{id, text, provenance}`` -- no score/verdict/rank field exists anywhere in the input shape (structural
elimination via an exact key-set check, same discipline ``strategy.bcg_matrix``'s own ``quadrant`` and
``decomposition.mece``'s own ``overlaps``/``gaps``/``is_mece`` already establish for a different reason: here the
field is never accepted AT ALL, not merely computed instead of caller-supplied -- Atlas's own caution names a
GENERATION-time discipline, not a derived-value discipline). ``evaluations`` MAY be empty (Atlas's own ordering
places evaluation last and separate -- a session that has only generated ideas so far, with evaluation deferred
to a later pass, is a legal, incomplete-but-valid state, not a malformed one).

Both a per-idea ``provenance`` (this suite's task-mandated per-idea epistemic stamp) AND a separate record-level
``provenance`` (this corpus's 128/128 universal-field convention as of the F02 batch) are carried -- a genuinely
new combination in this corpus (prior sibling schemas carry one placement or the other, never both); see the
method contract's own ``compilation_decisions`` for why this departs from any single prior precedent rather than
silently narrowing to only one placement.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"classic_brainstorming"/"ClassicBrainstorming"/"BRAINSTORM" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.classic_brainstorming"
RECORD_ID_PREFIX = "BRAINSTORM-"

_IDEA_KEYS = frozenset({"id", "text", "provenance"})
_EVALUATION_KEYS = frozenset({"idea_ref", "verdict", "rationale"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- same discipline every prior module in this codebase
    (``functional_decomposition``/``fault_tree``/``attack_tree``) already establishes: never Python's own
    recursive ``repr()`` on a caller-supplied structure of unknown size/shape."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _idea_entry_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the 3 known keys, non-empty id/text, schema-valid provenance. Called by BOTH
    the builder and the gate. There is no separate "input shape" vs "stored shape" split here (unlike
    ``strategy.bcg_matrix``'s ``portfolio_item``, which omits a computed field on input) -- an idea entry never
    carries a computed field at all, so its input shape and its stored shape are identical."""
    if not isinstance(entry, dict) or set(entry.keys()) != _IDEA_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("text")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _evaluation_entry_is_valid(entry: Any) -> bool:
    """Per-field shape only -- does NOT check referential integrity (whether idea_ref actually resolves to a
    real idea id); that is invariant #2's own job, checked separately once the whole ideas[] list's real ids
    are known (see ``_dangling_idea_refs`` below)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _EVALUATION_KEYS:
        return False
    return (
        _is_nonempty_str(entry.get("idea_ref"))
        and _is_nonempty_str(entry.get("verdict"))
        and _is_nonempty_str(entry.get("rationale"))
    )


def _rebuild_idea(entry: dict[str, Any]) -> dict[str, Any]:
    """Fresh dict, never aliased to caller-supplied structure. Precondition: ``entry`` already passed
    ``_idea_entry_is_valid``. Same fix class ``decomposition.functional_decomposition``'s own
    ``_rebuild_node``/``_rebuild_interface`` already establish for this Wave: without a rebuild, a caller
    retaining a reference to its own input list/dicts could mutate an already-validated record in place with no
    error and no re-validation."""
    return {"id": entry["id"], "text": entry["text"], "provenance": entry["provenance"]}


def _rebuild_evaluation(entry: dict[str, Any]) -> dict[str, Any]:
    """Same aliasing fix, applied to one ``evaluations[]`` entry."""
    return {"idea_ref": entry["idea_ref"], "verdict": entry["verdict"], "rationale": entry["rationale"]}


def collect_idea_ids(ideas: list[dict[str, Any]]) -> list[str]:
    """Flat, in-order walk collecting every ``id`` in ``ideas`` (not recursive -- unlike
    ``decomposition.functional_decomposition``'s own tree-shaped ``collect_function_ids``, this family's own
    structure is already a flat list). PURE -- no validation performed here; callers must have already
    confirmed every entry is ``_idea_entry_is_valid`` before relying on this list for an integrity check (both
    call sites below do). The single shared source both invariant #1 (duplicate detection) and invariant #2
    (dangling-ref resolution) build on, so neither invariant can drift from a different notion of "every real
    idea id"."""
    return [entry["id"] for entry in ideas]


def _duplicate_values(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def _dangling_idea_refs(evaluations: list[dict[str, Any]], valid_ids: set[str]) -> list[dict[str, Any]]:
    dangling: list[dict[str, Any]] = []
    for entry in evaluations:
        if entry["idea_ref"] not in valid_ids:
            dangling.append({"idea_ref": entry["idea_ref"], "verdict": entry["verdict"]})
    return dangling


# --------------------------------------------------------------------------
# Convenience constructors -- eager, minimal validation, same discipline every prior module's own constructors
# use. NOT the invariant boundary: generate_classic_brainstorming_session validates whatever dicts it is handed
# regardless of how they were built (a raw hand-built dict is exercised the same way in the CLI slice/tests).
# --------------------------------------------------------------------------


def idea(idea_id: str, text: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One INPUT entry for ``generate_classic_brainstorming_session``'s own ``ideas`` parameter. Convenience
    constructor only -- emits ONLY ``{id, text, provenance}`` (deliberately NO score/verdict/rank parameter at
    all: see module docstring's "不要邊想邊否決" discipline); does NOT itself enforce cross-idea id uniqueness
    (``generate_classic_brainstorming_session`` validates the whole list, not one entry in isolation)."""
    if not _is_nonempty_str(idea_id):
        raise InvariantViolation(f"BRAINSTORM_EMPTY_IDEA_ID: id must be a non-empty string, got {idea_id!r}")
    if not _is_nonempty_str(text):
        raise InvariantViolation(f"BRAINSTORM_EMPTY_IDEA_TEXT: text must be a non-empty string, got {text!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BRAINSTORM_INVALID_IDEA_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    return {"id": idea_id, "text": text, "provenance": provenance}


def evaluation(idea_ref: str, verdict: str, rationale: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_classic_brainstorming_session``'s own ``evaluations`` parameter.
    Convenience constructor only -- does NOT itself check that ``idea_ref`` resolves to a real idea id (that
    requires knowing the whole ``ideas`` list, which this function is never handed);
    ``generate_classic_brainstorming_session`` performs that check once both are in hand."""
    if not _is_nonempty_str(idea_ref):
        raise InvariantViolation(f"BRAINSTORM_EMPTY_IDEA_REF: idea_ref must be a non-empty string, got {idea_ref!r}")
    if not _is_nonempty_str(verdict):
        raise InvariantViolation(f"BRAINSTORM_EMPTY_VERDICT: verdict must be a non-empty string, got {verdict!r}")
    if not _is_nonempty_str(rationale):
        raise InvariantViolation(f"BRAINSTORM_EMPTY_RATIONALE: rationale must be a non-empty string, got {rationale!r}")
    return {"idea_ref": idea_ref, "verdict": verdict, "rationale": rationale}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_classic_brainstorming_session(
    record_id: str,
    ideas: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    evaluations: list[dict[str, Any]] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/classic-brainstorming-session.schema.yaml``.

    Enforces BOTH real invariants fail-closed, in this order: id/version/record-level-provenance shape, ideas
    per-field shape (structurally excludes any score/verdict key), invariant #1 (idea id uniqueness -- computed
    from the ideas' own raw ids BEFORE any evaluation is even looked at), evaluations per-field shape, THEN
    invariant #2 (referential integrity -- walks the ideas' own real ids fresh, never trusts that invariant #1's
    own pass already proved anything about evaluations). A dangling reference is refused at construction time,
    never silently stored.
    """
    evaluations = evaluations if evaluations is not None else []

    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BRAINSTORM_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BRAINSTORM_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BRAINSTORM_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(ideas, list) or not ideas or not all(_idea_entry_is_valid(entry) for entry in ideas):
        raise InvariantViolation(
            f"BRAINSTORM_INVALID_IDEAS: ideas must be a non-empty list of entries with exactly the keys {sorted(_IDEA_KEYS)} "
            f"(no score/verdict field is ever accepted here -- see module docstring), non-empty id/text, and schema-valid "
            f"provenance; got {_shallow_describe(ideas)}"
        )

    all_ids = collect_idea_ids(ideas)
    duplicate_ids = _duplicate_values(all_ids)
    if duplicate_ids:
        raise InvariantViolation(f"BRAINSTORM_DUPLICATE_IDEA_ID: {duplicate_ids} appear more than once in ideas -- every idea id must be unique")

    if not isinstance(evaluations, list) or not all(_evaluation_entry_is_valid(entry) for entry in evaluations):
        raise InvariantViolation(
            f"BRAINSTORM_INVALID_EVALUATION: every evaluations[] entry must have exactly the keys {sorted(_EVALUATION_KEYS)}, "
            f"non-empty idea_ref/verdict/rationale; got {_shallow_describe(evaluations)}"
        )

    valid_ids = set(all_ids)
    dangling = _dangling_idea_refs(evaluations, valid_ids)
    if dangling:
        raise InvariantViolation(f"BRAINSTORM_DANGLING_IDEA_REF: {dangling} evaluation(s) reference an idea id not present anywhere in ideas")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "ideas": [_rebuild_idea(entry) for entry in ideas],
        "evaluations": [_rebuild_evaluation(entry) for entry in evaluations],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never call
# generate_classic_brainstorming_session -- a hand-tampered record that bypassed the builder entirely must be
# caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- BOTH the record's own top-level provenance AND every
    idea's own per-item provenance are schema-valid (see module docstring for why both placements coexist).
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    ideas = record.get("ideas")
    ideas = ideas if isinstance(ideas, list) else []
    invalid_idea_ids = [entry.get("id") for entry in ideas if isinstance(entry, dict) and not provenance_is_valid(entry.get("provenance"))]
    passed = record_provenance_valid and bool(ideas) and not invalid_idea_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "ideas_checked": len(ideas), "invalid_provenance_idea_ids": invalid_idea_ids}],
        validator,
        timestamp,
    )


def evaluate_idea_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently and fully: re-checks ``id``/``version`` plus a full
    ``_idea_entry_is_valid`` pass over the record's own stored ``ideas``, then re-derives idea id uniqueness
    from those same raw ids. Does NOT call ``generate_classic_brainstorming_session`` and does not trust any
    stored flag -- a hand-tampered record (e.g. a duplicate id spliced in after construction) is caught here
    exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("idea_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("idea_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("idea_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    ideas = record.get("ideas")
    if not isinstance(ideas, list) or not ideas or not all(_idea_entry_is_valid(entry) for entry in ideas):
        return _result("idea_integrity", False, [{"reason": "ideas missing, not a list, empty, or containing a malformed entry"}], validator, timestamp)

    all_ids = collect_idea_ids(ideas)
    duplicate_ids = _duplicate_values(all_ids)
    return _result("idea_integrity", not duplicate_ids, [{"duplicate_ids": duplicate_ids, "idea_count": len(all_ids)}], validator, timestamp)


def evaluate_idea_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, THE real differentiator, re-derived independently: re-walks the record's OWN raw ``ideas``
    to collect every real idea id (never trusts that ``evaluate_idea_integrity_gate`` already ran, or that the
    builder ever ran at all), then checks every ``evaluations[]`` entry's own ``idea_ref`` against that fresh
    set. Same class ``decomposition.functional_decomposition``'s own
    ``evaluate_interface_referential_integrity_gate`` already establishes for an analogous edge-referencing-node
    problem, generalized here from a recursive tree's own ids to a flat list's own ids. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("idea_referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    ideas = record.get("ideas")
    if not isinstance(ideas, list) or not ideas or not all(_idea_entry_is_valid(entry) for entry in ideas):
        return _result("idea_referential_integrity", False, [{"reason": "ideas invalid -- cannot evaluate idea references"}], validator, timestamp)

    evaluations = record.get("evaluations")
    if not isinstance(evaluations, list) or not all(_evaluation_entry_is_valid(entry) for entry in evaluations):
        return _result("idea_referential_integrity", False, [{"reason": "evaluations missing, not a list, or contains a malformed entry"}], validator, timestamp)

    valid_ids = set(collect_idea_ids(ideas))
    dangling = _dangling_idea_refs(evaluations, valid_ids)
    return _result("idea_referential_integrity", not dangling, [{"dangling_evaluations": dangling, "evaluation_count": len(evaluations)}], validator, timestamp)


def evaluate_classic_brainstorming_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of the contract's real gates, in catalog order: the one declared ``quality`` property, then both
    independent structural-integrity re-derivations. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false``, same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_idea_integrity_gate(record, validator, timestamp),
        evaluate_idea_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
