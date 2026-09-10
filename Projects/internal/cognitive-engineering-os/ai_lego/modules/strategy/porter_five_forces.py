"""``strategy.porter_five_forces`` -- F08 context/strategy family, 2nd member (``strategy.swot`` was the
1st; see ``swot.py``, read in full as this module's primary repo-convention template, not edited).

Atlas cites this method TWICE: the F08 tool table row (L520: "分析產業結構｜rivalry/new entrants/
substitutes/supplier/buyer｜長期產業吸引力｜Benchmark") and a dedicated §12.11 section (L2659-2675) naming
the five forces explicitly by name (Industry Rivalry / New Entrants / Substitutes / Supplier Power / Buyer
Power) plus the method's own stated benefit ("長期產業吸引力" -- long-term industry attractiveness) and a
stated limitation ("數位平台、network effects、ecosystem 常需補 Platform Strategy" -- digital platforms/
network effects/ecosystems often need supplementary Platform Strategy analysis; disclosed as
OQ-PORTERFIVEFORCESANALYSIS-1 in the typed-object schema, not mechanically enforced here -- no citation
gives a structural test for "is this industry a digital platform").

**Design-shape investigation (task-mandated, disclosed here)**: read ``causal/dag.py``'s ``VALID_ROLES`` (a
closed ENUM with NO completeness requirement -- any subset of roles may appear across a DAG's nodes) and
``causal/logic_model.py``'s ``STAGE_ORDER`` (a closed, POSITIONALLY-ordered 5-tuple -- exactly one entry per
stage, in that literal sequence, because Atlas's own citation is an arrow-chain pipeline) before choosing
this method's own shape. Porter's five forces have no cited sequence or pipeline between them (unlike Logic
Model's inputs->activities->outputs->outcomes arrow-chain) -- Atlas's own §12.11 lists them as a flat,
unordered list. So ``FORCE_NAMES`` below is a THIRD shape, distinct from both precedents: a closed SET (like
``VALID_ROLES``) but WITH a completeness requirement neither precedent combines alone -- ``VALID_ROLES``
allows any subset, ``STAGE_ORDER`` requires positional order AND completeness. Porter Five Forces requires
completeness (all 5, Atlas's own definition of the method IS the five-way split -- a record naming only 4 of
5 forces has not actually done a Porter Five Forces analysis) WITHOUT position (the 5 entries may appear in
any order in ``forces[]`` -- order carries no meaning Atlas cites).

Real invariants (grounded in Atlas L520/§12.11, each enforced BOTH at construction, raise BEFORE any record
is built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer
discipline every sibling module in this package already establishes):

1. ``forces`` is EXACTLY the 5 ``FORCE_NAMES`` values, each appearing EXACTLY ONCE, in ANY order (unordered
   completeness -- see design-shape note above). Missing, duplicated, or unrecognized force names are all
   refused.
2. Every force entry carries a non-empty ``assessment`` (the actual analysis content) and an ``intensity`` in
   the closed judgment-call enum ``{HIGH, MEDIUM, LOW}`` -- a DISCLOSED human/AI judgment, never a computed
   score (task-mandated restraint: no citation supports a mechanical HIGH/MEDIUM/LOW-from-inputs formula).
3. ``overall_attractiveness`` (top-level, required, non-empty) -- Atlas's own stated benefit for this method
   IS this conclusion ("長期產業吸引力"); a record that labels all 5 forces but never states the resulting
   industry-attractiveness conclusion has not delivered the method's own defining benefit. Caller-supplied
   DISCLOSED judgment, never computed/derived from the 5 ``intensity`` values by this module (same restraint
   as invariant 2 -- no citation supports a mechanical aggregation formula).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "porter"/"five_forces" before writing any of this method's own files: zero pre-existing implementation
(only doc references -- architecture-inventory.yaml, ADR-008, MOTHER_DOC_SECTION_INDEX.md,
method-inventory.yaml, Master Plan, problem-type.schema.yaml recommended_start strings -- none is a real
contract/schema/module).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.porter_five_forces"
RECORD_ID_PREFIX = "PFF-"
FORCE_NAMES: frozenset[str] = frozenset({"INDUSTRY_RIVALRY", "NEW_ENTRANTS", "SUBSTITUTES", "SUPPLIER_POWER", "BUYER_POWER"})
# Atlas §12.11 (L2665-2670) verbatim five-line list, transcribed as SCREAMING_SNAKE_CASE. See module
# docstring's design-shape investigation for why this is a closed SET requiring completeness (unlike
# causal.dag's VALID_ROLES, any-subset) but WITHOUT position (unlike causal.logic_model's STAGE_ORDER).
VALID_INTENSITIES: frozenset[str] = frozenset({"HIGH", "MEDIUM", "LOW"})
# Disclosed judgment-call enum (task-mandated) -- NOT a computed score. See module docstring invariant 2.

_FORCE_REQUIRED_KEYS = frozenset({"force", "intensity", "assessment", "provenance"})
_FORCE_ALLOWED_KEYS = _FORCE_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _force_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return _FORCE_REQUIRED_KEYS <= keys and keys <= _FORCE_ALLOWED_KEYS


def _forces_are_valid(forces: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(forces) != 5`` up front: a wrong COUNT (too few, too many,
    or the right count with a duplicate) is a completeness defect (``INCOMPLETE_FORCE_SET``), a distinct
    failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_FORCE``/etc). Checking count-and-membership
    together, after the per-entry loop, is what lets a too-short list (e.g. 4 entries, all individually
    well-formed) report the correct ``INCOMPLETE_FORCE_SET`` reason instead of being misclassified as a
    generic shape defect."""
    if not isinstance(forces, list):
        return False, "SHAPE"
    seen_names: list[str] = []
    for entry in forces:
        if not _force_entry_shaped(entry):
            return False, "SHAPE"
        force = entry.get("force")
        if force not in FORCE_NAMES:
            return False, "UNKNOWN_FORCE"
        seen_names.append(force)
        if not _is_nonempty_str(entry.get("assessment")):
            return False, "EMPTY_ASSESSMENT"
        if entry.get("intensity") not in VALID_INTENSITIES:
            return False, "INVALID_INTENSITY"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
    if len(seen_names) != len(FORCE_NAMES) or set(seen_names) != FORCE_NAMES:
        return False, "INCOMPLETE_FORCE_SET"
    return True, None


def force_entry(
    force: str,
    intensity: str,
    assessment: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/porter-five-forces-analysis.schema.yaml#/properties/forces``. Convenience
    constructor only -- emits ONLY known-good keys; does NOT itself enforce the completeness/distinctness
    invariant (``generate_porter_five_forces_analysis`` validates whatever list of dicts it is handed
    regardless of how each entry was built, same convention ``causal/logic_model.py``'s own ``stage_entry``
    already establishes)."""
    if force not in FORCE_NAMES:
        raise InvariantViolation(f"PORTER_UNKNOWN_FORCE: {force!r} is not one of {sorted(FORCE_NAMES)} (Atlas §12.11 L2665-2670 five-force vocabulary)")
    if intensity not in VALID_INTENSITIES:
        raise InvariantViolation(f"PORTER_INVALID_INTENSITY: {intensity!r} is not one of {sorted(VALID_INTENSITIES)} (disclosed judgment call, not a computed score)")
    record: dict[str, Any] = {"force": force, "intensity": intensity, "assessment": assessment, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_porter_five_forces_analysis(
    analysis_id: str,
    forces: list[dict[str, Any]],
    overall_attractiveness: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/porter-five-forces-analysis.schema.yaml``.

    Enforces all three real invariants fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes -- never a record that itself proves it was
    built illegally.
    """
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PORTER_INVALID_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PORTER_INVALID_VERSION: version must be a string, got {version!r}")

    valid, reason = _forces_are_valid(forces)
    if not valid:
        if reason == "UNKNOWN_FORCE":
            raise InvariantViolation(f"PORTER_UNKNOWN_FORCE: forces contains a name outside {sorted(FORCE_NAMES)}, got {forces!r}")
        if reason == "EMPTY_ASSESSMENT":
            raise InvariantViolation(f"PORTER_EMPTY_ASSESSMENT: every force entry must carry a non-empty 'assessment', got {forces!r}")
        if reason == "INVALID_INTENSITY":
            raise InvariantViolation(f"PORTER_INVALID_INTENSITY: every force entry's 'intensity' must be one of {sorted(VALID_INTENSITIES)}, got {forces!r}")
        if reason == "INCOMPLETE_FORCE_SET":
            raise InvariantViolation(
                f"PORTER_INCOMPLETE_FORCE_SET: forces must name EXACTLY the five {sorted(FORCE_NAMES)}, each exactly once -- Atlas §12.11's own "
                f"five-way split IS the method's definition, a record naming only some of the 5 has not done a Porter Five Forces analysis, got {forces!r}"
            )
        raise InvariantViolation(f"PORTER_INVALID_FORCE_SET: forces must be exactly {len(FORCE_NAMES)} well-shaped entries, got {forces!r}")

    if not _is_nonempty_str(overall_attractiveness):
        raise InvariantViolation(
            f"PORTER_EMPTY_OVERALL_ATTRACTIVENESS: overall_attractiveness must be a non-empty string -- Atlas §12.11's own stated benefit for this "
            f"method IS this conclusion ('長期產業吸引力'), got {overall_attractiveness!r}"
        )

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "forces": [dict(f) for f in forces],
        "overall_attractiveness": overall_attractiveness,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every force entry AND the overall record carry a
    schema-valid provenance_record. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    forces = record.get("forces")
    forces = forces if isinstance(forces, list) else []
    invalid = [f.get("force") for f in forces if isinstance(f, dict) and not provenance_is_valid(f.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(forces) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"forces_checked": len(forces), "invalid_provenance_forces": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``strategy.swot``/``causal.dag``/``causal.logic_model``'s identical gate uses: a force entry claiming
    the EVIDENCE label must actually cite ``supporting_evidence_refs``. Grounded by same-family analogy to
    ``strategy.swot.contract.yaml``'s identical flag (see this method's own contract ``open_questions`` --
    Atlas §12.11 gives no explicit misuse warning the way SWOT's own L1347 does)."""
    forces = record.get("forces") if isinstance(record, dict) else None
    forces = forces if isinstance(forces, list) else []
    problems: list[dict[str, Any]] = []
    for f in forces:
        if not isinstance(f, dict):
            continue
        epistemic_type = (f.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"force": f.get("force"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not f.get("supporting_evidence_refs"):
            problems.append({"force": f.get("force"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(forces) and not problems
    return _result("evidence_labeling_required", passed, [{"forces_checked": len(forces), "problems": problems}], validator, timestamp)


def evaluate_porter_five_forces_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_porter_five_forces_analysis``, so a hand-tampered record that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been. Fails
    closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("porter_five_forces_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("porter_five_forces_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("porter_five_forces_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    valid, reason = _forces_are_valid(record.get("forces"))
    if not valid:
        return _result(
            "porter_five_forces_integrity",
            False,
            [{"reason": f"forces invalid ({reason}) -- must name exactly {sorted(FORCE_NAMES)}, each exactly once, well-shaped"}],
            validator,
            timestamp,
        )

    if not _is_nonempty_str(record.get("overall_attractiveness")):
        return _result("porter_five_forces_integrity", False, [{"reason": "EMPTY_OVERALL_ATTRACTIVENESS"}], validator, timestamp)

    return _result("porter_five_forces_integrity", True, [{"force_count": len(record["forces"])}], validator, timestamp)


def evaluate_porter_five_forces_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties,
    then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_porter_five_forces_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
