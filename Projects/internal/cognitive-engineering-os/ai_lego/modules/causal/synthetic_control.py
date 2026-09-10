"""``causal.synthetic_control`` -- 10th and FINAL F11 `causal` family member (after ``causal.dag``,
``causal.counterfactual_reasoning``, ``causal.theory_of_change``, ``causal.logic_model``,
``causal.process_tracing``, ``causal.rct``, plus 3 concurrent siblings
``causal.difference_in_differences``/``causal.regression_discontinuity``/
``causal.instrumental_variables`` -- F11 is 10/10 once this batch of 4 lands).

Atlas F11 table row (L625) is this method's ONLY citation -- grep-confirmed the whole
Atlas document has exactly 1 hit for "Synthetic Control"/"donor pool"/"placebo"
combined (this row itself), no dedicated §11.x/§12.x section, no §22.3 Method-specific
Gate table row. The row's own pipeline is the LONGEST in F11:
"donor pool→fit→weights→post gap→placebo" (5 stages vs the typical 3-4 other F11
rows use).

**Scope boundary (task-mandated, disclosed here so a future reader does not mistake
this for, or try to extend this into, an actual econometrics engine): this method
captures the DESIGN of a synthetic-control study, it does not run donor-pool
selection, weight optimization (no RMSPE minimization, no quadratic program), or any
real statistical fit.** Same restraint ``ai_lego/modules/causal/rct.py`` applies to
study design, ``ai_lego/modules/association/morphological_analysis.py`` applies to
combinatorics, and ``ai_lego/modules/decision/weighted_decision_matrix.py`` applies to
scoring. ``fit_quality`` and ``post_treatment_gap`` are DISCLOSURE-ONLY: presence is
enforced, the actual assessment/finding is REPORTED content the caller supplies, with
provenance on the record's own top-level ``provenance`` field -- never computed by
this module. ``weights`` values (magnitude, non-negativity, sum-to-1) are likewise
never validated -- only WHICH donor a weight names is checked (see Invariant #3
below). There is no ``engine``/``computation_provenance_ref`` field on this record
(contrast ``causal-dag-analysis.schema.yaml``'s own ``acyclic_verified``): the absence
itself is the honest disclosure that nothing here is GENUINE_COMPUTE.

Modeled on ``ai_lego/modules/causal/dag.py``'s own referential-integrity pattern
(edges must reference real node ids) rather than ``causal/rct.py``'s flat-string
shape, because this method's own citation names 2 correlated collections (donor
pool, weights) where one is meaningless without the other -- same class of
cross-collection reference ``dag.py``'s own ``edges[].from_node_id/to_node_id`` ->
``nodes[].id`` check already establishes, scaled down (no cycle detection needed;
weights -> donor_pool is a simple membership check, not a graph).

Real invariants (4, beyond per-field completeness):

1. **SYNTH_DONOR_POOL_TOO_SMALL** (``donor_pool`` ``minItems: 2``): a synthetic
   control is BY DEFINITION a WEIGHTED COMBINATION of donor units (Atlas L625's own
   "建立加權反事實" -- construct a WEIGHTED counterfactual). A donor pool of 0 or 1
   unit cannot produce a weighted combination -- with 1 donor the "weight" is
   trivially 100% on that one unit, which is not a synthetic (constructed-by-
   blending) counterfactual at all, just a single comparison unit. Same "the
   method's own name IS the claim" discipline ``causal.rct``'s own
   ``control_group != treatment_group`` check and ``causal.dag``'s own
   ``acyclic_verified`` check both already establish for a different structural
   guarantee.
2. **SYNTH_TREATED_UNIT_IN_DONOR_POOL**: ``treated_unit`` must NOT appear
   (NFKC/case/whitespace-insensitive) among ``donor_pool`` entries -- the treated
   unit is, by the method's own vocabulary, not a donor; a record listing it as both
   is internally contradictory about which unit received the single large policy
   event this method exists to study.
3. **SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR**: every ``weights[].donor`` must match
   (same normalization) an entry actually present in ``donor_pool`` -- weights are
   BY DEFINITION an allocation OVER the donor pool (Atlas's own pipeline places
   "weights" directly after "donor pool"/"fit"); a weight naming a unit outside the
   declared pool is not describing this method's own donor-pool-to-weights
   relationship. Weight VALUES themselves (magnitude, sum-to-1, non-negativity) are
   explicitly NOT checked -- that would be re-implementing the real optimization
   this module is scoped to exclude; only the referential integrity of WHICH units
   may carry a weight is enforced.
4. **SYNTH_EMPTY_PLACEBO_TESTS** (``placebo_tests`` non-empty list, effectively
   ``minItems: 1``): Atlas L625's own explicit FINAL pipeline stage. A
   synthetic-control design disclosing zero placebo checks has not validated its
   own inference at all -- grounded directly in L625's own pipeline ordering (not
   borrowed from any other method's own citation).

Both structural invariants (#2, #3) and every completeness check are enforced at
construction (raise BEFORE any record is built) AND independently re-derived by a
gate from raw fields (catching a hand-tampered record that bypassed the builder
entirely) -- same two-layer discipline every sibling module in this package already
establishes.

Grepped the whole ``ai_lego`` tree case-insensitively for "synthetic_control"/
"synthetic control" before writing any of this method's own files: zero pre-existing
implementation (one unrelated mention in ``ai_lego/modules/causal/__init__.py``'s
own family docstring, naming this method as one of 4 still-unbuilt F11 members --
not an implementation, not edited here per this batch's own instruction; the
orchestrating session rewrites that file once all 4 concurrent builds land).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.synthetic_control"
RECORD_ID_PREFIX = "SYNTH-"
MIN_DONOR_POOL_SIZE = 2


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first so width-variant characters (e.g. ASCII
    vs full-width punctuation) don't defeat the membership/echo checks -- same helper shape
    ``ai_lego/modules/causal/rct.py``'s own ``_normalize`` already establishes, reused here rather than
    retrofitted after a critic finding."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def synthetic_control_weight(donor: str, weight: float) -> dict[str, Any]:
    """One item of ``typed-objects/synthetic-control-record.schema.yaml#/properties/weights``. A thin
    constructor, not a validator -- referential integrity against ``donor_pool`` is checked by
    ``generate_synthetic_control_record``/``evaluate_synthetic_control_integrity_gate``, not here."""
    return {"donor": donor, "weight": weight}


def _is_number_not_bool(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _weights_are_well_formed(weights: Any) -> bool:
    if not isinstance(weights, list) or not weights:
        return False
    for item in weights:
        if not isinstance(item, dict):
            return False
        if not _is_nonempty_str(item.get("donor")) or not _is_number_not_bool(item.get("weight")):
            return False
    return True


def _fields_are_complete(
    treated_unit: Any,
    donor_pool: Any,
    fit_quality: Any,
    weights: Any,
    post_treatment_gap: Any,
    placebo_tests: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(treated_unit):
        return False, "EMPTY_TREATED_UNIT"
    if not isinstance(donor_pool, list) or not donor_pool:
        return False, "EMPTY_DONOR_POOL"
    if not all(_is_nonempty_str(unit) for unit in donor_pool):
        return False, "DONOR_POOL_ENTRY_EMPTY"
    if len(donor_pool) < MIN_DONOR_POOL_SIZE:
        return False, "DONOR_POOL_TOO_SMALL"
    if not _is_nonempty_str(fit_quality):
        return False, "EMPTY_FIT_QUALITY"
    if not _weights_are_well_formed(weights):
        return False, "WEIGHTS_MALFORMED"
    if not _is_nonempty_str(post_treatment_gap):
        return False, "EMPTY_POST_TREATMENT_GAP"
    if not isinstance(placebo_tests, list) or not placebo_tests:
        return False, "EMPTY_PLACEBO_TESTS"
    if not all(_is_nonempty_str(item) for item in placebo_tests):
        return False, "PLACEBO_TEST_ENTRY_EMPTY"
    return True, None


def _treated_unit_echoes_a_donor(treated_unit: str, donor_pool: list[str]) -> bool:
    """True if ``treated_unit`` is effectively identical (Invariant #2, see module docstring) to any
    ``donor_pool`` entry. Shared by the builder and the gate so neither can drift from the other."""
    normalized_treated = _normalize(treated_unit)
    return any(_normalize(unit) == normalized_treated for unit in donor_pool)


def _unknown_weight_donors(donor_pool: list[str], weights: list[dict[str, Any]]) -> list[str]:
    """Every ``weights[].donor`` that does NOT match (Invariant #3, see module docstring) any ``donor_pool``
    entry. Shared by the builder and the gate so neither can drift from the other."""
    normalized_pool = {_normalize(unit) for unit in donor_pool}
    return [item["donor"] for item in weights if _normalize(item["donor"]) not in normalized_pool]


def generate_synthetic_control_record(
    record_id: str,
    treated_unit: str,
    donor_pool: list[str],
    fit_quality: str,
    weights: list[dict[str, Any]],
    post_treatment_gap: str,
    placebo_tests: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/synthetic-control-record.schema.yaml``. Enforces all 4 real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SYNTH_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SYNTH_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(treated_unit, donor_pool, fit_quality, weights, post_treatment_gap, placebo_tests)
    if not complete:
        raise InvariantViolation(
            f"SYNTH_{reason}: treated_unit/fit_quality/post_treatment_gap must be non-empty strings; "
            f"donor_pool (>= {MIN_DONOR_POOL_SIZE} entries)/weights/placebo_tests must be non-empty lists of "
            f"well-formed entries ({reason} failed)"
        )

    if _treated_unit_echoes_a_donor(treated_unit, donor_pool):
        raise InvariantViolation(
            f"SYNTH_TREATED_UNIT_IN_DONOR_POOL: treated_unit is effectively identical (NFKC/case/"
            f"whitespace-insensitive) to a donor_pool entry -- a record naming the same unit as both the "
            f"treated unit and one of its own donors is internally contradictory, got treated_unit={treated_unit!r} "
            f"donor_pool={donor_pool!r}"
        )

    unknown_donors = _unknown_weight_donors(donor_pool, weights)
    if unknown_donors:
        raise InvariantViolation(
            f"SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR: weights reference donor(s) {unknown_donors!r} not present in "
            f"donor_pool {donor_pool!r} -- weights are an allocation OVER the donor pool, a weight naming an "
            f"undeclared unit is not a real synthetic-control weight allocation"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "treated_unit": treated_unit,
        "donor_pool": list(donor_pool),
        "fit_quality": fit_quality,
        "weights": [dict(item) for item in weights],
        "post_treatment_gap": post_treatment_gap,
        "placebo_tests": list(placebo_tests),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_synthetic_control_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL 4 real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_synthetic_control_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("synthetic_control_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("synthetic_control_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("synthetic_control_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    treated_unit = record.get("treated_unit")
    donor_pool = record.get("donor_pool")
    fit_quality = record.get("fit_quality")
    weights = record.get("weights")
    post_treatment_gap = record.get("post_treatment_gap")
    placebo_tests = record.get("placebo_tests")

    complete, reason = _fields_are_complete(treated_unit, donor_pool, fit_quality, weights, post_treatment_gap, placebo_tests)
    if not complete:
        return _result("synthetic_control_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    if _treated_unit_echoes_a_donor(treated_unit, donor_pool):
        return _result("synthetic_control_integrity", False, [{"reason": "TREATED_UNIT_IN_DONOR_POOL"}], validator, timestamp)

    unknown_donors = _unknown_weight_donors(donor_pool, weights)
    if unknown_donors:
        return _result(
            "synthetic_control_integrity", False, [{"reason": "WEIGHT_REFERENCES_UNKNOWN_DONOR", "unknown_donors": unknown_donors}], validator, timestamp
        )

    return _result(
        "synthetic_control_integrity",
        True,
        [{"donor_pool_size": len(donor_pool), "weights_count": len(weights), "placebo_tests_count": len(placebo_tests)}],
        validator,
        timestamp,
    )


def evaluate_synthetic_control_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_synthetic_control_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
