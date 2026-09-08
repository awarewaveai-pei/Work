"""``devops_sre.error_budget`` -- twenty-fourth Method Atlas slice, fifth from the `devops_sre` family.

Atlas §11.40's own second benefit bullet (L2156, "Error budget burn 太快
時自動降低 release risk" -- burn too fast, automatically lower release
risk) directly implies a real invariant this module enforces: a record
whose computed ``burn_rate`` has reached or exceeded the budget
(``budget_exhausted: true``) cannot claim ``release_policy: unrestricted``
-- same "raise before construction on a real, Atlas-implied structural
rule" discipline every prior forbidden-state guard this session built
already established.

Structurally closer to ``root_cause.pareto``/``decision.ahp``/
``decision.mcda`` than to its own ``devops_sre`` siblings:
``error_budget_ratio`` and ``burn_rate`` are CALCULATED_RESULT, real
deterministic compute (``ai_lego/compute/error_budget/budget.py``), not a
narrative claim a caller asserts -- ``evaluate_genuine_compute_gate``
therefore reuses ``modules.research.gates.evaluate_statistical_gate``
UNCHANGED, a fourth reuse of that same gate (after pareto/ahp/mcda).

``evaluate_exhausted_forbids_unrestricted_gate`` RE-DERIVES
``budget_exhausted`` from the record's own raw ``slo_target_ratio``/
``observed_failure_rate`` fields rather than trusting the stored
``budget_exhausted``/``burn_rate``/``error_budget_ratio`` fields -- a
gate that only re-reads the builder's own computed boolean would pass a
record hand-tampered to HIDE exhaustion (flip ``budget_exhausted`` to
``false`` and ``release_policy`` to ``unrestricted`` together), which is
exactly the direction an attacker or a buggy producer would take. Real
independent re-derivation, not "trust but re-display", is what makes this
gate a genuine second check.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.error_budget.budget import calculate_burn_rate, calculate_error_budget_ratio
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "devops_sre.error_budget"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.error_budget.budget.calculate_burn_rate"
VALID_RELEASE_POLICIES = frozenset({"unrestricted", "frozen"})
BUDGET_EXHAUSTED_THRESHOLD = 1.0


def generate_error_budget_record(
    record_id: str,
    service_under_measurement: str,
    slo_target_ratio: float,
    observed_failure_rate: float,
    release_policy: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    related_slo_id: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/error-budget-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: service_under_measurement non-empty, release_policy valid,
    observed_failure_rate within [0, 1], and budget_exhausted:true (computed: burn_rate >= 1.0) forbids
    release_policy:unrestricted. ``error_budget_ratio``/``burn_rate`` are always COMPUTED here via
    ``ai_lego.compute.error_budget.budget``, never caller-supplied -- the same Trusted Compute discipline
    every prior CALCULATED_RESULT method in this package already established."""
    if not service_under_measurement or not service_under_measurement.strip():
        raise InvariantViolation("ERRORBUDGET_EMPTY_SERVICE: service_under_measurement must be non-empty")
    if release_policy not in VALID_RELEASE_POLICIES:
        raise InvariantViolation(f"ERRORBUDGET_INVALID_RELEASE_POLICY: {release_policy!r} not in {sorted(VALID_RELEASE_POLICIES)}")
    if not (0 <= observed_failure_rate <= 1):
        raise InvariantViolation(f"ERRORBUDGET_FAILURE_RATE_OUT_OF_RANGE: observed_failure_rate must be between 0 and 1 inclusive, got {observed_failure_rate!r}")

    error_budget_ratio = calculate_error_budget_ratio(slo_target_ratio)
    burn_rate = calculate_burn_rate(observed_failure_rate, error_budget_ratio)
    budget_exhausted = burn_rate >= BUDGET_EXHAUSTED_THRESHOLD

    if budget_exhausted and release_policy == "unrestricted":
        raise InvariantViolation("ERRORBUDGET_EXHAUSTED_FORBIDS_UNRESTRICTED: Atlas's own benefit text (§11.40: burn too fast automatically lowers release risk) forbids release_policy:unrestricted here")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "service_under_measurement": service_under_measurement,
        "slo_target_ratio": slo_target_ratio,
        "observed_failure_rate": observed_failure_rate,
        "error_budget_ratio": error_budget_ratio,
        "burn_rate": burn_rate,
        "budget_exhausted": budget_exhausted,
        "release_policy": release_policy,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }
    if related_slo_id is not None:
        record["related_slo_id"] = related_slo_id
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which ErrorBudgetRecord also carries at the top level.
    Guards ``isinstance(record, dict)`` itself before delegating -- a non-dict record must fail closed, not
    crash with AttributeError (``dict.get`` called on a non-dict). This file's own
    ``evaluate_exhausted_forbids_unrestricted_gate`` had the identical gap -- its own
    ``except (KeyError, InvariantViolation, TypeError)`` only shields the recomputation block, not the
    unconditional ``record.get(...)`` calls building its own evidence afterward -- fixed there too."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_exhausted_forbids_unrestricted_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives budget_exhausted from the record's own raw slo_target_ratio/observed_failure_rate fields via
    the SAME compute functions the builder uses -- does not trust the stored error_budget_ratio/burn_rate/
    budget_exhausted fields. This catches a record hand-tampered in EITHER direction: budget_exhausted flipped
    healthy->exhausted (the direction re-reading the stored field alone already caught), AND exhausted->healthy
    (the direction that actually unlocks release_policy:unrestricted, which re-reading the stored field alone
    would miss). Any field present on the record but present differently from what the raw inputs recompute is
    itself a FAIL -- this is a consistency check, not merely a policy check. Guards ``isinstance(record, dict)``
    itself -- the ``except (KeyError, InvariantViolation, TypeError)`` below only protects the RECOMPUTATION
    block; the ``evidence``/``passed`` construction after it calls ``record.get(...)`` unconditionally, which
    raises ``AttributeError`` (not caught there) on a non-dict record. A real test run, not just reasoning
    about the except clause, is what caught this -- the exception-type argument alone looked sufficient."""
    if not isinstance(record, dict):
        return _result("exhausted_forbids_unrestricted", False, [{"reason": "record is not a dict"}], validator, timestamp)
    try:
        recomputed_budget_ratio = calculate_error_budget_ratio(record["slo_target_ratio"])
        recomputed_burn_rate = calculate_burn_rate(record["observed_failure_rate"], recomputed_budget_ratio)
        recomputed_exhausted = recomputed_burn_rate >= BUDGET_EXHAUSTED_THRESHOLD
        consistent = (
            record.get("error_budget_ratio") == recomputed_budget_ratio
            and record.get("burn_rate") == recomputed_burn_rate
            and record.get("budget_exhausted") == recomputed_exhausted
        )
    except (KeyError, InvariantViolation, TypeError):
        # Cannot verify -- fail closed rather than treat an unverifiable record as healthy.
        recomputed_exhausted = True
        consistent = False

    passed = consistent and not (recomputed_exhausted and record.get("release_policy") == "unrestricted")
    evidence = [
        {
            "stored": {
                "error_budget_ratio": record.get("error_budget_ratio"),
                "burn_rate": record.get("burn_rate"),
                "budget_exhausted": record.get("budget_exhausted"),
                "release_policy": record.get("release_policy"),
            },
            "recomputed_consistent_with_stored": consistent,
            "recomputed_budget_exhausted": recomputed_exhausted,
        }
    ]
    return _result("exhausted_forbids_unrestricted", passed, evidence, validator, timestamp)


def evaluate_error_budget_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_exhausted_forbids_unrestricted_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
