"""``learning.kill_criteria`` -- Method Atlas slice, second member of the `learning` family (F17), immediately
after `learning.reversal_criteria` in the Atlas's own F17 tool table (L807 Reversal Criteria, L808 Kill
Criteria, back-to-back rows). Atlas L808 gives this method exactly one citation, its own table row: "事前定義
停止條件 | max loss/time/quality threshold | 控制下行風險" -- no dedicated section exists beyond it
(grep-confirmed across the whole Atlas file: the only two other hits, L2408 and L4501, are a "pairs well
with Pilot/Reversal Criteria" note and a "important Recommendations need Reversal/Kill Criteria" rule, not a
protocol section).

**Due-diligence finding (real determination, not assumed): distinct from `reversal_criteria`, not a
near-duplicate.** Read `reversal_criteria.py` in full, plus its contract and schema, before writing a line
of this module. Both rows share a real family resemblance -- both pre-commit an objective threshold that
triggers a downstream action, specifically to block motivated reasoning/sunk-cost bias in the moment (this
is why they sit back-to-back in Atlas's own table) -- but two independent structural differences separate
them, confirmed by direct reading, not inference from the row labels alone:

1. **Vocabulary shape.** Reversal Criteria's own formula (L807, "indicators→thresholds→owner→action") is
   OPEN: `indicator` is free text (Atlas's own worked example uses "CAC", but anything is legal), and
   `specs/decision/reversal.schema.yaml` accordingly leaves it an unconstrained string. Kill Criteria's own
   formula (L808) is CLOSED: exactly three named dimensions, max loss / max time / quality threshold -- a
   small, enumerable set, not an open indicator space. This module's own `dimension` field is therefore a
   three-value enum (`VALID_DIMENSIONS`), not free text.
2. **Action directionality.** Reversal Criteria's own worked example (Atlas §11.33, L1980-1985) triggers
   `action: re_review` -- a re-evaluation that may conclude "keep going" or "reverse"; the whole point (its
   own named benefit, L807, "防 sunk cost") is revisiting a decision, not necessarily ending it. Kill
   Criteria's own name and benefit column (L808, "控制下行風險" -- controls downside risk, i.e. caps the
   loss) both describe an inherently ONE-DIRECTIONAL stop/abandon trigger. This module therefore derives
   breach direction structurally from `dimension` alone (see `evaluate_threshold_breach`) rather than
   accepting an open `action` the way `reversal_criterion`'s own required `action` field does.

Atlas's own §16.1 Idea Object (`decision` sub-block, L3737-3741) independently corroborates this is a real
distinction, not a naming accident: `kill_criteria` (L3740) and `reversal_conditions` (L3741) are listed as
two SEPARATE sibling fields on the same object, back-to-back, with `score`/`minority_objection` also present
-- Atlas's own authors modeled these as two different concepts to track, not two names for one. Neither
field is given a shape there (both are bare `...` ellipses); this module (and its schema) is what resolves
`kill_criteria`'s own ellipsis, the same relationship `reversal_criteria.py`/`reversal-criteria-set.schema.yaml`
already have to `reversal_conditions`.

Grep-verified before minting (2026-09-07, this session, applying the corrected invariant
`reversal-criteria-set.schema.yaml`'s own v1.1.0 description established -- grep the FULL spec root for the
CONCEPT, not just this session's own chosen names, before minting a new typed object): zero existing schema
anywhere in `specs/**` models kill_criteria/max_loss/max_time/min_quality/停損/止損 under any name. This
module mints a genuinely new typed object, not a duplicate.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream
write" / "re-derive, don't trust" two-layer discipline every prior module in this package uses; fail-closed
input handling in the gates follows `root_cause.fault_tree`'s own stricter isinstance-first/safe-`.get()`
style, since that module postdates this family's original `reversal_criteria.py` gates):

1. **Threshold coverage** (`KILLCRITERIA_NO_THRESHOLD_DEFINED`): `thresholds` must be a non-empty list, and
   Atlas's own three named dimensions (L808) are the only legal `dimension` values -- an empty kill-criteria
   set, or one whose entries carry no real dimension/value, can never fire, defeating the Atlas's own named
   benefit ("控制下行風險").
2. **Ownership** (`KILLCRITERIA_UNOWNED_THRESHOLD`): every threshold names a non-empty `owner` -- someone
   accountable for actually invoking the stop when the threshold is crossed. NOT itself Atlas-cited for Kill
   Criteria specifically (L808's own formula column names no owner, unlike Reversal Criteria's L807
   "...→owner→action") -- this is this suite's own cross-method discipline applied here, the same
   "unowned == decorative, not a real control" bar `reversal_criterion`'s own owner check and
   `root_cause.bow_tie`'s own OWNER/TEST invariant (Atlas F05 misuse warning, "控制措施要有 owner/test")
   already enforce elsewhere in this package.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.kill_criteria"
RECORD_ID_PREFIX = "KCS-"
VALID_DIMENSIONS = frozenset({"max_loss", "max_time", "min_quality"})
_KNOWN_THRESHOLD_KEYS_REQUIRED = frozenset({"id", "dimension", "value", "unit", "owner", "provenance"})
_KNOWN_THRESHOLD_KEYS_ALL = _KNOWN_THRESHOLD_KEYS_REQUIRED | {"stop_action"}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``root_cause.fault_tree``'s own ``_is_valid_probability``
    uses: ``value=True`` must not silently pass an ``isinstance(value, (int, float))`` check as if it were
    1, and ``value=inf``/``nan`` are not valid RFC 8259 JSON and would make no sense as a comparable
    threshold regardless of a bare type check. Unlike probability, a threshold value is NOT range-bound to
    [0,1] (a max_loss cap can be any positive currency amount) -- only finiteness and non-bool-ness are
    checked here."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _threshold_shape_is_valid(entry: Any) -> bool:
    """Shape only (keys, types, enum membership) -- does NOT check owner non-emptiness (that is Invariant #2,
    checked separately with its own distinct error code, same three-tier split ``root_cause.bow_tie``'s own
    ``_control_is_valid`` uses: shape first, THEN owner/test non-emptiness, so a failure always names the
    specific bug class)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _KNOWN_THRESHOLD_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_THRESHOLD_KEYS_ALL):
        return False
    if not _is_nonempty_str(entry["id"]) or entry["dimension"] not in VALID_DIMENSIONS:
        return False
    if not _is_finite_number(entry["value"]):
        return False
    if not _is_nonempty_str(entry["unit"]):
        return False
    if not isinstance(entry["owner"], str):
        return False
    if "stop_action" in entry and not isinstance(entry["stop_action"], str):
        return False
    return True


def kill_threshold(
    threshold_id: str,
    dimension: str,
    value: float,
    unit: str,
    owner: str,
    provenance: dict[str, Any],
    *,
    stop_action: str | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/kill-criteria-set.schema.yaml#/properties/thresholds``. ``dimension`` is
    Atlas's own closed L808 vocabulary -- validated eagerly, same discipline ``reversal_criterion``'s own
    operator check and ``dag_node``'s own role check already establish for this package. ``owner`` is
    validated non-empty at construction (Invariant #2: an unowned threshold cannot actually be invoked when
    crossed -- decorative, not a control)."""
    if not _is_nonempty_str(threshold_id):
        raise InvariantViolation(f"KILLCRITERIA_INVALID_THRESHOLD_ID: threshold id must be a non-empty string, got {threshold_id!r}")
    if dimension not in VALID_DIMENSIONS:
        raise InvariantViolation(f"KILLCRITERIA_UNKNOWN_DIMENSION: {dimension!r} not one of {sorted(VALID_DIMENSIONS)}")
    if not _is_finite_number(value):
        raise InvariantViolation(f"KILLCRITERIA_INVALID_VALUE: threshold {threshold_id!r} value must be a finite, non-boolean number, got {value!r}")
    if not _is_nonempty_str(unit):
        raise InvariantViolation(f"KILLCRITERIA_EMPTY_UNIT: threshold {threshold_id!r} has no unit -- a bare number is not comparable")
    if not isinstance(owner, str) or not owner.strip():
        raise InvariantViolation(f"KILLCRITERIA_UNOWNED_THRESHOLD: threshold {threshold_id!r} has no owner -- an unowned kill criterion cannot actually be invoked when crossed")
    if stop_action is not None and not isinstance(stop_action, str):
        raise InvariantViolation(f"KILLCRITERIA_INVALID_STOP_ACTION: threshold {threshold_id!r} stop_action must be a string or None, got {stop_action!r}")
    record: dict[str, Any] = {
        "id": threshold_id,
        "dimension": dimension,
        "value": value,
        "unit": unit,
        "owner": owner,
        "provenance": provenance,
    }
    if stop_action is not None:
        record["stop_action"] = stop_action
    return record


def generate_kill_criteria_set(
    set_id: str,
    decision_ref: str,
    thresholds: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/kill-criteria-set.schema.yaml``. Enforces Invariant #1 fail-closed: at
    least one of Atlas's own three named dimensions (L808) must actually be represented by a well-shaped
    threshold entry -- an empty or malformed-only kill-criteria set can never fire, defeating the Atlas's
    own named benefit (L808, "控制下行風險")."""
    if not _is_nonempty_str(set_id) or not set_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"KILLCRITERIA_INVALID_RECORD_ID: set_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {set_id!r}")
    if not _is_nonempty_str(decision_ref):
        raise InvariantViolation(f"KILLCRITERIA_EMPTY_RECORD_FIELD: decision_ref must be a non-empty string, got {decision_ref!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"KILLCRITERIA_INVALID_VERSION: version must be a string, got {version!r}")
    if not isinstance(thresholds, list) or not thresholds or not all(_threshold_shape_is_valid(t) for t in thresholds):
        raise InvariantViolation(
            f"KILLCRITERIA_NO_THRESHOLD_DEFINED: thresholds must be a non-empty list of well-shaped entries "
            f"(dimension in {sorted(VALID_DIMENSIONS)}, value a finite number, non-empty id/unit/owner strings), "
            f"got {_shallow_describe(thresholds)} -- at least one of max_loss/max_time/min_quality must be set "
            f"with a concrete, comparable value"
        )
    ids = [t["id"] for t in thresholds]
    if len(set(ids)) != len(ids):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        raise InvariantViolation(f"KILLCRITERIA_DUPLICATE_THRESHOLD_ID: id(s) {duplicates} used more than once -- every threshold id must be unique within a set")
    return {
        "id": set_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_ref": decision_ref,
        "thresholds": [dict(t) for t in thresholds],
        "provenance": provenance,
    }


def evaluate_threshold_breach(threshold: dict[str, Any], observed_value: float) -> bool:
    """Real comparison logic, direction DERIVED from ``dimension`` alone -- unlike ``reversal_criteria``'s
    open-ended ``structured_rule`` (which needs a caller-supplied operator because a free-text ``indicator``
    has no inherent direction), Kill Criteria's three closed dimensions each have exactly one Atlas-implied
    direction: ``max_loss``/``max_time`` breach when the observation reaches or exceeds the cap (``>=``);
    ``min_quality`` breaches when the observation falls to or below the floor (``<=``).

    NEW DESIGN, not Atlas-cited: Atlas gives no worked numeric example for Kill Criteria (unlike Reversal's
    own "CAC > 300 USD for 3 consecutive months"), so no consecutive-periods mechanism is modeled here --
    that mechanism is grounded specifically in Reversal's own worked example, which Kill Criteria's L808
    formula does not mention; inventing it here would be presenting an unrequested feature as grounded."""
    if threshold["dimension"] in ("max_loss", "max_time"):
        return observed_value >= threshold["value"]
    return observed_value <= threshold["value"]  # min_quality


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(criteria_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every threshold and the overall record carry a
    schema-valid provenance_record. Fails closed on malformed input (isinstance guards + safe ``.get()``,
    ``root_cause.fault_tree``'s own stricter gate style, applied here since this module postdates this
    family's original ``reversal_criteria.py`` gates)."""
    if not isinstance(criteria_set, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    thresholds = criteria_set.get("thresholds")
    if not isinstance(thresholds, list):
        return _result("provenance_required", False, [{"reason": "thresholds missing or not a list"}], validator, timestamp)
    invalid = [t.get("id") for t in thresholds if isinstance(t, dict) and not provenance_is_valid(t.get("provenance"))]
    malformed = [i for i, t in enumerate(thresholds) if not isinstance(t, dict)]
    overall_valid = provenance_is_valid(criteria_set.get("provenance"))
    passed = bool(thresholds) and not invalid and not malformed and overall_valid
    return _result(
        "provenance_required",
        passed,
        [{"thresholds_checked": len(thresholds), "invalid_provenance_ids": invalid, "malformed_entry_indices": malformed, "overall_provenance_valid": overall_valid}],
        validator,
        timestamp,
    )


def evaluate_threshold_coverage_gate(criteria_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from raw fields -- does not trust that ``generate_kill_criteria_set``'s own
    construction-time check already ran (a hand-crafted/tampered record must still be caught). Fails closed
    on malformed input."""
    if not isinstance(criteria_set, dict):
        return _result("threshold_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    thresholds = criteria_set.get("thresholds")
    if not isinstance(thresholds, list) or not thresholds:
        return _result("threshold_coverage", False, [{"reason": "thresholds missing, not a list, or empty -- no dimension can ever fire"}], validator, timestamp)
    covered = sorted({t.get("dimension") for t in thresholds if isinstance(t, dict) and t.get("dimension") in VALID_DIMENSIONS and _is_finite_number(t.get("value"))})
    invalid_entry_indices = [i for i, t in enumerate(thresholds) if not (isinstance(t, dict) and t.get("dimension") in VALID_DIMENSIONS and _is_finite_number(t.get("value")))]
    passed = bool(covered)
    return _result("threshold_coverage", passed, [{"thresholds_checked": len(thresholds), "dimensions_covered": covered, "invalid_entry_indices": invalid_entry_indices}], validator, timestamp)


def evaluate_ownership_gate(criteria_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from raw fields: every threshold names a non-empty owner. Atlas's own named
    benefit (L808, 控制下行風險) depends on this -- same "the record must actually do the thing its own name
    claims" discipline ``root_cause.fault_tree``'s referential-integrity gate, ``root_cause.bow_tie``'s
    OWNER/TEST invariant, and ``reversal_criteria``'s own actionable gate already establish elsewhere in
    this package, applied to Kill Criteria's own vocabulary. Fails closed on malformed input."""
    if not isinstance(criteria_set, dict):
        return _result("ownership", False, [{"reason": "record is not a dict"}], validator, timestamp)
    thresholds = criteria_set.get("thresholds")
    if not isinstance(thresholds, list) or not thresholds:
        return _result("ownership", False, [{"reason": "thresholds missing, not a list, or empty"}], validator, timestamp)
    unowned = [t.get("id") for t in thresholds if isinstance(t, dict) and not (t.get("owner") or "").strip()]
    malformed = [i for i, t in enumerate(thresholds) if not isinstance(t, dict)]
    passed = not unowned and not malformed
    return _result("ownership", passed, [{"thresholds_checked": len(thresholds), "unowned_ids": unowned, "malformed_entry_indices": malformed}], validator, timestamp)


def evaluate_kill_criteria_gates(criteria_set: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(criteria_set, validator, timestamp),
        evaluate_threshold_coverage_gate(criteria_set, validator, timestamp),
        evaluate_ownership_gate(criteria_set, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
