"""``database_data.reconciliation`` -- twenty-ninth Method Atlas slice, THIRD from the `database_data`
family (F21).

Atlas's own benefit column (F21 tool table, L908: "migration 後可證明完整
性" -- a migration can be proven complete) directly implies the real
invariant this module enforces: a record cannot claim
``overall_status: reconciled`` while any check's own comparison
disagrees with no recorded resolution, or with a resolution that
itself documents a REAL problem (``resolved_as_expected: false``) --
"diff->resolve" names a two-step process, and completeness requires
the second step to have actually happened for every diff the first
step found.

``matches``/``diff`` are never caller-supplied independently of
``ai_lego.compute.reconciliation.compare.compute_check_result`` -- the
builder computes them itself (the same "compute layer produces, method
layer consumes and validates" separation ``database_data.data_lineage``
already established for ``traces_to_source``). The gate RECOMPUTES the
same function fresh from each check's own raw ``source_value``/
``target_value`` rather than trusting the stored ``matches``/``diff``
-- the same "a gate that only re-reads a stored computed value is not
an independent check" discipline a critic review of
``challenge.independent_judge`` first established (WORKLOG
continuation 40), re-applied here as a matter of course rather than
something this slice's own review needed to catch again.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.reconciliation.compare import VALID_CHECK_TYPES, compute_check_result
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "database_data.reconciliation"
RECORD_ID_PREFIX = "RECON-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.reconciliation.compare.compute_check_result"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _duplicate_check_ids(checks: list[Any]) -> list[str]:
    """Shared predicate: which check ids (if any) appear more than once? Called by BOTH the builder's
    construction-time check and the gate's independent re-derivation. Audit-trail identifiability hygiene --
    the same duplicate-id discipline ``database_data.data_lineage``'s own ``_duplicate_node_ids`` established,
    though the failure mode here is weaker (no shared compute keys a result dict by check id the way
    ``traces_to_source`` keys by node id; a collision here cannot silently swap one check's verdict for
    another's the way it could there)."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in checks:
        check_id = item.get("id") if isinstance(item, dict) else None
        if not isinstance(check_id, str):
            continue
        if check_id in seen:
            duplicates.add(check_id)
        seen.add(check_id)
    return sorted(duplicates)


def _check_is_satisfied(check: dict[str, Any]) -> bool:
    """A single check counts toward `overall_status:reconciled` iff: a real resolution is present, in which
    case its own `resolved_as_expected` is AUTHORITATIVE (overriding `matches` in EITHER direction -- a human
    who documents that two checksums matching on independently-corrupted data is NOT fine must be believed,
    the same way one documenting a numeric mismatch as expected must be); otherwise, `matches:true` alone is
    sufficient. Shared between the builder's construction-time enforcement and the gate's independent
    re-derivation.

    A critic review of this slice's own first draft caught that `matches:true` originally short-circuited
    regardless of an explicit `resolved_as_expected:false` -- silently discarding a human's own documented
    finding that a match was NOT actually fine. Fixed by making resolution, when present, override rather
    than merely supplement the raw computed verdict."""
    resolution = check.get("resolution")
    if isinstance(resolution, dict):
        return resolution.get("resolved_as_expected") is True and _is_nonempty_str(resolution.get("note"))
    return check.get("matches") is True


def _validate_resolution_shape(check_id: str, resolution: Any) -> None:
    """Shared predicate: is `resolution` (if not None) a well-shaped dict? Called by BOTH `check()`'s own
    construction-time validation and `generate_reconciliation_record`'s re-validation of hand-built checks."""
    if resolution is None:
        return
    if (
        not isinstance(resolution, dict)
        or not isinstance(resolution.get("resolved_as_expected"), bool)
        or not _is_nonempty_str(resolution.get("note"))
    ):
        raise InvariantViolation(f"RECONCILIATION_INVALID_RESOLUTION: check {check_id!r}'s resolution must be a dict with a boolean resolved_as_expected and a non-empty note, got {resolution!r}")


def check(check_id: str, name: str, check_type: str, source_value: str, target_value: str, *, resolution: dict[str, Any] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/reconciliation-record.schema.yaml#/properties/checks``. ``matches``/``diff``
    are COMPUTED here via ``compute_check_result`` -- never accepted as parameters, so there is no shape in
    which a caller can construct a check whose stored verdict disagrees with the actual comparison."""
    if not _is_nonempty_str(check_id):
        raise InvariantViolation(f"RECONCILIATION_EMPTY_CHECK_ID: check id must be a non-empty string, got {check_id!r}")
    if not _is_nonempty_str(name):
        raise InvariantViolation(f"RECONCILIATION_EMPTY_CHECK_NAME: check {check_id!r} must have a non-empty name")
    _validate_resolution_shape(check_id, resolution)
    result = compute_check_result(check_type, source_value, target_value)
    item: dict[str, Any] = {
        "id": check_id,
        "name": name,
        "check_type": check_type,
        "source_value": source_value,
        "target_value": target_value,
        "matches": result["matches"],
        "diff": result["diff"],
    }
    if resolution is not None:
        item["resolution"] = resolution
    return item


def generate_reconciliation_record(
    record_id: str,
    source_ref: str,
    target_ref: str,
    checks: list[dict[str, Any]],
    overall_status: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/reconciliation-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: non-empty checks, unique check ids, well-shaped refs -- and, the core
    invariant, forbids ``overall_status: reconciled`` unless EVERY check is satisfied (``_check_is_satisfied``).

    RECOMPUTES ``compute_check_result`` for EVERY check and REBUILDS a fresh check dict from the computed
    values -- accepting hand-built check dicts (not just ones produced by ``check()``) as a legitimate input
    shape, the same acceptance ``database_data.data_lineage``'s own ``generate_data_lineage_record``
    established for hand-built node dicts, but a critic review of this slice's own first draft caught that
    THIS function, unlike that one, was never actually doing the rebuild -- it stored whatever ``matches``/
    ``diff`` the caller supplied verbatim, so a hand-built check bypassing ``check()`` could freely lie about
    its own verdict and have that lie certified ``overall_status: reconciled``. A caller-supplied ``matches``/
    ``diff`` that DISAGREES with the recomputation is refused outright, rather than silently overwritten,
    so a caller relying on ``check()``'s own contract (compute, don't accept) gets an error instead of a
    silent correction if something upstream drifts.

    DELIBERATELY ONE-DIRECTIONAL (same class as ``database_data.backup_restore_drill``'s own status field):
    a caller MAY declare ``overall_status: open`` even when every check is already satisfied -- a
    conservative choice (e.g. pending a human sign-off) this contract's own text never forbids.
    """
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(source_ref) or not _is_nonempty_str(target_ref):
        raise InvariantViolation(f"RECONCILIATION_EMPTY_RECORD_FIELD: record_id/source_ref/target_ref must all be non-empty strings, got {record_id!r}/{source_ref!r}/{target_ref!r}")
    if not isinstance(checks, list) or not checks:
        raise InvariantViolation("RECONCILIATION_NO_CHECKS: methods/contracts/database_data.reconciliation.contract.yaml requires at least one check")
    for item in checks:
        if not isinstance(item, dict) or not _is_nonempty_str(item.get("id")) or not _is_nonempty_str(item.get("name")):
            raise InvariantViolation(f"RECONCILIATION_INVALID_CHECK_SHAPE: each check must be a dict with a non-empty id and name, got {item!r}")
    duplicates = _duplicate_check_ids(checks)
    if duplicates:
        raise InvariantViolation(f"RECONCILIATION_DUPLICATE_CHECK_ID: {duplicates} appear more than once")
    if overall_status not in {"reconciled", "open"}:
        raise InvariantViolation(f"RECONCILIATION_INVALID_STATUS: overall_status must be 'reconciled' or 'open', got {overall_status!r}")

    record_checks: list[dict[str, Any]] = []
    for item in checks:
        check_type = item.get("check_type")
        if not isinstance(check_type, str) or check_type not in VALID_CHECK_TYPES:
            raise InvariantViolation(f"RECONCILIATION_INVALID_CHECK_TYPE: check {item['id']!r} has check_type {check_type!r}, not one of {sorted(VALID_CHECK_TYPES)}")
        _validate_resolution_shape(item["id"], item.get("resolution"))
        result = compute_check_result(check_type, item.get("source_value"), item.get("target_value"))
        if "matches" in item and item["matches"] != result["matches"]:
            raise InvariantViolation(f"RECONCILIATION_STORED_VERDICT_DISAGREES: check {item['id']!r}'s supplied matches={item['matches']!r} disagrees with the recomputed {result['matches']!r}")
        if "diff" in item and item["diff"] != result["diff"]:
            raise InvariantViolation(f"RECONCILIATION_STORED_VERDICT_DISAGREES: check {item['id']!r}'s supplied diff={item['diff']!r} disagrees with the recomputed {result['diff']!r}")
        rebuilt: dict[str, Any] = {
            "id": item["id"],
            "name": item["name"],
            "check_type": check_type,
            "source_value": item.get("source_value"),
            "target_value": item.get("target_value"),
            "matches": result["matches"],
            "diff": result["diff"],
        }
        if item.get("resolution") is not None:
            rebuilt["resolution"] = item["resolution"]
        record_checks.append(rebuilt)

    if overall_status == "reconciled":
        unsatisfied = [item["id"] for item in record_checks if not _check_is_satisfied(item)]
        if unsatisfied:
            raise InvariantViolation(
                f"RECONCILIATION_NOT_ACTUALLY_RECONCILED: overall_status:reconciled requires every check to match or carry a resolved_as_expected:true resolution -- {unsatisfied} do not, "
                "Atlas's own benefit column (F21 L908, 'migration 後可證明完整性') forbids claiming provable completeness while a real diff remains open"
            )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "source_ref": source_ref,
        "target_ref": target_ref,
        "checks": record_checks,
        "overall_status": overall_status,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which ReconciliationRecord also carries at the top
    level. Sixth reuse of this gate this session (after root_cause.pareto/decision.ahp/decision.mcda/
    devops_sre.error_budget/database_data.data_lineage). Guards ``isinstance(record, dict)`` itself before
    delegating -- a non-dict record must fail closed, not crash with AttributeError (``dict.get`` called on a
    non-dict), the same fix every sibling reuse of this gate now also applies."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_reconciliation_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- well-shaped checks, no
    duplicate ids -- AND RECOMPUTES ``compute_check_result`` fresh from each check's own ``check_type``/
    ``source_value``/``target_value``, comparing against the stored ``matches``/``diff``, AND re-derives
    whether ``overall_status: reconciled`` is actually justified. Does not trust any stored value. FAILS
    CLOSED at every step on malformed input."""
    if not isinstance(record, dict):
        return _result("reconciliation_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    checks = record.get("checks")
    if not isinstance(checks, list) or not checks:
        return _result("reconciliation_integrity", False, [{"reason": "checks missing, not a list, or empty"}], validator, timestamp)
    if not all(isinstance(item, dict) and _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("name")) for item in checks):
        return _result("reconciliation_integrity", False, [{"reason": "one or more checks is not a well-shaped dict with a real id and name"}], validator, timestamp)
    duplicates = _duplicate_check_ids(checks)
    if duplicates:
        return _result("reconciliation_integrity", False, [{"reason": "duplicate check ids", "duplicate_ids": duplicates}], validator, timestamp)

    recompute_mismatched: list[str] = []
    for item in checks:
        try:
            recomputed = compute_check_result(item.get("check_type"), item.get("source_value"), item.get("target_value"))
        except InvariantViolation:
            recompute_mismatched.append(item["id"])
            continue
        if recomputed["matches"] != item.get("matches") or recomputed["diff"] != item.get("diff"):
            recompute_mismatched.append(item["id"])
    if recompute_mismatched:
        return _result("reconciliation_integrity", False, [{"reason": "stored matches/diff disagrees with recomputation", "mismatched_check_ids": recompute_mismatched}], validator, timestamp)

    overall_status = record.get("overall_status")
    if overall_status not in {"reconciled", "open"}:
        return _result("reconciliation_integrity", False, [{"reason": "overall_status is not 'reconciled' or 'open'", "overall_status": overall_status}], validator, timestamp)
    unsatisfied = [item["id"] for item in checks if not _check_is_satisfied(item)]
    if overall_status == "reconciled" and unsatisfied:
        return _result("reconciliation_integrity", False, [{"reason": "overall_status:reconciled but unsatisfied checks remain", "unsatisfied_check_ids": unsatisfied}], validator, timestamp)

    return _result("reconciliation_integrity", True, [{"checks_checked": len(checks), "overall_status": overall_status}], validator, timestamp)


def evaluate_reconciliation_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_reconciliation_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
