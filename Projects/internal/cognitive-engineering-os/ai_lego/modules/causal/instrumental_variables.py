"""``causal.instrumental_variables`` -- 9th F11 `causal` family member (after ``causal.dag``,
``causal.counterfactual_reasoning``, ``causal.theory_of_change``, ``causal.logic_model``,
``causal.process_tracing``, ``causal.rct``; F11 was 6/10 built before this batch).

Atlas F11 table row (L624) is this method's ONLY citation -- grep-confirmed
no dedicated §11.x/§12.x section exists for Instrumental Variables and no
§22.3 Method-specific Gate table row. The row's own 3-step pipeline:
"instrument→relevance/exclusion→2SLS".

**Scope boundary (task-mandated, disclosed here so a future reader does not
mistake this for, or try to extend this into, an actual econometrics
engine): this method captures the STRUCTURE/DESIGN of an IV study, it does
not run a real 2SLS regression.** Same restraint ``causal.rct`` applies to
randomized trials (it captures randomization/power/groups/findings as
disclosed content, it does not run an RNG or a hypothesis test),
``association.morphological_analysis`` applies to combinatorics, and
``decision.weighted_decision_matrix`` applies to scoring. All 5 content
fields below are DISCLOSURE-ONLY: presence and (for the instrument/
endogenous_variable pair) distinctness are enforced; the actual instrument
choice, the relevance/exclusion arguments, and the 2SLS findings are
REPORTED/INPUT content the caller supplies, with provenance on the record's
own top-level ``provenance`` field -- never computed by this module. There
is no ``engine``/``computation_provenance_ref`` field on this record
(contrast ``causal-dag-analysis.schema.yaml``'s own ``acyclic_verified``):
the absence itself is the honest disclosure that nothing here is
GENUINE_COMPUTE.

Modeled directly on ``ai_lego/modules/causal/rct.py``'s own 5-field/1-echo-
pair shape (closest sibling in scope and shape: study-DESIGN-not-stats-
engine restraint, a required disclosure-only justification field, an echo/
distinctness invariant on a 2-field pair):

1. **Field completeness** (``IV_EMPTY_*``): ``instrument``,
   ``endogenous_variable``, ``relevance_justification``,
   ``exclusion_justification``, and ``analysis_summary`` must each be a
   non-empty string. Both justification fields are REQUIRED, not optional
   -- Atlas L624's own citation names relevance and exclusion as 2 distinct
   validity conditions (same "a declared gap needs an explicit
   justification, not a silent omission" discipline
   ``ai_lego/modules/framing/boundary_critique.py``'s own
   ``empty_justification`` requirement establishes for a different kind of
   declared gap): a design disclosing one condition but not the other has
   not actually established IV validity.
2. **Instrument/endogenous-variable distinctness**
   (``IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE``): ``instrument`` and
   ``endogenous_variable`` must be genuinely distinct (NFKC-normalized,
   case/whitespace-insensitive) -- an instrument that IS the endogenous
   variable it is meant to instrument for is a degenerate, nonsensical
   case, not a valid IV design.

Both invariants are enforced at construction (raise BEFORE any record is
built) AND independently re-derived by a gate from raw fields (catching a
hand-tampered record that bypassed the builder entirely) -- same two-layer
discipline every sibling module in this package already establishes.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "instrumental_variables"/"causal.instrumental_variables"
before writing any of this method's own files: zero pre-existing
implementation.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.instrumental_variables"
RECORD_ID_PREFIX = "IV-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first so width-variant characters (e.g. ASCII
    vs full-width punctuation) don't defeat the echo check -- same helper shape ``ai_lego/modules/causal/rct.py``'s
    own ``_normalize`` already establishes, reused here rather than reinvented."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _fields_are_complete(
    instrument: Any,
    endogenous_variable: Any,
    relevance_justification: Any,
    exclusion_justification: Any,
    analysis_summary: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(instrument):
        return False, "EMPTY_INSTRUMENT"
    if not _is_nonempty_str(endogenous_variable):
        return False, "EMPTY_ENDOGENOUS_VARIABLE"
    if not _is_nonempty_str(relevance_justification):
        return False, "EMPTY_RELEVANCE_JUSTIFICATION"
    if not _is_nonempty_str(exclusion_justification):
        return False, "EMPTY_EXCLUSION_JUSTIFICATION"
    if not _is_nonempty_str(analysis_summary):
        return False, "EMPTY_ANALYSIS_SUMMARY"
    return True, None


def _instrument_echoes_endogenous_variable(instrument: str, endogenous_variable: str) -> bool:
    """True if ``instrument`` is effectively identical to ``endogenous_variable`` (Invariant #2, see module
    docstring). Shared by the builder and the gate so neither can drift from the other."""
    return _normalize(instrument) == _normalize(endogenous_variable)


def generate_instrumental_variables_record(
    record_id: str,
    instrument: str,
    endogenous_variable: str,
    relevance_justification: str,
    exclusion_justification: str,
    analysis_summary: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/instrumental-variables-record.schema.yaml``. Enforces both real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"IV_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"IV_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(instrument, endogenous_variable, relevance_justification, exclusion_justification, analysis_summary)
    if not complete:
        raise InvariantViolation(
            f"IV_{reason}: all of instrument/endogenous_variable/relevance_justification/exclusion_justification/analysis_summary "
            f"must be non-empty strings ({reason} failed)"
        )

    if _instrument_echoes_endogenous_variable(instrument, endogenous_variable):
        raise InvariantViolation(
            f"IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE: instrument is effectively identical (NFKC/case/whitespace-insensitive) to "
            f"endogenous_variable -- an instrument that IS the endogenous variable it targets is a degenerate, nonsensical IV design, "
            f"got instrument={instrument!r} endogenous_variable={endogenous_variable!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "instrument": instrument,
        "endogenous_variable": endogenous_variable,
        "relevance_justification": relevance_justification,
        "exclusion_justification": exclusion_justification,
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


def evaluate_instrumental_variables_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_instrumental_variables_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("instrumental_variables_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("instrumental_variables_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("instrumental_variables_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(
        record.get("instrument"),
        record.get("endogenous_variable"),
        record.get("relevance_justification"),
        record.get("exclusion_justification"),
        record.get("analysis_summary"),
    )
    if not complete:
        return _result("instrumental_variables_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    instrument = record["instrument"]
    endogenous_variable = record["endogenous_variable"]
    if _instrument_echoes_endogenous_variable(instrument, endogenous_variable):
        return _result("instrumental_variables_integrity", False, [{"reason": "INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"}], validator, timestamp)

    return _result(
        "instrumental_variables_integrity",
        True,
        [
            {
                "instrument_len": len(record["instrument"]),
                "relevance_justification_len": len(record["relevance_justification"]),
                "exclusion_justification_len": len(record["exclusion_justification"]),
                "analysis_summary_len": len(record["analysis_summary"]),
            }
        ],
        validator,
        timestamp,
    )


def evaluate_instrumental_variables_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_instrumental_variables_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
