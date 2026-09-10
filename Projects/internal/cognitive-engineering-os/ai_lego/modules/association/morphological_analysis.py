"""``association.morphological_analysis`` -- 1st member of the `association` family (F04, Associative
Mapping & Combination), methods/contracts/association.morphological_analysis.contract.yaml.

Atlas's citations: F04 table row (L414: "Morphological Analysis｜多維 options 組合｜dimensions→options→合法
組合→評估｜系統探索巨大 solution space｜MCDA、Prototype"), dedicated §11.11 (L1436-1460: worked 4-dimension x
3-option table + 5-step "使用方式" -- define dimensions, list options, build compatibility constraints,
GENERATE legal combinations, converge via feasibility/MCDA/prototype), and the §13.5 New Product / Startup
Recipe mermaid node (L3341: SCAMPER -> Morphological Analysis -> Assumption Mapping). §28's quick-tool table
(L4471) additionally names this method as a suggested next step after SCAMPER for an "已有產品想改良"
scenario -- SCAMPER is an unbuilt sibling at this write time, noted as an open question, not depended on.

**Structural point, taken literally (not just as a docstring claim):** Atlas's own step 4 verb is "產生"
(GENERATE) legal combinations -- not "declare" or "list". Two design choices make that literal: (1) the
raw, UNFILTERED cartesian product size (``dimensions[].options`` counts multiplied together) is checked
against a disclosed cap (``MAX_RAW_COMBINATION_SPACE``) BEFORE any enumeration is attempted, same
defensive-cap-before-compute precedent ``security.attack_tree``'s own ``MAX_TREE_DEPTH`` already establishes
for a different unbounded-computation risk; (2) ``legal_combinations``/``legal_combination_count`` are
GENUINE_COMPUTE (``ai_lego.compute.morphological_analysis.combination_generation.generate_legal_combinations``),
re-derived from ``dimensions``/``constraints`` by both the builder and an independent gate -- never a value a
caller can simply assert.

Two real invariant classes, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this suite already establishes:

1. ``dimensions``/``constraints`` shape and cross-reference validity: at least 2 dimensions (Atlas's own
   "多維" = MULTIDIMENSIONAL wording -- a single dimension isn't morphological analysis), each dimension
   has a unique name and at least 2 unique non-empty options (a 1-option "dimension" contributes no
   branching to the combinatorial space Atlas's own worked table -- 3 options per row -- implies every
   dimension should have); every constraint names two DIFFERENT dimensions, each existing in ``dimensions``,
   each option existing among that dimension's own options.
2. ``legal_combinations``/``legal_combination_count`` must equal the real cartesian-product-minus-
   constraint-violations enumeration over ``dimensions``/``constraints`` -- re-derived by
   ``generate_legal_combinations``, never trusted from a stored or caller-supplied value. Zero legal
   combinations (every combination eliminated by constraints) is a VALID, meaningful record state, not
   refused by the builder -- same "zero is meaningful, not unset" precedent
   ``framing.five_w_one_h``'s own ``information_gaps: []`` and ``framing.boundary_critique``'s own
   ``empty_categories: []`` already establish; an infeasible constraint set is itself a real, actionable
   finding for the caller, not an error condition this module manufactures a refusal for.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.morphological_analysis.combination_generation import generate_legal_combinations
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.morphological_analysis"
RECORD_ID_PREFIX = "MORPHANALYSIS-"
MIN_DIMENSIONS = 2
MIN_OPTIONS_PER_DIMENSION = 2
MAX_RAW_COMBINATION_SPACE = 100_000
# Raw (UNFILTERED) cartesian-product size cap, checked BEFORE any enumeration is attempted -- same
# defensive-cap-before-compute precedent security.attack_tree's own MAX_TREE_DEPTH=100 already establishes
# for a different unbounded-computation risk (there: recursion depth; here: combinatorial breadth). Atlas's
# own §11.11 worked example is 3^4=81 raw combinations -- 100,000 rejects only pathological input (e.g. 10
# dimensions x 10 options = 10,000,000,000), never real usage.

_DIMENSION_REQUIRED_KEYS = frozenset({"name", "options"})
_CONSTRAINT_REQUIRED_KEYS = frozenset({"dimension_a", "option_a", "dimension_b", "option_b"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _dimension_shape_ok(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _DIMENSION_REQUIRED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("name")):
        return False
    options = entry.get("options")
    return isinstance(options, list) and bool(options) and all(_is_nonempty_str(o) for o in options)


def _dimensions_are_valid(dimensions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other. Real invariant: a list of at least ``MIN_DIMENSIONS`` well-shaped ``{name, options}`` entries,
    every ``name`` unique across the whole list, every dimension's ``options`` at least
    ``MIN_OPTIONS_PER_DIMENSION`` unique non-empty strings."""
    if not isinstance(dimensions, list) or len(dimensions) < MIN_DIMENSIONS:
        return False, "TOO_FEW"
    names_seen: set[str] = set()
    for entry in dimensions:
        if not _dimension_shape_ok(entry):
            return False, "SHAPE"
        options = entry["options"]
        if len(options) < MIN_OPTIONS_PER_DIMENSION:
            return False, "TOO_FEW_OPTIONS"
        if len(set(options)) != len(options):
            return False, "DUPLICATE_OPTIONS"
        name = entry["name"]
        if name in names_seen:
            return False, "DUPLICATE_NAME"
        names_seen.add(name)
    return True, None


def _constraints_are_valid(constraints: Any, dimensions: list[dict[str, Any]]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. MUST be called only after ``dimensions`` has already passed
    ``_dimensions_are_valid`` (same "validate first, then cross-reference" split
    ``compute/attack_tree/aggregate.py``'s own SCOPE note establishes for its own already-shape-valid
    precondition). Real invariant: a (possibly empty) list of well-shaped ``{dimension_a, option_a,
    dimension_b, option_b}`` entries, each naming two DIFFERENT dimensions that both exist in ``dimensions``,
    each option genuinely belonging to its own named dimension's ``options``."""
    if not isinstance(constraints, list):
        return False, "SHAPE"
    options_by_dimension = {d["name"]: set(d["options"]) for d in dimensions}
    for entry in constraints:
        if not isinstance(entry, dict) or set(entry.keys()) != _CONSTRAINT_REQUIRED_KEYS:
            return False, "SHAPE"
        dimension_a, option_a, dimension_b, option_b = (entry["dimension_a"], entry["option_a"], entry["dimension_b"], entry["option_b"])
        if not all(_is_nonempty_str(v) for v in (dimension_a, option_a, dimension_b, option_b)):
            return False, "SHAPE"
        if dimension_a == dimension_b:
            return False, "SAME_DIMENSION"
        if dimension_a not in options_by_dimension or dimension_b not in options_by_dimension:
            return False, "UNKNOWN_DIMENSION"
        if option_a not in options_by_dimension[dimension_a] or option_b not in options_by_dimension[dimension_b]:
            return False, "UNKNOWN_OPTION"
    return True, None


def _raw_combination_space(dimensions: list[dict[str, Any]]) -> int:
    """The UNFILTERED cartesian-product size -- every dimension's own option count multiplied together.
    Computed over an already shape-valid ``dimensions`` (every dimension has >=1 option, so this is always
    well-defined; never called before ``_dimensions_are_valid`` has passed)."""
    return math.prod(len(d["options"]) for d in dimensions)


def generate_morphological_analysis_record(
    record_id: str,
    subject: str,
    dimensions: list[dict[str, Any]],
    constraints: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    informs_mcda_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/morphological-analysis-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before-
    construction" discipline every sibling module in this suite already establishes. ``legal_combinations``
    and ``legal_combination_count`` are NOT accepted parameters: both are ALWAYS computed here via
    ``generate_legal_combinations``, so there is no code path through which a caller could construct a
    record whose stored legal combinations disagree with its own dimensions/constraints (see module
    docstring, "structural point, taken literally"). ``constraints`` is required (MAY be an empty list) --
    Atlas's own step 3 ("建 compatibility constraints") is a mandatory step to consider even when the answer
    is "none apply", same required-but-possibly-empty convention ``security.attack_tree``'s own
    ``trust_boundaries``/``entry_points`` already establish.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MORPHANALYSIS_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MORPHANALYSIS_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"MORPHANALYSIS_EMPTY_SUBJECT: subject must be a non-empty string, got {subject!r}")
    if informs_mcda_ref is not None and not _is_nonempty_str(informs_mcda_ref):
        raise InvariantViolation(f"MORPHANALYSIS_INVALID_INFORMS_MCDA_REF: informs_mcda_ref, when present, must be a non-empty string, got {informs_mcda_ref!r}")

    dims_ok, dims_reason = _dimensions_are_valid(dimensions)
    if not dims_ok:
        if dims_reason == "TOO_FEW":
            raise InvariantViolation(
                f"MORPHANALYSIS_TOO_FEW_DIMENSIONS: dimensions must have at least {MIN_DIMENSIONS} entries (Atlas's own '多維' wording), got {dimensions!r}"
            )
        if dims_reason == "TOO_FEW_OPTIONS":
            raise InvariantViolation(f"MORPHANALYSIS_DIMENSION_TOO_FEW_OPTIONS: every dimension's options must have at least {MIN_OPTIONS_PER_DIMENSION} entries, got {dimensions!r}")
        if dims_reason == "DUPLICATE_OPTIONS":
            raise InvariantViolation(f"MORPHANALYSIS_DIMENSION_DUPLICATE_OPTIONS: every dimension's options must be unique, got {dimensions!r}")
        if dims_reason == "DUPLICATE_NAME":
            raise InvariantViolation(f"MORPHANALYSIS_DUPLICATE_DIMENSION_NAME: dimension names must be unique across the whole set, got {dimensions!r}")
        raise InvariantViolation(f"MORPHANALYSIS_INVALID_DIMENSION_SHAPE: dimensions must be a list of well-shaped {{name, options}} entries, got {dimensions!r}")

    constraints_ok, constraints_reason = _constraints_are_valid(constraints, dimensions)
    if not constraints_ok:
        if constraints_reason == "SAME_DIMENSION":
            raise InvariantViolation(f"MORPHANALYSIS_CONSTRAINT_SAME_DIMENSION: a constraint's dimension_a and dimension_b must be different, got {constraints!r}")
        if constraints_reason == "UNKNOWN_DIMENSION":
            raise InvariantViolation(f"MORPHANALYSIS_CONSTRAINT_UNKNOWN_DIMENSION: a constraint names a dimension not present in dimensions, got {constraints!r}")
        if constraints_reason == "UNKNOWN_OPTION":
            raise InvariantViolation(f"MORPHANALYSIS_CONSTRAINT_UNKNOWN_OPTION: a constraint names an option not present among its own dimension's options, got {constraints!r}")
        raise InvariantViolation(f"MORPHANALYSIS_INVALID_CONSTRAINT_SHAPE: constraints must be a list of well-shaped {{dimension_a, option_a, dimension_b, option_b}} entries, got {constraints!r}")

    raw_space = _raw_combination_space(dimensions)
    if raw_space > MAX_RAW_COMBINATION_SPACE:
        raise InvariantViolation(
            f"MORPHANALYSIS_COMBINATION_SPACE_TOO_LARGE: raw (unfiltered) cartesian product size {raw_space} exceeds MAX_RAW_COMBINATION_SPACE={MAX_RAW_COMBINATION_SPACE}, refused before generation"
        )

    legal_combinations = generate_legal_combinations(dimensions, constraints)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "dimensions": [{"name": d["name"], "options": list(d["options"])} for d in dimensions],
        "constraints": [{"dimension_a": c["dimension_a"], "option_a": c["option_a"], "dimension_b": c["dimension_b"], "option_b": c["option_b"]} for c in constraints],
        "legal_combinations": legal_combinations,
        "legal_combination_count": len(legal_combinations),
        "provenance": provenance,
    }
    if informs_mcda_ref is not None:
        record["informs_mcda_ref"] = informs_mcda_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid. Record-
    level only (not per-dimension) -- same convention ``security.attack_tree`` uses: dimensions/options here
    are an analytical design-space construction, not individually evidence-cited facts the way
    ``framing.five_w_one_h``'s own per-dimension KNOWN answers are."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_morphological_analysis_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored value and does NOT call ``generate_morphological_analysis_record``, so a hand-tampered record
    that bypassed the builder entirely is caught here exactly as a builder-refused one would have been. In
    particular, this is the ONLY place ``legal_combinations``/``legal_combination_count`` are checked against
    reality: re-derives them via ``generate_legal_combinations`` and compares to the stored values. Re-checks
    the ``MAX_RAW_COMBINATION_SPACE`` cap before attempting recomputation -- a record whose own dimensions
    would already blow the cap FAILS here rather than hanging on re-derivation. FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("morphological_analysis_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("morphological_analysis_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("morphological_analysis_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("morphological_analysis_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)
    ref = record.get("informs_mcda_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("morphological_analysis_integrity", False, [{"reason": "informs_mcda_ref present but not a non-empty string"}], validator, timestamp)

    dims_ok, dims_reason = _dimensions_are_valid(record.get("dimensions"))
    if not dims_ok:
        return _result("morphological_analysis_integrity", False, [{"reason": f"dimensions invalid ({dims_reason})"}], validator, timestamp)
    dimensions = record["dimensions"]

    constraints_ok, constraints_reason = _constraints_are_valid(record.get("constraints"), dimensions)
    if not constraints_ok:
        return _result("morphological_analysis_integrity", False, [{"reason": f"constraints invalid ({constraints_reason})"}], validator, timestamp)
    constraints = record["constraints"]

    raw_space = _raw_combination_space(dimensions)
    if raw_space > MAX_RAW_COMBINATION_SPACE:
        return _result(
            "morphological_analysis_integrity",
            False,
            [{"reason": f"raw combination space {raw_space} exceeds MAX_RAW_COMBINATION_SPACE={MAX_RAW_COMBINATION_SPACE}, refused before recomputation"}],
            validator,
            timestamp,
        )

    recomputed = generate_legal_combinations(dimensions, constraints)
    stored = record.get("legal_combinations")
    if not isinstance(stored, list) or stored != recomputed:
        return _result(
            "morphological_analysis_integrity",
            False,
            [{"reason": "MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH", "stored_count": len(stored) if isinstance(stored, list) else None, "recomputed_count": len(recomputed)}],
            validator,
            timestamp,
        )

    stored_count = record.get("legal_combination_count")
    if stored_count != len(recomputed):
        return _result(
            "morphological_analysis_integrity",
            False,
            [{"reason": "MORPHANALYSIS_LEGAL_COMBINATION_COUNT_MISMATCH", "stored": stored_count, "recomputed": len(recomputed)}],
            validator,
            timestamp,
        )

    return _result(
        "morphological_analysis_integrity",
        True,
        [{"dimension_count": len(dimensions), "constraint_count": len(constraints), "legal_combination_count": len(recomputed)}],
        validator,
        timestamp,
    )


def evaluate_morphological_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-integrity re-derivation (which also re-derives
    legal_combinations/legal_combination_count). No ``evidence_labeling_required`` gate -- the contract sets
    that quality flag false (see contract's own ``quality`` block)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_morphological_analysis_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
