"""``experiment.smoke_test`` -- 2nd F15 `experiment` family member (Atlas L734-748), opened alongside
``experiment.fake_door``/``experiment.ab_test`` in the same batch (other F15 members built by
concurrent sibling agents, not in this module).

Atlas's own table row (L745, verbatim): "Smoke Test | 建置前測市場 | landing/ad/offer->signup/
preorder threshold | 快速驗證需求" (test the market before building; landing page/ad/offer ->
signup/preorder count vs a threshold; fast demand validation). F15's own shared core principle
(L750-752): find the CHEAPEST test that can FALSIFY a Critical Assumption. This method's own
falsifiable assumption is "the market will pay/sign up" -- and Atlas's own pipeline explicitly names
a THRESHOLD, not a bare count: a measured signup number with no pre-declared bar is a vanity metric,
not a decision instrument.

DISAMBIGUATION (task-mandated, disclosed here so a future reader does not conflate the two): this is
UNRELATED to this repo's own governance `scripts/smoke-test.ps1`/`/smoke-test` skill (VPS infra
health checks). Naming coincidence only -- different domain, no cross-reference.

Three real invariants, each enforced at TWO independent layers (construction-time builder AND an
independent gate re-deriving from raw fields), same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **Pre-registration** (``SMOKETEST_THRESHOLD_NOT_PREREGISTERED``) -- ``threshold_declared_at`` must
   be a real, parseable ISO-8601 timestamp STRICTLY EARLIER than ``measured_at``. A threshold declared
   after (or at the same instant as) the measurement is not a pre-declared go/no-go bar; it is a
   post-hoc rationalization of whatever number came in.
2. **Positive threshold** (``SMOKETEST_INVALID_THRESHOLD``) -- ``signup_or_preorder_threshold`` must
   be a positive integer. A threshold of zero (or negative) is not a real bar -- every outcome would
   pass it.
3. **Decision consistency** (``SMOKETEST_DECISION_INCONSISTENT``) -- ``decision`` must equal ``"GO"``
   when ``measured_signups >= threshold`` and ``"NO_GO"`` otherwise. The decision is the MECHANICAL
   consequence of the pre-registered rule applied to the real measurement, not a separate assertion a
   caller could set independently of the data.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "smoke test"/"smoketest" before
writing any of this method's own files: only hits were the repo's own unrelated
`scripts/smoke-test.ps1` governance skill and generic "smoke test" mentions inside other typed-object
descriptions (a testing-strategy noun, not this method) -- zero pre-existing implementation overlap.
"""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.smoke_test"
RECORD_ID_PREFIX = "SMOKETEST-"
_DECISIONS = frozenset({"GO", "NO_GO"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonnegative_int(value: Any) -> bool:
    """``bool`` excluded -- Python's ``bool`` is an ``int`` subclass, the same documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against."""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_positive_int(value: Any) -> bool:
    return _is_nonnegative_int(value) and value > 0


def _safe_parse_timestamp(value: Any) -> datetime | None:
    """Fail-closed wrapper around ``ai_lego.core.support.parse_timestamp``: construction call sites
    hand it already-shape-checked strings, but a GATE re-derives from raw, potentially hand-tampered
    fields with no such guarantee. Returns ``None`` (never a valid timestamp) on any parse failure or
    non-string input -- same idiom ``learning.ooda``'s own ``_safe_parse_timestamp`` establishes."""
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _expected_decision(measured_signups: int, threshold: int) -> str:
    return "GO" if measured_signups >= threshold else "NO_GO"


def _preregistration_problem(threshold_declared_at: Any, measured_at: Any) -> str | None:
    """The single definition of invariant #1. Shared by the builder and the gate so neither can drift
    from the other."""
    declared = _safe_parse_timestamp(threshold_declared_at)
    if declared is None:
        return f"threshold_declared_at must be a parseable ISO-8601 timestamp, got {threshold_declared_at!r}"
    measured = _safe_parse_timestamp(measured_at)
    if measured is None:
        return f"measured_at must be a parseable ISO-8601 timestamp, got {measured_at!r}"
    if not declared < measured:
        return f"threshold_declared_at ({declared.isoformat()}) must be strictly earlier than measured_at ({measured.isoformat()})"
    return None


def _threshold_problem(threshold: Any) -> str | None:
    """The single definition of invariant #2. Shared by the builder and the gate so neither can drift
    from the other."""
    if not _is_positive_int(threshold):
        return f"signup_or_preorder_threshold must be a positive int (bool excluded), got {threshold!r}"
    return None


def _decision_problem(decision: Any, measured_signups: Any, threshold: Any) -> str | None:
    """The single definition of invariant #3. Precondition: ``threshold`` already passed
    ``_threshold_problem`` and ``measured_signups`` is a non-negative int (the gate re-checks both
    itself before calling this, same precondition discipline ``root_cause.fault_tree``'s own
    ``_gate_mode_is_consistent`` documents)."""
    if decision not in _DECISIONS:
        return f"decision must be one of {sorted(_DECISIONS)}, got {decision!r}"
    expected = _expected_decision(measured_signups, threshold)
    if decision != expected:
        return f"decision {decision!r} is inconsistent with measured_signups={measured_signups!r} vs threshold={threshold!r} (expected {expected!r})"
    return None


def generate_smoke_test_experiment(
    record_id: str,
    offer_description: str,
    signup_or_preorder_threshold: int,
    threshold_declared_at: str,
    measured_signups: int,
    measured_at: str,
    decision: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/smoke-test-record.schema.yaml``. Enforces all three real invariants
    fail-closed, in order: id/version shape, field completeness, positive threshold, pre-registration
    ordering, decision consistency, then provenance -- BEFORE returning."""
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SMOKETEST_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SMOKETEST_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_nonempty_str(offer_description):
        raise InvariantViolation(f"SMOKETEST_EMPTY_OFFER_DESCRIPTION: offer_description must be a non-empty string, got {offer_description!r}")
    if not _is_nonnegative_int(measured_signups):
        raise InvariantViolation(f"SMOKETEST_INVALID_MEASURED_SIGNUPS: measured_signups must be a non-negative int (bool excluded), got {measured_signups!r}")

    threshold_problem = _threshold_problem(signup_or_preorder_threshold)
    if threshold_problem is not None:
        raise InvariantViolation(f"SMOKETEST_INVALID_THRESHOLD: {threshold_problem}")

    preregistration_problem = _preregistration_problem(threshold_declared_at, measured_at)
    if preregistration_problem is not None:
        raise InvariantViolation(
            f"SMOKETEST_THRESHOLD_NOT_PREREGISTERED: {preregistration_problem} -- Atlas L745's own threshold is a "
            "decision instrument only if fixed BEFORE results exist"
        )

    decision_problem = _decision_problem(decision, measured_signups, signup_or_preorder_threshold)
    if decision_problem is not None:
        raise InvariantViolation(f"SMOKETEST_DECISION_INCONSISTENT: {decision_problem}")

    if not provenance_is_valid(provenance):
        raise InvariantViolation("SMOKETEST_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "offer_description": offer_description,
        "signup_or_preorder_threshold": signup_or_preorder_threshold,
        "threshold_declared_at": threshold_declared_at,
        "measured_signups": measured_signups,
        "measured_at": measured_at,
        "decision": decision,
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


def evaluate_preregistration_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #1 and #2 directly from raw fields, using the SAME
    ``_preregistration_problem``/``_threshold_problem`` predicates the builder uses -- without this the
    gate could pass records the builder refuses. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("preregistration", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems = [p for p in (_threshold_problem(record.get("signup_or_preorder_threshold")), _preregistration_problem(record.get("threshold_declared_at"), record.get("measured_at"))) if p]
    return _result("preregistration", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_decision_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #3 directly from raw fields. Precondition: does NOT assume the
    preregistration gate already passed -- re-validates ``measured_signups``/``threshold`` shape itself
    before comparing, same defense-in-depth discipline every gate in this package uses. Fails closed on
    non-dict input or malformed supporting fields."""
    if not isinstance(record, dict):
        return _result("decision_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    measured_signups = record.get("measured_signups")
    threshold = record.get("signup_or_preorder_threshold")
    if not _is_nonnegative_int(measured_signups):
        return _result("decision_consistency", False, [{"reason": f"measured_signups invalid: {measured_signups!r}"}], validator, timestamp)
    if not _is_positive_int(threshold):
        return _result("decision_consistency", False, [{"reason": f"signup_or_preorder_threshold invalid: {threshold!r}"}], validator, timestamp)
    problem = _decision_problem(record.get("decision"), measured_signups, threshold)
    return _result("decision_consistency", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_smoke_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_preregistration_gate(record, validator, timestamp),
        evaluate_decision_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
