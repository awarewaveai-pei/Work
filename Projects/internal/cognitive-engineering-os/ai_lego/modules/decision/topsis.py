"""``decision.topsis`` -- Method Atlas slice, 7th member of the ``decision`` family (F16), after
``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/``decision.rice``/
``decision.moscow``.

Atlas F16 tool table (L769) gives this method a single citation: "TOPSIS |
距理想/最差解排序 | normalize→ideal points→distance | 量化方案比較" -- no
dedicated section beyond it (grep-confirmed across the whole spec root, same
"one table row only" scope ``root_cause.fault_tree``/``decision.rice``/
``learning.prediction_tracking`` already establish for their own methods).

DUE-DILIGENCE (the due-diligence question this session's own
``decision.rice.py``/``decision.ice.py`` already asked and answered for
themselves against the same sibling: is this genuinely distinct from
``decision.mcda``, or MCDA with an extra label? ``ai_lego/modules/decision/mcda.py``
and ``ai_lego/compute/mcda/scoring.py`` both read in full before writing this
module):

1. **MCDA ranks by weighted SUM; TOPSIS ranks by EUCLIDEAN DISTANCE to two
   computed reference points.** MCDA's own Score stage
   (``mcda.py``:87-92) reuses ``ai_lego.compute.ahp.weights.rank_options``
   UNCHANGED (``ai_lego/compute/ahp/weights.py``:102-112) -- read in full for
   this due-diligence: its entire body is a plain
   ``totals[option_id] += weight * entry["score"]`` accumulate-and-sum loop,
   with no ``sqrt``, no squared term, no concept of a reference point
   anywhere. TOPSIS instead computes TWO per-criterion reference vectors (a
   "positive ideal" and a "negative ideal", each the per-criterion best/worst
   value actually achieved across the option set in THIS record) and ranks by
   ``distance_to_anti_ideal / (distance_to_ideal + distance_to_anti_ideal)``
   -- distance geometry, not a weighted accumulate-and-sum. Grepped
   exhaustively across ``ai_lego/compute/`` and ``ai_lego/modules/`` before
   writing this module: zero existing hits for "topsis"/"euclidean"/
   "ideal_point"/"anti_ideal" anywhere in this package. Distinct
   GENUINE_COMPUTE method, not a duplicate.
2. **Same input shape (options/criteria/raw_scores/weights) is not the same
   claim as "same method"** -- ``decision.rice``'s own module docstring
   already established this exact distinction for a different sibling
   (RICE's formula-shape argument); here the shared input shape is real
   (both methods legitimately need the same four inputs to be well-posed),
   but the AGGREGATION step is what differs, and aggregation is the part
   that actually defines "what kind of MCDA method is this."
3. **The Normalize stage is legitimately SHARED, not TOPSIS-specific.**
   ``ai_lego.compute.mcda.scoring.normalize_scores`` is direction-aware
   min-max normalization with nothing MCDA-specific in its own
   implementation (a plain per-criterion min/max scan) -- the same class of
   "generic compute function that happens to have been written first for one
   family" cross-family reuse ``evaluate_statistical_gate`` (research ->
   root_cause.pareto -> decision.ahp -> decision.mcda) and
   ``ai_lego.compute.ahp.weights.rank_options`` (ahp -> mcda) already
   establish repeatedly in this package. Reused UNCHANGED here for the same
   reason mcda-analysis.schema.yaml's own compilation_decisions already
   documents for its own reuse of ``rank_options``: relocating or duplicating
   working, hand-verified compute code is a worse outcome than one
   cross-family import. See ``ai_lego/compute/topsis/distance.py``'s own
   module docstring for the disclosed methodology consequence (min-max, not
   classic TOPSIS's own vector normalization) and why weights are applied
   BEFORE ideal points/distances (classic TOPSIS's own real methodology, not
   a compilation guess).

CONCLUSION: genuinely distinct method, not a reuse entry. Built as a new
module (this file) plus a new compute package (``ai_lego/compute/topsis/``),
not a contract-only alias of ``decision.mcda``.

DESIGN (three real, independently-enforced invariants, construction AND
gate, same "raise before construction" / "gate re-derives, never trusts a
stored value" two-layer discipline every prior module in this package uses):

1. **Ideal/anti-ideal points are GENUINE_COMPUTE** (never caller-supplied,
   never trusted as stored) -- computed at construction by
   ``ai_lego.compute.topsis.distance.compute_ideal_points`` (via
   ``compute_topsis_ranking``) and independently RE-DERIVED by
   ``evaluate_genuine_compute_gate`` from the record's own stored
   ``normalized_scores``/``weights`` on every call.
2. **The closeness_coefficient ranking is GENUINE_COMPUTE** -- same
   treatment, via the SAME ``compute_topsis_ranking`` call (one function,
   both invariants; see that function's own docstring). Re-derivation scope
   is disclosed: from the record's own stored ``normalized_scores`` forward,
   not from ``raw_scores`` -- the same scope ``decision.mcda``'s own gate
   already keeps (see ``evaluate_genuine_compute_gate``'s own docstring and
   OQ-TOPSIS-2 in the sibling contract).
3. **TOPSIS_TOO_FEW_OPTIONS** -- adapted from ``decision.mcda``'s own
   ``MCDA_TOO_FEW_OPTIONS`` (``mcda.py``:79-80) under the identical
   reasoning: a relative ideal/anti-ideal point is meaningless with fewer
   than 2 options (the max/min across a 1-element set is that element
   itself, collapsing both reference points onto the same option). Checked
   at CONSTRUCTION and independently re-derived by
   ``evaluate_topsis_structure_gate`` (a hand-tampered copy of an
   already-valid record with an option stripped afterward must still be
   caught, not just whatever the builder happened to validate).

Unlike ``decision.mcda`` (Atlas §22.3 L4154 directly cites a "no Automatic
Authority" forbidden_transition for MCDA specifically) and ``decision.rice``
(its own dedicated Sec.12.32 limit), TOPSIS carries no equivalent citation
anywhere in the corpus (grep-confirmed) -- no ``assert_no_automatic_authority_claim``
is built here; see the sibling contract's own ``compilation_decisions``/
OQ-TOPSIS-1 for why this is a disclosed absence, not a silent gap
(``root_cause.fault_tree``'s own contract already sets this exact precedent
for a different single-citation method).

Shape validation is stricter here than ``decision.mcda.py``'s own precedent:
``generate_mcda_analysis`` lets a malformed ``options``/``criteria`` entry
(e.g. missing an ``id`` key) surface as a raw ``KeyError`` rather than a
clean ``InvariantViolation`` -- not reproduced here. This module adds real
``_is_valid_option``/``_is_valid_criterion`` shape guards (closed key set,
non-empty strings) plus duplicate-id checks for both ``options``/``criteria``
(a duplicate id would make ``compute_topsis_ranking``'s own per-option/
per-criterion dict grouping silently drop data rather than crash or raise --
the same "silent data corruption is worse than a loud failure" class
``root_cause.fault_tree``'s own ``FAULTTREE_DUPLICATE_ID`` guards against).
Storage is also stricter: ``generate_mcda_analysis`` stores ``list(options)``
-- a shallow copy of the OUTER list only, leaving every inner dict aliased
to the caller's own object, so a caller mutating ``options[0]["label"]``
after construction silently corrupts the already-returned record (caught by
this module's own test suite while it was being written, by a test modeled
on ``root_cause.fault_tree``'s own equivalent). This module instead stores
``[dict(o) for o in options]`` (and the same for ``criteria``/``raw_scores``/
``weights``) -- fault_tree's own, more rigorous convention, adopted here
deliberately rather than reproducing MCDA's gap.
Deliberately does NOT re-validate ``direction``'s own enum membership
(``maximize``/``minimize``) a second time -- ``normalize_scores`` (reused,
called later in ``generate_topsis_analysis``) already owns that check
(``MCDA_INVALID_DIRECTION``); this module accepts that cross-family
error-code passthrough, the same way ``decision.mcda`` itself already
accepts ``AHP_*``-prefixed errors surfacing from its own reuse of
``rank_options``.
"""

from __future__ import annotations

import importlib
from typing import Any

from ai_lego.compute.mcda.scoring import normalize_scores, validate_weights_sum_to_one
from ai_lego.compute.topsis.distance import compute_topsis_ranking
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decision.topsis"
RECORD_ID_PREFIX = "TOPSIS-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.topsis.distance.compute_topsis_ranking"

_KNOWN_OPTION_KEYS = frozenset({"id", "label"})
_KNOWN_CRITERION_KEYS = frozenset({"id", "label", "direction"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a bare recursive ``repr()`` over caller-
    supplied input of unknown size, same DoS-avoidance discipline every sibling module's own
    ``_shallow_describe`` establishes (e.g. ``mcda.py``, ``fault_tree.py``, ``rice.py``)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_option(value: Any) -> bool:
    return isinstance(value, dict) and set(value.keys()) == _KNOWN_OPTION_KEYS and _is_nonempty_str(value.get("id")) and _is_nonempty_str(value.get("label"))


def _is_valid_criterion(value: Any) -> bool:
    """Shape only -- ``id``/``label``/``direction`` non-empty strings. ``direction``'s own ENUM membership
    (maximize/minimize) is deliberately NOT re-checked here -- see module docstring for why."""
    return isinstance(value, dict) and set(value.keys()) == _KNOWN_CRITERION_KEYS and _is_nonempty_str(value.get("id")) and _is_nonempty_str(value.get("label")) and _is_nonempty_str(value.get("direction"))


def generate_topsis_analysis(
    analysis_id: str,
    options: list[dict[str, Any]],
    criteria: list[dict[str, Any]],
    raw_scores: list[dict[str, Any]],
    weights: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/topsis-analysis.schema.yaml``.

    Enforces preconditions fail-closed, in order: id/version shape, options
    (>=2, well-shaped, unique ids -- ``TOPSIS_TOO_FEW_OPTIONS``, invariant
    #3), criteria (non-empty, well-shaped, unique ids), then delegates
    direction/weight-sum validation to the REUSED
    ``ai_lego.compute.mcda.scoring`` functions. ``normalized_scores``,
    ``weighted_normalized_scores``, ``ideal_points``, and ``ranking`` are
    ALWAYS computed here, never accepted as parameters -- same discipline
    every genuine-compute module in this package already applies to its own
    derived fields.
    """
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TOPSIS_INVALID_RECORD_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TOPSIS_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(options, list):
        raise InvariantViolation(f"TOPSIS_INVALID_OPTIONS: options must be a list, got {_shallow_describe(options)}")
    if len(options) < 2:
        raise InvariantViolation(f"TOPSIS_TOO_FEW_OPTIONS: {len(options)} supplied, at least 2 required -- a relative ideal/anti-ideal point is meaningless with fewer than 2 options")
    if not all(_is_valid_option(o) for o in options):
        raise InvariantViolation(f"TOPSIS_INVALID_OPTIONS: every option must be a dict with exactly 'id'/'label', both non-empty strings, got {_shallow_describe(options)}")
    option_ids = [o["id"] for o in options]
    if len(set(option_ids)) != len(option_ids):
        duplicates = sorted({i for i in option_ids if option_ids.count(i) > 1})
        raise InvariantViolation(f"TOPSIS_DUPLICATE_OPTION_ID: id(s) {duplicates} used more than once in options")

    if not isinstance(criteria, list) or not criteria:
        raise InvariantViolation(f"TOPSIS_NO_CRITERIA: at least 1 criterion required, got {_shallow_describe(criteria)}")
    if not all(_is_valid_criterion(c) for c in criteria):
        raise InvariantViolation(f"TOPSIS_INVALID_CRITERIA: every criterion must be a dict with exactly 'id'/'label'/'direction', all non-empty strings, got {_shallow_describe(criteria)}")
    criteria_ids = [c["id"] for c in criteria]
    if len(set(criteria_ids)) != len(criteria_ids):
        duplicates = sorted({i for i in criteria_ids if criteria_ids.count(i) > 1})
        raise InvariantViolation(f"TOPSIS_DUPLICATE_CRITERION_ID: id(s) {duplicates} used more than once in criteria")

    validate_weights_sum_to_one(weights, criteria_ids)
    normalized = normalize_scores(raw_scores, criteria)
    computed = compute_topsis_ranking(normalized, weights, option_ids, criteria_ids)

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "options": [dict(o) for o in options],
        "criteria": [dict(c) for c in criteria],
        "raw_scores": [dict(r) for r in raw_scores],
        "weights": [dict(w) for w in weights],
        "normalized_scores": normalized,
        "weighted_normalized_scores": computed["weighted_normalized_scores"],
        "ideal_points": computed["ideal_points"],
        "ranking": computed["ranking"],
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(analysis.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": analysis.get("provenance")}], validator, timestamp)


def evaluate_topsis_structure_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #3, re-derived independently at the GATE layer (not just at construction): a hand-tampered
    copy of an already-valid record with an option stripped afterward (e.g. ``record["options"].pop()``)
    must still be caught -- ``TOPSIS_TOO_FEW_OPTIONS``'s own construction-time check alone would miss this,
    same "malformed structure anywhere, not just at the top" discipline ``root_cause.fault_tree``'s own
    integrity gate already establishes. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(analysis, dict):
        return _result("topsis_structure", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    options = analysis.get("options")
    criteria = analysis.get("criteria")
    options_valid = isinstance(options, list) and all(_is_valid_option(o) for o in options)
    criteria_valid = isinstance(criteria, list) and all(_is_valid_criterion(c) for c in criteria)
    checks = {
        "id_has_topsis_prefix": _is_nonempty_str(analysis.get("id")) and analysis["id"].startswith(RECORD_ID_PREFIX),
        "options_well_shaped": options_valid,
        "at_least_two_options": options_valid and len(options) >= 2,
        "option_ids_unique": options_valid and len({o["id"] for o in options}) == len(options),
        "criteria_well_shaped": criteria_valid,
        "at_least_one_criterion": criteria_valid and bool(criteria),
        "criterion_ids_unique": criteria_valid and len({c["id"] for c in criteria}) == len(criteria),
    }
    return _result("topsis_structure", all(checks.values()), [checks], validator, timestamp)


def _provenance_ref_resolves(ref: Any) -> bool:
    if not isinstance(ref, str) or not ref.startswith("ai_lego.compute."):
        return False
    module_name, _, attr = ref.rpartition(".")
    try:
        return callable(getattr(importlib.import_module(module_name), attr))
    except Exception:
        return False


def _safe_recompute(analysis: dict[str, Any]) -> dict[str, Any] | None:
    """Fail-closed wrapper for GATE use only -- re-derives ``weighted_normalized_scores``/``ideal_points``/
    ``ranking`` fresh from the record's own raw ``normalized_scores``/``weights``/``options``/``criteria``
    via the SAME ``compute_topsis_ranking`` the builder itself calls (invariants #1 and #2, one call).
    Returns ``None`` (never a value that could accidentally compare equal to a malformed stored value) on
    any failure, same discipline ``learning.prediction_tracking``'s own ``_safe_recompute_error``
    establishes."""
    options, criteria = analysis.get("options"), analysis.get("criteria")
    normalized_scores, weights = analysis.get("normalized_scores"), analysis.get("weights")
    if not (isinstance(options, list) and all(_is_valid_option(o) for o in options)):
        return None
    if not (isinstance(criteria, list) and all(_is_valid_criterion(c) for c in criteria)):
        return None
    if not isinstance(normalized_scores, list) or not isinstance(weights, list):
        return None
    try:
        return compute_topsis_ranking(normalized_scores, weights, [o["id"] for o in options], [c["id"] for c in criteria])
    except InvariantViolation:
        return None


def evaluate_genuine_compute_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariants #1 and #2, re-derived independently: RE-INVOKES ``compute_topsis_ranking`` against the
    record's own raw ``normalized_scores``/``weights``/``options``/``criteria`` fields and compares the
    result's ``weighted_normalized_scores``/``ideal_points``/``ranking`` to the stored values -- never
    trusts them, the same strong recompute-and-compare discipline ``decision.rice``'s own gate establishes
    (stronger than ``decision.mcda``/``decision.ahp``'s own resolvability-only check -- see module
    docstring). Also checks the ``engine``/``computation_provenance_ref`` trail, same as every
    genuine-compute sibling.

    SCOPE (disclosed, not a silent gap): re-derives from the record's own STORED ``normalized_scores``, not
    from ``raw_scores`` -- the same scope ``decision.mcda``'s own gate already keeps (it does not
    re-verify ``normalized_scores`` against ``raw_scores`` either); see OQ-TOPSIS-2 in the sibling contract.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(analysis, dict):
        return _result("genuine_compute", False, [{"reason": "analysis is not a dict"}], validator, timestamp)

    recomputed = _safe_recompute(analysis)
    checks: dict[str, Any] = {
        "recompute_succeeded": recomputed is not None,
        "engine_is_deterministic_compute_not_llm": analysis.get("engine") == "local_python_deterministic_compute",
        "computation_provenance_ref_resolves": _provenance_ref_resolves(analysis.get("computation_provenance_ref")),
    }
    if recomputed is None:
        return _result("genuine_compute", False, [checks], validator, timestamp)

    checks["stored_weighted_normalized_scores_matches_recomputed"] = analysis.get("weighted_normalized_scores") == recomputed["weighted_normalized_scores"]
    checks["stored_ideal_points_matches_recomputed"] = analysis.get("ideal_points") == recomputed["ideal_points"]
    checks["stored_ranking_matches_recomputed"] = analysis.get("ranking") == recomputed["ranking"]
    return _result("genuine_compute", all(checks.values()), [checks, {"recomputed_ranking": recomputed["ranking"]}], validator, timestamp)


def evaluate_topsis_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_topsis_structure_gate(analysis, validator, timestamp),
        evaluate_genuine_compute_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
