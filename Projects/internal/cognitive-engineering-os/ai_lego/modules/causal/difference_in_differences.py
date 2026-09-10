"""``causal.difference_in_differences`` -- 7th F11 `causal` family member (after ``causal.dag``,
``causal.counterfactual_reasoning``, ``causal.theory_of_change``, ``causal.logic_model``,
``causal.process_tracing``, ``causal.rct``; F11 was 6/10 built before this batch).

Atlas F11 table row (L622) is this method's ONLY citation -- grep-confirmed
no dedicated §11.x/§12.x section exists for Difference-in-Differences and no
§22.3 Method-specific Gate table row (same absence class every other F11
sibling's own module docstring already discloses). The row's own 3-step
pipeline: "treated/control→pre/post→parallel trends".

**Scope boundary (task-mandated, disclosed here so a future reader does not
mistake this for, or try to extend this into, an actual econometrics engine):
this method captures the STRUCTURE/DESIGN of a DiD study, it does not run a
real fixed-effects regression, an actual parallel-trends significance test,
or any DiD-estimator arithmetic.** Same restraint ``ai_lego/modules/causal/
rct.py`` already establishes for randomized studies (it captures
randomization/power/group/analysis DISCLOSURE, not an RNG or a hypothesis
test), and ``ai_lego/modules/association/morphological_analysis.py`` applies
to combinatorics / ``ai_lego/modules/decision/weighted_decision_matrix.py``
applies to scoring. All 6 content fields below are DISCLOSURE-ONLY:
presence and (for the 2 echo pairs) distinctness are enforced; the actual
unit-of-treatment identification, period boundaries, parallel-trends
evidence, and analytical findings are REPORTED/INPUT content the caller
supplies, with provenance on the record's own top-level ``provenance``
field -- never computed by this module. There is no ``engine``/
``computation_provenance_ref`` field on this record: the absence itself is
the honest disclosure that nothing here is GENUINE_COMPUTE (same omission-
as-disclosure convention ``causal.rct``'s own record schema already uses).

Modeled directly on ``ai_lego/modules/causal/rct.py`` (closest sibling in
scope and shape -- same disclosure-only study-DESIGN restraint, same two-
layer invariant discipline), scaled from RCT's 5 fields / 1 echo pair to
this method's own 6 fields / 2 echo pairs:

1. **Field completeness** (``DID_EMPTY_*``): ``treated_group``,
   ``control_group``, ``pre_period``, ``post_period``,
   ``parallel_trends_justification``, and ``analysis_summary`` must each be
   a non-empty string. ``parallel_trends_justification`` is REQUIRED, not
   optional -- Atlas's own 3-stage pipeline names "parallel trends" as an
   explicit, unconditional pipeline stage (not a caveat), and the parallel-
   trends assumption is Difference-in-Differences' own defining identifying
   assumption: a study that cannot state why it believes treated/control
   would have moved in parallel absent treatment has not disclosed the one
   claim this whole design rests on. Same "a declared gap needs an explicit
   justification, not a silent omission" discipline
   ``ai_lego/modules/framing/boundary_critique.py``'s own
   ``empty_justification`` requirement establishes, and the same
   required-not-optional treatment ``causal.rct``'s own ``power_analysis``
   field already establishes for an analogous defining-assumption gap.
2. **Treated/control distinctness** (``DID_CONTROL_GROUP_ECHOES_TREATED_GROUP``):
   ``treated_group`` and ``control_group`` must be genuinely distinct
   (NFKC-normalized, case/whitespace-insensitive) -- Atlas's own pipeline
   names "treated/control" as its first stage; a record naming an
   identical arm twice has not identified 2 groups to compare at all, same
   "not an echo" class ``causal.rct``'s own treatment_group/control_group
   check already establishes.
3. **Pre/post distinctness** (``DID_POST_PERIOD_ECHOES_PRE_PERIOD``):
   ``pre_period`` and ``post_period`` must be genuinely distinct (same
   normalization) -- Atlas's own pipeline names "pre/post" as its second
   stage; a record naming an identical period twice cannot express a
   before/after difference at all, which is the "difference" half of
   "difference-in-differences" itself.

All 3 invariants are enforced at construction (raise BEFORE any record is
built) AND independently re-derived by a gate from raw fields (catching a
hand-tampered record that bypassed the builder entirely) -- same two-layer
discipline every sibling module in this package already establishes.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "difference_in_differences"/"difference-in-differences"
before writing any of this method's own files: zero pre-existing
implementation (hits were limited to the Atlas table row itself, the Global
Master Plan's flat method list, ``method-inventory.yaml``'s 2 stale rows,
and 3 sibling F11 WORKLOG-style notes in ``contract-backlog.yaml`` that name
this method only as a still-pending sibling -- none is this method).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.difference_in_differences"
RECORD_ID_PREFIX = "DID-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first so width-variant characters (e.g. ASCII
    vs full-width punctuation) don't defeat an echo check -- same helper shape ``ai_lego/modules/causal/rct.py``'s
    own ``_normalize`` already establishes, reused verbatim here rather than reinvented."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _fields_are_complete(
    treated_group: Any,
    control_group: Any,
    pre_period: Any,
    post_period: Any,
    parallel_trends_justification: Any,
    analysis_summary: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(treated_group):
        return False, "EMPTY_TREATED_GROUP"
    if not _is_nonempty_str(control_group):
        return False, "EMPTY_CONTROL_GROUP"
    if not _is_nonempty_str(pre_period):
        return False, "EMPTY_PRE_PERIOD"
    if not _is_nonempty_str(post_period):
        return False, "EMPTY_POST_PERIOD"
    if not _is_nonempty_str(parallel_trends_justification):
        return False, "EMPTY_PARALLEL_TRENDS_JUSTIFICATION"
    if not _is_nonempty_str(analysis_summary):
        return False, "EMPTY_ANALYSIS_SUMMARY"
    return True, None


def _treated_control_echo(treated_group: str, control_group: str) -> bool:
    """True if ``control_group`` is effectively identical to ``treated_group`` (Invariant #2, see module
    docstring). Shared by the builder and the gate so neither can drift from the other."""
    return _normalize(control_group) == _normalize(treated_group)


def _pre_post_echo(pre_period: str, post_period: str) -> bool:
    """True if ``post_period`` is effectively identical to ``pre_period`` (Invariant #3, see module docstring).
    Shared by the builder and the gate so neither can drift from the other."""
    return _normalize(post_period) == _normalize(pre_period)


def generate_difference_in_differences_record(
    record_id: str,
    treated_group: str,
    control_group: str,
    pre_period: str,
    post_period: str,
    parallel_trends_justification: str,
    analysis_summary: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/difference-in-differences-record.schema.yaml``. Enforces all 3 real
    invariants fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DID_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DID_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(treated_group, control_group, pre_period, post_period, parallel_trends_justification, analysis_summary)
    if not complete:
        raise InvariantViolation(
            f"DID_{reason}: all of treated_group/control_group/pre_period/post_period/parallel_trends_justification/analysis_summary "
            f"must be non-empty strings ({reason} failed)"
        )

    if _treated_control_echo(treated_group, control_group):
        raise InvariantViolation(
            f"DID_CONTROL_GROUP_ECHOES_TREATED_GROUP: control_group is effectively identical (NFKC/case/whitespace-insensitive) to "
            f"treated_group -- a Difference-in-Differences record naming an identical treated and control arm has not identified 2 "
            f"groups to compare, got treated_group={treated_group!r} control_group={control_group!r}"
        )

    if _pre_post_echo(pre_period, post_period):
        raise InvariantViolation(
            f"DID_POST_PERIOD_ECHOES_PRE_PERIOD: post_period is effectively identical (NFKC/case/whitespace-insensitive) to "
            f"pre_period -- a Difference-in-Differences record naming an identical pre and post period cannot express a before/after "
            f"difference, got pre_period={pre_period!r} post_period={post_period!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "treated_group": treated_group,
        "control_group": control_group,
        "pre_period": pre_period,
        "post_period": post_period,
        "parallel_trends_justification": parallel_trends_justification,
        "analysis_summary": analysis_summary,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_difference_in_differences_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL 3 real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_difference_in_differences_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("difference_in_differences_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("difference_in_differences_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("difference_in_differences_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(
        record.get("treated_group"),
        record.get("control_group"),
        record.get("pre_period"),
        record.get("post_period"),
        record.get("parallel_trends_justification"),
        record.get("analysis_summary"),
    )
    if not complete:
        return _result("difference_in_differences_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    treated_group = record["treated_group"]
    control_group = record["control_group"]
    if _treated_control_echo(treated_group, control_group):
        return _result("difference_in_differences_integrity", False, [{"reason": "CONTROL_GROUP_ECHOES_TREATED_GROUP"}], validator, timestamp)

    pre_period = record["pre_period"]
    post_period = record["post_period"]
    if _pre_post_echo(pre_period, post_period):
        return _result("difference_in_differences_integrity", False, [{"reason": "POST_PERIOD_ECHOES_PRE_PERIOD"}], validator, timestamp)

    return _result(
        "difference_in_differences_integrity",
        True,
        [{
            "parallel_trends_justification_len": len(record["parallel_trends_justification"]),
            "analysis_summary_len": len(record["analysis_summary"]),
        }],
        validator,
        timestamp,
    )


def evaluate_difference_in_differences_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_difference_in_differences_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
