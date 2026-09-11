"""``insight.survey`` -- opening member of the NEW F06 `insight` (人類／顧客洞察) family (F06 was
0/9 built before this batch of 9 concurrent, file-disjoint agents opening it together).

Atlas cites this method TWICE: the F06 tool table row (L468: "Survey｜大規模量化｜construct→
question→pilot→sample→analysis｜估比例、分群｜注意 sampling bias") and a dedicated §12.18
section (L2768-2773) naming 4 quality-concern DIMENSIONS ("construct validity、sampling、
question wording、non-response bias") plus an explicit global-localization requirement
("全球要求：翻譯後必須做語義等值與 local pilot，不是直譯即可").

These are two DIFFERENT structures answering different questions, both implemented here: the
table row is a sequential PIPELINE (process order); §12.18 is a quality CHECKLIST (risks to
mitigate), not a stage sequence -- a survey does not "do" construct-validity-then-sampling-
then-question-wording-then-non-response-bias in that order, it must address all 4 concerns
regardless of when in the pipeline each one surfaces.

Three real invariants, all enforced at construction (raise BEFORE any record is built) AND
independently re-derived by a gate from raw fields (catching a hand-tampered record that
bypassed the builder entirely) -- same two-layer discipline every sibling module in this
package already establishes:

1. **Pipeline-stage completeness** (``SURVEY_EMPTY_<STAGE>``): ``construct_definition``,
   ``question_design``, ``pilot_summary``, ``sampling_plan``, and ``analysis_plan`` must each
   be a non-empty string -- Atlas's own L468 literal 5-stage arrow-chain IS the method's
   definition, same flat-multi-field-completeness shape ``causal/rct.py``'s own 5-field check
   already establishes (read in full as this module's primary template).
2. **Quality-dimension completeness, at-least-once** (``SURVEY_INCOMPLETE_QUALITY_DIMENSIONS``
   / ``SURVEY_INVALID_QUALITY_DIMENSION`` / ``SURVEY_EMPTY_MITIGATION_NOTE``): every one of the
   4 closed ``QUALITY_DIMENSIONS`` values must appear at least ONCE among ``quality_dimensions``,
   each with a non-empty ``mitigation_note``. Distinct from ``strategy/porter_five_forces.py``'s
   own EXACTLY-once-each-of-5 shape: §12.18 names 4 non-exclusive RISKS, not a partition a
   survey divides into exactly 4 disjoint slices, so duplicates (e.g. 2 separate sampling-bias
   mitigations) are legal and do not violate completeness.
3. **Translation asymmetry** (``SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK`` /
   ``SURVEY_MISSING_LOCAL_PILOT_REF`` / ``SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED``):
   Atlas's own §12.18 (L2773) explicit global requirement -- when ``is_translated`` is True,
   BOTH ``semantic_equivalence_check`` and ``local_pilot_ref`` are REQUIRED non-empty strings;
   when False, BOTH keys MUST be entirely absent (not merely ``None``). Same CREATE-vs-
   existing-factor asymmetric-if/then technique ``strategy/blue_ocean.py``'s own
   ``industry_standard_level`` already establishes, applied here to 2 record-level fields
   instead of 1 per-item field.

Record-level provenance ONLY (single top-level ``provenance``, no per-``quality_dimensions[]``-
item provenance) -- a deliberate F06-batch-wide decision disclosed in the method contract's own
``decided_by``, to avoid the per-item/record-level ambiguity that hit both the F02 and F03
batches.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "insight.survey"/"SurveyStudy" before writing any of this method's own
files: zero pre-existing implementation, and confirmed ``ai_lego/modules/insight/`` did not yet
exist at the start of this batch (a sibling agent's own ``__init__.py`` placeholder landed
first -- left untouched, per this batch's own file-ownership split).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.survey"
RECORD_ID_PREFIX = "SURVEY-"
QUALITY_DIMENSIONS: frozenset[str] = frozenset({"CONSTRUCT_VALIDITY", "SAMPLING", "QUESTION_WORDING", "NON_RESPONSE_BIAS"})
# Atlas §12.18 (L2771) verbatim four-item list, transcribed as SCREAMING_SNAKE_CASE.
PIPELINE_STAGE_FIELDS: tuple[str, ...] = ("construct_definition", "question_design", "pilot_summary", "sampling_plan", "analysis_plan")
# Atlas L468's own literal 5-stage arrow-chain: construct->question->pilot->sample->analysis.

_DIMENSION_REQUIRED_KEYS = frozenset({"dimension", "mitigation_note"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _pipeline_stages_complete(
    construct_definition: Any,
    question_design: Any,
    pilot_summary: Any,
    sampling_plan: Any,
    analysis_plan: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can
    drift from the other -- same discipline ``causal/rct.py``'s own ``_fields_are_complete``
    already establishes."""
    if not _is_nonempty_str(construct_definition):
        return False, "EMPTY_CONSTRUCT_DEFINITION"
    if not _is_nonempty_str(question_design):
        return False, "EMPTY_QUESTION_DESIGN"
    if not _is_nonempty_str(pilot_summary):
        return False, "EMPTY_PILOT_SUMMARY"
    if not _is_nonempty_str(sampling_plan):
        return False, "EMPTY_SAMPLING_PLAN"
    if not _is_nonempty_str(analysis_plan):
        return False, "EMPTY_ANALYSIS_PLAN"
    return True, None


def quality_dimension_entry(dimension: str, mitigation_note: str) -> dict[str, Any]:
    """One item of ``typed-objects/survey-study.schema.yaml#/properties/quality_dimensions``.
    Convenience constructor only -- emits ONLY known-good keys; does NOT itself enforce the
    at-least-once completeness invariant across the full list (``generate_survey_study``
    validates whatever list of dicts it is handed regardless of how each entry was built), same
    convention ``strategy/porter_five_forces.py``'s own ``force_entry`` already establishes."""
    if dimension not in QUALITY_DIMENSIONS:
        raise InvariantViolation(f"SURVEY_INVALID_QUALITY_DIMENSION: {dimension!r} is not one of {sorted(QUALITY_DIMENSIONS)} (Atlas §12.18 L2771 quality-concern vocabulary)")
    if not _is_nonempty_str(mitigation_note):
        raise InvariantViolation(f"SURVEY_EMPTY_MITIGATION_NOTE: mitigation_note must be a non-empty string, got {mitigation_note!r}")
    return {"dimension": dimension, "mitigation_note": mitigation_note}


def _quality_dimensions_are_valid(quality_dimensions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can
    drift from the other. Re-derives Invariant #2 from raw fields: every entry must be
    well-shaped with a closed-vocabulary ``dimension`` and non-empty ``mitigation_note``, AND
    the 4 named dimensions must each appear at least once (duplicates legal, unlike
    ``strategy/porter_five_forces.py``'s own exactly-once-each-of-5 shape -- see module
    docstring Invariant #2)."""
    if not isinstance(quality_dimensions, list) or not quality_dimensions:
        return False, "SHAPE"
    seen: set[str] = set()
    for entry in quality_dimensions:
        if not isinstance(entry, dict) or set(entry.keys()) != _DIMENSION_REQUIRED_KEYS:
            return False, "SHAPE"
        dimension = entry.get("dimension")
        if dimension not in QUALITY_DIMENSIONS:
            return False, "INVALID_QUALITY_DIMENSION"
        if not _is_nonempty_str(entry.get("mitigation_note")):
            return False, "EMPTY_MITIGATION_NOTE"
        seen.add(dimension)
    if not QUALITY_DIMENSIONS <= seen:
        return False, "INCOMPLETE_QUALITY_DIMENSIONS"
    return True, None


def _translation_fields_are_consistent(
    is_translated: Any,
    semantic_equivalence_check: Any,
    local_pilot_ref: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate. Re-derives
    Invariant #3: Atlas §12.18's own explicit global-localization requirement (L2773). When
    ``is_translated`` is True, both translation fields are REQUIRED (non-empty, not merely
    non-None); when False, both MUST be entirely absent -- callers signal absence with ``None``
    here, structurally omitted from the built record (see ``generate_survey_study``)."""
    if is_translated is True:
        if not _is_nonempty_str(semantic_equivalence_check):
            return False, "MISSING_SEMANTIC_EQUIVALENCE_CHECK"
        if not _is_nonempty_str(local_pilot_ref):
            return False, "MISSING_LOCAL_PILOT_REF"
        return True, None
    if is_translated is False:
        if semantic_equivalence_check is not None or local_pilot_ref is not None:
            return False, "UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED"
        return True, None
    return False, "INVALID_IS_TRANSLATED"


def generate_survey_study(
    study_id: str,
    construct_definition: str,
    question_design: str,
    pilot_summary: str,
    sampling_plan: str,
    analysis_plan: str,
    quality_dimensions: list[dict[str, Any]],
    is_translated: bool,
    provenance: dict[str, Any],
    *,
    semantic_equivalence_check: str | None = None,
    local_pilot_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/survey-study.schema.yaml``. Enforces all 3 real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already
    establishes."""
    if not _is_nonempty_str(study_id) or not study_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SURVEY_INVALID_ID: study_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {study_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SURVEY_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _pipeline_stages_complete(construct_definition, question_design, pilot_summary, sampling_plan, analysis_plan)
    if not complete:
        raise InvariantViolation(
            f"SURVEY_{reason}: all of construct_definition/question_design/pilot_summary/sampling_plan/analysis_plan must be non-empty "
            f"strings -- Atlas F06 L468's own 'construct→question→pilot→sample→analysis' pipeline IS the method's definition ({reason} failed)"
        )

    dims_valid, dims_reason = _quality_dimensions_are_valid(quality_dimensions)
    if not dims_valid:
        if dims_reason == "INCOMPLETE_QUALITY_DIMENSIONS":
            seen = {e.get("dimension") for e in quality_dimensions if isinstance(e, dict)}
            missing = sorted(QUALITY_DIMENSIONS - seen)
            raise InvariantViolation(
                f"SURVEY_INCOMPLETE_QUALITY_DIMENSIONS: quality_dimensions is missing {missing} -- Atlas §12.18 (L2771) names all 4 "
                f"{sorted(QUALITY_DIMENSIONS)} as this method's own defining quality concerns, each must appear at least once, got {quality_dimensions!r}"
            )
        if dims_reason == "INVALID_QUALITY_DIMENSION":
            raise InvariantViolation(f"SURVEY_INVALID_QUALITY_DIMENSION: quality_dimensions contains a dimension outside {sorted(QUALITY_DIMENSIONS)}, got {quality_dimensions!r}")
        if dims_reason == "EMPTY_MITIGATION_NOTE":
            raise InvariantViolation(f"SURVEY_EMPTY_MITIGATION_NOTE: every quality_dimensions[] entry must carry a non-empty mitigation_note, got {quality_dimensions!r}")
        raise InvariantViolation(f"SURVEY_INVALID_QUALITY_DIMENSIONS_SHAPE: quality_dimensions must be a non-empty list of well-shaped entries, got {quality_dimensions!r}")

    translation_valid, translation_reason = _translation_fields_are_consistent(is_translated, semantic_equivalence_check, local_pilot_ref)
    if not translation_valid:
        if translation_reason == "INVALID_IS_TRANSLATED":
            raise InvariantViolation(f"SURVEY_INVALID_IS_TRANSLATED: is_translated must be a bool, got {is_translated!r}")
        raise InvariantViolation(
            f"SURVEY_{translation_reason}: Atlas §12.18 (L2773) 全球要求 -- translated surveys REQUIRE semantic_equivalence_check AND "
            f"local_pilot_ref; untranslated surveys must carry NEITHER, got is_translated={is_translated!r} "
            f"semantic_equivalence_check={semantic_equivalence_check!r} local_pilot_ref={local_pilot_ref!r}"
        )

    record: dict[str, Any] = {
        "id": study_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "provenance": provenance,
        "construct_definition": construct_definition,
        "question_design": question_design,
        "pilot_summary": pilot_summary,
        "sampling_plan": sampling_plan,
        "analysis_plan": analysis_plan,
        "quality_dimensions": [dict(d) for d in quality_dimensions],
        "is_translated": is_translated,
    }
    if is_translated:
        record["semantic_equivalence_check"] = semantic_equivalence_check
        record["local_pilot_ref"] = local_pilot_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(study: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is
    schema-valid (record-level only, no per-item provenance -- see module docstring). Fails
    closed on non-dict input."""
    if not isinstance(study, dict):
        return _result("provenance_required", False, [{"reason": "study is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(study.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_pipeline_stages_gate(study: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_survey_study``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been. Fails
    closed on malformed input."""
    if not isinstance(study, dict):
        return _result("pipeline_stages", False, [{"reason": "study is not a dict"}], validator, timestamp)
    complete, reason = _pipeline_stages_complete(*(study.get(field) for field in PIPELINE_STAGE_FIELDS))
    return _result("pipeline_stages", complete, [{"failure_reason": reason}], validator, timestamp)


def evaluate_quality_dimensions_gate(study: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from the record's OWN raw ``quality_dimensions``, independent of
    the builder. Fails closed on malformed input."""
    if not isinstance(study, dict):
        return _result("quality_dimensions", False, [{"reason": "study is not a dict"}], validator, timestamp)
    valid, reason = _quality_dimensions_are_valid(study.get("quality_dimensions"))
    evidence: dict[str, Any] = {"failure_reason": reason}
    if reason == "INCOMPLETE_QUALITY_DIMENSIONS":
        seen = {e.get("dimension") for e in study.get("quality_dimensions", []) if isinstance(e, dict)}
        evidence["missing_dimensions"] = sorted(QUALITY_DIMENSIONS - seen)
    return _result("quality_dimensions", valid, [evidence], validator, timestamp)


def evaluate_translation_consistency_gate(study: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #3 from the record's OWN raw fields, independent of the builder.
    Fails closed on malformed input. A tampered record smuggling ``semantic_equivalence_check``
    or ``local_pilot_ref`` onto an ``is_translated=False`` study, or omitting either when
    ``is_translated=True``, is caught here exactly as the builder would have refused it."""
    if not isinstance(study, dict):
        return _result("translation_consistency", False, [{"reason": "study is not a dict"}], validator, timestamp)
    valid, reason = _translation_fields_are_consistent(study.get("is_translated"), study.get("semantic_equivalence_check"), study.get("local_pilot_ref"))
    return _result("translation_consistency", valid, [{"failure_reason": reason}], validator, timestamp)


def evaluate_survey_gates(study: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's own ``quality.provenance_required`` plus all 3 real invariants, in catalog
    order. No ``evidence_labeling_required`` gate -- the contract sets that flag to ``false``
    (see insight.survey.contract.yaml's own ``quality``/``compilation_decisions``), same "only
    emit gates for what is actually declared true" discipline ``causal.rct``'s own
    ``evaluate_rct_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(study, validator, timestamp),
        evaluate_pipeline_stages_gate(study, validator, timestamp),
        evaluate_quality_dimensions_gate(study, validator, timestamp),
        evaluate_translation_consistency_gate(study, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
