"""``feasibility.real_options`` -- F14 feasibility family (Atlas L718-730, this method's own row L730).

Atlas F14 table row (L730, verbatim): "Real Options｜把延後/擴張/退出視為
option｜triggers/cost/future states→option value｜避免一次性 yes/no". Atlas's
own stated benefit is avoiding "一次性 yes/no" (a one-shot yes/no decision) --
made a real structural invariant, not an assertable field, via two rules
enforced at TWO independent layers (builder refuses at construction; the
gate independently re-derives both from raw fields, same belt-and-suspenders
discipline every prior slice in this corpus establishes):

  1. Every option needs a non-empty ``trigger_condition`` -- Atlas's own
     literal "triggers" pipeline element. An "option" with no defined
     condition for exercising it is a hope, not a real option.
  2. Every option needs >=2 ``future_states[]`` with distinct (normalized:
     casefolded + whitespace-collapsed) descriptions -- an option analysis
     naming only ONE future state has collapsed back into the single-
     scenario, one-shot analysis Atlas L730 exists to avoid.

``option_type`` is a closed enum {DEFER, EXPAND, CONTRACT, ABANDON, SWITCH}
-- the standard real-options-theory taxonomy (compilation decision,
disclosed in the contract: Atlas names only 延後/擴張/退出 as *examples*, not
an exhaustive list; SWITCH and CONTRACT are added from the same textbook
taxonomy those three examples are drawn from).

Every ``options[]``/``future_states[]`` entry is rebuilt via
``copy.deepcopy`` at construction, and ``provenance`` is deep-copied at the
return statement -- a critic pass on this corpus's own F13 batch (2026-09-12)
found 11 of 14 sibling builders returned ``provenance`` by reference; applied
proactively here.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "real option"/"trigger_condition"/"future_states" before writing: hits
only in ``specs/execution/change-plan.schema.yaml``/``rollback.schema.yaml``
(a plural, differently-named ``trigger_conditions_met`` field on
infrastructure change plans -- an unrelated concept, no collision) and this
method's own backlog listing rows (``methods/registry/method-inventory.yaml``
L975, ``contract-backlog.yaml``). No duplicate found.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.real_options"
RECORD_ID_PREFIX = "ROPT-"
VALID_OPTION_TYPES = frozenset({"DEFER", "EXPAND", "CONTRACT", "ABANDON", "SWITCH"})
_FUTURE_STATE_KEYS = frozenset({"id", "description", "estimated_value"})
_OPTION_KEYS = frozenset({"id", "option_type", "trigger_condition", "cost", "future_states"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Real, finite number -- ``bool`` excluded (same documented trap ``epistemic.bayesian_updating``'s own
    ``_is_valid_probability`` guards against). ``int`` is unconditionally finite in Python; ``float`` is checked
    via ``math.isfinite``."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _normalize_description(value: str) -> str:
    """Casefolded + whitespace-collapsed form used only to detect near-duplicate future-state descriptions --
    never stored, never returned."""
    return " ".join(value.casefold().split())


def _future_state_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped future state" -- both ``future_state()`` (construction
    layer) and the gate's own re-derivation consult it, same shared-predicate discipline
    ``epistemic.evidence_matrix``'s ``_link_problem`` establishes. Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _FUTURE_STATE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _FUTURE_STATE_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not _is_finite_number(value.get("estimated_value")):
        return f"estimated_value must be a real finite number (bool excluded), got {value.get('estimated_value')!r}"
    return None


def future_state(state_id: str, description: str, estimated_value: float) -> dict[str, Any]:
    """One item of ``typed-objects/real-options-analysis.schema.yaml#/properties/options/items/properties/future_states``."""
    record = {"id": state_id, "description": description, "estimated_value": estimated_value}
    problem = _future_state_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ROPT_INVALID_FUTURE_STATE: {problem}")
    return record


def _option_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped option, ignoring the >=2-distinct-future-states rule"
    (that cross-field count/distinctness invariant is checked once, over the fully rebuilt list, by
    ``generate_real_options_analysis``/``evaluate_option_structure_gate`` -- both call this AND the
    distinctness check, never just one). Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _OPTION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _OPTION_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if value.get("option_type") not in VALID_OPTION_TYPES:
        return f"option_type must be one of {sorted(VALID_OPTION_TYPES)}, got {value.get('option_type')!r}"
    if not _is_nonempty_str(value.get("trigger_condition")):
        return f"trigger_condition must be a non-empty string, got {value.get('trigger_condition')!r} -- Atlas L730's own 'triggers' pipeline element, and an option with no exercise condition is a hope, not a real option"
    if not _is_finite_number(value.get("cost")):
        return f"cost must be a real finite number (bool excluded), got {value.get('cost')!r}"
    future_states = value.get("future_states")
    if not isinstance(future_states, list):
        return f"future_states must be a list, got {type(future_states).__name__}"
    for i, fs in enumerate(future_states):
        fs_problem = _future_state_problem(fs)
        if fs_problem is not None:
            return f"future_states[{i}]: {fs_problem}"
    return None


def _future_states_distinctness_problem(future_states: list[dict[str, Any]]) -> str | None:
    """Atlas L730's own stated purpose ('避免一次性 yes/no') made real: >=2 future states, with distinct
    (normalized) descriptions -- a single-scenario option analysis has collapsed back into the one-shot
    decision this method exists to avoid. Assumes every entry already passed ``_future_state_problem``."""
    if len(future_states) < 2:
        return f"at least 2 future_states are required (got {len(future_states)}) -- a single future state is a one-shot scenario, exactly what Atlas L730 exists to avoid"
    normalized = [_normalize_description(fs["description"]) for fs in future_states]
    duplicates = sorted({d for d in normalized if normalized.count(d) > 1})
    if duplicates:
        return f"future_states[] descriptions must be distinct after normalization, duplicate(s): {duplicates}"
    return None


def option(option_id: str, option_type: str, trigger_condition: str, cost: float, future_states: list[dict[str, Any]]) -> dict[str, Any]:
    """One item of ``typed-objects/real-options-analysis.schema.yaml#/properties/options``. Rebuilds every
    future state via ``future_state()`` (never trusting the caller's raw dicts), then enforces the >=2-distinct
    invariant -- BEFORE returning. Fails closed (not a crash) if ``future_states`` itself is not a list."""
    if not isinstance(future_states, list):
        raise InvariantViolation(f"ROPT_INVALID_OPTION: future_states must be a list, got {future_states!r}")
    rebuilt_future_states = [future_state(fs.get("id") if isinstance(fs, dict) else None, fs.get("description") if isinstance(fs, dict) else None, fs.get("estimated_value") if isinstance(fs, dict) else None) for fs in future_states]
    record = {"id": option_id, "option_type": option_type, "trigger_condition": trigger_condition, "cost": cost, "future_states": rebuilt_future_states}
    problem = _option_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ROPT_INVALID_OPTION: {problem}")
    distinctness_problem = _future_states_distinctness_problem(rebuilt_future_states)
    if distinctness_problem is not None:
        raise InvariantViolation(f"ROPT_INSUFFICIENT_FUTURE_STATES: option {option_id!r}: {distinctness_problem}")
    return record


def generate_real_options_analysis(
    record_id: str,
    subject_ref: str,
    options: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/real-options-analysis.schema.yaml``.

    Rebuilds every option via ``option()`` (never trusting the caller's raw dicts -- this also re-enforces the
    per-option trigger_condition and >=2-distinct-future-states rules), then enforces the record-level
    invariants fail-closed, in order: id/version/provenance shape, subject_ref, >=1 option declared, unique
    option ids -- BEFORE returning.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ROPT_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ROPT_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"ROPT_INVALID_PROVENANCE: provenance failed schema validation, got {provenance!r}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"ROPT_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")
    if not isinstance(options, list) or not options:
        raise InvariantViolation("ROPT_NO_OPTIONS: at least 1 option is required")

    rebuilt_options: list[dict[str, Any]] = []
    for i, o in enumerate(options):
        if not isinstance(o, dict):
            raise InvariantViolation(f"ROPT_INVALID_OPTION: options[{i}] must be a dict, got {o!r}")
        rebuilt_options.append(option(o.get("id"), o.get("option_type"), o.get("trigger_condition"), o.get("cost"), o.get("future_states")))

    option_ids = [o["id"] for o in rebuilt_options]
    duplicate_ids = sorted({oid for oid in option_ids if option_ids.count(oid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"ROPT_DUPLICATE_OPTION_ID: options[] ids must be unique, duplicates found: {duplicate_ids}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "options": rebuilt_options,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_real_options_analysis -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_option_structure_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY per-option real invariant directly from raw fields via the SAME predicates
    ``option()``/``future_state()`` use -- not just trusting that ``generate_real_options_analysis``'s own
    construction-time check already ran. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("option_structure", False, [{"reason": "record is not a dict"}], validator, timestamp)
    options = record.get("options")
    if not isinstance(options, list) or not options:
        return _result("option_structure", False, [{"reason": "options must be a non-empty list"}], validator, timestamp)

    problems: list[str] = []
    for i, o in enumerate(options):
        shape_problem = _option_problem(o)
        if shape_problem is not None:
            problems.append(f"options[{i}]: {shape_problem}")
            continue
        distinctness_problem = _future_states_distinctness_problem(o["future_states"])
        if distinctness_problem is not None:
            problems.append(f"options[{i}] ({o.get('id')!r}): {distinctness_problem}")

    passed = not problems
    return _result("option_structure", passed, [{"options_checked": len(options), "problems": problems}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the record-level uniqueness invariant (unique option ids) directly from raw fields -- not just
    trusting that the builder's own construction-time check already ran (the exact defect class a critic pass
    found in 3 of this corpus's own F13 gates: a duplicate-id check present in the builder but absent from the
    gate, letting a hand-tampered record with duplicate ids pass)."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    options = record.get("options")
    if not isinstance(options, list):
        return _result("referential_integrity", False, [{"reason": "options must be a list"}], validator, timestamp)
    option_ids = [o.get("id") if isinstance(o, dict) else None for o in options]
    duplicate_ids = sorted({oid for oid in option_ids if option_ids.count(oid) > 1}, key=repr)
    passed = not duplicate_ids
    return _result("referential_integrity", passed, [{"duplicate_option_ids": duplicate_ids}], validator, timestamp)


def evaluate_real_options_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_option_structure_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
