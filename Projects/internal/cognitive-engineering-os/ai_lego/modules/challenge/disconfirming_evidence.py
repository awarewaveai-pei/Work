"""``challenge.disconfirming_evidence`` -- F12 challenge/red-team/risk family, 7th built member (grep-confirmed:
``red_team``/``blue_team``/``independent_judge`` already exist in this package).

Atlas cites this method via the F12 index row ONLY (L649, verbatim): "Disconfirming Evidence｜主動找不支持資料
｜current belief→falsifier→search｜降 confirmation bias" -- actively search for data that does NOT support the
current belief, using the pipeline current_belief -> falsifier -> search, to reduce confirmation bias. Grep-
confirmed no dedicated §11.2x section exists for this method anywhere in the Atlas file (unlike ``red_team``'s
§11.23 or ``blue_team``'s §11.24) -- this module works from one table row alone, same disclosed under-
specification class the paired contract's own ``description`` and ``open_questions`` already carry.

THE real invariant this whole module exists to enforce is the pipeline's own ORDER, made structural rather than
advisory: ``falsifier_criteria[]`` (what WOULD disprove ``current_belief``) must be declared BEFORE any
``search_results[]`` entry can reference one, via a cross-array foreign key
(``search_results[].falsifier_criteria_id -> falsifier_criteria[].id``) checked fail-closed. A dangling
reference -- a search result recorded against a falsifier that was never declared -- is refused with
``InvariantViolation`` at construction, and independently re-derived (never trusted from a stored flag) by the
gate below. This makes post-hoc rationalization (inventing a falsifier AFTER finding something convenient)
structurally impossible, not merely discouraged: Popperian discipline (define the falsifier, THEN search) is
Atlas L649's own entire epistemic point -- a "disconfirming evidence search" with zero pre-declared falsifiers
collapses back into unstructured googling, exactly the confirmation-bias-prone behavior this method exists to
prevent.

A second, single-item (not cross-array) invariant: a ``search_results[]`` entry with ``found: true`` must carry a
non-empty ``evidence_description`` -- an unevidenced "found disconfirming evidence" claim is exactly as dangerous
as an unevidenced Red Team finding (``challenge.red_team``'s own ``evidence_labeling_required`` reasoning,
re-derived here for this method's own real risk). Unlike ``red_team``, which has a SEPARATE
``evaluate_evidence_labeling_required_gate`` because its evidence-labeling risk is a conditional scan over an
independent ``epistemic_type`` field, this method's evidence-labeling risk is inseparable from the
``search_results`` structure itself (the SAME field, ``found``, gates whether ``evidence_description`` is
required) -- so it is checked inside the one content-integrity gate below, not a second gate re-scanning the same
array.

``found`` is a genuine ``bool`` by design here (correct, not a bug): whether disconfirming evidence was located is
inherently a yes/no fact. The well-known trap this module explicitly does NOT fall into is the REVERSE direction
-- ``isinstance(True, int) is True`` in Python, so a numeric field elsewhere in this corpus (e.g.
``stakeholders.game_theory``'s ``payoffs[].value``) must explicitly exclude ``bool`` before accepting an
``int``/``float``. This module defines no numeric field, so that exclusion does not apply here; ``found`` itself
is checked with a strict ``isinstance(value, bool)``, which is the correct (not overly permissive) test for an
intentional boolean field.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees for "disconfirming"/"falsifier"/"DISCONF" before writing any of this method's own files: zero pre-existing
implementation (``method-inventory.yaml``'s own "Disconfirming Evidence" entry is a registry placeholder with
``has_contract: false``, not a shape definition).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.disconfirming_evidence"
RECORD_ID_PREFIX = "DISCONF-"

_FALSIFIER_KEYS = frozenset({"id", "description"})
_SEARCH_RESULT_KEYS = frozenset({"falsifier_criteria_id", "found", "evidence_description"})
_SEARCH_RESULT_REQUIRED_KEYS = frozenset({"falsifier_criteria_id", "found"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "current_belief", "falsifier_criteria", "search_results", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus (``game_theory``/``jtbd``/
    ``bcg_matrix``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Convenience constructors for sub-items -- same style as challenge.red_team's own `finding()` helper.
# --------------------------------------------------------------------------


def falsifier_criterion(criterion_id: str, description: str) -> dict[str, Any]:
    """One item of ``falsifier_criteria[]`` -- what evidence, if found, WOULD prove ``current_belief`` wrong.
    Must be declared before any ``search_results[]`` entry references it."""
    return {"id": criterion_id, "description": description}


def search_result(falsifier_criteria_id: str, found: bool, *, evidence_description: str | None = None) -> dict[str, Any]:
    """One item of ``search_results[]``. ``evidence_description`` is validated as REQUIRED when ``found`` is
    ``True`` by the builder/gate below, not by this convenience constructor itself."""
    record: dict[str, Any] = {"falsifier_criteria_id": falsifier_criteria_id, "found": found}
    if evidence_description is not None:
        record["evidence_description"] = evidence_description
    return record


# --------------------------------------------------------------------------
# Shared validation -- called from BOTH the builder and the independent gate, never trusting a stored flag.
# --------------------------------------------------------------------------


def _validate_falsifier_criteria(falsifier_criteria: Any) -> list[str]:
    """Returns the list of valid falsifier ids, or raises. Fail-closed, never a partial/best-effort result."""
    if not isinstance(falsifier_criteria, list) or not falsifier_criteria:
        raise InvariantViolation(
            f"DISCONF_NO_FALSIFIERS: falsifier_criteria must be a non-empty list -- a search with zero "
            f"pre-declared falsifiers never specified what would count as disconfirmation (Atlas L649's own "
            f"'current belief→falsifier→search' order, the entire epistemic point of this method), "
            f"got {_shallow_describe(falsifier_criteria)}"
        )
    ids: list[str] = []
    for index, criterion in enumerate(falsifier_criteria):
        if not isinstance(criterion, dict) or set(criterion.keys()) - _FALSIFIER_KEYS or not _FALSIFIER_KEYS <= criterion.keys():
            raise InvariantViolation(f"DISCONF_INVALID_FALSIFIER: falsifier_criteria[{index}] must be a dict with exactly keys {sorted(_FALSIFIER_KEYS)}, got {_shallow_describe(criterion)}")
        if not _is_nonempty_str(criterion.get("id")) or not _is_nonempty_str(criterion.get("description")):
            raise InvariantViolation(f"DISCONF_INVALID_FALSIFIER: falsifier_criteria[{index}] id and description must each be a non-empty string, got {_shallow_describe(criterion)}")
        ids.append(criterion["id"])
    duplicates = {fid for fid in ids if ids.count(fid) > 1}
    if duplicates:
        raise InvariantViolation(f"DISCONF_DUPLICATE_FALSIFIER_ID: falsifier_criteria id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_search_results(search_results: Any, falsifier_ids: list[str]) -> None:
    """Raises on any structural defect, including THE real invariant: a dangling ``falsifier_criteria_id``
    reference (a result recorded against a falsifier never declared). ``search_results`` MAY legitimately be
    empty -- the belief surviving a genuine search is a real, useful, non-error outcome."""
    if not isinstance(search_results, list):
        raise InvariantViolation(f"DISCONF_INVALID_SEARCH_RESULTS: search_results must be a list (may be empty), got {_shallow_describe(search_results)}")
    falsifier_id_set = set(falsifier_ids)
    for index, result in enumerate(search_results):
        if not isinstance(result, dict) or set(result.keys()) - _SEARCH_RESULT_KEYS or not _SEARCH_RESULT_REQUIRED_KEYS <= result.keys():
            raise InvariantViolation(
                f"DISCONF_INVALID_SEARCH_RESULT: search_results[{index}] must be a dict with required keys "
                f"{sorted(_SEARCH_RESULT_REQUIRED_KEYS)} (plus optional evidence_description), got {_shallow_describe(result)}"
            )
        falsifier_criteria_id = result.get("falsifier_criteria_id")
        found = result.get("found")
        if not _is_nonempty_str(falsifier_criteria_id):
            raise InvariantViolation(f"DISCONF_INVALID_SEARCH_RESULT: search_results[{index}] falsifier_criteria_id must be a non-empty string, got {_shallow_describe(result)}")
        if not isinstance(found, bool):
            raise InvariantViolation(f"DISCONF_INVALID_SEARCH_RESULT: search_results[{index}] found must be a bool, got {type(found).__name__}")
        if falsifier_criteria_id not in falsifier_id_set:
            raise InvariantViolation(
                f"DISCONF_SEARCH_RESULT_UNKNOWN_FALSIFIER: search_results[{index}] falsifier_criteria_id "
                f"{falsifier_criteria_id!r} does not reference any entry in falsifier_criteria -- THE real "
                f"invariant this method exists to enforce (a result cannot be recorded against a falsifier that "
                f"was never declared before searching; Popperian order, not post-hoc rationalization)"
            )
        if found is True and not _is_nonempty_str(result.get("evidence_description")):
            raise InvariantViolation(
                f"DISCONF_MISSING_EVIDENCE_DESCRIPTION: search_results[{index}] found=true but evidence_description "
                f"is missing or empty -- a claimed disconfirmation must describe what was actually found"
            )


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_disconfirming_evidence_search(
    record_id: str,
    current_belief: str,
    falsifier_criteria: list[dict[str, Any]],
    search_results: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/disconfirming-evidence-search.schema.yaml``.

    Enforces all real invariants fail-closed, IN ORDER: id/version/provenance shape, then ``current_belief``
    (non-empty), then ``falsifier_criteria`` (at least one, well-formed, unique ids), then ``search_results``
    (every reference resolves, ``found`` is a genuine bool, ``found:true`` carries a non-empty
    ``evidence_description``). ``falsifier_criteria`` is validated strictly BEFORE ``search_results`` -- the
    validation order itself mirrors Atlas L649's own pipeline order, not merely coincidental sequencing.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DISCONF_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DISCONF_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DISCONF_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(current_belief):
        raise InvariantViolation(f"DISCONF_EMPTY_BELIEF: current_belief must be a non-empty string, got {current_belief!r}")

    falsifier_ids = _validate_falsifier_criteria(falsifier_criteria)
    _validate_search_results(search_results, falsifier_ids)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "current_belief": current_belief,
        # dict(...) per element, not just list(...) on the outer list -- a shallow list() copy still shares the
        # caller's own nested dicts, letting a post-construction caller-side mutation silently rewrite a
        # gate-passed record. Same aliasing discipline stakeholders.game_theory's own builder fix (2026-09-11
        # critic pass) already established for this corpus.
        "falsifier_criteria": [dict(c) for c in falsifier_criteria],
        "search_results": [dict(r) for r in search_results],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_disconfirming_evidence_search -- a hand-tampered record that bypassed the builder entirely must be
# caught exactly as a builder-refused one would have been.
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


def evaluate_disconfirming_evidence_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_disconfirming_evidence_search``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a search_results entry spliced in post-construction with a dangling falsifier_criteria_id, or
    a falsifier_criteria entry deleted out from under an existing reference) is caught here exactly as a
    builder-refused one would have been. Also covers the contract's ``evidence_labeling_required: true`` flag --
    a ``found:true`` entry missing ``evidence_description`` is one of the invariants ``_validate_search_results``
    already raises on, so no separate gate is needed for it (see module docstring). Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("disconfirming_evidence_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("disconfirming_evidence_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("disconfirming_evidence_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "disconfirming_evidence_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    if not _is_nonempty_str(record.get("current_belief")):
        problems.append("current_belief missing or empty")

    falsifier_ids: list[str] = []
    try:
        falsifier_ids = _validate_falsifier_criteria(record.get("falsifier_criteria"))
    except InvariantViolation as error:
        problems.append(str(error))

    try:
        if falsifier_ids:
            _validate_search_results(record.get("search_results"), falsifier_ids)
        else:
            problems.append("search_results could not be checked: falsifier_criteria failed validation")
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("disconfirming_evidence_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_disconfirming_evidence_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_disconfirming_evidence_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
