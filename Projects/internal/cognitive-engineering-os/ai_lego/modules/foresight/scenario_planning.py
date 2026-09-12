"""``foresight.scenario_planning`` -- F13 foresight family (Atlas L668-685, this method's own row L681).

Atlas's own table row (L681, verbatim): "Scenario Planning | 建多個合理未來
| critical uncertainties->worlds->implications->signposts | 不依賴單一
forecast" (build multiple plausible futures; don't depend on a single
forecast). Atlas gives this method a dedicated section, §11.27 (L1804-1836),
whose own verbatim mandatory field list (introduced by "每個 Scenario 要
有：", L1822-1830) is transcribed here as the nine required, non-empty
per-scenario fields: ``drivers``, ``assumptions``, ``narrative``,
``stakeholder_responses``, ``competitor_responses``,
``second_third_order_effects``, ``signposts``, ``strategy_performance``,
``reversal_condition``. A scenario missing any one of these has not actually
completed Atlas's own worked list -- refused at construction and
independently re-derived at the gate, via the ONE shared predicate
(``_scenario_problem``) both layers consult, same discipline
``epistemic.evidence_matrix``'s own ``_link_problem`` establishes.

Second invariant, also §11.27's own diagram (L1809-1818): the section's
quadrantChart is built on exactly TWO critical uncertainties (Regulation
Loose/Strict x AI Cost High/Low) producing exactly FOUR named quadrants.
This module enforces the literal diagram -- exactly 2 ``critical_uncertainties``
and exactly 4 ``scenarios`` -- rather than inventing an unwritten general
``2**N`` rule Atlas never states (see the contract's own
``compilation_decisions`` for the disclosed reasoning). "Multiple plausible
futures" with a single scenario is exactly the single-forecast dependency
this method exists to break (不依賴單一 forecast) -- both counts are
structural refusals, not soft defaults.

Per-scenario list fields (``drivers``, ``assumptions``,
``stakeholder_responses``, ``competitor_responses``,
``second_third_order_effects``, ``signposts``) hold plain, immutable
strings only -- the nested-container-aliasing defect class (a shallow
``dict(item)`` copy silently sharing a caller's own mutable nested list)
this batch's brief flags is considered and confirmed NOT APPLICABLE here:
rebuilding via ``list(value)`` already produces a fresh list object, and a
fresh list of immutable strings cannot alias the caller's original list's
own mutability.

Distinct from ``challenge.pre_mortem`` (also reasons about the future):
pre_mortem assumes ONE outcome already failed and works backward to causes
and controls for that single assumed failure; scenario_planning builds
MULTIPLE plausible, non-failure-presupposing worlds in parallel and never
assumes any one of them is the failure case. Grepped
`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS` and
`Projects/internal/cognitive-engineering-os` case-insensitively for
"scenario planning"/"scenario_planning" before writing any of this method's
own files -- hits are all incidental table-row/table-name mentions in
sibling contracts (challenge.blue_team, computation.monte_carlo,
decision.ahp/mcda/moscow, devops_sre.stress_test, framing.non_goals,
strategy.pestel) or `method-inventory.yaml`'s own pending-row placeholder;
none defines this method's own output shape. `strategy.pestel.contract.yaml`
had flagged a future contract as `strategy.scenario_planning`, but
`method-inventory.yaml`'s own F13-foresight category (L896) and this row's
own family placement (Atlas L681, inside the F13 table) confirm `foresight`
is the correct family segment, matching every other F13 sibling's
`id: foresight.<name>` convention.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.scenario_planning"
RECORD_ID_PREFIX = "SCEN-"
REQUIRED_UNCERTAINTY_COUNT = 2
REQUIRED_SCENARIO_COUNT = 4

_SCENARIO_LIST_FIELDS = ("drivers", "assumptions", "stakeholder_responses", "competitor_responses", "second_third_order_effects", "signposts")
_SCENARIO_STR_FIELDS = ("narrative", "strategy_performance", "reversal_condition")
_SCENARIO_KEYS = frozenset({"id", *_SCENARIO_LIST_FIELDS, *_SCENARIO_STR_FIELDS})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(item) for item in value)


def _scenario_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, Atlas §11.27-complete scenario". Both ``scenario()``
    (construction layer) and ``evaluate_nine_element_completeness_gate`` (independent re-derivation layer)
    consult it, so the two layers cannot drift apart -- same discipline ``epistemic.evidence_matrix``'s own
    ``_link_problem`` establishes. Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _SCENARIO_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _SCENARIO_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    for field in _SCENARIO_LIST_FIELDS:
        if not _is_nonempty_str_list(value.get(field)):
            return f"{field} must be a non-empty list of non-empty strings (Atlas §11.27 L1822-1830), got {value.get(field)!r}"
    for field in _SCENARIO_STR_FIELDS:
        if not _is_nonempty_str(value.get(field)):
            return f"{field} must be a non-empty string (Atlas §11.27 L1822-1830), got {value.get(field)!r}"
    return None


def scenario(
    scenario_id: str,
    drivers: list[str],
    assumptions: list[str],
    narrative: str,
    stakeholder_responses: list[str],
    competitor_responses: list[str],
    second_third_order_effects: list[str],
    signposts: list[str],
    strategy_performance: str,
    reversal_condition: str,
) -> dict[str, Any]:
    """One item of ``typed-objects/scenario-set.schema.yaml#/properties/scenarios`` -- Atlas §11.27's own nine
    required elements per scenario (L1822-1830), transcribed verbatim as field names. Rebuilds every list field
    via ``list(...)`` (a fresh list object; see module docstring for why this is sufficient, not a
    ``copy.deepcopy`` case) so the returned dict never shares a mutable list with the caller's own input."""
    record: dict[str, Any] = {
        "id": scenario_id,
        "drivers": list(drivers) if isinstance(drivers, list) else drivers,
        "assumptions": list(assumptions) if isinstance(assumptions, list) else assumptions,
        "narrative": narrative,
        "stakeholder_responses": list(stakeholder_responses) if isinstance(stakeholder_responses, list) else stakeholder_responses,
        "competitor_responses": list(competitor_responses) if isinstance(competitor_responses, list) else competitor_responses,
        "second_third_order_effects": list(second_third_order_effects) if isinstance(second_third_order_effects, list) else second_third_order_effects,
        "signposts": list(signposts) if isinstance(signposts, list) else signposts,
        "strategy_performance": strategy_performance,
        "reversal_condition": reversal_condition,
    }
    problem = _scenario_problem(record)
    if problem is not None:
        raise InvariantViolation(f"SCEN_INVALID_SCENARIO: {problem}")
    return record


def generate_scenario_set(
    record_id: str,
    critical_uncertainties: list[str],
    scenarios: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/scenario-set.schema.yaml``.

    Rebuilds every scenario via ``scenario()`` (never trusting the caller's raw dicts), then enforces, in order:
    exactly ``REQUIRED_UNCERTAINTY_COUNT`` critical uncertainties, every scenario Atlas §11.27-complete (all nine
    elements non-empty), exactly ``REQUIRED_SCENARIO_COUNT`` scenarios, and no duplicate scenario id -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SCEN_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SCEN_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("SCEN_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not _is_nonempty_str_list(critical_uncertainties):
        raise InvariantViolation(f"SCEN_INVALID_CRITICAL_UNCERTAINTIES: critical_uncertainties must be a non-empty list of non-empty strings, got {critical_uncertainties!r}")
    if len(critical_uncertainties) != REQUIRED_UNCERTAINTY_COUNT:
        raise InvariantViolation(
            f"SCEN_UNCERTAINTY_COUNT: exactly {REQUIRED_UNCERTAINTY_COUNT} critical_uncertainties required -- Atlas "
            f"§11.27's own quadrantChart (L1809-1818) is built on exactly two axes, got {len(critical_uncertainties)}"
        )

    if not isinstance(scenarios, list):
        raise InvariantViolation(f"SCEN_INVALID_SCENARIOS: scenarios must be a list, got {type(scenarios).__name__}")
    rebuilt_scenarios: list[dict[str, Any]] = []
    for i, s in enumerate(scenarios):
        problem = _scenario_problem(s)
        if problem is not None:
            raise InvariantViolation(f"SCEN_INVALID_SCENARIO: scenarios[{i}]: {problem}")
        rebuilt_scenarios.append({k: (list(v) if isinstance(v, list) else v) for k, v in s.items()})
    if len(rebuilt_scenarios) != REQUIRED_SCENARIO_COUNT:
        raise InvariantViolation(
            f"SCEN_SCENARIO_COUNT: exactly {REQUIRED_SCENARIO_COUNT} scenarios required for "
            f"{REQUIRED_UNCERTAINTY_COUNT} critical_uncertainties -- Atlas §11.27's own quadrantChart: two axes "
            f"produce four named worlds (L1809-1818), got {len(rebuilt_scenarios)}"
        )

    ids = [s["id"] for s in rebuilt_scenarios]
    duplicate_ids = sorted({sid for sid in ids if ids.count(sid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"SCEN_DUPLICATE_SCENARIO_ID: scenario id(s) {duplicate_ids} used more than once")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "critical_uncertainties": list(critical_uncertainties),
        "scenarios": rebuilt_scenarios,
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


def evaluate_nine_element_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.27's own nine-required-element list directly from raw fields, via the SAME
    ``_scenario_problem`` predicate ``scenario()`` uses -- not just trusting that
    ``generate_scenario_set``'s own construction-time check already ran. Fails closed on malformed entries
    (a hand-tampered scenario missing a field, or the top-level ``scenarios`` field itself malformed) rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("nine_element_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    scenarios = record.get("scenarios")
    if not isinstance(scenarios, list):
        return _result("nine_element_completeness", False, [{"reason": "scenarios must be a list"}], validator, timestamp)
    problems = [f"scenarios[{i}]: {problem}" for i, problem in ((i, _scenario_problem(s)) for i, s in enumerate(scenarios)) if problem]
    # Re-derives SCEN_DUPLICATE_SCENARIO_ID independently -- a critic pass found this gate suite returned
    # all-PASS on a hand-tampered record with two scenarios sharing an id, even though the builder refuses it.
    ids = [s.get("id") if isinstance(s, dict) else None for s in scenarios]
    duplicate_ids = sorted({i for i in ids if i is not None and ids.count(i) > 1}, key=repr)
    if duplicate_ids:
        problems.append(f"duplicate scenario id(s): {duplicate_ids}")
    passed = not problems
    return _result("nine_element_completeness", passed, [{"scenarios_checked": len(scenarios), "problems": problems}], validator, timestamp)


def evaluate_uncertainty_scenario_count_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.27's own quadrantChart count invariant (exactly 2 critical_uncertainties, exactly 4
    scenarios) directly from raw fields. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("uncertainty_scenario_count", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    uncertainties = record.get("critical_uncertainties")
    if not isinstance(uncertainties, list) or len(uncertainties) != REQUIRED_UNCERTAINTY_COUNT:
        problems.append(f"critical_uncertainties must be a list of exactly {REQUIRED_UNCERTAINTY_COUNT} items, got {uncertainties!r}")
    scenarios = record.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) != REQUIRED_SCENARIO_COUNT:
        problems.append(f"scenarios must be a list of exactly {REQUIRED_SCENARIO_COUNT} items, got {scenarios!r}")
    passed = not problems
    return _result("uncertainty_scenario_count", passed, [{"problems": problems}], validator, timestamp)


def evaluate_scenario_planning_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_nine_element_completeness_gate(record, validator, timestamp),
        evaluate_uncertainty_scenario_count_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
