"""``computation.monte_carlo`` -- eleventh Method Atlas slice, first from the `computation` family, the first family
this session opened that is NOT one of Atlas's own numbered F01-F24 categories (method-inventory.yaml's own catalog
row labels it "computation (uncataloged in F01-F24)"; Atlas's own §3 primitive-category table independently gives a
matching "F. Computation" row -- two citations, see the method contract's own description).

The first genuinely STOCHASTIC method this session builds, yet still
satisfies this codebase's Trusted Compute discipline via a required,
schema-carried ``random_seed`` -- same seeded-reproducibility convention
``compute/statistics/reliability.py``'s own bootstrap confidence interval
already established, now backing a whole method's own primary output
rather than a side calculation.

Atlas §22.3's own Method-specific Gate table (L4153) forbids this
method's output from claiming "Guaranteed Outcome" -- enforced here the
same two-layer way ``challenge.red_team``/``decision.mcda`` already
established for their own table-cited rules on the SAME table.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.montecarlo.simulation import run_simulation
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "computation.monte_carlo"
RECORD_ID_PREFIX = "MC-"
# Value MUST match typed-objects/monte-carlo-simulation.schema.yaml's own `id` pattern (`^MC-`) -- NOT a
# mechanical transliteration of the method name (critic-caught 2026-09-18: an earlier draft of this line used
# "MONTECARLO-", which is not what the canonical schema declares; see the same-day WORKLOG entry for the other
# 6 architecture-module RECORD_ID_PREFIX values this exact mistake was found in). Dashboard-only (id-suggest
# button) -- NOT load-bearing for API dispatch: this builder's identity param is the domain-specific
# ``simulation_id``, not the literal ``record_id`` name ``invoke_builder`` auto-injects against, so nothing
# here re-derives or checks this prefix at construction or gate time.
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.montecarlo.simulation.run_simulation"
# Keys that would assert this method's own output is a certainty rather than a simulated distribution -- Atlas
# §22.3 (L4153) forbids this method's output from ever carrying any of them. Same representative-blocklist-plus-
# structural-second-layer design challenge.red_team.py/modules.decision.mcda's own guards already established,
# independently re-derived here for Monte Carlo's own specific cited phrase ("Guaranteed Outcome"), not copied
# wholesale from either sibling.
FORBIDDEN_CERTAINTY_KEYS = frozenset({"guaranteed", "guaranteed_outcome", "certain", "certainty", "outcome_is_certain"})


def assert_no_certainty_claim(record: dict[str, Any]) -> None:
    """Atlas §22.3 L4153's own rule ('Monte Carlo | 禁止直接輸出: Guaranteed Outcome'), checked structurally BEFORE
    the record is returned/persisted -- same 'raise before construction' discipline every forbidden-transition
    guard this session built already applies."""
    violations = FORBIDDEN_CERTAINTY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(f"MONTECARLO_CERTAINTY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert a guaranteed/certain outcome (Atlas §22.3 L4153: Monte Carlo may not directly output Guaranteed Outcome)")


def genuine_compute_provenance(provenance: Any) -> Any:
    """Normalize a caller-supplied top-level ``provenance`` at construction: this method's computation is always
    real seeded sampling, never an LLM inference, so ``epistemic_type`` must always be ``SIMULATED_RESULT``
    regardless of what the caller passed -- ``authorship_state`` (was a human involved) IS a real caller choice
    and passes through unchanged. Same normalization ``ai_lego.modules.research.gates.genuine_compute_provenance``
    applies for ``CALCULATED_RESULT``-reusing methods, independently re-derived here (not imported) because this
    module's own ``evaluate_genuine_compute_gate`` already deliberately does not reuse that shared gate either
    (see its docstring) -- SIMULATED_RESULT, not CALCULATED_RESULT, is this method's correct label.

    Root cause this fixes: ``ai_lego/apps/api/main.py``'s ``POST /methods/{id}/invoke`` defaults an un-supplied
    ``provenance`` to ``epistemic_type=AI_INFERENCE`` (main.py:784) -- correct for the ~150 AI-inference methods
    in this corpus, but wrong for this method, which then failed ``genuine_compute`` on every real dashboard
    invocation (the dashboard never exposes a provenance field; same bug as the 19 CALCULATED_RESULT methods,
    2026-09-18 WORKLOG, different target epistemic_type).

    Returns the SAME object when no change is needed (every real fixture in this module, e.g. this file's own
    ``_valid_simulation()`` test helper, already supplies SIMULATED_RESULT) -- only the previously-broken
    default-provenance path changes. Passes non-dict input through unchanged (existing callers already handle
    an invalid ``provenance`` no earlier than ``evaluate_provenance_required_gate``; this must not introduce a
    new construction-time crash for a shape that previously reached the gate safely).

    Also forces ``locked: None`` on the rebuild branch: ``core/domain/provenance.py``'s own ``LOCK_REQUIRES`` has
    no entry for ``SIMULATED_RESULT``, so a caller-supplied ``locked`` value valid for their ORIGINAL
    epistemic_type (e.g. ``LOCKED_FACT`` paired with ``SOURCE_FACT``) would become schema-invalid the instant
    epistemic_type is forced to ``SIMULATED_RESULT`` -- which would make this gate misleadingly PASS on a record
    ``evaluate_provenance_required_gate`` then correctly fails, for a confusing reason (same fix gates.py's
    sibling function applies for CALCULATED_RESULT)."""
    if not isinstance(provenance, dict) or provenance.get("epistemic_type") == "SIMULATED_RESULT":
        return provenance
    return {**provenance, "epistemic_type": "SIMULATED_RESULT", "locked": None}


def generate_monte_carlo_simulation(
    simulation_id: str,
    input_distributions: list[dict[str, Any]],
    random_seed: int,
    num_runs: int,
    sensitivity_notes: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    combine_mode: str = "sum",
    success_threshold: float | None = None,
    success_direction: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/monte-carlo-simulation.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed (all
    validated inside ``ai_lego.compute.montecarlo.simulation.run_simulation``:
    at least 1 input distribution, num_runs >= 2, success_threshold/
    success_direction supplied together or not at all).
    ``outcome_distribution``/``tail_risk``/``success_probability`` are
    computed, never asserted.
    """
    if not sensitivity_notes or not sensitivity_notes.strip():
        raise InvariantViolation("MONTECARLO_SENSITIVITY_NOTES_EMPTY: Atlas §22.3's own required-verification column names Sensitivity -- disclosure cannot be blank")

    computed = run_simulation(input_distributions, combine_mode, random_seed, num_runs, success_threshold=success_threshold, success_direction=success_direction)

    record: dict[str, Any] = {
        "id": simulation_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "input_distributions": list(input_distributions),
        "combine_mode": combine_mode,
        "random_seed": random_seed,
        "num_runs": num_runs,
        "success_probability": computed["success_probability"],
        "outcome_distribution": computed["outcome_distribution"],
        "tail_risk": computed["tail_risk"],
        "sensitivity_notes": sensitivity_notes,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }
    if success_threshold is not None:
        record["success_threshold"] = success_threshold
        record["success_direction"] = success_direction
    assert_no_certainty_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(simulation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    passed = provenance_is_valid(simulation.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": simulation.get("provenance")}], validator, timestamp)


def evaluate_genuine_compute_gate(simulation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Structural check that this record's own genuine-compute fields are internally consistent: engine is the
    deterministic-compute literal, computation_provenance_ref resolves to a real importable callable, and
    provenance.epistemic_type is SIMULATED_RESULT -- the first genuine-compute gate this session writes that does
    NOT reuse modules.research.gates.evaluate_statistical_gate unchanged, because that gate's own check
    (epistemic_type == CALCULATED_RESULT) would WRONGLY fail every honest Monte Carlo record (see method contract
    compilation_decisions for why SIMULATED_RESULT, not CALCULATED_RESULT, is the correct label here)."""
    import importlib

    ref = simulation.get("computation_provenance_ref", "")
    resolvable = False
    if isinstance(ref, str) and ref.startswith("ai_lego.compute."):
        module_name, _, attr = ref.rpartition(".")
        try:
            resolvable = callable(getattr(importlib.import_module(module_name), attr))
        except Exception:
            resolvable = False
    provenance = simulation.get("provenance") or {}
    checks = {
        "epistemic_type_is_simulated_result": provenance.get("epistemic_type") == "SIMULATED_RESULT",
        "authorship_state_is_genuine_compute": provenance.get("authorship_state") in {"AI_GENERATED", "HUMAN_APPROVED"},
        "computation_provenance_ref_resolves": resolvable,
        "engine_is_deterministic_compute_not_llm": simulation.get("engine") == "local_python_deterministic_compute",
    }
    return _result("genuine_compute", all(checks.values()), [checks], validator, timestamp)


def evaluate_sensitivity_disclosed_gate(simulation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas §22.3 L4153's own required-verification column: 'Input Distribution + Sensitivity'. input_distributions
    is already a required construction-time field (enforced by run_simulation); this gate checks PRESENCE of a
    non-empty sensitivity disclosure only -- not any particular methodology or correctness (see method contract's
    own compilation_decisions/OQ-MONTECARLO-3 for why disclosure, not a computed formula)."""
    notes = simulation.get("sensitivity_notes")
    passed = isinstance(notes, str) and bool(notes.strip())
    return _result("sensitivity_disclosed", passed, [{"sensitivity_notes_present": passed}], validator, timestamp)


def evaluate_no_certainty_claim_gate(simulation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas §22.3's rule structurally on any record handed to it -- not just trusting that
    generate_monte_carlo_simulation's own construction-time check already ran (a hand-crafted/tampered record must
    still be caught, same discipline every prior forbidden-claim gate this session built already established)."""
    try:
        assert_no_certainty_claim(simulation)
        return _result("no_certainty_claim", True, [{"checked_keys": sorted(FORBIDDEN_CERTAINTY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_certainty_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_monte_carlo_gates(simulation: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(simulation, validator, timestamp),
        evaluate_genuine_compute_gate(simulation, validator, timestamp),
        evaluate_sensitivity_disclosed_gate(simulation, validator, timestamp),
        evaluate_no_certainty_claim_gate(simulation, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
