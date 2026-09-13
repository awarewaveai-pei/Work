"""``feasibility.cost_effectiveness`` -- F14 feasibility/economics family (Atlas L718-730), third member built
this batch (with ``feasibility.telos``, ``feasibility.cost_benefit_analysis`` -- 3 disjoint sibling agents build
the family's remaining 9 members concurrently this session).

Atlas's own table row (L724, verbatim): "Cost–Effectiveness | 同一 outcome 比較成本 | cost per unit outcome |
benefit 難貨幣化時適用" (compare cost for the SAME outcome across alternatives, via cost-per-unit-outcome; useful
when benefit is hard to monetize). No dedicated Atlas section exists for this method (grep-confirmed against the
full §12 tool-detail chapter) -- this table row (L724) is the sole citation, disclosed plainly here and in this
method's own contract/schema ``verification``, not silently treated as if a full worked-example section existed.

``cost_per_unit`` is GENUINE_COMPUTE (``compute_cost_per_unit`` = ``cost / effectiveness_outcome_units``) --
``alternative()`` has NO ``cost_per_unit`` parameter at all (verified by ``tests/unit/test_cost_effectiveness.py``
via ``inspect.signature``, same idiom ``epistemic.bayesian_updating``'s own ``posterior``/``foresight.delphi``'s
own ``dispersion`` establish; a caller attempting ``cost_per_unit=`` gets a plain ``TypeError``, not a
silently-accepted value). THE real degenerate case this method exists to guard against: ``effectiveness_outcome_
units`` (e.g. "lives saved", "tickets resolved") reaching zero or below would make cost-per-unit either undefined
(zero) or a nonsensical negative ratio -- refused with its own distinct ``CE_ZERO_EFFECTIVENESS`` code BEFORE any
division ever runs (both in ``alternative()`` at construction time, and independently inside
``compute_cost_per_unit`` itself, which fails closed on its own degenerate input even if some future caller
reaches it directly) -- never a ``ZeroDivisionError`` crash, never a silently-returned ``inf``/``None``.

Enforced at TWO independent layers, same belt-and-suspenders discipline every prior slice in this corpus
establishes: construction-time refusal and an independent gate (``evaluate_alternative_integrity_gate``) that
re-derives every invariant -- including per-alternative id uniqueness and a fresh recomputation of
``cost_per_unit`` within an explicit float tolerance -- from a record's own raw fields via the SAME shared
``_alternative_problem`` predicate the builder uses, never trusting that construction-time already ran and never
calling ``generate_cost_effectiveness_analysis``.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "cost-effectiveness"/"cost effectiveness"/"cost per unit" before writing any of this
method's own files: only this same batch's sibling F14 backlog entries -- zero pre-existing implementation or
schema title overlap. See ``typed-objects/cost-effectiveness-analysis.schema.yaml``'s own ``verification`` for
the full grep record.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.cost_effectiveness"
RECORD_ID_PREFIX = "CE-"

# Compilation decision (disclosed, contract/schema): storage rounds to 8dp (matching epistemic.bayesian_updating's
# own convention), so a 1e-9 gate tolerance is one order of magnitude tighter than that unit -- absorbs float
# round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9

_ALTERNATIVE_KEYS = frozenset({"id", "cost", "effectiveness_outcome_units", "cost_per_unit"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- same documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against). ``int`` is unconditionally
    finite in Python and is not passed through ``math.isfinite`` (that raises ``OverflowError`` on a huge
    ``int``, a trap only reachable via the ``float`` branch)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def compute_cost_per_unit(cost: float, effectiveness_outcome_units: float) -> float:
    """GENUINE_COMPUTE: ``cost / effectiveness_outcome_units``. Never accepted as an input -- always derived
    here, and independently re-derived by ``evaluate_alternative_integrity_gate``. Raises
    ``CE_ZERO_EFFECTIVENESS`` (not ``ZeroDivisionError``, not a silently-returned ``inf``/``None``) when
    ``effectiveness_outcome_units`` is not strictly positive -- ``alternative()`` already refuses to construct
    such an alternative, but this pure function guards its own degenerate input boundary independently (same
    "pure compute, fails closed on its own degenerate case" discipline ``epistemic.bayesian_updating``'s own
    ``compute_posterior``/``foresight.delphi``'s own ``compute_dispersion`` already establish). Result rounded to
    8 decimal places (module docstring)."""
    if effectiveness_outcome_units <= 0:
        raise InvariantViolation(
            f"CE_ZERO_EFFECTIVENESS: effectiveness_outcome_units must be > 0 to compute a cost-per-unit ratio, got {effectiveness_outcome_units!r}"
        )
    return round(cost / effectiveness_outcome_units, 8)


def _alternative_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped alternative with a correctly-computed cost_per_unit".
    Both ``alternative()`` (construction layer) and ``evaluate_alternative_integrity_gate`` (independent
    re-derivation layer) consult it, same single-shared-predicate discipline ``epistemic.evidence_matrix``'s own
    ``_link_problem`` establishes -- the two layers cannot drift apart."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ALTERNATIVE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ALTERNATIVE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ALTERNATIVE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"

    cost = value.get("cost")
    if not _is_finite_number(cost) or cost < 0:
        return f"cost must be a real finite number >= 0, got {cost!r}"

    units = value.get("effectiveness_outcome_units")
    if not _is_finite_number(units) or units <= 0:
        return f"effectiveness_outcome_units must be a real finite number > 0, got {units!r} (CE_ZERO_EFFECTIVENESS class)"

    try:
        expected = compute_cost_per_unit(cost, units)
    except InvariantViolation as error:
        return f"cost_per_unit could not be independently recomputed: {error}"

    stored = value.get("cost_per_unit")
    if not isinstance(stored, (int, float)) or isinstance(stored, bool) or abs(stored - expected) > _FLOAT_TOLERANCE:
        return f"cost_per_unit={stored!r} does not match recomputed {expected!r} (tolerance {_FLOAT_TOLERANCE})"
    return None


def alternative(alt_id: str, cost: float, effectiveness_outcome_units: float) -> dict[str, Any]:
    """One item of ``typed-objects/cost-effectiveness-analysis.schema.yaml#/properties/alternatives``.
    Deliberately has NO ``cost_per_unit`` parameter -- GENUINE_COMPUTE via ``compute_cost_per_unit``, never
    caller-supplied. Enforces all real invariants fail-closed, in order: id, cost (finite, >=0),
    effectiveness_outcome_units (finite, >0 -- refuses with ``CE_ZERO_EFFECTIVENESS`` otherwise), then computes
    ``cost_per_unit``."""
    if not _is_nonempty_str(alt_id):
        raise InvariantViolation(f"CE_INVALID_ALTERNATIVE_ID: id must be a non-empty string, got {alt_id!r}")
    if not _is_finite_number(cost) or cost < 0:
        raise InvariantViolation(f"CE_INVALID_COST: cost must be a real finite number >= 0, got {cost!r}")
    if not _is_finite_number(effectiveness_outcome_units) or effectiveness_outcome_units <= 0:
        raise InvariantViolation(
            f"CE_ZERO_EFFECTIVENESS: effectiveness_outcome_units must be a real finite number > 0, got {effectiveness_outcome_units!r}"
        )
    cost_per_unit = compute_cost_per_unit(cost, effectiveness_outcome_units)
    return {"id": alt_id, "cost": cost, "effectiveness_outcome_units": effectiveness_outcome_units, "cost_per_unit": cost_per_unit}


def generate_cost_effectiveness_analysis(
    record_id: str,
    alternatives: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cost-effectiveness-analysis.schema.yaml``.

    Rebuilds every ``alternatives[]`` entry via ``alternative()`` (never trusting the caller's raw dicts, and
    never accepting a caller-supplied ``cost_per_unit`` -- see module docstring), then enforces the method
    contract's own real invariant fail-closed, in order: id/version/provenance shape, >=1 alternative declared,
    every alternative individually valid, and no duplicate alternative ``id`` across the record -- BEFORE
    returning.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CE_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CE_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CE_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(alternatives, list) or not alternatives:
        raise InvariantViolation(f"CE_NO_ALTERNATIVES: at least 1 alternative is required, got {alternatives!r}")
    rebuilt_alternatives: list[dict[str, Any]] = []
    for i, a in enumerate(alternatives):
        if not isinstance(a, dict):
            raise InvariantViolation(f"CE_INVALID_ALTERNATIVES: alternatives[{i}] must be a dict, got {a!r}")
        try:
            rebuilt_alternatives.append(alternative(a.get("id"), a.get("cost"), a.get("effectiveness_outcome_units")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CE_INVALID_ALTERNATIVES: alternatives[{i}]: {error}") from error

    alt_ids = [a["id"] for a in rebuilt_alternatives]
    if len(set(alt_ids)) != len(alt_ids):
        duplicate = sorted({x for x in alt_ids if alt_ids.count(x) > 1})
        raise InvariantViolation(f"CE_DUPLICATE_ALTERNATIVE_ID: id(s) {duplicate} used more than once across alternatives")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "alternatives": rebuilt_alternatives,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_cost_effectiveness_analysis -- a hand-tampered record that bypassed the builder entirely (e.g. a
# spliced-in wrong cost_per_unit) must be caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_alternative_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields via the SAME ``_alternative_problem``
    predicate the builder uses (shape, cost/effectiveness ranges, a fresh ``cost_per_unit`` recomputation within
    tolerance) plus the top-level duplicate-alternative-id check -- does NOT call
    ``generate_cost_effectiveness_analysis``, so a hand-tampered record is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("alternative_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    alternatives = record.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives:
        return _result("alternative_integrity", False, [{"reason": "alternatives must be a non-empty list"}], validator, timestamp)

    problems: list[str] = [f"alternatives[{i}]: {problem}" for i, problem in ((i, _alternative_problem(a)) for i, a in enumerate(alternatives)) if problem]
    well_shaped = [a for a in alternatives if _alternative_problem(a) is None]
    alt_ids = [a["id"] for a in well_shaped]
    if len(alt_ids) != len(set(alt_ids)):
        duplicate = sorted({x for x in alt_ids if alt_ids.count(x) > 1})
        problems.append(f"duplicate alternative id(s): {duplicate}")

    passed = not problems
    return _result("alternative_integrity", passed, [{"alternatives_checked": len(alternatives), "problems": problems}], validator, timestamp)


def evaluate_cost_effectiveness_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_alternative_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
