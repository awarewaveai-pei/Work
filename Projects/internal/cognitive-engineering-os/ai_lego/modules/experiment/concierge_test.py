"""``experiment.concierge_test`` -- F15 experiment & validation family (Atlas L742).

Atlas's own table row (L742, verbatim): "Concierge Test | 人工先提供服務 |
manual service->measure use/pay | 先驗證價值再自動化" (deliver the service by
hand first; manual service->measure use/pay; validate value before
automating).

F15's shared core principle (Atlas L750-752, verbatim): 找到「最便宜且足以證偽
Critical Assumption 的測試」，而不是讓 AI 主觀打 8.7/10 (find the cheapest test
sufficient to falsify the Critical Assumption, not a subjective AI score).
Operationalized here for the Critical Assumption a Concierge Test falsifies
-- "customers actually want/will pay for this VALUE, independent of how it
gets delivered" -- via two structural halves that mirror the row's own
two-stage pipeline:

1. **Zero automation** (``CONCIERGE_NOT_MANUAL``) -- ``manual_delivery.
   automation_components`` must be an empty list. Atlas's own "人工" (manual)
   half is not a label to assert, it is a scope to enumerate and then check
   is empty -- a record declaring even one automation component was not
   manually delivered, and automating anything before the value assumption
   is confirmed is exactly the premature investment this method exists to
   avoid.
2. **Measured signal required, THE real invariant this method exists to
   enforce** (``CONCIERGE_TOO_FEW_MEASUREMENTS`` / ``CONCIERGE_INVALID_
   MEASUREMENT``) -- at least one well-shaped ``measurements[]`` entry (a
   real, finite, non-negative value over a positive sample size). Atlas's
   own benefit is "先驗證價值" (validate value FIRST) -- a concierge test
   with zero measured usage/willingness-to-pay signal never validated
   anything; it is just doing the work manually with no falsification test
   attached.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"concierge test"/"concierge_test"/"manual service" before writing any of
this method's own files: zero pre-existing implementation or schema title
overlap.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.concierge_test"
RECORD_ID_PREFIX = "CONCIERGE-"

_MANUAL_DELIVERY_KEYS = frozenset({"delivered_by", "automation_components"})
_MEASUREMENT_METRIC_TYPES = frozenset({"USAGE_COUNT", "WILLINGNESS_TO_PAY_AMOUNT"})
_MEASUREMENT_KEYS = frozenset({"metric_type", "value", "unit", "sample_size", "measured_at"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _safe_parse_timestamp(value: Any):
    """Fail-closed wrapper around ``ai_lego.core.support.parse_timestamp`` -- see
    ``experiment.technical_spike``'s own identical helper for the two-layer rationale."""
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _is_valid_nonnegative_number(value: Any) -> bool:
    """A measurement value must be a real, finite, non-negative number. ``bool`` excluded (Python's ``bool``
    is an ``int`` subclass -- see this corpus's own ``epistemic.bayesian_updating`` documented trap)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return value >= 0
    if isinstance(value, float):
        return math.isfinite(value) and value >= 0.0
    return False


def _is_valid_sample_size(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    return isinstance(value, int) and value >= 1


def _manual_delivery_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _MANUAL_DELIVERY_KEYS:
        return False
    if not _is_nonempty_str(value.get("delivered_by")):
        return False
    components = value.get("automation_components")
    return isinstance(components, list) and all(isinstance(c, str) for c in components)


def _manual_delivery_is_fully_manual(value: dict[str, Any]) -> bool:
    """THE real invariant's first half. Precondition: ``_manual_delivery_shape_is_valid`` already True. True
    iff zero automation components are declared -- Atlas's own '人工先提供服務' with no automation in scope."""
    return len(value["automation_components"]) == 0


def _measurement_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _MEASUREMENT_KEYS:
        return False
    if value.get("metric_type") not in _MEASUREMENT_METRIC_TYPES:
        return False
    if not _is_valid_nonnegative_number(value.get("value")):
        return False
    if not _is_nonempty_str(value.get("unit")):
        return False
    if not _is_valid_sample_size(value.get("sample_size")):
        return False
    return _safe_parse_timestamp(value.get("measured_at")) is not None


def measurement(metric_type: str, value: float, unit: str, sample_size: int, measured_at: str) -> dict[str, Any]:
    """One item of ``typed-objects/concierge-test-record.schema.yaml#/properties/measurements``."""
    record = {"metric_type": metric_type, "value": value, "unit": unit, "sample_size": sample_size, "measured_at": measured_at}
    if not _measurement_shape_is_valid(record):
        raise InvariantViolation(
            f"CONCIERGE_INVALID_MEASUREMENT: metric_type must be one of {sorted(_MEASUREMENT_METRIC_TYPES)}, "
            f"value a real finite non-negative number, unit a non-empty string, sample_size a positive int "
            f"(bool excluded), measured_at a parseable timestamp -- got {record!r}"
        )
    return record


def generate_concierge_test_record(
    record_id: str,
    service_description: str,
    manual_delivery: dict[str, Any],
    measurements: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/concierge-test-record.schema.yaml``.

    Rebuilds ``measurements[]`` via ``measurement()`` (never trusting the caller's raw dicts), then enforces
    the method contract's own real invariants fail-closed, in order: id/version/provenance shape, non-empty
    service_description, manual_delivery shape + zero-automation, and -- the invariant this method exists to
    enforce -- at least one well-shaped measured signal -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CONCIERGE_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CONCIERGE_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CONCIERGE_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(service_description):
        raise InvariantViolation(f"CONCIERGE_EMPTY_SERVICE_DESCRIPTION: service_description must be a non-empty string, got {service_description!r}")

    if not _manual_delivery_shape_is_valid(manual_delivery):
        raise InvariantViolation(
            f"CONCIERGE_INVALID_MANUAL_DELIVERY: manual_delivery must be a dict with exactly {sorted(_MANUAL_DELIVERY_KEYS)}, "
            f"delivered_by a non-empty string, automation_components a list of strings, got {manual_delivery!r}"
        )
    if not _manual_delivery_is_fully_manual(manual_delivery):
        raise InvariantViolation(
            f"CONCIERGE_NOT_MANUAL: automation_components must be empty for a Concierge Test, got "
            f"{manual_delivery['automation_components']!r} -- Atlas L742's own '人工先提供服務' requires zero "
            f"automation in the declared scope"
        )

    if not isinstance(measurements, list) or not measurements:
        raise InvariantViolation(f"CONCIERGE_TOO_FEW_MEASUREMENTS: at least 1 measured usage/willingness-to-pay signal is required, got {measurements!r}")
    rebuilt_measurements: list[dict[str, Any]] = []
    for i, m in enumerate(measurements):
        if not isinstance(m, dict):
            raise InvariantViolation(f"CONCIERGE_INVALID_MEASUREMENT: measurements[{i}] must be a dict, got {m!r}")
        try:
            rebuilt_measurements.append(measurement(m.get("metric_type"), m.get("value"), m.get("unit"), m.get("sample_size"), m.get("measured_at")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CONCIERGE_INVALID_MEASUREMENT: measurements[{i}]: {error}") from error

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "service_description": service_description,
        "manual_delivery": {"delivered_by": manual_delivery["delivered_by"], "automation_components": list(manual_delivery["automation_components"])},
        "measurements": rebuilt_measurements,
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


def evaluate_manual_delivery_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the zero-automation invariant directly from raw fields using the SAME
    ``_manual_delivery_shape_is_valid``/``_manual_delivery_is_fully_manual`` predicates the builder uses.
    Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("manual_delivery_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    manual_delivery = record.get("manual_delivery")
    if not _manual_delivery_shape_is_valid(manual_delivery):
        return _result("manual_delivery_integrity", False, [{"reason": "manual_delivery missing or malformed"}], validator, timestamp)
    fully_manual = _manual_delivery_is_fully_manual(manual_delivery)
    return _result("manual_delivery_integrity", fully_manual, [{"automation_components": manual_delivery["automation_components"]}], validator, timestamp)


def evaluate_measurement_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives THE real invariant directly from raw fields using the SAME ``_measurement_shape_is_valid``
    predicate the builder uses. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("measurement_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    measurements = record.get("measurements")
    if not isinstance(measurements, list) or not measurements:
        return _result("measurement_integrity", False, [{"reason": "measurements[] missing or empty"}], validator, timestamp)
    malformed_indices = [i for i, m in enumerate(measurements) if not _measurement_shape_is_valid(m)]
    return _result("measurement_integrity", not malformed_indices, [{"malformed_indices": malformed_indices}], validator, timestamp)


def evaluate_concierge_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_manual_delivery_integrity_gate(record, validator, timestamp),
        evaluate_measurement_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
