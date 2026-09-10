"""``causal.regression_discontinuity`` -- 8th F11 `causal` family member (after ``causal.dag``,
``causal.counterfactual_reasoning``, ``causal.theory_of_change``, ``causal.logic_model``,
``causal.process_tracing``, ``causal.rct`` all landed earlier this same batch).

Atlas F11 table row (L623) is this method's ONLY citation -- grep-confirmed no dedicated
section exists for this method, and no other Atlas hit for "Regression Discontinuity"/"RDD"/
"running variable"/"cutoff" is actually about this method (a handful of case-insensitive
substring false positives elsewhere -- e.g. "BoardDecisionPack", "HazardDescriptor" -- triaged
and confirmed unrelated). The row's own 4-step pipeline: "running variable→cutoff→bandwidth→
checks".

**Scope boundary (task-mandated, disclosed here so a future reader does not mistake this for,
or try to extend this into, an actual econometrics engine): this method captures the
STRUCTURE/DESIGN of a study, it does not run a real RDD estimator, bandwidth-selection
algorithm (e.g. MSE-optimal / cross-validated), or manipulation test.** Same restraint
``ai_lego/modules/causal/rct.py`` applies to statistical hypothesis testing (it captures the
study DESIGN, it does not run an RNG or a hypothesis test) and
``ai_lego/modules/association/morphological_analysis.py`` applies to combinatorics. Content
fields are DISCLOSURE-ONLY: presence (all 4 required fields), numeric validity (``cutoff_value``
is a finite real number), and pairwise distinctness (``checks`` entries) are enforced; the
actual running-variable measurement, bandwidth-selection methodology, and check results are
REPORTED/INPUT content the caller supplies, with provenance on the record's own top-level
``provenance`` field -- never computed by this module. There is no ``engine``/
``computation_provenance_ref`` field on this record (contrast ``causal-dag-analysis.schema
.yaml``'s own ``acyclic_verified``): the absence itself is the honest disclosure that nothing
here is GENUINE_COMPUTE.

Modeled directly on ``ai_lego/modules/causal/rct.py``'s own flat-record-from-thin-citation
shape (5 content fields, 1 relational invariant beyond completeness), adapted for this method's
own citation shape (4 pipeline words, with the 4th -- "checks" -- being plural, unlike RCT's
singular "analysis"):

1. **Field completeness** (``RD_EMPTY_*`` / ``RD_INVALID_CUTOFF_VALUE`` /
   ``RD_EMPTY_CHECKS_LIST``): ``running_variable`` and ``bandwidth`` must each be a non-empty
   string; ``cutoff_value`` must be a finite real number (not NaN/Infinity/bool/string);
   ``checks`` must be a non-empty list, and every entry in it must itself be a non-empty
   string. A cutoff needs to be a real point on the running variable's own numeric scale, not a
   narrative-only claim -- hence the typed-number check on ``cutoff_value`` specifically, beyond
   plain non-emptiness.
2. **Checks distinctness** (``RD_CHECKS_CONTAIN_DUPLICATE``): every entry in ``checks`` must be
   genuinely distinct from every other entry (NFKC-normalized, case/whitespace-insensitive).
   Atlas L623's own 4th pipeline word is "checks" (plural); a list padded with duplicate entries
   has not actually disclosed multiple validation checks -- the same undisclosed-assumption risk
   class ``causal.rct``'s own treatment_group/control_group distinctness invariant addresses for
   a different pipeline stage in this same family, grounded independently here in THIS method's
   own L623 citation (not by analogy to another method's reasoning).

Both invariants are enforced at construction (raise BEFORE any record is built) AND
independently re-derived by a gate from raw fields (catching a hand-tampered record that
bypassed the builder entirely) -- same two-layer discipline every sibling module in this
package already establishes.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "regression_discontinuity"/"RegressionDiscontinuity"/"RDD" before writing
any of this method's own files: zero pre-existing implementation (a handful of unrelated
case-insensitive substring false positives -- "BoardDecisionPack", "HazardDescriptor" -- triaged
and confirmed non-matching -- none is this method).
"""

from __future__ import annotations

import math
import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.regression_discontinuity"
RECORD_ID_PREFIX = "RD-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """True only for a real, finite number -- excludes bool (Python bool is an int subclass),
    NaN, +/-Infinity, and non-numeric types. A cutoff must be a real point on the running
    variable's own scale, not merely "present"."""
    if isinstance(value, bool):
        return False
    if not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first so width-variant
    characters (e.g. ASCII vs full-width punctuation) don't defeat the distinctness check --
    same helper shape ``ai_lego/modules/causal/rct.py``'s own ``_normalize`` already
    establishes, built in from the start here rather than retrofitted after a critic finding."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _fields_are_complete(
    running_variable: Any,
    cutoff_value: Any,
    bandwidth: Any,
    checks: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can
    drift from the other -- same discipline every sibling module in this package establishes."""
    if not _is_nonempty_str(running_variable):
        return False, "EMPTY_RUNNING_VARIABLE"
    if not _is_finite_number(cutoff_value):
        return False, "INVALID_CUTOFF_VALUE"
    if not _is_nonempty_str(bandwidth):
        return False, "EMPTY_BANDWIDTH"
    if not isinstance(checks, list) or len(checks) == 0:
        return False, "EMPTY_CHECKS_LIST"
    for entry in checks:
        if not _is_nonempty_str(entry):
            return False, "EMPTY_CHECKS_ENTRY"
    return True, None


def _checks_contain_duplicate(checks: list[str]) -> bool:
    """True if any 2 entries in ``checks`` are effectively identical (Invariant #2, see module
    docstring). Shared by the builder and the gate so neither can drift from the other."""
    normalized = [_normalize(entry) for entry in checks]
    return len(set(normalized)) != len(normalized)


def generate_regression_discontinuity_record(
    record_id: str,
    running_variable: str,
    cutoff_value: float,
    bandwidth: str,
    checks: list[str],
    provenance: dict[str, Any],
    *,
    analysis_summary: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/regression-discontinuity-record.schema.yaml``. Enforces both
    real invariants fail-closed -- never a record that itself proves it was built illegally,
    same family-wide "raise-before-construction" discipline every sibling module in this package
    already establishes. ``analysis_summary`` is OPTIONAL (see contract's own
    compilation_decisions -- unlike ``causal.rct``, this method's own citation does not name
    "analysis" as a pipeline word)."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RD_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RD_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(running_variable, cutoff_value, bandwidth, checks)
    if not complete:
        raise InvariantViolation(f"RD_{reason}: running_variable/cutoff_value/bandwidth/checks must all be valid and non-empty ({reason} failed)")

    if _checks_contain_duplicate(checks):
        raise InvariantViolation(
            f"RD_CHECKS_CONTAIN_DUPLICATE: 2 or more entries in checks are effectively identical (NFKC/case/whitespace-insensitive) -- "
            f"an RDD design disclosing duplicated checks has not actually documented multiple distinct validation checks, got checks={checks!r}"
        )

    if analysis_summary is not None and not _is_nonempty_str(analysis_summary):
        raise InvariantViolation(f"RD_INVALID_ANALYSIS_SUMMARY: analysis_summary, when provided, must be a non-empty string, got {analysis_summary!r}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "running_variable": running_variable,
        "cutoff_value": cutoff_value,
        "bandwidth": bandwidth,
        "checks": checks,
        "provenance": provenance,
    }
    if analysis_summary is not None:
        record["analysis_summary"] = analysis_summary
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_regression_discontinuity_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any
    stored value and does NOT call ``generate_regression_discontinuity_record``, so a
    hand-tampered record that bypassed the builder entirely is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("regression_discontinuity_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("regression_discontinuity_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("regression_discontinuity_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(
        record.get("running_variable"),
        record.get("cutoff_value"),
        record.get("bandwidth"),
        record.get("checks"),
    )
    if not complete:
        return _result("regression_discontinuity_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    checks = record["checks"]
    if _checks_contain_duplicate(checks):
        return _result("regression_discontinuity_integrity", False, [{"reason": "CHECKS_CONTAIN_DUPLICATE"}], validator, timestamp)

    analysis_summary = record.get("analysis_summary")
    if analysis_summary is not None and not _is_nonempty_str(analysis_summary):
        return _result("regression_discontinuity_integrity", False, [{"reason": "INVALID_ANALYSIS_SUMMARY"}], validator, timestamp)

    return _result(
        "regression_discontinuity_integrity",
        True,
        [{"running_variable_len": len(record["running_variable"]), "cutoff_value": record["cutoff_value"], "checks_count": len(checks)}],
        validator,
        timestamp,
    )


def evaluate_regression_discontinuity_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_regression_discontinuity_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
