"""``framing.okr`` -- F01 framing family (methods/contracts/framing.okr.contract.yaml), 4th member of this
family (3/11 built at batch start: goal_statement/smart/non_goals, built by concurrent sibling agents this
same batch, not read here).

Atlas's ONLY citation is the F01 tool table's own row (L336: "OKR｜方向與可衡量成果分離｜團隊/季度｜
Objective→2–5 KR→owner→review｜避免只追工作量｜Roadmap") -- grep-confirmed the sole "OKR" hit in the whole
Atlas file, no dedicated section.

Due diligence (VERIFIED, not assumed from name similarity): read ``ai_lego/modules/framing/smart.py`` and
``smart-goal-record.schema.yaml`` in full before writing this module. SMART is a FIXED 5-criteria checklist
REFINING one already-stated goal -- no KR-count bound, no owner field, no review-cadence field anywhere in
that schema. OKR separates ONE qualitative Objective from 2-5 INDEPENDENTLY-OWNED, independently-measurable
Key Results plus a team/quarterly review mechanism -- a portfolio-of-bounded-results shape, genuinely
different axis, not a naming accident. Also confirmed (grep, case-insensitive, whole ``ai_lego`` tree):
zero pre-existing "okr"/"key_result"/"objective" hits beyond unrelated multi-objective-optimization
vocabulary in ``decision/pareto_frontier.py``/``decision/ahp.py`` and threshold vocabulary in
``learning/kill_criteria.py`` -- this module mints a genuinely new typed object, not a duplicate.
``decision.rice``/``decision.moscow``-class methods operate on an ALREADY-DEFINED set of items to rank or
bucket them; OKR is goal-SETTING (it mints the Objective/Key Results themselves) -- different axis, no
overlap. Atlas's own best-paired citation for this row ("Roadmap") is a separate, UNBUILT method with no
minted machine_id -- not built or shaped here, per this task's own explicit instruction.

``target`` is external, well-known OKR convention (Google/Intel-originated: a Key Result must be a
checkable/measurable statement, not prose alone), disclosed here as detail added beyond the literal Atlas
row, same convention ``framing.smart``/``decision.wsjf`` already used this session for SAFe/Kano-model
detail.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this family already establishes:

1. ``key_results`` has between 2 and 5 entries inclusive (Atlas's own literal "2–5 KR"), each with a
   non-empty ``description``/``target``/``owner`` -- distinct error codes per missing field, same
   per-field-granularity discipline ``framing.non_goals``'s own 3-stage pipeline check already establishes,
   so a caller/test can tell exactly which pipeline stage was left blank.
2. Every ``key_results[]`` id is unique within the record (``OKR_DUPLICATE_KEY_RESULT_ID``), same invariant
   class ``framing.non_goals``'s own ``NONGOALS_DUPLICATE_ITEM_ID`` establishes for this family.

``review_cadence`` (record-level, Atlas's own "→review" pipeline stage) must also be non-empty.

No compute/ package: a structural framing record with no arithmetic, same class as ``framing.non_goals``
(read in full as this method's own closest template -- record-level fields plus a bounded list of
structured entries, no genuine_compute gate).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.okr"
RECORD_ID_PREFIX = "OKR-"
MIN_KEY_RESULTS = 2
MAX_KEY_RESULTS = 5
# Atlas's own literal F01 row (L336), "2–5 KR", transcribed verbatim.

_KR_REQUIRED_KEYS = frozenset({"id", "description", "target", "owner", "provenance"})
_KR_ALLOWED_KEYS = _KR_REQUIRED_KEYS  # no optional fields -- evidence_labeling_required is false for this method


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive ``repr()`` over caller-supplied
    input of unknown size, same denial-of-service-in-an-error-path avoidance ``framing.non_goals``'s own
    ``_shallow_describe`` already documents."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _kr_shape_is_valid(entry: Any) -> bool:
    """Shape only: known keys, required keys present, every field the right TYPE. Does NOT check
    non-emptiness of description/target/owner (Invariant #1, checked separately with its own distinct error
    codes below, same shape-then-content split ``framing.non_goals``'s own ``_entry_shape_is_valid`` /
    ``_entry_missing_pipeline_stage`` already establishes) and does NOT check ``provenance`` content
    validity (the provenance gate's own job)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if keys != _KR_REQUIRED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    for key in ("description", "target", "owner"):
        if not isinstance(entry.get(key), str):
            return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    return True


def _kr_missing_field(entry: dict[str, Any]) -> str | None:
    """Invariant #1 (per-entry half). Precondition: ``entry`` already passed ``_kr_shape_is_valid`` (so
    description/target/owner are confirmed present and string-typed). Returns the specific error code for
    the FIRST empty field found, checked in Atlas's own citation order (KR content -> measurable target ->
    owner), or ``None`` if all three are genuinely filled in."""
    if not _is_nonempty_str(entry["description"]):
        return "OKR_EMPTY_KR_DESCRIPTION"
    if not _is_nonempty_str(entry["target"]):
        return "OKR_EMPTY_KR_TARGET"
    if not _is_nonempty_str(entry["owner"]):
        return "OKR_UNOWNED_KEY_RESULT"
    return None


def key_result_entry(
    entry_id: str,
    description: str,
    target: str,
    owner: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    """Convenience constructor for one ``key_results[]`` entry -- emits ONLY known-good keys. Not itself an
    invariant boundary -- the real check happens inside ``generate_okr_record``, which validates whatever
    dict it is handed regardless of how it was built (mutation/hand-tampering tests build entries directly,
    bypassing this helper, to prove the constructor itself enforces the invariants, same discipline
    ``framing.non_goals``'s own ``excluded_scope_entry`` docstring already establishes)."""
    return {
        "id": entry_id,
        "description": description,
        "target": target,
        "owner": owner,
        "provenance": provenance,
    }


def generate_okr_record(
    record_id: str,
    objective: str,
    key_results: list[dict[str, Any]],
    review_cadence: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/okr-record.schema.yaml``. Enforces both real invariants fail-closed, in
    this order: id/version/objective shape, key_results list shape and count bound, PER-ENTRY shape then
    completeness, cross-entry id uniqueness, then review_cadence -- never a record that itself proves it was
    built illegally, same family-wide "raise-before-construction" discipline every sibling module in this
    package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OKR_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OKR_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(objective):
        raise InvariantViolation(f"OKR_EMPTY_OBJECTIVE: objective must be a non-empty string, got {objective!r}")

    if not isinstance(key_results, list):
        raise InvariantViolation(f"OKR_INVALID_KEY_RESULTS: key_results must be a list, got {_shallow_describe(key_results)}")
    if not (MIN_KEY_RESULTS <= len(key_results) <= MAX_KEY_RESULTS):
        raise InvariantViolation(
            f"OKR_INVALID_KR_COUNT: key_results must have between {MIN_KEY_RESULTS} and {MAX_KEY_RESULTS} entries "
            f"inclusive (Atlas F01 L336 '2–5 KR'), got {len(key_results)}"
        )

    seen_ids: set[str] = set()
    for entry in key_results:
        if not _kr_shape_is_valid(entry):
            raise InvariantViolation(
                f"OKR_INVALID_KEY_RESULTS: every key_results[] entry must be a well-shaped dict (id/description/target/owner "
                f"non-empty strings, provenance a dict, no unknown keys), got {_shallow_describe(entry)}"
            )
        missing = _kr_missing_field(entry)
        if missing is not None:
            raise InvariantViolation(f"{missing}: key result {entry['id']!r} is missing a required field")
        if entry["id"] in seen_ids:
            raise InvariantViolation(f"OKR_DUPLICATE_KEY_RESULT_ID: key_results[] id {entry['id']!r} is used more than once")
        seen_ids.add(entry["id"])

    if not _is_nonempty_str(review_cadence):
        raise InvariantViolation(f"OKR_EMPTY_REVIEW_CADENCE: review_cadence must be a non-empty string, got {review_cadence!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "objective": objective,
        "key_results": [dict(entry) for entry in key_results],
        "review_cadence": review_cadence,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance AND every
    key_results[] entry's own provenance are schema-valid. Fails closed on a non-dict record or a non-list
    key_results."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    entries = record.get("key_results")
    entries = entries if isinstance(entries, list) else []
    invalid_entry_ids = [e.get("id") if isinstance(e, dict) else None for e in entries if not (isinstance(e, dict) and provenance_is_valid(e.get("provenance")))]
    passed = record_provenance_valid and bool(entries) and not invalid_entry_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "entries_checked": len(entries), "invalid_provenance_entry_ids": invalid_entry_ids}],
        validator,
        timestamp,
    )


def evaluate_okr_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_okr_record``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("okr_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("okr_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("okr_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("objective")):
        return _result("okr_integrity", False, [{"reason": "objective missing or empty"}], validator, timestamp)

    entries = record.get("key_results")
    if not isinstance(entries, list):
        return _result("okr_integrity", False, [{"reason": "key_results missing or not a list"}], validator, timestamp)
    if not (MIN_KEY_RESULTS <= len(entries) <= MAX_KEY_RESULTS):
        return _result(
            "okr_integrity",
            False,
            [{"reason": f"key_results count {len(entries)} outside required [{MIN_KEY_RESULTS},{MAX_KEY_RESULTS}] bound"}],
            validator,
            timestamp,
        )

    seen_ids: set[str] = set()
    for entry in entries:
        if not _kr_shape_is_valid(entry):
            return _result(
                "okr_integrity",
                False,
                [{"reason": "a key_results[] entry is malformed (unknown/missing key or wrong type)", "entry": _shallow_describe(entry)}],
                validator,
                timestamp,
            )
        missing = _kr_missing_field(entry)
        if missing is not None:
            return _result("okr_integrity", False, [{"reason": missing, "entry_id": entry["id"]}], validator, timestamp)
        if entry["id"] in seen_ids:
            return _result("okr_integrity", False, [{"reason": "OKR_DUPLICATE_KEY_RESULT_ID", "entry_id": entry["id"]}], validator, timestamp)
        seen_ids.add(entry["id"])

    if not _is_nonempty_str(record.get("review_cadence")):
        return _result("okr_integrity", False, [{"reason": "review_cadence missing or empty"}], validator, timestamp)

    return _result("okr_integrity", True, [{"key_result_count": len(entries)}], validator, timestamp)


def evaluate_okr_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_okr_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
