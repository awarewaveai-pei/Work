"""``foresight.wild_cards`` -- F13 unknown-unknowns/foresight family (Atlas L668-685), second built member
(``black_swan_exercise`` already exists in this package).

Atlas's own table row (L680, verbatim): "Wild Cards | 加入劇烈非主流事件 | wild card→重跑 strategy | 測 regime
shift" (inject a dramatic, non-mainstream event; wild card -> re-run strategy; benefit: test for a regime
shift). No dedicated §11/§12 section exists for this method -- the table row is the sole citation (see the
method contract's own `verification` for the grep record).

THE real invariant this method exists to enforce: every declared ``wild_cards[]`` entry must carry a
non-empty ``strategy_rerun`` -- Atlas's own literal pipeline is "wild card→重跑 strategy", and the stated
benefit ("測 regime shift") only holds if the strategy was actually re-run under the card. A wild card recorded
WITHOUT a ``strategy_rerun`` did not do the only thing this method asks for; it merely listed a dramatic
event. ``strategy_rerun`` is modeled as a sub-structure (``strategy_ref``, ``outcome_under_card``,
``still_holds``), a disclosed compilation choice (Atlas gives no sub-structure for this step) rather than a
bare string, so the re-run result is checkable, not merely asserted. Refused at construction and independently
re-derived at the gate, same two-layer discipline every sibling module in this package establishes.

``still_holds`` is a genuine boolean, guarded against the Python ``bool``-is-``int``-subclass trap at BOTH
layers: ``isinstance(value, bool)`` is checked explicitly, not merely ``isinstance(value, int)`` (which would
silently accept ``0``/``1``).

Record-level-only provenance (batch-wide precedent this corpus's F06/F07/F12/F13 builds already use, matching
``foresight.black_swan_exercise``/``challenge.pre_mortem``/``challenge.red_team``'s own overall-record field)
-- no per-wild-card provenance.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "wild card"/"wild_card"/
"WildCardSet" before writing any of this method's own files: only Atlas's own L680 table row and the two
name-only ``method-inventory.yaml`` listings found, zero pre-existing implementation.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.wild_cards"
RECORD_ID_PREFIX = "WCARD-"

_WILD_CARD_KEYS = frozenset({"id", "description", "strategy_rerun"})
_STRATEGY_RERUN_KEYS = frozenset({"strategy_ref", "outcome_under_card", "still_holds"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this package already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Shape validators -- the SINGLE definition of "is this entry well-shaped", consulted by both the builder and
# the independent gate re-derivation (same shared-predicate discipline ``epistemic.evidence_matrix``'s own
# ``_link_problem`` establishes) so the two layers cannot drift apart.
# --------------------------------------------------------------------------


def _strategy_rerun_problem(value: Any) -> str | None:
    """THE real invariant's own shape check: a well-formed, non-empty strategy_rerun. ``still_holds`` must be
    a genuine bool -- ``isinstance(x, bool)`` is checked explicitly (never ``isinstance(x, int)``, which is
    True for ``bool`` too but would silently accept 0/1 as if they were legal booleans)."""
    if not isinstance(value, dict) or set(value.keys()) != _STRATEGY_RERUN_KEYS:
        return f"must be a dict with exactly the keys {sorted(_STRATEGY_RERUN_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("strategy_ref")):
        return f"strategy_ref must be a non-empty string, got {value.get('strategy_ref')!r}"
    if not _is_nonempty_str(value.get("outcome_under_card")):
        return f"outcome_under_card must be a non-empty string, got {value.get('outcome_under_card')!r}"
    if not isinstance(value.get("still_holds"), bool):
        return f"still_holds must be a genuine boolean (not an int like 0/1), got {value.get('still_holds')!r}"
    return None


def _wild_card_problem(value: Any) -> str | None:
    if not isinstance(value, dict) or set(value.keys()) != _WILD_CARD_KEYS:
        return f"must be a dict with exactly the keys {sorted(_WILD_CARD_KEYS)}, got {_shallow_describe(value)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    rerun_problem = _strategy_rerun_problem(value.get("strategy_rerun"))
    if rerun_problem is not None:
        return f"strategy_rerun {rerun_problem}"
    return None


# --------------------------------------------------------------------------
# Convenience constructors (NOT the invariant boundary -- generate_wild_card_set independently re-validates
# every entry regardless of how it was built, same discipline every sibling module establishes).
# --------------------------------------------------------------------------


def strategy_rerun(strategy_ref: str, outcome_under_card: str, still_holds: bool) -> dict[str, Any]:
    """One ``strategy_rerun`` value for ``wild_card``'s own parameter of the same name."""
    entry = {"strategy_ref": strategy_ref, "outcome_under_card": outcome_under_card, "still_holds": still_holds}
    problem = _strategy_rerun_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"WCARD_INVALID_STRATEGY_RERUN: {problem}")
    return entry


def wild_card(card_id: str, description: str, strategy_rerun_value: dict[str, Any]) -> dict[str, Any]:
    """One INPUT entry for ``generate_wild_card_set``'s own ``wild_cards`` parameter."""
    entry = {"id": card_id, "description": description, "strategy_rerun": strategy_rerun_value}
    problem = _wild_card_problem(entry)
    if problem is not None:
        raise InvariantViolation(f"WCARD_INVALID_WILD_CARD: {problem}")
    return entry


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_wild_card_set(
    record_id: str,
    wild_cards: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/wild-card-set.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then wild_cards
    (non-empty, well-shaped, unique ids) -- where "well-shaped" for each entry already includes THE real
    invariant this method exists to enforce (a non-empty, well-formed ``strategy_rerun`` with a genuine
    boolean ``still_holds``), via ``_wild_card_problem``.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WCARD_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WCARD_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"WCARD_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(wild_cards, list) or not wild_cards:
        raise InvariantViolation(f"WCARD_EMPTY_WILD_CARDS: wild_cards must be a non-empty list (Atlas L680: an exercise naming zero cards has not run the process), got {_shallow_describe(wild_cards)}")
    problems = [f"wild_cards[{i}]: {p}" for i, p in ((i, _wild_card_problem(c)) for i, c in enumerate(wild_cards)) if p]
    if problems:
        raise InvariantViolation(f"WCARD_INVALID_WILD_CARD_ENTRY: {problems}")
    card_ids = [c["id"] for c in wild_cards]
    duplicate_card_ids = sorted({cid for cid in card_ids if card_ids.count(cid) > 1})
    if duplicate_card_ids:
        raise InvariantViolation(f"WCARD_DUPLICATE_WILD_CARD_ID: wild_cards id(s) {duplicate_card_ids} appear more than once")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "wild_cards": [copy.deepcopy(c) for c in wild_cards],
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_wild_card_set -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_strategy_rerun_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives THE real invariant directly from raw fields -- not just trusting that ``generate_wild_card_set``'s
    own construction-time check already ran. Never calls the builder, so a hand-tampered record (e.g.
    ``strategy_rerun`` deleted, or ``still_holds`` hand-edited to an int) that bypassed it entirely is caught
    here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing -- every check below is a pure boolean predicate over ``problems``, none raises."""
    if not isinstance(record, dict):
        return _result("strategy_rerun_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    wild_cards = record.get("wild_cards")
    if not isinstance(wild_cards, list) or not wild_cards:
        return _result("strategy_rerun_required", False, [{"reason": "wild_cards missing, not a list, or empty"}], validator, timestamp)
    problems = [f"wild_cards[{i}]: {p}" for i, p in ((i, _wild_card_problem(c)) for i, c in enumerate(wild_cards)) if p]
    well_shaped = [c for c in wild_cards if _wild_card_problem(c) is None]
    card_ids = [c["id"] for c in well_shaped]
    duplicate_card_ids = sorted({cid for cid in card_ids if card_ids.count(cid) > 1}, key=repr)
    if duplicate_card_ids:
        problems.append(f"duplicate wild_cards id(s): {duplicate_card_ids}")
    passed = not problems
    return _result("strategy_rerun_required", passed, [{"cards_checked": len(wild_cards), "problems": problems}], validator, timestamp)


def evaluate_wild_card_set_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_strategy_rerun_required_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
