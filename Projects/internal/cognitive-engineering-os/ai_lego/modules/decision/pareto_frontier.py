"""``decision.pareto_frontier`` -- Method Atlas slice, seventh member of the ``decision`` family (F16), after
``decision.ahp``, ``decision.mcda``, ``decision.impact_effort``, ``decision.ice``, ``decision.rice``,
``decision.moscow``.

MANDATORY NAMING-COLLISION DUE-DILIGENCE (``root_cause.pareto`` already exists in this codebase, F05 family --
read ``ai_lego/modules/root_cause/pareto.py`` and ``methods/contracts/root_cause.pareto.contract.yaml`` in full
before writing this module): confirmed NOT a duplicate. ``root_cause.pareto`` is the classic "Pareto principle"
/ 80-20 rule -- a SINGLE-dimension cumulative-percentage ranking (``ParetoAnalysis.ranking[]``, computed by
``ai_lego/compute/pareto/ranking.py::pareto_ranking``, 68 lines, direct read confirms zero concept of
"objectives" (plural) or "domination" anywhere in it -- it sorts ONE ``metric_value`` per dataset record
descending and accumulates a running percentage share). "Pareto Frontier" (this module, F16 tool-table row
L772: "找非支配方案｜objective vectors→remove dominated｜不過早壓成單一總分") is a mathematically distinct,
textbook multi-objective-optimization concept: given options scored on 2+ objectives, remove every option that
is DOMINATED (option A dominates option B iff A is at least as good as B on EVERY objective AND strictly better
on at least one) -- the surviving, non-dominated remainder is "the frontier". Both concepts trace back to the
same economist (Vilfredo Pareto) for a real historical reason, which is exactly why the name collides while the
mathematics does not. Structural proof the two are genuinely different shapes, not just different names: a
single-objective "frontier" is meaningless (that degenerates to plain sorting -- root_cause.pareto's own
80/20 operation) -- this module's own ``PARETOFRONTIER_TOO_FEW_OBJECTIVES`` invariant (>=2 objectives required)
makes that structurally impossible to build by accident. `decision.pareto_frontier` (not `decision.pareto`) is
used as this method's machine_id specifically to avoid any naming ambiguity with the existing
`root_cause.pareto`, and this module lives in its own ``ai_lego/compute/pareto_frontier/`` compute package
(never ``ai_lego/compute/pareto/``, which stays owned by ``root_cause.pareto``, untouched by this slice).

DUE-DILIGENCE vs ``decision.mcda`` (read ``ai_lego/modules/decision/mcda.py`` in full -- Pareto Frontier's own
entire reason to exist, per Atlas F16 L772's own benefit column "不過早壓成單一總分", is explicitly the OPPOSITE
of what MCDA does): ``mcda.py``'s own ``generate_mcda_analysis`` (mcda.py:60-110) always produces exactly ONE
``weighted_score`` per option in its own ``ranking[]`` (a single scalar per option, sorted -- MCDA's entire
Score stage collapses N criteria into that one number via ``ai_lego.compute.ahp.weights.rank_options``, a plain
weight*score accumulate-and-sum loop). This module's own ``frontier_classification[]`` carries no score field
at all anywhere in its shape -- every option gets a categorical ``status`` (``on_frontier`` or ``dominated``)
plus which other options dominate it, never a number that could be sorted into a single ranking. This is not
merely a documentation claim: ``pareto-frontier-record.schema.yaml`` has no field a caller could even misuse as
a score (confirmed by direct schema read before writing this module), the structural difference the F16 table's
own benefit column names.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream write" /
"re-derive, don't trust" two-layer discipline ``root_cause.fault_tree`` (read in full) establishes as this
codebase's current best-practice fail-closed gate pattern, and ``decision.impact_effort`` (read in full)
already applies to its own categorical, non-scalar genuine-compute result -- the closest structural analog in
this family, not MCDA/RICE's own scalar-recompute gates):

1. **Frontier genuine-compute** (bundled into ``evaluate_frontier_integrity_gate``'s own evidence): every
   option's own ``status``/``dominated_by`` is COMPUTED by
   ``ai_lego.compute.pareto_frontier.dominance.compute_frontier`` at construction -- there is no constructor
   parameter for it -- and independently RE-DERIVED at the gate from the record's own raw
   ``objectives``/``options``/``option_values``, compared against whatever classification is actually stored.
   Unlike ``decision.impact_effort``'s own ``classify_quadrant`` (pure, callable per-idea in isolation),
   dominance is NOT decomposable per-option: knowing whether option X is dominated requires comparing it
   against every OTHER option's own raw values, so ``compute_frontier`` is necessarily a whole-set operation,
   not a small per-item pure function -- a genuine, disclosed structural difference from the quadrant-
   classification precedent, not an oversight.
2. **Minimum objective count** (``PARETOFRONTIER_TOO_FEW_OBJECTIVES``, raised inside ``compute_frontier``
   itself so BOTH construction and the gate re-derive it through the exact same code path): fewer than 2
   objectives makes "domination" undefined (there is nothing to trade off) -- the F16 table's own row citation
   ("objective vectors", plural) already implies this floor.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.pareto_frontier.dominance import VALID_STATUSES, compute_frontier
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.pareto_frontier"
RECORD_ID_PREFIX = "PARETOFRONTIER-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.pareto_frontier.dominance.compute_frontier"
# INFERRED, not table-cited -- Atlas F16 L772's own row has no 5th "禁止誤用" column (grep-confirmed: unlike
# F05's classic Pareto row, the F16 table has only 4 columns) and no §22.3 gate-table row of its own
# (grep-confirmed: the only "Pareto"-matching text near §22.3's L4142-4155 region is none at all). This is
# therefore the WEAKEST-grounded forbidden-authority citation in the decision family so far -- weaker even than
# decision.impact_effort's own prose-caution grounding (L1905-1906, an explicit warning sentence), inferred
# purely from the F16 benefit column's own literal content ("不過早壓成單一總分" structurally implies no output
# of this method should assert a single decided/approved winner). Disclosed explicitly in the method contract's
# own compilation_decisions rather than silently presented as equally strong. Same representative-blocklist-
# plus-structural-second-layer design every sibling FORBIDDEN_AUTHORITY_KEYS already establishes, independently
# re-derived here (not imported).
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome", "recommended_option", "winner"})

_KNOWN_OBJECTIVE_KEYS = frozenset({"id", "label", "direction"})
_KNOWN_OPTION_KEYS = frozenset({"id", "label"})
_KNOWN_VALUE_ENTRY_KEYS = frozenset({"option_id", "objective_id", "value"})
_KNOWN_CLASSIFICATION_KEYS = frozenset({"option_id", "status", "dominated_by"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _objective_shape_is_valid(objective: Any) -> bool:
    """Shape only (closed keys, id/label/direction are non-empty strings). Direction ENUM membership (is it
    actually 'maximize' or 'minimize') and the >=2-objectives floor are compute-layer domain invariants, owned
    by ``compute_frontier`` -- same three-independent-predicates split ``root_cause.fault_tree``'s own
    shape/mode/referential-integrity checks establish, so a failure always names the specific bug class."""
    return isinstance(objective, dict) and set(objective.keys()) == _KNOWN_OBJECTIVE_KEYS and _is_nonempty_str(objective.get("id")) and _is_nonempty_str(objective.get("label")) and _is_nonempty_str(objective.get("direction"))


def _option_shape_is_valid(option: Any) -> bool:
    return isinstance(option, dict) and set(option.keys()) == _KNOWN_OPTION_KEYS and _is_nonempty_str(option.get("id")) and _is_nonempty_str(option.get("label"))


def _value_entry_shape_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_VALUE_ENTRY_KEYS:
        return False
    if not _is_nonempty_str(entry.get("option_id")) or not _is_nonempty_str(entry.get("objective_id")):
        return False
    value = entry.get("value")
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """Inferred rule (see ``FORBIDDEN_AUTHORITY_KEYS`` comment above for the disclosed, weaker-than-usual
    grounding), checked structurally BEFORE the record is returned/persisted -- same 'raise before
    construction' discipline every forbidden-transition guard in this package applies. Guards
    ``isinstance(record, dict)`` itself -- the current best practice this codebase's own 2026-09-08 critic
    review retrofitted onto every sibling gate in this family (mcda.py/ahp.py/root_cause/pareto.py), applied
    here from the start rather than added as a follow-up fix."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"PARETOFRONTIER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(
            f"PARETOFRONTIER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority "
            "(Atlas F16 L772 benefit column: a Pareto frontier is a non-dominated SET, never a single decided/approved winner)"
        )


def generate_pareto_frontier_record(
    record_id: str,
    subject: str,
    objectives: list[dict[str, Any]],
    options: list[dict[str, Any]],
    option_values: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pareto-frontier-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/subject/version shape, then objectives/options/option_values
    SHAPE (closed keys, non-empty strings) and id-uniqueness within each list, then delegates the real domain
    invariants (>=2 objectives, >=2 options, direction enum validity, value finiteness, option_values
    referential completeness) AND the actual domination-check algorithm to
    ``ai_lego.compute.pareto_frontier.dominance.compute_frontier`` -- the SAME function
    ``evaluate_frontier_integrity_gate`` re-invokes later against the record's own raw stored fields.
    ``frontier_classification`` is ALWAYS computed here, never accepted as a parameter -- same discipline
    every genuine-compute sibling in this family applies to its own computed field."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PARETOFRONTIER_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"PARETOFRONTIER_EMPTY_RECORD_FIELD: subject must be a non-empty string, got {subject!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PARETOFRONTIER_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(objectives, list) or not all(_objective_shape_is_valid(o) for o in objectives):
        raise InvariantViolation(
            f"PARETOFRONTIER_INVALID_OBJECTIVES: objectives must be a list of well-shaped entries "
            f"(id/label/direction non-empty strings, no extra/missing keys), got {_shallow_describe(objectives)}"
        )
    objective_ids = [o["id"] for o in objectives]
    if len(set(objective_ids)) != len(objective_ids):
        duplicates = sorted({i for i in objective_ids if objective_ids.count(i) > 1})
        raise InvariantViolation(f"PARETOFRONTIER_DUPLICATE_OBJECTIVE_ID: id(s) {duplicates} used more than once -- every objective id must be unique in the record")

    if not isinstance(options, list) or not all(_option_shape_is_valid(o) for o in options):
        raise InvariantViolation(
            f"PARETOFRONTIER_INVALID_OPTIONS: options must be a list of well-shaped entries "
            f"(id/label non-empty strings, no extra/missing keys), got {_shallow_describe(options)}"
        )
    option_ids = [o["id"] for o in options]
    if len(set(option_ids)) != len(option_ids):
        duplicates = sorted({i for i in option_ids if option_ids.count(i) > 1})
        raise InvariantViolation(f"PARETOFRONTIER_DUPLICATE_OPTION_ID: id(s) {duplicates} used more than once -- every option id must be unique in the record")

    if not isinstance(option_values, list) or not all(_value_entry_shape_is_valid(v) for v in option_values):
        raise InvariantViolation(
            f"PARETOFRONTIER_INVALID_OPTION_VALUES: option_values must be a list of well-shaped entries "
            f"(option_id/objective_id non-empty strings, value a real number, no extra/missing keys), got {_shallow_describe(option_values)}"
        )

    frontier_classification = compute_frontier(options, objectives, option_values)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "objectives": [dict(o) for o in objectives],
        "options": [dict(o) for o in options],
        "option_values": [dict(v) for v in option_values],
        "frontier_classification": frontier_classification,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }
    assert_no_automatic_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- the same reuse
    ``root_cause.pareto``/``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/
    ``decision.rice`` already establish, checking this record's own ``engine``/``computation_provenance_ref``/
    ``provenance`` METADATA fields resolve and are well-formed. Does NOT by itself re-derive whether the
    stored ``frontier_classification`` VALUES are correct -- that is ``evaluate_frontier_integrity_gate``'s
    own, stronger job; the two gates are complementary, not redundant. Guards ``isinstance(record, dict)``
    itself before delegating, the current best practice every sibling gate in this family now applies."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_frontier_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any stored
    value, including whether each option's own ``status``/``dominated_by`` actually matches what
    ``ai_lego.compute.pareto_frontier.dominance.compute_frontier`` recomputes fresh from the record's own
    ``objectives``/``options``/``option_values``. Re-validates shape with the SAME helper predicates
    construction uses (``_objective_shape_is_valid`` etc.) before calling ``compute_frontier`` -- avoids two
    parallel implementations of the same shape logic that could drift, same trade-off
    ``decision.impact_effort``'s own ``evaluate_quadrant_integrity_gate`` already accepts. Bundles BOTH
    headline invariants (minimum-objective-count/direction/completeness AND frontier genuine-compute) under
    one gate_id, same shape ``evaluate_fault_tree_integrity_gate``/``evaluate_quadrant_integrity_gate`` already
    use for their own families (several distinct, DEPENDENT structural reasons -- recomputing a frontier is
    only meaningful once its own objective/option/value data is structurally sane -- one gate_id, each
    mismatch its own distinguishable evidence entry). FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("frontier_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("frontier_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("frontier_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    objectives = record.get("objectives")
    if not isinstance(objectives, list) or not objectives or not all(_objective_shape_is_valid(o) for o in objectives):
        return _result("frontier_integrity", False, [{"reason": "objectives invalid (empty, not a list, or a malformed entry)"}], validator, timestamp)
    objective_ids = [o["id"] for o in objectives]
    if len(set(objective_ids)) != len(objective_ids):
        return _result("frontier_integrity", False, [{"reason": "duplicate objective id across objectives"}], validator, timestamp)

    options = record.get("options")
    if not isinstance(options, list) or not options or not all(_option_shape_is_valid(o) for o in options):
        return _result("frontier_integrity", False, [{"reason": "options invalid (empty, not a list, or a malformed entry)"}], validator, timestamp)
    option_ids = [o["id"] for o in options]
    if len(set(option_ids)) != len(option_ids):
        return _result("frontier_integrity", False, [{"reason": "duplicate option id across options"}], validator, timestamp)

    option_values = record.get("option_values")
    if not isinstance(option_values, list) or not all(_value_entry_shape_is_valid(v) for v in option_values):
        return _result("frontier_integrity", False, [{"reason": "option_values invalid (not a list, or a malformed entry)"}], validator, timestamp)

    try:
        recomputed = compute_frontier(options, objectives, option_values)
    except InvariantViolation as error:
        return _result("frontier_integrity", False, [{"reason": str(error)}], validator, timestamp)

    stored = record.get("frontier_classification")
    if not isinstance(stored, list):
        return _result("frontier_integrity", False, [{"reason": "frontier_classification missing or not a list"}], validator, timestamp)

    recomputed_by_id = {entry["option_id"]: (entry["status"], tuple(entry["dominated_by"])) for entry in recomputed}
    mismatches: list[str] = []
    stored_ids: list[str] = []
    for entry in stored:
        if not isinstance(entry, dict) or not _KNOWN_CLASSIFICATION_KEYS <= entry.keys():
            mismatches.append(f"malformed frontier_classification entry: {_shallow_describe(entry)}")
            continue
        option_id = entry.get("option_id")
        stored_ids.append(option_id)
        if option_id not in recomputed_by_id:
            mismatches.append(f"option {option_id!r} in frontier_classification is not a real options[].id")
            continue
        if entry.get("status") not in VALID_STATUSES:
            mismatches.append(f"option {option_id!r}: status={entry.get('status')!r} is not one of {sorted(VALID_STATUSES)}")
            continue
        dominated_by = entry.get("dominated_by")
        if not isinstance(dominated_by, list) or not all(isinstance(x, str) for x in dominated_by):
            mismatches.append(f"option {option_id!r}: dominated_by must be a list of strings, got {_shallow_describe(dominated_by)}")
            continue
        stored_pair = (entry["status"], tuple(sorted(dominated_by)))
        if stored_pair != recomputed_by_id[option_id]:
            mismatches.append(f"option {option_id!r}: stored={stored_pair} does not match recomputed={recomputed_by_id[option_id]}")

    if len(set(stored_ids)) != len(stored_ids):
        mismatches.append("duplicate option_id across frontier_classification")
    if set(stored_ids) != set(recomputed_by_id):
        mismatches.append("frontier_classification does not cover exactly the same option ids as options[]")

    if mismatches:
        return _result("frontier_integrity", False, [{"reason": "frontier classification mismatch", "details": mismatches}], validator, timestamp)

    status_counts = {status: sum(1 for entry in recomputed if entry["status"] == status) for status in VALID_STATUSES}
    return _result("frontier_integrity", True, [{"option_count": len(options), "status_counts": status_counts}], validator, timestamp)


def evaluate_no_automatic_authority_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the inferred no-automatic-authority rule structurally on any record handed to it -- not just
    trusting that ``generate_pareto_frontier_record``'s own construction-time check already ran (a
    hand-crafted/tampered record must still be caught, same discipline every sibling gate in this family
    already establishes)."""
    if not isinstance(record, dict):
        return _result("no_automatic_authority_claim", False, [{"reason": "record is not a dict"}], validator, timestamp)
    try:
        assert_no_automatic_authority_claim(record)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_pareto_frontier_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_frontier_integrity_gate(record, validator, timestamp),
        evaluate_no_automatic_authority_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
