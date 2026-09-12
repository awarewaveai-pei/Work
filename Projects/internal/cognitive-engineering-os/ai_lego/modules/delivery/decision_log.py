"""``delivery.decision_log`` -- F22 PM/Delivery/Governance Pack (Atlas L914-928), opening member.

Atlas's own table row (L924, verbatim): "Decision Log | 保存重要決策 |
context→decision→evidence→owner→revisit | 避免重複爭論" (preserve important
decisions, via context/decision/evidence/owner/revisit, to avoid re-
litigating settled decisions).

NOT `learning.decision_journal` (F17, L806 + §12.36): that method captures
context/options/evidence/forecast/confidence BEFORE an outcome is known, to
compare Prediction vs Reality and train calibration -- a fundamentally
different field shape and purpose. This method records a decision ALREADY
MADE, whose job is to stop the same settled question from being re-argued
(L924's own "避免重複爭論"). See
``methods/contracts/delivery.decision_log.contract.yaml``'s own
``decided_by`` for the full disambiguation trail. Grepped
``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"decision log"/"decision_log" and "delivery." before writing any of this
method's own files: zero pre-existing implementation or namespace overlap
(the only "decision log" hits are Atlas L924 itself and
``learning/decision_journal.py``'s own docstring referring to ITSELF).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Decision + evidence non-empty** (``DLOG_EMPTY_DECISION`` /
   ``DLOG_INVALID_EVIDENCE``) -- a logged decision with no stated evidence
   defeats L924's own "避免重複爭論" benefit: nobody can tell whether
   re-litigating it would surface new information.
2. **Revisit disambiguation** (``DLOG_INVALID_REVISIT``) -- ``revisit.mode``
   must be exactly one of ``SCHEDULED`` (with a non-empty ``trigger``) or
   ``NO_REVISIT_PLANNED`` (with ``trigger`` exactly ``None``). Silence on
   revisit is the exact "is this permanent or provisional?" ambiguity this
   field exists to remove.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.decision_log"
RECORD_ID_PREFIX = "DLOG-"
_REVISIT_MODES = frozenset({"SCHEDULED", "NO_REVISIT_PLANNED"})
_REVISIT_KEYS = frozenset({"mode", "trigger"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) > 0 and all(_is_nonempty_str(item) for item in value)


def _revisit_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped revisit object". Both
    ``generate_decision_log_entry`` (construction layer) and the gate (independent re-derivation layer)
    consult it, same single-shared-predicate discipline ``foresight.cross_impact_analysis``'s own
    ``_pair_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _REVISIT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _REVISIT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_REVISIT_KEYS - value.keys(), key=repr)}"
    mode = value.get("mode")
    if mode not in _REVISIT_MODES:
        return f"mode must be one of {sorted(_REVISIT_MODES)}, got {mode!r}"
    trigger = value.get("trigger")
    if mode == "SCHEDULED" and not _is_nonempty_str(trigger):
        return f"mode=SCHEDULED requires a non-empty string trigger, got {trigger!r}"
    if mode == "NO_REVISIT_PLANNED" and trigger is not None:
        return f"mode=NO_REVISIT_PLANNED requires trigger to be null, got {trigger!r}"
    return None


def revisit_scheduled(trigger: str) -> dict[str, Any]:
    """Convenience constructor for a ``SCHEDULED`` revisit disposition."""
    record = {"mode": "SCHEDULED", "trigger": trigger}
    problem = _revisit_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DLOG_INVALID_REVISIT: {problem}")
    return record


def revisit_none_planned() -> dict[str, Any]:
    """Convenience constructor for a ``NO_REVISIT_PLANNED`` revisit disposition."""
    return {"mode": "NO_REVISIT_PLANNED", "trigger": None}


def generate_decision_log_entry(
    record_id: str,
    context: str,
    decision: str,
    evidence: list[str],
    owner: str,
    revisit: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/decision-log-record.schema.yaml``.

    Enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    non-empty context/decision/owner, non-empty evidence list of non-empty strings, and a well-formed,
    unambiguous revisit disposition -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DLOG_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DLOG_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("DLOG_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not _is_nonempty_str(context):
        raise InvariantViolation(f"DLOG_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")
    if not _is_nonempty_str(decision):
        raise InvariantViolation(f"DLOG_EMPTY_DECISION: decision must be a non-empty string, got {decision!r}")
    if not _is_nonempty_str_list(evidence):
        raise InvariantViolation(
            f"DLOG_INVALID_EVIDENCE: evidence must be a non-empty list of non-empty strings -- a decision with "
            f"no stated evidence defeats this method's own '避免重複爭論' benefit, got {evidence!r}"
        )
    if not _is_nonempty_str(owner):
        raise InvariantViolation(f"DLOG_EMPTY_OWNER: owner must be a non-empty string, got {owner!r}")

    revisit_problem = _revisit_problem(revisit)
    if revisit_problem is not None:
        raise InvariantViolation(f"DLOG_INVALID_REVISIT: {revisit_problem}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "decision": decision,
        "evidence": list(evidence),
        "owner": owner,
        "revisit": dict(revisit),
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_decision_evidence_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #1 directly from raw fields -- decision and evidence must both be non-empty --
    without this the gate could pass a hand-tampered record the builder would have refused (e.g. evidence
    silently emptied after construction)."""
    if not isinstance(record, dict):
        return _result("decision_evidence_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    if not _is_nonempty_str(record.get("decision")):
        problems.append(f"decision must be a non-empty string, got {record.get('decision')!r}")
    if not _is_nonempty_str_list(record.get("evidence")):
        problems.append(f"evidence must be a non-empty list of non-empty strings, got {record.get('evidence')!r}")
    passed = not problems
    return _result("decision_evidence_required", passed, [{"problems": problems}], validator, timestamp)


def evaluate_revisit_disambiguation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #2 directly from raw fields using the SAME ``_revisit_problem`` predicate the
    builder uses -- catches a hand-tampered record (e.g. mode flipped to NO_REVISIT_PLANNED while a stale
    trigger string is left in place) that never went through ``generate_decision_log_entry`` at all."""
    if not isinstance(record, dict):
        return _result("revisit_disambiguation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _revisit_problem(record.get("revisit"))
    return _result("revisit_disambiguation", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_decision_log_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_decision_evidence_gate(record, validator, timestamp),
        evaluate_revisit_disambiguation_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
