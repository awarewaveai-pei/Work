"""``epistemic.assumption_mapping`` -- 1st of 2 F10 epistemic-family members built this batch (Atlas F10 table
row L570: "Assumption Mapping｜依重要性×不確定性排序｜assumptions→impact if wrong→uncertainty→四象限｜先驗證最
危險假設"), plus the quadrantChart immediately following the F10 table (L582-590, transcribed verbatim at
module scope below).

THE real invariant this method exists to enforce is the quadrant map itself: `impact`/`uncertainty` are each a
closed HIGH/LOW enum, and `quadrant` is GENUINE_COMPUTE -- mechanically derived from the (impact, uncertainty)
pair via a fixed total 4-cell mapping transcribed from the quadrantChart's own 4 quadrant labels, same idiom
``systems.leverage_point_analysis``'s own ``tier_rank`` (read in full before writing this module) already
establishes for this corpus: neither ``generate_assumption_mapping`` nor the ``mapped_assumption`` convenience
constructor accepts ``quadrant`` as a caller-supplied parameter (verified via ``inspect.signature`` in
``tests/unit/test_assumption_mapping.py``), and a hand-crafted dict smuggling one in is refused by the
builder's own exact-key-set check on each ``mapped_assumptions[]`` entry.

RECORD_ID_PREFIX collision check (2026-09-04 F09 critic-pass lesson, applied proactively): grepped
``ai_lego/modules/`` for every existing ``RECORD_ID_PREFIX`` value before choosing ``AMAP-`` -- no collision.

Nested-list-aliasing lesson (same F09 critic pass): N/A for this module -- unlike
``epistemic.assumption_registry``'s ``entries[].evidence[]``, a ``mapped_assumptions[]`` entry here has no
nested list field of its own (``assumption_id``/``impact``/``uncertainty``/``quadrant`` are all scalar strings),
so rebuilding each entry as a fresh flat dict is sufficient; there is no second-level list to separately copy.
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.assumption_mapping"
RECORD_ID_PREFIX = "AMAP-"
ASSUMPTION_ID_PATTERN = re.compile(r"^ASM-[0-9]+$")

# quadrantChart axes (Atlas L584-585), transcribed verbatim as a closed 2-value enum each.
VALID_LEVELS = frozenset({"HIGH", "LOW"})

# quadrantChart's own 4 quadrant labels (Atlas L586-589), transcribed verbatim.
VALID_QUADRANTS = frozenset({"VALIDATE_FIRST", "KNOWN_CRITICAL", "MONITOR", "CHEAP_TESTS"})

# GENUINE_COMPUTE: the sole authority for turning an (impact, uncertainty) pair into its quadrant. Total over
# all 4 combinations of VALID_LEVELS x VALID_LEVELS, every cell listed explicitly (no loop-generated entries),
# same discipline systems.leverage_point_analysis's own `_TIER_RANK` already establishes.
_QUADRANT_BY_IMPACT_UNCERTAINTY: dict[tuple[str, str], str] = {
    ("HIGH", "HIGH"): "VALIDATE_FIRST",  # quadrantChart quadrant-1 (L586): high x, high y
    ("HIGH", "LOW"): "KNOWN_CRITICAL",  # quadrantChart quadrant-2 (L587): low x, high y
    ("LOW", "LOW"): "MONITOR",  # quadrantChart quadrant-3 (L588): low x, low y
    ("LOW", "HIGH"): "CHEAP_TESTS",  # quadrantChart quadrant-4 (L589): high x, low y
}
assert {q for q in _QUADRANT_BY_IMPACT_UNCERTAINTY.values()} == VALID_QUADRANTS, "quadrant mapping must be TOTAL over all 4 quadrants"
assert len(_QUADRANT_BY_IMPACT_UNCERTAINTY) == 4, "quadrant mapping must cover exactly the 4 (impact, uncertainty) combinations"

_ENTRY_INPUT_KEYS = frozenset({"assumption_id", "impact", "uncertainty"})
_ENTRY_STORED_KEYS = _ENTRY_INPUT_KEYS | frozenset({"quadrant"})


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


def derive_quadrant(impact: str, uncertainty: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning an entry's own ``impact``/``uncertainty`` into
    ``quadrant``. Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) --
    neither can drift from the other. Raises if either argument is outside the 2-value HIGH/LOW enum."""
    if impact not in VALID_LEVELS or uncertainty not in VALID_LEVELS:
        raise InvariantViolation(
            f"ASSUMPTIONMAPPING_INVALID_LEVEL: impact and uncertainty must each be one of {sorted(VALID_LEVELS)} (Atlas F10 quadrantChart L584-585), got impact={impact!r} uncertainty={uncertainty!r}"
        )
    return _QUADRANT_BY_IMPACT_UNCERTAINTY[(impact, uncertainty)]


def _entry_input_shape_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED mapped_assumptions[] entry -- exactly the input keys (NO ``quadrant``, that field is
    always computed, never accepted), a real ^ASM-[0-9]+$ assumption_id, impact/uncertainty each a legal
    HIGH/LOW value."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_INPUT_KEYS:
        return False
    if not isinstance(entry.get("assumption_id"), str) or not ASSUMPTION_ID_PATTERN.match(entry["assumption_id"]):
        return False
    return entry.get("impact") in VALID_LEVELS and entry.get("uncertainty") in VALID_LEVELS


def _entry_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) mapped_assumptions[] entry -- exactly the stored keys, core fields valid, AND
    ``quadrant`` must equal the real re-derivation from this entry's own impact/uncertainty. Called only by the
    gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_STORED_KEYS:
        return False
    if not isinstance(entry.get("assumption_id"), str) or not ASSUMPTION_ID_PATTERN.match(entry["assumption_id"]):
        return False
    if entry.get("impact") not in VALID_LEVELS or entry.get("uncertainty") not in VALID_LEVELS:
        return False
    return entry.get("quadrant") == derive_quadrant(entry["impact"], entry["uncertainty"])


def mapped_assumption(assumption_id: str, impact: str, uncertainty: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_assumption_mapping``'s own ``mapped_assumptions`` parameter. Deliberately
    NO ``quadrant`` parameter -- that field is always computed, never accepted (see module docstring)."""
    if not isinstance(assumption_id, str) or not ASSUMPTION_ID_PATTERN.match(assumption_id):
        raise InvariantViolation(f"ASSUMPTIONMAPPING_INVALID_ASSUMPTION_ID: assumption_id must match ^ASM-[0-9]+$, got {assumption_id!r}")
    if impact not in VALID_LEVELS or uncertainty not in VALID_LEVELS:
        raise InvariantViolation(f"ASSUMPTIONMAPPING_INVALID_LEVEL: impact and uncertainty must each be one of {sorted(VALID_LEVELS)}, got impact={impact!r} uncertainty={uncertainty!r}")
    return {"assumption_id": assumption_id, "impact": impact, "uncertainty": uncertainty}


def generate_assumption_mapping(
    record_id: str,
    mapped_assumptions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/assumption-mapping.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then
    mapped_assumptions (non-empty, well-shaped, unique assumption_ids, each impact/uncertainty a legal HIGH/LOW
    value). ``quadrant`` is ALWAYS computed here via ``derive_quadrant``, never a parameter, so there is no code
    path through which a caller could construct a record whose stored quadrant disagrees with its own
    (impact, uncertainty).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ASSUMPTIONMAPPING_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ASSUMPTIONMAPPING_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"ASSUMPTIONMAPPING_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(mapped_assumptions, list) or not mapped_assumptions:
        raise InvariantViolation(
            f"ASSUMPTIONMAPPING_EMPTY_ENTRIES: mapped_assumptions must be a non-empty list (a mapping naming zero assumptions has not actually run Atlas "
            f"F10 L570's own method), got {_shallow_describe(mapped_assumptions)}"
        )
    if not all(_entry_input_shape_is_valid(entry) for entry in mapped_assumptions):
        raise InvariantViolation(
            f"ASSUMPTIONMAPPING_INVALID_ENTRY: every mapped_assumptions[] entry must have exactly the keys {sorted(_ENTRY_INPUT_KEYS)} (quadrant is "
            f"computed, not accepted), a real ^ASM-[0-9]+$ assumption_id, and impact/uncertainty in {sorted(VALID_LEVELS)}, got {_shallow_describe(mapped_assumptions)}"
        )
    assumption_ids = [entry["assumption_id"] for entry in mapped_assumptions]
    duplicate_ids = sorted({aid for aid in assumption_ids if assumption_ids.count(aid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"ASSUMPTIONMAPPING_DUPLICATE_ASSUMPTION_ID: assumption_id(s) {duplicate_ids} appear more than once")

    rebuilt_entries = [
        {
            "assumption_id": entry["assumption_id"],
            "impact": entry["impact"],
            "uncertainty": entry["uncertainty"],
            "quadrant": derive_quadrant(entry["impact"], entry["uncertainty"]),
        }
        for entry in mapped_assumptions
    ]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "mapped_assumptions": rebuilt_entries,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_assumption_mapping -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Record-level only -- no per-entry provenance to check."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_assumption_mapping_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_assumption_mapping``, so a hand-tampered record that bypassed the builder entirely
    (e.g. a spliced-in ``quadrant`` disagreeing with its own impact/uncertainty) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("assumption_mapping_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("assumption_mapping_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("assumption_mapping_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    mapped_assumptions = record.get("mapped_assumptions")
    if not isinstance(mapped_assumptions, list) or not mapped_assumptions or not all(_entry_stored_entry_is_valid(entry) for entry in mapped_assumptions):
        return _result(
            "assumption_mapping_integrity",
            False,
            [{"reason": "mapped_assumptions missing, empty, or contains a malformed entry / a quadrant disagreeing with its own re-derivation"}],
            validator,
            timestamp,
        )
    assumption_ids = [entry["assumption_id"] for entry in mapped_assumptions]
    if len(assumption_ids) != len(set(assumption_ids)):
        return _result("assumption_mapping_integrity", False, [{"reason": "mapped_assumptions contains duplicate assumption_id(s)"}], validator, timestamp)

    return _result("assumption_mapping_integrity", True, [{"entry_count": len(mapped_assumptions)}], validator, timestamp)


def evaluate_assumption_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_assumption_mapping_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
