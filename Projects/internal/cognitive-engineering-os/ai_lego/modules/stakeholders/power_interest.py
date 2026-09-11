"""``stakeholders.power_interest`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero
built methods before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` directory existed
before it was pre-created empty for this batch; 1 of 10 concurrent agents opening every F07 member in the
same parallel batch).

Atlas cites this method THREE times: the F07 tool table row (L488: "Power–Interest｜權力×關注分類｜評估→四象限
→engagement｜決定溝通策略"), an inline mermaid ``quadrantChart`` immediately after the F07 table (L498-507),
and dedicated §11.15 (L1547-1561, the identical chart plus an explicit caution). The chart itself::

    quadrantChart
        title Stakeholder Power–Interest
        x-axis Low Interest --> High Interest
        y-axis Low Power --> High Power
        quadrant-1 Manage Closely
        quadrant-2 Keep Satisfied
        quadrant-3 Monitor
        quadrant-4 Keep Informed

Atlas's own prose never spells out WHERE quadrant-1..4 sit geometrically -- that convention was independently
verified against mermaid-js's own published ``quadrantChart`` documentation before writing any code here:
quadrant-1=top-right, quadrant-2=top-left, quadrant-3=bottom-left, quadrant-4=bottom-right. Combined with the
chart's own axis directions (x=Interest Low->High, y=Power Low->High), that resolves to the real 4-cell
mapping ``_QUADRANT_BY_LEVELS`` below: HIGH power+HIGH interest (top-right) -> MANAGE_CLOSELY, HIGH power+LOW
interest (top-left) -> KEEP_SATISFIED, LOW power+LOW interest (bottom-left) -> MONITOR, LOW power+HIGH
interest (bottom-right) -> KEEP_INFORMED.

**Real invariant, GENUINE_COMPUTE** (``derive_power_interest_quadrant`` below, a TOTAL 4-cell lookup table,
same discipline ``strategy.bcg_matrix``'s own ``derive_bcg_quadrant`` already establishes): every
stakeholder's own ``quadrant`` is mechanically derived from that stakeholder's own ``power_score`` x
``interest_score``, never a builder parameter, never caller-supplied. ``power_score``/``interest_score`` are
DISCLOSED integer judgment calls in a closed interval [1, 10] (HIGH is score>=6, LOW is score<=5, an even
split with no tie value) -- this numeric scale is NOT Atlas-cited (the mermaid chart names only a Low->High
axis direction, no numeric scale); it reuses ``decision.ice``'s own already-established 1-10 convention for
corpus consistency, disclosed as a compilation decision here, not presented as an external citation the way
ICE's own Sean-Ellis attribution is.

**§11.15's own explicit reverse caution, enforced STRUCTURALLY**: "決定 stakeholder engagement strategy，不是
判斷誰比較「重要的人」" (decides engagement strategy, is NOT a judgment of who is the more "important" person).
This record therefore has NO importance/priority ranking field anywhere, at any level -- no ``ranking[]`` the
way ``decision.ice`` sorts by score, no top-level synthesis field. ``quadrant`` is an ENGAGEMENT STRATEGY
label (how to engage), not a rank.

Provenance is RECORD-LEVEL ONLY (task-mandated, a deliberate BATCH-WIDE decision for this whole F07 build),
matching ``insight.jtbd``/``divergent.lotus_blossom``'s own record-level placement -- NOT per-stakeholder the
way ``strategy.bcg_matrix``'s own per-item ``provenance`` is. The builder validates ``provenance`` shape
fail-closed at construction time (``insight.jtbd``'s own discipline, not ``divergent.lotus_blossom``'s
gate-only-validates-provenance variant).

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"power_interest"/"PowerInterestMatrix"/"POWINT" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.power_interest"
RECORD_ID_PREFIX = "POWINT-"

MIN_SCORE = 1
MAX_SCORE = 10
HIGH_THRESHOLD = 6
# [1,10] with a HIGH>=6/LOW<=5 split -- not Atlas-cited (the mermaid chart names only a Low->High axis
# direction, no numeric scale); reuses decision.ice's own already-established 1-10 convention for corpus
# consistency, disclosed as a compilation decision (see module docstring).

MANAGE_CLOSELY = "MANAGE_CLOSELY"
KEEP_SATISFIED = "KEEP_SATISFIED"
MONITOR = "MONITOR"
KEEP_INFORMED = "KEEP_INFORMED"
VALID_QUADRANTS: frozenset[str] = frozenset({MANAGE_CLOSELY, KEEP_SATISFIED, MONITOR, KEEP_INFORMED})
# The 4 real quadrant names Atlas's own mermaid chart (L498-507/L1547-1561) literally names -- see module
# docstring.

# Real, TOTAL lookup table (all 4 combinations of 2 HIGH/LOW score levels): (power_level, interest_level) ->
# quadrant. Every cell listed explicitly (no loop-generated entries), same explicit-cell-listing discipline
# strategy.bcg_matrix's own _QUADRANT_BY_AXES already establishes.
_QUADRANT_BY_LEVELS: dict[tuple[str, str], str] = {
    ("HIGH", "HIGH"): MANAGE_CLOSELY,
    ("HIGH", "LOW"): KEEP_SATISFIED,
    ("LOW", "HIGH"): KEEP_INFORMED,
    ("LOW", "LOW"): MONITOR,
}
assert len(_QUADRANT_BY_LEVELS) == 4, "Power-Interest quadrant table must be TOTAL over all 4 HIGH/LOW combinations"

_ITEM_INPUT_KEYS = frozenset({"stakeholder_name", "power_score", "power_reasoning", "interest_score", "interest_reasoning"})
_ITEM_STORED_KEYS = _ITEM_INPUT_KEYS | frozenset({"quadrant"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline ``insight.jtbd``/``strategy.bcg_matrix`` already establish."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_score(value: Any) -> bool:
    """Closed-interval integer check that excludes Python's bool-is-int-subclass trap (``bool`` is a subclass
    of ``int``; ``True``/``False`` must never masquerade as a real 1/0 score) -- same guard
    ``divergent.lotus_blossom``'s own critic-fixed ``_is_valid_branch_number`` and ``insight.focus_group``'s
    own ``_is_valid_participant_count`` already establish for their own closed-set/closed-interval integer
    fields."""
    return isinstance(value, int) and not isinstance(value, bool) and MIN_SCORE <= value <= MAX_SCORE


def _score_level(score: int) -> str:
    """HIGH if score is at or above HIGH_THRESHOLD, else LOW -- an even split of [1,10] into two 5-value
    halves, no tie value. Caller must have already confirmed ``score`` via ``_is_valid_score``."""
    return "HIGH" if score >= HIGH_THRESHOLD else "LOW"


def derive_power_interest_quadrant(power_score: int, interest_score: int) -> str:
    """GENUINE_COMPUTE: the sole authority for turning the 2 real Power-Interest scores into a ``quadrant``.
    Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) -- neither can
    drift from the other. Raises if either score is outside [MIN_SCORE, MAX_SCORE] (defense in depth -- by the
    time this is called, ``generate_power_interest_matrix``/``evaluate_power_interest_integrity_gate`` have
    already confirmed each score is a legal value)."""
    if not _is_valid_score(power_score) or not _is_valid_score(interest_score):
        raise InvariantViolation(
            f"POWINT_SCORE_OUT_OF_RANGE: power_score/interest_score must each be an integer in [{MIN_SCORE}, {MAX_SCORE}] (non-bool), "
            f"got power_score={power_score!r}, interest_score={interest_score!r}"
        )
    return _QUADRANT_BY_LEVELS[(_score_level(power_score), _score_level(interest_score))]


def _item_core_fields_are_valid(entry: dict[str, Any]) -> bool:
    """Shared predicate: the fields every stakeholder entry carries regardless of input-vs-stored shape --
    non-empty stakeholder_name, legal power_score/interest_score with non-empty reasoning. Called by BOTH the
    input and stored shape predicates below; does NOT itself check key-set shape or ``quadrant``."""
    if not _is_nonempty_str(entry.get("stakeholder_name")):
        return False
    if not _is_valid_score(entry.get("power_score")):
        return False
    if not _is_nonempty_str(entry.get("power_reasoning")):
        return False
    if not _is_valid_score(entry.get("interest_score")):
        return False
    return _is_nonempty_str(entry.get("interest_reasoning"))


def _item_input_entry_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED stakeholder entry -- exactly the input keys (NO ``quadrant``, that field is always
    computed, never accepted), core fields valid. Called only by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ITEM_INPUT_KEYS:
        return False
    return _item_core_fields_are_valid(entry)


def _item_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) stakeholder entry -- exactly the stored keys, core fields valid, AND
    ``quadrant`` must equal the real re-derivation from this entry's own power_score/interest_score. Called
    only by the gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ITEM_STORED_KEYS:
        return False
    if not _item_core_fields_are_valid(entry):
        return False
    return entry.get("quadrant") == derive_power_interest_quadrant(entry["power_score"], entry["interest_score"])


def stakeholder_entry(
    stakeholder_name: str,
    power_score: int,
    power_reasoning: str,
    interest_score: int,
    interest_reasoning: str,
) -> dict[str, Any]:
    """One INPUT entry for ``generate_power_interest_matrix``'s own ``stakeholders`` parameter. Convenience
    constructor only -- emits ONLY the input keys (deliberately NO ``quadrant`` parameter, and deliberately NO
    importance/rank parameter of any kind: see module docstring's structural-caution discipline); does NOT
    itself enforce non-emptiness of the overall list (``generate_power_interest_matrix`` validates whatever
    list of dicts it is handed, same convention ``strategy.bcg_matrix``'s own ``portfolio_item`` already
    establishes)."""
    if not _is_nonempty_str(stakeholder_name):
        raise InvariantViolation(f"POWINT_EMPTY_STAKEHOLDER_NAME: stakeholder_name must be a non-empty string, got {stakeholder_name!r}")
    if not _is_valid_score(power_score):
        raise InvariantViolation(f"POWINT_INVALID_POWER_SCORE: power_score must be an integer in [{MIN_SCORE}, {MAX_SCORE}] (non-bool), got {power_score!r}")
    if not _is_nonempty_str(power_reasoning):
        raise InvariantViolation(f"POWINT_EMPTY_POWER_REASONING: power_reasoning must be a non-empty string, got {power_reasoning!r}")
    if not _is_valid_score(interest_score):
        raise InvariantViolation(f"POWINT_INVALID_INTEREST_SCORE: interest_score must be an integer in [{MIN_SCORE}, {MAX_SCORE}] (non-bool), got {interest_score!r}")
    if not _is_nonempty_str(interest_reasoning):
        raise InvariantViolation(f"POWINT_EMPTY_INTEREST_REASONING: interest_reasoning must be a non-empty string, got {interest_reasoning!r}")
    return {
        "stakeholder_name": stakeholder_name,
        "power_score": power_score,
        "power_reasoning": power_reasoning,
        "interest_score": interest_score,
        "interest_reasoning": interest_reasoning,
    }


def generate_power_interest_matrix(
    matrix_id: str,
    stakeholders: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/power-interest-matrix.schema.yaml``.

    Enforces every real invariant fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes, in order: id/version/provenance shape, then
    ``stakeholders`` non-emptiness, then per-entry shape/content. ``stakeholders`` entries are accepted WITHOUT
    a ``quadrant`` key (see ``stakeholder_entry``/module docstring) -- the builder ALWAYS computes and attaches
    ``quadrant`` itself via ``derive_power_interest_quadrant``, never a parameter here, so there is no code
    path through which a caller could construct a record whose stored quadrant disagrees with its own
    stakeholder's own scores. ``provenance`` is RECORD-LEVEL ONLY and validated here at construction time
    (``insight.jtbd``'s own discipline -- see module docstring).
    """
    if not _is_nonempty_str(matrix_id) or not matrix_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"POWINT_INVALID_ID: matrix_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {matrix_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"POWINT_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"POWINT_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(stakeholders, list) or not stakeholders:
        raise InvariantViolation(
            f"POWINT_EMPTY_STAKEHOLDERS: stakeholders must be a non-empty list (a Power-Interest Matrix classifying zero stakeholders has not "
            f"actually mapped anything -- Atlas L488's own '評估→四象限→engagement' purpose), got {_shallow_describe(stakeholders)}"
        )
    if not all(_item_input_entry_is_valid(item) for item in stakeholders):
        raise InvariantViolation(
            f"POWINT_INVALID_STAKEHOLDER_ENTRY: every entry must have exactly the keys {sorted(_ITEM_INPUT_KEYS)} (quadrant is computed, not "
            f"accepted), power_score/interest_score each an integer in [{MIN_SCORE}, {MAX_SCORE}], non-empty stakeholder_name/power_reasoning/"
            f"interest_reasoning, got {_shallow_describe(stakeholders)}"
        )

    rebuilt_stakeholders = [
        {
            "stakeholder_name": item["stakeholder_name"],
            "power_score": item["power_score"],
            "power_reasoning": item["power_reasoning"],
            "interest_score": item["interest_score"],
            "interest_reasoning": item["interest_reasoning"],
            "quadrant": derive_power_interest_quadrant(item["power_score"], item["interest_score"]),
        }
        for item in stakeholders
    ]

    return {
        "id": matrix_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "stakeholders": rebuilt_stakeholders,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own RECORD-LEVEL provenance is
    schema-valid. Fails closed on non-dict input. No per-stakeholder provenance to check (see module
    docstring -- unlike BCG, this is a batch-wide record-level-only F07 decision)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_power_interest_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives every real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_power_interest_matrix``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the ONLY
    place EVERY stakeholder's own ``quadrant`` is checked against a fresh ``derive_power_interest_quadrant``
    recomputation from that stakeholder's own power_score/interest_score. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("power_interest_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("power_interest_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("power_interest_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    stakeholders = record.get("stakeholders")
    if not isinstance(stakeholders, list) or not stakeholders:
        return _result("power_interest_integrity", False, [{"reason": "stakeholders missing, not a list, or empty"}], validator, timestamp)
    if not all(_item_stored_entry_is_valid(item) for item in stakeholders):
        return _result(
            "power_interest_integrity",
            False,
            [{"reason": "stakeholders invalid (malformed entry, illegal power_score/interest_score, or a stored quadrant disagreeing with its own re-derivation)"}],
            validator,
            timestamp,
        )

    return _result("power_interest_integrity", True, [{"stakeholder_count": len(stakeholders)}], validator, timestamp)


def evaluate_power_interest_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-and-computation integrity re-derivation. No ``evidence_labeling_required`` gate --
    the contract sets that flag to ``false`` (see stakeholders.power_interest.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_power_interest_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
