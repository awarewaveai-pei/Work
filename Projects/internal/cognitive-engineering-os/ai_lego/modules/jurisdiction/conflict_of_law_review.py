"""``jurisdiction.conflict_of_law_review`` -- F23 jurisdiction/compliance/localization family (Atlas L944).

Atlas's own table row (L944, verbatim): "Conflict-of-Law Review | 多法律衝突
時決定適用與人工升級 | governing law->mandatory rules->conflicts->legal
review | 防自動化錯用法律" (when multiple laws conflict, decide which
applies and escalate to a human, via governing law -> mandatory rules ->
conflicts -> legal review; prevent automation from misapplying law).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``COL_DANGLING_LAW_REF``) -- every
   ``conflicts[].disputed_law_ids`` entry (>=2 required per conflict) must
   resolve to a declared ``governing_laws[]`` or ``mandatory_rules[]`` id,
   and those two id namespaces must not collide
   (``COL_DUPLICATE_LAW_OR_RULE_ID``).
2. **THE CORE FAIL-CLOSED INVARIANT, the strongest in this batch**
   (``COL_MISSING_LEGAL_REVIEW``) -- a conflict's ``applicable_law`` is
   NEVER finalized (non-null) unless that same conflict already carries a
   non-empty, well-formed ``legal_review`` record (reviewer/date/outcome).
   Atlas's own benefit column is literally "防自動化錯用法律" (prevent
   automation from misapplying law) -- an auto-resolved conflict with no
   human sign-off is exactly that failure, not an edge case to handle
   later. The builder REFUSES to construct such a record; it does not
   silently downgrade or warn.
3. **Applicable-law self-consistency** (``COL_INVALID_APPLICABLE_LAW``) --
   when non-null, ``applicable_law`` must itself be one of that same
   conflict's own ``disputed_law_ids``.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"conflict of law"/"conflict-of-law"/"conflict_of_law" before writing any of
this method's own files: found the pre-existing
``specs/jurisdiction/conflict-of-laws-output.schema.yaml`` ($id prefix
``COL-``) -- a DIFFERENT, software-architecture-layer object (the
Conflict-of-Laws Engine's output, GLOBAL_JURISDICTION_PLAN.md §5 / MP §98).
This method's own record id prefix is deliberately ``COLR-`` (Conflict-of-
Law Review), not ``COL-``, to avoid namespace collision -- see the
contract yaml's ``open_questions`` and the typed-object schema's
``compilation_decisions``.
"""

from __future__ import annotations

import copy
from datetime import date
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.conflict_of_law_review"
RECORD_ID_PREFIX = "COLR-"
_LAW_KEYS = frozenset({"law_id", "jurisdiction", "description"})
_RULE_KEYS = frozenset({"rule_id", "jurisdiction", "description"})
_CONFLICT_KEYS = frozenset({"conflict_id", "disputed_law_ids", "description", "legal_review", "applicable_law"})
_LEGAL_REVIEW_KEYS = frozenset({"reviewer", "date", "outcome"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _law_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped governing_laws[] entry"."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _LAW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _LAW_KEYS <= value.keys():
        return f"missing key(s) {sorted(_LAW_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("law_id")):
        return f"law_id must be a non-empty string, got {value.get('law_id')!r}"
    if not _is_nonempty_str(value.get("jurisdiction")):
        return f"jurisdiction must be a non-empty string, got {value.get('jurisdiction')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def governing_law(law_id: str, jurisdiction: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/conflict-of-law-review-record.schema.yaml#/properties/governing_laws``."""
    record = {"law_id": law_id, "jurisdiction": jurisdiction, "description": description}
    problem = _law_problem(record)
    if problem is not None:
        raise InvariantViolation(f"COL_INVALID_GOVERNING_LAW: {problem}")
    return record


def _rule_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped mandatory_rules[] entry"."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _RULE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _RULE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_RULE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("rule_id")):
        return f"rule_id must be a non-empty string, got {value.get('rule_id')!r}"
    if not _is_nonempty_str(value.get("jurisdiction")):
        return f"jurisdiction must be a non-empty string, got {value.get('jurisdiction')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def mandatory_rule(rule_id: str, jurisdiction: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/conflict-of-law-review-record.schema.yaml#/properties/mandatory_rules``."""
    record = {"rule_id": rule_id, "jurisdiction": jurisdiction, "description": description}
    problem = _rule_problem(record)
    if problem is not None:
        raise InvariantViolation(f"COL_INVALID_MANDATORY_RULE: {problem}")
    return record


def _legal_review_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, non-empty legal_review record". ``None`` (the
    Python value) is a legal INSTANCE of the nullable field itself and is checked separately by
    callers -- this predicate only judges a non-null candidate."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _LEGAL_REVIEW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _LEGAL_REVIEW_KEYS <= value.keys():
        return f"missing key(s) {sorted(_LEGAL_REVIEW_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("reviewer")):
        return f"reviewer must be a non-empty string, got {value.get('reviewer')!r}"
    if not _is_valid_iso_date(value.get("date")):
        return f"date must be a valid ISO-8601 date string, got {value.get('date')!r}"
    if not _is_nonempty_str(value.get("outcome")):
        return f"outcome must be a non-empty string, got {value.get('outcome')!r}"
    return None


def legal_review(reviewer: str, review_date: str, outcome: str) -> dict[str, Any]:
    """A well-formed, non-null ``legal_review`` record."""
    record = {"reviewer": reviewer, "date": review_date, "outcome": outcome}
    problem = _legal_review_problem(record)
    if problem is not None:
        raise InvariantViolation(f"COL_INVALID_LEGAL_REVIEW: {problem}")
    return record


def _conflict_shape_problem(value: Any) -> str | None:
    """Shape-only validation of a ``conflicts[]`` entry -- disputed_law_ids well-formed (>=2 non-empty,
    no duplicates), legal_review is either ``None`` or a well-formed record, applicable_law is either
    ``None`` or a non-empty string. Does NOT check referential integrity against governing_laws/
    mandatory_rules, applicable_law membership in disputed_law_ids, or the legal-review-before-
    finalization rule -- those cross-field checks happen once, in
    ``generate_conflict_of_law_review``/the gate, after every conflict has been shape-validated (same
    division of labor ``foresight.cross_impact_analysis``'s ``impact_pair()``/
    ``generate_cross_impact_analysis`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CONFLICT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _CONFLICT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_CONFLICT_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("conflict_id")):
        return f"conflict_id must be a non-empty string, got {value.get('conflict_id')!r}"
    disputed = value.get("disputed_law_ids")
    if not isinstance(disputed, list) or len(disputed) < 2 or not all(_is_nonempty_str(v) for v in disputed):
        return f"disputed_law_ids must be a list of >=2 non-empty strings, got {disputed!r}"
    if len(disputed) != len(set(disputed)):
        return f"disputed_law_ids must not contain duplicates, got {disputed!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    review = value.get("legal_review")
    if review is not None:
        review_problem = _legal_review_problem(review)
        if review_problem is not None:
            return f"legal_review: {review_problem}"
    applicable_law = value.get("applicable_law")
    if applicable_law is not None and not _is_nonempty_str(applicable_law):
        return f"applicable_law must be a non-empty string or null, got {applicable_law!r}"
    return None


def _conflict_cross_field_problem(value: dict[str, Any], valid_id_set: set[str]) -> str | None:
    """Cross-field checks for an already shape-valid conflict: referential integrity of
    disputed_law_ids against ``valid_id_set`` (the union of governing_laws/mandatory_rules ids), THE
    CORE fail-closed rule (applicable_law non-null requires legal_review non-null), and
    applicable_law's own membership in disputed_law_ids. Returns a single ``(code, message)`` tuple
    on the FIRST violation found, checked in this fixed order, or ``None`` if all pass."""
    dangling = sorted(set(value["disputed_law_ids"]) - valid_id_set)
    if dangling:
        return ("COL_DANGLING_LAW_REF", f"disputed_law_ids reference id(s) {dangling} not present in governing_laws[]/mandatory_rules[]")
    applicable_law = value.get("applicable_law")
    if applicable_law is not None:
        if applicable_law not in value["disputed_law_ids"]:
            return ("COL_INVALID_APPLICABLE_LAW", f"applicable_law {applicable_law!r} is not one of this conflict's own disputed_law_ids {value['disputed_law_ids']!r}")
        if value.get("legal_review") is None:
            return (
                "COL_MISSING_LEGAL_REVIEW",
                f"conflict {value['conflict_id']!r} has a finalized applicable_law ({applicable_law!r}) with no legal_review attached -- "
                "Atlas L944's own benefit '防自動化錯用法律' (prevent automation from misapplying law) forbids finalizing a conflict without human sign-off",
            )
    return None


def generate_conflict_of_law_review(
    record_id: str,
    governing_laws: list[dict[str, Any]],
    mandatory_rules: list[dict[str, Any]],
    conflicts: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/conflict-of-law-review-record.schema.yaml``.

    Rebuilds every ``governing_laws[]``/``mandatory_rules[]``/``conflicts[]`` entry via
    ``governing_law()``/``mandatory_rule()``/shape validation (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/
    version/provenance shape, >=1 governing law declared, id uniqueness across BOTH the
    governing_laws and mandatory_rules namespaces combined, every conflict's disputed_law_ids
    resolve to a real id with no dangling refs, applicable_law (when set) is one of its own
    conflict's disputed_law_ids -- and, the invariant Atlas's own "conflicts->legal review" pipeline
    stage exists to enforce, NO conflict is ever finalized with applicable_law set and legal_review
    absent -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"COL_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"COL_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("COL_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(governing_laws, list):
        raise InvariantViolation(f"COL_INVALID_GOVERNING_LAWS: governing_laws must be a list, got {type(governing_laws).__name__}")
    rebuilt_laws: list[dict[str, Any]] = []
    for i, law in enumerate(governing_laws):
        if not isinstance(law, dict):
            raise InvariantViolation(f"COL_INVALID_GOVERNING_LAWS: governing_laws[{i}] must be a dict, got {law!r}")
        rebuilt_laws.append(governing_law(law.get("law_id"), law.get("jurisdiction"), law.get("description")))
    law_ids = [law["law_id"] for law in rebuilt_laws]
    if len(rebuilt_laws) < 1:
        raise InvariantViolation("COL_TOO_FEW_GOVERNING_LAWS: at least 1 governing law is required")

    if not isinstance(mandatory_rules, list):
        raise InvariantViolation(f"COL_INVALID_MANDATORY_RULES: mandatory_rules must be a list, got {type(mandatory_rules).__name__}")
    rebuilt_rules: list[dict[str, Any]] = []
    for i, rule in enumerate(mandatory_rules):
        if not isinstance(rule, dict):
            raise InvariantViolation(f"COL_INVALID_MANDATORY_RULES: mandatory_rules[{i}] must be a dict, got {rule!r}")
        rebuilt_rules.append(mandatory_rule(rule.get("rule_id"), rule.get("jurisdiction"), rule.get("description")))
    rule_ids = [rule["rule_id"] for rule in rebuilt_rules]

    all_ids = law_ids + rule_ids
    if len(all_ids) != len(set(all_ids)):
        duplicate = sorted({i for i in all_ids if all_ids.count(i) > 1})
        raise InvariantViolation(f"COL_DUPLICATE_LAW_OR_RULE_ID: id(s) {duplicate} declared more than once across governing_laws[]/mandatory_rules[]")
    valid_id_set = set(all_ids)

    if not isinstance(conflicts, list):
        raise InvariantViolation(f"COL_INVALID_CONFLICTS: conflicts must be a list, got {type(conflicts).__name__}")
    rebuilt_conflicts: list[dict[str, Any]] = []
    for i, c in enumerate(conflicts):
        if not isinstance(c, dict):
            raise InvariantViolation(f"COL_INVALID_CONFLICTS: conflicts[{i}] must be a dict, got {c!r}")
        shape_problem = _conflict_shape_problem(c)
        if shape_problem is not None:
            raise InvariantViolation(f"COL_INVALID_CONFLICTS: conflicts[{i}]: {shape_problem}")
        rebuilt = {
            "conflict_id": c["conflict_id"],
            "disputed_law_ids": list(c["disputed_law_ids"]),
            "description": c["description"],
            "legal_review": copy.deepcopy(c["legal_review"]) if c["legal_review"] is not None else None,
            "applicable_law": c["applicable_law"],
        }
        cross_field_problem = _conflict_cross_field_problem(rebuilt, valid_id_set)
        if cross_field_problem is not None:
            code, message = cross_field_problem
            raise InvariantViolation(f"{code}: {message}")
        rebuilt_conflicts.append(rebuilt)

    conflict_ids = [c["conflict_id"] for c in rebuilt_conflicts]
    if len(conflict_ids) != len(set(conflict_ids)):
        duplicate = sorted({i for i in conflict_ids if conflict_ids.count(i) > 1})
        raise InvariantViolation(f"COL_DUPLICATE_CONFLICT_ID: conflict_id(s) {duplicate} declared more than once")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "governing_laws": rebuilt_laws,
        "mandatory_rules": rebuilt_rules,
        "conflicts": rebuilt_conflicts,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives governing_laws/mandatory_rules/conflicts shape, id-namespace uniqueness, and
    disputed_law_ids referential integrity directly from raw fields using the SAME
    ``_law_problem``/``_rule_problem``/``_conflict_shape_problem`` predicates the builder uses --
    without this the gate could pass records the builder refuses. Fails closed on malformed entries
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    governing_laws = record.get("governing_laws")
    valid_id_set: set[Any] = set()
    if isinstance(governing_laws, list):
        malformed_laws = [f"governing_laws[{i}]: {problem}" for i, problem in ((i, _law_problem(law)) for i, law in enumerate(governing_laws)) if problem]
        problems.extend(malformed_laws)
        well_shaped_laws = [law for law in governing_laws if _law_problem(law) is None]
        valid_id_set |= {law["law_id"] for law in well_shaped_laws}
        if not malformed_laws and len(well_shaped_laws) < 1:
            problems.append("fewer than 1 well-shaped governing law")
    else:
        problems.append("governing_laws must be a list")

    mandatory_rules = record.get("mandatory_rules")
    if isinstance(mandatory_rules, list):
        malformed_rules = [f"mandatory_rules[{i}]: {problem}" for i, problem in ((i, _rule_problem(rule)) for i, rule in enumerate(mandatory_rules)) if problem]
        problems.extend(malformed_rules)
        well_shaped_rules = [rule for rule in mandatory_rules if _rule_problem(rule) is None]
        rule_ids = {rule["rule_id"] for rule in well_shaped_rules}
        if valid_id_set & rule_ids:
            problems.append(f"id(s) shared across governing_laws[]/mandatory_rules[]: {sorted(valid_id_set & rule_ids)}")
        valid_id_set |= rule_ids
    else:
        problems.append("mandatory_rules must be a list")

    conflicts = record.get("conflicts")
    if isinstance(conflicts, list):
        for i, c in enumerate(conflicts):
            shape_problem = _conflict_shape_problem(c)
            if shape_problem is not None:
                problems.append(f"conflicts[{i}]: {shape_problem}")
                continue
            dangling = sorted(set(c["disputed_law_ids"]) - valid_id_set)
            if dangling:
                problems.append(f"conflicts[{i}]: dangling disputed_law_ids ref(s) {dangling}")
    else:
        problems.append("conflicts must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_legal_review_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L944's own core fail-closed rule directly from raw fields, WITHOUT trusting
    that the builder's own check already ran (catches hand-tampered records that bypass the
    builder): every conflict with a non-null applicable_law must carry a non-null, well-formed
    legal_review, and that applicable_law must be one of the conflict's own disputed_law_ids. Fails
    closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("legal_review_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    conflicts = record.get("conflicts")
    if not isinstance(conflicts, list):
        return _result("legal_review_required", False, [{"reason": "conflicts must be a list"}], validator, timestamp)

    problems: list[str] = []
    for i, c in enumerate(conflicts):
        shape_problem = _conflict_shape_problem(c)
        if shape_problem is not None:
            problems.append(f"conflicts[{i}]: {shape_problem}")
            continue
        applicable_law = c.get("applicable_law")
        if applicable_law is None:
            continue
        if applicable_law not in c["disputed_law_ids"]:
            problems.append(f"conflicts[{i}] ({c['conflict_id']!r}): applicable_law {applicable_law!r} not in disputed_law_ids {c['disputed_law_ids']!r}")
            continue
        review = c.get("legal_review")
        if review is None:
            problems.append(f"conflicts[{i}] ({c['conflict_id']!r}): applicable_law {applicable_law!r} finalized with no legal_review -- auto-resolution with no human sign-off")
            continue
        review_problem = _legal_review_problem(review)
        if review_problem is not None:
            problems.append(f"conflicts[{i}] ({c['conflict_id']!r}): legal_review malformed: {review_problem}")

    passed = not problems
    return _result("legal_review_required", passed, [{"problems": problems}], validator, timestamp)


def evaluate_conflict_of_law_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_legal_review_required_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
