"""``root_cause.kepner_tregoe`` -- F05 root_cause family (methods/contracts/root_cause.kepner_tregoe.contract.yaml).

Atlas's ONLY citation for this method is the F05 tool table's own row
(L440: "Is/Is Not 差異分析｜What/Where/When/Extent｜降低憑直覺猜測｜適合
troubleshooting") -- grep-confirmed the single "Kepner" hit anywhere in the
Atlas file, no dedicated section (unlike ``root_cause.five_whys``'s own
§11.5). The 2x4 IS/IS-NOT grid across the four Atlas-cited dimensions
(WHAT/WHERE/WHEN/EXTENT) and the downstream distinctions/changes stages are
real, well-documented external Kepner-Tregoe "Problem Analysis" methodology
(Kepner & Tregoe, *The New Rational Manager*) -- disclosed as such rather
than invented from the one-line citation, same class of real-methodology
grounding ``security.abuse_case``'s own OQ-ABUSECASE-3 already discloses for
Sindre & Opdahl.

Two real invariants, each enforced BOTH at construction (raise BEFORE any
record is built) AND independently by a gate that re-derives from raw
fields, never trusting a stored value -- the same "shared predicate, reused
by both layers" discipline ``ai_lego.modules.security.abuse_case`` already
establishes:

1. Every one of the 4 dimensions must carry a non-empty IS -- an unknown IS
   makes the whole technique meaningless (Atlas's own benefit line, "降低
   憑直覺猜測", presumes a known IS to compare against). When a dimension's
   IS-NOT is present, it must genuinely differ from its own IS
   (case/whitespace-insensitive compare) -- an identical pair is a no-op,
   not a comparison.
2. Every distinction must reference a dimension that actually has BOTH a
   non-empty IS and a non-empty IS-NOT recorded -- a distinction cannot be
   derived from a dimension nobody ever filled in. Every change must
   reference a distinction that actually exists in the same record.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.kepner_tregoe"
RECORD_ID_PREFIX = "KTPS-"
REQUIRED_PRECONDITION_STATUS = "validated"
DIMENSION_ORDER: tuple[str, ...] = ("WHAT", "WHERE", "WHEN", "EXTENT")
# Atlas's own literal four-word F05 row (L440), transcribed verbatim and in Atlas's own order -- the same
# "positionally-ordered pipeline" invariant class security.pasta/security.abuse_case already establish.

_DIMENSION_REQUIRED_KEYS = frozenset({"dimension", "is", "provenance"})
_DIMENSION_ALLOWED_KEYS = _DIMENSION_REQUIRED_KEYS | frozenset({"is_not", "supporting_evidence_refs"})
_DISTINCTION_REQUIRED_KEYS = frozenset({"distinction_id", "dimension", "description", "provenance"})
_DISTINCTION_ALLOWED_KEYS = _DISTINCTION_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})
_CHANGE_REQUIRED_KEYS = frozenset({"change_id", "distinction_id", "description", "provenance"})
_CHANGE_ALLOWED_KEYS = _CHANGE_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- see the method contract's own compilation_decisions
    on why no richer (semantic) equivalence is attempted."""
    return " ".join(value.strip().casefold().split())


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _dimensions_are_valid(dimensions: Any) -> tuple[bool, dict[str, bool], str | None]:
    """Returns ``(is_valid, {dimension: has_both_is_and_is_not}, failure_reason)``. The completeness map
    is needed by distinction validation, so this predicate returns it rather than forcing a second pass.
    ``failure_reason`` lets the builder raise a SPECIFIC InvariantViolation code and lets the gate report a
    specific evidence reason from the exact same computation -- no divergent logic between the two layers.

    Real invariant: exactly 4 entries, one per DIMENSION_ORDER value, POSITIONALLY in that literal order,
    each with a non-empty IS and, if IS-NOT is present, a genuinely different one (case/whitespace-insensitive)."""
    if not isinstance(dimensions, list) or len(dimensions) != len(DIMENSION_ORDER):
        return False, {}, "SHAPE"
    completeness: dict[str, bool] = {}
    for position, expected_dimension in enumerate(DIMENSION_ORDER):
        entry = dimensions[position]
        if not _shaped(entry, _DIMENSION_REQUIRED_KEYS, _DIMENSION_ALLOWED_KEYS):
            return False, {}, "SHAPE"
        if entry.get("dimension") != expected_dimension:
            return False, {}, "SHAPE"
        if not _is_nonempty_str(entry.get("is")):
            return False, {}, "EMPTY_IS"
        is_not = entry.get("is_not")
        if is_not is not None:
            if not _is_nonempty_str(is_not):
                return False, {}, "SHAPE"  # an explicit empty/blank is_not is malformed, not "absent"
            if _normalize(is_not) == _normalize(entry["is"]):
                return False, {}, "IS_EQUALS_ISNOT"
        if not _refs_shape_ok(entry):
            return False, {}, "SHAPE"
        completeness[expected_dimension] = is_not is not None
    return True, completeness, None


def _distinctions_are_valid(distinctions: Any, dimension_completeness: dict[str, bool]) -> tuple[bool, frozenset[str], str | None]:
    """Returns ``(is_valid, known_distinction_ids, failure_reason)``. ``None``/absent ``distinctions`` is
    legal (a specification may exist before any distinction has been drawn) -- see the method contract's
    own compilation_decisions."""
    if distinctions is None:
        return True, frozenset(), None
    if not isinstance(distinctions, list):
        return False, frozenset(), "SHAPE"
    seen: set[str] = set()
    for entry in distinctions:
        if not _shaped(entry, _DISTINCTION_REQUIRED_KEYS, _DISTINCTION_ALLOWED_KEYS):
            return False, frozenset(), "SHAPE"
        distinction_id = entry.get("distinction_id")
        if not (_is_nonempty_str(distinction_id) and distinction_id.startswith("DIST-")) or distinction_id in seen:
            return False, frozenset(), "SHAPE"
        if not _is_nonempty_str(entry.get("description")):
            return False, frozenset(), "SHAPE"
        if not _refs_shape_ok(entry):
            return False, frozenset(), "SHAPE"
        dimension = entry.get("dimension")
        if dimension not in DIMENSION_ORDER:
            return False, frozenset(), "UNKNOWN_DIMENSION"
        if not dimension_completeness.get(dimension, False):
            return False, frozenset(), "DIMENSION_INCOMPLETE"
        seen.add(distinction_id)
    return True, frozenset(seen), None


def _changes_are_valid(changes: Any, known_distinction_ids: frozenset[str]) -> tuple[bool, str | None]:
    """``None``/absent ``changes`` is legal, same reasoning as distinctions above."""
    if changes is None:
        return True, None
    if not isinstance(changes, list):
        return False, "SHAPE"
    seen: set[str] = set()
    for entry in changes:
        if not _shaped(entry, _CHANGE_REQUIRED_KEYS, _CHANGE_ALLOWED_KEYS):
            return False, "SHAPE"
        change_id = entry.get("change_id")
        if not (_is_nonempty_str(change_id) and change_id.startswith("CHG-")) or change_id in seen:
            return False, "SHAPE"
        if not _is_nonempty_str(entry.get("description")):
            return False, "SHAPE"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
        distinction_id = entry.get("distinction_id")
        if distinction_id not in known_distinction_ids:
            return False, "UNKNOWN_DISTINCTION"
        seen.add(change_id)
    return True, None


def dimension_entry(dimension: str, is_: str, provenance: dict[str, Any], *, is_not: str | None = None, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/kepner-tregoe-problem-specification.schema.yaml#/properties/dimensions``."""
    record: dict[str, Any] = {"dimension": dimension, "is": is_, "provenance": provenance}
    if is_not is not None:
        record["is_not"] = is_not
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def distinction_entry(distinction_id: str, dimension: str, description: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``...#/properties/distinctions``."""
    record: dict[str, Any] = {"distinction_id": distinction_id, "dimension": dimension, "description": description, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def change_entry(change_id: str, distinction_id: str, description: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``...#/properties/changes``."""
    record: dict[str, Any] = {"change_id": change_id, "distinction_id": distinction_id, "description": description, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_kepner_tregoe_specification(
    spec_id: str,
    problem_statement: dict[str, Any],
    dimensions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    distinctions: list[dict[str, Any]] | None = None,
    changes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/kepner-tregoe-problem-specification.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide
    "raise-before-construction" discipline ``root_cause.fishbone``/``root_cause.five_whys`` already
    establish -- never a record that itself proves it was built illegally. Unlike those two siblings,
    this method's own gate (``evaluate_kepner_tregoe_integrity_gate``) independently re-checks that
    ``problem_statement_ref`` carries the ``PROB-`` prefix, so the builder must guarantee that shape
    up front too -- a record whose builder accepted a malformed problem_statement but whose gate then
    rejects the very record just built would itself be a two-layer-invariant coherence bug.
    """
    if not isinstance(problem_statement, dict) or not _is_nonempty_str(problem_statement.get("id")) or not problem_statement["id"].startswith("PROB-"):
        raise InvariantViolation(
            f"KEPNERTREGOE_INVALID_PROBLEM_STATEMENT: problem_statement must be a dict with a non-empty "
            f"'id' beginning with 'PROB-', got {problem_statement!r}"
        )
    if problem_statement.get("status") != REQUIRED_PRECONDITION_STATUS:
        raise InvariantViolation(
            f"KEPNERTREGOE_PRECONDITION_FAILED: problem_statement.status must be "
            f"{REQUIRED_PRECONDITION_STATUS!r}, got {problem_statement.get('status')!r} "
            f"(root_cause.kepner_tregoe.contract.yaml preconditions)"
        )
    if not _is_nonempty_str(spec_id) or not spec_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"KEPNERTREGOE_INVALID_ID: spec_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {spec_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"KEPNERTREGOE_INVALID_VERSION: version must be a string, got {version!r}")

    dims_ok, completeness, dims_reason = _dimensions_are_valid(dimensions)
    if not dims_ok:
        if dims_reason == "EMPTY_IS":
            raise InvariantViolation(f"KEPNERTREGOE_EMPTY_IS: every one of {DIMENSION_ORDER} must carry a non-empty 'is' entry, got {dimensions!r}")
        if dims_reason == "IS_EQUALS_ISNOT":
            raise InvariantViolation(
                f"KEPNERTREGOE_IS_EQUALS_ISNOT: a dimension's is_not must genuinely differ from its own is (case/whitespace-insensitive), got {dimensions!r}"
            )
        raise InvariantViolation(
            f"KEPNERTREGOE_INVALID_DIMENSION_SET: dimensions must be EXACTLY the four entries {DIMENSION_ORDER} in that literal order, well-shaped, got {dimensions!r}"
        )

    dist_ok, known_distinction_ids, dist_reason = _distinctions_are_valid(distinctions, completeness)
    if not dist_ok:
        if dist_reason == "UNKNOWN_DIMENSION":
            raise InvariantViolation(f"KEPNERTREGOE_DISTINCTION_UNKNOWN_DIMENSION: every distinction.dimension must be one of {DIMENSION_ORDER}, got {distinctions!r}")
        if dist_reason == "DIMENSION_INCOMPLETE":
            raise InvariantViolation(
                "KEPNERTREGOE_DISTINCTION_DIMENSION_INCOMPLETE: a distinction can only be derived from a dimension that has BOTH a non-empty is AND a "
                f"non-empty is_not recorded, got {distinctions!r}"
            )
        raise InvariantViolation(f"KEPNERTREGOE_INVALID_DISTINCTION: every distinction needs a unique DIST- id and a non-empty description, got {distinctions!r}")

    changes_ok, change_reason = _changes_are_valid(changes, known_distinction_ids)
    if not changes_ok:
        if change_reason == "UNKNOWN_DISTINCTION":
            raise InvariantViolation(f"KEPNERTREGOE_CHANGE_UNKNOWN_DISTINCTION: every change.distinction_id must reference an existing distinction, got {changes!r}")
        raise InvariantViolation(f"KEPNERTREGOE_INVALID_CHANGE: every change needs a unique CHG- id and a non-empty description, got {changes!r}")

    record: dict[str, Any] = {
        "id": spec_id,
        "version": version,
        "problem_statement_ref": problem_statement["id"],
        "generated_by_method": generated_by_method,
        "dimensions": [dict(d) for d in dimensions],
        "provenance": provenance,
    }
    if distinctions:
        record["distinctions"] = [dict(d) for d in distinctions]
    if changes:
        record["changes"] = [dict(c) for c in changes]
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every dimension AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    dims = record.get("dimensions")
    dims = dims if isinstance(dims, list) else []
    invalid = [d.get("dimension") for d in dims if isinstance(d, dict) and not provenance_is_valid(d.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(dims) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"dimensions_checked": len(dims), "invalid_provenance_dimensions": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``root_cause.fishbone``/``root_cause.five_whys`` already use: an EVIDENCE-labeled dimension must
    actually cite supporting_evidence_refs."""
    dims = record.get("dimensions") if isinstance(record, dict) else None
    dims = dims if isinstance(dims, list) else []
    problems: list[dict[str, Any]] = []
    for d in dims:
        if not isinstance(d, dict):
            continue
        epistemic_type = (d.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"dimension": d.get("dimension"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not d.get("supporting_evidence_refs"):
            problems.append({"dimension": d.get("dimension"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(dims) and not problems
    return _result("evidence_labeling_required", passed, [{"dimensions_checked": len(dims), "problems": problems}], validator, timestamp)


def evaluate_kepner_tregoe_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_kepner_tregoe_specification``, so a hand-tampered record that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("kepner_tregoe_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("kepner_tregoe_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("kepner_tregoe_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("problem_statement_ref")) or not record.get("problem_statement_ref", "").startswith("PROB-"):
        return _result("kepner_tregoe_integrity", False, [{"reason": "problem_statement_ref missing, empty, or not prefixed PROB-"}], validator, timestamp)

    dims_ok, completeness, dims_reason = _dimensions_are_valid(record.get("dimensions"))
    if not dims_ok:
        return _result(
            "kepner_tregoe_integrity",
            False,
            [{"reason": f"dimensions invalid ({dims_reason}) -- must be exactly {DIMENSION_ORDER} in that literal order, each with non-empty is, any is_not genuinely different"}],
            validator,
            timestamp,
        )

    dist_ok, known_distinction_ids, dist_reason = _distinctions_are_valid(record.get("distinctions"), completeness)
    if not dist_ok:
        return _result(
            "kepner_tregoe_integrity",
            False,
            [{"reason": f"distinctions invalid ({dist_reason}) -- unique DIST- id, non-empty description, dimension must have BOTH is and is_not"}],
            validator,
            timestamp,
        )

    changes_ok, change_reason = _changes_are_valid(record.get("changes"), known_distinction_ids)
    if not changes_ok:
        return _result(
            "kepner_tregoe_integrity",
            False,
            [{"reason": f"changes invalid ({change_reason}) -- unique CHG- id, non-empty description, distinction_id must reference an existing distinction"}],
            validator,
            timestamp,
        )

    return _result(
        "kepner_tregoe_integrity",
        True,
        [
            {
                "dimension_count": len(record["dimensions"]),
                "distinction_count": len(record.get("distinctions") or []),
                "change_count": len(record.get("changes") or []),
            }
        ],
        validator,
        timestamp,
    )


def evaluate_kepner_tregoe_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties,
    then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_kepner_tregoe_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
