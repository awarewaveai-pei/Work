"""``jurisdiction.resolver`` -- F23 global jurisdiction/compliance/localization family (Atlas L935, §11.53
L2412-2437).

Atlas's own table row (L935, verbatim): "Jurisdiction Resolver | 解析實際適用
的多層管轄 | entity/market/user/data/processing/storage/provider/sector→
jurisdictions | 防止只用國家名粗判" (resolve the actual multi-layer applicable
jurisdiction, via entity/market/user/data/processing/storage/provider/sector
inputs, to prevent naive country-name-only judgment). Dedicated §11.53
(L2412-2437) sharpens this: the method answers NOT "which country is the
user in" but which jurisdictions jointly govern a processing activity,
across 11 named input dimensions (Legal Entity, User Location, Data Subject
Location, Processing Location, Storage Location, Provider Location, Market,
Contract Governing Law, Sector, Government Level, Special Territory/
Indigenous Jurisdiction).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``JRES_DANGLING_DIMENSION_REF``) -- every
   ``resolved_jurisdictions[].derived_from_dimensions`` entry must name a
   dimension actually present in ``declared_dimensions[]``.
2. **Dimension coverage, THE real invariant this method exists to
   enforce** (``JRES_INSUFFICIENT_DIMENSION_COVERAGE``) -- when
   ``declared_dimensions[]`` has 2 or more entries, the union of
   ``derived_from_dimensions`` across every ``resolved_jurisdictions[]``
   entry must cover at least 2 distinct dimensions. §11.53's own stated
   purpose ("讓全球產品避免簡化成 country == XX") is defeated by construction
   if a resolution can silently collapse a genuinely multi-dimensional
   input down to a single-dimension (e.g. user-location-only)
   determination -- this invariant refuses exactly that collapse.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"jurisdiction.resolver"/"jurisdiction_resolver"/"JurisdictionResolution"
before writing any of this method's own files: zero pre-existing
implementation or schema title overlap. Pre-existing
``specs/jurisdiction/context.schema.yaml`` is a distinct, Master-Plan-§94-
sourced 14-field typed object with a partially different dimension list
(disclosed in that file's own MRSP-context-1 open question) -- not reused
here, per the method contract's own OQ-JRES-2 disclosure.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.resolver"
RECORD_ID_PREFIX = "JRES-"

DIMENSIONS = frozenset(
    {
        "LEGAL_ENTITY",
        "USER_LOCATION",
        "DATA_SUBJECT_LOCATION",
        "PROCESSING_LOCATION",
        "STORAGE_LOCATION",
        "PROVIDER_LOCATION",
        "MARKET",
        "CONTRACT_GOVERNING_LAW",
        "SECTOR",
        "GOVERNMENT_LEVEL",
        "SPECIAL_TERRITORY_INDIGENOUS_JURISDICTION",
    }
)
_DIMENSION_KEYS = frozenset({"dimension", "value"})
_JURISDICTION_KEYS = frozenset({"jurisdiction_id", "derived_from_dimensions", "basis"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _dimension_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped declared_dimensions[] entry". Both
    ``declared_dimension()`` (construction layer) and the gate (independent re-derivation layer) consult it,
    same single-shared-predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem``
    establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _DIMENSION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _DIMENSION_KEYS <= value.keys():
        return f"missing key(s) {sorted(_DIMENSION_KEYS - value.keys(), key=repr)}"
    if value.get("dimension") not in DIMENSIONS:
        return f"dimension must be one of {sorted(DIMENSIONS)}, got {value.get('dimension')!r}"
    if not _is_nonempty_str(value.get("value")):
        return f"value must be a non-empty string, got {value.get('value')!r}"
    return None


def declared_dimension(dimension: str, value: str) -> dict[str, Any]:
    """One item of ``typed-objects/jurisdiction-resolution-record.schema.yaml#/properties/declared_dimensions``."""
    record = {"dimension": dimension, "value": value}
    problem = _dimension_problem(record)
    if problem is not None:
        raise InvariantViolation(f"JRES_INVALID_DIMENSION: {problem}")
    return record


def _resolved_jurisdiction_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped resolved_jurisdictions[] entry" -- shape only, NOT
    referential integrity against ``declared_dimensions[]`` or dimension coverage, which need the sibling
    array and are checked once in ``generate_jurisdiction_resolution``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _JURISDICTION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _JURISDICTION_KEYS <= value.keys():
        return f"missing key(s) {sorted(_JURISDICTION_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("jurisdiction_id")):
        return f"jurisdiction_id must be a non-empty string, got {value.get('jurisdiction_id')!r}"
    dims = value.get("derived_from_dimensions")
    if not isinstance(dims, list) or not dims:
        return f"derived_from_dimensions must be a non-empty list, got {dims!r}"
    for d in dims:
        if d not in DIMENSIONS:
            return f"derived_from_dimensions contains an invalid dimension {d!r}, must be one of {sorted(DIMENSIONS)}"
    if len(dims) != len(set(dims)):
        return f"derived_from_dimensions contains duplicate entries: {dims!r}"
    if not _is_nonempty_str(value.get("basis")):
        return f"basis must be a non-empty string, got {value.get('basis')!r}"
    return None


def resolved_jurisdiction(jurisdiction_id: str, derived_from_dimensions: list[str], basis: str) -> dict[str, Any]:
    """One item of ``typed-objects/jurisdiction-resolution-record.schema.yaml#/properties/resolved_jurisdictions``.
    Does NOT itself check referential integrity against a declared ``declared_dimensions[]`` list or overall
    dimension coverage -- those cross-field checks happen once, in ``generate_jurisdiction_resolution``, after
    every entry has been rebuilt."""
    record = {"jurisdiction_id": jurisdiction_id, "derived_from_dimensions": list(derived_from_dimensions) if isinstance(derived_from_dimensions, list) else derived_from_dimensions, "basis": basis}
    problem = _resolved_jurisdiction_problem(record)
    if problem is not None:
        raise InvariantViolation(f"JRES_INVALID_RESOLVED_JURISDICTION: {problem}")
    return record


def generate_jurisdiction_resolution(
    record_id: str,
    declared_dimensions: list[dict[str, Any]],
    resolved_jurisdictions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/jurisdiction-resolution-record.schema.yaml``.

    Rebuilds every ``declared_dimensions[]``/``resolved_jurisdictions[]`` entry via
    ``declared_dimension()``/``resolved_jurisdiction()`` (never trusting the caller's raw dicts), then enforces
    the method contract's own real invariants fail-closed, in order: id/version/provenance shape, >=1 declared
    dimension with no duplicates, >=1 resolved jurisdiction, every ``derived_from_dimensions`` entry resolves to
    a declared dimension -- and, the invariant §11.53's own "not country == XX" purpose exists to enforce, when
    2+ dimensions were declared, the resolution as a whole must be traceable to at least 2 of them -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"JRES_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"JRES_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("JRES_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(declared_dimensions, list):
        raise InvariantViolation(f"JRES_INVALID_DECLARED_DIMENSIONS: declared_dimensions must be a list, got {type(declared_dimensions).__name__}")
    rebuilt_dimensions: list[dict[str, Any]] = []
    for i, d in enumerate(declared_dimensions):
        if not isinstance(d, dict):
            raise InvariantViolation(f"JRES_INVALID_DECLARED_DIMENSIONS: declared_dimensions[{i}] must be a dict, got {d!r}")
        rebuilt_dimensions.append(declared_dimension(d.get("dimension"), d.get("value")))
    dimension_names = [d["dimension"] for d in rebuilt_dimensions]
    if len(dimension_names) != len(set(dimension_names)):
        duplicate = sorted({d for d in dimension_names if dimension_names.count(d) > 1})
        raise InvariantViolation(f"JRES_DUPLICATE_DIMENSION: dimension(s) {duplicate} declared more than once")
    if len(rebuilt_dimensions) < 1:
        raise InvariantViolation("JRES_TOO_FEW_DIMENSIONS: at least 1 declared dimension is required")

    if not isinstance(resolved_jurisdictions, list):
        raise InvariantViolation(f"JRES_INVALID_RESOLVED_JURISDICTIONS: resolved_jurisdictions must be a list, got {type(resolved_jurisdictions).__name__}")
    rebuilt_jurisdictions: list[dict[str, Any]] = []
    for i, j in enumerate(resolved_jurisdictions):
        if not isinstance(j, dict):
            raise InvariantViolation(f"JRES_INVALID_RESOLVED_JURISDICTIONS: resolved_jurisdictions[{i}] must be a dict, got {j!r}")
        try:
            rebuilt_jurisdictions.append(resolved_jurisdiction(j.get("jurisdiction_id"), j.get("derived_from_dimensions"), j.get("basis")))
        except InvariantViolation as error:
            raise InvariantViolation(f"JRES_INVALID_RESOLVED_JURISDICTIONS: resolved_jurisdictions[{i}]: {error}") from error
    if len(rebuilt_jurisdictions) < 1:
        raise InvariantViolation("JRES_TOO_FEW_JURISDICTIONS: at least 1 resolved jurisdiction is required")

    dimension_name_set = set(dimension_names)
    dangling = sorted({d for j in rebuilt_jurisdictions for d in j["derived_from_dimensions"]} - dimension_name_set)
    if dangling:
        raise InvariantViolation(f"JRES_DANGLING_DIMENSION_REF: resolved_jurisdictions[] reference dimension(s) {dangling} not present in declared_dimensions[]")

    if len(dimension_name_set) >= 2:
        distinct_used = {d for j in rebuilt_jurisdictions for d in j["derived_from_dimensions"]}
        if len(distinct_used) < 2:
            raise InvariantViolation(
                f"JRES_INSUFFICIENT_DIMENSION_COVERAGE: {len(dimension_name_set)} dimensions were declared "
                f"({sorted(dimension_name_set)}) but the resolution is derived from only {sorted(distinct_used)} -- "
                "Atlas §11.53's own purpose ('讓全球產品避免簡化成 country == XX') requires >=2 declared dimensions "
                "to jointly drive a resolution whenever 2+ are provided"
            )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "declared_dimensions": rebuilt_dimensions,
        "resolved_jurisdictions": rebuilt_jurisdictions,
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
    """Re-derives declared_dimensions/resolved_jurisdictions shape, dimension-count minimum, and referential
    integrity directly from raw fields using the SAME ``_dimension_problem``/``_resolved_jurisdiction_problem``
    predicates the builder uses -- without this the gate could pass records the builder refuses. Fails closed
    on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    declared = record.get("declared_dimensions")
    dimension_name_set: set[Any] = set()
    if isinstance(declared, list):
        malformed_dims = [f"declared_dimensions[{i}]: {problem}" for i, problem in ((i, _dimension_problem(d)) for i, d in enumerate(declared)) if problem]
        problems.extend(malformed_dims)
        well_shaped_dims = [d for d in declared if _dimension_problem(d) is None]
        dimension_names = [d["dimension"] for d in well_shaped_dims]
        dimension_name_set = set(dimension_names)
        if not malformed_dims and len(dimension_name_set) < 1:
            problems.append("fewer than 1 distinct declared dimension")
        if len(dimension_names) != len(dimension_name_set):
            problems.append(f"duplicate dimension in declared_dimensions[]: {dimension_names!r}")
    else:
        problems.append("declared_dimensions must be a list")

    resolved = record.get("resolved_jurisdictions")
    if isinstance(resolved, list):
        malformed = [f"resolved_jurisdictions[{i}]: {problem}" for i, problem in ((i, _resolved_jurisdiction_problem(j)) for i, j in enumerate(resolved)) if problem]
        problems.extend(malformed)
        well_shaped = [j for j in resolved if _resolved_jurisdiction_problem(j) is None]
        if not malformed and len(well_shaped) < 1:
            problems.append("fewer than 1 resolved jurisdiction")
        dangling = sorted({d for j in well_shaped for d in j["derived_from_dimensions"]} - dimension_name_set, key=repr)
        if dangling:
            problems.append(f"dangling dimension ref(s) in resolved_jurisdictions[]: {dangling}")
    else:
        problems.append("resolved_jurisdictions must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_dimension_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.53's own "not country == XX" requirement directly from raw fields -- when 2+
    dimensions are declared, the resolution as a whole must be traceable to >=2 of them. Fails closed on
    malformed entries rather than crashing, and does NOT assume referential integrity already passed
    (recomputes against well-shaped dimensions/jurisdictions only)."""
    if not isinstance(record, dict):
        return _result("dimension_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    declared = record.get("declared_dimensions")
    resolved = record.get("resolved_jurisdictions")
    if not isinstance(declared, list) or not isinstance(resolved, list):
        return _result("dimension_coverage", False, [{"reason": "declared_dimensions and resolved_jurisdictions must both be lists"}], validator, timestamp)

    well_shaped_dims = [d for d in declared if _dimension_problem(d) is None]
    dimension_names = [d["dimension"] for d in well_shaped_dims]
    if len(well_shaped_dims) != len(declared) or len(dimension_names) != len(set(dimension_names)) or len(dimension_names) < 1:
        return _result("dimension_coverage", False, [{"reason": "declared_dimensions[] must be >= 1 distinct well-shaped entries to evaluate coverage"}], validator, timestamp)

    well_shaped_jurisdictions = [j for j in resolved if _resolved_jurisdiction_problem(j) is None]
    if len(well_shaped_jurisdictions) != len(resolved) or len(well_shaped_jurisdictions) < 1:
        return _result("dimension_coverage", False, [{"reason": "resolved_jurisdictions[] must be >= 1 well-shaped entries to evaluate coverage"}], validator, timestamp)

    dimension_name_set = set(dimension_names)
    referentially_valid = [j for j in well_shaped_jurisdictions if set(j["derived_from_dimensions"]) <= dimension_name_set]
    distinct_used = {d for j in referentially_valid for d in j["derived_from_dimensions"]}

    problems: list[str] = []
    if len(referentially_valid) != len(well_shaped_jurisdictions):
        problems.append("one or more resolved_jurisdictions[] entries reference a dimension not in declared_dimensions[]")
    if len(dimension_name_set) >= 2 and len(distinct_used) < 2:
        problems.append(f"{len(dimension_name_set)} dimensions declared but resolution covers only {sorted(distinct_used)}")
    passed = not problems
    return _result("dimension_coverage", passed, [{"declared_dimension_count": len(dimension_name_set), "distinct_dimensions_used": sorted(distinct_used), "problems": problems}], validator, timestamp)


def evaluate_jurisdiction_resolution_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_dimension_coverage_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
