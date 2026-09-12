"""``foresight.cross_industry_transfer`` -- F13 unknown-unknowns/foresight family (Atlas L668-685, this method's
own row L675): "Cross-industry Transfer | 移植其他產業機制 | 找相同 job/constraint→adapt | 降低
reinvent-the-wheel" (transplant another industry's mechanism; find the shared job/constraint -> adapt; reduces
reinventing the wheel). No dedicated §11/§12 section exists for this row -- the table row itself is the sole
citation (verified by reading the Atlas file directly).

Real invariant, made structural (two halves of Atlas's own 2-step pipeline "找相同 job/constraint→adapt"):
  (a) ``shared_job_or_constraint`` must be non-empty -- a transfer asserting no identified shared job or
      constraint is cargo-culting a mechanism between unrelated contexts, not a transfer.
  (b) ``adaptation`` must be non-empty -- Atlas's own second step is literally "adapt"; copying a mechanism
      verbatim with no recorded adaptation is refused.
  (c) ``source_industry`` != ``target_industry`` after case/whitespace-insensitive normalization -- transferring
      an industry's own mechanism to itself is not a CROSS-industry transfer.
Enforced at TWO independent layers (construction-time raise + independent gate re-derivation), consulting the
single shared predicate ``_transfer_problem`` so the two layers cannot silently drift apart (the
``epistemic.evidence_matrix``/``_link_problem`` shape).

Distinct from ``association.analogy_mapping`` (F04, L416, general source->mechanism->target transfer with no
industry-pair scoping) and from ``foresight.historical_analogy`` (this same family, scoped to historical CASES
rather than industries, with a similarities/differences/limits shape this method does not carry). Grepped the
full spec root case-insensitively for "cross-industry"/"cross industry"/"shared_job_or_constraint" before
writing: only the F13 table row itself and ``association.analogy_mapping.contract.yaml``'s own disclosed
open question (OQ-ANALOGYMAPPING-2, flagging near-identical benefit-column wording, not depended on, not
built) reference this method by name; no existing schema defines this shape.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.cross_industry_transfer"
RECORD_ID_PREFIX = "XIND-"
_TRANSFER_KEYS = frozenset({"id", "source_industry", "target_industry", "shared_job_or_constraint", "source_mechanism", "adaptation"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role/shape every ``_normalize`` in this corpus
    already establishes (e.g. ``framing.problem_statement``)."""
    return " ".join(value.strip().casefold().split())


def _transfer_problem(value: Any) -> str | None:
    """The single definition of "is this transfer well-shaped" -- both ``transfer()`` (construction layer) and
    ``evaluate_transfer_completeness_gate`` (independent re-derivation layer) consult it, so the two layers
    cannot drift apart. Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _TRANSFER_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _TRANSFER_KEYS <= value.keys():
        return f"missing key(s) {sorted(_TRANSFER_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    source_industry, target_industry = value.get("source_industry"), value.get("target_industry")
    if not _is_nonempty_str(source_industry):
        return f"source_industry must be a non-empty string, got {source_industry!r}"
    if not _is_nonempty_str(target_industry):
        return f"target_industry must be a non-empty string, got {target_industry!r}"
    if _normalize(source_industry) == _normalize(target_industry):
        return f"source_industry {source_industry!r} and target_industry {target_industry!r} must differ -- transferring an industry's mechanism to itself is not a cross-industry transfer"
    if not _is_nonempty_str(value.get("shared_job_or_constraint")):
        return "shared_job_or_constraint must be a non-empty string -- Atlas L675's own '找相同 job/constraint' first half; without it this is cargo-culting a mechanism, not a transfer"
    if not _is_nonempty_str(value.get("source_mechanism")):
        return f"source_mechanism must be a non-empty string, got {value.get('source_mechanism')!r}"
    if not _is_nonempty_str(value.get("adaptation")):
        return "adaptation must be a non-empty string -- Atlas L675's own '→adapt' second step; copying a mechanism verbatim with no recorded adaptation is refused"
    return None


def transfer(transfer_id: str, source_industry: str, target_industry: str, shared_job_or_constraint: str, source_mechanism: str, adaptation: str) -> dict[str, Any]:
    """One item of ``typed-objects/cross-industry-transfer.schema.yaml#/properties/transfers``. Does not itself
    check cross-item uniqueness -- that is ``generate_cross_industry_transfer_set``'s own job."""
    record = {
        "id": transfer_id,
        "source_industry": source_industry,
        "target_industry": target_industry,
        "shared_job_or_constraint": shared_job_or_constraint,
        "source_mechanism": source_mechanism,
        "adaptation": adaptation,
    }
    problem = _transfer_problem(record)
    if problem is not None:
        raise InvariantViolation(f"XIND_INVALID_TRANSFER: {problem}")
    return record


def generate_cross_industry_transfer_set(
    record_id: str,
    transfers: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cross-industry-transfer.schema.yaml``.

    Rebuilds every ``transfers[]`` item via ``transfer()`` (never trusting the caller's raw dicts), then
    enforces the record-level invariant fail-closed: at least one transfer declared, and no two transfers share
    the same ``id``.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"XIND_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"XIND_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("XIND_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(transfers, list) or not transfers:
        raise InvariantViolation("XIND_NO_TRANSFERS: at least 1 transfer is required -- Atlas L675's own row has nothing to transfer otherwise")
    rebuilt: list[dict[str, Any]] = []
    for i, t in enumerate(transfers):
        if not isinstance(t, dict) or not _TRANSFER_KEYS <= t.keys():
            raise InvariantViolation(f"XIND_INVALID_TRANSFER: transfers[{i}] must be a {{{sorted(_TRANSFER_KEYS)}}} object, got {t!r}")
        rebuilt.append(transfer(t["id"], t["source_industry"], t["target_industry"], t["shared_job_or_constraint"], t["source_mechanism"], t["adaptation"]))

    ids = [t["id"] for t in rebuilt]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"XIND_DUPLICATE_TRANSFER_ID: transfers[] ids must be unique, duplicates found: {duplicate_ids}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "transfers": rebuilt,
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


def evaluate_transfer_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the per-transfer shape invariant directly from raw fields via the SAME ``_transfer_problem``
    predicate the builder uses -- catches a hand-tampered record that bypassed the builder entirely (e.g. a
    same-industry transfer, or a missing ``adaptation``/``shared_job_or_constraint``). Fails closed on malformed
    entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("transfer_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    transfers = record.get("transfers")
    if not isinstance(transfers, list):
        return _result("transfer_completeness", False, [{"reason": "transfers must be a list"}], validator, timestamp)
    problems = [f"transfers[{i}]: {problem}" for i, problem in ((i, _transfer_problem(t)) for i, t in enumerate(transfers)) if problem]
    # Re-derives XIND_DUPLICATE_TRANSFER_ID independently -- a critic pass found this gate suite returned
    # all-PASS on a hand-tampered record with two transfers sharing an id, even though the builder refuses it.
    ids = [t.get("id") if isinstance(t, dict) else None for t in transfers]
    duplicate_ids = sorted({i for i in ids if i is not None and ids.count(i) > 1}, key=repr)
    if duplicate_ids:
        problems.append(f"duplicate transfer id(s): {duplicate_ids}")
    passed = not problems
    return _result("transfer_completeness", passed, [{"transfers_checked": len(transfers), "problems": problems}], validator, timestamp)


def evaluate_min_transfers_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the record-level 'at least one transfer' invariant directly from raw fields."""
    if not isinstance(record, dict):
        return _result("min_transfers_declared", False, [{"reason": "record is not a dict"}], validator, timestamp)
    transfers = record.get("transfers")
    passed = isinstance(transfers, list) and len(transfers) >= 1
    return _result("min_transfers_declared", passed, [{"transfers_count": len(transfers) if isinstance(transfers, list) else None}], validator, timestamp)


def evaluate_cross_industry_transfer_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_transfer_completeness_gate(record, validator, timestamp),
        evaluate_min_transfers_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
