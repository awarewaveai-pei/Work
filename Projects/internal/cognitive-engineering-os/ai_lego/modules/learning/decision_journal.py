"""``learning.decision_journal`` -- ninth Method Atlas slice, second member of the `learning` family (F17),
after `learning.reversal_criteria`. Builds instances of ``typed-objects/decision-journal-entry.schema.yaml``.

Atlas F17 table row (L806): "Decision Journal | 記錄當時資訊與信心 |
context/options/evidence/forecast/confidence | 防 hindsight bias", plus a
short dedicated section, §12.36 (L3015-3025): capture context/evidence/
options/confidence WHILE the outcome is still unknown, specifically to
prevent hindsight bias, enable Prediction-vs-Reality comparison, and train
organizational decision calibration.

TWO real, independently-enforced invariants (construction AND gate, same
"raise before any downstream write" / "re-derive, don't trust" two-layer
discipline every prior module in this package uses):

1. **Genuine decision, not a decision log** (`DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED`,
   subsuming insufficient-options / duplicate-id / wrong-chosen-count): Atlas
   names `options` (plural). A record with only one recorded option was
   never actually a decision -- there was nothing to choose between. At
   least 2 options are required, and exactly one must be marked `chosen`.

2. **Hindsight-bias structural immutability** -- the actual due-diligence
   finding driving this module's design, documented in full below.

DUE DILIGENCE (existing-infrastructure search performed BEFORE writing any
new mechanism, per this session's own brief): grepped `ai_lego/` and the
whole Method Atlas doc root for "immutable"/"frozen"/"write-once"/
"append-only"/"tamper".

* ``ai_lego/data/events/event_ledger.py`` (Master Plan §57) IS a real
  append-only mechanism -- literally "There is no update or delete API" --
  but it is the EXECUTION event ledger (JSONL file, `SyntheticClock`,
  tenant/aggregate sequencing, `EventLedger.__init__` refuses a non-empty
  path). It is a different subsystem every sibling builder+gate module in
  this package (`fault_tree`, `reversal_criteria`, `swot`, ...) already
  stays independent of -- none of them take a ledger dependency to do their
  own construction-time validation. Depending on it here, for this method
  alone, would be new architectural coupling on a single call site, not
  reuse of an established per-module pattern. The CLI slice below still
  APPENDS this method's outputs to a caller-owned ledger, same as every
  sibling slice -- that is the right layer for ledger involvement, not
  inside the builder module itself.
* ``specs/governance/epistemic-label.schema.yaml``'s `locked` axis
  (`LOCKED_DECISION`, legal only when `epistemic_type == DECISION`) is the
  closest NAMED concept -- "content with locked != null MUST NOT be
  modified by AI" (EC §57). But grepped: no consumer in this repository
  branches on `locked` to actually refuse a write; it is a POLICY flag the
  schema declares for human/AI process discipline, not a structural,
  independently re-derivable, tamper-evident mechanism a hand-edited dict
  could be checked against. It does not by itself satisfy this session's
  own requirement: "the gate independently verifies forecast/confidence
  are unchanged". `provenance.locked` is still set to `LOCKED_DECISION` by
  this module's own CLI demo (a real, honest use of the existing axis for
  what it already legitimately means), but a NEW mechanism was still
  required for genuine structural enforcement.

DECISION: neither existing mechanism fits without modification, so this
module adds one narrowly-scoped, genuinely new mechanism, grounded
directly in Atlas §12.36's own wording, reusing primitives
``ai_lego/core/support.py`` already provides for exactly this
"detect any change to a value" purpose (`sha256_json`/`canonical_json`,
already used elsewhere in this package -- e.g. `stable_id` -- for a
different application of the same primitive):

* At stage-1 construction (`generate_decision_journal_entry`), a
  `stage1_integrity_hash` is computed over EXACTLY Atlas L806's own 5
  named pipeline elements (`context`, `options`, `evidence`, `forecast`,
  `confidence`) and stored on the record.
* Attaching an outcome is a SEPARATE function, `record_outcome`, whose
  signature structurally CANNOT set `context`/`options`/`evidence`/
  `forecast`/`confidence` -- it has no parameters for them. It copies the
  input entry's own stage-1 fields forward verbatim into a freshly-built
  dict. Stage-1 tampering through the sanctioned API is a TypeError
  (wrong/missing argument), not a runtime possibility.
* `record_outcome` ALSO independently re-verifies
  (`DECISIONJOURNAL_STAGE1_HASH_MISMATCH`) that the entry it was handed
  still hashes to its own stored `stage1_integrity_hash` before it will
  attach anything -- refuses to build an outcome onto an already-tampered
  foundation.
* An entry accepts exactly one outcome, ever
  (`DECISIONJOURNAL_OUTCOME_ALREADY_RECORDED`) -- no revising a recorded
  outcome after the fact either, the same discipline applied one level up.
* Once attached, the outcome itself gets the SAME treatment
  (`outcome_integrity_hash`), so a second-order tamper -- editing the
  RECORDED outcome after the fact to make an original forecast look more
  accurate in hindsight -- is equally caught.
* `evaluate_hindsight_bias_integrity_gate` re-derives BOTH hashes fresh
  from the record's own raw fields on every call: the actual independent,
  re-derive-don't-trust check this package's other gates (e.g.
  `root_cause.fault_tree.evaluate_fault_tree_integrity_gate`) already
  establish as house style. A hand-edited dict that skips
  `generate_decision_journal_entry`/`record_outcome` entirely and pokes
  ``record["confidence"] = 99`` directly is caught HERE, independent of
  whether an outcome has ever been attached -- there is no second
  construction call to intercept a bare hand-edit.

Divergence from every sibling list-bearing module, DISCLOSED not
accidental: `evidence` may legally be an EMPTY list. Every sibling
(`fault_tree.basic_events`, `reversal_criteria.criteria`, `swot.factors`)
requires its own core list non-empty, because an empty list there means
"nothing was produced" (a meaningless output). A Decision Journal entry
recording that a decision was made on genuinely scant evidence is real,
honestly-recordable content -- arguably the single most useful entry for
this method's own stated purpose (calibration training benefits most from
seeing "confident, but on thin evidence" cases, not just seeing "gathered
lots of evidence" cases).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import EPISTEMIC_TYPES, provenance_is_valid
from ai_lego.core.support import sha256_json
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.decision_journal"
RECORD_ID_PREFIX = "DJ-"

# Atlas L806's own 5 named pipeline elements, minus `confidence`'s sibling
# fields that are NOT part of the hindsight-bias-relevant payload (id/
# version/decision_ref are identifiers/cross-references, not decision-time
# content a hindsight-biased actor would be tempted to retroactively
# flatter). See module docstring's DECISION section. The record's own
# top-level `provenance` (as opposed to each evidence item's OWN nested
# provenance, which IS covered -- it lives inside the hashed `evidence`
# field) is excluded for the same reason: it is not one of Atlas L806's 5
# named elements, and it is metadata about who filed the entry, not
# decision-time content someone could retroactively flatter (critic
# finding, 2026-09-07 -- named explicitly here to remove the ambiguity of a
# silent omission for a future maintainer deciding whether to extend the
# hash payload).
STAGE1_HASHED_FIELDS = ("context", "options", "evidence", "forecast", "confidence")
OUTCOME_HASHED_FIELDS = ("actual_result", "recorded_at")

_KNOWN_OPTION_KEYS = frozenset({"id", "description", "chosen"})
_KNOWN_EVIDENCE_KEYS_REQUIRED = frozenset({"id", "content", "provenance"})
_KNOWN_EVIDENCE_KEYS_ALL = frozenset({"id", "content", "provenance", "source"})
_KNOWN_OUTCOME_KEYS = frozenset({"actual_result", "provenance", "recorded_at", "outcome_integrity_hash"})
_KNOWN_ENTRY_KEYS = frozenset(
    {"id", "version", "generated_by_method", "decision_ref", "context", "options", "evidence", "forecast", "confidence", "provenance", "outcome", "stage1_integrity_hash"}
)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a raw recursive ``repr()`` over caller-
    supplied input of unknown size, same discipline ``root_cause.fault_tree._shallow_describe`` establishes
    (a bare recursive repr in an error path is itself a small denial-of-service surface)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_confidence(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``fault_tree._is_valid_probability`` uses for its own [0,1]
    field: a percentage in [0, 100], never a bool silently passing an ``isinstance(value, (int, float))``
    check as if it were 0/100, never a non-finite value (not valid RFC 8259 JSON either)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 100


# --------------------------------------------------------------------------
# Convenience constructors (NOT the invariant boundary -- generate_decision_journal_entry validates
# whatever it is handed regardless of how each item was built, same division of labor
# fault_tree.basic_event/gate and swot.swot_factor already establish).
# --------------------------------------------------------------------------


def option(option_id: str, description: str, chosen: bool) -> dict[str, Any]:
    """Convenience constructor for one ``options[]`` entry."""
    if not _is_nonempty_str(option_id) or not _is_nonempty_str(description):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_OPTION_FIELD: option id/description must be non-empty strings, got id={option_id!r} description={description!r}")
    if not isinstance(chosen, bool):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_CHOSEN_FLAG: chosen must be a bool, got {chosen!r}")
    return {"id": option_id, "description": description, "chosen": chosen}


def evidence_item(item_id: str, content: str, provenance: dict[str, Any], *, source: str | None = None) -> dict[str, Any]:
    """Convenience constructor for one ``evidence[]`` entry. ``source`` is required by
    ``evaluate_evidence_labeling_required_gate`` specifically when ``provenance.epistemic_type ==
    'SOURCE_FACT'`` -- the strongest possible epistemic claim needs the clearest attribution, same
    discipline ``strategy.swot.swot_factor``'s own ``source`` field establishes for a different method."""
    if not _is_nonempty_str(item_id) or not _is_nonempty_str(content):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_EVIDENCE_FIELD: evidence id/content must be non-empty strings, got id={item_id!r} content={content!r}")
    record: dict[str, Any] = {"id": item_id, "content": content, "provenance": provenance}
    if source is not None:
        record["source"] = source
    return record


# --------------------------------------------------------------------------
# Invariant #1 (genuine decision): one predicate, two callers (construction raise + independent gate),
# same shape fault_tree's own _gate_mode_is_consistent / _referential_integrity_violations establish.
# --------------------------------------------------------------------------


def _option_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_OPTION_KEYS:
        return False
    if not _is_nonempty_str(item["id"]) or not _is_nonempty_str(item["description"]):
        return False
    return isinstance(item["chosen"], bool)


def _options_are_valid(options: Any) -> bool:
    return isinstance(options, list) and all(_option_shape_is_valid(o) for o in options)


def _options_invariant_violations(options: list[dict[str, Any]]) -> list[str]:
    """Precondition: ``options`` has already passed ``_options_are_valid`` (every item is well-shaped) --
    same precondition discipline ``fault_tree._gate_mode_is_consistent`` documents for itself."""
    violations: list[str] = []
    if len(options) < 2:
        violations.append(f"only {len(options)} option(s) supplied; a decision needs the chosen option plus at least one real alternative (>= 2 total)")
    ids = [o["id"] for o in options]
    if len(set(ids)) != len(ids):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        violations.append(f"duplicate option id(s): {duplicates}")
    chosen_count = sum(1 for o in options if o["chosen"])
    if chosen_count != 1:
        violations.append(f"exactly one option must be marked chosen=true, found {chosen_count}")
    return violations


def _evidence_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    keys = set(item.keys())
    if not _KNOWN_EVIDENCE_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_EVIDENCE_KEYS_ALL):
        return False
    if not _is_nonempty_str(item["id"]) or not _is_nonempty_str(item["content"]):
        return False
    if not isinstance(item["provenance"], dict):
        # A non-dict provenance is definitionally malformed shape (provenance_is_valid's own first check is
        # the same isinstance test) -- catching it HERE, not only when evaluate_provenance_required_gate
        # eventually runs, closes a real construction-time crash: without this, a non-JSON-serializable
        # provenance value (e.g. a caller accidentally passing a set) would reach _compute_stage1_hash
        # uncaught. See _safe_compute_hash's own docstring for the residual defense-in-depth layer.
        return False
    if "source" in item and item["source"] is not None and not isinstance(item["source"], str):
        return False
    return True


def _evidence_is_valid(evidence: Any) -> bool:
    """EMPTY is legal here -- see module docstring's disclosed divergence from every sibling list field."""
    return isinstance(evidence, list) and all(_evidence_shape_is_valid(e) for e in evidence)


# --------------------------------------------------------------------------
# Invariant #2 (hindsight-bias structural immutability): the tamper-evidence hash primitives.
# --------------------------------------------------------------------------


def _stage1_snapshot(entry: dict[str, Any]) -> dict[str, Any]:
    return {field: entry.get(field) for field in STAGE1_HASHED_FIELDS}


def _compute_stage1_hash(entry: dict[str, Any]) -> str:
    return sha256_json(_stage1_snapshot(entry))


def _outcome_snapshot(outcome: dict[str, Any]) -> dict[str, Any]:
    return {field: outcome.get(field) for field in OUTCOME_HASHED_FIELDS}


def _compute_outcome_hash(outcome: dict[str, Any]) -> str:
    return sha256_json(_outcome_snapshot(outcome))


def _safe_compute_hash(compute: Any, value: dict[str, Any]) -> str | None:
    """Fail-closed wrapper around a hash computation for GATE use only (construction call sites never need
    this: by the time ``generate_decision_journal_entry``/``record_outcome`` reach their own hash
    computation, upstream shape validation has already guaranteed every hashed field is a JSON-safe type).
    A gate re-derives from RAW, potentially hand-tampered fields with no such guarantee -- a tampered value
    that is not JSON-serializable at all (e.g. a Python ``set`` poked directly into ``record["confidence"]``)
    must fail the gate, not crash it. Returns ``None`` (never a valid hash) on any serialization failure."""
    try:
        return compute(value)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def generate_decision_journal_entry(
    entry_id: str,
    context: str,
    options: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    forecast: str,
    confidence: float,
    provenance: dict[str, Any],
    *,
    decision_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/decision-journal-entry.schema.yaml``, STAGE 1 (before any outcome is
    known). Enforces invariant #1 (>= 2 options, unique ids, exactly one chosen) fail-closed, then computes
    and stores ``stage1_integrity_hash`` over exactly Atlas L806's own 5 named elements -- the tamper-
    evidence checkpoint ``record_outcome``/``evaluate_hindsight_bias_integrity_gate`` both build on.
    ``outcome`` starts ``None``; there is deliberately NO parameter here to set it -- see module
    docstring's DECISION section."""
    if not _is_nonempty_str(entry_id) or not entry_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_ENTRY_ID: entry_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {entry_id!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_VERSION: version must be a string, got {version!r}")
    if decision_ref is not None and not isinstance(decision_ref, str):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_DECISION_REF: decision_ref must be a string or None, got {decision_ref!r}")

    if not _options_are_valid(options):
        raise InvariantViolation(
            f"DECISIONJOURNAL_INVALID_OPTIONS: options must be a list of well-shaped entries "
            f"(id/description non-empty strings, chosen a bool, no unknown keys), got {_shallow_describe(options)}"
        )
    option_violations = _options_invariant_violations(options)
    if option_violations:
        raise InvariantViolation(f"DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED: {'; '.join(option_violations)}")

    if not _evidence_is_valid(evidence):
        raise InvariantViolation(
            f"DECISIONJOURNAL_INVALID_EVIDENCE: evidence must be a list of well-shaped entries "
            f"(id/content non-empty strings, provenance a dict, optional source a string), got {_shallow_describe(evidence)}"
        )
    if not _is_nonempty_str(forecast):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_FORECAST: forecast must be a non-empty string, got {forecast!r}")
    if not _is_valid_confidence(confidence):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_CONFIDENCE: confidence must be a finite number in [0, 100], got {confidence!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    entry: dict[str, Any] = {
        "id": entry_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_ref": decision_ref,
        "context": context,
        "options": [dict(o) for o in options],
        "evidence": [dict(e) for e in evidence],
        "forecast": forecast,
        "confidence": confidence,
        "provenance": provenance,
        "outcome": None,
    }
    try:
        entry["stage1_integrity_hash"] = _compute_stage1_hash(entry)
    except (TypeError, ValueError) as error:
        # Residual defense-in-depth: shape checks above already reject the common non-serializable cases
        # (e.g. a non-dict evidence provenance); this closes any other pathological nested content the
        # shape checks did not anticipate, converting a raw json.dumps crash into a clean, catchable
        # InvariantViolation -- same fail-closed guarantee this module's own hindsight-bias gate provides.
        raise InvariantViolation(f"DECISIONJOURNAL_UNHASHABLE_CONTENT: could not compute stage1_integrity_hash ({error})") from error
    return entry


def record_outcome(entry: dict[str, Any], actual_result: str, provenance: dict[str, Any], recorded_at: str) -> dict[str, Any]:
    """STAGE 2: attaches an outcome to an already-constructed stage-1 entry. Deliberately has NO parameter
    for context/options/evidence/forecast/confidence -- it copies ``entry``'s own stored values forward
    verbatim into a freshly-built dict, so the returned record's stage-1 fields are, BY CONSTRUCTION,
    exactly what this function received them as (a caller cannot pass a different value for them; there is
    no argument to pass one through). Enforces invariant #2 fail-closed: refuses to attach anything to an
    entry whose stage-1 hash no longer matches its own raw fields (tampered before this call), and refuses
    to attach a second outcome (each entry gets exactly one -- no revisions once the outcome is known)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_ENTRY_KEYS:
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_ENTRY: entry must be a dict with exactly the expected top-level keys {sorted(_KNOWN_ENTRY_KEYS)}, got {_shallow_describe(entry)}")

    options = entry.get("options")
    if not _options_are_valid(options):
        raise InvariantViolation(f"DECISIONJOURNAL_STAGE1_INVALID: entry's own options are malformed: {_shallow_describe(options)}")
    option_violations = _options_invariant_violations(options)
    if option_violations:
        raise InvariantViolation(f"DECISIONJOURNAL_STAGE1_INVALID: entry's own options no longer satisfy invariant #1: {'; '.join(option_violations)}")
    if not _is_nonempty_str(entry.get("context")) or not _evidence_is_valid(entry.get("evidence")) or not _is_nonempty_str(entry.get("forecast")) or not _is_valid_confidence(entry.get("confidence")):
        raise InvariantViolation("DECISIONJOURNAL_STAGE1_INVALID: entry's own context/evidence/forecast/confidence no longer pass stage-1 shape validation")

    try:
        recomputed_stage1_hash = _compute_stage1_hash(entry)
    except (TypeError, ValueError) as error:
        raise InvariantViolation(f"DECISIONJOURNAL_UNHASHABLE_CONTENT: could not recompute entry {entry.get('id')!r}'s stage1_integrity_hash ({error})") from error
    if entry.get("stage1_integrity_hash") != recomputed_stage1_hash:
        raise InvariantViolation(
            f"DECISIONJOURNAL_STAGE1_HASH_MISMATCH: entry {entry.get('id')!r}'s stage1_integrity_hash does not match a fresh hash of its own "
            f"context/options/evidence/forecast/confidence -- stage-1 fields were altered after construction"
        )
    if entry.get("outcome") is not None:
        raise InvariantViolation(f"DECISIONJOURNAL_OUTCOME_ALREADY_RECORDED: entry {entry.get('id')!r} already has an outcome; outcomes are write-once, never revised")

    if not _is_nonempty_str(actual_result):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_ACTUAL_RESULT: actual_result must be a non-empty string, got {actual_result!r}")
    if not _is_nonempty_str(recorded_at):
        raise InvariantViolation(f"DECISIONJOURNAL_EMPTY_RECORDED_AT: recorded_at must be a non-empty string, got {recorded_at!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DECISIONJOURNAL_INVALID_OUTCOME_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    outcome: dict[str, Any] = {"actual_result": actual_result, "provenance": provenance, "recorded_at": recorded_at}
    outcome["outcome_integrity_hash"] = _compute_outcome_hash(outcome)

    return {
        "id": entry["id"],
        "version": entry["version"],
        "generated_by_method": entry["generated_by_method"],
        "decision_ref": entry.get("decision_ref"),
        "context": entry["context"],
        "options": [dict(o) for o in entry["options"]],
        "evidence": [dict(e) for e in entry["evidence"]],
        "forecast": entry["forecast"],
        "confidence": entry["confidence"],
        "provenance": entry["provenance"],
        "stage1_integrity_hash": entry["stage1_integrity_hash"],
        "outcome": outcome,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance, every evidence item's
    provenance, and (if present) the outcome's provenance are all schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    overall_valid = provenance_is_valid(record.get("provenance"))
    evidence_list = record.get("evidence") if isinstance(record.get("evidence"), list) else []
    invalid_evidence = [e.get("id") for e in evidence_list if isinstance(e, dict) and not provenance_is_valid(e.get("provenance"))]
    outcome = record.get("outcome")
    outcome_provenance_valid = True if outcome is None else (isinstance(outcome, dict) and provenance_is_valid(outcome.get("provenance")))
    passed = overall_valid and not invalid_evidence and outcome_provenance_valid
    return _result(
        "provenance_required",
        passed,
        [{"overall_provenance_valid": overall_valid, "invalid_evidence_provenance_ids": invalid_evidence, "outcome_provenance_valid": outcome_provenance_valid}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- every evidence item carries a real
    ``epistemic_type`` label, AND an item claiming the strongest possible label (SOURCE_FACT) must name a
    non-empty ``source``: an unattributed 'this was just a fact' claim is exactly the kind of retroactive
    self-flattery a hindsight-biased actor would be tempted to insert, same discipline
    ``root_cause.fishbone``'s own EVIDENCE-must-cite-refs check establishes for a different method. An
    EMPTY evidence list PASSES (vacuously -- nothing to mislabel), consistent with ``evidence`` being a
    legally empty list for this method (see module docstring)."""
    if not isinstance(record, dict):
        return _result("evidence_labeling_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    evidence_list = record.get("evidence")
    if not isinstance(evidence_list, list):
        return _result("evidence_labeling_required", False, [{"reason": "evidence is not a list"}], validator, timestamp)
    problems: list[dict[str, Any]] = []
    for item in evidence_list:
        if not isinstance(item, dict):
            problems.append({"id": repr(item), "reason": "not a dict"})
            continue
        epistemic_type = (item.get("provenance") or {}).get("epistemic_type")
        if epistemic_type not in EPISTEMIC_TYPES:
            problems.append({"id": item.get("id"), "reason": "no valid epistemic_type label"})
            continue
        if epistemic_type == "SOURCE_FACT" and not (item.get("source") or "").strip():
            problems.append({"id": item.get("id"), "reason": "labeled SOURCE_FACT but names no source"})
    return _result("evidence_labeling_required", not problems, [{"evidence_checked": len(evidence_list), "problems": problems}], validator, timestamp)


def evaluate_options_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently from the record's own raw ``options`` field -- catches a
    hand-tampered record (e.g. the alternative option deleted after construction, or a second option
    flipped to ``chosen: true``) that never went through ``generate_decision_journal_entry`` at all."""
    if not isinstance(record, dict):
        return _result("options_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    options = record.get("options")
    if not _options_are_valid(options):
        return _result("options_integrity", False, [{"reason": f"options malformed: {_shallow_describe(options)}"}], validator, timestamp)
    violations = _options_invariant_violations(options)
    return _result("options_integrity", not violations, [{"option_count": len(options), "violations": violations}], validator, timestamp)


def evaluate_hindsight_bias_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: recomputes ``stage1_integrity_hash`` from the record's own
    CURRENT context/options/evidence/forecast/confidence and compares to the stored value -- this is what
    catches ANY direct hand-edit of those fields (e.g. ``record["confidence"] = 99``), whether or not an
    outcome has been attached, since there is no second construction call to intercept it. If an outcome IS
    present, also re-verifies ITS OWN ``outcome_integrity_hash`` the same way, closing the second-order
    tamper (editing a recorded outcome after the fact to flatter an original forecast). FAILS CLOSED on
    malformed input rather than crashing, same discipline every gate in this package uses."""
    if not isinstance(record, dict):
        return _result("hindsight_bias_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stored_stage1_hash = record.get("stage1_integrity_hash")
    if not _is_nonempty_str(stored_stage1_hash):
        return _result("hindsight_bias_integrity", False, [{"reason": "stage1_integrity_hash missing or empty"}], validator, timestamp)
    recomputed_stage1_hash = _safe_compute_hash(_compute_stage1_hash, record)
    stage1_match = recomputed_stage1_hash is not None and stored_stage1_hash == recomputed_stage1_hash

    outcome = record.get("outcome")
    if outcome is None:
        return _result("hindsight_bias_integrity", stage1_match, [{"stage1_hash_match": stage1_match, "outcome_present": False}], validator, timestamp)

    if not isinstance(outcome, dict) or set(outcome.keys()) != _KNOWN_OUTCOME_KEYS:
        return _result("hindsight_bias_integrity", False, [{"stage1_hash_match": stage1_match, "reason": f"outcome malformed: {_shallow_describe(outcome)}"}], validator, timestamp)
    stored_outcome_hash = outcome.get("outcome_integrity_hash")
    if not _is_nonempty_str(stored_outcome_hash):
        return _result("hindsight_bias_integrity", False, [{"stage1_hash_match": stage1_match, "reason": "outcome_integrity_hash missing or empty"}], validator, timestamp)
    recomputed_outcome_hash = _safe_compute_hash(_compute_outcome_hash, outcome)
    outcome_match = recomputed_outcome_hash is not None and stored_outcome_hash == recomputed_outcome_hash

    passed = stage1_match and outcome_match
    return _result("hindsight_bias_integrity", passed, [{"stage1_hash_match": stage1_match, "outcome_present": True, "outcome_hash_match": outcome_match}], validator, timestamp)


def evaluate_decision_journal_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_options_integrity_gate(record, validator, timestamp),
        evaluate_hindsight_bias_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
