"""``foresight.cross_country_comparison`` -- F13 unknown-unknowns/foresight family (Atlas L668-685).

Atlas's own table row (L676, verbatim): "Cross-country Comparison | 比較制度/
市場差異 | comparable jurisdictions->normalize->compare | 找 local variation"
(compare comparable jurisdictions after normalizing, to find local variation).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders
discipline every prior slice in this corpus establishes:

1. **>=2 jurisdictions declared** (``XCOUNTRY_TOO_FEW_JURISDICTIONS``) -- a
   "comparison" of one jurisdiction is not a comparison.
2. **Every comparison declares a non-empty normalization_basis**
   (``XCOUNTRY_MISSING_NORMALIZATION_BASIS``) -- Atlas's own pipeline is
   "comparable jurisdictions->**normalize**->compare"; comparing raw
   cross-country figures with no stated basis (per-capita, PPP-adjusted,
   per-GDP, whatever) is precisely the error this pipeline stage exists to
   prevent.
3. **Referential integrity + no duplicate jurisdiction per comparison**
   (``XCOUNTRY_DANGLING_JURISDICTION_REF`` / ``XCOUNTRY_DUPLICATE_VALUE_
   JURISDICTION``) -- every ``values[].jurisdiction`` must resolve to a
   declared ``jurisdictions[]`` entry, and no jurisdiction may be asserted
   twice (possibly with conflicting values) within one comparison, the same
   authoring-error class ``epistemic.evidence_matrix``'s duplicate
   ``(claim_id, evidence_id)`` pair check and ``stakeholders.game_theory``'s
   duplicate payoff check already guard against.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"cross-country"/"cross country"/"jurisdiction" before writing any of this
method's own files: zero pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.cross_country_comparison"
RECORD_ID_PREFIX = "XCOUNTRY-"
_VALUE_KEYS = frozenset({"jurisdiction", "value"})
_COMPARISON_KEYS = frozenset({"metric", "normalization_basis", "values"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_number(value: Any) -> bool:
    """A value must be a real number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- see this
    corpus's own ``epistemic.bayesian_updating`` documented trap)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _value_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped values[] entry". Both ``_build_comparison`` (construction
    layer) and ``evaluate_comparison_integrity_gate`` (independent re-derivation layer) consult it -- the same
    single-shared-predicate discipline ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes, so the
    two layers cannot drift apart."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _VALUE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _VALUE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_VALUE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("jurisdiction")):
        return f"jurisdiction must be a non-empty string, got {value.get('jurisdiction')!r}"
    if not _is_valid_number(value.get("value")):
        return f"value must be a real number (bool excluded), got {value.get('value')!r}"
    return None


def _comparison_problem(value: Any) -> str | None:
    """Shared shape predicate for one ``comparisons[]`` entry (metric/normalization_basis/values shape only --
    NOT referential integrity against ``jurisdictions[]``, which needs the sibling array and is checked once in
    ``generate_cross_country_comparison``/the gate, same division of labor ``epistemic.evidence_matrix``'s
    ``link()``/``generate_evidence_matrix`` split already establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _COMPARISON_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _COMPARISON_KEYS <= value.keys():
        return f"missing key(s) {sorted(_COMPARISON_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("metric")):
        return f"metric must be a non-empty string, got {value.get('metric')!r}"
    if not _is_nonempty_str(value.get("normalization_basis")):
        return f"normalization_basis must be a non-empty string, got {value.get('normalization_basis')!r}"
    values = value.get("values")
    if not isinstance(values, list) or not values:
        return "values must be a non-empty list"
    for i, v in enumerate(values):
        problem = _value_problem(v)
        if problem is not None:
            return f"values[{i}]: {problem}"
    return None


def generate_cross_country_comparison(
    record_id: str,
    jurisdictions: list[str],
    comparisons: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cross-country-comparison.schema.yaml``.

    Deep-copies every input list (never a shallow ``dict()``/``list()`` copy -- ``comparisons[].values[]`` is a
    nested list, the same aliasing trap ``epistemic.evidence_matrix``'s own module docstring documents), then
    enforces all real invariants fail-closed, in order: id/version/provenance shape, >=2 jurisdictions, >=1
    comparison each with a non-empty normalization_basis and well-shaped values, referential integrity of every
    ``values[].jurisdiction`` against declared ``jurisdictions[]``, and no duplicate jurisdiction within one
    comparison's ``values[]`` -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"XCOUNTRY_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"XCOUNTRY_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("XCOUNTRY_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(jurisdictions, list):
        raise InvariantViolation(f"XCOUNTRY_INVALID_JURISDICTIONS: jurisdictions must be a list, got {type(jurisdictions).__name__}")
    rebuilt_jurisdictions: list[str] = []
    for i, j in enumerate(jurisdictions):
        if not _is_nonempty_str(j):
            raise InvariantViolation(f"XCOUNTRY_INVALID_JURISDICTION: jurisdictions[{i}] must be a non-empty string, got {j!r}")
        rebuilt_jurisdictions.append(j)
    if len(set(rebuilt_jurisdictions)) < 2:
        raise InvariantViolation(f"XCOUNTRY_TOO_FEW_JURISDICTIONS: at least 2 distinct jurisdictions are required, got {rebuilt_jurisdictions!r} -- a comparison of one jurisdiction is not a comparison")
    if len(rebuilt_jurisdictions) != len(set(rebuilt_jurisdictions)):
        raise InvariantViolation(f"XCOUNTRY_DUPLICATE_JURISDICTION: jurisdictions must not repeat, got {rebuilt_jurisdictions!r}")

    if not isinstance(comparisons, list) or not comparisons:
        raise InvariantViolation("XCOUNTRY_NO_COMPARISONS: at least 1 comparison is required")
    jurisdiction_set = set(rebuilt_jurisdictions)
    rebuilt_comparisons: list[dict[str, Any]] = []
    for i, c in enumerate(comparisons):
        problem = _comparison_problem(c)
        if problem is not None:
            raise InvariantViolation(f"XCOUNTRY_INVALID_COMPARISON: comparisons[{i}]: {problem}")
        rebuilt = copy.deepcopy(c)
        value_jurisdictions = [v["jurisdiction"] for v in rebuilt["values"]]
        dangling = sorted(set(value_jurisdictions) - jurisdiction_set)
        if dangling:
            raise InvariantViolation(f"XCOUNTRY_DANGLING_JURISDICTION_REF: comparisons[{i}] ('{rebuilt['metric']}') values[] reference jurisdiction(s) {dangling} not present in jurisdictions[]")
        duplicate = sorted({j for j in value_jurisdictions if value_jurisdictions.count(j) > 1})
        if duplicate:
            raise InvariantViolation(f"XCOUNTRY_DUPLICATE_VALUE_JURISDICTION: comparisons[{i}] ('{rebuilt['metric']}') values[] assert jurisdiction(s) {duplicate} more than once")
        rebuilt_comparisons.append(rebuilt)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "jurisdictions": rebuilt_jurisdictions,
        "comparisons": rebuilt_comparisons,
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


def evaluate_comparison_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant directly from raw fields -- not just trusting that
    ``generate_cross_country_comparison``'s own construction-time check already ran (a hand-tampered record must
    still be caught). Fails closed on malformed entries rather than crashing, using the SAME ``_value_problem``/
    ``_comparison_problem`` predicates the builder uses -- without this the gate could pass records the builder
    refuses (the exact drift class a critic pass found in ``epistemic.evidence_matrix``'s precedent)."""
    if not isinstance(record, dict):
        return _result("comparison_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    jurisdictions = record.get("jurisdictions")
    jurisdiction_set: set[Any] = set()
    if isinstance(jurisdictions, list) and all(isinstance(j, str) and j.strip() for j in jurisdictions):
        jurisdiction_set = set(jurisdictions)
        if len(jurisdiction_set) < 2:
            problems.append(f"fewer than 2 distinct jurisdictions: {jurisdictions!r}")
        if len(jurisdictions) != len(jurisdiction_set):
            problems.append(f"duplicate jurisdiction in jurisdictions[]: {jurisdictions!r}")
    else:
        problems.append("jurisdictions must be a list of non-empty strings")

    comparisons = record.get("comparisons")
    if not isinstance(comparisons, list) or not comparisons:
        problems.append("comparisons must be a non-empty list")
    else:
        for i, c in enumerate(comparisons):
            shape_problem = _comparison_problem(c)
            if shape_problem is not None:
                problems.append(f"comparisons[{i}]: {shape_problem}")
                continue
            value_jurisdictions = [v["jurisdiction"] for v in c["values"]]
            dangling = sorted(set(value_jurisdictions) - jurisdiction_set, key=repr)
            if dangling:
                problems.append(f"comparisons[{i}]: dangling jurisdiction ref(s) {dangling}")
            duplicate = sorted({j for j in value_jurisdictions if value_jurisdictions.count(j) > 1}, key=repr)
            if duplicate:
                problems.append(f"comparisons[{i}]: duplicate value jurisdiction(s) {duplicate}")

    passed = not problems
    return _result("comparison_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_cross_country_comparison_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_comparison_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
