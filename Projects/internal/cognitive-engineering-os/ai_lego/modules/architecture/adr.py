"""``architecture.adr`` -- twelfth Method Atlas slice, first from the `architecture` family (F18's own "Software
Architecture Pack", one member tool built, not the whole 10-tool pack -- see the method contract's own scoping
discipline).

The first typed object this session builds for a structured DOCUMENT
template rather than a computation, graph, ranking, or checklist -- no
genuine-compute fields, no forbidden-authority guard (Atlas's own §22.3
table has no ADR row). Simpler than every prior slice's own builder: no
compute layer, no cross-field invariant beyond the precondition already
enforced by the schema's own ``minItems: 1`` on ``alternatives_considered``.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.adr"
RECORD_ID_PREFIX = "ADR-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
VALID_STATUSES = frozenset({"proposed", "accepted", "superseded", "deprecated"})


def generate_architecture_decision_record(
    record_id: str,
    title: str,
    status: str,
    context: str,
    decision: str,
    alternatives_considered: list[str],
    security_privacy_impact: str,
    data_impact: str,
    operational_impact: str,
    compatibility: str,
    migration: str,
    rollback: str,
    validation: str,
    revisit_reversal_conditions: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/architecture-decision-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed: at
    least 1 alternative considered (an ADR recording zero considered
    alternatives is an unexplained assertion, not a decision record), and
    ``status`` is one of the 4 values this repository's own real ADR
    practice uses.
    """
    if status not in VALID_STATUSES:
        raise InvariantViolation(f"ADR_INVALID_STATUS: {status!r} not in {sorted(VALID_STATUSES)}")
    if not alternatives_considered:
        raise InvariantViolation("ADR_NO_ALTERNATIVES_CONSIDERED: at least 1 required -- see method contract precondition")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "title": title,
        "status": status,
        "context": context,
        "decision": decision,
        "alternatives_considered": list(alternatives_considered),
        "security_privacy_impact": security_privacy_impact,
        "data_impact": data_impact,
        "operational_impact": operational_impact,
        "compatibility": compatibility,
        "migration": migration,
        "rollback": rollback,
        "validation": validation,
        "revisit_reversal_conditions": revisit_reversal_conditions,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def evaluate_alternatives_considered_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the method contract's own precondition structurally on any record handed to it -- not just
    trusting that generate_architecture_decision_record's own construction-time check already ran (a hand-crafted/
    tampered record must still be caught, same discipline every prior slice's own gate-re-derivation already
    established)."""
    alternatives = record.get("alternatives_considered")
    passed = isinstance(alternatives, list) and len(alternatives) >= 1
    return _result("alternatives_considered_required", passed, [{"count": len(alternatives) if isinstance(alternatives, list) else None}], validator, timestamp)


def evaluate_adr_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_alternatives_considered_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
