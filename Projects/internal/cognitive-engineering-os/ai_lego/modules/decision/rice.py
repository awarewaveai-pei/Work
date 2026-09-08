"""``decision.rice`` -- Method Atlas slice, third member of the ``decision`` family (F16), after
``decision.ahp`` and ``decision.mcda``.

Atlas gives this method independent, converging citations at two locations:
the F16 tool table (L762, "RICE | Reach x Impact x Confidence / Effort |
產品 roadmap | 納入受影響人數") and its own dedicated Sec.12.32 section
(L2955-2966, formula + purpose + benefit + limit). Both agree on the exact
same formula and give RICE ZERO pipeline stages, ZERO worked example, and
ZERO field-level shape -- far less textual grounding than ``decision.mcda``'s
own 8-node pipeline (Sec.11.32) or ``decision.ahp``'s Saaty-cited pairwise
methodology. Nearly every field shape below is therefore Phase 3
compilation, disclosed as such in the sibling contract file's own
``compilation_decisions``/``open_questions``, not a citation.

DUE-DILIGENCE (the same due-diligence question this session's own
``decision.mcda.contract.yaml`` already asked and answered for itself
against a prior sibling: is this genuinely distinct from ``decision.mcda``,
or just MCDA with 4 fixed criteria and a formula label?):

1. **MCDA is structurally a weighted SUM, never a product-over-a-divisor.**
   ``decision.mcda``'s own Score stage (``ai_lego/modules/decision/mcda.py``:87-88)
   reuses ``ai_lego.compute.ahp.weights.rank_options`` UNCHANGED
   (``ai_lego/compute/ahp/weights.py``:102-112) -- read in full for this
   due-diligence: its entire body is
   ``totals[option_id] += weight * entry["score"]``, an accumulate-and-sum
   loop with NO division operator anywhere. RICE's own formula
   (Reach x Impact x Confidence / Effort) has Effort as a DIVISOR -- there
   is no way to encode "divide by this criterion" in MCDA's weighted-sum
   shape (a weight multiplies, and MCDA's own weights are schema-bounded to
   ``[0, 1]`` summing to ``1.0`` --
   ``specs/cognitive/typed-objects/mcda-analysis.schema.yaml``:165-175 --
   never a raw unbounded divisor). This is a genuine arithmetic-shape
   difference, not a relabeling.
2. **Effort-as-divisor creates a real numerical-stability invariant MCDA
   cannot have.** A weighted-sum model never divides, so it has no
   "near-zero denominator" failure mode; RICE does, and this module rejects
   it explicitly (``RICE_NONPOSITIVE_EFFORT``, never a silent floor -- see
   ``ai_lego/compute/rice/scoring.py::compute_rice_score``).
3. **MCDA's own normalization is RELATIVE to the option set being compared
   in the SAME record; RICE's score is ABSOLUTE per idea.**
   ``ai_lego/compute/mcda/scoring.py``:53-64's own min-max normalization
   (``lo, hi = min(values), max(values)``) recomputes every option's
   normalized score relative to whichever sibling options happen to be in
   the SAME ``raw_scores`` list -- adding or removing an option changes
   every OTHER option's normalized value. RICE's formula has no such
   cross-option dependency: one idea's score never changes because another
   idea was added to or removed from a backlog. This is also why
   ``decision.mcda`` requires >= 2 options to even run
   (``MCDA_TOO_FEW_OPTIONS``, ``mcda.py``:75-76) while ``RiceScoreRecord``
   (this module) scores exactly ONE idea per record -- a rolling backlog
   compares many independently-generated records by sorting their scores,
   it does not bundle them into one comparison object the way
   ``MCDAAnalysis`` does. Atlas's own Sec.12.32 text never mentions
   "options" or a comparison pipeline, consistent with this shape.
4. **Reach requires a real unit/timeframe label.** Atlas's F16 table
   benefit column for RICE (L762) is specifically "納入受影響人數"
   (incorporates the NUMBER OF PEOPLE AFFECTED) -- an unlabeled bare number
   fails this cited benefit outright: "500" is meaningless for cross-idea
   roadmap comparison without knowing whether it is 500 users/quarter, 500
   users/year, or 500 total signups ever. ``reach`` is therefore modeled as
   ``{value, unit}``, not a bare number (``reach_unit_required`` gate,
   grounded in this exact citation) -- a structural requirement MCDA's own
   generic ``raw_value: number`` criterion shape
   (``mcda-analysis.schema.yaml``:152-163) has no equivalent of.

CONCLUSION: genuinely distinct method, not a reuse entry. Built as a new
module, not a contract-only alias of ``decision.mcda`` (contrast
``architecture.trade_off_matrix``, which WAS registered as a true
contract-only duplicate of ``decision.mcda`` -- see that contract's own
``decided_by`` and ``test_mcda.py``'s own
``test_architecture_trade_off_matrix_stays_a_true_duplicate_of_mcda`` --
because that method really is field-for-field identical to MCDA; RICE is
not).

ICE cross-check (``decision.ice``, a concurrent agent's own slice in this
same batch): ``ai_lego/modules/decision/*.py`` held only ``ahp.py``,
``mcda.py``, ``__init__.py`` when this module's initial due-diligence pass
was written -- ``ice.py`` did not yet exist then, so the paragraph above
was written from Atlas's own text alone. ``ice.py`` landed later in the
same batch and was read in full as a follow-up (per this module's own
brief: "if ice.py exists when you check, read it"). Two findings:
1. **No contradiction, confirmed.** ``ice.py``'s own field names are
   literally ``impact``/``confidence``/``ease`` (``_KNOWN_INPUT_ITEM_KEYS``,
   ``ice.py``:79) -- Atlas's "Ease", never "Effort", exactly as flagged
   above. RICE's own ``effort`` field is untouched by this; OQ-RICE-2
   stays open as originally written, now with direct code confirmation
   instead of only the table-row citation.
2. **A real, disclosed shape divergence, found only on this later read.**
   ``ice.py``'s own ``generate_ice_score_record`` takes an ``items: list[...]``
   (``minItems: 1``, so 1-to-N ideas per record, each scored ABSOLUTELY --
   no cross-item normalization, ``ice.py``:24-37's own due-diligence makes
   the identical absolute-vs-MCDA's-relative argument this module's own
   point 3 above independently arrived at) plus a derived ``ranking[]``.
   This module (RICE) instead models exactly ONE idea per record (see
   `compilation_decisions` in the sibling contract). Both are defensible
   under the same "absolute, not relative" principle -- ICE's own docstring
   proves a batch container does not by itself reintroduce MCDA-style
   cross-item dependence. The difference is a batch-convenience API shape,
   not a substantive scoring difference, and is left unreconciled here (see
   OQ-RICE-4 in the sibling contract) rather than silently copied either
   way after the fact.

TWO real, independently-enforced invariants (construction AND gate, same
"raise before construction" / "gate re-derives, never trusts a stored
value" two-layer discipline ``root_cause.fault_tree`` and ``decision.mcda``
already establish):

1. **Effort must be > 0** (``RICE_NONPOSITIVE_EFFORT``) -- division by a
   non-positive effort is undefined/sign-inverting; rejected explicitly at
   BOTH the compute layer (``compute_rice_score``, called from
   construction) and re-derived independently by
   ``evaluate_rice_genuine_compute_gate`` against the record's own stored
   ``effort`` field (a hand-tampered record with ``effort: -5`` written
   directly, bypassing the constructor, is still caught).
2. **The stored ``rice_score`` is GENUINE_COMPUTE** -- unlike
   ``decision.mcda``/``decision.ahp``'s own ``evaluate_genuine_compute_gate``
   (``mcda.py``:119-124, ``ahp.py``:104-108), which only checks
   ``computation_provenance_ref`` RESOLVABILITY and provenance shape (never
   re-running the actual arithmetic), this module's gate ACTUALLY
   RE-INVOKES ``compute_rice_score`` against the record's own raw
   ``reach``/``impact``/``confidence``/``effort`` fields and compares the
   result to the stored ``rice_score`` with ``math.isclose`` -- a strictly
   stronger check, practical here because RICE's formula is a single scalar
   (MCDA/AHP's own ``normalized_scores``/``ranking`` are variable-length
   lists a generic re-derive-and-diff gate would need much more machinery
   to re-check the same way; left as OQ-RICE-3 for a possible future
   hardening of those two siblings' own gates, not silently assumed out of
   scope for them).
"""

from __future__ import annotations

import importlib
import math
from typing import Any

from ai_lego.compute.rice.scoring import compute_rice_score
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decision.rice"
RECORD_ID_PREFIX = "RICE-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.rice.scoring.compute_rice_score"
# Atlas Sec.12.32 L2965's own cited limit ("限制：分數是 decision aid，不是
# authority") -- the RICE-family equivalent of Sec.22.3 L4154's MCDA row,
# cited from RICE's own dedicated section instead of the cross-cutting gate
# table (RICE carries no Sec.22.3 row of its own -- grepped exhaustively,
# only 3 whole-document hits for "RICE": L762, L2955, L2957). Same
# representative-blocklist-plus-structural-second-layer design
# challenge.red_team.py and decision.mcda.py both already establish,
# independently re-derived here (not imported -- see mcda.py:42-43's own
# comment for why method-specific business logic is not shared across
# families).
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})

_KNOWN_IDEA_KEYS = frozenset({"id", "label"})
_KNOWN_REACH_KEYS = frozenset({"value", "unit"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a bare recursive ``repr()``, same discipline
    ``root_cause.fault_tree``'s own ``_shallow_describe`` establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_idea(value: Any) -> bool:
    return isinstance(value, dict) and set(value.keys()) == _KNOWN_IDEA_KEYS and _is_nonempty_str(value.get("id")) and _is_nonempty_str(value.get("label"))


def _is_valid_reach(value: Any) -> bool:
    """Atlas F16 table (L762) benefit column ('納入受影響人數') requires a REAL, comparable person-count --
    ``unit`` (e.g. 'users/quarter') is required non-empty, not merely the numeric ``value``, so a bare
    unlabeled number can never satisfy this shape."""
    return (
        isinstance(value, dict)
        and set(value.keys()) == _KNOWN_REACH_KEYS
        and _is_finite_number(value.get("value"))
        and value["value"] >= 0
        and _is_nonempty_str(value.get("unit"))
    )


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """Atlas Sec.12.32 L2965's own rule ('RICE 分數是 decision aid，不是 authority'), checked structurally
    BEFORE the record is returned/persisted -- same 'raise before construction' discipline every
    forbidden-transition guard in this package already applies. Guards ``isinstance(record, dict)`` itself,
    matching ``impact_effort.py``'s own precedent (critic finding, 2026-09-08: not currently reachable --
    both call sites already pass a well-shaped dict -- but one accidental refactor away from being so;
    defense-in-depth, not a live bug fix)."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"RICE_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(f"RICE_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority (Atlas Sec.12.32 L2965: RICE score is a decision aid, not authority)")


def generate_rice_record(
    record_id: str,
    idea: dict[str, Any],
    reach: dict[str, Any],
    impact: float,
    confidence: float,
    effort: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/rice-score-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/idea/reach shape, then the arithmetic itself (delegated
    to ``compute_rice_score``, which independently validates impact/confidence/effort and is the SAME
    function ``evaluate_rice_genuine_compute_gate`` re-invokes later -- never a value this constructor
    invents or the gate merely trusts). ``rice_score`` is ALWAYS computed here, never accepted as a
    parameter -- same discipline ``decision.mcda``/``decision.ahp`` already apply to their own
    ``normalized_scores``/``ranking``/``consistency_ratio`` fields."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RICE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RICE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_valid_idea(idea):
        raise InvariantViolation(f"RICE_INVALID_IDEA: idea must be a dict with exactly 'id'/'label', both non-empty strings, got {_shallow_describe(idea)}")
    if not _is_valid_reach(reach):
        raise InvariantViolation(
            f"RICE_INVALID_REACH: reach must be a dict with exactly 'value' (a finite number >= 0) and 'unit' (a non-empty string, e.g. 'users/quarter'), got {_shallow_describe(reach)}"
        )

    rice_score = compute_rice_score(reach["value"], impact, confidence, effort)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "idea": dict(idea),
        "reach": dict(reach),
        "impact": impact,
        "confidence": confidence,
        "effort": effort,
        "rice_score": rice_score,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }
    assert_no_automatic_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def _provenance_ref_resolves(ref: Any) -> bool:
    if not isinstance(ref, str) or not ref.startswith("ai_lego.compute."):
        return False
    module_name, _, attr = ref.rpartition(".")
    try:
        return callable(getattr(importlib.import_module(module_name), attr))
    except Exception:
        return False


def evaluate_rice_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2: RE-INVOKES ``compute_rice_score`` against the record's own raw
    ``reach``/``impact``/``confidence``/``effort`` fields and compares the result to the stored
    ``rice_score`` -- never trusts that stored value, the same 'malformed structure anywhere, not just at
    construction' discipline ``root_cause.fault_tree``'s own integrity gate already establishes, extended
    here from structural graph re-derivation to actual arithmetic re-derivation. FAILS CLOSED (never
    raises) on malformed input, including a stored ``effort <= 0`` that would make ``compute_rice_score``
    itself raise -- caught and reported as a named check, not left to crash the caller."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)

    reach, impact, confidence, effort = record.get("reach"), record.get("impact"), record.get("confidence"), record.get("effort")
    stored_score = record.get("rice_score")
    checks: dict[str, Any] = {
        "reach_valid": _is_valid_reach(reach),
        "impact_valid": _is_finite_number(impact) and impact >= 0,
        "confidence_valid": _is_finite_number(confidence) and 0 <= confidence <= 1,
        "effort_positive": _is_finite_number(effort) and effort > 0,
        "engine_is_deterministic_compute_not_llm": record.get("engine") == "local_python_deterministic_compute",
        "computation_provenance_ref_resolves": _provenance_ref_resolves(record.get("computation_provenance_ref")),
    }
    if not all(checks.values()):
        return _result("genuine_compute", False, [checks], validator, timestamp)

    try:
        recomputed = compute_rice_score(reach["value"], impact, confidence, effort)
    except InvariantViolation as error:
        checks["recompute_succeeded"] = False
        return _result("genuine_compute", False, [checks, {"recompute_error": str(error)}], validator, timestamp)

    score_matches = _is_finite_number(stored_score) and math.isclose(recomputed, stored_score, rel_tol=1e-9, abs_tol=1e-9)
    checks["stored_rice_score_matches_recomputed_value"] = score_matches
    return _result("genuine_compute", score_matches, [checks, {"recomputed_rice_score": recomputed, "stored_rice_score": stored_score}], validator, timestamp)


def evaluate_reach_unit_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas F16 table (L762) benefit column: '納入受影響人數' -- checks PRESENCE of a non-empty
    ``reach.unit`` label only (not any particular unit convention or correctness), the same
    disclosure-only honesty ``decision.mcda``'s own ``sensitivity_disclosed`` gate already applies to its
    differently-cited requirement."""
    if not isinstance(record, dict):
        return _result("reach_unit_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    reach = record.get("reach")
    unit = reach.get("unit") if isinstance(reach, dict) else None
    passed = isinstance(unit, str) and bool(unit.strip())
    return _result("reach_unit_required", passed, [{"reach_unit_present": passed, "reach_unit": unit}], validator, timestamp)


def evaluate_no_automatic_authority_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas Sec.12.32 L2965's rule structurally on any record handed to it -- not just trusting
    that ``generate_rice_record``'s own construction-time check already ran (a hand-crafted/tampered
    record must still be caught, same discipline ``decision.mcda``'s own gate already establishes)."""
    if not isinstance(record, dict):
        return _result("no_automatic_authority_claim", False, [{"reason": "record is not a dict"}], validator, timestamp)
    try:
        assert_no_automatic_authority_claim(record)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_rice_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_rice_genuine_compute_gate(record, validator, timestamp),
        evaluate_reach_unit_required_gate(record, validator, timestamp),
        evaluate_no_automatic_authority_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
