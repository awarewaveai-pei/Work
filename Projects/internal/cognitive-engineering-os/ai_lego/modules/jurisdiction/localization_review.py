"""``jurisdiction.localization_review`` -- F23 Global Jurisdiction/Compliance/Localization family
(Atlas L940, §12.43 L3138-3159).

Atlas's own table row (L940, verbatim): "Localization Review | 檢查語言/貨幣/單位/時區/UX |
locale→format→content→accessibility→QA | 不把翻譯當在地化" (check language/currency/units/timezone/
UX via a locale->format->content->accessibility->QA pipeline; benefit: don't mistake translation
for localization). Dedicated §12.43 (L3138-3159) names 13 required dimensions, verbatim order
(L3144-3156): Language, Date/Time, Timezone, Currency, Number Format, Units, Address, Name, Phone,
Tax, UI Layout, Accessibility, Content Expectations. Benefit (L3159): "讓 Global Core 真正可被
local market 使用" (make the Global Core genuinely usable by the local market).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline
``delivery.definition_of_done`` (F22, this corpus's own 12-dimension precedent) already
establishes:

1. **Dimension completeness** (``LOCREVIEW_INVALID_DIMENSIONS``) -- ``dimensions`` must declare
   EXACTLY the 13 §12.43 dimensions (no missing, no extra), each with a valid ``status`` and a
   non-empty ``note``. A record declaring only "language" (i.e. just translation) is exactly the
   "不把翻譯當在地化" (don't mistake translation for localization) anti-pattern L940's own benefit
   column names, refused rather than silently accepted.
2. **Status derivation, THE real invariant this method exists to enforce**
   (``LOCREVIEW_STATUS_INCONSISTENT``) -- ``overall_status`` must equal the mechanical
   recomputation from the 13 dimension statuses (READY iff every dimension is MET or
   NOT_APPLICABLE), never an asserted narrative override.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"localization"/"localization_review"/"LOCREVIEW" before writing any of this method's own files:
zero pre-existing implementation or schema title overlap (only method-inventory.yaml's own
`pending` placeholder row at L1483-1487 existed).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.localization_review"
RECORD_ID_PREFIX = "LOCREVIEW-"

# Verbatim order, Atlas §12.43 L3144-3156.
DIMENSIONS: tuple[str, ...] = (
    "language",
    "date_time",
    "timezone",
    "currency",
    "number_format",
    "units",
    "address",
    "name",
    "phone",
    "tax",
    "ui_layout",
    "accessibility",
    "content_expectations",
)
_DIMENSION_SET = frozenset(DIMENSIONS)
_STATUSES = frozenset({"MET", "NOT_MET", "NOT_APPLICABLE"})
_DIMENSION_ENTRY_KEYS = frozenset({"status", "note"})
_SATISFYING_STATUSES = frozenset({"MET", "NOT_APPLICABLE"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _dimension_entry_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped dimension entry". Both ``dimension_entry()``
    (construction layer) and both gates (independent re-derivation layer) consult it, same single-
    shared-predicate discipline ``delivery.definition_of_done``'s own ``_dimension_entry_problem``
    establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _DIMENSION_ENTRY_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _DIMENSION_ENTRY_KEYS <= value.keys():
        return f"missing key(s) {sorted(_DIMENSION_ENTRY_KEYS - value.keys(), key=repr)}"
    if value.get("status") not in _STATUSES:
        return f"status must be one of {sorted(_STATUSES)}, got {value.get('status')!r}"
    if not _is_nonempty_str(value.get("note")):
        return f"note must be a non-empty string, got {value.get('note')!r}"
    return None


def dimension_entry(status: str, note: str) -> dict[str, Any]:
    """One item of ``typed-objects/localization-review-record.schema.yaml#/dimension_entry``."""
    record = {"status": status, "note": note}
    problem = _dimension_entry_problem(record)
    if problem is not None:
        raise InvariantViolation(f"LOCREVIEW_INVALID_DIMENSION: {problem}")
    return record


def _dimensions_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped dimensions map" -- EXACTLY the 13 §12.43
    keys, each a well-shaped entry. Shared by the builder and both gates, so the gates can never
    be laxer than construction."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _DIMENSION_SET
    if unknown:
        return f"unknown dimension(s) {sorted(unknown, key=repr)} -- only the 13 §12.43 dimensions are permitted"
    missing = _DIMENSION_SET - set(value.keys())
    if missing:
        return f"missing dimension(s) {sorted(missing, key=repr)} -- all 13 §12.43 dimensions must be declared"
    for name in DIMENSIONS:
        problem = _dimension_entry_problem(value.get(name))
        if problem is not None:
            return f"dimensions[{name!r}]: {problem}"
    return None


def _derive_overall_status(dimensions: dict[str, dict[str, Any]]) -> str:
    """§12.43's own benefit ("讓 Global Core 真正可被 local market 使用") made structural: READY iff
    every one of the 13 dimensions is MET or NOT_APPLICABLE. Callers may NEVER pass
    ``overall_status`` directly -- it is not a parameter of ``generate_localization_review`` at
    all, same derive-never-accept discipline ``delivery.definition_of_done``'s own
    ``_derive_overall_status`` already establishes."""
    return "READY" if all(dimensions[name]["status"] in _SATISFYING_STATUSES for name in DIMENSIONS) else "NOT_READY"


def generate_localization_review(
    record_id: str,
    target: str,
    dimensions: dict[str, dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/localization-review-record.schema.yaml``.

    Rebuilds every ``dimensions[]`` entry via ``dimension_entry()`` (never trusting the caller's
    raw dicts), then enforces the method contract's own real invariants fail-closed, in order:
    id/version/provenance shape, non-empty target, exactly the 13 §12.43 dimensions declared and
    well-shaped -- and, the invariant this method exists to enforce, ``overall_status`` is
    DERIVED here (never accepted as a parameter) from the 13 dimension statuses, so the returned
    record can never carry a narrative override of its own gate.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LOCREVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LOCREVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("LOCREVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(target):
        raise InvariantViolation(f"LOCREVIEW_INVALID_TARGET: target must be a non-empty string, got {target!r}")

    problem = _dimensions_problem(dimensions)
    if problem is not None:
        raise InvariantViolation(f"LOCREVIEW_INVALID_DIMENSIONS: {problem}")

    rebuilt_dimensions = {name: dimension_entry(dimensions[name]["status"], dimensions[name]["note"]) for name in DIMENSIONS}
    overall_status = _derive_overall_status(rebuilt_dimensions)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "target": target,
        "dimensions": rebuilt_dimensions,
        "overall_status": overall_status,
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


def evaluate_dimension_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives dimension completeness directly from raw fields using the SAME
    ``_dimensions_problem`` predicate the builder uses -- without this the gate could pass a
    hand-tampered record missing a dimension the builder would have refused."""
    if not isinstance(record, dict):
        return _result("dimension_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _dimensions_problem(record.get("dimensions"))
    return _result("dimension_completeness", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_status_derivation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives §12.43's own READY/NOT_READY rule directly from raw fields -- recomputes
    overall_status from dimensions and compares against the record's own claimed overall_status.
    Fails closed on malformed entries rather than crashing, and does NOT trust that the builder's
    own derivation already ran (a hand-tampered overall_status bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("status_derivation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    dimensions = record.get("dimensions")
    if _dimensions_problem(dimensions) is not None:
        return _result("status_derivation", False, [{"reason": "dimensions is missing or malformed"}], validator, timestamp)
    expected = _derive_overall_status(dimensions)
    actual = record.get("overall_status")
    passed = actual == expected
    return _result("status_derivation", passed, [{"expected": expected, "actual": actual}], validator, timestamp)


def evaluate_localization_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_dimension_completeness_gate(record, validator, timestamp),
        evaluate_status_derivation_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
