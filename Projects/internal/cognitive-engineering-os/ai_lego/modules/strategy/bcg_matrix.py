"""``strategy.bcg_matrix`` -- F08 context/strategy family, 14th and final member (10/14 already built; see
``ansoff.py`` for the closed-portfolio-item convention template and ``causal/process_tracing.py`` for the
non-empty-list + per-item GENUINE_COMPUTE + no-builder-parameter template this module reuses -- neither
edited).

Atlas cites this method ONCE: the F08 tool table row (L525: "BCG｜Portfolio 資源配置｜growth×relative share｜
快速產品組合討論｜GE-McKinsey"). Grep-confirmed the only real hit case-insensitively across the whole Atlas
file -- no dedicated section, same thin-citation class ``strategy.ansoff`` already establishes.

Unlike every other F08 method built so far, this method's object of analysis is a PORTFOLIO of products/
business units, not the company/market as a whole -- ``portfolio_items`` is therefore an OPEN-ENDED non-empty
list (process_tracing's ``evidence[]`` shape), not a fixed closed SET like porter_five_forces's 5 forces or
ansoff's/vrio's 4 quadrants/dimensions.

**Real, standard BCG Growth-Share Matrix (independently verified, not obscure)**: 2x2 crossing market Growth
Rate with Relative Market Share, both HIGH/LOW: HIGH growth + HIGH share -> STAR; LOW growth + HIGH share ->
CASH_COW; HIGH growth + LOW share -> QUESTION_MARK; LOW growth + LOW share -> DOG. ``quadrant`` is therefore
GENUINE_COMPUTE (``derive_bcg_quadrant`` below, a TOTAL 4-cell lookup table), never a builder parameter --
same structural elimination ``causal.process_tracing``'s per-item ``implication`` and ``strategy.vrio``'s
``competitive_implication`` already establish: ``portfolio_item`` accepts only the 2 disclosed HIGH/LOW
judgment inputs (plus their reasoning), the builder always attaches the computed ``quadrant`` itself, and the
independent gate re-derives it from each item's own raw fields, never trusting a stored value.

Grepped the whole ``ai_lego`` tree case-insensitively for "bcg" before writing any of this method's own
files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.bcg_matrix"
RECORD_ID_PREFIX = "BCG-"
COMPUTATION_PROVENANCE_REF = "ai_lego.modules.strategy.bcg_matrix.derive_bcg_quadrant"

VALID_AXIS_VALUES: frozenset[str] = frozenset({"HIGH", "LOW"})
# Disclosed judgment-call enum (task-mandated) -- NOT a computed score. Applies to both growth_rate and
# relative_share.

STAR = "STAR"
CASH_COW = "CASH_COW"
QUESTION_MARK = "QUESTION_MARK"
DOG = "DOG"
VALID_QUADRANTS: frozenset[str] = frozenset({STAR, CASH_COW, QUESTION_MARK, DOG})
# The 4 real, standard BCG Growth-Share Matrix quadrant names (see module docstring) -- NOT Atlas content,
# a real external classification disclosed here, same class strategy.vrio's VALID_IMPLICATIONS already
# establishes for a different family.

# Real, external, TOTAL lookup table (all 4 combinations of 2 HIGH/LOW axes): (growth_rate, relative_share)
# -> quadrant. Every cell listed explicitly (no loop-generated entries), same explicit-cell-listing
# discipline strategy.vrio's own _IMPLICATION_BY_ANSWERS already establishes for a larger table.
_QUADRANT_BY_AXES: dict[tuple[str, str], str] = {
    ("HIGH", "HIGH"): STAR,
    ("LOW", "HIGH"): CASH_COW,
    ("HIGH", "LOW"): QUESTION_MARK,
    ("LOW", "LOW"): DOG,
}
assert len(_QUADRANT_BY_AXES) == 4, "BCG quadrant table must be TOTAL over all 4 HIGH/LOW combinations"

_ITEM_INPUT_KEYS = frozenset({"item_name", "growth_rate", "growth_rate_reasoning", "relative_share", "relative_share_reasoning", "provenance"})
_ITEM_STORED_KEYS = _ITEM_INPUT_KEYS | frozenset({"quadrant"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def derive_bcg_quadrant(growth_rate: str, relative_share: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning the 2 real BCG axes into a ``quadrant``. Called by BOTH
    the builder (at construction) and the gate (re-derived from raw fields) -- neither can drift from the
    other. Pure and total: raises only if an axis value is outside {HIGH, LOW} (defense in depth -- by the
    time this is called, ``generate_bcg_matrix``/``evaluate_bcg_matrix_integrity_gate`` have already confirmed
    each axis is a legal value)."""
    key = (growth_rate, relative_share)
    if key not in _QUADRANT_BY_AXES:
        raise InvariantViolation(f"BCG_UNRESOLVABLE_QUADRANT: {key!r} is not a legal (growth_rate, relative_share) pair of {sorted(VALID_AXIS_VALUES)} values (real standard BCG Growth-Share Matrix, see module docstring)")
    return _QUADRANT_BY_AXES[key]


def _item_core_fields_are_valid(entry: dict[str, Any]) -> bool:
    """Shared predicate: the fields every portfolio item entry carries regardless of input-vs-stored shape --
    non-empty item_name, legal growth_rate/relative_share with non-empty reasoning, schema-valid provenance.
    Called by BOTH the input and stored shape predicates below; does NOT itself check key-set shape or
    ``quadrant``."""
    if not _is_nonempty_str(entry.get("item_name")):
        return False
    if entry.get("growth_rate") not in VALID_AXIS_VALUES:
        return False
    if not _is_nonempty_str(entry.get("growth_rate_reasoning")):
        return False
    if entry.get("relative_share") not in VALID_AXIS_VALUES:
        return False
    if not _is_nonempty_str(entry.get("relative_share_reasoning")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _item_input_entry_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED portfolio item entry -- exactly the input keys (NO ``quadrant``, that field is always
    computed, never accepted), core fields valid. Called only by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ITEM_INPUT_KEYS:
        return False
    return _item_core_fields_are_valid(entry)


def _item_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) portfolio item entry -- exactly the stored keys, core fields valid, AND
    ``quadrant`` must equal the real re-derivation from this entry's own growth_rate/relative_share. Called
    only by the gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ITEM_STORED_KEYS:
        return False
    if not _item_core_fields_are_valid(entry):
        return False
    return entry.get("quadrant") == derive_bcg_quadrant(entry["growth_rate"], entry["relative_share"])


def portfolio_item(
    item_name: str,
    growth_rate: str,
    growth_rate_reasoning: str,
    relative_share: str,
    relative_share_reasoning: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    """One INPUT entry for ``generate_bcg_matrix``'s own ``portfolio_items`` parameter. Convenience constructor
    only -- emits ONLY the input keys (deliberately NO ``quadrant`` parameter: see module docstring's
    GENUINE_COMPUTE discipline); does NOT itself enforce non-emptiness of the overall list
    (``generate_bcg_matrix`` validates whatever list of dicts it is handed, same convention
    ``causal.process_tracing``'s own evidence entries already establish)."""
    if growth_rate not in VALID_AXIS_VALUES:
        raise InvariantViolation(f"BCG_INVALID_GROWTH_RATE: {growth_rate!r} is not one of {sorted(VALID_AXIS_VALUES)} (disclosed judgment call, not a computed score)")
    if relative_share not in VALID_AXIS_VALUES:
        raise InvariantViolation(f"BCG_INVALID_RELATIVE_SHARE: {relative_share!r} is not one of {sorted(VALID_AXIS_VALUES)} (disclosed judgment call, not a computed score)")
    if not _is_nonempty_str(item_name):
        raise InvariantViolation(f"BCG_EMPTY_ITEM_NAME: item_name must be a non-empty string, got {item_name!r}")
    if not _is_nonempty_str(growth_rate_reasoning):
        raise InvariantViolation(f"BCG_EMPTY_GROWTH_RATE_REASONING: growth_rate_reasoning must be a non-empty string, got {growth_rate_reasoning!r}")
    if not _is_nonempty_str(relative_share_reasoning):
        raise InvariantViolation(f"BCG_EMPTY_RELATIVE_SHARE_REASONING: relative_share_reasoning must be a non-empty string, got {relative_share_reasoning!r}")
    return {
        "item_name": item_name,
        "growth_rate": growth_rate,
        "growth_rate_reasoning": growth_rate_reasoning,
        "relative_share": relative_share,
        "relative_share_reasoning": relative_share_reasoning,
        "provenance": provenance,
    }


def generate_bcg_matrix(
    matrix_id: str,
    portfolio_items: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/bcg-matrix-analysis.schema.yaml``.

    Enforces both real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes. ``portfolio_items`` entries are accepted WITHOUT a
    ``quadrant`` key (see ``portfolio_item``/module docstring) -- the builder ALWAYS computes and attaches
    ``quadrant`` itself via ``derive_bcg_quadrant``, never a parameter here, so there is no code path through
    which a caller could construct a record whose stored quadrant disagrees with its own item's own axes.
    """
    if not _is_nonempty_str(matrix_id) or not matrix_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BCG_INVALID_ID: matrix_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {matrix_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BCG_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(portfolio_items, list) or not portfolio_items:
        raise InvariantViolation(
            f"BCG_EMPTY_PORTFOLIO: portfolio_items must be a non-empty list (a BCG analysis with zero products has not actually allocated any portfolio "
            f"resources -- Atlas L525's own 'Portfolio 資源配置' purpose), got {portfolio_items!r}"
        )
    if not all(_item_input_entry_is_valid(item) for item in portfolio_items):
        raise InvariantViolation(
            f"BCG_INVALID_PORTFOLIO_ITEM: every entry must have exactly the keys {sorted(_ITEM_INPUT_KEYS)} (quadrant is computed, not accepted), "
            f"growth_rate/relative_share each in {sorted(VALID_AXIS_VALUES)}, non-empty item_name/growth_rate_reasoning/relative_share_reasoning, and "
            f"schema-valid provenance, got {portfolio_items!r}"
        )

    rebuilt_items = [
        {
            "item_name": item["item_name"],
            "growth_rate": item["growth_rate"],
            "growth_rate_reasoning": item["growth_rate_reasoning"],
            "relative_share": item["relative_share"],
            "relative_share_reasoning": item["relative_share_reasoning"],
            "quadrant": derive_bcg_quadrant(item["growth_rate"], item["relative_share"]),
            "provenance": item["provenance"],
        }
        for item in portfolio_items
    ]

    return {
        "id": matrix_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "portfolio_items": rebuilt_items,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every portfolio item entry carries a schema-valid
    provenance_record. Fails closed on non-dict input. No record-level provenance to check (see module
    docstring -- unlike VRIO, there is no top-level synthesis field here needing its own provenance)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    items = record.get("portfolio_items")
    items = items if isinstance(items, list) else []
    invalid = [i.get("item_name") for i in items if isinstance(i, dict) and not provenance_is_valid(i.get("provenance"))]
    passed = bool(items) and not invalid
    return _result("provenance_required", passed, [{"items_checked": len(items), "invalid_provenance_items": invalid}], validator, timestamp)


def evaluate_bcg_matrix_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_bcg_matrix``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. In particular, this is the ONLY place EVERY
    portfolio item's own ``quadrant`` is checked against a fresh ``derive_bcg_quadrant`` recomputation from
    that item's own growth_rate/relative_share. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("bcg_matrix_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("bcg_matrix_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("bcg_matrix_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    items = record.get("portfolio_items")
    if not isinstance(items, list) or not items:
        return _result("bcg_matrix_integrity", False, [{"reason": "portfolio_items missing, not a list, or empty"}], validator, timestamp)
    if not all(_item_stored_entry_is_valid(item) for item in items):
        return _result(
            "bcg_matrix_integrity",
            False,
            [{"reason": "portfolio_items invalid (malformed entry, illegal growth_rate/relative_share, invalid provenance, or a stored quadrant disagreeing with its own re-derivation)"}],
            validator,
            timestamp,
        )

    return _result("bcg_matrix_integrity", True, [{"portfolio_item_count": len(items)}], validator, timestamp)


def evaluate_bcg_matrix_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-and-computation integrity re-derivation. No ``evidence_labeling_required`` gate --
    the contract sets that flag to ``false`` (see strategy.bcg_matrix.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy.ansoff``'s own ``evaluate_ansoff_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_bcg_matrix_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
