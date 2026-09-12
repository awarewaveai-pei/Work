"""``delivery.outcome_roadmap`` -- F22 PM/Delivery/Governance Pack (Atlas L914-928), 2nd opening member.

Atlas's own table row (L925, verbatim): "Outcome Roadmap | 以 outcomes 而非
feature 排 roadmap | themes→outcomes→bets→evidence→review | 保持策略彈性"
(structure a roadmap around outcomes rather than features, via
themes/outcomes/bets/evidence/review, to keep strategic flexibility).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"outcome roadmap"/"outcome_roadmap" and "delivery." before writing any of
this method's own files: zero pre-existing implementation or namespace
overlap.

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes (mirrors
``foresight.cross_impact_analysis``'s own referential-integrity gate class):

1. **Theme coverage** (``OROAD_DANGLING_THEME_REF``, plus
   ``OROAD_TOO_FEW_THEMES`` / ``OROAD_TOO_FEW_OUTCOMES`` /
   ``OROAD_DUPLICATE_THEME_ID`` / ``OROAD_DUPLICATE_OUTCOME_ID``) -- every
   declared ``outcomes[].theme_id`` must resolve to a declared ``themes[]``
   entry. An outcome with no real theme parent is a floating goal with no
   strategic anchor.
2. **Bet traceability, THE real invariant this method exists to enforce**
   (``OROAD_DANGLING_OUTCOME_REF``, plus ``OROAD_DUPLICATE_BET_ID``) --
   every declared ``bets[].outcome_id`` must resolve to a declared
   ``outcomes[]`` entry. Atlas's own benefit column names "保持策略彈性"
   (keep strategic flexibility) -- a bet with no real outcome parent IS
   exactly the feature-driven roadmap entry this method's own "以 outcomes
   而非 feature" pipeline order exists to prevent from sneaking in under a
   different label.

Disclosed divergence from every list-bearing sibling module: ``bets`` may
legally be an EMPTY list (a roadmap may declare outcomes with no committed
bets yet -- the more strategically flexible state, not a malformed one), and
each bet's own ``evidence`` may also legally be empty (an early-stage bet may
have no gathered evidence yet). ``themes``/``outcomes`` both require >= 1
entry -- a roadmap with zero themes or zero outcomes has not actually
"排 roadmap" (structured a roadmap) around anything.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.outcome_roadmap"
RECORD_ID_PREFIX = "OROAD-"
_THEME_KEYS = frozenset({"theme_id", "name"})
_OUTCOME_KEYS = frozenset({"outcome_id", "theme_id", "description"})
_BET_KEYS = frozenset({"bet_id", "outcome_id", "description", "evidence"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_str_list(value: Any) -> bool:
    """Legally empty -- see module docstring's disclosed divergence."""
    return isinstance(value, list) and all(_is_nonempty_str(item) for item in value)


def _theme_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped themes[] entry". Both ``theme()`` (construction
    layer) and the gate (independent re-derivation layer) consult it."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _THEME_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _THEME_KEYS <= value.keys():
        return f"missing key(s) {sorted(_THEME_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("theme_id")):
        return f"theme_id must be a non-empty string, got {value.get('theme_id')!r}"
    if not _is_nonempty_str(value.get("name")):
        return f"name must be a non-empty string, got {value.get('name')!r}"
    return None


def theme(theme_id: str, name: str) -> dict[str, Any]:
    """One item of ``typed-objects/outcome-roadmap-record.schema.yaml#/properties/themes``."""
    record = {"theme_id": theme_id, "name": name}
    problem = _theme_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OROAD_INVALID_THEME: {problem}")
    return record


def _outcome_problem(value: Any) -> str | None:
    """Shape/non-empty checks only, NOT referential integrity against ``themes[]``, which needs the sibling
    array and is checked once in ``generate_outcome_roadmap``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``_pair_problem``/``generate_cross_impact_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _OUTCOME_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _OUTCOME_KEYS <= value.keys():
        return f"missing key(s) {sorted(_OUTCOME_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("outcome_id")):
        return f"outcome_id must be a non-empty string, got {value.get('outcome_id')!r}"
    if not _is_nonempty_str(value.get("theme_id")):
        return f"theme_id must be a non-empty string, got {value.get('theme_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def outcome(outcome_id: str, theme_id: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/outcome-roadmap-record.schema.yaml#/properties/outcomes``. Does NOT
    itself check referential integrity against a declared ``themes[]`` list -- that cross-field check
    happens once, in ``generate_outcome_roadmap``, after every outcome has been rebuilt."""
    record = {"outcome_id": outcome_id, "theme_id": theme_id, "description": description}
    problem = _outcome_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OROAD_INVALID_OUTCOME: {problem}")
    return record


def _bet_problem(value: Any) -> str | None:
    """Shape/non-empty checks only, NOT referential integrity against ``outcomes[]`` (same division of
    labor as ``_outcome_problem`` above)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _BET_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _BET_KEYS <= value.keys():
        return f"missing key(s) {sorted(_BET_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("bet_id")):
        return f"bet_id must be a non-empty string, got {value.get('bet_id')!r}"
    if not _is_nonempty_str(value.get("outcome_id")):
        return f"outcome_id must be a non-empty string, got {value.get('outcome_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not _is_str_list(value.get("evidence")):
        return f"evidence must be a list of non-empty strings (may be empty), got {value.get('evidence')!r}"
    return None


def bet(bet_id: str, outcome_id: str, description: str, evidence: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/outcome-roadmap-record.schema.yaml#/properties/bets``. Does NOT itself
    check referential integrity against a declared ``outcomes[]`` list -- that cross-field check happens
    once, in ``generate_outcome_roadmap``, after every bet has been rebuilt."""
    record = {"bet_id": bet_id, "outcome_id": outcome_id, "description": description, "evidence": list(evidence) if evidence is not None else []}
    problem = _bet_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OROAD_INVALID_BET: {problem}")
    return record


def generate_outcome_roadmap(
    record_id: str,
    themes: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    bets: list[dict[str, Any]],
    next_review: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/outcome-roadmap-record.schema.yaml``.

    Rebuilds every ``themes[]``/``outcomes[]``/``bets[]`` entry via ``theme()``/``outcome()``/``bet()``
    (never trusting the caller's raw dicts), then enforces the method contract's own real invariants
    fail-closed, in order: id/version/provenance shape, >=1 distinct theme, >=1 distinct outcome with every
    outcome.theme_id resolving to a declared theme, every bet.bet_id distinct with every bet.outcome_id
    resolving to a declared outcome -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OROAD_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OROAD_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("OROAD_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(next_review):
        raise InvariantViolation(f"OROAD_EMPTY_NEXT_REVIEW: next_review must be a non-empty string, got {next_review!r}")

    if not isinstance(themes, list):
        raise InvariantViolation(f"OROAD_INVALID_THEMES: themes must be a list, got {type(themes).__name__}")
    rebuilt_themes: list[dict[str, Any]] = []
    for i, t in enumerate(themes):
        if not isinstance(t, dict):
            raise InvariantViolation(f"OROAD_INVALID_THEMES: themes[{i}] must be a dict, got {t!r}")
        rebuilt_themes.append(theme(t.get("theme_id"), t.get("name")))
    theme_ids = [t["theme_id"] for t in rebuilt_themes]
    if len(theme_ids) != len(set(theme_ids)):
        duplicate = sorted({t for t in theme_ids if theme_ids.count(t) > 1})
        raise InvariantViolation(f"OROAD_DUPLICATE_THEME_ID: theme_id(s) {duplicate} declared more than once")
    if len(rebuilt_themes) < 1:
        raise InvariantViolation("OROAD_TOO_FEW_THEMES: at least 1 theme is required -- a roadmap with zero themes has not actually structured anything")

    if not isinstance(outcomes, list):
        raise InvariantViolation(f"OROAD_INVALID_OUTCOMES: outcomes must be a list, got {type(outcomes).__name__}")
    rebuilt_outcomes: list[dict[str, Any]] = []
    for i, o in enumerate(outcomes):
        if not isinstance(o, dict):
            raise InvariantViolation(f"OROAD_INVALID_OUTCOMES: outcomes[{i}] must be a dict, got {o!r}")
        try:
            rebuilt_outcomes.append(outcome(o.get("outcome_id"), o.get("theme_id"), o.get("description")))
        except InvariantViolation as error:
            raise InvariantViolation(f"OROAD_INVALID_OUTCOMES: outcomes[{i}]: {error}") from error
    outcome_ids = [o["outcome_id"] for o in rebuilt_outcomes]
    if len(outcome_ids) != len(set(outcome_ids)):
        duplicate = sorted({o for o in outcome_ids if outcome_ids.count(o) > 1})
        raise InvariantViolation(f"OROAD_DUPLICATE_OUTCOME_ID: outcome_id(s) {duplicate} declared more than once")
    if len(rebuilt_outcomes) < 1:
        raise InvariantViolation("OROAD_TOO_FEW_OUTCOMES: at least 1 outcome is required -- this method exists to structure a roadmap around outcomes")

    theme_id_set = set(theme_ids)
    dangling_themes = sorted({o["theme_id"] for o in rebuilt_outcomes} - theme_id_set)
    if dangling_themes:
        raise InvariantViolation(
            f"OROAD_DANGLING_THEME_REF: outcomes[] reference theme_id(s) {dangling_themes} not present in themes[] -- "
            "an outcome with no real theme parent is a floating goal with no strategic anchor"
        )

    if not isinstance(bets, list):
        raise InvariantViolation(f"OROAD_INVALID_BETS: bets must be a list, got {type(bets).__name__}")
    rebuilt_bets: list[dict[str, Any]] = []
    for i, b in enumerate(bets):
        if not isinstance(b, dict):
            raise InvariantViolation(f"OROAD_INVALID_BETS: bets[{i}] must be a dict, got {b!r}")
        try:
            rebuilt_bets.append(bet(b.get("bet_id"), b.get("outcome_id"), b.get("description"), b.get("evidence")))
        except InvariantViolation as error:
            raise InvariantViolation(f"OROAD_INVALID_BETS: bets[{i}]: {error}") from error
    bet_ids = [b["bet_id"] for b in rebuilt_bets]
    if len(bet_ids) != len(set(bet_ids)):
        duplicate = sorted({b for b in bet_ids if bet_ids.count(b) > 1})
        raise InvariantViolation(f"OROAD_DUPLICATE_BET_ID: bet_id(s) {duplicate} declared more than once")

    outcome_id_set = set(outcome_ids)
    dangling_outcomes = sorted({b["outcome_id"] for b in rebuilt_bets} - outcome_id_set)
    if dangling_outcomes:
        raise InvariantViolation(
            f"OROAD_DANGLING_OUTCOME_REF: bets[] reference outcome_id(s) {dangling_outcomes} not present in outcomes[] -- "
            "a bet with no real outcome parent is exactly the feature-driven roadmap entry this method exists to prevent"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "themes": rebuilt_themes,
        "outcomes": rebuilt_outcomes,
        "bets": rebuilt_bets,
        "next_review": next_review,
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


def evaluate_theme_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #1 directly from raw fields using the SAME ``_theme_problem``/``_outcome_problem``
    predicates the builder uses -- catches a hand-tampered record (e.g. an outcome's theme_id repointed to a
    theme deleted after construction) that never went through ``generate_outcome_roadmap`` at all."""
    if not isinstance(record, dict):
        return _result("theme_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    themes = record.get("themes")
    theme_id_set: set[Any] = set()
    if isinstance(themes, list):
        malformed_themes = [f"themes[{i}]: {problem}" for i, problem in ((i, _theme_problem(t)) for i, t in enumerate(themes)) if problem]
        problems.extend(malformed_themes)
        well_shaped_themes = [t for t in themes if _theme_problem(t) is None]
        theme_ids = [t["theme_id"] for t in well_shaped_themes]
        theme_id_set = set(theme_ids)
        if not malformed_themes and len(theme_id_set) < 1:
            problems.append("fewer than 1 declared theme")
        if len(theme_ids) != len(theme_id_set):
            problems.append(f"duplicate theme_id in themes[]: {theme_ids!r}")
    else:
        problems.append("themes must be a list")

    outcomes = record.get("outcomes")
    if isinstance(outcomes, list):
        malformed_outcomes = [f"outcomes[{i}]: {problem}" for i, problem in ((i, _outcome_problem(o)) for i, o in enumerate(outcomes)) if problem]
        problems.extend(malformed_outcomes)
        well_shaped_outcomes = [o for o in outcomes if _outcome_problem(o) is None]
        outcome_ids = [o["outcome_id"] for o in well_shaped_outcomes]
        if not malformed_outcomes and len(outcome_ids) < 1:
            problems.append("fewer than 1 declared outcome")
        if len(outcome_ids) != len(set(outcome_ids)):
            problems.append(f"duplicate outcome_id in outcomes[]: {outcome_ids!r}")
        dangling_themes = sorted({o["theme_id"] for o in well_shaped_outcomes} - theme_id_set, key=repr)
        if dangling_themes:
            problems.append(f"dangling theme_id ref(s) in outcomes[]: {dangling_themes}")
    else:
        problems.append("outcomes must be a list")

    passed = not problems
    return _result("theme_coverage", passed, [{"problems": problems}], validator, timestamp)


def evaluate_bet_traceability_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #2, THE real invariant this method exists to enforce, directly from raw fields --
    does NOT assume theme_coverage already passed (recomputes against well-shaped outcomes only). Fails
    closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("bet_traceability", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    outcomes = record.get("outcomes")
    outcome_id_set: set[Any] = set()
    if isinstance(outcomes, list):
        well_shaped_outcomes = [o for o in outcomes if _outcome_problem(o) is None]
        outcome_id_set = {o["outcome_id"] for o in well_shaped_outcomes}
    else:
        problems.append("outcomes must be a list")

    bets = record.get("bets")
    if isinstance(bets, list):
        malformed_bets = [f"bets[{i}]: {problem}" for i, problem in ((i, _bet_problem(b)) for i, b in enumerate(bets)) if problem]
        problems.extend(malformed_bets)
        well_shaped_bets = [b for b in bets if _bet_problem(b) is None]
        bet_ids = [b["bet_id"] for b in well_shaped_bets]
        if not malformed_bets and len(bet_ids) != len(set(bet_ids)):
            problems.append(f"duplicate bet_id in bets[]: {bet_ids!r}")
        dangling_outcomes = sorted({b["outcome_id"] for b in well_shaped_bets} - outcome_id_set, key=repr)
        if dangling_outcomes:
            problems.append(
                f"dangling outcome_id ref(s) in bets[]: {dangling_outcomes} -- a bet with no real outcome parent is "
                "exactly the feature-driven roadmap entry this method exists to prevent"
            )
    else:
        problems.append("bets must be a list")

    passed = not problems
    return _result("bet_traceability", passed, [{"problems": problems}], validator, timestamp)


def evaluate_outcome_roadmap_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_theme_coverage_gate(record, validator, timestamp),
        evaluate_bet_traceability_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
