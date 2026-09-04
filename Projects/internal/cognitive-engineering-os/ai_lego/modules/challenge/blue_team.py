"""``challenge.blue_team`` -- twenty-sixth Method Atlas slice, SECOND from the ``challenge`` family (F12),
directly closing half of ``challenge.red_team``'s own ``OQ-REDTEAM-1``.

Atlas §11.24's own purpose line (L1742, "不是盲目支持原方案，而是把方案
steelman 到最強版本" -- not blindly endorsing the original proposal, but
steelmanning it to its strongest version) and the F12 tool table's own
benefit column (L645: "避免只破壞不改善") together directly imply a real
invariant this module enforces: a review that records ZERO improvements
did not actually steelman anything. This is a DELIBERATE TIGHTENING
relative to ``challenge.red_team``'s own sibling precondition, not the
same class -- ``generate_red_team_challenge`` explicitly permits zero
findings (a dimension may be examined and found clean); this method does
not permit zero improvements (see the method contract's own
``compilation_decisions`` for the critic-caught correction of an earlier
"same class" mischaracterization).

Deliberately does NOT mirror Red Team's own explicit no-final-authority
structural enforcement (``assert_no_authority_claim`` /
``additionalProperties: false`` at the top level) -- Atlas gives that
rule (L1735) only for Red Team, not for Blue Team, and §22.3's own
closed Method-specific Gate table (L4144-4155) independently omits Blue
Team too; see
``methods/contracts/challenge.blue_team.contract.yaml``'s own
``compilation_decisions`` for why extending it here by analogy from the
3-step pairing would be an invention this session's every Tier 1
contract has consistently refused to make. The NESTED improvement item
shape IS closed at the schema layer (``additionalProperties: false`` on
``improvements[].items``), for a different, unrelated reason -- see the
schema's own description.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.blue_team"
VALID_CATEGORIES = frozenset({"CONTROLS", "EVIDENCE", "FALLBACK", "MONITORING", "RECOVERY"})


def improvement(improvement_id: str, category: str, description: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/blue-team-review.schema.yaml#/properties/improvements``."""
    if category not in VALID_CATEGORIES:
        raise InvariantViolation(f"BLUETEAM_INVALID_CATEGORY: {category!r} is not one of {sorted(VALID_CATEGORIES)} (Atlas L1744-1748 category list)")
    if not description or not description.strip():
        raise InvariantViolation(f"BLUETEAM_EMPTY_IMPROVEMENT_DESCRIPTION: improvement {improvement_id!r} must have a non-empty description")
    record: dict[str, Any] = {"id": improvement_id, "category": category, "description": description, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_blue_team_review(
    review_id: str,
    proposal_ref: str,
    improvements: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/blue-team-review.schema.yaml``. Enforces the method contract's own
    precondition fail-closed: at least one improvement recorded, every improvement a well-shaped dict, and
    every improvement's category a real Atlas-cited value. Accepts hand-built improvement dicts (not just
    ones produced by ``improvement()``) as a legitimate input shape -- validates them here rather than
    assuming ``improvement()`` was the only path that produced them, since a caller-constructed dict bypassing
    ``improvement()`` entirely is a real, legal use of this function's own public signature."""
    if not improvements:
        raise InvariantViolation("BLUETEAM_NO_IMPROVEMENTS_RECORDED: methods/contracts/challenge.blue_team.contract.yaml requires at least one improvement -- a review that strengthens nothing did not steelman the proposal (Atlas §11.24 L1742)")
    for item in improvements:
        if not isinstance(item, dict):
            raise InvariantViolation(f"BLUETEAM_INVALID_IMPROVEMENT_SHAPE: each improvement must be a dict, got {item!r}")
    unknown_categories = sorted({repr(item.get("category")) for item in improvements if item.get("category") not in VALID_CATEGORIES})
    if unknown_categories:
        raise InvariantViolation(f"BLUETEAM_INVALID_CATEGORY: {unknown_categories} not in {sorted(VALID_CATEGORIES)}")

    return {
        "id": review_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "proposal_ref": proposal_ref,
        "improvements": list(improvements),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(review: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every improvement and the overall record carry a
    schema-valid provenance_record. FAILS CLOSED on a malformed improvement item (not a dict, or missing an
    ``id``) rather than raising -- a gate whose own re-derivation crashes on the exact kind of hand-tampered
    input it exists to catch is not a genuine independent check, the same lesson a critic review already
    taught this session for a sibling slice's own gate (WORKLOG continuation 38)."""
    improvements = review.get("improvements") or []
    invalid: list[Any] = []
    for item in improvements:
        if not isinstance(item, dict):
            invalid.append(repr(item))
            continue
        if not provenance_is_valid(item.get("provenance")):
            invalid.append(item.get("id", repr(item)))
    overall_valid = provenance_is_valid(review.get("provenance"))
    passed = not invalid and overall_valid
    return _result("provenance_required", passed, [{"improvements_checked": len(improvements), "invalid_provenance_ids": invalid, "overall_provenance_valid": overall_valid}], validator, timestamp)


def evaluate_at_least_one_improvement_gate(review: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the at-least-one-improvement invariant structurally on any record handed to it -- not just
    trusting that generate_blue_team_review's own construction-time check already ran (a hand-crafted/tampered
    record, e.g. improvements emptied after construction, must still be caught). Also fails closed if
    ``improvements`` is not a list at all (e.g. hand-tampered to a bare string, whose ``len()`` would otherwise
    count characters, not improvements)."""
    improvements = review.get("improvements")
    if not isinstance(improvements, list):
        return _result("at_least_one_improvement", False, [{"improvement_count": None, "reason": f"improvements is not a list: {type(improvements).__name__}"}], validator, timestamp)
    passed = len(improvements) >= 1
    return _result("at_least_one_improvement", passed, [{"improvement_count": len(improvements)}], validator, timestamp)


def evaluate_blue_team_gates(review: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(review, validator, timestamp),
        evaluate_at_least_one_improvement_gate(review, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
