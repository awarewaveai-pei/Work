"""``feasibility.telos`` -- F14 feasibility/economics family (Atlas L718-730), first member built this batch
(with ``feasibility.cost_benefit_analysis``, ``feasibility.cost_effectiveness`` -- 3 disjoint sibling agents
build the family's remaining 9 members concurrently this session).

Atlas gives this method a dedicated section, §12.24 (L2831-2843), a verbatim 5-element checklist in a text
fence: Technical, Economic, Legal, Operational, Schedule. Stated benefit (L2841, verbatim): "避免工程師只證明
「技術做得到」就認為專案可行" (prevent engineers declaring a project feasible just because it is technically
possible). The F14 table row (L722) names the exact per-dimension use: "五面向列 assumptions/evidence/gaps/stop
conditions".

THE real invariant, made structural directly from §12.24's own checklist: a "feasible" verdict resting on only
the technical dimension (or any subset) is precisely the failure mode this method exists to prevent, so ALL 5
dimensions are required BUILDER PARAMETERS (a caller cannot omit one and still call the function -- a plain
Python ``TypeError``, not a silently-accepted partial assessment), and each dimension must carry >=1 non-empty
entry across its own ``assumptions``/``evidence``/``gaps``/``stop_conditions`` fields COMBINED -- a dimension
recorded as entirely empty was never actually assessed, the same "recorded but blank" failure Atlas's own L2841
benefit column exists to prevent. Enforced at TWO independent layers, same belt-and-suspenders discipline every
prior slice in this corpus establishes: construction-time refusal (``dimension()``/``generate_telos_assessment``
raising before a bad record is ever built) and an independent gate (``evaluate_five_dimensions_complete_gate``)
that re-derives the same rule from a record's own raw fields, never trusting that construction-time already ran
-- catches a hand-tampered record that dropped a dimension key entirely or hand-crafted an empty one.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "telos"/"feasibility" before writing any of this method's own files: only narrative
mentions of the term "feasibility" as a general concept (a future-screening enum value on unrelated divergent-
family records, an MCDA convergence step) and the sibling F14 backlog entries this same batch is filling in --
zero pre-existing TELOS implementation or schema title overlap. See ``typed-objects/telos-feasibility-
assessment.schema.yaml``'s own ``verification`` for the full grep record.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.telos"
RECORD_ID_PREFIX = "TELOS-"

# Atlas §12.24's own 5-element checklist, verbatim order.
DIMENSION_NAMES = ("technical", "economic", "legal", "operational", "schedule")
_DIMENSION_LIST_FIELDS = ("assumptions", "evidence", "gaps", "stop_conditions")
_DIMENSION_KEYS = frozenset(_DIMENSION_LIST_FIELDS)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _string_list_problem(value: Any, field_name: str) -> str | None:
    if not isinstance(value, list):
        return f"{field_name} must be a list, got {_shallow_describe(value)}"
    for i, item in enumerate(value):
        if not _is_nonempty_str(item):
            return f"{field_name}[{i}] must be a non-empty string, got {item!r}"
    return None


def _dimension_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, actually-assessed TELOS dimension". Both ``dimension()``
    (construction layer) and ``evaluate_five_dimensions_complete_gate`` (independent re-derivation layer) consult
    it, same single-shared-predicate discipline ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes
    -- the two layers cannot drift apart on what "assessed" means."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _DIMENSION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _DIMENSION_KEYS <= value.keys():
        return f"missing key(s) {sorted(_DIMENSION_KEYS - value.keys(), key=repr)}"
    for field in _DIMENSION_LIST_FIELDS:
        problem = _string_list_problem(value.get(field), field)
        if problem is not None:
            return problem
    total_entries = sum(len(value[field]) for field in _DIMENSION_LIST_FIELDS)
    if total_entries == 0:
        return (
            "dimension has zero entries across assumptions/evidence/gaps/stop_conditions combined -- Atlas "
            "§12.24's own 5-element checklist requires every dimension to actually be assessed, not left blank "
            "(L2841: 避免工程師只證明「技術做得到」就認為專案可行)"
        )
    return None


def dimension(
    *,
    assumptions: list[str] | None = None,
    evidence: list[str] | None = None,
    gaps: list[str] | None = None,
    stop_conditions: list[str] | None = None,
) -> dict[str, Any]:
    """One TELOS dimension (``technical``/``economic``/``legal``/``operational``/``schedule``), each an item of
    ``typed-objects/telos-feasibility-assessment.schema.yaml``'s corresponding property. At least one of the four
    list fields must end up non-empty (``_dimension_problem`` enforces this) -- a dimension built with all four
    fields omitted is refused, not silently accepted as "assessed, nothing to report"."""
    record: dict[str, Any] = {
        "assumptions": list(assumptions) if assumptions else [],
        "evidence": list(evidence) if evidence else [],
        "gaps": list(gaps) if gaps else [],
        "stop_conditions": list(stop_conditions) if stop_conditions else [],
    }
    problem = _dimension_problem(record)
    if problem is not None:
        raise InvariantViolation(f"TELOS_INVALID_DIMENSION: {problem}")
    return record


def generate_telos_assessment(
    assessment_id: str,
    technical: dict[str, Any],
    economic: dict[str, Any],
    legal: dict[str, Any],
    operational: dict[str, Any],
    schedule: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/telos-feasibility-assessment.schema.yaml``.

    All 5 dimensions are REQUIRED positional parameters -- there is no way to call this function while omitting
    one (a plain Python ``TypeError``, not a silently-accepted partial assessment). Each dimension is independently
    re-validated via ``_dimension_problem`` (never trusting a caller-supplied dict that merely LOOKS like a
    ``dimension()`` return value) and rebuilt into a fresh dict of freshly-copied scalar-and-list content before
    being stored, so no nested list from the caller's own input is aliased into the returned record.
    """
    if not _is_nonempty_str(assessment_id) or not assessment_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TELOS_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {assessment_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TELOS_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TELOS_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    supplied = {"technical": technical, "economic": economic, "legal": legal, "operational": operational, "schedule": schedule}
    rebuilt: dict[str, dict[str, Any]] = {}
    for name in DIMENSION_NAMES:
        value = supplied[name]
        problem = _dimension_problem(value)
        if problem is not None:
            raise InvariantViolation(f"TELOS_INVALID_DIMENSION: {name}: {problem}")
        rebuilt[name] = {field: list(value[field]) for field in _DIMENSION_LIST_FIELDS}

    return {
        "id": assessment_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "technical": rebuilt["technical"],
        "economic": rebuilt["economic"],
        "legal": rebuilt["legal"],
        "operational": rebuilt["operational"],
        "schedule": rebuilt["schedule"],
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_telos_assessment -- a hand-tampered record that bypassed the builder entirely (e.g. dropped a
# dimension key, or hand-crafted one with all four lists empty) must be caught exactly as a builder-refused one
# would have been.
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


def evaluate_five_dimensions_complete_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §12.24's own 5-element-checklist rule directly from the record's OWN raw fields -- does
    not trust that ``generate_telos_assessment``'s own construction-time check already ran. Catches a
    hand-tampered record that dropped a dimension key entirely (a subset-of-5 "feasible" verdict, exactly the
    failure L2841 names) or hand-crafted a dimension with all four lists empty. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("five_dimensions_complete", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    for name in DIMENSION_NAMES:
        if name not in record:
            problems.append(f"missing dimension: {name!r}")
            continue
        problem = _dimension_problem(record[name])
        if problem is not None:
            problems.append(f"{name}: {problem}")
    passed = not problems
    return _result("five_dimensions_complete", passed, [{"dimensions_checked": list(DIMENSION_NAMES), "problems": problems}], validator, timestamp)


def evaluate_telos_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_five_dimensions_complete_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
