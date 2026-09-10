"""``decision.wsjf`` -- Method Atlas slice, 12th of 13 members of the ``decision`` family (F16).

Atlas gives this method exactly ONE citation, the F16 tool table row (L764:
"WSJF | Cost of Delay ÷ Job Size | portfolio | 突出延遲成本"). Grepped the
entire Atlas document exhaustively for "WSJF"/"Weighted Shortest Job
First"/"Cost of Delay" (case-insensitive): a single whole-document hit,
L764 itself -- no dedicated §11.x/§12.x section (unlike ``decision.rice``'s
own §12.32) and no §22.3 Method-specific Gate row (grepped L4142-4155
directly: only Fishbone/Persona/Scenario Planning/SWOT/AI Expert
Lens/LLM Arithmetic/Red Team/Monte Carlo/MCDA/Jurisdiction Inference are
listed, no WSJF row). This is the thinnest textual grounding of any
``decision``-family member built so far -- even thinner than
``decision.pareto_frontier``'s own benefit-column-only inference (see
``forbidden_transition`` below).

DUE-DILIGENCE (same field-for-field comparison discipline
``decision.rice``'s own module docstring already performed against
``decision.mcda``, now performed against ``decision.rice`` itself, since
both are ratio-shaped methods with a size/effort-like divisor -- the
closest structural sibling, not a rubber-stamped "obviously different
Atlas row" assumption):

1. **RICE's numerator is a PRODUCT; WSJF's numerator is a SUM.**
   ``compute_rice_score`` (``ai_lego/compute/rice/scoring.py``:57) computes
   ``(reach_value * impact * confidence) / effort`` -- three factors
   MULTIPLIED together. This module's own ``compute_wsjf_score``
   (``ai_lego/compute/wsjf/scoring.py``) computes
   ``(business_value + time_criticality + risk_reduction_opportunity_enablement) / job_size``
   -- three factors ADDED together. A product and a sum are genuinely
   different arithmetic shapes with different failure modes: RICE's score
   collapses to exactly zero if ANY single factor is zero (multiplicative
   cancellation); WSJF's Cost of Delay only drops to zero if ALL THREE
   sub-factors are zero (additive accumulation). This is not a relabeling
   of the same formula -- verified by direct read of both compute modules,
   not assumed from the two Atlas table cells alone.
2. **Different usage layer, per Atlas's own table.** RICE's own F16 row
   (L762) usage column is "產品 roadmap" (product roadmap); WSJF's own row
   (L764) usage column is "portfolio" -- a coarser altitude in SAFe-style
   terminology (a portfolio contains many roadmaps). Atlas draws this
   distinction explicitly in its own table, not inferred here.
3. **Cost of Delay's own 3-factor decomposition has no equivalent anywhere
   in RICE.** RICE's 4 factors (reach/impact/confidence/effort) are each
   independent top-level record fields with no further decomposition. This
   module's ``cost_of_delay`` is itself a compiled 3-factor sub-object
   (business_value/time_criticality/risk_reduction_opportunity_enablement)
   -- an external SAFe convention, disclosed as such (not Atlas-invented;
   Atlas L764 names only the aggregate "Cost of Delay"), chosen because a
   single opaque Cost-of-Delay number would make this method
   indistinguishable from a generic value/cost ratio and would defeat
   Atlas's own cited benefit for this exact row ("突出延遲成本" -- spotlight
   cost of delay): an inspectable breakdown operationalizes that citation
   directly (``evaluate_cost_of_delay_breakdown_disclosed_gate`` below); an
   opaque number cannot. See ``compilation_decisions`` in the sibling
   contract for the full reasoning and the rejected alternative.
4. **MCDA's weighted-sum shape still cannot express either method.** Same
   argument ``decision.rice``'s own docstring already made against
   ``decision.mcda``'s ``rank_options`` (``ai_lego/compute/ahp/weights.py``:
   102-112, a plain ``totals[option_id] += weight * entry["score"]``
   accumulate loop, no division operator anywhere): MCDA has no divisor
   stage at all, so it cannot express Job Size any more than it could
   express RICE's Effort. This module reuses that already-established
   argument rather than re-deriving it from scratch (re-verified by reading
   ``ai_lego/modules/decision/mcda.py`` in full, not merely cited from
   memory of ``decision.rice``'s own prior finding).

CONCLUSION: genuinely distinct from both ``decision.rice`` (product vs sum
numerator, product-roadmap vs portfolio altitude, no sub-factor
decomposition in RICE) and ``decision.mcda`` (no division stage at all).
Built as a new module, not a contract-only alias of either sibling
(contrast ``architecture.trade_off_matrix``, which WAS registered as a true
contract-only duplicate of ``decision.mcda`` -- see that contract's own
``decided_by``).

Grepped ``ai_lego/`` exhaustively for "cost_of_delay"/"CostOfDelay"/
"job_size"/"JobSize" (case-insensitive) before writing any of this
module's own files: zero pre-existing hits anywhere in the package,
including ``ai_lego/modules/devops_sre/error_budget.py`` (a plausible
portfolio-timing-language false-positive candidate, read via grep, no
match) -- confirming no prior slice already claimed this field shape.

decision.kano (F16 row L765, the last remaining F16 member) is being built
concurrently in this same batch by a different agent and was NOT read here
-- this module's own field names (job/cost_of_delay/job_size) are
Atlas-grounded (L764's own formula terms), not derived from or compared
against Kano's Basic/Performance/Delighter categorical shape, so no
plausible overlap is expected; left as OQ-WSJF-5 in the sibling contract
for a future integration pass to confirm, the same class of deferred
cross-check ``decision.rice``'s own ICE cross-check performed as a
follow-up once ``ice.py`` existed.

TWO real, independently-enforced invariants (construction AND gate, same
"raise before construction" / "gate re-derives, never trusts a stored
value" two-layer discipline every genuine-compute sibling in this family
already establishes):

1. **Job Size must be > 0** (``WSJF_NONPOSITIVE_JOB_SIZE``) -- division by a
   non-positive job_size is undefined/sign-inverting; rejected explicitly at
   BOTH the compute layer (``compute_wsjf_score``, called from
   construction) and re-derived independently by
   ``evaluate_wsjf_genuine_compute_gate`` against the record's own stored
   ``job_size`` field (a hand-tampered record with ``job_size: -5`` written
   directly, bypassing the constructor, is still caught).
2. **BOTH stored ``cost_of_delay_total`` and ``wsjf_score`` are
   GENUINE_COMPUTE** -- following ``decision.rice``'s own stronger pattern
   (NOT ``decision.mcda``/``decision.ahp``'s own
   ``evaluate_genuine_compute_gate``, which reuses
   ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED and only
   checks ``computation_provenance_ref`` resolvability/shape, never
   re-running the actual arithmetic -- ``mcda.py``:125-129). This module's
   gate ACTUALLY RE-INVOKES ``compute_cost_of_delay`` and
   ``compute_wsjf_score`` against the record's own raw
   ``cost_of_delay``/``job_size`` fields and compares BOTH results to the
   stored ``cost_of_delay_total``/``wsjf_score`` with ``math.isclose`` --
   strictly stronger than even ``decision.rice``'s own single-quantity
   recompute-and-compare gate (``rice.py::evaluate_rice_genuine_compute_gate``),
   since WSJF has two independently-computed, independently-storable
   quantities to re-derive rather than one. Practical here for the same
   reason it is practical for RICE: both quantities are single scalars per
   record, not MCDA/AHP's own variable-length lists.
"""

from __future__ import annotations

import importlib
import math
from typing import Any

from ai_lego.compute.wsjf.scoring import compute_cost_of_delay, compute_wsjf_score
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decision.wsjf"
RECORD_ID_PREFIX = "WSJF-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.wsjf.scoring.compute_wsjf_score"
# No §22.3 row and no dedicated-section caution sentence exist for WSJF (grepped exhaustively -- see module
# docstring), unlike decision.rice's own §12.32 L2965 citation. This is therefore INFERRED purely from
# family-wide consistency (every decision-family sibling built so far enforces this same rule regardless of
# its own citation strength), not from any WSJF-specific Atlas text -- the weakest-grounded such rule in the
# family so far (see OQ-WSJF-3 in the sibling contract). Same representative-blocklist-plus-structural-
# second-layer design every sibling already establishes, independently re-derived here (not imported -- see
# mcda.py:42-43's own comment for why method-specific business logic is not shared across families).
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})

_KNOWN_JOB_KEYS = frozenset({"id", "label"})
_KNOWN_COST_OF_DELAY_KEYS = frozenset({"business_value", "time_criticality", "risk_reduction_opportunity_enablement"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a bare recursive ``repr()``, same discipline
    ``root_cause.fault_tree``/``decision.rice``'s own ``_shallow_describe`` establish."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_job(value: Any) -> bool:
    return isinstance(value, dict) and set(value.keys()) == _KNOWN_JOB_KEYS and _is_nonempty_str(value.get("id")) and _is_nonempty_str(value.get("label"))


def _is_valid_cost_of_delay(value: Any) -> bool:
    """Atlas F16 table (L764) benefit column ('突出延遲成本') is best satisfied by an INSPECTABLE 3-factor
    breakdown (external SAFe convention, disclosed not Atlas-invented -- see module docstring point 3), not
    one opaque caller-supplied number. All 3 sub-factors required, each a finite number >= 0."""
    return (
        isinstance(value, dict)
        and set(value.keys()) == _KNOWN_COST_OF_DELAY_KEYS
        and all(_is_finite_number(value.get(key)) and value[key] >= 0 for key in _KNOWN_COST_OF_DELAY_KEYS)
    )


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """INFERRED family-wide rule (see ``FORBIDDEN_AUTHORITY_KEYS`` comment above for why this is the
    weakest-grounded citation in the family so far), checked structurally BEFORE the record is
    returned/persisted -- same 'raise before construction' discipline every forbidden-transition guard in
    this package already applies. Guards ``isinstance(record, dict)`` itself, matching
    ``decision.rice``/``impact_effort.py``'s own precedent (defense-in-depth, not a live bug fix)."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"WSJF_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(f"WSJF_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority (inferred family-wide rule, no WSJF-specific Atlas citation exists)")


def generate_wsjf_record(
    record_id: str,
    job: dict[str, Any],
    cost_of_delay: dict[str, Any],
    job_size: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/wsjf-score-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/job/cost_of_delay shape, then the arithmetic itself
    (delegated to ``compute_cost_of_delay``/``compute_wsjf_score``, the SAME functions
    ``evaluate_wsjf_genuine_compute_gate`` re-invokes later -- never values this constructor invents or the
    gate merely trusts). ``job_size`` is deliberately NOT shape-checked here (mirrors ``decision.rice``'s
    own ``effort`` -- a bare number with no Atlas-cited reason to structure it); its
    positive/finite invariant is enforced entirely by the compute layer and allowed to propagate uncaught,
    same discipline ``decision.rice``'s own ``test_nonpositive_effort_propagates_from_compute_layer``
    already proves for its own analogous field. ``cost_of_delay_total``/``wsjf_score`` are ALWAYS computed
    here, never accepted as parameters -- same discipline every genuine-compute sibling in this family
    already applies to its own computed fields."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WSJF_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WSJF_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_valid_job(job):
        raise InvariantViolation(f"WSJF_INVALID_JOB: job must be a dict with exactly 'id'/'label', both non-empty strings, got {_shallow_describe(job)}")
    if not _is_valid_cost_of_delay(cost_of_delay):
        raise InvariantViolation(
            f"WSJF_INVALID_COST_OF_DELAY: cost_of_delay must be a dict with exactly {sorted(_KNOWN_COST_OF_DELAY_KEYS)}, each a finite number >= 0, got {_shallow_describe(cost_of_delay)}"
        )

    business_value, time_criticality, risk_reduction = (
        cost_of_delay["business_value"],
        cost_of_delay["time_criticality"],
        cost_of_delay["risk_reduction_opportunity_enablement"],
    )
    cost_of_delay_total = compute_cost_of_delay(business_value, time_criticality, risk_reduction)
    wsjf_score = compute_wsjf_score(business_value, time_criticality, risk_reduction, job_size)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "job": dict(job),
        "cost_of_delay": dict(cost_of_delay),
        "job_size": job_size,
        "cost_of_delay_total": cost_of_delay_total,
        "wsjf_score": wsjf_score,
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


def evaluate_wsjf_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2: RE-INVOKES ``compute_cost_of_delay`` and ``compute_wsjf_score`` against the record's
    own raw ``cost_of_delay``/``job_size`` fields and compares BOTH results to the stored
    ``cost_of_delay_total``/``wsjf_score`` -- never trusts either stored value, the same 'malformed
    structure anywhere, not just at construction' discipline ``root_cause.fault_tree``/``decision.rice``'s
    own integrity gates already establish, extended here to TWO independently re-derived quantities instead
    of one. FAILS CLOSED (never raises) on malformed input, including a stored ``job_size <= 0`` that would
    make ``compute_wsjf_score`` itself raise -- caught and reported as a named check, not left to crash the
    caller."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)

    cost_of_delay, job_size = record.get("cost_of_delay"), record.get("job_size")
    stored_total, stored_score = record.get("cost_of_delay_total"), record.get("wsjf_score")
    checks: dict[str, Any] = {
        "cost_of_delay_valid": _is_valid_cost_of_delay(cost_of_delay),
        "job_size_positive": _is_finite_number(job_size) and job_size > 0,
        "engine_is_deterministic_compute_not_llm": record.get("engine") == "local_python_deterministic_compute",
        "computation_provenance_ref_resolves": _provenance_ref_resolves(record.get("computation_provenance_ref")),
    }
    if not all(checks.values()):
        return _result("genuine_compute", False, [checks], validator, timestamp)

    business_value, time_criticality, risk_reduction = (
        cost_of_delay["business_value"],
        cost_of_delay["time_criticality"],
        cost_of_delay["risk_reduction_opportunity_enablement"],
    )
    try:
        recomputed_total = compute_cost_of_delay(business_value, time_criticality, risk_reduction)
        recomputed_score = compute_wsjf_score(business_value, time_criticality, risk_reduction, job_size)
    except InvariantViolation as error:
        checks["recompute_succeeded"] = False
        return _result("genuine_compute", False, [checks, {"recompute_error": str(error)}], validator, timestamp)

    total_matches = _is_finite_number(stored_total) and math.isclose(recomputed_total, stored_total, rel_tol=1e-9, abs_tol=1e-9)
    score_matches = _is_finite_number(stored_score) and math.isclose(recomputed_score, stored_score, rel_tol=1e-9, abs_tol=1e-9)
    checks["stored_cost_of_delay_total_matches_recomputed_value"] = total_matches
    checks["stored_wsjf_score_matches_recomputed_value"] = score_matches
    passed = total_matches and score_matches
    return _result(
        "genuine_compute",
        passed,
        [
            checks,
            {
                "recomputed_cost_of_delay_total": recomputed_total,
                "stored_cost_of_delay_total": stored_total,
                "recomputed_wsjf_score": recomputed_score,
                "stored_wsjf_score": stored_score,
            },
        ],
        validator,
        timestamp,
    )


def evaluate_cost_of_delay_breakdown_disclosed_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas F16 table (L764) benefit column: '突出延遲成本' -- checks PRESENCE of the full 3-factor
    cost_of_delay breakdown only (not any particular sub-factor's correctness), the same disclosure-only
    honesty ``decision.rice``'s own ``reach_unit_required`` gate already applies to its differently-cited
    requirement."""
    if not isinstance(record, dict):
        return _result("cost_of_delay_breakdown_disclosed", False, [{"reason": "record is not a dict"}], validator, timestamp)
    cost_of_delay = record.get("cost_of_delay")
    passed = _is_valid_cost_of_delay(cost_of_delay)
    return _result("cost_of_delay_breakdown_disclosed", passed, [{"cost_of_delay": cost_of_delay}], validator, timestamp)


def evaluate_no_automatic_authority_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the inferred family-wide no-automatic-authority rule structurally on any record handed to
    it -- not just trusting that ``generate_wsjf_record``'s own construction-time check already ran (a
    hand-crafted/tampered record must still be caught, same discipline every sibling gate already
    establishes)."""
    if not isinstance(record, dict):
        return _result("no_automatic_authority_claim", False, [{"reason": "record is not a dict"}], validator, timestamp)
    try:
        assert_no_automatic_authority_claim(record)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_wsjf_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_wsjf_genuine_compute_gate(record, validator, timestamp),
        evaluate_cost_of_delay_breakdown_disclosed_gate(record, validator, timestamp),
        evaluate_no_automatic_authority_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
