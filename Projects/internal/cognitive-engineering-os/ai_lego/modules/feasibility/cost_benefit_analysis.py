"""``feasibility.cost_benefit_analysis`` -- F14 feasibility/economics family (Atlas L718-730), second member
built this batch (with ``feasibility.telos``, ``feasibility.cost_effectiveness`` -- 3 disjoint sibling agents
build the family's remaining 9 members concurrently this session).

Atlas gives this method a dedicated section, §12.25 (L2845-2853). Two verbatim rules, both made real structural
invariants here, not disclosure-only prose:

1. "**重要**：需 discounting、sensitivity、distributional effects" (L2850 -- MUST include discounting,
   sensitivity analysis, and distributional effects). Made structural per-alternative: ``discount_rate`` must be
   a real finite number > -1, and both ``sensitivity_analysis``/``distributional_effects`` must be non-empty
   disclosure strings -- a caller omitting any of the three cannot construct a record at all.
2. "**限制**：難貨幣化的人權、倫理、安全不可硬塞成假精準價格" (L2852 -- non-monetizable factors such as human
   rights, ethics, and safety must NOT be forced into a fake precise monetary price). Made structural via the
   ``non_monetizable``/``value`` coupling on every cost/benefit item: ``non_monetizable: true`` REQUIRES
   ``value: null`` (refusing exactly the "fake precise price on a flagged-non-monetizable item" L2852 forbids),
   and ``non_monetizable: false`` REQUIRES a real finite numeric ``value`` (a monetizable item cannot be left
   unpriced either -- the two rules are each other's mirror, not one-directional).

Both invariants enforced at TWO independent layers, same belt-and-suspenders discipline every prior slice in
this corpus establishes: construction-time refusal (``cost_benefit_item()``/``alternative()``/
``generate_cost_benefit_analysis`` raising before a bad record is ever built) and an independent gate
(``evaluate_alternative_integrity_gate``) that re-derives every rule -- including per-alternative id uniqueness
and per-item (cost/benefit) id uniqueness within each alternative -- from a record's own raw fields via the SAME
shared ``_item_problem``/``_alternative_problem`` predicates the builder uses, never trusting that construction-
time already ran.

Distinct from ``challenge.pre_mortem`` (reasons about FUTURE failure causes of a single plan, not present
monetizable alternatives) and ``foresight.scenario_planning`` (reasons about divergent FUTURE world-states, not
a cost/benefit comparison of known alternatives) -- grep-confirmed: both exist as separate methods in this
corpus with disjoint scope from this one (neither module mentions cost/benefit monetary comparison of
alternatives; this module mentions neither future scenarios nor failure-cause enumeration).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "cost-benefit"/"cost benefit"/"discounting"/"distributional effects" before writing any
of this method's own files: only a single narrative mention ("MCDA / cost-benefit criteria weighting") in
``specs/execution/method-resolution.schema.yaml`` describing an unrelated weighting-adjustment mechanism, and
this same batch's sibling F14 backlog entries -- zero pre-existing implementation or schema title overlap. See
``typed-objects/cost-benefit-analysis.schema.yaml``'s own ``verification`` for the full grep record.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.cost_benefit_analysis"
RECORD_ID_PREFIX = "CBA-"

_ITEM_KEYS = frozenset({"id", "description", "value", "non_monetizable"})
_ALTERNATIVE_KEYS = frozenset({"id", "costs", "benefits", "discount_rate", "sensitivity_analysis", "distributional_effects"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- same documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against). ``int`` is unconditionally
    finite in Python and is not passed through ``math.isfinite`` (that raises ``OverflowError`` on a huge
    ``int``, a trap only reachable via the ``float`` branch)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _item_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped cost/benefit item, honoring Atlas L2852's non-monetizable
    rule". Both ``cost_benefit_item()`` (construction layer) and ``evaluate_alternative_integrity_gate``
    (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ITEM_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ITEM_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ITEM_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    non_monetizable = value.get("non_monetizable")
    if not isinstance(non_monetizable, bool):
        return f"non_monetizable must be a bool, got {non_monetizable!r}"
    item_value = value.get("value")
    if non_monetizable:
        if item_value is not None:
            return (
                f"non_monetizable:true item {value.get('id')!r} must have value: null, got {item_value!r} -- "
                "Atlas §12.25 (L2852): non-monetizable factors must not be forced into a fake precise price"
            )
    else:
        if not _is_finite_number(item_value):
            return f"non_monetizable:false item {value.get('id')!r} must have a real finite numeric value, got {item_value!r}"
    return None


def cost_benefit_item(item_id: str, description: str, value: float | None, non_monetizable: bool) -> dict[str, Any]:
    """One item of an alternative's ``costs[]``/``benefits[]`` (shared shape for both). See module docstring for
    the ``non_monetizable``/``value`` coupling this enforces before ever returning."""
    record = {"id": item_id, "description": description, "value": value, "non_monetizable": non_monetizable}
    problem = _item_problem(record)
    if problem is not None:
        raise InvariantViolation(f"CBA_INVALID_ITEM: {problem}")
    return record


def _alternative_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped alternative". Both ``alternative()`` (construction layer)
    and ``evaluate_alternative_integrity_gate`` (independent re-derivation layer) consult it -- including the
    per-alternative duplicate-id checks WITHIN costs[] and WITHIN benefits[], the exact defect class (a gate
    never re-deriving its own builder's duplicate-id check) the most recent critic pass on this corpus's F13
    batch found in 3 of 14 sibling gates."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ALTERNATIVE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ALTERNATIVE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ALTERNATIVE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"

    for field in ("costs", "benefits"):
        items = value.get(field)
        if not isinstance(items, list) or not items:
            return f"{field} must be a non-empty list, got {_shallow_describe(items)}"
        for i, item in enumerate(items):
            problem = _item_problem(item)
            if problem is not None:
                return f"{field}[{i}]: {problem}"
        item_ids = [item["id"] for item in items]
        if len(set(item_ids)) != len(item_ids):
            duplicate = sorted({x for x in item_ids if item_ids.count(x) > 1})
            return f"duplicate id(s) {duplicate} within {field}"

    discount_rate = value.get("discount_rate")
    if not _is_finite_number(discount_rate) or discount_rate <= -1:
        return f"discount_rate must be a real finite number > -1, got {discount_rate!r}"
    if not _is_nonempty_str(value.get("sensitivity_analysis")):
        return "sensitivity_analysis must be a non-empty string -- Atlas §12.25 (L2850): 需 sensitivity"
    if not _is_nonempty_str(value.get("distributional_effects")):
        return "distributional_effects must be a non-empty string -- Atlas §12.25 (L2850): 需 distributional effects"
    return None


def alternative(
    alt_id: str,
    costs: list[dict[str, Any]],
    benefits: list[dict[str, Any]],
    discount_rate: float,
    sensitivity_analysis: str,
    distributional_effects: str,
) -> dict[str, Any]:
    """One item of ``typed-objects/cost-benefit-analysis.schema.yaml#/properties/alternatives``. Rebuilds every
    ``costs[]``/``benefits[]`` entry via ``cost_benefit_item()`` (never trusting the caller's raw dicts, and never
    aliasing the caller's own list/dict objects -- each rebuilt item is a fresh dict of scalar values), then
    enforces the fully-assembled record's own real invariants via ``_alternative_problem`` before returning."""
    if not isinstance(costs, list):
        raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: costs must be a list, got {type(costs).__name__}")
    if not isinstance(benefits, list):
        raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: benefits must be a list, got {type(benefits).__name__}")

    rebuilt_costs: list[dict[str, Any]] = []
    for i, c in enumerate(costs):
        if not isinstance(c, dict):
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: costs[{i}] must be a dict, got {c!r}")
        try:
            rebuilt_costs.append(cost_benefit_item(c.get("id"), c.get("description"), c.get("value"), c.get("non_monetizable")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: costs[{i}]: {error}") from error

    rebuilt_benefits: list[dict[str, Any]] = []
    for i, b in enumerate(benefits):
        if not isinstance(b, dict):
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: benefits[{i}] must be a dict, got {b!r}")
        try:
            rebuilt_benefits.append(cost_benefit_item(b.get("id"), b.get("description"), b.get("value"), b.get("non_monetizable")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: benefits[{i}]: {error}") from error

    record = {
        "id": alt_id,
        "costs": rebuilt_costs,
        "benefits": rebuilt_benefits,
        "discount_rate": discount_rate,
        "sensitivity_analysis": sensitivity_analysis,
        "distributional_effects": distributional_effects,
    }
    problem = _alternative_problem(record)
    if problem is not None:
        raise InvariantViolation(f"CBA_INVALID_ALTERNATIVE: {problem}")
    return record


def generate_cost_benefit_analysis(
    record_id: str,
    alternatives: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cost-benefit-analysis.schema.yaml``.

    Rebuilds every ``alternatives[]`` entry via ``alternative()`` (never trusting the caller's raw dicts), then
    enforces the method contract's own real invariant fail-closed, in order: id/version/provenance shape, >=1
    alternative declared, every alternative individually valid (via ``alternative()``), and no duplicate
    alternative ``id`` across the record -- BEFORE returning.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CBA_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CBA_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CBA_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(alternatives, list) or not alternatives:
        raise InvariantViolation(f"CBA_NO_ALTERNATIVES: at least 1 alternative is required, got {_shallow_describe(alternatives)}")
    rebuilt_alternatives: list[dict[str, Any]] = []
    for i, a in enumerate(alternatives):
        if not isinstance(a, dict):
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVES: alternatives[{i}] must be a dict, got {a!r}")
        try:
            rebuilt_alternatives.append(
                alternative(a.get("id"), a.get("costs"), a.get("benefits"), a.get("discount_rate"), a.get("sensitivity_analysis"), a.get("distributional_effects"))
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"CBA_INVALID_ALTERNATIVES: alternatives[{i}]: {error}") from error

    alt_ids = [a["id"] for a in rebuilt_alternatives]
    if len(set(alt_ids)) != len(alt_ids):
        duplicate = sorted({x for x in alt_ids if alt_ids.count(x) > 1})
        raise InvariantViolation(f"CBA_DUPLICATE_ALTERNATIVE_ID: id(s) {duplicate} used more than once across alternatives")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "alternatives": rebuilt_alternatives,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_cost_benefit_analysis -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
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


def evaluate_alternative_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields via the SAME ``_alternative_problem``/
    ``_item_problem`` predicates the builder uses (discounting/sensitivity/distributional-effects presence, the
    non_monetizable/value coupling, per-item duplicate ids WITHIN costs[]/benefits[]) plus the top-level
    duplicate-alternative-id check -- does NOT call ``generate_cost_benefit_analysis``, so a hand-tampered record
    is caught here exactly as a builder-refused one would have been. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("alternative_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    alternatives = record.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives:
        return _result("alternative_integrity", False, [{"reason": "alternatives must be a non-empty list"}], validator, timestamp)

    problems: list[str] = [f"alternatives[{i}]: {problem}" for i, problem in ((i, _alternative_problem(a)) for i, a in enumerate(alternatives)) if problem]
    well_shaped = [a for a in alternatives if _alternative_problem(a) is None]
    alt_ids = [a["id"] for a in well_shaped]
    if len(alt_ids) != len(set(alt_ids)):
        duplicate = sorted({x for x in alt_ids if alt_ids.count(x) > 1})
        problems.append(f"duplicate alternative id(s): {duplicate}")

    passed = not problems
    return _result("alternative_integrity", passed, [{"alternatives_checked": len(alternatives), "problems": problems}], validator, timestamp)


def evaluate_cost_benefit_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_alternative_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
