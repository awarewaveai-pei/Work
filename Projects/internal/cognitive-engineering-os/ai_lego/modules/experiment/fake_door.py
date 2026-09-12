"""``experiment.fake_door`` -- 1st F15 `experiment` family member (Atlas L734-748), opened alongside
``experiment.smoke_test``/``experiment.ab_test`` in the same batch (other 8 F15 members built by
concurrent sibling agents, not in this module).

Atlas's own table row (L744, verbatim): "Fake Door | 測 feature demand | CTA->click->告知尚未開放->
measure | 低成本量化需求" (measure feature demand; CTA -> click -> disclose not-yet-available ->
measure; low-cost quantified demand). F15's own shared core principle (L750-752): find the CHEAPEST
test that can FALSIFY a Critical Assumption, not let an AI subjectively score it 8.7/10 -- this
method's own falsifiable assumption is "users want this feature enough to click", and Atlas's own
pipeline names disclosure as a MANDATORY middle step, not optional narrative color.

Two real invariants, each enforced at TWO independent layers (construction-time builder AND an
independent gate re-deriving from raw fields), same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **Disclosure honesty** (``FAKEDOOR_NOT_DISCLOSED``) -- ``disclosure_shown`` must be exactly
   ``True`` and ``disclosure_text`` must be a non-empty string. Atlas's own pipeline stage
   "告知尚未開放" (disclose: not yet available) is not optional -- a Fake Door that lets a user
   believe a feature is real and available is dark-pattern deception, not a validated demand
   experiment. Enforced as a RUNTIME invariant, not a schema `const: true`, keeping this module the
   single enforcement point (same choice ``framing.smart`` makes for its own date validity despite a
   schema `format` annotation existing too).
2. **Measurement integrity** (``FAKEDOOR_INVALID_MEASUREMENT``) -- ``click_count`` and
   ``impression_count`` must both be non-negative integers with ``click_count <= impression_count``
   -- Atlas's own "measure" pipeline stage requires a REAL count, and a click count exceeding its own
   impression count is not a measurement of anything real.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "fake door"/"fakedoor" before
writing any of this method's own files: zero pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.fake_door"
RECORD_ID_PREFIX = "FAKEDOOR-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonnegative_int(value: Any) -> bool:
    """``bool`` excluded -- Python's ``bool`` is an ``int`` subclass, the same documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against."""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _disclosure_problem(disclosure_shown: Any, disclosure_text: Any) -> str | None:
    """The single definition of invariant #1 ("is this a genuinely disclosed Fake Door"). Shared by
    the builder and the gate so neither can drift from the other."""
    if disclosure_shown is not True:
        return f"disclosure_shown must be exactly True, got {disclosure_shown!r}"
    if not _is_nonempty_str(disclosure_text):
        return f"disclosure_text must be a non-empty string, got {disclosure_text!r}"
    return None


def _measurement_problem(click_count: Any, impression_count: Any) -> str | None:
    """The single definition of invariant #2 ("is this a real measurement"). Shared by the builder
    and the gate so neither can drift from the other."""
    if not _is_nonnegative_int(impression_count):
        return f"impression_count must be a non-negative int (bool excluded), got {impression_count!r}"
    if not _is_nonnegative_int(click_count):
        return f"click_count must be a non-negative int (bool excluded), got {click_count!r}"
    if click_count > impression_count:
        return f"click_count ({click_count}) must be <= impression_count ({impression_count})"
    return None


def generate_fake_door_experiment(
    record_id: str,
    feature_under_test: str,
    cta_copy: str,
    disclosure_shown: bool,
    disclosure_text: str,
    impression_count: int,
    click_count: int,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/fake-door-record.schema.yaml``. Enforces both real invariants
    fail-closed, in order: id/version shape, field completeness, disclosure honesty, measurement
    integrity, then provenance -- BEFORE returning."""
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FAKEDOOR_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FAKEDOOR_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_nonempty_str(feature_under_test):
        raise InvariantViolation(f"FAKEDOOR_EMPTY_FEATURE_UNDER_TEST: feature_under_test must be a non-empty string, got {feature_under_test!r}")
    if not _is_nonempty_str(cta_copy):
        raise InvariantViolation(f"FAKEDOOR_EMPTY_CTA_COPY: cta_copy must be a non-empty string, got {cta_copy!r}")

    disclosure_problem = _disclosure_problem(disclosure_shown, disclosure_text)
    if disclosure_problem is not None:
        raise InvariantViolation(
            f"FAKEDOOR_NOT_DISCLOSED: {disclosure_problem} -- Atlas L744's own '告知尚未開放' pipeline stage is "
            "mandatory; a Fake Door that does not disclose the feature is not yet available is dark-pattern "
            "deception, not a validated demand experiment"
        )

    measurement_problem = _measurement_problem(click_count, impression_count)
    if measurement_problem is not None:
        raise InvariantViolation(f"FAKEDOOR_INVALID_MEASUREMENT: {measurement_problem}")

    if not provenance_is_valid(provenance):
        raise InvariantViolation("FAKEDOOR_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "feature_under_test": feature_under_test,
        "cta_copy": cta_copy,
        "disclosure_shown": disclosure_shown,
        "disclosure_text": disclosure_text,
        "impression_count": impression_count,
        "click_count": click_count,
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


def evaluate_disclosure_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #1 directly from raw fields, using the SAME ``_disclosure_problem``
    predicate the builder uses -- without this the gate could pass records the builder refuses.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("disclosure", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _disclosure_problem(record.get("disclosure_shown"), record.get("disclosure_text"))
    return _result("disclosure", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_measurement_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #2 directly from raw fields, using the SAME ``_measurement_problem``
    predicate the builder uses. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("measurement_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _measurement_problem(record.get("click_count"), record.get("impression_count"))
    return _result("measurement_integrity", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_fake_door_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_disclosure_gate(record, validator, timestamp),
        evaluate_measurement_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
