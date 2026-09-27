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


def genuine_compute_provenance(provenance: Any) -> Any:
    """Normalize a caller-supplied top-level ``provenance`` for a method whose gate reuses
    ``evaluate_statistical_gate``: the computation itself is always real deterministic Python compute, never
    an LLM inference, so ``epistemic_type`` must always be ``CALCULATED_RESULT`` regardless of what the caller
    passed -- ``authorship_state`` (was a human involved) IS a real caller choice and passes through unchanged.

    Root cause this fixes: ``ai_lego/apps/api/main.py``'s ``POST /methods/{id}/invoke`` defaults an un-supplied
    ``provenance`` to ``epistemic_type=AI_INFERENCE`` (main.py:784) -- correct for the ~150 AI-inference methods
    in this corpus, but wrong for the ~20 genuine-compute methods reusing this gate, which then failed
    ``genuine_compute`` on every real dashboard invocation (the dashboard never exposes a provenance field).
    Fixing the default itself was rejected: ``AI_INFERENCE`` is the deliberately correct default for the
    majority of methods (see e.g. ``research.qualitative_coding``'s own hard-coded ``AI_INFERENCE`` sub-records),
    so this normalizes only at the genuine-compute call sites that actually require it.

    Returns the SAME object when no change is needed -- every sibling builder in this family has its own test
    asserting ``provenance`` is aliased, not rebuilt (e.g. ``test_impact_effort.py::
    test_provenance_is_deliberately_aliased_not_rebuilt``), and every real fixture in this corpus already
    supplies ``CALCULATED_RESULT`` -- so this never changes existing behavior, only the previously-broken
    default-provenance path. Passes non-dict input through unchanged (existing callers already handle an
    invalid ``provenance`` no earlier than ``evaluate_provenance_required_gate``; this must not introduce a new
    construction-time crash for a shape that previously reached the gate safely).

    On the rebuild branch, also forces ``locked: None`` (critic-caught, 2026-09-18): ``core/domain/provenance
    .py``'s own ``LOCK_REQUIRES`` has no entry for ``CALCULATED_RESULT``, so a caller-supplied ``locked``
    value that was valid for their ORIGINAL epistemic_type (e.g. ``LOCKED_FACT`` paired with ``SOURCE_FACT``)
    becomes schema-invalid the instant epistemic_type is forced to ``CALCULATED_RESULT`` -- which would make
    this gate misleadingly PASS on a record ``evaluate_provenance_required_gate`` then correctly fails, for a
    confusing reason. None of these 19 real callers has a legitimate use for a locked genuine-compute record
    (every real fixture already passes ``locked=None``), so clearing it is a safe simplification, not a
    behavior loss."""
    if not isinstance(provenance, dict) or provenance.get("epistemic_type") == "CALCULATED_RESULT":
        return provenance
    return {**provenance, "epistemic_type": "CALCULATED_RESULT", "locked": None}


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


def evaluate_research_workflow_integrity_gate(
    context: dict[str, Any],
    workflow_ir: dict[str, Any],
    validator: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    """Check the cross-node contract of a qualitative research workflow.

    Method-specific gates remain authoritative for coding, citation,
    statistics, methodology, and authorship. This gate only verifies that a
    workflow that claims to connect those stages actually carries the expected
    typed hand-offs and keeps triangulation explicitly review-bound.
    """
    nodes = workflow_ir.get("nodes", [])
    steps = context.get("steps", {})
    checks: dict[str, Any] = {
        "coding_nodes": 0,
        "coding_outputs_present": False,
        "statistics_output_present": False,
        "triangulation_output_present": False,
        "triangulation_remains_human_review_bound": False,
        "artifact_has_reliability_input": True,
    }
    coding_outputs: list[dict[str, Any]] = []
    statistics_outputs: list[dict[str, Any]] = []
    triangulations: list[dict[str, Any]] = []
    artifact_steps: list[dict[str, Any]] = []
    for index, node in enumerate(nodes if isinstance(nodes, list) else []):
        step = steps.get(str(index)) if isinstance(steps, dict) else None
        if not isinstance(step, dict) or not isinstance(node, dict):
            continue
        if node.get("method_id") == "research.qualitative_coding":
            checks["coding_nodes"] += 1
            if isinstance(step.get("coding_outputs"), dict):
                coding_outputs.append(step["coding_outputs"])
            elif isinstance(step.get("stage_sequence"), list):
                # API method handlers return the coding record directly;
                # the CLI adapter wraps the same record under coding_outputs.
                coding_outputs.append(step)
        elif node.get("ref") == "run_statistics":
            statistics_outputs.append(step)
        elif node.get("method_id") == "evidence.triangulation":
            if isinstance(step.get("triangulation"), dict):
                triangulations.append(step["triangulation"])
        elif node.get("ref") == "artifact.generate_research_paper":
            artifact_steps.append(step)
    # A full Recipe has two independent coders; the CLI's approved runtime
    # projection intentionally executes one reviewed coding node and supplies
    # the second rater through the deterministic statistics adapter. Both are
    # valid workflow shapes, so the cross-node gate requires at least one
    # coding output and leaves two-rater validity to the statistics gate.
    checks["coding_outputs_present"] = bool(coding_outputs)
    checks["statistics_output_present"] = bool(statistics_outputs) and all(
        isinstance(row.get("interrater_reliability_result"), dict)
        or isinstance(row.get("statistics"), dict)
        for row in statistics_outputs
    )
    checks["triangulation_output_present"] = bool(triangulations)
    checks["triangulation_remains_human_review_bound"] = bool(triangulations) and all(
        row.get("status") == "NEEDS_HUMAN_REVIEW" for row in triangulations
    )
    if artifact_steps:
        checks["artifact_has_reliability_input"] = all(
            isinstance(row.get("interrater_reliability_result"), dict)
            or any(
                isinstance(node.get("bindings"), dict)
                and isinstance(node["bindings"].get("interrater_reliability_result"), str)
                and "outputs." in node["bindings"]["interrater_reliability_result"]
                for node in nodes
                if isinstance(node, dict) and node.get("ref") == "artifact.generate_research_paper"
            )
            for row in artifact_steps
        )
    passed = all(value is True for key, value in checks.items() if key != "coding_nodes") and checks["coding_nodes"] >= 1
    return [_result("research_workflow_integrity", passed, [checks], validator, timestamp)]


def iter_claims(obj: Any, path: str = "$", in_conflicts: bool = False):
    """Every claim in ``obj`` as ``(path, claim, in_conflicts)`` -- the one P-b definition (P-K3): any dict carrying a
    ``citations`` key, wherever it is nested; ``in_conflicts`` = the dict sits directly inside a ``conflicts`` list.
    The gate below and the eval harness (``COS/eval/score.py``) both walk claims through this."""
    if isinstance(obj, dict):
        if "citations" in obj:
            yield path, obj, in_conflicts
        for key, value in obj.items():
            yield from iter_claims(value, f"{path}.{key}", key == "conflicts" and isinstance(value, list))
    elif isinstance(obj, list):
        for index, item in enumerate(obj):
            yield from iter_claims(item, f"{path}[{index}]", in_conflicts)


def claim_citations(claim: dict[str, Any]) -> list[Any]:
    """A claim's citations as a list ([] when the value is missing or not a list: that claim has zero citations)."""
    citations = claim.get("citations")
    return citations if isinstance(citations, list) else []


def evaluate_citation_integrity(obj: Any, manifest_ids: list[str] | set[str]) -> dict[str, Any]:
    """The one ``citation_integrity`` gate for every AI-produced claim (P2 WC-01, P-b/P-e).

    Claims come from ``iter_claims``; a ``citations`` value that is not a non-empty list counts as zero citations, a
    non-string item as out of manifest. A claim directly inside a ``conflicts`` list additionally needs >=2 *distinct*
    citations. FAILs on any out-of-manifest citation, any zero-citation claim, any under-two conflict, or zero claims.
    ``uncited_sections`` = headings of top-level ``sections[]`` with no cited claim (C4, ``report.ts:204``),
    informational only. Evidence items carry paths and counts, never a ``citations`` key, so gate output stored next
    to the object (P-c ``gate_results``) is never itself read back as a claim.
    """
    ids = set(manifest_ids)
    out_of_manifest: list[dict[str, Any]] = []
    zero_citation: list[dict[str, Any]] = []
    conflicts_under_two: list[dict[str, Any]] = []
    claims_total = 0
    for path, claim, in_conflicts in iter_claims(obj):
        claims_total += 1
        citations = claim_citations(claim)
        if not citations:
            zero_citation.append({"path": path})
            continue
        # a non-string item is kept as its repr: evidence must hold no dict that could itself carry `citations`
        bad = [citation if isinstance(citation, str) else repr(citation)[:80] for citation in citations if not isinstance(citation, str) or citation not in ids]
        if bad:
            out_of_manifest.append({"path": path, "bad": bad})
        distinct = len({citation for citation in citations if isinstance(citation, str)})
        if in_conflicts and distinct < 2:
            conflicts_under_two.append({"path": path, "distinct": distinct})

    sections = obj.get("sections") if isinstance(obj, dict) else None
    uncited_sections = [
        section["heading"] if isinstance(section.get("heading"), str) and section["heading"] else f"sections[{index}]"
        for index, section in enumerate(sections if isinstance(sections, list) else [])
        if isinstance(section, dict) and not any(claim_citations(claim) for _, claim, _ in iter_claims(section))
    ]

    status = "PASS"
    if out_of_manifest or zero_citation or conflicts_under_two or claims_total == 0:
        status = "FAIL"

    return {
        "gate_id": "citation_integrity",
        "status": status,
        "evidence": {
            "out_of_manifest": out_of_manifest,
            "zero_citation": zero_citation,
            "conflicts_under_two": conflicts_under_two,
            "uncited_sections": uncited_sections,
            "claims_total": claims_total,
        },
    }


def synthesis_reference_errors(synthesis: Any) -> list[str]:
    """References inside a synthesis typed object that its schema cannot express (P-d structure sections).

    Every id is unique in its list (``claim_id`` across all sections, ``study_id``, ``option_id``, ``criterion_id``).
    literature_matrix: every study cites exactly one source -- the study itself -- and ``source_id`` is that
    citation's source id (``source:<source_id>``); the model never writes ``source_id``, the runner derives it.
    decision_evidence: every evidence item names at least one option or criterion, and only ones present.
    Total over any JSON value -- messages, never an exception: the runner calls it inside its repair loop and the
    harness on artifacts it has not validated yet.
    """
    if not isinstance(synthesis, dict):
        return ["synthesis is not an object"]
    errors: list[str] = []

    def objects(value: Any, where: str) -> list[dict[str, Any]]:
        if value is None:
            return []
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            errors.append(f"{where} must be a list of objects")
            return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []
        return value

    def unique_ids(rows: list[dict[str, Any]], id_key: str, where: str) -> set[str]:
        ids = [row.get(id_key) for row in rows]
        if not all(isinstance(value, str) and value for value in ids):
            errors.append(f"{where}[].{id_key} must be non-empty strings")
        named = [value for value in ids if isinstance(value, str)]
        repeated = sorted({value for value in named if named.count(value) > 1})
        if repeated:
            errors.append(f"{where}[].{id_key} repeats {repeated}")
        return set(named)

    claims = [claim for section in objects(synthesis.get("sections"), "sections") for claim in objects(section.get("claims"), "sections[].claims")]
    unique_ids(claims, "claim_id", "sections[].claims")
    studies = objects(synthesis.get("studies"), "studies")
    unique_ids(studies, "study_id", "studies")
    for index, study in enumerate(studies):
        citations = claim_citations(study)
        if len(citations) != 1 or not isinstance(citations[0], str) or not citations[0].startswith("source:"):
            errors.append(f"studies[{index}] must cite exactly one source (the study itself)")
        elif study.get("source_id") != citations[0].removeprefix("source:"):
            errors.append(f"studies[{index}].source_id {study.get('source_id')!r} is not its citation's source id {citations[0].removeprefix('source:')!r}")
    if synthesis.get("kind") == "decision_evidence":
        option_ids = unique_ids(objects(synthesis.get("options"), "options"), "option_id", "options")
        criterion_ids = unique_ids(objects(synthesis.get("criteria"), "criteria"), "criterion_id", "criteria")
        for index, item in enumerate(objects(synthesis.get("evidence"), "evidence")):
            option_refs, criterion_refs = item.get("option_ids"), item.get("criterion_ids")
            if not isinstance(option_refs, list) or not isinstance(criterion_refs, list):
                errors.append(f"evidence[{index}].option_ids / criterion_ids must be lists")
                continue
            if not option_refs and not criterion_refs:
                errors.append(f"evidence[{index}] is bound to no option and no criterion")
            errors += [f"evidence[{index}].option_ids names unknown option {ref!r}" for ref in option_refs if not isinstance(ref, str) or ref not in option_ids]
            errors += [f"evidence[{index}].criterion_ids names unknown criterion {ref!r}" for ref in criterion_refs if not isinstance(ref, str) or ref not in criterion_ids]
    return errors
