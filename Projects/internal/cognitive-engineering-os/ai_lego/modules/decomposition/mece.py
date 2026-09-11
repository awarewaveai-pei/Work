"""``decomposition.mece`` -- F02 decomposition & structuring family, opening member (built in the same batch
as ``decomposition.issue_tree``, disjoint files, no shared state -- see that contract's own module for the
generative Issue Tree half of Atlas's own recommended pairing, F02 table L365 '最佳搭配: Issue Tree').

Atlas cites this method at the F02 table row (L365: "MECE｜檢查互斥且完整｜找 overlap / omission｜提高結構
完整度｜Issue Tree") PLUS a dedicated §12.7 section (L2622-2631) giving its full name, purpose, benefit, and
an explicit caution ("不是所有現實系統都能完美 MECE；不要為形式強切世界" -- not every real system can be
perfectly MECE, don't force-cut reality for form's sake). Unlike a generative decomposition method (Issue
Tree, Logic Tree), MECE's own citation IS a verification procedure ("檢查分類是否重疊或漏掉") -- this
module's output records the result of CHECKING an already-given ``universe_item_ids``/``categories``
classification, it does not invent one.

``overlaps``/``gaps``/``unknown_members``/``is_mece`` are GENUINE_COMPUTE (``ai_lego.compute.mece.check
.mece_check``, a real deterministic set-arithmetic function), the same "caller-supplied structural input +
GENUINE_COMPUTE derived classification" class ``database_data.normalization``'s own ``achieved_normal_form``/
violation lists already establish for a different family: the builder has no parameter for any of these four
fields at all (structural elimination, same discipline ``strategy.bcg_matrix``'s own ``quadrant`` and
``database_data.normalization``'s own ``achieved_normal_form`` already establish), and the independent gate
re-derives all four fresh from the record's own raw ``universe_item_ids``/``categories``, never trusting a
stored value.

Atlas's own explicit caution (L2629) is why ``is_mece: False`` is NOT refused at construction -- a record
whose classification genuinely fails the check is exactly what this method exists to surface. Only
structurally malformed input (empty universe, empty categories, malformed shapes, a duplicate category name)
is refused.

This module reuses ``ai_lego.modules.research.gates.evaluate_statistical_gate`` UNCHANGED for its
``genuine_compute`` gate, the same reuse ``root_cause.pareto``/``decision.ahp``/``decision.mcda``/
``decision.impact_effort``/``database_data.normalization`` (and others) already establish -- it only ever
inspects ``provenance``/``computation_provenance_ref``/``engine``, all of which MeceCheck also carries at the
top level.

Grepped the whole ``ai_lego`` tree case-insensitively for "mece" before writing any of this method's own
files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.mece.check import mece_check
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "decomposition.mece"
RECORD_ID_PREFIX = "MECE-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.mece.check.mece_check"

_CATEGORY_KEYS = frozenset({"category_name", "member_item_ids"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _unique_nonempty_str_list(value: Any) -> bool:
    """Shared predicate: a list of unique, non-empty strings (may itself be empty). Called by BOTH the
    builder and the gate for ``universe_item_ids`` (non-emptiness checked separately) and each category's
    own ``member_item_ids``."""
    if not isinstance(value, list) or not all(_is_nonempty_str(v) for v in value):
        return False
    return len(value) == len(set(value))


def _universe_is_valid(value: Any) -> bool:
    """Shared predicate: at least 1 entry, unique, non-empty strings. Called by BOTH the builder and the
    gate."""
    return isinstance(value, list) and bool(value) and _unique_nonempty_str_list(value)


def _category_shape_is_valid(category: Any) -> bool:
    """Shared predicate: exactly the two known keys, non-empty category_name, member_item_ids a list (may be
    empty) of unique non-empty strings. Called by BOTH the builder and the gate."""
    if not isinstance(category, dict) or set(category.keys()) != _CATEGORY_KEYS:
        return False
    if not _is_nonempty_str(category.get("category_name")):
        return False
    return _unique_nonempty_str_list(category.get("member_item_ids"))


def _categories_are_valid(categories: Any) -> bool:
    """Shared predicate: a non-empty list, every entry shape-valid, no two categories sharing the same
    category_name. Called by BOTH the builder and the gate."""
    if not isinstance(categories, list) or not categories:
        return False
    if not all(_category_shape_is_valid(c) for c in categories):
        return False
    names = [c["category_name"] for c in categories]
    return len(names) == len(set(names))


def category(category_name: str, member_item_ids: list[str]) -> dict[str, Any]:
    """One INPUT entry for ``generate_mece_check``'s own ``categories`` parameter. Convenience constructor
    only -- does NOT itself enforce cross-category invariants (uniqueness of ``category_name`` across the
    whole list is checked by ``generate_mece_check``, not here, same split ``portfolio_item``'s own docstring
    establishes for BCG)."""
    if not _is_nonempty_str(category_name):
        raise InvariantViolation(f"MECE_EMPTY_CATEGORY_NAME: category_name must be a non-empty string, got {category_name!r}")
    if not _unique_nonempty_str_list(member_item_ids):
        raise InvariantViolation(f"MECE_INVALID_MEMBER_ITEM_IDS: member_item_ids must be a list of unique, non-empty strings, got {member_item_ids!r}")
    return {"category_name": category_name, "member_item_ids": list(member_item_ids)}


def generate_mece_check(
    check_id: str,
    universe_item_ids: list[str],
    categories: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/mece-check.schema.yaml``.

    Enforces the method contract's own structural preconditions fail-closed: ``universe_item_ids`` a
    non-empty list of unique non-empty strings, ``categories`` a non-empty list of shape-valid entries with
    no two categories sharing a ``category_name``. ``overlaps``/``gaps``/``unknown_members``/``is_mece`` are
    NOT parameters -- always computed fresh via ``ai_lego.compute.mece.check.mece_check`` (see module
    docstring); there is no code path through which a caller could construct a record whose stored check
    result disagrees with its own ``universe_item_ids``/``categories``. Deliberately does NOT refuse a
    classification that fails the check (``is_mece: False`` is a legal outcome, Atlas §12.7's own caution --
    see module docstring); only structural malformation raises.
    """
    if not _is_nonempty_str(check_id) or not check_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MECE_INVALID_ID: check_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {check_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MECE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _universe_is_valid(universe_item_ids):
        raise InvariantViolation(f"MECE_INVALID_UNIVERSE: universe_item_ids must be a non-empty list of unique, non-empty strings, got {universe_item_ids!r}")
    if not _categories_are_valid(categories):
        raise InvariantViolation(
            f"MECE_INVALID_CATEGORIES: categories must be a non-empty list of {{category_name, member_item_ids}} entries, each category_name a non-empty "
            f"string unique across the list, each member_item_ids a list of unique non-empty strings, got {categories!r}"
        )

    rebuilt_categories = [{"category_name": c["category_name"], "member_item_ids": list(c["member_item_ids"])} for c in categories]
    computed = mece_check(list(universe_item_ids), rebuilt_categories)

    return {
        "id": check_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "universe_item_ids": list(universe_item_ids),
        "categories": rebuilt_categories,
        "overlaps": computed["overlaps"],
        "gaps": computed["gaps"],
        "unknown_members": computed["unknown_members"],
        "is_mece": computed["is_mece"],
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which MeceCheck also carries at the top level."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_mece_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields, AND RECOMPUTES
    ``mece_check`` fresh from the record's own raw ``universe_item_ids``/``categories``, comparing against
    the stored ``overlaps``/``gaps``/``unknown_members``/``is_mece``. Does not trust any stored value. FAILS
    CLOSED on malformed input rather than crashing -- does NOT call ``generate_mece_check``, so a
    hand-tampered record that bypassed the builder entirely is caught here exactly as a builder-refused one
    would have been."""
    if not isinstance(record, dict):
        return _result("mece_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("mece_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("mece_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    universe = record.get("universe_item_ids")
    if not _universe_is_valid(universe):
        return _result("mece_integrity", False, [{"reason": "universe_item_ids missing, not a list, empty, or containing a duplicate/non-string entry"}], validator, timestamp)

    categories = record.get("categories")
    if not _categories_are_valid(categories):
        return _result("mece_integrity", False, [{"reason": "categories missing, not a list, empty, malformed, or containing a duplicate category_name"}], validator, timestamp)

    recomputed = mece_check(universe, categories)
    stored = {
        "overlaps": record.get("overlaps"),
        "gaps": record.get("gaps"),
        "unknown_members": record.get("unknown_members"),
        "is_mece": record.get("is_mece"),
    }
    for key in ("overlaps", "gaps", "unknown_members", "is_mece"):
        if stored[key] != recomputed[key]:
            return _result(
                "mece_integrity",
                False,
                [{"reason": f"stored {key} disagrees with recomputation", "stored": stored[key], "recomputed": recomputed[key]}],
                validator,
                timestamp,
            )

    return _result(
        "mece_integrity",
        True,
        [{"universe_size": len(universe), "category_count": len(categories), "is_mece": recomputed["is_mece"]}],
        validator,
        timestamp,
    )


def evaluate_mece_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the one declared ``quality`` property, the
    reused genuine-compute check, then the independent structural-and-computation integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_mece_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
