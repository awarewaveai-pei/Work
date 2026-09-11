"""``divergent.starbursting`` -- F03 divergent-ideation family, 1st member (family did not exist before
this batch; ``modules/divergent/`` created by a sibling agent in this same parallel batch, not edited).

Atlas cites this method ONCE: the F03 tool table row (L385: "Starbursting｜用問題發散｜Who/What/When/
Where/Why/How｜找未知與研究問題｜很適合需求前期"). Grep-confirmed the only real hit case-insensitively
across the whole Atlas file -- no dedicated section, no §4 composition formula, no §14.1 legal-chain
mention, no §22.3 gate-table row.

**Critical differentiation from ``framing.five_w_one_h`` (read in full as this module's own due-diligence
step, not edited)**: that sibling module uses the IDENTICAL 6 category names (Who/What/When/Where/Why/
How). This is NOT an accidental collision -- Atlas cites both methods with the same 6-word vocabulary,
but for opposite purposes. 5W1H's own citation (F01 L340: "快速建立問題輪廓...找資訊缺口") builds a PROFILE
of an ALREADY-EXISTING, somewhat-known problem and reports which of the 6 dimensions remain unanswered
(``status: KNOWN`` vs ``UNKNOWN`` per dimension, feeding a Problem Statement). Starbursting's own citation
(F03 L385: "找未知與研究問題...很適合需求前期") radiates OPEN QUESTIONS from a still-unscoped central topic
BEFORE a problem is even framed -- there is no "answer" to record, only questions to ask. The real,
mechanically-checkable encoding of this distinction: every Starbursting ``question_text`` MUST literally
be a question (ends in ``?``/``？``); 5W1H's ``dimensions[].answer`` carries no such constraint (it is a
declarative answer, or explicitly absent under ``UNKNOWN``). This is not a naming difference -- it is a
different structural shape enforcing a different epistemic stance (open inquiry vs. gap-in-a-profile).

**Design-shape investigation (task-mandated, disclosed here)**: read ``strategy/porter_five_forces.py``'s
own ``FORCE_NAMES`` (a closed SET requiring completeness -- exactly 5, each once, no position) and
``framing/five_w_one_h.py``'s own ``DIMENSION_ORDER`` (closed, POSITIONAL, exactly 6, one each) before
choosing this method's own shape. Starbursting is a THIRD variant, distinct from both: a closed 6-name
SET requiring completeness (all 6 categories represented at least once -- Atlas's own six-direction
radiation IS the method's definition) but, UNLIKE both precedents, with NO upper bound on total count --
F03's own sibling rows favor volume over a fixed structural split ("Classic Brainstorming: 追數量",
"6-3-5: 快速得到大量變體"), so multiple questions per category are expected and legal.

Real invariants (grounded in Atlas L385), each enforced BOTH at construction, raise BEFORE any record is
built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer
discipline every sibling module in this package already establishes:

1. ``questions`` is a non-empty list whose entries' ``category`` values collectively cover ALL 6
   ``CATEGORY_NAMES`` at least once (unordered completeness, unbounded count -- see design-shape note
   above). Missing any of the 6 categories is refused; more than 6 total entries, or repeats of the same
   category, are explicitly allowed.
2. Every entry's ``question_text`` is a non-empty string that literally ends with ``?`` or the full-width
   ``？`` (``QUESTION_MARKS`` below, same constant/helper convention ``framing/how_might_we.py``'s own
   ``QUESTION_MARKS``/``_ends_with_question_mark`` already establishes for an identical suffix check) --
   a declarative statement smuggled in is refused. This is a checkable structural PROXY for "this is an
   open question, not an answer", same class of deliberate proxy ``framing.how_might_we``'s own stem+
   question-mark check already accepts (no gate in this corpus performs semantic judgment).

No per-question provenance exists in this shape (record-level ``provenance`` only, verified as the
majority -- not universal -- corpus convention: 113+ of 128 typed-object schemas require a top-level
``provenance`` field; ``bcg-matrix-analysis.schema.yaml`` is a documented per-item-only exception). See
``methods/contracts/divergent.starbursting.contract.yaml``'s own ``compilation_decisions``.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-
insensitively for "starbursting" before writing any of this method's own files: zero pre-existing
implementation (only 2 stale ``method-inventory.yaml`` registry rows, neither a real contract/schema/
module).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.starbursting"
RECORD_ID_PREFIX = "STARBURST-"
CATEGORY_NAMES: frozenset[str] = frozenset({"WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"})
# Atlas L385's own literal "Who/What/When/Where/Why/How" list, SCREAMING_SNAKE_CASE. Same 6 names
# framing.five_w_one_h.DIMENSION_ORDER uses -- see module docstring for the real, non-cosmetic
# differentiation (open questions about an unscoped topic vs. a known-problem profile).
QUESTION_MARKS = ("?", "？")
# Same constant convention framing/how_might_we.py's own QUESTION_MARKS already establishes for an
# identical ASCII/full-width suffix check.

_QUESTION_REQUIRED_KEYS = frozenset({"category", "question_text"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _ends_with_question_mark(value: str) -> bool:
    return isinstance(value, str) and value.rstrip().endswith(QUESTION_MARKS)


def _question_shaped(entry: Any) -> bool:
    return isinstance(entry, dict) and set(entry.keys()) == _QUESTION_REQUIRED_KEYS


def _questions_are_valid(questions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift
    from the other -- same discipline every sibling module in this package already establishes. Real
    invariants 1+2 from the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on category-count up front: a wrong COVERAGE (missing one or
    more of the 6 categories) is a completeness defect (``INCOMPLETE_CATEGORY_COVERAGE``), a distinct
    failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_CATEGORY``/``NOT_A_QUESTION``) -- checking
    coverage after the per-entry loop is what lets an entry-valid-but-incomplete list (e.g. 5 well-formed
    questions, one category never mentioned) report the correct reason instead of a generic shape defect.
    """
    if not isinstance(questions, list) or not questions:
        return False, "SHAPE"
    seen_categories: set[str] = set()
    for entry in questions:
        if not _question_shaped(entry):
            return False, "SHAPE"
        category = entry.get("category")
        if category not in CATEGORY_NAMES:
            return False, "UNKNOWN_CATEGORY"
        seen_categories.add(category)
        question_text = entry.get("question_text")
        if not _is_nonempty_str(question_text):
            return False, "EMPTY_QUESTION_TEXT"
        if not _ends_with_question_mark(question_text):
            return False, "NOT_A_QUESTION"
    if seen_categories != CATEGORY_NAMES:
        return False, "INCOMPLETE_CATEGORY_COVERAGE"
    return True, None


def question_entry(category: str, question_text: str) -> dict[str, Any]:
    """One item of ``typed-objects/starbursting-session.schema.yaml#/properties/questions``. Convenience
    constructor only -- emits ONLY the 2 known keys; does NOT itself enforce the category-coverage
    invariant (``generate_starbursting_session`` validates whatever list of dicts it is handed regardless
    of how each entry was built, same convention ``strategy/porter_five_forces.py``'s own ``force_entry``
    already establishes)."""
    if category not in CATEGORY_NAMES:
        raise InvariantViolation(f"STARBURSTING_UNKNOWN_CATEGORY: {category!r} is not one of {sorted(CATEGORY_NAMES)} (Atlas L385's own six-category vocabulary)")
    if not _is_nonempty_str(question_text):
        raise InvariantViolation(f"STARBURSTING_EMPTY_QUESTION_TEXT: question_text must be a non-empty string, got {question_text!r}")
    if not _ends_with_question_mark(question_text):
        raise InvariantViolation(f"STARBURSTING_NOT_A_QUESTION: question_text must end with '?' or '？', got {question_text!r}")
    return {"category": category, "question_text": question_text}


def generate_starbursting_session(
    session_id: str,
    central_topic: str,
    questions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/starbursting-session.schema.yaml``.

    Enforces all three real invariants (central_topic non-empty, category coverage, question-mark
    suffix) fail-closed, same family-wide "raise-before-construction" discipline every sibling module in
    this package already establishes -- never a record that itself proves it was built illegally.
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"STARBURSTING_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"STARBURSTING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(central_topic):
        raise InvariantViolation(f"STARBURSTING_EMPTY_CENTRAL_TOPIC: central_topic must be a non-empty string, got {central_topic!r}")

    valid, reason = _questions_are_valid(questions)
    if not valid:
        if reason == "UNKNOWN_CATEGORY":
            raise InvariantViolation(f"STARBURSTING_UNKNOWN_CATEGORY: questions contains a category outside {sorted(CATEGORY_NAMES)}, got {questions!r}")
        if reason == "EMPTY_QUESTION_TEXT":
            raise InvariantViolation(f"STARBURSTING_EMPTY_QUESTION_TEXT: every question entry must carry a non-empty 'question_text', got {questions!r}")
        if reason == "NOT_A_QUESTION":
            raise InvariantViolation(
                f"STARBURSTING_NOT_A_QUESTION: every question_text must literally end with '?' or '？' -- Atlas L385's own benefit ('找未知與研究問題') "
                f"means every entry IS a question, not a declarative statement, got {questions!r}"
            )
        if reason == "INCOMPLETE_CATEGORY_COVERAGE":
            raise InvariantViolation(
                f"STARBURSTING_INCOMPLETE_CATEGORY_COVERAGE: questions must collectively name all six {sorted(CATEGORY_NAMES)}, each at least once -- "
                f"Atlas L385's own six-direction radiation IS the method's definition, a record silent on any direction has not actually starburst outward "
                f"that way, got {questions!r}"
            )
        raise InvariantViolation(f"STARBURSTING_INVALID_QUESTION_SET: questions must be a non-empty list of well-shaped entries, got {questions!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "central_topic": central_topic,
        "questions": [dict(q) for q in questions],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance_record is
    schema-valid. Record-level ONLY (see module docstring -- this shape carries no per-question
    provenance to check, unlike strategy.porter_five_forces's per-force provenance). Fails closed on
    non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_starbursting_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_starbursting_session``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("starbursting_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("starbursting_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("starbursting_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("central_topic")):
        return _result("starbursting_integrity", False, [{"reason": "central_topic missing or empty"}], validator, timestamp)

    valid, reason = _questions_are_valid(record.get("questions"))
    if not valid:
        return _result(
            "starbursting_integrity",
            False,
            [{"reason": f"questions invalid ({reason}) -- must collectively cover all six {sorted(CATEGORY_NAMES)}, each well-shaped and ending in '?'/'？'"}],
            validator,
            timestamp,
        )

    return _result("starbursting_integrity", True, [{"question_count": len(record["questions"])}], validator, timestamp)


def evaluate_starbursting_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then
    the independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the
    contract sets that flag to ``false`` (see divergent.starbursting.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_starbursting_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
