"""``epistemic.argument_mapping`` -- F10 epistemic-quality family (Atlas L566-600, this method's own row L573).

Atlas's own table row (L573, verbatim): "Argument Mapping | Claim/Reason/
Objection 結構化 | main claim->support->objection->rebuttal->evidence | 論證
可檢查" (structure Claim/Reason/Objection; main claim->support->objection->
rebuttal->evidence; the argument becomes checkable).

Real invariant (referential integrity over the argument graph), enforced at
TWO independent layers, same belt-and-suspenders discipline every prior
slice in this corpus establishes: every ``rebuttals[].objection_id`` must
resolve to a real declared ``objections[].id`` -- a rebuttal answering an
objection that was never raised is a dangling argument node, refused BEFORE
construction and independently re-derived by ``evaluate_referential_integrity_gate``
from raw fields (never trusting that the builder's own check already ran).
Plus: ``supports`` requires >=1 entry (Atlas's own pipeline starts main
claim->SUPPORT, not main claim->objection -- a claim with zero supporting
reason is not yet an argument), and ``objections[].id`` values must be
unique within the array.

Composes, does not duplicate: ``main_claim`` is a real ``specs/evidence/
claim.schema.yaml``-shaped dict (structural sanity checked here; full
conformance is the schema layer's own job) -- this method does not mint a
second claim record shape. Because a real Claim record may itself carry
nested list fields (``supporting_evidence``/``contradicting_evidence``),
``main_claim`` is rebuilt via ``copy.deepcopy`` before being returned, not a
shallow ``dict(main_claim)`` copy -- a critic review of this corpus's own
F09 batch (2026-09-12, ``ai_lego/modules/systems/__init__.py``) found this
exact shallow-copy-does-not-copy-nested-lists defect in three sibling
builders (a "validated" returned record silently shared a mutable list
object with the caller's own input) and this module applies that fix
proactively rather than repeating it.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"argument map"/"evidence matrix"/"objection"/"rebuttal"/"toulmin" before
writing any of this method's own files -- see
``typed-objects/argument-map.schema.yaml``'s own ``verification`` for the
full grep record.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.argument_mapping"
RECORD_ID_PREFIX = "ARGMAP-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_main_claim(value: Any) -> bool:
    """Structural sanity check only -- full conformance to claim.schema.yaml is the schema layer's own job.
    A minimal {claim_id, statement, provenance} stub is legal per that schema's own required set (real $ref,
    composed not duplicated -- see the module docstring)."""
    return isinstance(value, dict) and _is_nonempty_str(value.get("claim_id")) and _is_nonempty_str(value.get("statement"))


def support(support_id: str, text: str) -> dict[str, Any]:
    """One item of ``typed-objects/argument-map.schema.yaml#/properties/supports``."""
    if not _is_nonempty_str(support_id):
        raise InvariantViolation(f"ARGMAP_INVALID_SUPPORT_ID: support id must be a non-empty string, got {support_id!r}")
    if not _is_nonempty_str(text):
        raise InvariantViolation(f"ARGMAP_INVALID_SUPPORT_TEXT: support {support_id!r} text must be a non-empty string")
    return {"id": support_id, "text": text}


def objection(objection_id: str, text: str) -> dict[str, Any]:
    """One item of ``typed-objects/argument-map.schema.yaml#/properties/objections``."""
    if not _is_nonempty_str(objection_id):
        raise InvariantViolation(f"ARGMAP_INVALID_OBJECTION_ID: objection id must be a non-empty string, got {objection_id!r}")
    if not _is_nonempty_str(text):
        raise InvariantViolation(f"ARGMAP_INVALID_OBJECTION_TEXT: objection {objection_id!r} text must be a non-empty string")
    return {"id": objection_id, "text": text}


def rebuttal(rebuttal_id: str, objection_id: str, text: str) -> dict[str, Any]:
    """One item of ``typed-objects/argument-map.schema.yaml#/properties/rebuttals``. Does NOT itself check that
    ``objection_id`` resolves to a real objection -- that cross-field check happens once, in
    ``generate_argument_map``, after every rebuttal has been rebuilt (this helper only validates this one
    item's own shape, the same division of labor ``finding()``/``point()`` already establish in this corpus)."""
    if not _is_nonempty_str(rebuttal_id):
        raise InvariantViolation(f"ARGMAP_INVALID_REBUTTAL_ID: rebuttal id must be a non-empty string, got {rebuttal_id!r}")
    if not _is_nonempty_str(objection_id):
        raise InvariantViolation(f"ARGMAP_INVALID_REBUTTAL_OBJECTION_ID: rebuttal {rebuttal_id!r} objection_id must be a non-empty string")
    if not _is_nonempty_str(text):
        raise InvariantViolation(f"ARGMAP_INVALID_REBUTTAL_TEXT: rebuttal {rebuttal_id!r} text must be a non-empty string")
    return {"id": rebuttal_id, "objection_id": objection_id, "text": text}


def generate_argument_map(
    record_id: str,
    main_claim: dict[str, Any],
    supports: list[dict[str, Any]],
    objections: list[dict[str, Any]],
    rebuttals: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/argument-map.schema.yaml``.

    Rebuilds every supports/objections/rebuttals item via its own helper (never trusting the caller's raw
    dicts) and deep-copies ``main_claim`` (never a shallow ``dict()`` copy -- see module docstring), then
    enforces the method contract's own real invariant fail-closed, in order: >=1 support, unique
    ``objections[].id``, and every ``rebuttals[].objection_id`` resolves to a declared objection -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ARGMAP_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ARGMAP_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_valid_main_claim(main_claim):
        raise InvariantViolation("ARGMAP_INVALID_MAIN_CLAIM: main_claim must be a claim.schema.yaml-shaped dict with at least claim_id and statement")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ARGMAP_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not isinstance(supports, list) or not supports:
        raise InvariantViolation(
            "ARGMAP_NO_SUPPORTS: at least 1 support is required -- a claim with zero supporting reason is not "
            "yet an argument (Atlas L573's own main claim->SUPPORT->objection pipeline)"
        )

    rebuilt_supports: list[dict[str, Any]] = []
    for i, s in enumerate(supports):
        if not isinstance(s, dict) or "id" not in s or "text" not in s:
            raise InvariantViolation(f"ARGMAP_INVALID_SUPPORT: supports[{i}] must be a {{id, text}} object, got {s!r}")
        rebuilt_supports.append(support(s["id"], s["text"]))

    if not isinstance(objections, list):
        raise InvariantViolation(f"ARGMAP_INVALID_OBJECTIONS: objections must be a list, got {type(objections).__name__}")
    rebuilt_objections: list[dict[str, Any]] = []
    for i, o in enumerate(objections):
        if not isinstance(o, dict) or "id" not in o or "text" not in o:
            raise InvariantViolation(f"ARGMAP_INVALID_OBJECTION: objections[{i}] must be a {{id, text}} object, got {o!r}")
        rebuilt_objections.append(objection(o["id"], o["text"]))

    objection_ids = [o["id"] for o in rebuilt_objections]
    duplicate_objection_ids = sorted({oid for oid in objection_ids if objection_ids.count(oid) > 1}, key=repr)
    if duplicate_objection_ids:
        raise InvariantViolation(f"ARGMAP_DUPLICATE_OBJECTION_ID: objections[] ids must be unique, duplicates found: {duplicate_objection_ids}")

    if not isinstance(rebuttals, list):
        raise InvariantViolation(f"ARGMAP_INVALID_REBUTTALS: rebuttals must be a list, got {type(rebuttals).__name__}")
    rebuilt_rebuttals: list[dict[str, Any]] = []
    for i, r in enumerate(rebuttals):
        if not isinstance(r, dict) or "id" not in r or "objection_id" not in r or "text" not in r:
            raise InvariantViolation(f"ARGMAP_INVALID_REBUTTAL: rebuttals[{i}] must be a {{id, objection_id, text}} object, got {r!r}")
        rebuilt_rebuttals.append(rebuttal(r["id"], r["objection_id"], r["text"]))

    dangling = sorted({r["objection_id"] for r in rebuilt_rebuttals} - set(objection_ids), key=repr)
    if dangling:
        raise InvariantViolation(
            f"ARGMAP_DANGLING_REBUTTAL: rebuttals[] reference objection_id(s) {dangling} not present in "
            "objections[] -- a rebuttal to an objection that was never raised is a dangling argument node"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "main_claim": copy.deepcopy(main_claim),
        "supports": rebuilt_supports,
        "objections": rebuilt_objections,
        "rebuttals": rebuilt_rebuttals,
        "provenance": provenance,
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
    """Re-derives this method's own real invariant directly from raw fields -- not just trusting that
    ``generate_argument_map``'s own construction-time check already ran (a hand-crafted/tampered record must
    still be caught, same discipline every prior slice's gate-re-derivation already established). Fails closed
    on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    record_id = record.get("id")
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")

    supports = record.get("supports")
    if not isinstance(supports, list) or not supports:
        problems.append("supports must be a list with at least 1 entry")

    objections = record.get("objections")
    objection_ids: list[Any] = []
    if isinstance(objections, list):
        objection_ids = [o.get("id") if isinstance(o, dict) else None for o in objections]
        # key=repr throughout this gate: these collections legitimately mix str with None when an entry is
        # malformed, and a bare sorted() raises TypeError on that mix -- a gate must fail closed, never crash.
        duplicate_objection_ids = sorted({oid for oid in objection_ids if oid is not None and objection_ids.count(oid) > 1}, key=repr)
        if duplicate_objection_ids:
            problems.append(f"duplicate objection ids: {duplicate_objection_ids}")
    else:
        problems.append("objections must be a list")

    rebuttals = record.get("rebuttals")
    if isinstance(rebuttals, list):
        objection_id_set = {oid for oid in objection_ids if oid is not None}
        dangling = sorted({
            (r.get("objection_id") if isinstance(r, dict) else repr(r))
            for r in rebuttals
            if not isinstance(r, dict) or r.get("objection_id") not in objection_id_set
        }, key=repr)
        if dangling:
            problems.append(f"dangling rebuttal objection_id(s): {dangling}")
    else:
        problems.append("rebuttals must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_argument_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
