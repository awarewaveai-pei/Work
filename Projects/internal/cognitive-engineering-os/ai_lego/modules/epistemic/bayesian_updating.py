"""``epistemic.bayesian_updating`` -- F10 epistemic quality family (Atlas L566-609), quantitative pair member 1/2
built this batch (with ``epistemic.confidence_calibration``, the other quantitative F10 row; this session's own
5 disjoint agents build the remaining 8 F10 members concurrently).

Atlas F10 table row, read directly at L577 (the task brief that assigned this method cited L576-577; verified by
direct read this session, the row is actually at L577, L578 for Confidence Calibration -- corrected here, not
silently transcribed): "Bayesian Updating｜新 evidence 更新 belief｜prior→likelihood→posterior｜信心可持續更新".
Textbook Bayes' rule, made a real structural invariant rather than an assertable field::

    posterior = (likelihood_given_true * prior) / (likelihood_given_true * prior + likelihood_given_false * (1 - prior))

``posterior`` is GENUINE_COMPUTE -- ``generate_bayesian_update`` has no ``posterior`` parameter at all (verified
by ``tests/unit/test_bayesian_updating.py`` via ``inspect.signature``, same idiom ``challenge.fmea``'s own
``rpn``/``action_priority`` establishes; a caller attempting ``posterior=...`` gets a plain Python ``TypeError``,
not a silently-accepted value), and ``evaluate_bayesian_content_integrity_gate`` independently recomputes it from
the record's own stored ``prior``/``likelihood_given_true``/``likelihood_given_false`` and FAILs on any mismatch
beyond a documented float tolerance (``_FLOAT_TOLERANCE`` below).

THE real numerical trap this method exists to guard against: the denominator
``likelihood_given_true * prior + likelihood_given_false * (1 - prior)`` can be exactly zero (e.g.
``prior=0, likelihood_given_false=0`` -- a hypothesis declared impossible, and the evidence also declared
impossible under the alternative) -- an UNDEFINED posterior, not a valid 0. Refused with its own distinct
``BAYES_UNDEFINED_POSTERIOR`` code inside ``compute_posterior`` BEFORE the division ever runs: never a
``ZeroDivisionError`` crash, never silently returned as 0.

Every probability (``prior``/``likelihood_given_true``/``likelihood_given_false``) must be a real, finite number
in [0,1] -- Python's ``bool`` is an ``int`` subclass, excluded explicitly (``_is_valid_probability`` below),
matching ``stakeholders.game_theory``'s own corrected ``_is_number_excluding_bool`` idiom (that module's own
documented CRITICAL bug: a bare ``isinstance(value, (int, float))`` silently accepts ``True``/``False`` as 1/0,
and an unguarded ``math.isfinite`` on a huge ``int`` raises ``OverflowError`` -- both avoided here the same way:
``int`` is range-checked directly, never passed through ``math.isfinite``).

Stored/compared with ``round(x, 8)`` (matching ``ai_lego.compute.mcda.scoring.normalize_scores`` and
``prediction-tracking-record.schema.yaml``'s own ``error.value`` -- both established rounding conventions for a
calibration-adjacent metric already in this corpus). Gate re-derivation tolerance is ``1e-9`` -- one order of
magnitude tighter than the 8th-decimal-place unit itself (1e-8), enough to absorb JSON round-trip float
representation noise without masking a real tamper at or above the stored precision.

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "bayes"/"posterior"/"calibration"/
"brier" before writing any of this method's own files: hits only in ``prediction-tracking-record.schema.yaml``/
``learning.prediction_tracking.contract.yaml`` (a SINGLE PROBABILITY-type prediction's own Brier score against
ONE later-observed outcome -- that file's own OQ-PREDICTIONTRACKING-2 explicitly defers cross-record
calibration-curve aggregation, i.e. this Atlas F10 row, to a future method) and this file's own sibling
``epistemic.confidence_calibration`` (the OTHER F10 quantitative row -- a genuinely different method: aggregating
MANY stated-confidence/actual-outcome pairs into one Brier score, not updating a single belief via Bayes' rule).
Zero pre-existing implementation of Bayesian updating itself found.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.bayesian_updating"
RECORD_ID_PREFIX = "BAYES-"

# Compilation decision (disclosed, method module docstring): storage rounds to 8dp, so a 1e-9 gate tolerance is
# one order of magnitude tighter than that unit -- absorbs float round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9

_STORED_KEYS = frozenset(
    {"id", "version", "generated_by_method", "hypothesis", "prior", "likelihood_given_true", "likelihood_given_false", "posterior", "evidence_ref", "provenance"}
)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_probability(value: Any) -> bool:
    """A prior/likelihood must be a real, finite number in [0,1]. ``bool`` excluded (Python's ``bool`` is an
    ``int`` subclass -- a bare ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as
    1/0, the same documented trap ``stakeholders.game_theory``'s own corrected ``_is_number_excluding_bool``
    guards against). ``int`` is unconditionally finite in Python (arbitrary precision, never inf/nan) and is
    range-checked directly rather than passed through ``math.isfinite`` -- that function raises
    ``OverflowError`` on a huge ``int`` (game_theory's own second critic-found bug), a trap only reachable via
    the ``float`` branch below."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= 1
    if isinstance(value, float):
        return math.isfinite(value) and 0.0 <= value <= 1.0
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def compute_posterior(prior: float, likelihood_given_true: float, likelihood_given_false: float) -> float:
    """GENUINE_COMPUTE: Bayes' rule. Never accepted as an input -- always derived here, and independently
    re-derived by ``evaluate_bayesian_content_integrity_gate``. Raises ``BAYES_UNDEFINED_POSTERIOR`` (not
    ``ZeroDivisionError``, not a silent 0) when the denominator is exactly zero -- a genuinely undefined
    posterior, not a valid answer. Result rounded to 8 decimal places (module docstring). Callers must validate
    each argument is a real finite [0,1] number BEFORE calling this (``_is_valid_probability``) -- this function
    trusts its own three numeric arguments, the same "pure compute, validated inputs only" boundary
    ``challenge.fmea``'s own ``compute_rpn``/``compute_action_priority`` already establish."""
    denominator = likelihood_given_true * prior + likelihood_given_false * (1 - prior)
    if denominator == 0:
        raise InvariantViolation(
            f"BAYES_UNDEFINED_POSTERIOR: likelihood_given_true*prior + likelihood_given_false*(1-prior) == 0 "
            f"(prior={prior!r}, likelihood_given_true={likelihood_given_true!r}, likelihood_given_false={likelihood_given_false!r}) "
            "-- the posterior is mathematically undefined, not zero"
        )
    return round((likelihood_given_true * prior) / denominator, 8)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_bayesian_update(
    record_id: str,
    hypothesis: str,
    prior: float,
    likelihood_given_true: float,
    likelihood_given_false: float,
    evidence_ref: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/bayesian-update.schema.yaml``.

    Deliberately has NO ``posterior`` parameter -- GENUINE_COMPUTE via ``compute_posterior``, never
    caller-supplied (verified by ``tests/unit/test_bayesian_updating.py`` via ``inspect.signature``; a caller
    attempting a ``posterior=`` keyword argument gets a plain ``TypeError``). Enforces all real invariants
    fail-closed, in order: id/version/provenance shape, then hypothesis/evidence_ref, then each probability
    (finite, [0,1], bool excluded), then the posterior computation itself (raises
    ``BAYES_UNDEFINED_POSTERIOR`` on a zero denominator -- never crashes, never silently returns 0).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BAYES_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BAYES_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BAYES_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(hypothesis):
        raise InvariantViolation(f"BAYES_INVALID_HYPOTHESIS: hypothesis must be a non-empty string, got {hypothesis!r}")
    if not _is_nonempty_str(evidence_ref):
        raise InvariantViolation(f"BAYES_INVALID_EVIDENCE_REF: evidence_ref must be a non-empty string, got {evidence_ref!r}")
    for name, value in (("prior", prior), ("likelihood_given_true", likelihood_given_true), ("likelihood_given_false", likelihood_given_false)):
        if not _is_valid_probability(value):
            raise InvariantViolation(f"BAYES_INVALID_PROBABILITY: {name} must be a real finite number in [0,1] (bool excluded), got {value!r}")

    posterior = compute_posterior(prior, likelihood_given_true, likelihood_given_false)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "hypothesis": hypothesis,
        "prior": prior,
        "likelihood_given_true": likelihood_given_true,
        "likelihood_given_false": likelihood_given_false,
        "posterior": posterior,
        "evidence_ref": evidence_ref,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_bayesian_update -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_bayesian_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_bayesian_update``, so a hand-tampered record (e.g. a spliced-in wrong ``posterior``,
    or one whose stored ``prior``/likelihoods actually denominator to zero) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("bayesian_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("bayesian_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("bayesian_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = (_STORED_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "bayesian_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    if not _is_nonempty_str(record.get("hypothesis")):
        problems.append("hypothesis missing, empty, or not a string")
    if not _is_nonempty_str(record.get("evidence_ref")):
        problems.append("evidence_ref missing, empty, or not a string")

    prior, likelihood_given_true, likelihood_given_false = record.get("prior"), record.get("likelihood_given_true"), record.get("likelihood_given_false")
    for name, value in (("prior", prior), ("likelihood_given_true", likelihood_given_true), ("likelihood_given_false", likelihood_given_false)):
        if not _is_valid_probability(value):
            problems.append(f"{name} is not a valid finite [0,1] number (bool excluded): {value!r}")

    if not (_is_valid_probability(prior) and _is_valid_probability(likelihood_given_true) and _is_valid_probability(likelihood_given_false)):
        problems.append("posterior could not be independently recomputed: prior/likelihoods failed validation above")
        return _result("bayesian_content_integrity", not problems, [{"problems": problems}], validator, timestamp)

    try:
        expected_posterior = compute_posterior(prior, likelihood_given_true, likelihood_given_false)
    except InvariantViolation as error:
        problems.append(f"posterior is undefined for the record's own stored inputs: {error}")
        return _result("bayesian_content_integrity", not problems, [{"problems": problems}], validator, timestamp)

    stored_posterior = record.get("posterior")
    if not isinstance(stored_posterior, (int, float)) or isinstance(stored_posterior, bool) or abs(stored_posterior - expected_posterior) > _FLOAT_TOLERANCE:
        problems.append(f"posterior={stored_posterior!r} does not match recomputed {expected_posterior!r} (tolerance {_FLOAT_TOLERANCE})")

    return _result("bayesian_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_bayesian_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_bayesian_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
