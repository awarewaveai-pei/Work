"""``root_cause.pareto`` -- fifth Method Atlas slice, second real validation path for fishbone's CauseHypothesisSet.

Structurally different from every other root_cause-family method built so
far: Fishbone (hypothesis generation) and Five Whys (narrative, evidence-
cited validation) both produce claims a human or model asserts and backs
with citations. Pareto produces a CALCULATED_RESULT -- real deterministic
compute (``ai_lego/compute/pareto/ranking.py``) over a dataset, the same
class of artifact ``compute/statistics/reliability.py``'s Cohen's Kappa
already is. This module's gate surface is therefore borrowed, not
reinvented: ``evaluate_genuine_compute_gate`` reuses
``modules.research.gates.evaluate_statistical_gate`` UNCHANGED, proving that
gate was already general enough to check a completely different method's
output -- it only ever inspected ``provenance``/``computation_provenance_ref``/
``engine``, never anything qualitative-coding-specific.

Atlas §11.6's own caution (L1320, "80/20 不是自然法則；真正比例由資料決定")
is enforced twice: the compute module never picks a threshold itself, and
``evaluate_explicit_threshold_gate`` here FAILs if a non-empty
``vital_few_hypothesis_ids`` is ever paired with anything other than
``threshold_status: OPERATOR_SET`` -- the same "don't silently assume a
number" discipline ``qualitative_coding.py``'s ``saturation_assessment``
established for a different method entirely.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.pareto.ranking import pareto_ranking, vital_few
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "root_cause.pareto"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.pareto.ranking.pareto_ranking"


def generate_pareto_analysis(
    analysis_id: str,
    cause_hypothesis_set: dict[str, Any],
    metric_name: str,
    dataset: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    vital_few_threshold_percent: float | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pareto-analysis.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed: ``dataset``
    non-empty, and every ``dataset[].hypothesis_id`` a real member of
    ``cause_hypothesis_set.hypotheses[].id``. ``ranking`` is computed via
    ``ai_lego.compute.pareto.ranking.pareto_ranking`` -- real code, not an
    LLM guess. ``vital_few_threshold_percent`` is OPTIONAL and defaults to
    ``None`` (``threshold_status: OPERATOR_SET_PENDING``): this function
    never invents a default threshold (Atlas L1320) -- only an explicit
    caller-supplied value produces ``OPERATOR_SET`` and a non-empty
    ``vital_few_hypothesis_ids``.
    """
    if not dataset:
        raise InvariantViolation("PARETO_PRECONDITION_FAILED: dataset must be non-empty (methods/contracts/root_cause.pareto.contract.yaml preconditions)")
    hypothesis_ids = {h["id"] for h in cause_hypothesis_set.get("hypotheses", [])}
    unknown = sorted({record["hypothesis_id"] for record in dataset} - hypothesis_ids)
    if unknown:
        raise InvariantViolation(f"PARETO_PRECONDITION_FAILED: dataset references hypothesis_id(s) not in {cause_hypothesis_set.get('id')}: {unknown}")

    ranking = pareto_ranking(dataset)

    if vital_few_threshold_percent is None:
        threshold_status = "OPERATOR_SET_PENDING"
        vital_few_ids: list[str] = []
    else:
        threshold_status = "OPERATOR_SET"
        vital_few_ids = vital_few(ranking, vital_few_threshold_percent)

    return {
        "id": analysis_id,
        "version": version,
        "cause_hypothesis_set_ref": cause_hypothesis_set["id"],
        "generated_by_method": generated_by_method,
        "metric_name": metric_name,
        "dataset": list(dataset),
        "ranking": ranking,
        "vital_few_threshold_percent": vital_few_threshold_percent,
        "threshold_status": threshold_status,
        "vital_few_hypothesis_ids": vital_few_ids,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_genuine_compute_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which ParetoAnalysis also carries at the top level.
    Guards ``isinstance(analysis, dict)`` itself before delegating -- a non-dict analysis must fail closed, not
    crash with AttributeError (``dict.get`` called on a non-dict), the same fix every sibling reuse of this
    gate now also applies."""
    if not isinstance(analysis, dict):
        return _result("genuine_compute", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(analysis)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_explicit_threshold_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas L1320: '80/20 不是自然法則；真正比例由資料決定' -- a non-empty vital_few_hypothesis_ids MUST be paired
    with threshold_status: OPERATOR_SET (an explicit, disclosed choice), never silently assumed."""
    if not isinstance(analysis, dict):
        return _result("explicit_threshold_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    threshold_status = analysis.get("threshold_status")
    vital_few_ids = analysis.get("vital_few_hypothesis_ids") or []
    checks = {
        "threshold_status_is_known_value": threshold_status in {"OPERATOR_SET", "OPERATOR_SET_PENDING"},
        "vital_few_only_populated_when_operator_set": (not vital_few_ids) or threshold_status == "OPERATOR_SET",
        "threshold_percent_present_when_operator_set": threshold_status != "OPERATOR_SET" or analysis.get("vital_few_threshold_percent") is not None,
    }
    return _result("explicit_threshold_required", all(checks.values()), [checks], validator, timestamp)


def evaluate_pareto_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_genuine_compute_gate(analysis, validator, timestamp),
        evaluate_explicit_threshold_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
