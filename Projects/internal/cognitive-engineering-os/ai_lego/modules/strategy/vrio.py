"""``strategy.vrio`` -- F08 context/strategy family, 7th member (built concurrently with 3 siblings --
``strategy.value_chain``/``stp``/``ansoff`` -- alongside the 6 already-landed F08 methods: ``swot``,
``steepv``, ``porter_five_forces``, ``pestel``, ``three_c``, ``tows``). Read ``porter_five_forces.py`` in full
as this module's primary convention template (closest sibling: a closed, fixed-name-vocabulary structural
method), and ``tows.py`` for the GENUINE_COMPUTE lookup-table discipline this module also needs -- not edited.

Atlas cites this method TWICE: the F08 tool table row (L521: "判斷資源優勢｜Value/Rarity/Imitability/
Organization｜找可防禦優勢｜Value Chain") and a dedicated §12.13 section (L2689-2701) naming the 4 question
dimensions verbatim (Value / Rarity / Imitability / Organization) plus the method's own stated purpose
("判斷某項資源是否真的能成為持久競爭優勢" -- determine whether a resource is genuinely a sustained competitive
advantage) and benefit ("防止把「我們有這個能力」直接等同「我們有 moat」" -- prevents conflating "we have this
capability" with "we have a moat").

**Design-shape investigation (task-mandated, disclosed here)**: same closed-SET-with-completeness shape
``porter_five_forces.py``'s own module docstring already investigates against ``causal/dag.py``'s
``VALID_ROLES`` (any-subset) and ``causal/logic_model.py``'s ``STAGE_ORDER`` (positional) -- ``VRIO_DIMENSIONS``
below is the SAME third shape Porter's own ``FORCE_NAMES`` establishes: a closed SET requiring completeness
(all 4, Atlas's own §12.13 definition of the method IS the four-way split -- a record answering only 3 of the
4 dimensions has not actually done a VRIO analysis) WITHOUT position (Atlas's own §12.13 code block lists the
4 dimensions as a flat, unordered list, no cited sequence).

**GENUINE_COMPUTE investigation (task-mandated, disclosed here)**: Atlas §12.13's own benefit line is the
whole point of this method -- preventing a false "capability = moat" conflation. That conflation is exactly
what a CALLER-ASSERTED ``competitive_implication`` would allow (a caller could label a resource
``SUSTAINED_COMPETITIVE_ADVANTAGE`` while having answered ``NO`` to Rarity, silently reproducing the very
hazard Atlas's own citation warns against). The classic Value/Rarity/Imitability/Organization ->
competitive-implication classification is REAL, EXTERNAL, NAMED methodology (Jay B. Barney, "Firm Resources
and Sustained Competitive Advantage," Journal of Management 17(1), 1991; the standard VRIO decision-tree
presentation used in strategic-management texts, e.g. Barney & Hesterly's "Strategic Management and
Competitive Advantage") -- NOT an Atlas citation (Atlas §12.13 gives only the 4 question names, no
classification table). Same disclosure discipline ``causal.process_tracing``'s Van Evera hoop/smoking-gun
typology already establishes for a different family: name the real external methodology, enforce it as a
closed structural rule, disclose the source, never present it as an Atlas citation.

``competitive_implication`` is therefore GENUINE_COMPUTE (``derive_vrio_competitive_implication`` below), a
TOTAL closed lookup table over all 16 combinations of the 4 YES/NO answers (8 map to
``COMPETITIVE_DISADVANTAGE`` via Value=NO; 4 more to ``COMPETITIVE_PARITY`` via Value=YES+Rarity=NO; 2 more to
``TEMPORARY_COMPETITIVE_ADVANTAGE`` via +Imitability=NO; 1 to ``UNUSED_COMPETITIVE_ADVANTAGE`` via
+Organization=NO; 1 to ``SUSTAINED_COMPETITIVE_ADVANTAGE`` -- 8+4+2+1+1=16, mathematically equivalent to the
textbook short-circuit decision tree, just written as a total function). ``generate_vrio_analysis`` does NOT
accept a ``competitive_implication`` parameter at all -- same structural elimination
``causal.process_tracing``'s per-item ``implication`` and ``strategy.tows``'s ``pairing_type`` already
establish: there is no code path through which a caller could construct a record whose stored implication
disagrees with its own 4 answers. An independent gate re-derives it from raw fields, same two-layer discipline
every sibling module in this package establishes.

**IMITABILITY polarity (disclosed, task-mandated restraint)**: ``answer: YES`` for IMITABILITY means "costly/
hard to imitate" (favorable toward advantage), NOT "is highly imitable" -- keeps all 4 dimensions uniformly
YES-favorable. See the lookup table below and ``vrio-analysis.schema.yaml``'s own per-question description.

**Completeness without short-circuit (task-mandated, disclosed here)**: the classic VRIO decision tree stops
evaluating once an earlier dimension is NO (later dimensions become moot for classification). This module
still REQUIRES all 4 dimensions answered and disclosed regardless -- same completeness invariant
``porter_five_forces.py``'s own closed-SET-with-completeness precedent already establishes for a different
5-name set. This does not change the deterministic classification outcome (the lookup table below is the same
mathematical function as the short-circuit tree); it adds a full audit trail even for dimensions that turn out
moot for a given resource's own outcome.

Real invariants (grounded in Atlas L521/§12.13, each enforced BOTH at construction, raise BEFORE any record is
built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer discipline
every sibling module in this package already establishes):

1. ``questions`` is EXACTLY the 4 ``VRIO_DIMENSIONS`` values, each appearing EXACTLY ONCE, in ANY order
   (unordered completeness -- see design-shape note above). Missing, duplicated, or unrecognized dimension
   names are all refused.
2. Every question entry carries a non-empty ``reasoning`` (the actual judgment content) and an ``answer`` in
   the closed 2-value enum ``{YES, NO}`` -- a DISCLOSED human/AI judgment, never a computed score (this is
   distinct from invariant 3 below: the 4 individual answers are disclosed judgment calls, only their
   AGGREGATION into ``competitive_implication`` is computed).
3. ``competitive_implication`` is GENUINE_COMPUTE, mechanically derived from the 4 ``questions[].answer``
   values via ``derive_vrio_competitive_implication`` -- never a builder parameter, never caller-supplied, and
   re-derived independently by the gate from the record's own raw ``questions[]``.
4. ``resource_description`` (top-level, required, non-empty) -- Atlas §12.13's own definition names no method
   without naming WHICH resource is being judged; a record with 4 answered dimensions but no named subject
   cannot be audited against reality later.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "vrio" before writing any of this method's own files: zero pre-existing implementation (one unrelated
forward-reference mention in ``ai_lego/modules/strategy/__init__.py``'s own "Remaining 8" family roadmap
comment, not an implementation).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.vrio"
RECORD_ID_PREFIX = "VRIO-"
COMPUTATION_PROVENANCE_REF = "ai_lego.modules.strategy.vrio.derive_vrio_competitive_implication"

VRIO_DIMENSIONS: frozenset[str] = frozenset({"VALUE", "RARITY", "IMITABILITY", "ORGANIZATION"})
# Atlas §12.13 (L2694-2697) verbatim 4-line code block, transcribed as SCREAMING_SNAKE_CASE. See module
# docstring's design-shape investigation for why this is a closed SET requiring completeness (like
# porter_five_forces.py's own FORCE_NAMES) but WITHOUT position.

VALID_ANSWERS: frozenset[str] = frozenset({"YES", "NO"})
# Disclosed judgment-call enum (task-mandated) -- NOT a computed score. See module docstring invariant 2.
# Uniform polarity: YES always moves toward sustained advantage, including IMITABILITY (YES = costly/hard to
# imitate, NOT "is highly imitable" -- see module docstring).

COMPETITIVE_DISADVANTAGE = "COMPETITIVE_DISADVANTAGE"
COMPETITIVE_PARITY = "COMPETITIVE_PARITY"
TEMPORARY_COMPETITIVE_ADVANTAGE = "TEMPORARY_COMPETITIVE_ADVANTAGE"
UNUSED_COMPETITIVE_ADVANTAGE = "UNUSED_COMPETITIVE_ADVANTAGE"
SUSTAINED_COMPETITIVE_ADVANTAGE = "SUSTAINED_COMPETITIVE_ADVANTAGE"
VALID_IMPLICATIONS: frozenset[str] = frozenset(
    {COMPETITIVE_DISADVANTAGE, COMPETITIVE_PARITY, TEMPORARY_COMPETITIVE_ADVANTAGE, UNUSED_COMPETITIVE_ADVANTAGE, SUSTAINED_COMPETITIVE_ADVANTAGE}
)
# The 5 real, externally-grounded VRIO classification outcomes (Barney 1991 / standard VRIO decision-tree
# presentation -- NOT Atlas content, see module docstring's GENUINE_COMPUTE investigation).

_QUESTION_REQUIRED_KEYS = frozenset({"dimension", "answer", "reasoning", "provenance"})
_QUESTION_ALLOWED_KEYS = _QUESTION_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})

# Real, external, TOTAL lookup table (all 16 combinations of 4 YES/NO answers): (VALUE, RARITY, IMITABILITY,
# ORGANIZATION) -> competitive_implication. Every one of the 16 cells listed explicitly (no loop-generated
# entries), mirroring compute/kano/classification.py's own explicit-cell-listing discipline for a different
# 2-input table -- an auditor can read every row directly rather than trusting a generator's own logic. Real
# external Barney/VRIO classification (see module docstring) -- NOT an Atlas citation.
_IMPLICATION_BY_ANSWERS: dict[tuple[str, str, str, str], str] = {
    # Value=NO -> COMPETITIVE_DISADVANTAGE regardless of Rarity/Imitability/Organization (8 of 16 cells).
    ("NO", "YES", "YES", "YES"): COMPETITIVE_DISADVANTAGE,
    ("NO", "YES", "YES", "NO"): COMPETITIVE_DISADVANTAGE,
    ("NO", "YES", "NO", "YES"): COMPETITIVE_DISADVANTAGE,
    ("NO", "YES", "NO", "NO"): COMPETITIVE_DISADVANTAGE,
    ("NO", "NO", "YES", "YES"): COMPETITIVE_DISADVANTAGE,
    ("NO", "NO", "YES", "NO"): COMPETITIVE_DISADVANTAGE,
    ("NO", "NO", "NO", "YES"): COMPETITIVE_DISADVANTAGE,
    ("NO", "NO", "NO", "NO"): COMPETITIVE_DISADVANTAGE,
    # Value=YES, Rarity=NO -> COMPETITIVE_PARITY regardless of Imitability/Organization (4 of 16 cells).
    ("YES", "NO", "YES", "YES"): COMPETITIVE_PARITY,
    ("YES", "NO", "YES", "NO"): COMPETITIVE_PARITY,
    ("YES", "NO", "NO", "YES"): COMPETITIVE_PARITY,
    ("YES", "NO", "NO", "NO"): COMPETITIVE_PARITY,
    # Value=YES, Rarity=YES, Imitability=NO -> TEMPORARY_COMPETITIVE_ADVANTAGE regardless of Organization (2 of 16 cells).
    ("YES", "YES", "NO", "YES"): TEMPORARY_COMPETITIVE_ADVANTAGE,
    ("YES", "YES", "NO", "NO"): TEMPORARY_COMPETITIVE_ADVANTAGE,
    # Value=YES, Rarity=YES, Imitability=YES, Organization=NO -> UNUSED_COMPETITIVE_ADVANTAGE (1 of 16 cells).
    ("YES", "YES", "YES", "NO"): UNUSED_COMPETITIVE_ADVANTAGE,
    # All 4 YES -> SUSTAINED_COMPETITIVE_ADVANTAGE (1 of 16 cells).
    ("YES", "YES", "YES", "YES"): SUSTAINED_COMPETITIVE_ADVANTAGE,
}
assert len(_IMPLICATION_BY_ANSWERS) == 16, "VRIO implication table must be TOTAL over all 16 YES/NO combinations"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def derive_vrio_competitive_implication(value_answer: str, rarity_answer: str, imitability_answer: str, organization_answer: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning the 4 real VRIO answers into a ``competitive_implication``.
    Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) -- neither can drift
    from the other. Pure and total: raises only if an answer is outside {YES, NO} (defense in depth -- by the
    time this is called, ``generate_vrio_analysis``/``evaluate_vrio_integrity_gate`` have already confirmed
    each answer is a legal value)."""
    key = (value_answer, rarity_answer, imitability_answer, organization_answer)
    if key not in _IMPLICATION_BY_ANSWERS:
        raise InvariantViolation(f"VRIO_UNRESOLVABLE_IMPLICATION: {key!r} is not a legal 4-tuple of {sorted(VALID_ANSWERS)} answers (real external Barney/VRIO classification, see module docstring)")
    return _IMPLICATION_BY_ANSWERS[key]


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _question_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return _QUESTION_REQUIRED_KEYS <= keys and keys <= _QUESTION_ALLOWED_KEYS


def _questions_are_valid(questions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(questions) != 4`` up front: a wrong COUNT (too few, too many,
    or the right count with a duplicate) is a completeness defect (``INCOMPLETE_QUESTION_SET``), a distinct
    failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_DIMENSION``/etc). Checking count-and-membership
    together, after the per-entry loop, is what lets a too-short list (e.g. 3 entries, all individually
    well-formed) report the correct ``INCOMPLETE_QUESTION_SET`` reason instead of being misclassified as a
    generic shape defect. Same structure ``porter_five_forces.py``'s own ``_forces_are_valid`` already
    establishes for a different 5-name set."""
    if not isinstance(questions, list):
        return False, "SHAPE"
    seen_dimensions: list[str] = []
    for entry in questions:
        if not _question_entry_shaped(entry):
            return False, "SHAPE"
        dimension = entry.get("dimension")
        if dimension not in VRIO_DIMENSIONS:
            return False, "UNKNOWN_DIMENSION"
        seen_dimensions.append(dimension)
        if not _is_nonempty_str(entry.get("reasoning")):
            return False, "EMPTY_REASONING"
        if entry.get("answer") not in VALID_ANSWERS:
            return False, "INVALID_ANSWER"
        if not provenance_is_valid(entry.get("provenance")):
            return False, "INVALID_PROVENANCE"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
    if len(seen_dimensions) != len(VRIO_DIMENSIONS) or set(seen_dimensions) != VRIO_DIMENSIONS:
        return False, "INCOMPLETE_QUESTION_SET"
    return True, None


def _answers_by_dimension(questions: list[dict[str, Any]]) -> dict[str, str]:
    """Builds ``{dimension: answer}`` from an ALREADY-VALIDATED ``questions`` list (caller must have already
    confirmed ``_questions_are_valid`` returned True). Shared by the builder and the gate."""
    return {q["dimension"]: q["answer"] for q in questions}


def question_entry(
    dimension: str,
    answer: str,
    reasoning: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/vrio-analysis.schema.yaml#/properties/questions``. Convenience constructor
    only -- emits ONLY known-good keys; does NOT itself enforce the completeness/distinctness invariant
    (``generate_vrio_analysis`` validates whatever list of dicts it is handed regardless of how each entry was
    built, same convention ``porter_five_forces.py``'s own ``force_entry`` already establishes)."""
    if dimension not in VRIO_DIMENSIONS:
        raise InvariantViolation(f"VRIO_UNKNOWN_DIMENSION: {dimension!r} is not one of {sorted(VRIO_DIMENSIONS)} (Atlas §12.13 L2694-2697 four-dimension vocabulary)")
    if answer not in VALID_ANSWERS:
        raise InvariantViolation(f"VRIO_INVALID_ANSWER: {answer!r} is not one of {sorted(VALID_ANSWERS)} (disclosed judgment call, not a computed score)")
    record: dict[str, Any] = {"dimension": dimension, "answer": answer, "reasoning": reasoning, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_vrio_analysis(
    analysis_id: str,
    resource_description: str,
    questions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/vrio-analysis.schema.yaml``.

    Enforces all 4 real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes -- never a record that itself proves it was built
    illegally. Deliberately has NO ``competitive_implication`` parameter: see module docstring's
    GENUINE_COMPUTE investigation, this is the structural half of the "never caller-asserted" invariant --
    always computed here via ``derive_vrio_competitive_implication``, never accepted from the caller.
    """
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"VRIO_INVALID_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"VRIO_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(resource_description):
        raise InvariantViolation(
            f"VRIO_EMPTY_RESOURCE_DESCRIPTION: resource_description must be a non-empty string -- Atlas §12.13's own definition requires naming WHICH "
            f"resource is under judgment, got {resource_description!r}"
        )

    valid, reason = _questions_are_valid(questions)
    if not valid:
        if reason == "UNKNOWN_DIMENSION":
            raise InvariantViolation(f"VRIO_UNKNOWN_DIMENSION: questions contains a name outside {sorted(VRIO_DIMENSIONS)}, got {questions!r}")
        if reason == "EMPTY_REASONING":
            raise InvariantViolation(f"VRIO_EMPTY_REASONING: every question entry must carry a non-empty 'reasoning', got {questions!r}")
        if reason == "INVALID_ANSWER":
            raise InvariantViolation(f"VRIO_INVALID_ANSWER: every question entry's 'answer' must be one of {sorted(VALID_ANSWERS)}, got {questions!r}")
        if reason == "INVALID_PROVENANCE":
            raise InvariantViolation(f"VRIO_INVALID_PROVENANCE: every question entry must carry a schema-valid provenance, got {questions!r}")
        if reason == "INCOMPLETE_QUESTION_SET":
            raise InvariantViolation(
                f"VRIO_INCOMPLETE_QUESTION_SET: questions must name EXACTLY the four {sorted(VRIO_DIMENSIONS)}, each exactly once -- Atlas §12.13's own "
                f"four-way split IS the method's definition, a record naming only some of the 4 has not done a VRIO analysis, got {questions!r}"
            )
        raise InvariantViolation(f"VRIO_INVALID_QUESTION_SET: questions must be exactly {len(VRIO_DIMENSIONS)} well-shaped entries, got {questions!r}")

    answers = _answers_by_dimension(questions)
    competitive_implication = derive_vrio_competitive_implication(answers["VALUE"], answers["RARITY"], answers["IMITABILITY"], answers["ORGANIZATION"])

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "resource_description": resource_description,
        "questions": [dict(q) for q in questions],
        "competitive_implication": competitive_implication,
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every question entry AND the overall record carry a
    schema-valid provenance_record. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    questions = record.get("questions")
    questions = questions if isinstance(questions, list) else []
    invalid = [q.get("dimension") for q in questions if isinstance(q, dict) and not provenance_is_valid(q.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(questions) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"questions_checked": len(questions), "invalid_provenance_dimensions": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``strategy.porter_five_forces``'s identical gate uses: a question entry claiming the EVIDENCE label must
    actually cite ``supporting_evidence_refs``. Grounded by same-family analogy to
    ``strategy.porter_five_forces.contract.yaml``'s identical flag (see this method's own contract
    ``open_questions`` -- Atlas §12.13 gives no explicit misuse warning the way SWOT's own L1347 does)."""
    questions = record.get("questions") if isinstance(record, dict) else None
    questions = questions if isinstance(questions, list) else []
    problems: list[dict[str, Any]] = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        epistemic_type = (q.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"dimension": q.get("dimension"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not q.get("supporting_evidence_refs"):
            problems.append({"dimension": q.get("dimension"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(questions) and not problems
    return _result("evidence_labeling_required", passed, [{"questions_checked": len(questions), "problems": problems}], validator, timestamp)


def evaluate_vrio_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL FOUR real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_vrio_analysis``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. In particular, this is the ONLY place the
    stored ``competitive_implication`` is checked against a fresh ``derive_vrio_competitive_implication``
    recomputation from the record's own ``questions[].answer`` values. Fails closed on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("vrio_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("vrio_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("vrio_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("resource_description")):
        return _result("vrio_integrity", False, [{"reason": "resource_description missing or empty"}], validator, timestamp)

    valid, reason = _questions_are_valid(record.get("questions"))
    if not valid:
        return _result(
            "vrio_integrity",
            False,
            [{"reason": f"questions invalid ({reason}) -- must name exactly {sorted(VRIO_DIMENSIONS)}, each exactly once, well-shaped"}],
            validator,
            timestamp,
        )

    answers = _answers_by_dimension(record["questions"])
    try:
        recomputed_implication = derive_vrio_competitive_implication(answers["VALUE"], answers["RARITY"], answers["IMITABILITY"], answers["ORGANIZATION"])
    except InvariantViolation as error:
        return _result("vrio_integrity", False, [{"reason": f"UNRESOLVABLE_IMPLICATION: {error}"}], validator, timestamp)

    if record.get("competitive_implication") != recomputed_implication:
        return _result(
            "vrio_integrity",
            False,
            [{"reason": "stored competitive_implication disagrees with recomputation", "stored": record.get("competitive_implication"), "recomputed": recomputed_implication}],
            validator,
            timestamp,
        )

    return _result(
        "vrio_integrity",
        True,
        [{"question_count": len(record["questions"]), "competitive_implication": recomputed_implication}],
        validator,
        timestamp,
    )


def evaluate_vrio_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-and-computation integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_vrio_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
