"""The five method-specific gates of ``research.qualitative_coding`` (Master Plan §56), evaluated for real.

Each gate's PASS/FAIL condition is transcribed from
``methods/contracts/research.qualitative_coding.contract.yaml#/method_specific_gates``
and evaluated against the slice's actual outputs, with a real structural
check (not a producer-written constant a mutation cannot touch) behind
every claim:

* **citation** quantifies over ``claims`` (the contract's own subject),
  not over however many sentence-provenance records happen to exist --
  a Claim with zero matching, trace-succeeding sentence-provenance record
  fails it.
* **statistical** requires ``authorship_state`` to be a genuine-compute
  value and resolves ``computation_provenance_ref`` via ``importlib``.
* **methodology** checks the theme/category/code structure is actually
  reachable (every theme's codes are the union of its categories' codes,
  every category's codes are a subset of a real coder's code set) instead
  of comparing a constant the producer always writes the same way.
* **authorship** validates every Code/Category/Theme/Claim's
  ``provenance_record`` against the full schema (both enums AND the
  locked/epistemic_type coupling), for all four kinds, before any
  per-code human-action check.
"""

from __future__ import annotations

import importlib
from typing import Any, Callable

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.modules.knowledge.provenance import reverse_trace
from ai_lego.modules.research.qualitative_coding import STAGE_SEQUENCE

GATE_ORDER = ["research_integrity", "citation", "statistical", "methodology", "authorship"]


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_citation_gate(claims: list[dict[str, Any]], sentence_provenances: list[dict[str, Any]], evidence_graph: dict[str, Any]) -> tuple[bool, list[Any]]:
    """Contract fail_condition: 'Any output Claim has no resolvable sentence-provenance record'."""
    evidence: list[Any] = []
    passed = bool(claims)
    by_claim: dict[str, list[dict[str, Any]]] = {}
    for record in sentence_provenances:
        by_claim.setdefault(record["claim"]["claim_id"], []).append(record)
    for claim in claims:
        candidates = by_claim.get(claim["claim_id"], [])
        traced = None
        errors: list[str] = []
        for record in candidates:
            try:
                traced = reverse_trace(record, evidence_graph)
                break
            except Exception as error:  # a candidate that fails to trace is not evidence for this claim
                errors.append(str(error))
        if traced is None:
            passed = False
            evidence.append({"claim_id": claim["claim_id"], "resolved": False, "candidates_tried": len(candidates), "errors": errors})
        else:
            evidence.append({"claim_id": claim["claim_id"], "resolved": True, "trace": traced})
    return passed, evidence


def evaluate_statistical_gate(statistics: dict[str, Any]) -> tuple[bool, list[Any]]:
    """Contract fail_condition: no resolvable computation_provenance_ref, or epistemic_type/authorship_state inconsistent with genuine compute."""
    # Root-caused here (critic review of the F16/F17 batch, 2026-09-08) after THREE separate call sites each
    # independently forgot an isinstance guard before delegating to this function: mcda.py's own
    # evaluate_genuine_compute_gate crashed on non-dict input (fixed by adding a caller-side guard,
    # copied from impact_effort.py's own precedent); ice.py's identically-shaped gate had no such guard and
    # crashed live (`AttributeError: 'NoneType'/'str' object has no attribute 'get'`) -- the exact bug class
    # this repo's own two-layer discipline exists to prevent, confirmed by direct execution not just reading.
    # Guarding it ONCE here protects every current reuse (root_cause.pareto/decision.ahp/decision.mcda/
    # decision.impact_effort/decision.ice) and every future one, instead of relying on each new caller to
    # remember a guard an older sibling already forgot twice.
    if not isinstance(statistics, dict):
        return False, [{"reason": "statistics is not a dict"}]
    # `.get("provenance", {})` only substitutes {} when the key is ABSENT -- a hand-tampered record with
    # `provenance: null` (key present, value None) sails through as None and crashes `.get("epistemic_type")`
    # below. Caught by a critic review of `database_data.reconciliation` (this gate's sixth reuse): fails
    # closed instead, the same "malformed input fails closed, does not crash" discipline every gate reusing
    # this function already claims to honor.
    provenance = statistics.get("provenance") or {}
    ref = statistics.get("computation_provenance_ref", "")
    resolvable = False
    if isinstance(ref, str) and ref.startswith("ai_lego.compute."):
        module_name, _, attr = ref.rpartition(".")
        try:
            resolvable = callable(getattr(importlib.import_module(module_name), attr))
        except Exception:
            resolvable = False
    checks = {
        "epistemic_type_is_calculated_result": provenance.get("epistemic_type") == "CALCULATED_RESULT",
        "authorship_state_is_genuine_compute": provenance.get("authorship_state") in {"AI_GENERATED", "HUMAN_APPROVED"},
        "computation_provenance_ref_resolves": resolvable,
        "engine_is_deterministic_compute_not_llm": statistics.get("engine") == "local_python_deterministic_compute",
    }
    return all(checks.values()), [checks]


def evaluate_methodology_gate(coding_outputs: dict[str, Any]) -> tuple[bool, list[Any]]:
    """Structural check: themes reachable from categories reachable from real coder code sets; no forbidden CodeSet->ThemeSet jump."""
    stage_ok = coding_outputs.get("stage_sequence") == STAGE_SEQUENCE
    coder_code_ids = {code["code_id"] for coder in ("coder_1", "coder_2") for code in coding_outputs.get(coder, {}).get("code_set", [])}
    category_set = coding_outputs.get("category_set", [])
    open_ok = bool(coder_code_ids)
    categories_reference_real_codes = bool(category_set) and all(set(category["code_ids"]) <= coder_code_ids and category["code_ids"] for category in category_set)
    category_ids_by_id = {category["category_id"]: set(category["code_ids"]) for category in category_set}
    themes = coding_outputs.get("theme_set", {}).get("themes", [])
    selective_ok = bool(themes)
    no_direct_jump = True
    for theme in themes:
        expected_codes: set[str] = set()
        for category_id in theme.get("category_ids", []):
            expected_codes |= category_ids_by_id.get(category_id, set())
        if not theme.get("category_ids") or set(theme.get("code_ids", [])) != expected_codes:
            no_direct_jump = False
    saturation = coding_outputs.get("saturation_assessment")
    saturation_ok = isinstance(saturation, dict) and saturation.get("criterion") == "theoretical_saturation" and "saturated" in saturation
    checks = {
        "stages_in_order_open_axial_selective": stage_ok,
        "open_coding_produced_code_sets": open_ok,
        "axial_coding_categories_reference_real_codes": categories_reference_real_codes,
        "selective_coding_themes_reachable_from_categories_no_direct_code_jump": selective_ok and no_direct_jump,
        "saturation_assessment_recorded": saturation_ok,
    }
    return all(checks.values()), [checks]


def evaluate_authorship_gate(coding_outputs: dict[str, Any], claims: list[dict[str, Any]]) -> tuple[bool, list[Any]]:
    """Contract: every Code/Category/Theme/Claim carries a schema-valid provenance_record; AI-suggested content is never silently presented as human-authored."""
    problems: list[str] = []
    objects: list[tuple[str, dict[str, Any]]] = []
    for coder_key in ("coder_1", "coder_2"):
        objects += [("code", code) for code in coding_outputs.get(coder_key, {}).get("code_set", [])]
    objects += [("category", category) for category in coding_outputs.get("category_set", [])]
    objects += [("theme", theme) for theme in coding_outputs.get("theme_set", {}).get("themes", [])]
    objects += [("claim", claim) for claim in claims]
    for kind, item in objects:
        provenance = item.get("provenance")
        identifier = item.get("code_id") or item.get("category_id") or item.get("theme_id") or item.get("claim_id")
        if not provenance_is_valid(provenance):
            problems.append(f"{kind} {identifier} has no schema-valid provenance_record (enum or locked/epistemic_type coupling)")
            continue
        if kind != "code":
            continue
        action = item.get("human_action")
        if action in {"ACCEPT", "ACCEPT_AND_LOCK"} and provenance["authorship_state"] != "HUMAN_APPROVED":
            problems.append(f"code {identifier}: accepted but authorship_state is {provenance['authorship_state']}")
        if action == "EDIT" and provenance["authorship_state"] != "HUMAN_EDITED":
            problems.append(f"code {identifier}: edited but authorship_state is {provenance['authorship_state']}")
        if action == "ACCEPT_AND_LOCK" and provenance.get("locked") != "LOCKED_FACT":
            problems.append(f"code {identifier}: locked by human but locked != LOCKED_FACT")
        if action is None and provenance["authorship_state"] in {"HUMAN_APPROVED", "HUMAN_EDITED", "HUMAN_ORIGINAL"} and not item.get("synthetic_fixture"):
            problems.append(f"code {identifier}: presented as human-authored with no recorded human action")
    return not problems, [{"objects_checked": len(objects), "problems": problems}]


def evaluate_research_integrity_gate(component_results: dict[str, bool], transcriptions: list[dict[str, Any]]) -> tuple[bool, list[Any]]:
    lineage_ok = bool(transcriptions) and all(provenance_is_valid(row.get("provenance")) for row in transcriptions)
    checks = {**{f"{gate}_gate": passed for gate, passed in component_results.items()}, "consumed_transcripts_carry_provenance_record": lineage_ok}
    return all(checks.values()), [checks]


def evaluate_method_specific_gates(
    *,
    coding_outputs: dict[str, Any],
    statistics: dict[str, Any],
    sentence_provenances: list[dict[str, Any]],
    evidence_graph: dict[str, Any],
    claims: list[dict[str, Any]],
    transcriptions: list[dict[str, Any]],
    validator: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    """Evaluate all five gates; returns ``gate_result`` records in catalog order."""
    citation_ok, citation_evidence = evaluate_citation_gate(claims, sentence_provenances, evidence_graph)
    statistical_ok, statistical_evidence = evaluate_statistical_gate(statistics)
    methodology_ok, methodology_evidence = evaluate_methodology_gate(coding_outputs)
    authorship_ok, authorship_evidence = evaluate_authorship_gate(coding_outputs, claims)
    integrity_ok, integrity_evidence = evaluate_research_integrity_gate(
        {"citation": citation_ok, "statistical": statistical_ok, "methodology": methodology_ok, "authorship": authorship_ok},
        transcriptions,
    )
    return [
        _result("research_integrity", integrity_ok, integrity_evidence, validator, timestamp),
        _result("citation", citation_ok, citation_evidence, validator, timestamp),
        _result("statistical", statistical_ok, statistical_evidence, validator, timestamp),
        _result("methodology", methodology_ok, methodology_evidence, validator, timestamp),
        _result("authorship", authorship_ok, authorship_evidence, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    """PASS or NOT_APPLICABLE (a gate legitimately not exercised in this scope) both clear; FAIL/BLOCKED do not."""
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
