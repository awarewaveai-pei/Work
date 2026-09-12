"""``jurisdiction.obligation_to_control_mapping`` -- F23 global jurisdiction/compliance/localization family,
OPENING member (F23 had zero built methods before this batch -- grep-confirmed no
``ai_lego/modules/jurisdiction/`` implementation existed at batch start; 1 of 4 concurrent agents opening F23
in this same parallel batch, this agent covering Obligation-to-Control Mapping + Compliance Gap Analysis +
Regulatory Horizon Scan).

Atlas cites this method ONCE: the F23 tool table row (L937, verbatim: "Obligation-to-Control Mapping | 法律
義務轉工程控制 | obligation->control->owner->evidence->test | 法務與工程可對接"). Grep-confirmed the only real
hit case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation class
``delivery.risk_register``/``experiment.mvp`` already establish.

**Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored flag)**:

1. **Structural non-emptiness** (``OCM_EMPTY_OBLIGATIONS`` / ``OCM_INVALID_OBLIGATION`` /
   ``OCM_INVALID_CONTROL``): ``obligations`` is a non-empty list, every obligation has a non-empty
   ``obligation_id``/``description``; every control has a non-empty ``control_id``/``obligation_id``/
   ``owner``/``evidence``/``test``.

2. **obligation_id / control_id uniqueness** (``OCM_DUPLICATE_OBLIGATION_ID`` / ``OCM_DUPLICATE_CONTROL_ID``):
   L937's own "法務與工程可對接" (legal and engineering can connect) benefit is broken by a duplicate identity
   on either side -- two entries claiming the same id are not independently addressable.

3. **Referential integrity** (``OCM_ORPHAN_CONTROL``): every ``controls[].obligation_id`` must resolve to a
   declared ``obligations[]`` entry -- a control mapping to nothing real is not actually connected to any
   legal obligation.

4. **Obligation coverage, THE real invariant this method exists to enforce** (``OCM_UNCOVERED_OBLIGATION``):
   every declared ``obligations[]`` entry must be referenced by at least one ``controls[]`` entry. An
   obligation with zero controls is exactly the "法務與工程無法對接" failure Atlas L937's own benefit column
   names -- legal declared a duty and engineering never built anything to satisfy it.

5. **Trackability** (folded into ``OCM_INVALID_CONTROL``): every control's ``owner``/``evidence``/``test``
   must be non-empty -- a control missing any of these three is a label, not a real control (Atlas L937's own
   pipeline names all three as required stages).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "obligation-to-control"/"obligation to control"/"OCM-"/"jurisdiction\\." before writing
any of this method's own files: zero pre-existing implementation or schema title overlap (the "jurisdiction"
family/module namespace itself did not exist before this batch).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.obligation_to_control_mapping"
RECORD_ID_PREFIX = "OCM-"
_OBLIGATION_KEYS = frozenset({"obligation_id", "description"})
_CONTROL_KEYS = frozenset({"control_id", "obligation_id", "owner", "evidence", "test"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _obligation_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped obligations[] entry". Both ``obligation()``
    (construction layer) and the gate (independent re-derivation layer) consult it, same single-shared-
    predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _OBLIGATION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _OBLIGATION_KEYS <= value.keys():
        return f"missing key(s) {sorted(_OBLIGATION_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("obligation_id")):
        return f"obligation_id must be a non-empty string, got {value.get('obligation_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def obligation(obligation_id: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/obligation-to-control-mapping-record.schema.yaml#/properties/obligations``."""
    record = {"obligation_id": obligation_id, "description": description}
    problem = _obligation_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OCM_INVALID_OBLIGATION: {problem}")
    return record


def _control_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped controls[] entry" -- shape/non-emptiness only, NOT
    referential integrity against ``obligations[]``, which needs the sibling array and is checked once in
    ``generate_obligation_to_control_mapping``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CONTROL_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _CONTROL_KEYS <= value.keys():
        return f"missing key(s) {sorted(_CONTROL_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("control_id")):
        return f"control_id must be a non-empty string, got {value.get('control_id')!r}"
    if not _is_nonempty_str(value.get("obligation_id")):
        return f"obligation_id must be a non-empty string, got {value.get('obligation_id')!r}"
    if not _is_nonempty_str(value.get("owner")):
        return f"owner must be a non-empty string, got {value.get('owner')!r} -- a control missing an owner is not actually tracked (Atlas L937's own pipeline)"
    if not _is_nonempty_str(value.get("evidence")):
        return f"evidence must be a non-empty string, got {value.get('evidence')!r} -- a control missing evidence is not actually tracked"
    if not _is_nonempty_str(value.get("test")):
        return f"test must be a non-empty string, got {value.get('test')!r} -- a control missing a test is not actually tracked"
    return None


def control(control_id: str, obligation_id: str, owner: str, evidence: str, test: str) -> dict[str, Any]:
    """One item of ``typed-objects/obligation-to-control-mapping-record.schema.yaml#/properties/controls``.
    Does NOT itself check referential integrity against a declared ``obligations[]`` list, or obligation
    coverage -- those cross-array checks happen once, in ``generate_obligation_to_control_mapping``, after
    every control has been rebuilt."""
    record = {"control_id": control_id, "obligation_id": obligation_id, "owner": owner, "evidence": evidence, "test": test}
    problem = _control_problem(record)
    if problem is not None:
        raise InvariantViolation(f"OCM_INVALID_CONTROL: {problem}")
    return record


def generate_obligation_to_control_mapping(
    record_id: str,
    obligations: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/obligation-to-control-mapping-record.schema.yaml``.

    Rebuilds every ``obligations[]``/``controls[]`` entry via ``obligation()``/``control()`` (never trusting
    the caller's raw dicts), then enforces the method contract's own real invariants fail-closed, in order:
    id/version/provenance shape, obligations non-empty with unique obligation_id, controls well-shaped with
    unique control_id, every control resolves to a declared obligation (no orphan control), and -- the
    invariant Atlas's own "obligation->control" pipeline stage exists to enforce -- every declared obligation
    is referenced by at least one control -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OCM_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OCM_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("OCM_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(obligations, list) or not obligations:
        raise InvariantViolation(f"OCM_EMPTY_OBLIGATIONS: obligations must be a non-empty list -- a mapping over zero obligations has nothing to connect to engineering, got {obligations!r}")
    rebuilt_obligations: list[dict[str, Any]] = []
    for i, o in enumerate(obligations):
        if not isinstance(o, dict):
            raise InvariantViolation(f"OCM_INVALID_OBLIGATION: obligations[{i}] must be a dict, got {o!r}")
        try:
            rebuilt_obligations.append(obligation(o.get("obligation_id"), o.get("description")))
        except InvariantViolation as error:
            raise InvariantViolation(f"OCM_INVALID_OBLIGATION: obligations[{i}]: {error}") from error
    obligation_ids = [o["obligation_id"] for o in rebuilt_obligations]
    if len(obligation_ids) != len(set(obligation_ids)):
        duplicate = sorted({oid for oid in obligation_ids if obligation_ids.count(oid) > 1})
        raise InvariantViolation(f"OCM_DUPLICATE_OBLIGATION_ID: obligation_id(s) {duplicate} declared more than once")

    if not isinstance(controls, list):
        raise InvariantViolation(f"OCM_INVALID_CONTROLS: controls must be a list, got {type(controls).__name__}")
    rebuilt_controls: list[dict[str, Any]] = []
    for i, c in enumerate(controls):
        if not isinstance(c, dict):
            raise InvariantViolation(f"OCM_INVALID_CONTROL: controls[{i}] must be a dict, got {c!r}")
        try:
            rebuilt_controls.append(control(c.get("control_id"), c.get("obligation_id"), c.get("owner"), c.get("evidence"), c.get("test")))
        except InvariantViolation as error:
            raise InvariantViolation(f"OCM_INVALID_CONTROL: controls[{i}]: {error}") from error
    control_ids = [c["control_id"] for c in rebuilt_controls]
    if len(control_ids) != len(set(control_ids)):
        duplicate = sorted({cid for cid in control_ids if control_ids.count(cid) > 1})
        raise InvariantViolation(f"OCM_DUPLICATE_CONTROL_ID: control_id(s) {duplicate} declared more than once")

    obligation_id_set = set(obligation_ids)
    orphans = sorted({c["obligation_id"] for c in rebuilt_controls} - obligation_id_set)
    if orphans:
        raise InvariantViolation(f"OCM_ORPHAN_CONTROL: controls[] reference obligation_id(s) {orphans} not present in obligations[]")

    covered = {c["obligation_id"] for c in rebuilt_controls}
    uncovered = sorted(obligation_id_set - covered)
    if uncovered:
        raise InvariantViolation(
            f"OCM_UNCOVERED_OBLIGATION: obligation(s) {uncovered} have zero controls mapped to them. "
            "Atlas L937's own 'obligation->control' pipeline stage requires every declared obligation to be covered"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "obligations": rebuilt_obligations,
        "controls": rebuilt_controls,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives obligations/controls shape, uniqueness, and referential integrity (no orphan control)
    directly from raw fields using the SAME ``_obligation_problem``/``_control_problem`` predicates the
    builder uses -- without this the gate could pass records the builder refuses. Fails closed on malformed
    entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    obligations = record.get("obligations")
    obligation_id_set: set[Any] = set()
    if isinstance(obligations, list) and obligations:
        malformed_obligations = [f"obligations[{i}]: {problem}" for i, problem in ((i, _obligation_problem(o)) for i, o in enumerate(obligations)) if problem]
        problems.extend(malformed_obligations)
        well_shaped_obligations = [o for o in obligations if _obligation_problem(o) is None]
        obligation_ids = [o["obligation_id"] for o in well_shaped_obligations]
        obligation_id_set = set(obligation_ids)
        if len(obligation_ids) != len(obligation_id_set):
            problems.append(f"duplicate obligation_id in obligations[]: {obligation_ids!r}")
    else:
        problems.append("obligations must be a non-empty list")

    controls = record.get("controls")
    if isinstance(controls, list):
        malformed_controls = [f"controls[{i}]: {problem}" for i, problem in ((i, _control_problem(c)) for i, c in enumerate(controls)) if problem]
        problems.extend(malformed_controls)
        well_shaped_controls = [c for c in controls if _control_problem(c) is None]
        control_ids = [c["control_id"] for c in well_shaped_controls]
        if len(control_ids) != len(set(control_ids)):
            problems.append(f"duplicate control_id in controls[]: {control_ids!r}")
        orphans = sorted({c["obligation_id"] for c in well_shaped_controls} - obligation_id_set, key=repr)
        if orphans:
            problems.append(f"orphan control obligation_id ref(s): {orphans}")
    else:
        problems.append("controls must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_obligation_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L937's own 'obligation->control' requirement directly from raw fields -- every
    declared obligation is referenced by at least one control. Fails closed on malformed entries rather than
    crashing, and does NOT assume referential integrity already passed (recomputes against well-shaped
    obligations/controls only)."""
    if not isinstance(record, dict):
        return _result("obligation_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    obligations = record.get("obligations")
    controls = record.get("controls")
    if not isinstance(obligations, list) or not obligations or not isinstance(controls, list):
        return _result("obligation_coverage", False, [{"reason": "obligations must be a non-empty list and controls must be a list"}], validator, timestamp)

    well_shaped_obligations = [o for o in obligations if _obligation_problem(o) is None]
    obligation_ids = [o["obligation_id"] for o in well_shaped_obligations]
    if len(well_shaped_obligations) != len(obligations) or len(obligation_ids) != len(set(obligation_ids)):
        return _result("obligation_coverage", False, [{"reason": "one or more obligations[] entries are malformed or duplicated"}], validator, timestamp)

    well_shaped_controls = [c for c in controls if _control_problem(c) is None]
    obligation_id_set = set(obligation_ids)
    referentially_valid_controls = [c for c in well_shaped_controls if c["obligation_id"] in obligation_id_set]

    covered = {c["obligation_id"] for c in referentially_valid_controls}
    uncovered = sorted(obligation_id_set - covered)
    problems: list[str] = []
    if len(well_shaped_controls) != len(controls):
        problems.append("one or more controls[] entries are malformed")
    if uncovered:
        problems.append(f"uncovered obligation(s): {uncovered}")
    passed = not problems
    return _result("obligation_coverage", passed, [{"obligation_count": len(obligation_id_set), "covered_count": len(covered), "problems": problems}], validator, timestamp)


def evaluate_obligation_to_control_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_obligation_coverage_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
