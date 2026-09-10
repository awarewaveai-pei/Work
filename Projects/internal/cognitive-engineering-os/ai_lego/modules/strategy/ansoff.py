"""``strategy.ansoff`` -- F08 context/strategy family, 7th member (``strategy.swot``/``pestel``/``steepv``/
``three_c``/``tows``/``porter_five_forces`` already built; see ``porter_five_forces.py``, read in full as
this module's primary repo-convention template, not edited).

Atlas cites this method ONCE: the F08 tool table row (L524: "Ansoff｜產品×市場成長策略｜penetration/
development/product/diversification｜顯示不同風險｜Risk"). Grep-confirmed the ONLY real hit for
"ansoff"/"penetration"/"diversification" case-insensitively across the whole Atlas file -- no dedicated
section exists (thinner than every other F08 member built so far, including ``strategy.three_c``'s own
table-row+§12.12 pair).

**Disambiguation (task-mandated, disclosed here)**: Atlas's own row gives 4 comma-separated FRAGMENT tokens
-- "penetration", "development", "product", "diversification" -- not the 4 full canonical Ansoff Growth
Matrix names. "development" alone is ambiguous between MARKET_DEVELOPMENT and PRODUCT_DEVELOPMENT. Resolved
using the real, well-known, independently-verified Ansoff Growth Matrix (product x market, 2x2 -- standard
business-strategy knowledge, not obscure): existing/new PRODUCT crossed with existing/new MARKET yields
exactly Market Penetration (existing x existing), Market Development (existing product x new market),
Product Development (new product x existing market), Diversification (new x new). Mapping: token 1
"penetration" -> MARKET_PENETRATION (unambiguous, only one canonical name contains "penetration"); token 4
"diversification" -> DIVERSIFICATION (unambiguous); token 3 "product" -> PRODUCT_DEVELOPMENT (by
elimination, the only remaining canonical name containing "product"); token 2 "development" ->
MARKET_DEVELOPMENT (by elimination, the one quadrant left once "product" already claimed token 3). This
positional order also happens to match the standard low-to-high risk convention Atlas's own benefit column
("顯示不同風險") describes (Penetration lowest, the two Development quadrants intermediate, Diversification
highest) -- a consistency check corroborating the mapping, not proof of it. Full reasoning also recorded in
``strategy.ansoff.contract.yaml``'s own ``compilation_decisions``.

**Design-shape choice (task-mandated, disclosed here)**: same closed-SET-with-completeness-required shape
``strategy.porter_five_forces``/``QUADRANT_NAMES`` (5-way) already establishes for an analogous fixed-name-
vocabulary structural method -- 4 fixed named quadrants, no position/order between them (Atlas's own row
lists them flat, no cited sequence), but completeness required (Atlas's own method definition IS the
product x market 2x2 split -- a record naming only 3 of the 4 quadrants has not actually mapped the full
growth-strategy space the method's own name promises).

Real invariants (grounded in Atlas L524, each enforced BOTH at construction, raise BEFORE any record is
built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer discipline
every sibling module in this package already establishes):

1. ``quadrants`` is EXACTLY the 4 ``QUADRANT_NAMES`` values, each appearing EXACTLY ONCE, in ANY order
   (unordered completeness -- see design-shape note above). Missing, duplicated, or unrecognized quadrant
   names are all refused.
2. Every quadrant entry carries a non-empty ``strategy_description`` (what this growth path would concretely
   look like for the actual product/market in question) AND a ``risk_level`` in the closed judgment-call enum
   ``{LOW, MEDIUM, HIGH}`` -- a DISCLOSED human/AI judgment, never a computed score (task-mandated restraint:
   the real-world convention that Diversification is riskier than Penetration is directional guidance for the
   judgment call, not a formula this builder mechanically applies per quadrant name -- no citation supports
   hardcoding a fixed risk_level per quadrant).

Unlike ``strategy.porter_five_forces``, there is NO third top-level invariant analogous to
``overall_attractiveness``: Atlas's own stated benefit for Ansoff ("顯示不同風險") is DISTRIBUTED across the
4 quadrants (each one shows its own risk level), not a single industry-level conclusion the way Porter's own
"長期產業吸引力" is. See the typed-object schema's own ``compilation_decisions`` for the full comparison.

Grepped the whole ``ai_lego`` tree case-insensitively for "ansoff" before writing any of this method's own
files: zero pre-existing implementation (one doc-only hit -- ``ai_lego/modules/strategy/__init__.py``'s own
"Remaining 8" list naming Ansoff as not-yet-built; not a real contract/schema/module).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.ansoff"
RECORD_ID_PREFIX = "ANSOFF-"
QUADRANT_NAMES: frozenset[str] = frozenset({"MARKET_PENETRATION", "MARKET_DEVELOPMENT", "PRODUCT_DEVELOPMENT", "DIVERSIFICATION"})
# Atlas L524's own 4 fragment-tokens ("penetration/development/product/diversification"), DISAMBIGUATED (not
# verbatim-transcribed) into the 4 canonical Ansoff Growth Matrix quadrant names. See module docstring's
# disambiguation note for the full positional + by-elimination reasoning.
VALID_RISK_LEVELS: frozenset[str] = frozenset({"LOW", "MEDIUM", "HIGH"})
# Disclosed judgment-call enum (task-mandated) -- NOT a computed score, NOT hardcoded per quadrant name. See
# module docstring invariant 2.

_QUADRANT_REQUIRED_KEYS = frozenset({"quadrant", "strategy_description", "risk_level", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _quadrant_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == _QUADRANT_REQUIRED_KEYS


def _quadrants_are_valid(quadrants: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(quadrants) != 4`` up front: a wrong COUNT (too few, too many,
    or the right count with a duplicate) is a completeness defect (``INCOMPLETE_QUADRANT_SET``), a distinct
    failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_QUADRANT``/etc), same convention
    ``porter_five_forces.py``'s own ``_forces_are_valid`` already establishes."""
    if not isinstance(quadrants, list):
        return False, "SHAPE"
    seen_names: list[str] = []
    for entry in quadrants:
        if not _quadrant_entry_shaped(entry):
            return False, "SHAPE"
        quadrant = entry.get("quadrant")
        if quadrant not in QUADRANT_NAMES:
            return False, "UNKNOWN_QUADRANT"
        seen_names.append(quadrant)
        if not _is_nonempty_str(entry.get("strategy_description")):
            return False, "EMPTY_STRATEGY_DESCRIPTION"
        if entry.get("risk_level") not in VALID_RISK_LEVELS:
            return False, "INVALID_RISK_LEVEL"
    if len(seen_names) != len(QUADRANT_NAMES) or set(seen_names) != QUADRANT_NAMES:
        return False, "INCOMPLETE_QUADRANT_SET"
    return True, None


def quadrant_entry(
    quadrant: str,
    strategy_description: str,
    risk_level: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    """One item of ``typed-objects/ansoff-matrix.schema.yaml#/properties/quadrants``. Convenience constructor
    only -- emits ONLY known-good keys; does NOT itself enforce the completeness/distinctness invariant
    (``generate_ansoff_matrix`` validates whatever list of dicts it is handed regardless of how each entry was
    built, same convention ``porter_five_forces.py``'s own ``force_entry`` already establishes)."""
    if quadrant not in QUADRANT_NAMES:
        raise InvariantViolation(f"ANSOFF_UNKNOWN_QUADRANT: {quadrant!r} is not one of {sorted(QUADRANT_NAMES)} (Atlas L524 disambiguated four-quadrant vocabulary)")
    if risk_level not in VALID_RISK_LEVELS:
        raise InvariantViolation(f"ANSOFF_INVALID_RISK_LEVEL: {risk_level!r} is not one of {sorted(VALID_RISK_LEVELS)} (disclosed judgment call, not a computed score)")
    if not _is_nonempty_str(strategy_description):
        raise InvariantViolation(f"ANSOFF_EMPTY_STRATEGY_DESCRIPTION: strategy_description must be a non-empty string, got {strategy_description!r}")
    return {"quadrant": quadrant, "strategy_description": strategy_description, "risk_level": risk_level, "provenance": provenance}


def generate_ansoff_matrix(
    matrix_id: str,
    quadrants: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ansoff-matrix.schema.yaml``.

    Enforces both real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes -- never a record that itself proves it was built
    illegally.
    """
    if not _is_nonempty_str(matrix_id) or not matrix_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ANSOFF_INVALID_ID: matrix_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {matrix_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ANSOFF_INVALID_VERSION: version must be a string, got {version!r}")

    valid, reason = _quadrants_are_valid(quadrants)
    if not valid:
        if reason == "UNKNOWN_QUADRANT":
            raise InvariantViolation(f"ANSOFF_UNKNOWN_QUADRANT: quadrants contains a name outside {sorted(QUADRANT_NAMES)}, got {quadrants!r}")
        if reason == "EMPTY_STRATEGY_DESCRIPTION":
            raise InvariantViolation(f"ANSOFF_EMPTY_STRATEGY_DESCRIPTION: every quadrant entry must carry a non-empty 'strategy_description', got {quadrants!r}")
        if reason == "INVALID_RISK_LEVEL":
            raise InvariantViolation(f"ANSOFF_INVALID_RISK_LEVEL: every quadrant entry's 'risk_level' must be one of {sorted(VALID_RISK_LEVELS)}, got {quadrants!r}")
        if reason == "INCOMPLETE_QUADRANT_SET":
            raise InvariantViolation(
                f"ANSOFF_INCOMPLETE_QUADRANT_SET: quadrants must name EXACTLY the four {sorted(QUADRANT_NAMES)}, each exactly once -- Atlas L524's own "
                f"product x market split IS the method's definition, a record naming only some of the 4 has not done an Ansoff analysis, got {quadrants!r}"
            )
        raise InvariantViolation(f"ANSOFF_INVALID_QUADRANT_SET: quadrants must be exactly {len(QUADRANT_NAMES)} well-shaped entries, got {quadrants!r}")

    return {
        "id": matrix_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "quadrants": [dict(q) for q in quadrants],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every quadrant entry carries a schema-valid
    provenance_record. Fails closed on non-dict input. No record-level provenance to check (see module
    docstring -- unlike Porter, there is no top-level synthesis field here needing its own provenance)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    quadrants = record.get("quadrants")
    quadrants = quadrants if isinstance(quadrants, list) else []
    invalid = [q.get("quadrant") for q in quadrants if isinstance(q, dict) and not provenance_is_valid(q.get("provenance"))]
    passed = bool(quadrants) and not invalid
    return _result("provenance_required", passed, [{"quadrants_checked": len(quadrants), "invalid_provenance_quadrants": invalid}], validator, timestamp)


def evaluate_ansoff_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_ansoff_matrix``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("ansoff_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("ansoff_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("ansoff_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    valid, reason = _quadrants_are_valid(record.get("quadrants"))
    if not valid:
        return _result(
            "ansoff_integrity",
            False,
            [{"reason": f"quadrants invalid ({reason}) -- must name exactly {sorted(QUADRANT_NAMES)}, each exactly once, well-shaped"}],
            validator,
            timestamp,
        )

    return _result("ansoff_integrity", True, [{"quadrant_count": len(record["quadrants"])}], validator, timestamp)


def evaluate_ansoff_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see strategy.ansoff.contract.yaml's own ``quality``/``compilation_decisions``),
    same "only emit gates for what is actually declared true" discipline ``strategy.three_c``'s own
    ``evaluate_three_c_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_ansoff_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
