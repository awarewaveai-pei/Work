"""``root_cause.change_analysis`` -- seventh member of the `root_cause` family (F05) built (eighth of the
F05 table's 9 rows), after `root_cause.fishbone`, `root_cause.five_whys`, `root_cause.pareto`,
`root_cause.fault_tree`, `root_cause.bow_tie`, and `root_cause.kepner_tregoe`.

Atlas's own F05 tool table Change Analysis row (L441) is a single line: "找故障前後變更 |
before/after→change list→correlation | 快速縮小範圍 | 變更不等於因果" -- no dedicated Atlas section exists
beyond it (grep-confirmed across the Atlas itself; the only other hits, L1109 and L4473, are an
Incident-response routing chain -- "Timeline→Change Analysis→Fault/Fishbone→Barrier→CAPA" -- and a §28
scenario-routing row, both naming "Change Analysis" as one applicable method among several, not a protocol
section). Same table-row-only sourcing class as `root_cause.fault_tree`. A grep of all THREE normative
documents (not the Atlas alone) turned up a second, independent confirmation: Execution Contract §55
"Incident Mode" (L1888-1919) places "Change Analysis" right after "Current-state Reconstruction" and right
before "Root Cause Hypotheses" in its own real incident-response pipeline -- the `baseline` field below is
that "Current-state Reconstruction" step's own before/after output, and `recommended_next`
(`root_cause.fishbone` -- whose own declared output IS `CauseHypothesisSet`) is that "Root Cause Hypotheses"
step made concrete.

DUE DILIGENCE (mandatory before designing this module): this suite already has a dedicated
correlation-vs-causation discipline for a DIFFERENT method -- `causal.dag` (`ai_lego/modules/causal/dag.py`,
read in full). That module's own `evaluate_evidence_labeling_required_gate` docstring cites Atlas L1683
verbatim: "don't silently write correlation as causation". Change Analysis's own F05 misuse warning --
"變更不等於因果" (a change is not the same as causation) -- is the SAME principle applied to a DIFFERENT
method shape: `causal.dag` is a causal-role GRAPH (nodes typed TREATMENT/OUTCOME/CONFOUNDER/MEDIATOR/COLLIDER,
directed edges as causal hypotheses); Change Analysis is a flat, ranked LIST of discrete before/after deltas
against one observed fault, with no causal-role vocabulary at all. Re-skinning `causal.dag`'s graph shape onto
Change Analysis would invent structure Atlas never describes for this method (L441 gives a linear pipeline,
"before/after→change list→correlation", not a graph) -- so this module is a genuinely distinct third shape,
informed by but not copied from either `causal/dag.py` or `fault_tree.py`.

THE MISUSE-GUARD DESIGN DECISION (Atlas's own "變更不等於因果" operationalized): of the concrete mechanisms
available -- a forbidden field, a required per-change "correlation only" disclosure, an explicit
`forbidden_transition` naming an "unqualified causal claim", or making the schema itself structurally
incapable of asserting causation -- this module combines the LAST with a runtime echo of the FIRST, not
either alone:

* STRUCTURAL (the schema layer, `change-analysis-record.schema.yaml`): no `caused_by`/`root_cause`/
  `confirmed_cause`/`causal_link` field is DEFINED anywhere in the type. A change entry may only carry
  `correlation_strength` (closed qualitative enum) and `temporal_proximity` (closed qualitative enum) --
  neither can express causation, only how closely and how strongly a change co-occurred with the fault.
  `additionalProperties: false` makes adding such a field a schema violation.
* RUNTIME (this module, `_FORBIDDEN_CAUSAL_CLAIM_KEYS`): a bare Python dict has no static type enforcement --
  a caller can trivially do ``entry["caused_by"] = "..."`` even though the "official" schema shape never
  defined such a key. Relying on schema absence ALONE would violate this family's own established discipline
  ("never trust structure, always re-derive/verify" -- the same reasoning `fault_tree.py`'s own
  `_gate_shape_is_valid`'s exact-key-set check already applies to its own family). So
  `generate_change_analysis_record` AND `evaluate_change_analysis_integrity_gate` BOTH independently check
  every `changes[]` entry's own raw keys against an explicit denylist, raising/failing with
  `CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD` and citing Atlas L441 by name -- not merely relying on the
  fact that such a key would ALSO incidentally fail the generic shape check (which it would, but with a
  generic, non-diagnostic message).

A genuinely ASYMMETRIC property falls out of this design, not merely a mirrored one:
`generate_change_analysis_record`'s signature is explicit keyword arguments (no ``**kwargs``), so a caller
going through the real constructor can NEVER inject a top-level forbidden key onto the RECORD itself (only
onto a `changes[]` entry, which IS reachable through the `changes: list[dict]` parameter). The record-level
half of this same guard is therefore reachable ONLY by hand-building the whole record dict directly and
calling `evaluate_change_analysis_integrity_gate` on it -- a real demonstration of why the independent gate
matters, not a symmetric belt-and-suspenders repeat of the construction-time check.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream write"
/ "re-derive, don't trust" two-layer discipline every prior module in this package uses):

1. **The misuse guard** (`CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD`): described above.
2. **Before/after completeness** (`CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY`, plus its own genuinely distinct
   sibling `CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY`): Atlas's own L441 formula is literally
   "before/after→change list" -- every entry in that list must carry BOTH sides. An entry missing either
   `before_state` or `after_state` (or carrying one as an empty/whitespace-only string) is an unqualified
   observation, not a change (`CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY`). An entry where both sides are
   present but IDENTICAL describes no actual difference at all -- a genuinely distinct bug class, not merely
   a lesser case of the first (`CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY`).

Both are fail-closed on malformed input throughout: every predicate here is an `isinstance` guard plus safe
`.get()` access, matching `root_cause.fault_tree.py`'s own current best-practice pattern for this family --
never a bare `record["key"]` on caller-supplied data whose shape has not already been confirmed.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.change_analysis"
RECORD_ID_PREFIX = "CHANGEANALYSIS-"

# Ordinal maps double as the closed-enum membership sets (frozenset(dict) iterates keys) AND as the sort key
# `rank_changes_by_correlation` uses -- one definition, not two that could drift apart.
CORRELATION_STRENGTH_ORDER = {"NONE": 0, "WEAK": 1, "MODERATE": 2, "STRONG": 3}
TEMPORAL_PROXIMITY_ORDER = {"CONCURRENT": 0, "IMMEDIATELY_BEFORE": 1, "SHORTLY_BEFORE": 2, "DISTANT_BEFORE": 3, "AFTER_FAULT": 4}
# AFTER_FAULT sorts LAST: a change made after the fault was already observed cannot have TRIGGERED it, even
# though it may still legitimately correlate for some other reason (e.g. it made the incident worse) -- see
# change-analysis-record.schema.yaml's own temporal_proximity field description.
VALID_CORRELATION_STRENGTH = frozenset(CORRELATION_STRENGTH_ORDER)
VALID_TEMPORAL_PROXIMITY = frozenset(TEMPORAL_PROXIMITY_ORDER)

# The misuse-guard denylist. Not exhaustive of every conceivable causal-claim phrasing (an adversarial
# caller could invent a fresh synonym) -- it is a real, named, testable guard against the concrete field
# names a caller migrating from `root-cause-fact.schema.yaml` or `cause-hypothesis-set.schema.yaml`'s own
# vocabulary would plausibly reach for, not a claim of semantic completeness over natural language.
FORBIDDEN_CAUSAL_CLAIM_KEYS = frozenset({"caused_by", "root_cause", "is_root_cause", "confirmed_cause", "causal_link", "cause", "is_cause", "causation", "causes"})

_KNOWN_CHANGE_ENTRY_KEYS_REQUIRED = frozenset({"id", "description", "before_state", "after_state", "temporal_proximity", "correlation_strength", "provenance"})
_KNOWN_CHANGE_ENTRY_KEYS_ALL = _KNOWN_CHANGE_ENTRY_KEYS_REQUIRED | frozenset({"supporting_evidence_refs"})
_KNOWN_BASELINE_KEYS = frozenset({"before_state", "after_state"})
# Closed top-level key set (critic finding, 2026-09-07): the denylist-only top-level check below only
# catches LITERALLY-spelled forbidden keys (`caused_by`, `root_cause`, ...) -- a differently-spelled
# smuggled claim (`causedBy`, `root_causes`, any adversarial synonym not on the finite denylist) previously
# passed this gate silently when called standalone (without the schema layer's own `additionalProperties:
# false` also running as a backstop). An exact key-set check closes this the same way the entry-level shape
# check already does -- not by trying to out-guess every possible spelling, but by refusing ANY key this
# record type does not itself define.
_KNOWN_RECORD_KEYS = frozenset({"id", "version", "generated_by_method", "system_under_analysis", "fault_description", "baseline", "changes", "provenance"})


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


def _forbidden_causal_keys_present(entry: Any) -> frozenset[str]:
    """The misuse-guard predicate: which denylisted causal-claim keys (if any) does this raw dict carry.
    Returns an empty frozenset for non-dict input (fail-closed elsewhere already handles a non-dict entry;
    this predicate simply has nothing to report for it)."""
    if not isinstance(entry, dict):
        return frozenset()
    return frozenset(entry.keys()) & FORBIDDEN_CAUSAL_CLAIM_KEYS


def _change_entry_shape_is_valid(entry: Any) -> bool:
    """Shape only (keys, types, enum membership) -- does NOT check before/after completeness or degeneracy
    (see ``_change_entry_before_after_incomplete``/``_change_entry_is_degenerate``, each its own distinct
    invariant with its own error code) and does NOT check ``provenance`` content validity (that is
    ``evaluate_provenance_required_gate``'s own job, same split every sibling module in this family uses --
    construction never re-implements the provenance gate, it only confirms a ``provenance`` dict exists)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _KNOWN_CHANGE_ENTRY_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_CHANGE_ENTRY_KEYS_ALL):
        return False
    if not _is_nonempty_str(entry["id"]) or not _is_nonempty_str(entry["description"]):
        return False
    if not isinstance(entry["before_state"], str) or not isinstance(entry["after_state"], str):
        return False
    if entry["temporal_proximity"] not in VALID_TEMPORAL_PROXIMITY:
        return False
    if entry["correlation_strength"] not in VALID_CORRELATION_STRENGTH:
        return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    if "supporting_evidence_refs" in entry and not isinstance(entry["supporting_evidence_refs"], list):
        return False
    return True


def _change_entry_before_after_incomplete(entry: dict[str, Any]) -> bool:
    """Invariant #2a. Precondition: ``entry`` has already passed ``_change_entry_shape_is_valid`` (so
    ``before_state``/``after_state`` are confirmed to be ``str`` and ``.strip()`` cannot raise)."""
    return not entry["before_state"].strip() or not entry["after_state"].strip()


def _change_entry_is_degenerate(entry: dict[str, Any]) -> bool:
    """Invariant #2b, genuinely distinct from #2a: both sides are present and non-empty, but IDENTICAL --
    an entry claiming to be a 'change' that names no actual difference. Precondition: ``entry`` has already
    passed the completeness check (both sides non-empty after ``.strip()``)."""
    return entry["before_state"].strip() == entry["after_state"].strip()


def _baseline_is_valid(baseline: Any) -> bool:
    if not isinstance(baseline, dict) or set(baseline.keys()) != _KNOWN_BASELINE_KEYS:
        return False
    return _is_nonempty_str(baseline.get("before_state")) and _is_nonempty_str(baseline.get("after_state"))


def change_entry(
    entry_id: str,
    description: str,
    before_state: str,
    after_state: str,
    temporal_proximity: str,
    correlation_strength: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """Convenience constructor for one ``changes[]`` entry -- emits ONLY known-good keys, so a caller
    building a legitimate entry through this helper can never accidentally smuggle in a forbidden
    causal-claim field. Not itself an invariant boundary -- the real check happens inside
    ``generate_change_analysis_record``, which validates whatever dict it is handed regardless of how it
    was built (the mutation/hand-tampering tests build entries directly, bypassing this helper, to prove the
    constructor itself -- not merely this convenience wrapper -- is what enforces the invariants)."""
    record: dict[str, Any] = {
        "id": entry_id,
        "description": description,
        "before_state": before_state,
        "after_state": after_state,
        "temporal_proximity": temporal_proximity,
        "correlation_strength": correlation_strength,
        "provenance": provenance,
    }
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_change_analysis_record(
    record_id: str,
    system_under_analysis: str,
    fault_description: str,
    baseline: dict[str, Any],
    changes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/change-analysis-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/version/system_under_analysis/fault_description/baseline
    shape, changes list shape, then PER ENTRY -- the misuse guard FIRST (its own specific, diagnostic error
    message, not merely the generic shape check's incidental catch of the same malformed key), then generic
    shape, then before/after completeness, then non-degeneracy, then cross-entry id uniqueness. REBUILDS
    every nested list/dict it owns; ``provenance`` is stored by reference, the same family-wide convention
    every prior module in this package already follows.

    Deliberately does NOT check ``provenance`` content validity here (only that a ``provenance`` dict is
    present, via ``_change_entry_shape_is_valid``) -- ``evaluate_provenance_required_gate`` is the one real
    check, same split every sibling module in this family already uses."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CHANGEANALYSIS_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CHANGEANALYSIS_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(system_under_analysis):
        raise InvariantViolation(f"CHANGEANALYSIS_EMPTY_RECORD_FIELD: system_under_analysis must be a non-empty string, got {system_under_analysis!r}")
    if not _is_nonempty_str(fault_description):
        raise InvariantViolation(f"CHANGEANALYSIS_EMPTY_RECORD_FIELD: fault_description must be a non-empty string, got {fault_description!r}")
    if not _baseline_is_valid(baseline):
        raise InvariantViolation(
            f"CHANGEANALYSIS_INVALID_BASELINE: baseline must be a dict with exactly 'before_state'/'after_state', both non-empty strings, got {_shallow_describe(baseline)}"
        )
    if not isinstance(changes, list) or not changes:
        raise InvariantViolation(f"CHANGEANALYSIS_INVALID_CHANGES: changes must be a non-empty list, got {_shallow_describe(changes)}")

    seen_ids: set[str] = set()
    for entry in changes:
        forbidden = _forbidden_causal_keys_present(entry)
        if forbidden:
            raise InvariantViolation(
                f"CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD: change entry carries denylisted causal-claim key(s) "
                f"{sorted(forbidden)} (Atlas F05 L441 '變更不等於因果' -- change is not the same as causation; only "
                f"correlation_strength/temporal_proximity descriptors are legal), entry={_shallow_describe(entry)}"
            )
        if not _change_entry_shape_is_valid(entry):
            raise InvariantViolation(
                f"CHANGEANALYSIS_INVALID_CHANGE_ENTRY: changes[] entry must be a well-shaped dict (id/description "
                f"non-empty strings, before_state/after_state strings, temporal_proximity in {sorted(VALID_TEMPORAL_PROXIMITY)}, "
                f"correlation_strength in {sorted(VALID_CORRELATION_STRENGTH)}, provenance a dict), got {_shallow_describe(entry)}"
            )
        if _change_entry_before_after_incomplete(entry):
            raise InvariantViolation(
                f"CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY: change entry {entry['id']!r} must carry both a non-empty "
                f"before_state and a non-empty after_state (Atlas F05 L441 'before/after→change list' -- an entry "
                f"with only one side is an unqualified observation, not a change)"
            )
        if _change_entry_is_degenerate(entry):
            raise InvariantViolation(
                f"CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY: change entry {entry['id']!r} has identical before_state "
                f"and after_state ({entry['before_state']!r}) -- this describes no actual change"
            )
        if entry["id"] in seen_ids:
            raise InvariantViolation(f"CHANGEANALYSIS_DUPLICATE_CHANGE_ID: change id {entry['id']!r} is used more than once in changes[]")
        seen_ids.add(entry["id"])

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_analysis": system_under_analysis,
        "fault_description": fault_description,
        "baseline": dict(baseline),
        "changes": [dict(entry, supporting_evidence_refs=list(entry["supporting_evidence_refs"])) if "supporting_evidence_refs" in entry else dict(entry) for entry in changes],
        "provenance": provenance,
    }


def rank_changes_by_correlation(record: dict[str, Any]) -> list[str]:
    """Real, GENUINE compute (recomputed fresh every call, never a stored field) operationalizing Atlas
    L441's own '快速縮小範圍' (quickly narrow the scope) benefit: returns ``changes[].id`` ranked by
    plausibility as the change responsible for the fault.

    PRIMARY partition: every temporally-plausible entry (anything but ``AFTER_FAULT``) outranks every
    ``AFTER_FAULT`` entry, REGARDLESS of either one's own ``correlation_strength`` -- a change made after the
    fault was already observed cannot have TRIGGERED it, so even a caller-claimed STRONG correlation on an
    ``AFTER_FAULT`` entry must not let it outrank a genuinely pre-fault candidate (this is the mechanical
    form of the ``temporal_proximity`` field's own schema description, not a separate invented rule).
    Within each partition: ``correlation_strength`` descending, ties broken by ``temporal_proximity``
    ascending (closest-to-the-fault first), final ties broken by id for a fully deterministic order. Does
    not mutate the record.

    SCOPE: performs ONLY the ranking computation over an ALREADY-VALID record -- shape/completeness/
    non-degeneracy are the caller's own responsibility (``generate_change_analysis_record`` /
    ``evaluate_change_analysis_integrity_gate`` already prove all three before this function is meant to
    run); it does not re-validate and will raise a bare ``KeyError``/``TypeError`` on a malformed record,
    the same scope split ``ai_lego.modules.root_cause.fault_tree.evaluate_top_event`` establishes for its
    own family."""
    changes = record["changes"]
    return [
        c["id"]
        for c in sorted(
            changes,
            key=lambda c: (c["temporal_proximity"] == "AFTER_FAULT", -CORRELATION_STRENGTH_ORDER[c["correlation_strength"]], TEMPORAL_PROXIMITY_ORDER[c["temporal_proximity"]], c["id"]),
        )
    ]


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance AND every ``changes[]``
    entry's own provenance are schema-valid. Fails closed on a non-dict record or a non-list ``changes``."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    changes = record.get("changes")
    entries = changes if isinstance(changes, list) else []
    invalid_entry_ids = [e.get("id") if isinstance(e, dict) else None for e in entries if not (isinstance(e, dict) and provenance_is_valid(e.get("provenance")))]
    passed = record_provenance_valid and bool(entries) and not invalid_entry_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "entries_checked": len(entries), "invalid_provenance_entry_ids": invalid_entry_ids}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- Atlas L1683 (via ``causal.dag``'s own
    identical-purpose gate, the most on-point precedent for this method's own misuse warning): don't
    silently write correlation as causation. An entry claiming the EVIDENCE label must actually cite
    ``supporting_evidence_refs``; an unlabeled or unbacked STRONG/MODERATE correlation claim is exactly the
    kind of overclaim Atlas F05 L441 warns against, even though it never asserts causation outright."""
    if not isinstance(record, dict):
        return _result("evidence_labeling_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    changes = record.get("changes")
    entries = changes if isinstance(changes, list) else []
    problems: list[dict[str, Any]] = []
    for e in entries:
        if not isinstance(e, dict):
            problems.append({"id": None, "reason": "entry is not a dict"})
            continue
        provenance = e.get("provenance")
        epistemic_type = provenance.get("epistemic_type") if isinstance(provenance, dict) else None
        if epistemic_type is None:
            problems.append({"id": e.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not e.get("supporting_evidence_refs"):
            problems.append({"id": e.get("id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(entries) and not problems
    return _result("evidence_labeling_required", passed, [{"entries_checked": len(entries), "problems": problems}], validator, timestamp)


def evaluate_change_analysis_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored consistency. Bundles every structural reason under one ``gate_id`` (same shape
    ``evaluate_fault_tree_integrity_gate`` already uses for its own family), each with its own
    distinguishable evidence ``reason`` so a failure always names the specific bug class. FAILS CLOSED on
    malformed input rather than crashing.

    This is the ONLY place that checks the RECORD's OWN top-level keys for a denylisted causal-claim field --
    ``generate_change_analysis_record``'s own explicit keyword-only signature (no ``**kwargs``) makes it
    structurally impossible for a caller going through the real constructor to ever inject a top-level
    forbidden key; the only way to produce one is to hand-build the whole record dict directly and call this
    gate on it, which is exactly the "re-derive, never trust" scenario this gate exists for. Checks an exact
    closed key set (``_KNOWN_RECORD_KEYS``), same discipline the entry-level shape check already applies --
    NOT only the named causal-claim denylist -- so a differently-spelled smuggled claim (``causedBy``,
    ``root_causes``, any synonym not on the finite denylist) is rejected as an unknown key even when it
    evades the denylist by spelling alone, and even when this gate is called standalone without the schema
    layer's own ``additionalProperties: false`` also running as a backstop (critic finding, 2026-09-07)."""
    if not isinstance(record, dict):
        return _result("change_analysis_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    # Subsumes the old denylist-only top-level check: every FORBIDDEN_CAUSAL_CLAIM_KEYS entry is by
    # definition absent from _KNOWN_RECORD_KEYS, so a literally-spelled denylisted key is caught here too --
    # a separate denylist-only branch below this point would be unreachable dead code.
    unknown_top_level_keys = frozenset(record.keys()) - _KNOWN_RECORD_KEYS
    if unknown_top_level_keys:
        return _result(
            "change_analysis_integrity",
            False,
            [{"reason": "record carries an unknown top-level key (may be a differently-spelled causal claim, or any other unrecognized field)", "keys": sorted(unknown_top_level_keys)}],
            validator,
            timestamp,
        )

    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("change_analysis_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("change_analysis_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_under_analysis")):
        return _result("change_analysis_integrity", False, [{"reason": "system_under_analysis missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("fault_description")):
        return _result("change_analysis_integrity", False, [{"reason": "fault_description missing or empty"}], validator, timestamp)
    if not _baseline_is_valid(record.get("baseline")):
        return _result("change_analysis_integrity", False, [{"reason": "baseline missing, malformed, or has an empty before_state/after_state"}], validator, timestamp)

    changes = record.get("changes")
    if not isinstance(changes, list) or not changes:
        return _result("change_analysis_integrity", False, [{"reason": "changes missing, empty, or not a list"}], validator, timestamp)

    seen_ids: set[str] = set()
    for entry in changes:
        entry_forbidden = _forbidden_causal_keys_present(entry)
        if entry_forbidden:
            return _result(
                "change_analysis_integrity",
                False,
                [{"reason": "a changes[] entry carries a denylisted causal-claim field", "keys": sorted(entry_forbidden), "entry_id": entry.get("id") if isinstance(entry, dict) else None}],
                validator,
                timestamp,
            )
        if not _change_entry_shape_is_valid(entry):
            return _result(
                "change_analysis_integrity",
                False,
                [{"reason": "a changes[] entry is malformed (unknown/missing key, wrong type, or illegal enum value)", "entry": _shallow_describe(entry)}],
                validator,
                timestamp,
            )
        if _change_entry_before_after_incomplete(entry):
            return _result("change_analysis_integrity", False, [{"reason": "a changes[] entry is missing a non-empty before_state or after_state", "entry_id": entry["id"]}], validator, timestamp)
        if _change_entry_is_degenerate(entry):
            return _result(
                "change_analysis_integrity", False, [{"reason": "a changes[] entry has identical before_state and after_state (not an actual change)", "entry_id": entry["id"]}], validator, timestamp
            )
        if entry["id"] in seen_ids:
            return _result("change_analysis_integrity", False, [{"reason": "duplicate change id", "entry_id": entry["id"]}], validator, timestamp)
        seen_ids.add(entry["id"])

    return _result("change_analysis_integrity", True, [{"change_count": len(changes), "correlation_ranked_ids": rank_changes_by_correlation(record)}], validator, timestamp)


def evaluate_change_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_change_analysis_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
