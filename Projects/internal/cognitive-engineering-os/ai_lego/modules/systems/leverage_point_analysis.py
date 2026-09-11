"""``systems.leverage_point_analysis`` -- first built member of the ``systems`` family (F09), Atlas F09 table
row (L550: "Leverage Point Analysis｜找高槓桿干預點｜parameters→feedback→rules→goals→paradigm｜提升資源效益"),
a simplification of Donella Meadows' leverage-points hierarchy into a 5-tier chain.

THE real invariant this method exists to enforce is the chain itself: `tier` is a closed 5-value enum in
Atlas's own literal order (PARAMETERS, FEEDBACK, RULES, GOALS, PARADIGM), and `tier_rank` is GENUINE_COMPUTE --
mechanically derived from `tier` via a fixed total mapping (PARAMETERS=1 ... PARADIGM=5), same idiom
``challenge.fmea``'s own ``rpn`` and ``challenge.pre_mortem``'s own ``priority`` already establish for this
corpus: neither ``generate_leverage_point_analysis`` nor the ``intervention_point`` convenience constructor
accepts ``tier_rank`` as a caller-supplied parameter (verified in ``tests/unit/test_leverage_point_analysis.py``
via ``inspect.signature``), and a hand-crafted dict smuggling one in is refused by the builder's own exact-
key-set check.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "leverage point"/"leverage_point"
before writing any of this method's own files: one incidental hit
(``specs/cognitive/typed-objects/value-chain-analysis.schema.yaml`` uses "leverage point(s)" generically in
prose describing where a value-chain analysis concludes, not as a defined method output shape -- read in full
to confirm no collision). Zero pre-existing implementation of this method.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.leverage_point_analysis"
RECORD_ID_PREFIX = "LPA-"

# Atlas L550's own literal 5-tier chain, transcribed verbatim, in shallow-to-deep leverage order.
VALID_TIERS = frozenset({"PARAMETERS", "FEEDBACK", "RULES", "GOALS", "PARADIGM"})

# GENUINE_COMPUTE: the sole authority for turning a tier into its rank. Total over all 5 VALID_TIERS values,
# every cell listed explicitly (no loop-generated entries), same discipline challenge.pre_mortem's own
# `_PRIORITY_BY_LEVELS` already establishes.
_TIER_RANK: dict[str, int] = {
    "PARAMETERS": 1,
    "FEEDBACK": 2,
    "RULES": 3,
    "GOALS": 4,
    "PARADIGM": 5,
}
assert set(_TIER_RANK) == VALID_TIERS, "tier_rank mapping must be TOTAL over all 5 tiers"

_POINT_INPUT_KEYS = frozenset({"id", "description", "tier"})
_POINT_STORED_KEYS = _POINT_INPUT_KEYS | frozenset({"tier_rank"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def derive_tier_rank(tier: str) -> int:
    """GENUINE_COMPUTE: the sole authority for turning an intervention point's own ``tier`` into ``tier_rank``.
    Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) -- neither can drift
    from the other. Raises if ``tier`` is outside the 5-value chain."""
    if tier not in VALID_TIERS:
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_TIER: tier must be one of {sorted(VALID_TIERS)} (Atlas F09 L550 chain), got {tier!r}")
    return _TIER_RANK[tier]


def _point_input_shape_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED intervention_points[] entry -- exactly the input keys (NO ``tier_rank``, that field is
    always computed, never accepted), non-empty id/description, tier a legal chain value."""
    if not isinstance(entry, dict) or set(entry.keys()) != _POINT_INPUT_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("description")):
        return False
    return entry.get("tier") in VALID_TIERS


def _point_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) intervention_points[] entry -- exactly the stored keys, core fields valid, AND
    ``tier_rank`` must equal the real re-derivation from this entry's own ``tier``. Called only by the gate
    (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _POINT_STORED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("description")):
        return False
    if entry.get("tier") not in VALID_TIERS:
        return False
    return entry.get("tier_rank") == derive_tier_rank(entry["tier"])


def intervention_point(point_id: str, description: str, tier: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_leverage_point_analysis``'s own ``intervention_points`` parameter.
    Deliberately NO ``tier_rank`` parameter -- that field is always computed, never accepted (see module
    docstring)."""
    if not _is_nonempty_str(point_id) or not _is_nonempty_str(description):
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_POINT: id/description must each be non-empty strings, got id={point_id!r} description={description!r}")
    if tier not in VALID_TIERS:
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_TIER: tier must be one of {sorted(VALID_TIERS)}, got {tier!r}")
    return {"id": point_id, "description": description, "tier": tier}


def generate_leverage_point_analysis(
    record_id: str,
    intervention_points: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/leverage-point-analysis.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then intervention_points
    (non-empty, well-shaped, unique ids, each tier a legal chain value). ``tier_rank`` is ALWAYS computed here
    via ``derive_tier_rank``, never a parameter, so there is no code path through which a caller could construct
    a record whose stored tier_rank disagrees with its own point's own tier.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"LEVERAGEPOINT_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(intervention_points, list) or not intervention_points:
        raise InvariantViolation(
            f"LEVERAGEPOINT_EMPTY_POINTS: intervention_points must be a non-empty list (an analysis naming zero intervention points has not actually "
            f"run Atlas F09 L550's own method), got {_shallow_describe(intervention_points)}"
        )
    if not all(_point_input_shape_is_valid(entry) for entry in intervention_points):
        raise InvariantViolation(
            f"LEVERAGEPOINT_INVALID_POINT_ENTRY: every intervention_points[] entry must have exactly the keys {sorted(_POINT_INPUT_KEYS)} (tier_rank is "
            f"computed, not accepted), non-empty id/description, and tier in {sorted(VALID_TIERS)}, got {_shallow_describe(intervention_points)}"
        )
    point_ids = [entry["id"] for entry in intervention_points]
    duplicate_ids = sorted({pid for pid in point_ids if point_ids.count(pid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"LEVERAGEPOINT_DUPLICATE_POINT_ID: intervention_points id(s) {duplicate_ids} appear more than once")

    rebuilt_points = [
        {"id": entry["id"], "description": entry["description"], "tier": entry["tier"], "tier_rank": derive_tier_rank(entry["tier"])}
        for entry in intervention_points
    ]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "intervention_points": rebuilt_points,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_leverage_point_analysis -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Record-level only -- no per-point provenance to check."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_leverage_point_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_leverage_point_analysis``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a spliced-in ``tier_rank`` disagreeing with its own ``tier``) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("leverage_point_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("leverage_point_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("leverage_point_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    intervention_points = record.get("intervention_points")
    if not isinstance(intervention_points, list) or not intervention_points or not all(_point_stored_entry_is_valid(entry) for entry in intervention_points):
        return _result(
            "leverage_point_integrity",
            False,
            [{"reason": "intervention_points missing, empty, or contains a malformed entry / a tier_rank disagreeing with its own re-derivation"}],
            validator,
            timestamp,
        )
    point_ids = [entry["id"] for entry in intervention_points]
    if len(point_ids) != len(set(point_ids)):
        return _result("leverage_point_integrity", False, [{"reason": "intervention_points contains duplicate id(s)"}], validator, timestamp)

    return _result("leverage_point_integrity", True, [{"point_count": len(intervention_points)}], validator, timestamp)


def evaluate_leverage_point_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_leverage_point_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
