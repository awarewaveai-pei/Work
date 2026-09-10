"""``causal.theory_of_change`` -- F11 causal family (methods/contracts/causal.theory_of_change.contract.yaml).
7th F11 member, ``causal.dag`` built earlier this same batch (``counterfactual_reasoning``/``logic_model``/
``process_tracing``/``rct`` landing concurrently via 4 other agents in the same batch, not read here).

Atlas's citations: F11 table row (L618: "Theory of Change｜intervention 如何導致 outcome｜inputs→activities→
outputs→outcomes→impact＋assumptions｜建可驗證政策邏輯") plus dedicated §11.22 (L1689-1711): a 6-node mermaid
chain (Inputs -> Activities -> Outputs -> Short-term Outcomes -> Long-term Outcomes -> Impact) and one literal,
UNCONDITIONAL requirement -- "每條箭頭都應有：Assumption / Evidence / Indicator / Risk" -- attached to EVERY ONE
of the 5 transitions between adjacent stages, not the 6 stage labels themselves.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"theory_of_change" and "theory of change" -- zero pre-existing implementation. Grepped the whole Atlas file
case-insensitively for "Theory of Change" -- 5 additional corroborating (not primary) hits: F02's Objective
Tree row (L367, 最佳搭配 names Theory of Change as its own downstream), §12.8 Problem Tree 搭配 line (L2638,
"Problem Tree → Objective Tree → Theory of Change"), §13.1 Policy 起始推薦 row (L1110), and §13.7 Public Policy
Recipe (L3378-3394) -- all read, none add a field-level citation beyond what is transcribed above. Objective
Tree (F02) is unbuilt at this write time; per this task's own explicit scope, NOT turned into a dependency of
any kind here (see method contract's own open_questions).

**Structural point, taken literally (not just a docstring claim):** Atlas's own benefit column for this row is
"建可驗證政策邏輯" (build verifiable policy logic) -- a chain of unlabeled boxes is not verifiable, an
assumption/evidence/indicator/risk-labeled chain is. Two design choices make that literal: (1) ``stages`` is a
POSITIONALLY fixed 6-entry sequence (same ``prefixItems`` discipline ``ai_lego.modules.framing.five_w_one_h``'s
own ``dimensions`` already establishes); (2) ``transitions`` is a POSITIONALLY fixed 5-entry sequence whose
``from_stage``/``to_stage`` are BOTH locked to the correct adjacent pair by position AND named explicitly (same
edge-reference convention ``ai_lego.modules.association.concept_map``'s own edges already establish) -- a
hybrid of both sibling conventions, and every entry's ``assumption``/``evidence``/``indicator``/``risk`` are
required non-empty, UNCONDITIONALLY -- Atlas's own "每條箭頭都應有" carries no exception.

Unlike ``framing.five_w_one_h``'s ``information_gaps`` or ``association.concept_map``'s ``orphan_node_ids``,
this method has no GENUINE_COMPUTE derived field: Atlas's own benefit column names no gap/orphan-style
computed property, so none is invented (same "no invented third invariant" restraint
``ai_lego.modules.causal.dag``'s own ``acyclic_verified``-as-structural-const, not a derived comparison field,
already applies).

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. ``stages`` is EXACTLY the six entries {INPUTS, ACTIVITIES, OUTPUTS, SHORT_TERM_OUTCOMES,
   LONG_TERM_OUTCOMES, IMPACT}, one each, POSITIONALLY in that literal Atlas mermaid order; each entry
   well-shaped with a non-empty ``description``.
2. ``transitions`` is EXACTLY the five adjacent-stage-pairs, one each, POSITIONALLY in that literal order
   (transitions[i] connects stages[i] to stages[i+1]); each entry well-shaped, with non-empty ``assumption``/
   ``evidence``/``indicator``/``risk`` -- unconditional, the real invariant this method exists to make real.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.theory_of_change"
RECORD_ID_PREFIX = "TOC-"
STAGE_ORDER: tuple[str, ...] = ("INPUTS", "ACTIVITIES", "OUTPUTS", "SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES", "IMPACT")
# Atlas §11.22's own literal 6-node mermaid chain order (L1695-1700), transcribed verbatim.
TRANSITION_STAGE_PAIRS: tuple[tuple[str, str], ...] = tuple(zip(STAGE_ORDER, STAGE_ORDER[1:]))
# The 5 adjacent-stage pairs implied by STAGE_ORDER itself -- never hand-duplicated, so the two constants
# cannot drift from each other.

_STAGE_REQUIRED_KEYS = frozenset({"stage", "description", "provenance"})
_TRANSITION_REQUIRED_KEYS = frozenset({"from_stage", "to_stage", "assumption", "evidence", "indicator", "risk", "provenance"})
_TRANSITION_ALLOWED_KEYS = _TRANSITION_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})
_TRANSITION_TEXT_FIELDS = ("assumption", "evidence", "indicator", "risk")


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


def _stages_are_valid(stages: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this suite already establishes.

    Real invariant: exactly 6 entries, one per STAGE_ORDER value, POSITIONALLY in that literal order, each
    well-shaped with a non-empty ``description``.
    """
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False, "SHAPE"
    for position, expected_stage in enumerate(STAGE_ORDER):
        entry = stages[position]
        if not _shaped(entry, _STAGE_REQUIRED_KEYS, _STAGE_REQUIRED_KEYS):
            return False, "SHAPE"
        if entry.get("stage") != expected_stage:
            return False, "SHAPE"
        if not _is_nonempty_str(entry.get("description")):
            return False, "MISSING_DESCRIPTION"
    return True, None


def _transitions_are_valid(transitions: Any) -> tuple[bool, str | None]:
    """Same shared-predicate discipline as ``_stages_are_valid``.

    Real invariant: exactly 5 entries, one per TRANSITION_STAGE_PAIRS value, POSITIONALLY in that literal
    order (transitions[i] connects stages[i] to stages[i+1] -- checked via BOTH the from_stage/to_stage field
    values AND array position, see module docstring); each entry well-shaped with non-empty ``assumption``/
    ``evidence``/``indicator``/``risk`` -- Atlas §11.22's own "每條箭頭都應有" (L1703-1708), unconditional.
    """
    if not isinstance(transitions, list) or len(transitions) != len(TRANSITION_STAGE_PAIRS):
        return False, "SHAPE"
    for position, (expected_from, expected_to) in enumerate(TRANSITION_STAGE_PAIRS):
        entry = transitions[position]
        if not _shaped(entry, _TRANSITION_REQUIRED_KEYS, _TRANSITION_ALLOWED_KEYS):
            return False, "SHAPE"
        if entry.get("from_stage") != expected_from or entry.get("to_stage") != expected_to:
            return False, "SHAPE"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
        for field in _TRANSITION_TEXT_FIELDS:
            if not _is_nonempty_str(entry.get(field)):
                return False, "MISSING_ATTRIBUTE"
    return True, None


def stage_entry(stage: str, description: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One item of ``typed-objects/theory-of-change-record.schema.yaml#/properties/stages``. A thin convenience
    constructor -- does NOT itself enforce order/shape (``generate_theory_of_change_record`` validates whatever
    list it is handed regardless of how it was built, same "helper is not the invariant boundary" discipline
    ``framing.five_w_one_h``'s own ``dimension_entry`` docstring already establishes)."""
    return {"stage": stage, "description": description, "provenance": provenance}


def transition_entry(
    from_stage: str,
    to_stage: str,
    assumption: str,
    evidence: str,
    indicator: str,
    risk: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/theory-of-change-record.schema.yaml#/properties/transitions``. Same
    "helper is not the invariant boundary" discipline as ``stage_entry`` above -- mutation tests build entries
    directly, bypassing this helper, to prove the builder itself enforces the invariants."""
    entry: dict[str, Any] = {
        "from_stage": from_stage,
        "to_stage": to_stage,
        "assumption": assumption,
        "evidence": evidence,
        "indicator": indicator,
        "risk": risk,
        "provenance": provenance,
    }
    if supporting_evidence_refs:
        entry["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return entry


def generate_theory_of_change_record(
    record_id: str,
    intervention: str,
    stages: list[dict[str, Any]],
    transitions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/theory-of-change-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before-construction"
    discipline every sibling module in this suite already establishes -- never a record that itself proves it
    was built illegally.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"THEORYOFCHANGE_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"THEORYOFCHANGE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(intervention):
        raise InvariantViolation(f"THEORYOFCHANGE_EMPTY_INTERVENTION: intervention must be a non-empty string, got {intervention!r}")

    stages_ok, stages_reason = _stages_are_valid(stages)
    if not stages_ok:
        if stages_reason == "MISSING_DESCRIPTION":
            raise InvariantViolation(f"THEORYOFCHANGE_STAGE_MISSING_DESCRIPTION: every stage must carry a non-empty description, got {stages!r}")
        raise InvariantViolation(
            f"THEORYOFCHANGE_INVALID_STAGE_SET: stages must be EXACTLY the six entries {STAGE_ORDER} in that literal order, well-shaped, got {stages!r}"
        )

    transitions_ok, transitions_reason = _transitions_are_valid(transitions)
    if not transitions_ok:
        if transitions_reason == "MISSING_ATTRIBUTE":
            raise InvariantViolation(
                "THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE: every transition must carry non-empty assumption/evidence/indicator/risk "
                f"(Atlas §11.22's own '每條箭頭都應有：Assumption / Evidence / Indicator / Risk', unconditional), got {transitions!r}"
            )
        raise InvariantViolation(
            f"THEORYOFCHANGE_INVALID_TRANSITION_SET: transitions must be EXACTLY the five stage-pairs {TRANSITION_STAGE_PAIRS} "
            f"in that literal positional order, well-shaped, got {transitions!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "intervention": intervention,
        "stages": [dict(s) for s in stages],
        "transitions": [dict(t) for t in transitions],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every stage AND transition AND the overall record
    carry a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stages = record.get("stages")
    stages = stages if isinstance(stages, list) else []
    transitions = record.get("transitions")
    transitions = transitions if isinstance(transitions, list) else []
    invalid_stages = [s.get("stage") for s in stages if isinstance(s, dict) and not provenance_is_valid(s.get("provenance"))]
    invalid_transitions = [f"{t.get('from_stage')}->{t.get('to_stage')}" for t in transitions if isinstance(t, dict) and not provenance_is_valid(t.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(stages) and bool(transitions) and not invalid_stages and not invalid_transitions and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [
            {
                "stages_checked": len(stages),
                "transitions_checked": len(transitions),
                "invalid_provenance_stages": invalid_stages,
                "invalid_provenance_transitions": invalid_transitions,
                "record_provenance_valid": record_provenance_ok,
            }
        ],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check every sibling module
    already uses: a transition whose ``provenance.epistemic_type`` is ``EVIDENCE`` must actually cite
    ``supporting_evidence_refs``. Only meaningful for transitions (stages carry no such field, per Atlas's own
    attribution of Evidence/Assumption/Indicator/Risk to the ARROWS, not the stage nodes -- see module
    docstring)."""
    transitions = record.get("transitions") if isinstance(record, dict) else None
    transitions = transitions if isinstance(transitions, list) else []
    problems: list[dict[str, Any]] = []
    for t in transitions:
        if not isinstance(t, dict):
            continue
        epistemic_type = (t.get("provenance") or {}).get("epistemic_type")
        key = f"{t.get('from_stage')}->{t.get('to_stage')}"
        if epistemic_type is None:
            problems.append({"transition": key, "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not t.get("supporting_evidence_refs"):
            problems.append({"transition": key, "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(transitions) and not problems
    return _result("evidence_labeling_required", passed, [{"transitions_checked": len(transitions), "problems": problems}], validator, timestamp)


def evaluate_theory_of_change_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_theory_of_change_record``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a transition spliced directly into a copied dict with a blanked-out ``risk``) is caught here
    exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("theory_of_change_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("theory_of_change_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("theory_of_change_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("intervention")):
        return _result("theory_of_change_integrity", False, [{"reason": "intervention missing or empty"}], validator, timestamp)

    stages_ok, stages_reason = _stages_are_valid(record.get("stages"))
    if not stages_ok:
        return _result(
            "theory_of_change_integrity",
            False,
            [{"reason": f"stages invalid ({stages_reason}) -- must be exactly {STAGE_ORDER} in that literal order, each with a non-empty description"}],
            validator,
            timestamp,
        )

    transitions_ok, transitions_reason = _transitions_are_valid(record.get("transitions"))
    if not transitions_ok:
        return _result(
            "theory_of_change_integrity",
            False,
            [
                {
                    "reason": (
                        f"transitions invalid ({transitions_reason}) -- must be exactly the 5 positionally-ordered "
                        f"stage-pairs {TRANSITION_STAGE_PAIRS}, each with non-empty assumption/evidence/indicator/risk"
                    )
                }
            ],
            validator,
            timestamp,
        )

    return _result(
        "theory_of_change_integrity",
        True,
        [{"stage_count": len(record["stages"]), "transition_count": len(record["transitions"])}],
        validator,
        timestamp,
    )


def evaluate_theory_of_change_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_theory_of_change_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
