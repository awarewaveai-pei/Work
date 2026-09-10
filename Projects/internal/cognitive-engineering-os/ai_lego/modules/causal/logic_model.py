"""``causal.logic_model`` -- F11 causal family, 2nd member (``causal.dag`` was the 1st; see ``dag.py``).

Atlas's ONLY citation for this method is the F11 tool table's own row (L619:
"Logic Model｜結構化 program｜inputs→activities→outputs→short/long
outcomes｜便於 KPI 與評估") -- grep-confirmed the single "Logic Model" hit
anywhere in the Atlas file, no dedicated section (same thin-citation class
``root_cause.kepner_tregoe``'s own L440 row already establishes for a
different family).

Structurally a FOURTH shape for this family after Causal DAG's graph: a
fixed 5-stage, positionally-ordered PIPELINE (same class
``root_cause.kepner_tregoe``'s own 4-dimension IS/IS-NOT grid already
establishes, reused here for a longer chain with no cross-field
comparison).

**Disambiguation from ``causal.theory_of_change`` (built concurrently, same
batch)**: the two Atlas rows share 4 of their 5 pipeline-stage words
(inputs/activities/outputs/outcomes) but differ in two real structural
ways this module deliberately does NOT collapse: (1) Theory of Change's own
citation (L618) has a real extra stage (IMPACT) and a real extra field
(per-transition ASSUMPTIONS) Logic Model's own citation (L619) simply does
not ask for -- this module's own ``STAGE_ORDER`` stops at
``LONG_TERM_OUTCOMES``, one stage shorter, and invents no assumptions
concept; (2) Logic Model's own benefit column ("便於 KPI 與評估") is a
MEASUREMENT framing, encoded here as a real structural requirement (every
outcome stage needs at least one indicator) that Theory of Change's own
citation does not name. See ``methods/contracts/causal.logic_model.contract.yaml``'s
own ``compilation_decisions`` for the full investigation.

Two real invariants, each enforced BOTH at construction (raise BEFORE any
record is built) AND independently by a gate that re-derives from raw
fields, never trusting a stored value -- the same "shared predicate, reused
by both layers" discipline ``ai_lego.modules.root_cause.kepner_tregoe``
already establishes:

1. ``stages`` is EXACTLY the five entries ``STAGE_ORDER``, one each,
   POSITIONALLY in that literal order (Atlas's own L619 arrow-chain), each
   with a non-empty ``description``.
2. Every ``SHORT_TERM_OUTCOMES``/``LONG_TERM_OUTCOMES`` stage carries a
   non-empty ``indicators`` list (at least one non-empty string) -- Atlas's
   own benefit line presumes an outcome stage is actually measurable; an
   outcome stage naming no way to measure it fails this method's own
   defining, cited purpose. ``INPUTS``/``ACTIVITIES``/``OUTPUTS`` stages MAY
   carry indicators too but are not required to.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.logic_model"
RECORD_ID_PREFIX = "LGM-"
STAGE_ORDER: tuple[str, ...] = ("INPUTS", "ACTIVITIES", "OUTPUTS", "SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES")
# Atlas's own literal L619 arrow-chain ("inputs→activities→outputs→short/long outcomes"), transcribed verbatim
# and in Atlas's own order -- the same "positionally-ordered pipeline" invariant class
# root_cause.kepner_tregoe's own DIMENSION_ORDER already establishes for a 4-entry grid.
OUTCOME_STAGES: frozenset[str] = frozenset({"SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES"})
# Atlas's own benefit column ("便於 KPI 與評估") is specifically about measuring RESULTS -- see module docstring.

_STAGE_REQUIRED_KEYS = frozenset({"stage", "description", "provenance"})
_STAGE_ALLOWED_KEYS = _STAGE_REQUIRED_KEYS | frozenset({"indicators", "supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _indicators_shape_ok(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _stages_are_valid(stages: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. ``failure_reason`` lets the builder raise a SPECIFIC
    InvariantViolation code and lets the gate report a specific evidence reason from the exact same
    computation -- no divergent logic between the two layers.

    Real invariant: exactly 5 entries, one per STAGE_ORDER value, POSITIONALLY in that literal order, each
    with a non-empty description, and every SHORT_TERM_OUTCOMES/LONG_TERM_OUTCOMES entry carrying a
    non-empty indicators[]."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False, "SHAPE"
    for position, expected_stage in enumerate(STAGE_ORDER):
        entry = stages[position]
        if not _shaped(entry, _STAGE_REQUIRED_KEYS, _STAGE_ALLOWED_KEYS):
            return False, "SHAPE"
        if entry.get("stage") != expected_stage:
            return False, "SHAPE"
        if not _is_nonempty_str(entry.get("description")):
            return False, "EMPTY_DESCRIPTION"
        indicators = entry.get("indicators")
        if indicators is not None and not _indicators_shape_ok(indicators):
            return False, "SHAPE"
        if expected_stage in OUTCOME_STAGES and not indicators:
            return False, "OUTCOME_MISSING_INDICATOR"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
    return True, None


def stage_entry(
    stage: str,
    description: str,
    provenance: dict[str, Any],
    *,
    indicators: list[str] | None = None,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/logic-model-record.schema.yaml#/properties/stages``. Convenience
    constructor only -- emits ONLY known-good keys; does NOT itself enforce shape validity
    (``generate_logic_model`` validates whatever dict it is handed regardless of how it was built)."""
    record: dict[str, Any] = {"stage": stage, "description": description, "provenance": provenance}
    if indicators:
        record["indicators"] = list(indicators)
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_logic_model(
    record_id: str,
    program_name: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/logic-model-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before-
    construction" discipline ``causal.dag``/``root_cause.kepner_tregoe`` already establish -- never a
    record that itself proves it was built illegally.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LOGICMODEL_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LOGICMODEL_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(program_name):
        raise InvariantViolation(f"LOGICMODEL_EMPTY_PROGRAM_NAME: program_name must be a non-empty string, got {program_name!r}")

    stages_ok, reason = _stages_are_valid(stages)
    if not stages_ok:
        if reason == "EMPTY_DESCRIPTION":
            raise InvariantViolation(f"LOGICMODEL_EMPTY_DESCRIPTION: every one of {STAGE_ORDER} must carry a non-empty 'description' entry, got {stages!r}")
        if reason == "OUTCOME_MISSING_INDICATOR":
            raise InvariantViolation(
                f"LOGICMODEL_OUTCOME_MISSING_INDICATOR: every one of {sorted(OUTCOME_STAGES)} must carry a non-empty 'indicators' list (at least "
                f"one non-empty string) -- an outcome stage with no indicator cannot deliver Atlas L619's own '便於 KPI 與評估' benefit, got {stages!r}"
            )
        raise InvariantViolation(
            f"LOGICMODEL_INVALID_STAGE_SET: stages must be EXACTLY the five entries {STAGE_ORDER} in that literal order, well-shaped, got {stages!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "program_name": program_name,
        "generated_by_method": generated_by_method,
        "stages": [dict(s) for s in stages],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every stage AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stages = record.get("stages")
    stages = stages if isinstance(stages, list) else []
    invalid = [s.get("stage") for s in stages if isinstance(s, dict) and not provenance_is_valid(s.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(stages) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"stages_checked": len(stages), "invalid_provenance_stages": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``causal.dag``/``root_cause.kepner_tregoe`` already use: an EVIDENCE-labeled stage must actually cite
    supporting_evidence_refs."""
    stages = record.get("stages") if isinstance(record, dict) else None
    stages = stages if isinstance(stages, list) else []
    problems: list[dict[str, Any]] = []
    for s in stages:
        if not isinstance(s, dict):
            continue
        epistemic_type = (s.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"stage": s.get("stage"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not s.get("supporting_evidence_refs"):
            problems.append({"stage": s.get("stage"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(stages) and not problems
    return _result("evidence_labeling_required", passed, [{"stages_checked": len(stages), "problems": problems}], validator, timestamp)


def evaluate_logic_model_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_logic_model``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("logic_model_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("logic_model_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("logic_model_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("program_name")):
        return _result("logic_model_integrity", False, [{"reason": "program_name missing or empty"}], validator, timestamp)

    stages_ok, reason = _stages_are_valid(record.get("stages"))
    if not stages_ok:
        return _result(
            "logic_model_integrity",
            False,
            [{"reason": f"stages invalid ({reason}) -- must be exactly {STAGE_ORDER} in that literal order, each with non-empty description, outcome stages carrying non-empty indicators"}],
            validator,
            timestamp,
        )

    return _result("logic_model_integrity", True, [{"stage_count": len(record["stages"])}], validator, timestamp)


def evaluate_logic_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties,
    then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_logic_model_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
