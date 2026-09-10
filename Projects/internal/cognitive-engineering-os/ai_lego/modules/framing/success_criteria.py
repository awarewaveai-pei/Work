"""``framing.success_criteria`` -- F01 framing family, 4th member built this batch (after goal_statement/
smart/non_goals). Atlas's ONLY citation is the F01 table row (AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:338):
"Success Criteria | 事前定義成功 | 高風險決策 | Must/Should/Guardrail/Stop | 防止事後改標準 | Reversal Criteria" --
grep-confirmed no dedicated section beyond the table row itself.

**Distinct from learning.kill_criteria/learning.reversal_criteria (real determination, read both files in
full before writing this module, same due-diligence class framing.goal_statement's own docstring already
applied to this exact comparison):** those two are ONGOING MONITORING RULES (threshold/indicator + owner +
action), re-evaluated over time against an ALREADY-IN-FLIGHT decision, specifically to block sunk-cost/
motivated-reasoning bias mid-course. Success Criteria is a PRE-COMMITMENT classification, fixed BEFORE a
decision or execution begins (Atlas's own "事前定義成功" -- literally "define success beforehand") -- its own
benefit column ("防止事後改標準", prevent moving the goalposts after the fact) is about locking in a
definition of success up front, not monitoring a commitment already underway.

**Distinct from decision.moscow's own Must/Should/Could/Won't (real determination, read
decision.moscow.contract.yaml in full):** MoSCoW classifies MANY release-scope items into 4 buckets for
prioritization (per-item bucket assignment across a scope list). Success Criteria classifies CRITERIA
STATEMENTS for ONE decision/goal's own outcome definition -- different vocabulary (Guardrail/Stop, not
Could/Won't) and different granularity (a single decision's own success definition, not a release-scope
triage).

Atlas's own best-paired column (L338) names "Reversal Criteria" -- unlike framing.goal_statement's own
best-paired citations (both unbuilt at that method's build time), ``learning.reversal_criteria`` is ALREADY
BUILT (real machine_id, real ``RCS-`` id prefix, ``specs/cognitive/typed-objects/reversal-criteria-set.schema.yaml``).
This module cites it as ``recommended_next`` and exposes an OPTIONAL ``reversal_criteria_ref`` field,
format-checked against that real, confirmed prefix -- the natural next step once high-risk-decision success
criteria are locked in is monitoring for when to reverse course.

**Resolves framing.goal_statement's own OQ-GOALSTATEMENT-1** ("once built, should Success Criteria consume
goal_statement's own optional success_criteria_ref?"): yes -- this module mints ``RECORD_ID_PREFIX = "SC-"``,
matching the exact placeholder format (``"SC-FUTURE-001"``) goal_statement's own test suite already
anticipated. goal_statement's own schema file is outside this task's edit scope (not touched), so
success_criteria_ref stays an untyped free string there, but a real SuccessCriteriaRecord id now genuinely
round-trips through it by naming convention.

Four fixed named category fields (must/should/guardrail/stop), not an open/extensible category list --
matches Atlas's own literal 4-term formula, same closed-enumerable-vocabulary class
``learning.kill_criteria``'s own 3-value ``dimension`` enum already establishes for this session. Each
category item is ``{id, statement, provenance}`` -- individually addressable and provenanced, not a bare
string (a bare string could not carry its own provenance or be referenced by a future evaluation-event
record).

TWO real invariants, each enforced BOTH at construction (raise before any record is built) AND independently
by a gate that re-derives from raw stored fields, same two-layer discipline every sibling module in this
family already establishes:

1. **Must-category coverage** (``SUCCESSCRITERIA_EMPTY_MUST``): ``must`` must be a non-empty list of
   well-formed criteria. Atlas's own benefit line ("防止事後改標準") requires at least one non-negotiable
   floor to exist -- a success-criteria record with zero Must items commits to nothing, so there is nothing
   to prevent anyone from moving later. ``should``/``guardrail``/``stop`` stay legitimately per-decision-
   optional (the schema requires the KEYS but not their non-emptiness) -- not every decision needs an
   explicit guardrail or an explicit stop trigger, and inventing a universal minimum for either would be
   fabricated scope Atlas does not cite.
2. **Criterion id uniqueness** (``SUCCESSCRITERIA_DUPLICATE_CRITERION_ID``): every criterion ``id``, across
   ALL FOUR categories combined, must be unique within the record -- same discipline
   ``learning.kill_criteria``'s own duplicate-threshold-id check already establishes, needed here so a
   future evaluation-event record could unambiguously reference "which criterion fired."

**"Immutable once recorded" (Atlas's own benefit line, real design decision, not left unaddressed):** no new
locking/versioning mechanism is invented here. This module exposes only a fresh builder
(``generate_success_criteria_record``) and no update/mutate function -- "produced once, not mutated" is
already the natural behavior of this API surface. ``provenance.locked`` (the existing, already-available
``epistemic-label.schema.yaml`` field every sibling typed-object already carries) is the correct place for a
caller to flag a record as formally locked, not a bespoke new field on this schema.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.success_criteria"
RECORD_ID_PREFIX = "SC-"
REVERSAL_CRITERIA_REF_PREFIX = "RCS-"
CATEGORY_NAMES = ("must", "should", "guardrail", "stop")
_CRITERION_KEYS = frozenset({"id", "statement", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _criterion_shape_is_valid(entry: Any) -> bool:
    """Shape only (exact key set, id/statement non-empty) -- does NOT check provenance content, same
    'shape here, content in the provenance gate' split ``learning.kill_criteria``'s own
    ``_threshold_shape_is_valid`` already establishes."""
    if not isinstance(entry, dict):
        return False
    if set(entry.keys()) != _CRITERION_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("statement")):
        return False
    return True


def success_criterion(criterion_id: str, statement: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One item of ``typed-objects/success-criteria-record.schema.yaml#/$defs/criterion``. ``statement`` is
    validated non-empty at construction -- a blank criterion asserts nothing checkable."""
    if not _is_nonempty_str(criterion_id):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_CRITERION_ID: criterion id must be a non-empty string, got {criterion_id!r}")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"SUCCESSCRITERIA_EMPTY_STATEMENT: criterion {criterion_id!r} has no statement")
    return {"id": criterion_id, "statement": statement, "provenance": provenance}


def _category_list_is_valid(value: Any) -> bool:
    """Shape only -- a list of well-formed criterion items. An EMPTY list is valid shape here; only
    ``must``'s own non-emptiness is enforced separately (Invariant #1)."""
    return isinstance(value, list) and all(_criterion_shape_is_valid(item) for item in value)


def _all_criterion_ids(categories: dict[str, list[dict[str, Any]]]) -> list[str]:
    return [item["id"] for name in CATEGORY_NAMES for item in categories[name]]


def generate_success_criteria_record(
    record_id: str,
    decision_ref: str,
    must: list[dict[str, Any]],
    should: list[dict[str, Any]],
    guardrail: list[dict[str, Any]],
    stop: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    reversal_criteria_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/success-criteria-record.schema.yaml``. Enforces both real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(decision_ref):
        raise InvariantViolation(f"SUCCESSCRITERIA_EMPTY_DECISION_REF: decision_ref must be a non-empty string, got {decision_ref!r}")

    if not isinstance(must, list) or not must or not all(_criterion_shape_is_valid(item) for item in must):
        raise InvariantViolation(
            f"SUCCESSCRITERIA_EMPTY_MUST: must must be a non-empty list of well-formed criteria "
            f"({{'id','statement','provenance'}} each), got {must!r} -- a success-criteria record with zero "
            f"non-negotiable Must items commits to nothing, defeating Atlas's own benefit ('防止事後改標準')"
        )
    if not _category_list_is_valid(should):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_SHOULD: should must be a list of well-formed criteria (may be empty), got {should!r}")
    if not _category_list_is_valid(guardrail):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_GUARDRAIL: guardrail must be a list of well-formed criteria (may be empty), got {guardrail!r}")
    if not _category_list_is_valid(stop):
        raise InvariantViolation(f"SUCCESSCRITERIA_INVALID_STOP: stop must be a list of well-formed criteria (may be empty), got {stop!r}")

    categories = {"must": must, "should": should, "guardrail": guardrail, "stop": stop}
    all_ids = _all_criterion_ids(categories)
    if len(set(all_ids)) != len(all_ids):
        duplicates = sorted({i for i in all_ids if all_ids.count(i) > 1})
        raise InvariantViolation(
            f"SUCCESSCRITERIA_DUPLICATE_CRITERION_ID: id(s) {duplicates} used more than once across "
            f"must/should/guardrail/stop -- every criterion id must be unique within a record"
        )

    if reversal_criteria_ref is not None and (
        not _is_nonempty_str(reversal_criteria_ref) or not reversal_criteria_ref.startswith(REVERSAL_CRITERIA_REF_PREFIX)
    ):
        raise InvariantViolation(
            f"SUCCESSCRITERIA_INVALID_REVERSAL_CRITERIA_REF: reversal_criteria_ref must be a non-empty string "
            f"beginning with {REVERSAL_CRITERIA_REF_PREFIX!r} or None, got {reversal_criteria_ref!r}"
        )

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_ref": decision_ref,
        "must": [dict(item) for item in must],
        "should": [dict(item) for item in should],
        "guardrail": [dict(item) for item in guardrail],
        "stop": [dict(item) for item in stop],
        "provenance": provenance,
    }
    if reversal_criteria_ref is not None:
        record["reversal_criteria_ref"] = reversal_criteria_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every criterion (across all 4 categories) and the
    overall record carry a schema-valid provenance_record. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    all_items: list[Any] = []
    for name in CATEGORY_NAMES:
        items = record.get(name)
        if not isinstance(items, list):
            return _result("provenance_required", False, [{"reason": f"{name} missing or not a list"}], validator, timestamp)
        all_items.extend(items)
    invalid = [item.get("id") for item in all_items if isinstance(item, dict) and not provenance_is_valid(item.get("provenance"))]
    malformed = [i for i, item in enumerate(all_items) if not isinstance(item, dict)]
    overall_valid = provenance_is_valid(record.get("provenance"))
    passed = not invalid and not malformed and overall_valid
    return _result(
        "provenance_required",
        passed,
        [{"criteria_checked": len(all_items), "invalid_provenance_ids": invalid, "malformed_entry_indices": malformed, "overall_provenance_valid": overall_valid}],
        validator,
        timestamp,
    )


def evaluate_record_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives id/version/decision_ref/reversal_criteria_ref format from the record's OWN raw fields --
    does not trust any stored value. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("record_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        problems.append(f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")
    if not isinstance(record.get("version"), str):
        problems.append("version missing or not a string")
    if not _is_nonempty_str(record.get("decision_ref")):
        problems.append("decision_ref missing or empty")
    ref = record.get("reversal_criteria_ref")
    if ref is not None and (not _is_nonempty_str(ref) or not ref.startswith(REVERSAL_CRITERIA_REF_PREFIX)):
        problems.append(f"reversal_criteria_ref present but not a non-empty string prefixed {REVERSAL_CRITERIA_REF_PREFIX!r}")
    return _result("record_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_must_category_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from raw fields -- does not trust that ``generate_success_criteria_record``'s
    own construction-time check already ran (a hand-crafted/tampered record must still be caught). Fails
    closed on malformed input."""
    if not isinstance(record, dict):
        return _result("must_category_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    must = record.get("must")
    if not isinstance(must, list) or not must:
        return _result("must_category_coverage", False, [{"reason": "must missing, not a list, or empty -- no non-negotiable floor defined"}], validator, timestamp)
    malformed = [i for i, item in enumerate(must) if not _criterion_shape_is_valid(item)]
    return _result("must_category_coverage", not malformed, [{"must_count": len(must), "malformed_entry_indices": malformed}], validator, timestamp)


def evaluate_criterion_id_uniqueness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from raw fields, across ALL FOUR categories combined. Fails closed on
    malformed input rather than crashing on a non-list category or a non-dict item."""
    if not isinstance(record, dict):
        return _result("criterion_id_uniqueness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    all_ids: list[str] = []
    shape_malformed = False
    for name in CATEGORY_NAMES:
        items = record.get(name)
        if not isinstance(items, list):
            shape_malformed = True
            continue
        for item in items:
            if isinstance(item, dict) and _is_nonempty_str(item.get("id")):
                all_ids.append(item["id"])
            else:
                shape_malformed = True
    duplicates = sorted({i for i in all_ids if all_ids.count(i) > 1})
    passed = not duplicates and not shape_malformed
    return _result(
        "criterion_id_uniqueness",
        passed,
        [{"criteria_checked": len(all_ids), "duplicate_ids": duplicates, "shape_malformed": shape_malformed}],
        validator,
        timestamp,
    )


def evaluate_success_criteria_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 4 of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_record_integrity_gate(record, validator, timestamp),
        evaluate_must_category_coverage_gate(record, validator, timestamp),
        evaluate_criterion_id_uniqueness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
