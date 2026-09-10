"""``framing.boundary_critique`` -- F01 framing family, 10th member built (of 11 total). ``framing
.how_might_we`` (9th, already landed in contract-backlog.yaml at this write time) and
``framing.frame_storming`` (11th, LAST -- its own module file exists on disk at this write time but had not
yet landed a contract-backlog.yaml registry entry) are built concurrently by
different agents in the same closing batch, neither read nor depended on here. Atlas F01 table row L344,
primary citation: "Boundary Critique｜檢查誰被納入/排除｜
政策、公共、高風險｜decision maker/affected/excluded/resources/values｜揭露權力與價值假設｜Stakeholder Map".
Corroborated by the F01 mermaid flowchart (L348-354: 模糊需求→5W1H→Problem Statement→Boundary Critique→
Success Criteria→Decision Question) and §13.7 Public Policy Recipe (L3378-3389: Policy Goal→Boundary
Critique→Stakeholder Map→...).

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"boundary_critique" and "boundary critique" -- zero pre-existing implementation (only this session's own
``framing/__init__.py`` docstring mention listing it as a remaining member, and an unrelated compiled
``.pyc`` binary match). Grepped the whole Atlas for "Boundary Critique" -- exactly the 3 citations above plus
a 4th hit (L343, Frame Storming's own ``recommended_next`` column naming this method) read and confirmed out
of this module's own scope.

**Real external methodology, disclosed for grounding only, not as the field-defining source:** Atlas's
5-term citation is a compressed rendering of Werner Ulrich's Critical Systems Heuristics (CSH) boundary
categories -- but CSH's actual framework uses 4 categories (sources of motivation/power/knowledge/
legitimacy) and 12 paired is/ought questions, not a flat 5-item checklist. ``CATEGORY_ORDER`` below is
Atlas's own literal "decision maker/affected/excluded/resources/values" order, transcribed verbatim -- same
"disclose the external methodology by name, but enforce Atlas's own literal citation" honesty pattern
``security.pasta`` already established for its own external-methodology citation.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this family already establishes:

1. ``categories`` is EXACTLY the five entries {DECISION_MAKER, AFFECTED, EXCLUDED, RESOURCES, VALUES}, one
   each, POSITIONALLY in that literal Atlas citation order; each entry's ``status``/``items``/
   ``empty_justification`` triple must be internally coherent (POPULATED needs >=1 well-formed item and
   forbids ``empty_justification``; DECLARED_EMPTY forbids any item and requires a non-empty
   ``empty_justification`` -- a silently-empty category would defeat Atlas's own benefit column, "揭露權力與
   價值假設", reveal power/value assumptions).
2. ``empty_categories`` must equal the actual set of DECLARED_EMPTY category names, in order -- re-derived
   by ``derive_empty_categories`` (kept inline here rather than a separate ``ai_lego/compute/`` submodule,
   this task's own explicit 5-file deliverable scope), never trusted from a stored or caller-supplied value.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.boundary_critique"
RECORD_ID_PREFIX = "BCRIT-"
PROBLEM_STATEMENT_REF_PREFIX = "PROB-"
CATEGORY_ORDER: tuple[str, ...] = ("DECISION_MAKER", "AFFECTED", "EXCLUDED", "RESOURCES", "VALUES")
# Atlas's own literal five-word F01 row (L344) citation order, transcribed verbatim -- same
# "positionally-ordered pipeline" invariant class framing.five_w_one_h's own DIMENSION_ORDER already
# establishes.

_STATUS_POPULATED = "POPULATED"
_STATUS_DECLARED_EMPTY = "DECLARED_EMPTY"
_VALID_STATUSES = frozenset({_STATUS_POPULATED, _STATUS_DECLARED_EMPTY})

_ITEM_REQUIRED_KEYS = frozenset({"name", "provenance"})
_ITEM_ALLOWED_KEYS = _ITEM_REQUIRED_KEYS | frozenset({"description", "supporting_evidence_refs"})
_CATEGORY_REQUIRED_KEYS = frozenset({"category", "status", "items"})
_CATEGORY_ALLOWED_KEYS = _CATEGORY_REQUIRED_KEYS | frozenset({"empty_justification"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _item_is_valid(item: Any) -> bool:
    """Shared predicate: well-shaped item (known keys only), non-empty name, description type-checked when
    present, supporting_evidence_refs shape-checked when present. Does NOT check provenance CONTENT validity
    -- that is the separate provenance_required gate's own concern, same split
    framing.five_w_one_h's own ``_dimensions_are_valid`` already establishes (construction checks structural
    coherence, the gate checks provenance validity)."""
    if not _shaped(item, _ITEM_REQUIRED_KEYS, _ITEM_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(item.get("name")):
        return False
    description = item.get("description")
    if description is not None and not _is_nonempty_str(description):
        return False
    if not _refs_shape_ok(item):
        return False
    return True


def _categories_are_valid(categories: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this family already establishes.

    Real invariant: exactly 5 entries, one per CATEGORY_ORDER value, POSITIONALLY in that literal order. Per
    entry: well-shaped (known keys only); status in {POPULATED, DECLARED_EMPTY}; POPULATED requires >=1
    well-formed item and FORBIDS empty_justification; DECLARED_EMPTY FORBIDS any item and REQUIRES a
    non-empty empty_justification (see module docstring).
    """
    if not isinstance(categories, list) or len(categories) != len(CATEGORY_ORDER):
        return False, "SHAPE"
    for position, expected_category in enumerate(CATEGORY_ORDER):
        entry = categories[position]
        if not _shaped(entry, _CATEGORY_REQUIRED_KEYS, _CATEGORY_ALLOWED_KEYS):
            return False, "SHAPE"
        if entry.get("category") != expected_category:
            return False, "SHAPE"
        status = entry.get("status")
        if status not in _VALID_STATUSES:
            return False, "INVALID_STATUS"
        items = entry.get("items")
        if not isinstance(items, list):
            return False, "SHAPE"
        if status == _STATUS_POPULATED:
            if not items:
                return False, "POPULATED_MISSING_ITEMS"
            if not all(_item_is_valid(i) for i in items):
                return False, "SHAPE"
            if "empty_justification" in entry:
                return False, "POPULATED_HAS_EMPTY_JUSTIFICATION"
        else:  # DECLARED_EMPTY
            if items:
                return False, "DECLARED_EMPTY_HAS_ITEMS"
            if not _is_nonempty_str(entry.get("empty_justification")):
                return False, "DECLARED_EMPTY_MISSING_JUSTIFICATION"
    return True, None


def derive_empty_categories(categories: list[dict[str, Any]]) -> list[str]:
    """GENUINE_COMPUTE -- given an already-shape-validated ``categories[]`` (see
    ``_categories_are_valid``), returns the category names whose ``status`` is ``"DECLARED_EMPTY"``, in the
    SAME order they appear (which, once shape validation has passed, IS ``CATEGORY_ORDER``). Pure and
    stateless -- does not itself validate shape, never mutates ``categories``. Mirrors
    ``ai_lego.compute.five_w1h.gap_detection.derive_information_gaps``'s own discipline, kept inline rather
    than a separate ``compute/`` submodule (see module docstring)."""
    return [entry["category"] for entry in categories if entry.get("status") == _STATUS_DECLARED_EMPTY]


def boundary_item(
    name: str,
    provenance: dict[str, Any],
    *,
    description: str | None = None,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One entry of ``typed-objects/boundary-critique-record.schema.yaml#/$defs/boundary_item``. A thin
    convenience constructor that emits ONLY the keys the caller actually passed -- it does NOT itself enforce
    any category-level coherence invariant (``generate_boundary_critique_record`` validates whatever it is
    handed regardless of how it was built), same "helper is not the invariant boundary" discipline
    ``framing.five_w_one_h``'s own ``dimension_entry`` docstring already establishes."""
    item: dict[str, Any] = {"name": name, "provenance": provenance}
    if description is not None:
        item["description"] = description
    if supporting_evidence_refs:
        item["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return item


def category_entry(
    category: str,
    status: str,
    items: list[dict[str, Any]],
    *,
    empty_justification: str | None = None,
) -> dict[str, Any]:
    """One entry of ``typed-objects/boundary-critique-record.schema.yaml#/properties/categories``. Same
    non-enforcing, thin-constructor discipline as ``boundary_item`` above."""
    entry: dict[str, Any] = {"category": category, "status": status, "items": list(items)}
    if empty_justification is not None:
        entry["empty_justification"] = empty_justification
    return entry


def generate_boundary_critique_record(
    record_id: str,
    decision_context: str,
    categories: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    problem_statement_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/boundary-critique-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before
    -construction" discipline every sibling module in this suite already establishes -- never a record that
    itself proves it was built illegally. ``empty_categories`` is NOT an accepted parameter: it is ALWAYS
    computed here via ``derive_empty_categories``, so there is no code path through which a caller could
    construct a record whose stored empty-categories set disagrees with the categories it was derived from.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BOUNDARYCRITIQUE_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BOUNDARYCRITIQUE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(decision_context):
        raise InvariantViolation(f"BOUNDARYCRITIQUE_EMPTY_DECISION_CONTEXT: decision_context must be a non-empty string, got {decision_context!r}")
    if problem_statement_ref is not None and (
        not _is_nonempty_str(problem_statement_ref) or not problem_statement_ref.startswith(PROBLEM_STATEMENT_REF_PREFIX)
    ):
        raise InvariantViolation(
            f"BOUNDARYCRITIQUE_INVALID_PROBLEM_STATEMENT_REF: problem_statement_ref, when present, must be a non-empty string "
            f"beginning with {PROBLEM_STATEMENT_REF_PREFIX!r}, got {problem_statement_ref!r}"
        )

    cats_ok, cats_reason = _categories_are_valid(categories)
    if not cats_ok:
        if cats_reason == "INVALID_STATUS":
            raise InvariantViolation(f"BOUNDARYCRITIQUE_INVALID_STATUS: every category's status must be one of {sorted(_VALID_STATUSES)}, got {categories!r}")
        if cats_reason == "POPULATED_MISSING_ITEMS":
            raise InvariantViolation(f"BOUNDARYCRITIQUE_POPULATED_MISSING_ITEMS: a POPULATED category must carry at least 1 well-formed item, got {categories!r}")
        if cats_reason == "POPULATED_HAS_EMPTY_JUSTIFICATION":
            raise InvariantViolation(f"BOUNDARYCRITIQUE_POPULATED_HAS_EMPTY_JUSTIFICATION: a POPULATED category must NOT carry empty_justification, got {categories!r}")
        if cats_reason == "DECLARED_EMPTY_HAS_ITEMS":
            raise InvariantViolation(
                f"BOUNDARYCRITIQUE_DECLARED_EMPTY_HAS_ITEMS: a DECLARED_EMPTY category must carry zero items -- "
                f"an item under a category declared empty is internally incoherent, got {categories!r}"
            )
        if cats_reason == "DECLARED_EMPTY_MISSING_JUSTIFICATION":
            raise InvariantViolation(
                f"BOUNDARYCRITIQUE_DECLARED_EMPTY_MISSING_JUSTIFICATION: a DECLARED_EMPTY category must carry a non-empty empty_justification -- "
                f"a silently empty category would defeat Atlas's own benefit '揭露權力與價值假設', got {categories!r}"
            )
        raise InvariantViolation(
            f"BOUNDARYCRITIQUE_INVALID_CATEGORY_SET: categories must be EXACTLY the five entries {CATEGORY_ORDER} in that literal order, well-shaped, got {categories!r}"
        )

    empty_categories = derive_empty_categories(categories)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_context": decision_context,
        "categories": [dict(c) for c in categories],
        "empty_categories": empty_categories,
        "provenance": provenance,
    }
    if problem_statement_ref is not None:
        record["problem_statement_ref"] = problem_statement_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every item AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    categories = record.get("categories")
    categories = categories if isinstance(categories, list) else []
    invalid: list[dict[str, Any]] = []
    items_checked = 0
    for c in categories:
        if not isinstance(c, dict):
            continue
        for item in c.get("items") or []:
            if not isinstance(item, dict):
                continue
            items_checked += 1
            if not provenance_is_valid(item.get("provenance")):
                invalid.append({"category": c.get("category"), "item": item.get("name")})
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(categories) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"items_checked": items_checked, "invalid_provenance_items": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``framing.five_w_one_h`` already uses: an EVIDENCE-labeled item must actually cite
    supporting_evidence_refs. Only meaningful for items inside POPULATED categories (a DECLARED_EMPTY
    category has no items to label evidence for)."""
    categories = record.get("categories") if isinstance(record, dict) else None
    categories = categories if isinstance(categories, list) else []
    problems: list[dict[str, Any]] = []
    checked = 0
    for c in categories:
        if not isinstance(c, dict) or c.get("status") != _STATUS_POPULATED:
            continue
        for item in c.get("items") or []:
            if not isinstance(item, dict):
                continue
            checked += 1
            epistemic_type = (item.get("provenance") or {}).get("epistemic_type")
            if epistemic_type is None:
                problems.append({"category": c.get("category"), "item": item.get("name"), "reason": "no epistemic_type label"})
                continue
            if epistemic_type == "EVIDENCE" and not item.get("supporting_evidence_refs"):
                problems.append({"category": c.get("category"), "item": item.get("name"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(categories) and not problems
    return _result("evidence_labeling_required", passed, [{"items_checked": checked, "problems": problems}], validator, timestamp)


def evaluate_boundary_critique_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_boundary_critique_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. In particular, this is
    the ONLY place ``empty_categories`` is checked against reality: re-derives it via
    ``derive_empty_categories`` and compares to the stored value. FAILS CLOSED on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("boundary_critique_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("boundary_critique_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("boundary_critique_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("decision_context")):
        return _result("boundary_critique_integrity", False, [{"reason": "decision_context missing or empty"}], validator, timestamp)
    ref = record.get("problem_statement_ref")
    if ref is not None and (not _is_nonempty_str(ref) or not ref.startswith(PROBLEM_STATEMENT_REF_PREFIX)):
        return _result(
            "boundary_critique_integrity",
            False,
            [{"reason": f"problem_statement_ref present but not a non-empty string prefixed {PROBLEM_STATEMENT_REF_PREFIX!r}"}],
            validator,
            timestamp,
        )

    cats_ok, cats_reason = _categories_are_valid(record.get("categories"))
    if not cats_ok:
        return _result(
            "boundary_critique_integrity",
            False,
            [{"reason": f"categories invalid ({cats_reason}) -- must be exactly {CATEGORY_ORDER} in that literal order, status/items/empty_justification internally coherent"}],
            validator,
            timestamp,
        )

    categories = record["categories"]
    recomputed_empty = derive_empty_categories(categories)
    stored_empty = record.get("empty_categories")
    if not isinstance(stored_empty, list) or stored_empty != recomputed_empty:
        return _result(
            "boundary_critique_integrity",
            False,
            [{"reason": "BOUNDARYCRITIQUE_EMPTY_CATEGORIES_MISMATCH", "stored": stored_empty, "recomputed": recomputed_empty}],
            validator,
            timestamp,
        )

    return _result(
        "boundary_critique_integrity",
        True,
        [{"category_count": len(categories), "empty_category_count": len(recomputed_empty), "empty_categories": recomputed_empty}],
        validator,
        timestamp,
    )


def evaluate_boundary_critique_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties,
    then the independent structural-integrity re-derivation (which also re-derives empty_categories)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_boundary_critique_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
