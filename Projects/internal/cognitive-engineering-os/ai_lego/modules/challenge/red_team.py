"""``challenge.red_team`` -- ninth Method Atlas slice, first from the ``challenge`` family (F12), sixth structural
shape this session (a checklist-structured critique, not a chain/ranking/graph/matrix/monitoring rule).

Atlas §11.23's own explicit rule (L1735, verbatim): "Red Team 沒有 final
authority，只能輸出 challenge artifact" (Red Team has no final authority;
it may only output a challenge artifact). Enforced at TWO independent
layers, same belt-and-suspenders discipline every prior slice this session
established: ``assert_no_authority_claim`` refuses to construct a record
carrying any authority-shaped key BEFORE the schema ever sees it, and
``typed-objects/red-team-challenge.schema.yaml``'s own ``additionalProperties:
false`` independently refuses a hand-crafted bypass -- the strongest
structural enforcement any typed-object schema built this session uses.

Due-diligence lesson applied (2026-09-04, same session, from the
``learning.reversal_criteria`` duplicate-schema correction): the full spec
root was grepped for "red team"/"challenge artifact" and every schema
title, BEFORE this module was written, not after.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.red_team"
VALID_DIMENSIONS = frozenset(
    {"ASSUMPTIONS", "LOGIC", "MISSING_VARIABLES", "COUNTEREXAMPLES", "SECURITY", "PRIVACY", "LEGAL", "CULTURE", "OPERATIONS", "STATISTICAL_VALIDITY", "OVERCONFIDENCE"}
)
# Keys that would assert final authority over the proposal being challenged -- Atlas L1735 forbids this method's
# output from ever carrying any of them, regardless of value. Not an exhaustive dictionary of every possible bad
# key (that would be an unwinnable enumeration); a representative blocklist for the runtime layer's own defense
# -- the schema's additionalProperties:false is the exhaustive, structural second layer.
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "verdict", "final_decision", "authorized", "decision", "outcome"})


def finding(finding_id: str, dimension: str, description: str, provenance: dict[str, Any], *, severity: str | None = None, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/red-team-challenge.schema.yaml#/properties/findings``."""
    if dimension not in VALID_DIMENSIONS:
        raise InvariantViolation(f"REDTEAM_INVALID_DIMENSION: {dimension!r} is not one of {sorted(VALID_DIMENSIONS)} (Atlas L1720-1732 checklist)")
    record: dict[str, Any] = {"id": finding_id, "dimension": dimension, "description": description, "provenance": provenance}
    if severity is not None:
        record["severity"] = severity
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def assert_no_authority_claim(record: dict[str, Any]) -> None:
    """Atlas L1735's own rule, checked structurally. Raises if ``record`` (or any of its ``findings[]`` items)
    carries a key shaped like a final-authority claim -- checked BEFORE the record is returned/persisted, the same
    "raise before construction, don't rely only on the schema" discipline every prior slice's own forbidden-
    transition/failure-mode guards already established. Guards ``isinstance(record, dict)`` itself -- a non-dict
    record must fail closed via InvariantViolation, not crash with AttributeError from ``record.keys()`` (the
    same guard ``decision.mcda``'s own equivalent now also applies)."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"REDTEAM_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    top_level_violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if top_level_violations:
        raise InvariantViolation(f"REDTEAM_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(top_level_violations)} assert final authority (Atlas §11.23 L1735: Red Team has no final authority)")
    for item in record.get("findings", []):
        violations = FORBIDDEN_AUTHORITY_KEYS & item.keys()
        if violations:
            raise InvariantViolation(f"REDTEAM_AUTHORITY_CLAIM_FORBIDDEN: finding {item.get('id')!r} carries key(s) {sorted(violations)} that assert final authority")


def generate_red_team_challenge(
    challenge_id: str,
    proposal_ref: str,
    dimensions_examined: list[str],
    findings: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/red-team-challenge.schema.yaml``.

    Enforces the method contract's own precondition (at least one
    dimension examined) and the cross-field invariant the schema itself
    cannot express (every finding's ``dimension`` must be a member of
    ``dimensions_examined``) fail-closed, then ``assert_no_authority_claim``
    before returning.
    """
    unknown = sorted(set(dimensions_examined) - VALID_DIMENSIONS)
    if unknown:
        raise InvariantViolation(f"REDTEAM_INVALID_DIMENSION: {unknown} not in {sorted(VALID_DIMENSIONS)}")
    if not dimensions_examined:
        raise InvariantViolation("REDTEAM_NO_DIMENSIONS_EXAMINED: methods/contracts/challenge.red_team.contract.yaml requires at least one dimension examined")
    examined = set(dimensions_examined)
    out_of_scope = sorted({f["dimension"] for f in findings} - examined)
    if out_of_scope:
        raise InvariantViolation(f"REDTEAM_FINDING_OUTSIDE_EXAMINED_DIMENSIONS: {out_of_scope} not in dimensions_examined {sorted(examined)}")

    record: dict[str, Any] = {
        "id": challenge_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "proposal_ref": proposal_ref,
        "dimensions_examined": list(dimensions_examined),
        "findings": list(findings),
        "provenance": provenance,
    }
    assert_no_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(challenge: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every finding and the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(challenge, dict):
        return _result("provenance_required", False, [{"reason": "challenge is not a dict"}], validator, timestamp)
    findings = challenge.get("findings", [])
    invalid = [f["id"] for f in findings if not provenance_is_valid(f.get("provenance"))]
    overall_valid = provenance_is_valid(challenge.get("provenance"))
    passed = not invalid and overall_valid
    return _result("provenance_required", passed, [{"findings_checked": len(findings), "invalid_provenance_ids": invalid, "overall_provenance_valid": overall_valid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(challenge: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- an unevidenced Red Team finding ('this is
    insecure') is exactly as dangerous as an unevidenced Fishbone cause hypothesis: a finding claiming the
    EVIDENCE label must actually cite evidence. FAILS CLOSED on a malformed finding (not a dict) rather than
    crashing -- a critic review of this family's own third slice (challenge.independent_judge, WORKLOG
    continuation 40) found this exact crash-instead-of-FAIL shape in this gate's own port and fixed it there;
    applied back here since the underlying bug is identical. Also guards ``isinstance(challenge, dict)`` itself
    -- the per-finding check above only protects a malformed ENTRY inside ``findings``, not a ``challenge``
    argument that is not a dict at all."""
    if not isinstance(challenge, dict):
        return _result("evidence_labeling_required", False, [{"reason": "challenge is not a dict"}], validator, timestamp)
    findings = challenge.get("findings", [])
    problems: list[dict[str, Any]] = []
    for f in findings:
        if not isinstance(f, dict):
            problems.append({"id": repr(f), "reason": "not a dict"})
            continue
        provenance = f.get("provenance")
        epistemic_type = provenance.get("epistemic_type") if isinstance(provenance, dict) else None
        if epistemic_type is None:
            problems.append({"id": f.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not f.get("supporting_evidence_refs"):
            problems.append({"id": f.get("id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = not problems
    return _result("evidence_labeling_required", passed, [{"findings_checked": len(findings), "problems": problems}], validator, timestamp)


def evaluate_no_authority_claim_gate(challenge: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas L1735's rule structurally on any record handed to it -- not just trusting that
    generate_red_team_challenge's own construction-time check already ran (a hand-crafted/tampered record must
    still be caught, same discipline every prior slice's gate-re-derivation already established)."""
    try:
        assert_no_authority_claim(challenge)
        return _result("no_final_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_final_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_red_team_gates(challenge: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(challenge, validator, timestamp),
        evaluate_evidence_labeling_required_gate(challenge, validator, timestamp),
        evaluate_no_authority_claim_gate(challenge, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
