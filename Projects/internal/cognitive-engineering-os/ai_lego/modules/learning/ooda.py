"""``learning.ooda`` -- Method Atlas slice, 6th `learning` family (F17) member, after
`learning.reversal_criteria`/`learning.kill_criteria`/`learning.decision_journal`/
`learning.pdca`/`learning.after_action_review` (final count per this method's own
contract and test file, reconciled 2026-09-08 -- this line originally said "4th",
written before pdca/after_action_review existed).

Atlas F17 table row (L802): "OODA | 快速動態決策 | Observe→Orient→Decide→Act |
高變動環境". Dedicated section Sec12.35 (L3002-3011): section title itself
names it "OODA 循環" (a loop); arrow diagram (L3007) has no trailing "→ ..."
(unlike PDCA's own L2994 "...→Act→..."); L3011 states the real distinction
from PDCA: "OODA 更強調情勢更新與 decision tempo" (OODA emphasizes
situation-updating and decision tempo more).

DUE DILIGENCE vs `learning.pdca` (this session's own brief, concurrent
build in the same batch): `ai_lego/modules/learning/pdca.py` did NOT exist
at Glob-check time (2026-09-07, before writing this module) -- could not
read it directly. Proceeded on Atlas's own textual distinction instead
(L3011 above), not a cosmetic reshaping of PDCA's 4-step shape.

Re-run (2026-09-07): `pdca.py` now exists (127 tests passing).
Confirmed non-duplicate -- `learning.ooda.contract.yaml`'s own
`compilation_decisions` already answers this ("Duplicate of PDCA?" ->
"No", informed by a full pdca.py read per that file's own
`verification` note). Structural confirmation: `STAGE_TYPES_IN_ORDER`
(module-level constant, this file) is a single-pass record
(OBSERVE/ORIENT/DECIDE/ACT, no `cycles[]`); `pdca.py:26-29` is a `cycles[]` array (`STAGE_ORDER`
PLAN/DO/CHECK/ACT) with a cross-cycle continuity invariant
(`pdca.py:118-135`, PDCA_LEARNING_CONTINUITY_VIOLATED) OODA has none of.

NOTE: this docstring's original "OQ-OODA-2" label predates the contract
yaml and collided with that file's own unrelated OQ-OODA-2 (cycles[]
array design) -- different question, not the same as this due-diligence
re-run. That real OQ-OODA-2 was RESOLVED 2026-09-08 (operator decision:
kept one-record-per-cycle, no cycles[] array) -- see the contract
yaml's own `open_questions`.

Boyd's OODA loop (well-documented military/competitive-strategy origin,
disclosed here as OUTSIDE knowledge, not Atlas-cited beyond L3011's own
"decision tempo" phrase): Orient is the decisive stage -- reorienting the
actor's own mental model faster than a competing actor, not a mechanical
checklist step. Operationalized here as a REAL structural requirement, not
prose: the ORIENT stage must cite specific OBSERVE data
(`observation_refs` -> real `observations[].id`) and state what is being
revised (`mental_model_update`, non-empty) -- an ORIENT stage connected to
nothing observed is an unexplained decision, not orientation.

FOUR real, independently-enforced invariants (construction AND gate, same
"raise before any downstream write" / "re-derive, don't trust" two-layer
discipline every prior module in this package uses; gate re-derivation
follows `root_cause.fault_tree`'s own stricter isinstance-first/safe-
`.get()`/single-comprehensive-integrity-gate pattern, per this session's
own brief):

1. **Stage shape** (`OODA_INVALID_STAGES`): exactly 4 entries; each a dict
   with `stage_type`/`content`/`timestamp`/`provenance` plus the
   stage-type-specific extra keys (`observations` for OBSERVE;
   `observation_refs`+`mental_model_update` for ORIENT) -- required for
   THAT stage type, illegal for any other (exact key-set match, not
   `issubset`). `content`/`timestamp` non-empty; `timestamp` must parse
   via `ai_lego.core.support.parse_timestamp`.
2. **Stage order** (`OODA_STAGE_ORDER_VIOLATED`): `stage_type` sequence
   must equal `(OBSERVE, ORIENT, DECIDE, ACT)` exactly -- Atlas's own L802
   arrow order, operationalized as a checkable structural field, same
   "hand-tamperable field, not an unchecked label" discipline
   `fault_tree`'s own gate-mode-consistency invariant establishes.
3. **Timestamp monotonicity** (`OODA_NONMONOTONIC_TIMESTAMPS`): NOT
   directly Atlas-cited -- disclosed, derived requirement so
   `compute_cycle_tempo_seconds` (operationalizing L3011's own "decision
   tempo") stays meaningful; an ACT timestamped before its own OBSERVE
   cannot have a real elapsed tempo.
4. **Orient grounding** (`OODA_ORIENT_NOT_GROUNDED`): every ORIENT
   `observation_refs` entry must resolve to a real `id` in the SAME
   record's OBSERVE `observations[]` -- the structural form of the
   Boyd-grounded distinction above. Precondition: called only after stage
   order is already valid (stages[0] is OBSERVE, stages[1] is ORIENT),
   same precondition discipline `fault_tree._gate_mode_is_consistent`
   documents for itself.

Grep-verified before minting (2026-09-07): zero existing schema anywhere
in `specs/**` models ooda/observe/orient/decide_act under any name -- this
module mints a genuinely new typed object, not a duplicate.

Disclosed scope gap: duplicate `observations[].id` within one OBSERVE
stage is not separately rejected (grounding still resolves correctly via
set membership; not one of the four invariants above).

`compute_cycle_tempo_seconds` is the one piece of GENUINE compute this
module provides (same "not just structural validation" pattern
`fault_tree.evaluate_top_event`/`kill_criteria.evaluate_threshold_breach`
establish for their own families) -- real elapsed-seconds between the
OBSERVE and ACT stage timestamps, directly operationalizing Atlas's own
L3011 "decision tempo" phrase, not outside invention.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.ooda"
RECORD_ID_PREFIX = "OODA-"
STAGE_TYPES_IN_ORDER = ("OBSERVE", "ORIENT", "DECIDE", "ACT")

_BASE_STAGE_KEYS_REQUIRED = frozenset({"stage_type", "content", "timestamp", "provenance"})
_STAGE_EXTRA_KEYS: dict[str, frozenset[str]] = {
    "OBSERVE": frozenset({"observations"}),
    "ORIENT": frozenset({"observation_refs", "mental_model_update"}),
    "DECIDE": frozenset(),
    "ACT": frozenset(),
}
_KNOWN_OBSERVATION_KEYS = frozenset({"id", "content", "provenance"})


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


def _safe_parse_timestamp(value: Any) -> datetime | None:
    """Fail-closed wrapper around ``ai_lego.core.support.parse_timestamp``: construction call sites hand it
    already-shape-checked strings, but a GATE re-derives from raw, potentially hand-tampered fields with no
    such guarantee. Returns ``None`` (never a valid timestamp) on any parse failure or non-string input."""
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _observation_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_OBSERVATION_KEYS:
        return False
    if not _is_nonempty_str(item["id"]) or not _is_nonempty_str(item["content"]):
        return False
    return isinstance(item["provenance"], dict)


def _stage_shape_is_valid(stage: Any) -> bool:
    """Shape only (keys, types, per-stage-type required extras). Stage ORDER (invariant #2) and orient
    GROUNDING (invariant #4) are checked separately, once the full ``stages`` array is available -- three
    independent predicates, each with its own error code, same split ``fault_tree``'s own
    ``_gate_shape_is_valid``/``_gate_mode_is_consistent``/``_referential_integrity_violations`` establishes."""
    if not isinstance(stage, dict):
        return False
    stage_type = stage.get("stage_type")
    if stage_type not in _STAGE_EXTRA_KEYS:
        return False
    expected_keys = _BASE_STAGE_KEYS_REQUIRED | _STAGE_EXTRA_KEYS[stage_type]
    if set(stage.keys()) != expected_keys:
        return False
    if not _is_nonempty_str(stage["content"]):
        return False
    if _safe_parse_timestamp(stage.get("timestamp")) is None:
        return False
    if not isinstance(stage["provenance"], dict):
        return False
    if stage_type == "OBSERVE":
        observations = stage["observations"]
        if not isinstance(observations, list) or not observations:
            return False
        if not all(_observation_shape_is_valid(o) for o in observations):
            return False
    if stage_type == "ORIENT":
        refs = stage["observation_refs"]
        if not isinstance(refs, list) or not refs or not all(_is_nonempty_str(r) for r in refs):
            return False
        if not _is_nonempty_str(stage["mental_model_update"]):
            return False
    return True


def _stage_order_violations(stages: list[Any]) -> list[str]:
    """Invariant #2: ``stage_type`` sequence must equal ``STAGE_TYPES_IN_ORDER`` exactly. Precondition:
    ``stages`` has length 4 and every entry already passed ``_stage_shape_is_valid`` (so ``stage_type`` is
    known-legal on each) -- same precondition discipline ``fault_tree._gate_mode_is_consistent`` documents."""
    actual = tuple(s["stage_type"] for s in stages)
    if actual != STAGE_TYPES_IN_ORDER:
        return [f"stage_type sequence {list(actual)} does not match required order {list(STAGE_TYPES_IN_ORDER)}"]
    return []


def _timestamp_monotonicity_violations(stages: list[Any]) -> list[str]:
    """Invariant #3, disclosed derived requirement (see module docstring). Precondition: same as
    ``_stage_order_violations``. Fails closed (reported as a violation, not silently skipped) if any
    timestamp cannot be parsed -- a gate re-deriving from raw fields cannot assume shape-check already ran."""
    parsed = [_safe_parse_timestamp(s.get("timestamp")) for s in stages]
    if any(p is None for p in parsed):
        bad = [s.get("stage_type") for s, p in zip(stages, parsed) if p is None]
        return [f"unparseable timestamp on stage(s) {bad}"]
    violations: list[str] = []
    for earlier, later in zip(parsed, parsed[1:]):
        if later < earlier:
            violations.append(f"timestamps not non-decreasing: {earlier.isoformat()} -> {later.isoformat()}")
    return violations


def _orient_grounding_violations(stages: list[Any]) -> list[str]:
    """Invariant #4: every ORIENT ``observation_refs`` entry resolves to a real OBSERVE
    ``observations[].id`` in the SAME record. Precondition: ``stages`` is order-valid (index 0 is OBSERVE,
    index 1 is ORIENT) and both already passed ``_stage_shape_is_valid`` -- same precondition discipline
    ``fault_tree._referential_integrity_violations`` documents for its own cross-node check."""
    observe_stage_, orient_stage_ = stages[0], stages[1]
    known_ids = {o["id"] for o in observe_stage_["observations"]}
    dangling = sorted({r for r in orient_stage_["observation_refs"] if r not in known_ids})
    if dangling:
        return [f"observation_refs {dangling} do not resolve to any OBSERVE.observations[].id in {sorted(known_ids)}"]
    return []


def observation(observation_id: str, content: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """Convenience constructor for one OBSERVE-stage ``observations[]`` entry. Not itself the invariant
    boundary -- ``generate_ooda_cycle_record`` validates whatever it is handed regardless of how it was
    built, same division of labor ``fault_tree.basic_event``/``decision_journal.evidence_item`` establish."""
    return {"id": observation_id, "content": content, "provenance": provenance}


def observe_stage(content: str, timestamp: str, provenance: dict[str, Any], observations: list[dict[str, Any]]) -> dict[str, Any]:
    """Convenience constructor for the OBSERVE stage. Not the invariant boundary (see ``observation``)."""
    return {"stage_type": "OBSERVE", "content": content, "timestamp": timestamp, "provenance": provenance, "observations": list(observations)}


def orient_stage(
    content: str, timestamp: str, provenance: dict[str, Any], observation_refs: list[str], mental_model_update: str
) -> dict[str, Any]:
    """Convenience constructor for the ORIENT stage. Not the invariant boundary (see ``observation``)."""
    return {
        "stage_type": "ORIENT",
        "content": content,
        "timestamp": timestamp,
        "provenance": provenance,
        "observation_refs": list(observation_refs),
        "mental_model_update": mental_model_update,
    }


def decide_stage(content: str, timestamp: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """Convenience constructor for the DECIDE stage. Not the invariant boundary (see ``observation``)."""
    return {"stage_type": "DECIDE", "content": content, "timestamp": timestamp, "provenance": provenance}


def act_stage(content: str, timestamp: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """Convenience constructor for the ACT stage. Not the invariant boundary (see ``observation``)."""
    return {"stage_type": "ACT", "content": content, "timestamp": timestamp, "provenance": provenance}


def generate_ooda_cycle_record(
    record_id: str,
    situation: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ooda-cycle-record.schema.yaml``. Enforces all four invariants fail-closed,
    in order: stage shape, stage order, timestamp monotonicity, orient grounding, then overall provenance."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OODA_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(situation):
        raise InvariantViolation(f"OODA_EMPTY_RECORD_FIELD: situation must be a non-empty string, got {situation!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OODA_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(stages, list) or len(stages) != 4 or not all(_stage_shape_is_valid(s) for s in stages):
        raise InvariantViolation(
            f"OODA_INVALID_STAGES: stages must be a list of exactly 4 well-shaped entries "
            f"(stage_type/content/timestamp/provenance, plus observations for OBSERVE or "
            f"observation_refs/mental_model_update for ORIENT), got {_shallow_describe(stages)}"
        )

    order_violations = _stage_order_violations(stages)
    if order_violations:
        raise InvariantViolation(f"OODA_STAGE_ORDER_VIOLATED: {'; '.join(order_violations)}")

    monotonicity_violations = _timestamp_monotonicity_violations(stages)
    if monotonicity_violations:
        raise InvariantViolation(f"OODA_NONMONOTONIC_TIMESTAMPS: {'; '.join(monotonicity_violations)}")

    grounding_violations = _orient_grounding_violations(stages)
    if grounding_violations:
        raise InvariantViolation(f"OODA_ORIENT_NOT_GROUNDED: {'; '.join(grounding_violations)}")

    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"OODA_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    rebuilt_stages: list[dict[str, Any]] = []
    for stage in stages:
        rebuilt: dict[str, Any] = {
            "stage_type": stage["stage_type"],
            "content": stage["content"],
            "timestamp": stage["timestamp"],
            "provenance": stage["provenance"],
        }
        if stage["stage_type"] == "OBSERVE":
            rebuilt["observations"] = [dict(o) for o in stage["observations"]]
        if stage["stage_type"] == "ORIENT":
            rebuilt["observation_refs"] = list(stage["observation_refs"])
            rebuilt["mental_model_update"] = stage["mental_model_update"]
        rebuilt_stages.append(rebuilt)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "situation": situation,
        "stages": rebuilt_stages,
        "provenance": provenance,
    }


def compute_cycle_tempo_seconds(record: dict[str, Any]) -> float:
    """Real elapsed-seconds between the OBSERVE and ACT stage timestamps -- operationalizes Atlas's own
    Sec12.35 (L3011) "decision tempo" phrase, the named distinction from PDCA. GENUINE compute (recomputed
    fresh every call from the record's own raw timestamps, never a stored field).

    SCOPE (same split ``fault_tree.evaluate_top_event``/``kill_criteria.evaluate_threshold_breach`` document
    for their own families): operates ONLY on an ALREADY-VALID record (stage order and timestamp
    monotonicity already proved by ``generate_ooda_cycle_record``/the gates) -- does not itself re-validate
    order or parse-safety, and indexes ``stages[0]``/``stages[3]`` directly assuming that precondition."""
    observed_at = parse_timestamp(record["stages"][0]["timestamp"])
    acted_at = parse_timestamp(record["stages"][3]["timestamp"])
    return (acted_at - observed_at).total_seconds()


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance, every stage's own
    provenance, and every OBSERVE stage's every observation's own provenance are all schema-valid. Fails
    closed on malformed input rather than crashing, same discipline every gate in this package uses."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    overall_valid = provenance_is_valid(record.get("provenance"))
    stages = record.get("stages") if isinstance(record.get("stages"), list) else []
    invalid_stage_provenance = [s.get("stage_type") for s in stages if isinstance(s, dict) and not provenance_is_valid(s.get("provenance"))]
    invalid_observation_ids: list[Any] = []
    for s in stages:
        if isinstance(s, dict) and s.get("stage_type") == "OBSERVE" and isinstance(s.get("observations"), list):
            invalid_observation_ids.extend(o.get("id") for o in s["observations"] if isinstance(o, dict) and not provenance_is_valid(o.get("provenance")))
    passed = overall_valid and not invalid_stage_provenance and not invalid_observation_ids
    return _result(
        "provenance_required",
        passed,
        [{"overall_provenance_valid": overall_valid, "invalid_stage_provenance_types": invalid_stage_provenance, "invalid_observation_provenance_ids": invalid_observation_ids}],
        validator,
        timestamp,
    )


def evaluate_ooda_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored consistency. Bundles stage shape, stage order, timestamp monotonicity, and orient grounding under
    one gate_id, same shape ``evaluate_fault_tree_integrity_gate`` already uses for its own family (several
    distinct structural reasons, one gate_id, each with its own distinguishable evidence ``reason``). FAILS
    CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("ooda_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("ooda_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("ooda_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("situation")):
        return _result("ooda_integrity", False, [{"reason": "situation missing or empty"}], validator, timestamp)

    stages = record.get("stages")
    if not isinstance(stages, list) or len(stages) != 4 or not all(_stage_shape_is_valid(s) for s in stages):
        return _result(
            "ooda_integrity",
            False,
            [{"reason": "stages invalid (not exactly 4 entries, or an entry with wrong/missing/extra keys for its stage_type)"}],
            validator,
            timestamp,
        )

    order_violations = _stage_order_violations(stages)
    if order_violations:
        return _result("ooda_integrity", False, [{"reason": "stage order violated", "details": order_violations}], validator, timestamp)

    monotonicity_violations = _timestamp_monotonicity_violations(stages)
    if monotonicity_violations:
        return _result("ooda_integrity", False, [{"reason": "timestamps not monotonic", "details": monotonicity_violations}], validator, timestamp)

    grounding_violations = _orient_grounding_violations(stages)
    if grounding_violations:
        return _result("ooda_integrity", False, [{"reason": "orient not grounded", "details": grounding_violations}], validator, timestamp)

    return _result("ooda_integrity", True, [{"stage_count": len(stages), "tempo_seconds": compute_cycle_tempo_seconds(record)}], validator, timestamp)


def evaluate_ooda_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_ooda_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
