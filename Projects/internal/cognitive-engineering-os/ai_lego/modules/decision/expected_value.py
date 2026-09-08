"""``decision.expected_value`` -- Method Atlas slice, 7th member of the ``decision`` family (F16), after
``decision.ahp``, ``decision.mcda``, ``decision.impact_effort``, ``decision.ice``, ``decision.rice``,
``decision.moscow``.

Atlas's own F16 tool table Expected Value row (L771) is a single line: "機率
x結果 | states->probabilities->outcomes | 概率決策基線" (formula | pipeline |
benefit: probabilistic decision BASELINE). No dedicated section exists beyond
it -- grep-confirmed case-insensitively across the whole Atlas file for both
"Expected Value" and "期望值": L771 is the ONLY hit, either casing/language.
Same sparse-citation class ``decision.rice``/``decision.ice``/
``root_cause.fault_tree``/``root_cause.event_tree`` already establish for
their own single-line-only F16/F05 rows.

**Framing (disclosed per this task's own explicit instruction): this is the
SIMPLE, FLAT, single-stage baseline** -- one set of mutually-exclusive
states, each with a probability and an outcome value, no branching, no
decision nodes. A more complex method like Decision Tree could reuse this
same closed-form calculation at each of ITS OWN chance nodes; this module is
not a competing structure with a Decision Tree, it is the primitive such a
tree would call repeatedly. At the time this module's FIRST draft was
written, ``ai_lego/modules/decision/`` held only ``ahp.py``/``ice.py``/
``impact_effort.py``/``mcda.py``/``moscow.py``/``rice.py``/``__init__.py`` --
no ``decision_tree.py`` existed yet to cross-check against (a concurrent
agent's own slice in the same batch, per this task's own brief); this
framing was written from Atlas's own text and general decision-theory
knowledge alone, not from reading that sibling's actual field shapes.

**Follow-up cross-check (same discipline ``decision.rice``'s own "ICE
cross-check" section already established for an identical mid-batch
landing): ``decision_tree.py`` landed later in this same batch and was read
in full as a follow-up.** Two findings:
1. **No contradiction, independently confirmed from the OTHER side.**
   ``decision_tree.py``'s own module docstring (lines 29-38) reaches the
   EXACT same conclusion by itself, unprompted: "Expected Value is Atlas's
   own FLAT, non-branching probability×payoff sum over ONE outcome set...
   Decision Tree is the BRANCHING, multi-stage structure that computes
   expected value recursively AT EVERY chance node... not a duplicate, a
   superset relationship" -- and had flagged its own open question
   (OQ-DECISIONTREE-2) as "pending that method's own future existence",
   i.e. pending this module.
2. **The "superset" relationship is CONCEPTUAL/ANALYTICAL, not a literal
   shared function today.** ``decision_tree.py``'s own chance-node rollup
   (``ai_lego.compute.decision_tree.rollup.roll_up_node``, imported at
   ``decision_tree.py``:92) is a recursive function over NESTED child
   pointers (the tree's own embedded shape, ``decision_tree.py``:40-46's
   own due-diligence against ``security.attack_tree``); this module's
   ``compute_expected_value`` takes a FLAT, caller-enumerated list. Neither
   module currently calls the other's compute function -- disclosed
   honestly as a real, un-forced fact (not silently implied as "already
   reconciled"), tracked as OQ-EXPECTEDVALUE-2 in the method contract for
   whoever next considers whether ``roll_up_node``'s own chance-node case
   should delegate to ``compute_expected_value`` (would require reshaping
   one side's input, a real refactor, not a trivial import swap).

CRITICAL DUE-DILIGENCE vs ``computation.monte_carlo`` (read in full before
writing a single field here, per this task's own explicit instruction) --
does Monte Carlo already compute a simple weighted-sum expected value as one
of its own outputs?

1. **Different epistemic category, confirmed by the module's own gate.**
   ``ai_lego/modules/computation/monte_carlo.py``:107-113's own
   ``evaluate_genuine_compute_gate`` docstring states outright that reusing
   ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED "would
   WRONGLY fail every honest Monte Carlo record" because that gate requires
   ``epistemic_type == CALCULATED_RESULT``, and Monte Carlo's own records
   are ``SIMULATED_RESULT`` instead (checked at monte_carlo.py:126,
   ``epistemic_type_is_simulated_result``). This module's own records ARE
   ``CALCULATED_RESULT`` -- a deterministic closed-form formula over
   caller-specified exact inputs, no sampling, no seed, no runs -- exactly
   the case ``evaluate_statistical_gate``/``CALCULATED_RESULT`` was
   originally shaped for (the same convention ``decision.rice``/
   ``decision.mcda``/``decision.ahp`` already use).
2. **Sampling vs enumeration, confirmed by direct read of the compute
   layer.** ``ai_lego/compute/montecarlo/simulation.py``:73-77 draws
   ``num_runs`` STOCHASTIC samples per input distribution via
   ``rng.gauss``/``rng.uniform``/``rng.triangular`` (line 29-36) and SUMS
   them per run (``combine_mode="sum"``, the only supported mode, line
   62-63) -- ``input_distributions`` are CONTINUOUS parametric shapes
   (mean/std_dev, min/max, min/max/mode), never a finite enumerated list of
   discrete mutually-exclusive states with exact probabilities. Monte
   Carlo's closest output to an "expected value" is
   ``outcome_distribution.mean`` -- ``simulation.py``:79,
   ``statistics.fmean(outcomes)``, the SAMPLE MEAN of ``num_runs`` random
   draws. This is a Monte Carlo ESTIMATE that converges to a true expected
   value only asymptotically (Law of Large Numbers) as ``num_runs`` grows --
   a different value on every different ``random_seed``/``num_runs`` choice
   for the SAME underlying distributions. This module's own
   ``compute_expected_value`` is the opposite: an exact, closed-form
   Sigma(probability_i * outcome_value_i) over a small, explicit, enumerated
   state list -- the SAME two runs with the SAME inputs always produce
   bit-identical output, no seed, no convergence, no sample size.
3. **No sum-to-1.0 concept exists in Monte Carlo at all.** Monte Carlo's
   ``input_distributions`` are independent random variables that get
   SUMMED, not a set of mutually-exclusive alternatives weighted by
   probabilities that must total 1.0 -- there is no equivalent anywhere in
   ``simulation.py`` to this module's own headline invariant #1 (below).

CONCLUSION: Monte Carlo does NOT already compute a simple enumerated-state
expected value as one of its own outputs. ``outcome_distribution.mean`` is a
RELATED but methodologically different quantity (statistical estimate via
repeated sampling, not analytic calculation via enumeration) -- confirmed,
not assumed.

SECOND due-diligence, self-initiated (the Sigma(p_i * v_i) formula is
structurally a weighted sum -- the same shape ``decision.mcda``/
``decision.ahp`` already use via ``ai_lego.compute.ahp.weights.rank_options``,
so "is this just a relabeled MCDA?" must be addressed with the same rigor
``decision.rice.contract.yaml`` already applied against MCDA for its own,
differently-shaped formula):

1. **`rank_options` is a cross-option RANKER, not a single-subject scalar.**
   ``ai_lego/compute/ahp/weights.py``:102-112 accumulates a weighted sum
   PER OPTION across MULTIPLE options in one call
   (``totals[option_id] = totals.get(option_id, 0.0) + weight * entry["score"]``)
   and returns them SORTED against each other (line 111,
   ``sorted(totals.items(), ...)``) -- a genuine ranking function, options
   ``minItems: 2`` required for that comparison to mean anything. This
   module's own ``compute_expected_value`` returns ONE scalar for ONE
   ``decision_subject``'s ``states`` -- no cross-subject ranking happens
   inside it (same absolute-per-record shape ``decision.rice``/
   ``decision.ice`` already established for their own reasons).
2. **`rank_options`'s own scores are bounded [0,1] quality ratings --
   structurally incompatible with a signed payoff.** Its own docstring
   (``weights.py``:103) states ``score in [0, 1] per criterion``. This
   method's ``outcome_value`` must support NEGATIVE numbers (a loss is a
   valid outcome -- see ``compute_expected_value``'s own docstring) --
   reusing ``rank_options`` is not merely undesirable here, it is a real
   type/range mismatch, not just a style preference.
3. **What the coefficients MEAN differs.** MCDA/AHP's ``weight`` is a
   caller-CHOSEN importance/preference allocation across heterogeneous
   CRITERIA (cost vs. quality vs. risk -- different dimensions of
   "goodness" for ONE option). This module's ``probability`` is an estimate
   of the LIKELIHOOD of one of several mutually-exclusive FUTURE STATES for
   ONE decision, all measured in the SAME outcome unit -- a probability of
   an uncertain event, not a policy choice among judgment dimensions. This
   is why ``cognitive_primitives`` below includes ``ESTIMATE`` (probability
   estimation) rather than the ``WEIGHT`` extended primitive (subjective
   importance allocation, the AHP/MCDA-flavored sense) -- a deliberate
   exclusion, not an oversight.
4. **No relative normalization.** ``ai_lego/compute/mcda/scoring.py``:29-65's
   own ``normalize_scores`` min-max normalizes each option's raw score
   RELATIVE to whichever sibling options happen to be in the SAME run
   (``lo, hi = min(values), max(values)``, line 55) -- adding/removing an
   option changes every OTHER option's normalized value. This module's
   ``outcome_value`` is used DIRECTLY, never normalized against other
   states or other records -- a state's contribution to the total
   (``probability * outcome_value``) is fixed and context-independent,
   matching real-world expected-value semantics.

CONCLUSION: genuinely distinct method (same as ``decision.rice``'s own
conclusion against the same sibling, reached by a structurally different
argument since this formula IS a weighted sum, unlike RICE's multiply-divide
shape) -- built as a new module, not a contract-only alias of
``decision.mcda``.

THIRD due-diligence, secondary (found via routine grep-before-write, not
requested by this task): ``ai_lego/modules/root_cause/event_tree.py``
(``root_cause`` family, F05, a different concurrent/already-landed slice)
also involves branching probabilities. Read in full: its own
``outcome_probability`` (event_tree.py:314-335) computes the PRODUCT of
sequential per-barrier probabilities along ONE ordered path -- a pure
likelihood (0..1) of reaching one terminal outcome, with no
``outcome_value``/consequence-magnitude field anywhere in its schema
(outcomes carry only ``outcome_id``/``description``/``path``). It
structurally cannot compute Sigma(p * v) -- there is no "v" to multiply by
-- and its own ``outcomes`` are explicitly NOT required to be exhaustive
(event_tree.py:74-80, OQ-EVENTTREE-2), unlike this module's own invariant
#1. No overlap.

TWO real, independently-enforced invariants (construction AND gate, same
"raise before construction" / "gate re-derives, never trusts a stored
value" two-layer discipline every prior module in this package uses):

1. **States must be mutually exclusive and exhaustive**
   (``EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE``) -- ``states[].probability``
   must sum to 1.0 within tolerance (basic probability theory: a sum < 1
   means some possibility is unaccounted for; a sum > 1 means
   overlapping/double-counted states). Re-derived independently by
   ``evaluate_states_mutually_exclusive_exhaustive_gate`` directly from the
   record's own raw ``states``, on its own dedicated gate_id -- so a
   caller debugging a failure gets a specific diagnosis, not a blurred
   "something about this record is wrong" (same "failure always names the
   specific bug class" discipline ``root_cause.fault_tree``'s own 3-way
   gate split already establishes).
2. **The stored ``expected_value`` is GENUINE_COMPUTE** -- unlike
   ``decision.mcda``/``decision.ahp``'s own ``evaluate_genuine_compute_gate``
   (resolvability/shape only, never re-running the arithmetic),
   ``evaluate_expected_value_genuine_compute_gate`` ACTUALLY RE-INVOKES
   ``compute_expected_value`` against the record's own raw ``states`` and
   compares the result to the stored ``expected_value`` with
   ``math.isclose`` -- the same strictly-stronger pattern
   ``decision.rice``'s own gate established (rice.py:281-313), applied
   here to a variable-length state list instead of 4 fixed scalars. A
   hand-tampered stored ``expected_value`` that does not match the
   recomputed value fails this gate, schema-valid shape notwithstanding.

``forbidden_transition`` is genuinely EMPTY (see method contract) -- Atlas's
own §22.3 Method-specific Gate table has no Expected Value row (grep-
confirmed, L4142-4155), and unlike ``decision.impact_effort``'s own inferred
rule (grounded in real prose elsewhere, L1905-1906), a whole-document grep
for "Expected Value"/"期望值" returns ONLY L771 itself -- no prose caution
exists anywhere else to infer from either. Left empty rather than inventing
one, the same disclosed-absence class ``decision.ice``/``decision.moscow``
already establish for their own zero-citation methods.
"""

from __future__ import annotations

import importlib
import math
from typing import Any

from ai_lego.compute.expected_value.calculation import DEFAULT_PROBABILITY_TOLERANCE, MIN_STATES, compute_expected_value
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decision.expected_value"
RECORD_ID_PREFIX = "EXPECTEDVALUE-"
# NOT "EV-" -- ``specs/cognitive/typed-objects/decision-journal-entry.schema.yaml``'s own evidence ids
# (grep-confirmed: "EV-1"/"EV-2" at decision-journal-entry.schema.yaml:212-213, and
# ``run_decision_journal_slice.py``:109/115) already use that exact prefix to mean "Evidence", an
# unrelated concept. Different schema, no functional collision (each schema's own ``pattern: "^EV-"``
# only applies within its own record type), but a real mnemonic collision worth avoiding -- same
# multi-word-concatenation convention ``FAULTTREE-``/``EVENTTREE-`` already use for a 2-word method name.
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.expected_value.calculation.compute_expected_value"

_KNOWN_STATE_KEYS = frozenset({"id", "label", "probability", "outcome_value"})


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


def _is_valid_state_shape(state: Any) -> bool:
    """Shape only (keys/types) -- NOT probability range or the cross-state sum-to-1.0 invariant (that is
    ``compute_expected_value``'s job, re-run independently by both construction and the gate). Mirrors
    ``root_cause.fault_tree``'s own split between shape validation and structural/arithmetic invariants,
    each a separate predicate with its own error code."""
    if not isinstance(state, dict) or set(state.keys()) != _KNOWN_STATE_KEYS:
        return False
    if not _is_nonempty_str(state.get("id")) or not _is_nonempty_str(state.get("label")):
        return False
    return _is_finite_number(state.get("probability")) and _is_finite_number(state.get("outcome_value"))


def generate_expected_value_record(
    record_id: str,
    decision_subject: str,
    states: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/expected-value-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/decision_subject/states shape, state-id uniqueness, then
    the arithmetic itself (delegated to ``compute_expected_value``, the SAME function
    ``evaluate_expected_value_genuine_compute_gate`` re-invokes later -- never a value this constructor
    invents or the gate merely trusts). ``expected_value`` is ALWAYS computed here, never accepted as a
    parameter -- same discipline every genuine-compute sibling in this family already applies."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EXPECTEDVALUE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EXPECTEDVALUE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(decision_subject):
        raise InvariantViolation(f"EXPECTEDVALUE_INVALID_DECISION_SUBJECT: decision_subject must be a non-empty string, got {decision_subject!r}")
    if not isinstance(states, list) or len(states) < MIN_STATES or not all(_is_valid_state_shape(s) for s in states):
        raise InvariantViolation(
            f"EXPECTEDVALUE_INVALID_STATES: states must be a list of at least {MIN_STATES} well-shaped entries "
            f"(id/label non-empty strings, probability/outcome_value finite numbers), got {_shallow_describe(states)}"
        )
    state_ids = [s["id"] for s in states]
    if len(set(state_ids)) != len(state_ids):
        duplicates = sorted({i for i in state_ids if state_ids.count(i) > 1})
        raise InvariantViolation(f"EXPECTEDVALUE_DUPLICATE_STATE_ID: id(s) {duplicates} used more than once -- every states[].id must be unique")

    expected_value = compute_expected_value(states)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_subject": decision_subject,
        "states": [dict(s) for s in states],
        "expected_value": expected_value,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def evaluate_states_mutually_exclusive_exhaustive_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1: re-derives directly from the record's own raw ``states`` -- independent of whether
    ``outcome_value``/``expected_value`` are even valid, so this gate names the SPECIFIC bug class
    (mutual-exclusivity/exhaustiveness) on its own gate_id rather than being blurred into
    ``genuine_compute``'s own broader recompute check (which would also transitively catch this, since
    ``compute_expected_value`` enforces the same sum internally -- this gate exists for diagnostic
    precision, same "failure always names the specific bug class" discipline
    ``root_cause.fault_tree``'s own 3-way gate split already establishes)."""
    if not isinstance(record, dict):
        return _result("states_mutually_exclusive_exhaustive", False, [{"reason": "record is not a dict"}], validator, timestamp)
    states = record.get("states")
    if not isinstance(states, list) or len(states) < MIN_STATES:
        return _result("states_mutually_exclusive_exhaustive", False, [{"reason": f"states must be a list with at least {MIN_STATES} entries"}], validator, timestamp)
    if not all(isinstance(s, dict) for s in states):
        return _result("states_mutually_exclusive_exhaustive", False, [{"reason": "one or more states is not a dict"}], validator, timestamp)
    probabilities = [s.get("probability") for s in states]
    if not all(_is_finite_number(p) for p in probabilities):
        return _result("states_mutually_exclusive_exhaustive", False, [{"reason": "one or more states missing a finite probability"}], validator, timestamp)
    total = sum(probabilities)
    passed = math.isclose(total, 1.0, abs_tol=DEFAULT_PROBABILITY_TOLERANCE)
    return _result("states_mutually_exclusive_exhaustive", passed, [{"probability_sum": total, "tolerance": DEFAULT_PROBABILITY_TOLERANCE, "state_count": len(states)}], validator, timestamp)


def _provenance_ref_resolves(ref: Any) -> bool:
    if not isinstance(ref, str) or not ref.startswith("ai_lego.compute."):
        return False
    module_name, _, attr = ref.rpartition(".")
    try:
        return callable(getattr(importlib.import_module(module_name), attr))
    except Exception:
        return False


def evaluate_expected_value_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2: RE-INVOKES ``compute_expected_value`` against the record's own raw ``states`` and
    compares the result to the stored ``expected_value`` -- never trusts it. Same strictly-stronger-than-
    resolvability-only pattern ``decision.rice``'s own gate established (rice.py:281-313), applied here to
    a list-shaped input instead of 4 scalars. FAILS CLOSED (never raises) on malformed input, including
    stored ``states`` that would make ``compute_expected_value`` itself raise -- caught and reported as a
    named check, not left to crash the caller."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)

    states = record.get("states")
    stored_ev = record.get("expected_value")
    checks: dict[str, Any] = {
        "states_present_and_list": isinstance(states, list) and len(states) >= MIN_STATES,
        "engine_is_deterministic_compute_not_llm": record.get("engine") == "local_python_deterministic_compute",
        "computation_provenance_ref_resolves": _provenance_ref_resolves(record.get("computation_provenance_ref")),
    }
    if not all(checks.values()):
        return _result("genuine_compute", False, [checks], validator, timestamp)

    try:
        recomputed = compute_expected_value(states)
    except InvariantViolation as error:
        checks["recompute_succeeded"] = False
        return _result("genuine_compute", False, [checks, {"recompute_error": str(error)}], validator, timestamp)

    score_matches = _is_finite_number(stored_ev) and math.isclose(recomputed, stored_ev, rel_tol=1e-9, abs_tol=1e-9)
    checks["stored_expected_value_matches_recomputed_value"] = score_matches
    return _result("genuine_compute", score_matches, [checks, {"recomputed_expected_value": recomputed, "stored_expected_value": stored_ev}], validator, timestamp)


def evaluate_expected_value_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_states_mutually_exclusive_exhaustive_gate(record, validator, timestamp),
        evaluate_expected_value_genuine_compute_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
