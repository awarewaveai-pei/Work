"""``delivery.risk_register`` -- F22 PM/delivery/governance family, OPENING member (F22 had zero built methods
before this batch -- grep-confirmed no ``ai_lego/modules/delivery/`` implementation existed at batch start;
1 of 4 concurrent agents opening F22 in this same parallel batch, this agent covering Risk Register + RACI
(delivery)).

Atlas cites this method ONCE: the F22 tool table row (L926: "Risk Register｜正式管理風險｜probability/impact/
exposure/owner/control/trigger｜讓風險可追蹤"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section, same thin-citation class ``stakeholders.raci``/``experiment.mvp``
already establish.

**Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored flag)**:

1. **Structural non-emptiness** (``RISKREG_EMPTY_RISKS`` / ``RISKREG_INVALID_RISK``): ``risks`` is a non-empty
   list; every risk has a non-empty ``risk_id``/``description``/``owner``/``control``/``trigger``, and
   ``probability``/``impact`` are each a real finite number in [0, 1] (``bool`` excluded -- same documented
   trap ``foresight.cross_impact_analysis``/``experiment.mvp`` already guard against).

2. **risk_id uniqueness across risks[]** (``RISKREG_DUPLICATE_RISK_ID``): L926's own "讓風險可追蹤" (make risk
   traceable) benefit is broken by a duplicate risk_id -- two entries claiming the same identity are not
   independently traceable.

3. **Exposure derivation, THE real invariant this method exists to enforce** (``RISKREG_EXPOSURE_MISMATCH``):
   ``exposure`` is MECHANICALLY DERIVED as ``probability * impact`` -- the per-risk builder (``risk_entry``)
   does not even accept an ``exposure`` parameter, so the happy-construction path cannot assert a mismatched
   value at all. The independent gate re-derives ``probability * impact`` from a raw (possibly hand-tampered)
   record and refuses a mismatch, same "derived, not asserted" discipline ``experiment.mvp``'s own ``outcome``
   field already establishes.

4. **Trackability** (``RISKREG_UNTRACKABLE_RISK``): every risk's ``owner``/``control``/``trigger`` must be
   non-empty -- a risk register entry missing any of these three is a label, not a tracked risk (L926's own
   defining benefit, "讓風險可追蹤").

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "risk register"/"RREG-"/"delivery\\." before writing any of this method's own files:
zero pre-existing implementation or schema title overlap (a field-level ``RISK-`` prefix exists inside
``dpia_pia.py``'s typed object, a different, unrelated method -- disambiguated via ``RREG-`` here).
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.risk_register"
RECORD_ID_PREFIX = "RREG-"
_RISK_KEYS = frozenset({"risk_id", "description", "probability", "impact", "exposure", "owner", "control", "trigger"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_unit_interval_number(value: Any) -> bool:
    """A real, finite number in [0, 1]. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- same
    documented trap this corpus's ``foresight.cross_impact_analysis``/``experiment.mvp`` already guard)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= 1
    if isinstance(value, float):
        return math.isfinite(value) and 0.0 <= value <= 1.0
    return False


def _risk_problem(value: Any, *, expected_exposure: float | None = None) -> str | None:
    """The single definition of "is this a well-shaped, internally-consistent risks[] entry" -- shape, range,
    exposure derivation, and owner/control/trigger non-emptiness, all together. Both ``risk_entry()``
    (construction layer, via the ``expected_exposure`` it itself just computed) and the gate (independent
    re-derivation layer, via its own recomputation) consult this same predicate, same single-shared-predicate
    discipline ``foresight.cross_impact_analysis``'s own ``_event_problem``/``_pair_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _RISK_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _RISK_KEYS <= value.keys():
        return f"missing key(s) {sorted(_RISK_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("risk_id")):
        return f"risk_id must be a non-empty string, got {value.get('risk_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not _is_unit_interval_number(value.get("probability")):
        return f"probability must be a real finite number in [0, 1] (bool excluded), got {value.get('probability')!r}"
    if not _is_unit_interval_number(value.get("impact")):
        return f"impact must be a real finite number in [0, 1] (bool excluded), got {value.get('impact')!r}"
    if not _is_unit_interval_number(value.get("exposure")):
        return f"exposure must be a real finite number in [0, 1] (bool excluded), got {value.get('exposure')!r}"
    computed_exposure = expected_exposure if expected_exposure is not None else value.get("probability") * value.get("impact")
    if value.get("exposure") != computed_exposure:
        return f"exposure={value.get('exposure')!r} but probability * impact = {computed_exposure!r} -- exposure must be mechanically derived, never independently asserted"
    if not _is_nonempty_str(value.get("owner")):
        return f"owner must be a non-empty string, got {value.get('owner')!r} -- a risk missing an owner is not actually tracked (L926's own '讓風險可追蹤')"
    if not _is_nonempty_str(value.get("control")):
        return f"control must be a non-empty string, got {value.get('control')!r} -- a risk missing a control is not actually tracked"
    if not _is_nonempty_str(value.get("trigger")):
        return f"trigger must be a non-empty string, got {value.get('trigger')!r} -- a risk missing a trigger is not actually tracked"
    return None


def risk_entry(risk_id: str, description: str, probability: float, impact: float, owner: str, control: str, trigger: str) -> dict[str, Any]:
    """One item of ``typed-objects/risk-register-record.schema.yaml#/properties/risks``.

    Deliberately takes NO ``exposure`` parameter -- ``exposure`` is computed internally as
    ``probability * impact`` and is structurally impossible for a caller to assert a mismatched value through
    this builder. A hand-tampered raw record that bypasses this builder entirely is still caught by
    ``evaluate_exposure_derivation_gate`` below.
    """
    if not _is_unit_interval_number(probability):
        raise InvariantViolation(f"RISKREG_INVALID_RISK: probability must be a real finite number in [0, 1] (bool excluded), got {probability!r}")
    if not _is_unit_interval_number(impact):
        raise InvariantViolation(f"RISKREG_INVALID_RISK: impact must be a real finite number in [0, 1] (bool excluded), got {impact!r}")
    exposure = probability * impact
    record = {
        "risk_id": risk_id,
        "description": description,
        "probability": probability,
        "impact": impact,
        "exposure": exposure,
        "owner": owner,
        "control": control,
        "trigger": trigger,
    }
    problem = _risk_problem(record, expected_exposure=exposure)
    if problem is not None:
        raise InvariantViolation(f"RISKREG_INVALID_RISK: {problem}")
    return record


def generate_risk_register(
    record_id: str,
    risks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/risk-register-record.schema.yaml``.

    Rebuilds every ``risks[]`` entry via ``risk_entry()`` (never trusting the caller's raw dicts -- ``exposure``
    is recomputed from scratch, discarding any ``exposure`` key the caller's raw dict may have carried), then
    enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    ``risks`` non-empty, every entry well-shaped with a mechanically-derived exposure and non-empty
    owner/control/trigger, and -- the cross-item check no single entry can see -- risk_id unique across the
    whole array (L926's own "讓風險可追蹤" benefit, broken by a duplicate identity).
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RISKREG_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RISKREG_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("RISKREG_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(risks, list) or not risks:
        raise InvariantViolation(f"RISKREG_EMPTY_RISKS: risks must be a non-empty list -- a register naming zero risks has not actually '正式管理風險' for anything, got {risks!r}")

    rebuilt_risks: list[dict[str, Any]] = []
    for i, r in enumerate(risks):
        if not isinstance(r, dict):
            raise InvariantViolation(f"RISKREG_INVALID_RISK: risks[{i}] must be a dict, got {r!r}")
        try:
            rebuilt_risks.append(
                risk_entry(
                    r.get("risk_id"),
                    r.get("description"),
                    r.get("probability"),
                    r.get("impact"),
                    r.get("owner"),
                    r.get("control"),
                    r.get("trigger"),
                )
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"RISKREG_INVALID_RISK: risks[{i}]: {error}") from error

    risk_ids = [r["risk_id"] for r in rebuilt_risks]
    if len(risk_ids) != len(set(risk_ids)):
        duplicate = sorted({rid for rid in risk_ids if risk_ids.count(rid) > 1})
        raise InvariantViolation(f"RISKREG_DUPLICATE_RISK_ID: risk_id(s) {duplicate} appear in more than one risks[] entry -- breaks the traceability L926's own '讓風險可追蹤' benefit requires")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "risks": rebuilt_risks,
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


def evaluate_exposure_derivation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives, for every ``risks[]`` entry, ``exposure == probability * impact`` directly from raw fields --
    without this the gate could pass a hand-tampered record whose exposure was rewritten after construction to
    disagree with its own probability/impact. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("exposure_derivation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    risks = record.get("risks")
    if not isinstance(risks, list) or not risks:
        return _result("exposure_derivation", False, [{"reason": "risks missing, not a list, or empty"}], validator, timestamp)
    problems: list[str] = []
    for i, r in enumerate(risks):
        if not isinstance(r, dict) or not _is_unit_interval_number(r.get("probability")) or not _is_unit_interval_number(r.get("impact")) or not _is_unit_interval_number(r.get("exposure")):
            problems.append(f"risks[{i}] malformed or non-numeric probability/impact/exposure")
            continue
        expected = r["probability"] * r["impact"]
        if r["exposure"] != expected:
            problems.append(f"risks[{i}] (risk_id={r.get('risk_id')!r}) exposure={r['exposure']!r} but probability * impact = {expected!r}")
    return _result("exposure_derivation", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_trackability_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives owner/control/trigger non-emptiness AND risk_id uniqueness directly from raw fields -- does
    NOT trust that the builder's own checks already ran. Fails closed on malformed entries rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("trackability", False, [{"reason": "record is not a dict"}], validator, timestamp)
    risks = record.get("risks")
    if not isinstance(risks, list) or not risks:
        return _result("trackability", False, [{"reason": "risks missing, not a list, or empty"}], validator, timestamp)
    problems: list[str] = []
    risk_ids: list[str] = []
    for i, r in enumerate(risks):
        if not isinstance(r, dict):
            problems.append(f"risks[{i}] is not a dict")
            continue
        if _is_nonempty_str(r.get("risk_id")):
            risk_ids.append(r["risk_id"])
        for field in ("owner", "control", "trigger"):
            if not _is_nonempty_str(r.get(field)):
                problems.append(f"risks[{i}] (risk_id={r.get('risk_id')!r}) has empty or missing {field!r}")
    if len(risk_ids) != len(set(risk_ids)):
        duplicate = sorted({rid for rid in risk_ids if risk_ids.count(rid) > 1})
        problems.append(f"duplicate risk_id(s): {duplicate}")
    return _result("trackability", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_risk_register_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_exposure_derivation_gate(record, validator, timestamp),
        evaluate_trackability_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
