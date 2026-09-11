"""``challenge.pre_mortem`` -- F12 challenge/red-team/risk family, 4th built member (``red_team``, ``blue_team``,
``independent_judge`` already exist in this package; ``devil's_advocate``/``counterexample_search``/
``disconfirming_evidence``/FMEA etc. remain unbuilt). One of 7 concurrent agents each opening one distinct,
unbuilt F12 member in the same parallel batch -- zero file overlap with the other 6.

Atlas cites this method twice: F12 tool table row (L647: "Pre-mortem｜假設未來已失敗｜每人獨立列 failure
causes→cluster→controls｜揭露真實擔憂") and dedicated §11.25 (L1755-1773), whose own literal 5-step process
this module mechanizes verbatim:

    1. 指定失敗時間點與情境  -- ``failure_scenario`` (non-empty, required).
    2. 每人先獨立寫原因      -- ``failure_causes[].description`` (independently-authored cause text).
    3. 分群                  -- ``failure_causes[].cluster``.
    4. 依 likelihood × impact 排序 -- ``failure_causes[].likelihood``/``impact`` (closed LOW/MEDIUM/HIGH),
       ``priority`` GENUINE_COMPUTE-derived from both (never a builder parameter -- see
       ``derive_cause_priority`` below, same discipline ``stakeholders.power_interest``'s own
       ``derive_power_interest_quadrant`` already establishes for its own (power, interest) -> quadrant table).
    5. 建 prevention/detection/recovery control -- ``controls[]``, each with a ``control_type`` in the closed
       set {PREVENTION, DETECTION, RECOVERY} (Atlas's own 3 named types, transcribed verbatim) and an
       ``addresses_cause_id`` referencing one ``failure_causes[].id`` in this same record.

THE real invariant this method exists to enforce (step 5's own completeness, not a soft caution): every
``failure_causes[]`` entry's ``id`` must be referenced by AT LEAST ONE ``controls[]`` entry's
``addresses_cause_id``. A pre-mortem that names failure causes but builds zero controls for one of them did
not complete Atlas's own process -- refused before construction, same "raise before construction" discipline
``stakeholders.game_theory``'s own payoff-completeness invariant already establishes for a structurally
analogous cross-array coverage requirement. Re-derived independently by the gate from raw fields (never
trusting a stored value), same two-layer discipline every sibling module in this package establishes.

``priority`` is a TOTAL 4-value-range lookup over the 9 (likelihood, impact) combinations -- every cell listed
explicitly (no loop-generated entries), same explicit-cell-listing discipline
``stakeholders.power_interest._QUADRANT_BY_LEVELS`` already establishes. Verified via ``inspect.signature`` in
this module's own test suite that neither ``generate_pre_mortem_analysis`` nor the ``failure_cause`` convenience
constructor accepts a ``priority`` parameter -- it is computed, never caller-supplied, at both construction and
gate-re-derivation time.

No numeric field exists anywhere in this record (likelihood/impact/priority/control_type are all closed-set
strings) -- the Python ``bool``-is-``int``-subclass trap this batch's brief flags (a real bug class fixed in
this corpus's own F03 ``lotus_blossom``/``focus_group`` modules) is considered and confirmed NOT APPLICABLE
here, not silently skipped.

Record-level-only provenance (batch-wide decision this whole corpus's F06/F07/F12 builds already use, matching
``insight.jtbd``/``stakeholders.game_theory``/``challenge.red_team``'s own overall-record field) -- no
per-cause or per-control provenance.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "pre_mortem"/"pre-mortem"/
"premortem"/"PreMortemAnalysis" before writing any of this method's own files: zero pre-existing
implementation. ``post-mortem-record.schema.yaml``/``learning.post_mortem`` is a DIFFERENT, unrelated method
(F17 incident-review, read in full first to rule out collision) -- confirmed by name and by content (no
failure_scenario/likelihood/impact/priority/control_type anywhere in it).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.pre_mortem"
RECORD_ID_PREFIX = "PREMORTEM-"

VALID_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH"})
# Atlas §11.25 step 4's own "likelihood x impact 排序" -- the 3-value scale itself is a disclosed compilation
# choice, not Atlas-cited (see method contract OQ-PREMORTEM-1).

VALID_CONTROL_TYPES = frozenset({"PREVENTION", "DETECTION", "RECOVERY"})
# Atlas §11.25 step 5's own 3 named control types, transcribed verbatim.

_CAUSE_INPUT_KEYS = frozenset({"id", "description", "cluster", "likelihood", "impact"})
_CAUSE_STORED_KEYS = _CAUSE_INPUT_KEYS | frozenset({"priority"})
_CONTROL_KEYS = frozenset({"id", "control_type", "description", "addresses_cause_id"})

# Real, TOTAL lookup table (all 9 combinations of the 3 LOW/MEDIUM/HIGH levels): (likelihood, impact) ->
# priority. Every cell listed explicitly (no loop-generated entries), same discipline
# stakeholders.power_interest's own _QUADRANT_BY_LEVELS already establishes. Symmetric in likelihood/impact by
# design (a HIGH-likelihood/LOW-impact cause and a LOW-likelihood/HIGH-impact cause are both MEDIUM) --
# disclosed compilation choice, not Atlas-cited (Atlas names no numeric/ordinal scoring formula for this step).
_PRIORITY_BY_LEVELS: dict[tuple[str, str], str] = {
    ("LOW", "LOW"): "LOW",
    ("LOW", "MEDIUM"): "LOW",
    ("LOW", "HIGH"): "MEDIUM",
    ("MEDIUM", "LOW"): "LOW",
    ("MEDIUM", "MEDIUM"): "MEDIUM",
    ("MEDIUM", "HIGH"): "HIGH",
    ("HIGH", "LOW"): "MEDIUM",
    ("HIGH", "MEDIUM"): "HIGH",
    ("HIGH", "HIGH"): "CRITICAL",
}
assert len(_PRIORITY_BY_LEVELS) == 9, "Pre-mortem priority table must be TOTAL over all 9 LOW/MEDIUM/HIGH combinations"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this package already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def derive_cause_priority(likelihood: str, impact: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning a cause's own (likelihood, impact) into a ``priority``.
    Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) -- neither can drift
    from the other. Raises if either level is outside {LOW, MEDIUM, HIGH} (defense in depth -- by the time this
    is called, the builder/gate shape checks have already confirmed each level is legal)."""
    if likelihood not in VALID_LEVELS or impact not in VALID_LEVELS:
        raise InvariantViolation(f"PREMORTEM_INVALID_LEVEL: likelihood/impact must each be one of {sorted(VALID_LEVELS)}, got likelihood={likelihood!r}, impact={impact!r}")
    return _PRIORITY_BY_LEVELS[(likelihood, impact)]


# --------------------------------------------------------------------------
# Shape validators (keys/types/enum membership only -- NOT the cross-array coverage invariant, checked
# separately below with its own distinct error code).
# --------------------------------------------------------------------------


def _cause_input_shape_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED failure_causes[] entry -- exactly the input keys (NO ``priority``, that field is always
    computed, never accepted), non-empty id/description/cluster, likelihood/impact each a legal level. Called
    only by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _CAUSE_INPUT_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("description")) or not _is_nonempty_str(entry.get("cluster")):
        return False
    return entry.get("likelihood") in VALID_LEVELS and entry.get("impact") in VALID_LEVELS


def _cause_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) failure_causes[] entry -- exactly the stored keys, core fields valid, AND
    ``priority`` must equal the real re-derivation from this entry's own likelihood/impact. Called only by the
    gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _CAUSE_STORED_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("description")) or not _is_nonempty_str(entry.get("cluster")):
        return False
    if entry.get("likelihood") not in VALID_LEVELS or entry.get("impact") not in VALID_LEVELS:
        return False
    return entry.get("priority") == derive_cause_priority(entry["likelihood"], entry["impact"])


def _control_shape_is_valid(entry: Any) -> bool:
    """Exactly the 4 known keys, non-empty id/description/addresses_cause_id, control_type a legal value. Same
    shape for both caller-supplied and stored controls[] entries -- unlike failure_causes[], controls carry no
    computed field."""
    if not isinstance(entry, dict) or set(entry.keys()) != _CONTROL_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("description")) or not _is_nonempty_str(entry.get("addresses_cause_id")):
        return False
    return entry.get("control_type") in VALID_CONTROL_TYPES


# --------------------------------------------------------------------------
# Convenience constructors (NOT the invariant boundary -- generate_pre_mortem_analysis independently
# re-validates everything regardless of how entries were built, same discipline every sibling module in this
# package already establishes).
# --------------------------------------------------------------------------


def failure_cause(cause_id: str, description: str, cluster: str, likelihood: str, impact: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_pre_mortem_analysis``'s own ``failure_causes`` parameter. Deliberately NO
    ``priority`` parameter -- that field is always computed, never accepted (see module docstring)."""
    if not _is_nonempty_str(cause_id) or not _is_nonempty_str(description) or not _is_nonempty_str(cluster):
        raise InvariantViolation(
            f"PREMORTEM_INVALID_CAUSE: id/description/cluster must each be non-empty strings, got id={cause_id!r} description={description!r} cluster={cluster!r}"
        )
    if likelihood not in VALID_LEVELS or impact not in VALID_LEVELS:
        raise InvariantViolation(f"PREMORTEM_INVALID_LEVEL: likelihood/impact must each be one of {sorted(VALID_LEVELS)}, got likelihood={likelihood!r}, impact={impact!r}")
    return {"id": cause_id, "description": description, "cluster": cluster, "likelihood": likelihood, "impact": impact}


def control(control_id: str, control_type: str, description: str, addresses_cause_id: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_pre_mortem_analysis``'s own ``controls`` parameter."""
    if control_type not in VALID_CONTROL_TYPES:
        raise InvariantViolation(f"PREMORTEM_INVALID_CONTROL_TYPE: control_type must be one of {sorted(VALID_CONTROL_TYPES)}, got {control_type!r}")
    if not _is_nonempty_str(control_id) or not _is_nonempty_str(description) or not _is_nonempty_str(addresses_cause_id):
        raise InvariantViolation(
            f"PREMORTEM_INVALID_CONTROL: id/description/addresses_cause_id must each be non-empty strings, got "
            f"id={control_id!r} description={description!r} addresses_cause_id={addresses_cause_id!r}"
        )
    return {"id": control_id, "control_type": control_type, "description": description, "addresses_cause_id": addresses_cause_id}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_pre_mortem_analysis(
    record_id: str,
    failure_scenario: str,
    failure_causes: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pre-mortem-analysis.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then failure_scenario,
    then failure_causes (non-empty, well-shaped, unique ids), then controls (well-shaped, every reference
    resolves to a real cause), and only THEN the real cross-array invariant this method exists to enforce --
    EVERY failure_causes[] entry covered by at least one controls[] entry (Atlas §11.25 step 5's own
    completeness). ``priority`` is ALWAYS computed here via ``derive_cause_priority``, never a parameter, so
    there is no code path through which a caller could construct a record whose stored priority disagrees with
    its own cause's own likelihood/impact.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PREMORTEM_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PREMORTEM_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PREMORTEM_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(failure_scenario):
        raise InvariantViolation(f"PREMORTEM_EMPTY_SCENARIO: failure_scenario must be a non-empty string (Atlas §11.25 step 1: '指定失敗時間點與情境'), got {failure_scenario!r}")

    if not isinstance(failure_causes, list) or not failure_causes:
        raise InvariantViolation(
            f"PREMORTEM_EMPTY_CAUSES: failure_causes must be a non-empty list (a pre-mortem naming zero causes has not run Atlas §11.25's own process), "
            f"got {_shallow_describe(failure_causes)}"
        )
    if not all(_cause_input_shape_is_valid(entry) for entry in failure_causes):
        raise InvariantViolation(
            f"PREMORTEM_INVALID_CAUSE_ENTRY: every failure_causes[] entry must have exactly the keys {sorted(_CAUSE_INPUT_KEYS)} (priority is computed, "
            f"not accepted), non-empty id/description/cluster, and likelihood/impact each in {sorted(VALID_LEVELS)}, got {_shallow_describe(failure_causes)}"
        )
    cause_ids = [entry["id"] for entry in failure_causes]
    duplicate_cause_ids = sorted({cid for cid in cause_ids if cause_ids.count(cid) > 1})
    if duplicate_cause_ids:
        raise InvariantViolation(f"PREMORTEM_DUPLICATE_CAUSE_ID: failure_causes id(s) {duplicate_cause_ids} appear more than once")

    if not isinstance(controls, list) or not all(_control_shape_is_valid(entry) for entry in controls):
        raise InvariantViolation(
            f"PREMORTEM_INVALID_CONTROL_ENTRY: every controls[] entry must have exactly the keys {sorted(_CONTROL_KEYS)}, non-empty "
            f"id/description/addresses_cause_id, and control_type in {sorted(VALID_CONTROL_TYPES)}, got {_shallow_describe(controls)}"
        )

    cause_id_set = set(cause_ids)
    referenced = {entry["addresses_cause_id"] for entry in controls}
    unknown_refs = sorted(referenced - cause_id_set)
    if unknown_refs:
        raise InvariantViolation(f"PREMORTEM_CONTROL_UNKNOWN_CAUSE: controls[] addresses_cause_id {unknown_refs} do not reference any failure_causes[] id in this record")

    # THE real invariant (Atlas §11.25 step 5's own completeness) -- checked LAST, after every other shape/
    # reference check has already passed, so the error message below is always about genuinely well-formed
    # causes/controls that simply fail to cover each other, never a symptom of a malformed entry upstream.
    uncovered = sorted(cause_id_set - referenced)
    if uncovered:
        raise InvariantViolation(
            f"PREMORTEM_UNCOVERED_CAUSE: failure_causes id(s) {uncovered} have no covering controls[] entry -- Atlas §11.25 step 5 ('建 "
            f"prevention/detection/recovery control') requires every named cause to have at least one control"
        )

    rebuilt_causes = [
        {
            "id": entry["id"],
            "description": entry["description"],
            "cluster": entry["cluster"],
            "likelihood": entry["likelihood"],
            "impact": entry["impact"],
            "priority": derive_cause_priority(entry["likelihood"], entry["impact"]),
        }
        for entry in failure_causes
    ]
    rebuilt_controls = [dict(entry) for entry in controls]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "failure_scenario": failure_scenario,
        "failure_causes": rebuilt_causes,
        "controls": rebuilt_controls,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_pre_mortem_analysis -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    No per-cause/per-control provenance to check (record-level-only, see module docstring)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_pre_mortem_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_pre_mortem_analysis``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a covering control spliced out after construction, or a ``priority`` hand-edited to
    disagree with its own likelihood/impact) is caught here exactly as a builder-refused one would have been.
    Fails closed on malformed input rather than crashing -- every check below is a pure boolean predicate, none
    raises."""
    if not isinstance(record, dict):
        return _result("pre_mortem_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("pre_mortem_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("pre_mortem_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("failure_scenario")):
        return _result("pre_mortem_integrity", False, [{"reason": "failure_scenario missing or empty"}], validator, timestamp)

    failure_causes = record.get("failure_causes")
    if not isinstance(failure_causes, list) or not failure_causes or not all(_cause_stored_entry_is_valid(entry) for entry in failure_causes):
        return _result(
            "pre_mortem_integrity",
            False,
            [{"reason": "failure_causes missing, empty, or contains a malformed entry / a priority disagreeing with its own re-derivation"}],
            validator,
            timestamp,
        )
    cause_ids = [entry["id"] for entry in failure_causes]
    if len(cause_ids) != len(set(cause_ids)):
        return _result("pre_mortem_integrity", False, [{"reason": "failure_causes contains duplicate id(s)"}], validator, timestamp)

    controls = record.get("controls")
    if not isinstance(controls, list) or not all(_control_shape_is_valid(entry) for entry in controls):
        return _result("pre_mortem_integrity", False, [{"reason": "controls missing, not a list, or contains a malformed entry"}], validator, timestamp)

    cause_id_set = set(cause_ids)
    referenced = {entry["addresses_cause_id"] for entry in controls}
    unknown_refs = sorted(referenced - cause_id_set)
    uncovered = sorted(cause_id_set - referenced)
    if unknown_refs or uncovered:
        return _result(
            "pre_mortem_integrity",
            False,
            [{"reason": "cause/control cross-reference broken", "unknown_addresses_cause_id": unknown_refs, "uncovered_cause_ids": uncovered}],
            validator,
            timestamp,
        )

    return _result("pre_mortem_integrity", True, [{"cause_count": len(failure_causes), "control_count": len(controls)}], validator, timestamp)


def evaluate_pre_mortem_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-and-coverage integrity re-derivation. No
    ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see module docstring and
    this method's own contract compilation_decisions), same "only emit gates for what is actually declared
    true" discipline every sibling module in this package already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_pre_mortem_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
