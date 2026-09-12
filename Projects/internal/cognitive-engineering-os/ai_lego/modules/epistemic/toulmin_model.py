"""``epistemic.toulmin_model`` -- F10 epistemic-quality family (Atlas L566-600).

Atlas's own table row (L574, verbatim): "Toulmin Model | Claim/Grounds/
Warrant/Backing/Qualifier/Rebuttal | 逐欄填寫 | 防止缺推理橋梁" (fill in
column by column; prevent a missing reasoning bridge).

Real invariant (the missing bridge), enforced at TWO independent layers,
same belt-and-suspenders discipline every prior slice in this corpus
establishes: `warrant` IS the reasoning bridge Atlas's own effect column
names -- a record carrying a `claim` and `grounds` but an empty/
whitespace-only `warrant` is a bare assertion wearing a Toulmin costume, and
is refused at construction, not silently stored. A second, related
invariant: `backing` may only be non-empty if `warrant` is non-blank
(backing by definition supports the warrant; backing with no warrant to
back is structurally incoherent). Checked in that order at construction time
so BOTH error codes are independently reachable from different input
combinations (a backing-populated/warrant-blank call raises
``TOULMIN_BACKING_WITHOUT_WARRANT`` before the unconditional
``TOULMIN_MISSING_WARRANT`` check is ever reached), not just the first one
shadowing the second.

Grepped `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS` and
`Projects/internal/cognitive-engineering-os` case-insensitively for
"toulmin"/"warrant"/"argument" and every schema title, before writing any of
this method's own files: the only real overlap found was
`specs/evidence/claim.schema.yaml`'s own incidental citation of this same
Atlas row (see `typed-objects/toulmin-argument.schema.yaml`'s
`overlap_check_against_evidence_claim_types` for the full reasoning on why
`claim` here stays free text rather than a hard `$ref` to that persisted
record).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.toulmin_model"
RECORD_ID_PREFIX = "TOULMIN-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_str_list(name: str, values: Any) -> list[str]:
    """Rebuilds ``values`` into a fresh list of non-empty strings, or raises. ``None`` is treated as "not
    supplied" (the empty list), matching the schema's own ``default: []`` for ``grounds``/``backing``. Rebuilding
    into a NEW list (not aliasing the caller's own list object) avoids the nested-list-aliasing defect a critic
    pass found in this corpus's F09 batch -- see WORKLOG 2026-09-12 F09 entry."""
    if values is None:
        return []
    if not isinstance(values, list):
        raise InvariantViolation(f"TOULMIN_INVALID_LIST: {name} must be a list, got {type(values).__name__}")
    rebuilt: list[str] = []
    for i, item in enumerate(values):
        if not _is_nonempty_str(item):
            raise InvariantViolation(f"TOULMIN_INVALID_LIST_ITEM: {name}[{i}] must be a non-empty string, got {item!r}")
        rebuilt.append(item)
    return rebuilt


def generate_toulmin_argument(
    record_id: str,
    claim: str,
    grounds: list[str],
    warrant: str,
    provenance: dict[str, Any],
    *,
    backing: list[str] | None = None,
    qualifier: str | None = None,
    rebuttal: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/toulmin-argument.schema.yaml``.

    Enforces the method contract's own precondition (claim, at least one
    grounds statement, a non-blank warrant) and Atlas L574's own
    missing-bridge/backing-without-warrant rules fail-closed, before
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TOULMIN_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TOULMIN_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TOULMIN_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(claim):
        raise InvariantViolation(f"TOULMIN_INVALID_CLAIM: claim must be a non-empty string, got {claim!r}")

    grounds_list = _validate_str_list("grounds", grounds)
    if not grounds_list:
        raise InvariantViolation("TOULMIN_NO_GROUNDS: at least one grounds statement is required (methods/contracts/epistemic.toulmin_model.contract.yaml precondition)")
    backing_list = _validate_str_list("backing", backing)

    warrant_is_blank = not _is_nonempty_str(warrant)
    if backing_list and warrant_is_blank:
        raise InvariantViolation(
            "TOULMIN_BACKING_WITHOUT_WARRANT: backing is populated while warrant is blank -- Atlas L574's own "
            "'Backing' column supports the warrant; there is no warrant to back"
        )
    if warrant_is_blank:
        raise InvariantViolation(
            "TOULMIN_MISSING_WARRANT: warrant must be a non-blank string -- it is the reasoning bridge Atlas L574's "
            "own effect column names (防止缺推理橋梁); a claim+grounds pair with no warrant is a bare assertion, not a Toulmin argument"
        )

    if qualifier is not None and not isinstance(qualifier, str):
        raise InvariantViolation(f"TOULMIN_INVALID_QUALIFIER: qualifier must be a string or None, got {type(qualifier).__name__}")
    if rebuttal is not None and not isinstance(rebuttal, str):
        raise InvariantViolation(f"TOULMIN_INVALID_REBUTTAL: rebuttal must be a string or None, got {type(rebuttal).__name__}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "claim": claim,
        "grounds": grounds_list,
        "warrant": warrant,
        "backing": backing_list,
        "qualifier": qualifier,
        "rebuttal": rebuttal,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_missing_bridge_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L574's own missing-bridge and backing-without-warrant rules directly from the raw record
    -- not just trusting that ``generate_toulmin_argument``'s own construction-time check already ran (a
    hand-crafted/tampered record must still be caught, same discipline every prior slice's gate-re-derivation
    already established)."""
    if not isinstance(record, dict):
        return _result("missing_bridge", False, [{"reason": "record is not a dict"}], validator, timestamp)
    warrant = record.get("warrant")
    backing = record.get("backing")
    warrant_is_blank = not (isinstance(warrant, str) and warrant.strip())
    problems: list[str] = []
    record_id = record.get("id")
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")
    if warrant_is_blank:
        problems.append("warrant must be a non-blank string (Atlas L574: 防止缺推理橋梁)")
    if isinstance(backing, list) and backing and warrant_is_blank:
        problems.append("backing is populated while warrant is blank")
    passed = not problems
    return _result("missing_bridge", passed, [{"problems": problems}], validator, timestamp)


def evaluate_toulmin_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_missing_bridge_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
