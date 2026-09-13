"""``feasibility.tco`` -- F14 feasibility & economics family (Atlas L718-730, this method's own row L725), first
of 2 sibling methods built this batch (with ``feasibility.unit_economics``; 3 disjoint sibling agents build the
family's other 7 members concurrently).

Atlas F14 table row (L725, verbatim): "TCO｜全生命週期成本｜acquisition+implementation+operation+people+exit+
migration｜看出隱性成本與 lock-in". The dedicated §12.26 section (L2857-2873) gives the real, binding checklist
(a text fence, not the summary-table's own abbreviated pipeline text): Purchase, Implementation, Migration,
People, Operation, Support, Security, Compliance, Downtime, Exit, Data Egress, Decommission -- 12 named
categories, benefit "對 Cloud、SaaS、DB、Vendor lock-in 決策特別重要".

Real invariant: ALL 12 of §12.26's own categories must be explicitly present in ``cost_categories`` with a
real finite non-negative number (0 is a legal explicit value; a MISSING category is refused) -- structural
enforcement of §12.26's own stated benefit ("看出隱性成本"): an omitted category is exactly a hidden cost
slipping through unexamined, so requiring explicit presence forces the assessor to have actually considered
it. ``total_tco`` is GENUINE_COMPUTE (sum of all 12 category costs, never caller-supplied); independently
re-derived by ``evaluate_total_tco_integrity_gate``, which does not call the builder.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "TCO"/"total cost of ownership"/"total-cost-of-ownership" before writing any of this
method's own files: no prior TCO record shape, RECORD_ID_PREFIX, or method_id collision found (hits were only
this task's own brief and the Atlas table/section itself).
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.tco"
RECORD_ID_PREFIX = "TCO-"

# Atlas §12.26's own 12-category checklist (L2860-2872), transcribed in the same order, snake_case-transliterated
# for use as dict keys (disclosed compilation decision: "Data Egress" -> "data_egress", every other category is a
# single word lowercased). Every one of these 12 keys must be present in cost_categories -- no more, no fewer.
COST_CATEGORIES = ("purchase", "implementation", "migration", "people", "operation", "support", "security", "compliance", "downtime", "exit", "data_egress", "decommission")

# Compilation decision (disclosed): monetary totals are stored/compared at 2 decimal places (currency-style,
# distinct from this corpus's probability convention of round(x, 8)); gate re-derivation tolerance is 1e-6 --
# far tighter than the 0.01 stored unit, absorbing float summation noise (summing 12 doubles is well under
# 1e-6 in practice) without masking a real tamper at or above the stored precision.
_FLOAT_TOLERANCE = 1e-6

_STORED_KEYS = frozenset({"id", "version", "generated_by_method", "subject_ref", "cost_categories", "total_tco", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_cost_value(value: Any) -> bool:
    """A single cost_categories[...] value must be a real finite non-negative number. ``bool`` excluded (Python's
    ``bool`` is an ``int`` subclass -- the same documented trap ``stakeholders.game_theory``'s own corrected
    ``_is_number_excluding_bool`` guards against). ``int`` is unconditionally finite in Python and is
    range-checked directly rather than passed through ``math.isfinite`` (that raises ``OverflowError`` on a huge
    ``int`` -- a trap only reachable via the ``float`` branch)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return value >= 0
    if isinstance(value, float):
        return math.isfinite(value) and value >= 0.0
    return False


def _cost_categories_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped cost_categories object". Both ``generate_tco`` (builder)
    and ``evaluate_cost_category_completeness_gate`` (independent re-derivation) consult it, so the two layers
    cannot drift apart (same discipline ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes).
    Returns None when valid."""
    if not isinstance(value, dict):
        return f"cost_categories must be a dict, got {type(value).__name__}"
    declared = set(value.keys())
    required = set(COST_CATEGORIES)
    missing = sorted(required - declared)
    if missing:
        return f"missing cost category(ies) {missing} -- all 12 of Atlas section 12.26's own categories must be explicitly present (a hidden cost is exactly what an omitted category would let slip through unexamined)"
    unknown = sorted(declared - required)
    if unknown:
        return f"unknown cost category(ies) {unknown} -- must be exactly {sorted(required)}"
    invalid = sorted(key for key in COST_CATEGORIES if not _is_valid_cost_value(value.get(key)))
    if invalid:
        return f"cost category(ies) {invalid} must each be a real finite non-negative number (bool excluded), got {[value.get(k) for k in invalid]!r}"
    return None


def compute_total_tco(cost_categories: dict[str, Any]) -> float:
    """GENUINE_COMPUTE: sum of all 12 of section 12.26's own cost categories. Never accepted as an input --
    always derived here, and independently re-derived by ``evaluate_total_tco_integrity_gate``. Trusts its own
    argument is already a well-shaped ``cost_categories`` object (``_cost_categories_problem`` returns None) --
    callers validate before calling this, the same "pure compute, validated inputs only" boundary
    ``epistemic.bayesian_updating``'s own ``compute_posterior`` already establishes."""
    return round(sum(cost_categories[key] for key in COST_CATEGORIES), 2)


def generate_tco(
    record_id: str,
    subject_ref: str,
    cost_categories: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/total-cost-of-ownership.schema.yaml``.

    Deliberately has NO ``total_tco`` parameter -- GENUINE_COMPUTE via ``compute_total_tco``, never
    caller-supplied. Enforces every real invariant fail-closed, in order: id/version/provenance shape, then
    subject_ref, then ``cost_categories`` completeness (all 12 of section 12.26's own categories present, no
    unknown key, each a real finite non-negative number) via the single ``_cost_categories_problem`` predicate
    the gate also consults, then computes ``total_tco``.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TCO_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TCO_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TCO_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"TCO_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")

    problem = _cost_categories_problem(cost_categories)
    if problem is not None:
        raise InvariantViolation(f"TCO_INVALID_COST_CATEGORIES: {problem}")

    rebuilt_categories = copy.deepcopy({key: cost_categories[key] for key in COST_CATEGORIES})
    total_tco = compute_total_tco(rebuilt_categories)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "cost_categories": rebuilt_categories,
        "total_tco": total_tco,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_tco -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
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


def evaluate_cost_category_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives id/version/subject_ref shape AND full cost_categories completeness directly from raw fields --
    via the SAME ``_cost_categories_problem`` predicate the builder uses, so the two layers cannot silently
    diverge. Fails closed on malformed input rather than crashing (unknown/missing keys, non-dict
    cost_categories, non-dict record)."""
    if not isinstance(record, dict):
        return _result("cost_category_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    record_id = record.get("id")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a non-empty string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")
    if not _is_nonempty_str(record.get("subject_ref")):
        problems.append(f"subject_ref must be a non-empty string, got {record.get('subject_ref')!r}")
    cost_problem = _cost_categories_problem(record.get("cost_categories"))
    if cost_problem is not None:
        problems.append(cost_problem)
    passed = not problems
    return _result("cost_category_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_total_tco_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Independently re-sums the record's OWN stored ``cost_categories`` and compares to the stored
    ``total_tco`` within ``_FLOAT_TOLERANCE`` -- does NOT call ``generate_tco``, so a hand-tampered record (a
    spliced-in wrong ``total_tco``, or one whose stored categories are themselves malformed) is caught here
    exactly as a builder-refused one would have been. Fails closed rather than crashing when the categories are
    not well-shaped (the sum cannot be meaningfully re-derived from garbage)."""
    if not isinstance(record, dict):
        return _result("total_tco_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    cost_categories = record.get("cost_categories")
    cost_problem = _cost_categories_problem(cost_categories)
    if cost_problem is not None:
        return _result("total_tco_integrity", False, [{"reason": f"total_tco cannot be independently recomputed: {cost_problem}"}], validator, timestamp)

    expected_total = compute_total_tco(cost_categories)
    stored_total = record.get("total_tco")
    if not isinstance(stored_total, (int, float)) or isinstance(stored_total, bool) or abs(stored_total - expected_total) > _FLOAT_TOLERANCE:
        return _result("total_tco_integrity", False, [{"reason": f"total_tco={stored_total!r} does not match recomputed {expected_total!r} (tolerance {_FLOAT_TOLERANCE})"}], validator, timestamp)
    return _result("total_tco_integrity", True, [{"expected_total": expected_total}], validator, timestamp)


def evaluate_tco_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_cost_category_completeness_gate(record, validator, timestamp),
        evaluate_total_tco_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
