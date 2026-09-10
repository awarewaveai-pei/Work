"""``causal.process_tracing`` -- 2nd member of the F11 causal family (after ``causal.dag``), built alongside 4
concurrent siblings (causal.counterfactual_reasoning/theory_of_change/logic_model/rct) in the same batch.

**Atlas gives this method exactly ONE citation** -- the F11 tool table's Process Tracing row (L620: purpose
"用機制證據檢查因果鏈"; usage "mechanism→hoop/smoking-gun evidence"; benefit "適合小樣本深度因果"). Broad grep
across the whole Atlas for "Process Tracing"/"hoop"/"smoking gun"/"smoking-gun" found NO dedicated §11.x
section (unlike causal.dag's own §11.21), NO worked example, NO §10 Causal recipe mention, and NO §22.3
Method-specific Gate row -- same "thinnest grounding" class ``security.pasta.contract.yaml``'s own due
diligence already documented for a different family.

Because Atlas gives no structural detail beyond its own five-word formula, field-level detail beyond that
formula is grounded in REAL, EXTERNAL, NAMED methodology practice (Van Evera's own hoop-test/smoking-gun-test
typology), NOT an Atlas citation -- same disclosure class ``security.pasta`` already establishes. Van Evera's
real typology has FOUR test types; ``test_type`` is deliberately restricted to the TWO Atlas's own row
literally names (see ``causal.process_tracing.contract.yaml``'s own ``OQ-PROCESSTRACING-2``).

The whole structural point (per Atlas's own citation) is that HOOP and SMOKING_GUN evidence carry DIFFERENT,
ASYMMETRIC logical implications when PRESENT vs ABSENT -- ``implication`` (per evidence entry) and
``hypothesis_status`` (record-level) are therefore GENUINE_COMPUTE
(``ai_lego.compute.process_tracing.evidence_evaluation``), re-derived by both the builder and an independent
gate, never caller-asserted, same two-layer discipline every genuine_compute sibling in this suite (e.g.
``association.morphological_analysis``) already establishes -- applied here for the first time at the
per-ITEM level, not only record-level: ``evidence[].implication`` is not a builder parameter at all (callers
supply only ``id``/``test_type``/``description``/``result``/``provenance`` per entry); the builder always
attaches the computed ``implication`` itself, so there is no code path through which a caller could construct
a record whose stored implication disagrees with its own entry's own test_type/result pair.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.process_tracing.evidence_evaluation import (
    VALID_RESULTS,
    VALID_TEST_TYPES,
    derive_hypothesis_status,
    derive_implication,
)
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.process_tracing"
RECORD_ID_PREFIX = "PROCESSTRACING-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.process_tracing.evidence_evaluation.derive_hypothesis_status"
VALID_HYPOTHESIS_STATUSES = frozenset({"ELIMINATED", "SURVIVING", "CONFIRMED"})
VALID_IMPLICATIONS = frozenset({"HYPOTHESIS_ELIMINATED", "HYPOTHESIS_NOT_ELIMINATED", "HYPOTHESIS_CONFIRMED", "HYPOTHESIS_NOT_CONFIRMED"})

_EVIDENCE_INPUT_KEYS = frozenset({"id", "test_type", "description", "result", "provenance"})
_EVIDENCE_STORED_KEYS = frozenset({"id", "test_type", "description", "result", "implication", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _evidence_core_fields_are_valid(entry: dict[str, Any]) -> bool:
    """Shared predicate: the 4 fields every evidence entry carries regardless of input-vs-stored shape --
    non-empty id, legal test_type, non-empty description, legal result, schema-valid provenance. Called by
    BOTH the input and stored shape predicates below; does NOT itself check key-set shape or `implication`."""
    if not _is_nonempty_str(entry.get("id")):
        return False
    if entry.get("test_type") not in VALID_TEST_TYPES:
        return False
    if not _is_nonempty_str(entry.get("description")):
        return False
    if entry.get("result") not in VALID_RESULTS:
        return False
    return provenance_is_valid(entry.get("provenance"))


def _evidence_input_entry_is_valid(entry: Any) -> bool:
    """Shared predicate for a CALLER-SUPPLIED evidence entry -- exactly the 5 input keys (NO `implication`,
    that field is always computed, never accepted), core fields valid. Called only by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _EVIDENCE_INPUT_KEYS:
        return False
    return _evidence_core_fields_are_valid(entry)


def _evidence_stored_entry_is_valid(entry: Any) -> bool:
    """Shared predicate for a STORED (already-computed) evidence entry -- exactly the 6 stored keys, core
    fields valid, AND `implication` must equal the real re-derivation from this entry's own test_type/result.
    Called only by the gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _EVIDENCE_STORED_KEYS:
        return False
    if not _evidence_core_fields_are_valid(entry):
        return False
    return entry.get("implication") == derive_implication(entry["test_type"], entry["result"])


def _ids_are_unique(entries: list[dict[str, Any]]) -> bool:
    ids = [e["id"] for e in entries]
    return len(ids) == len(set(ids))


def generate_process_tracing_record(
    record_id: str,
    causal_mechanism: str,
    evidence: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    cause_hypothesis_set_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/process-tracing-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed. ``evidence`` entries are accepted WITHOUT an
    ``implication`` key (``id``/``test_type``/``description``/``result``/``provenance`` only) -- the builder
    ALWAYS computes and attaches ``implication`` itself via ``derive_implication``, and ALWAYS computes the
    record-level ``hypothesis_status`` via ``derive_hypothesis_status``. Neither is a parameter here, so there
    is no code path through which a caller could construct a record whose stored derivations disagree with
    their own inputs (see module docstring).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PROCESSTRACING_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PROCESSTRACING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(causal_mechanism):
        raise InvariantViolation(f"PROCESSTRACING_EMPTY_MECHANISM: causal_mechanism must be a non-empty string, got {causal_mechanism!r}")
    if cause_hypothesis_set_ref is not None and not _is_nonempty_str(cause_hypothesis_set_ref):
        raise InvariantViolation(f"PROCESSTRACING_INVALID_CAUSE_HYPOTHESIS_SET_REF: cause_hypothesis_set_ref, when present, must be a non-empty string, got {cause_hypothesis_set_ref!r}")

    if not isinstance(evidence, list) or not evidence:
        raise InvariantViolation(f"PROCESSTRACING_EMPTY_EVIDENCE: evidence must be a non-empty list (a mechanism with zero tests has not been process-traced), got {evidence!r}")
    if not all(_evidence_input_entry_is_valid(e) for e in evidence):
        raise InvariantViolation(
            f"PROCESSTRACING_INVALID_EVIDENCE: every entry must have exactly the keys {{id, test_type, description, result, provenance}} "
            f"(implication is computed, not accepted), test_type in {sorted(VALID_TEST_TYPES)}, result in {sorted(VALID_RESULTS)}, "
            f"non-empty id/description, and schema-valid provenance, got {evidence!r}"
        )
    if not _ids_are_unique(evidence):
        raise InvariantViolation(f"PROCESSTRACING_DUPLICATE_EVIDENCE_ID: evidence ids must be unique within the record, got {[e['id'] for e in evidence]!r}")

    rebuilt_evidence = [
        {
            "id": e["id"],
            "test_type": e["test_type"],
            "description": e["description"],
            "result": e["result"],
            "implication": derive_implication(e["test_type"], e["result"]),
            "provenance": e["provenance"],
        }
        for e in evidence
    ]
    hypothesis_status = derive_hypothesis_status([e["implication"] for e in rebuilt_evidence])

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "causal_mechanism": causal_mechanism,
        "evidence": rebuilt_evidence,
        "hypothesis_status": hypothesis_status,
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }
    if cause_hypothesis_set_ref is not None:
        record["cause_hypothesis_set_ref"] = cause_hypothesis_set_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own overall provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_process_tracing_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any stored
    value and does NOT call ``generate_process_tracing_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. In particular, this is
    the ONLY place EVERY evidence entry's own ``implication`` (re-derived via ``derive_implication``) and the
    record-level ``hypothesis_status`` (re-derived via ``derive_hypothesis_status``) are checked against
    reality. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("process_tracing_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("process_tracing_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("process_tracing_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("causal_mechanism")):
        return _result("process_tracing_integrity", False, [{"reason": "causal_mechanism missing or empty"}], validator, timestamp)
    ref = record.get("cause_hypothesis_set_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("process_tracing_integrity", False, [{"reason": "cause_hypothesis_set_ref present but not a non-empty string"}], validator, timestamp)

    evidence = record.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        return _result("process_tracing_integrity", False, [{"reason": "evidence missing, not a list, or empty"}], validator, timestamp)
    if not all(_evidence_stored_entry_is_valid(e) for e in evidence):
        return _result(
            "process_tracing_integrity",
            False,
            [{"reason": "evidence invalid (malformed entry, illegal test_type/result, invalid provenance, or a stored implication disagreeing with its own re-derivation)"}],
            validator,
            timestamp,
        )
    if not _ids_are_unique(evidence):
        return _result("process_tracing_integrity", False, [{"reason": "evidence ids are not unique"}], validator, timestamp)

    recomputed_status = derive_hypothesis_status([e["implication"] for e in evidence])
    if record.get("hypothesis_status") != recomputed_status:
        return _result(
            "process_tracing_integrity",
            False,
            [{"reason": "stored hypothesis_status disagrees with recomputation", "stored": record.get("hypothesis_status"), "recomputed": recomputed_status}],
            validator,
            timestamp,
        )

    return _result(
        "process_tracing_integrity",
        True,
        [{"evidence_count": len(evidence), "hypothesis_status": recomputed_status}],
        validator,
        timestamp,
    )


def evaluate_process_tracing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_process_tracing_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
