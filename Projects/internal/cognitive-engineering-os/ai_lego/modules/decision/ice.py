"""``decision.ice`` -- Method Atlas slice, third member of the `decision` family (F16, Prioritization &
Decision), after `decision.ahp` and `decision.mcda`.

Atlas's own F16 tool table ICE row (L761): "Impact×Confidence×Ease | 統一
尺度評分 | 快速粗排" -- a single line, no dedicated §11.x/§12.x section
(grep-confirmed across the whole document -- only RICE, L2955, and
Weighted Decision Matrix, L2969, have one among F16's own siblings; same
absence class `root_cause.fault_tree`'s own contract already established
for its own F05 row), and no §22.3 Method-specific Gate table row either
(grep-confirmed, L4142-4155 -- only Fishbone/Persona/Scenario Planning/
SWOT/AI Expert Lens/LLM Arithmetic/Red Team/Monte Carlo/MCDA/Jurisdiction
Inference have one; ICE is not among them). Unlike `decision.mcda`, this
method therefore carries NO table-cited forbidden-authority rule --
`forbidden_transition` is genuinely empty, the same disclosed-absence
class `decision.ahp.contract.yaml` already established for its own row.

DUE-DILIGENCE vs `decision.mcda` (read in full, plus `decision.ahp`,
before writing this module): MCDA is a general N-criteria engine --
arbitrary `criteria[]` (``minItems: 1``, each with a caller-chosen
``direction``), arbitrary caller-supplied ``weights[]`` that must sum to
1.0, and a per-run, RELATIVE min-max ``normalize_scores`` (an option's
normalized value depends on every other option in the SAME run, and
``options`` needs ``minItems: 2`` for that comparison to mean anything).
ICE is a genuinely different shape, not "MCDA with 3 fixed equal-weight
criteria": exactly 3 FIXED, NAMED dimensions (Impact/Confidence/Ease, not
caller-named criteria), no caller-supplied weights at all (equal
weighting is structural, not an input), and each item's score is an
ABSOLUTE function of only its OWN 3 dimensions -- no cross-item
normalization, so `items` needs only ``minItems: 1`` (a single ICE item
is already a complete, valid run). This absolute-vs-relative distinction
is also why ICE's own `ranking` is a plain sort of already-independently-
computed scores, not a weighted-sum computation the way
`decision.ahp`/`decision.mcda`'s own `rank_options` is -- reusing that
function here would be wrong (it exists to combine a per-criterion weight
dict with per-option-per-criterion scores; ICE has neither multiple
criteria weights nor per-criterion scores, only one already-final score
per item).

Real, two-layer-enforced invariants (construction AND gate, same
"raise before construction" / "re-derive, don't trust" discipline every
prior module in this package uses):

1. **Dimension range** (`ICE_DIMENSION_OUT_OF_RANGE`): impact/confidence/
   ease must each be a finite, non-boolean number in [1, 10] -- refused,
   never silently clamped. 1-10 is NOT Atlas-cited (the F16 row names
   only the 3 factors, no scale) -- it is Sean Ellis's own published ICE
   convention (see ``ai_lego/compute/ice/scoring.py`` module docstring),
   the same class of external, non-invented methodology citation
   ``compute/ahp/weights.py``'s own Saaty-scale/CR-threshold already
   uses.
2. **Score integrity** (`ICE_SCORE_MISMATCH`): every item's own
   ``ice_score`` must equal the arithmetic mean of its own impact/
   confidence/ease, independently RECOMPUTED by the gate from those 3 raw
   fields -- never trusted as a stored value. A hand-tampered
   ``ice_score`` that disagrees with its own item's own raw dimensions
   fails, even though the record otherwise looks well-formed (the same
   "stored value must equal a fresh recomputation" discipline
   `decision.ahp`'s own consistency_ratio/consistent gate and
   `root_cause.fault_tree`'s own required_count gate already establish).
   ``ranking`` is checked the same way: every entry's own item_id set
   must equal ``items``'s own id set, every entry's own ice_score must
   equal that SAME item's own stored ice_score (not independently
   trusted), and the list must actually be sorted descending.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.ice.scoring import SCORE_TOLERANCE, compute_ice_score, is_valid_dimension_score, score_matches
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.ice"
RECORD_ID_PREFIX = "ICE-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.ice.scoring.compute_ice_score"
_KNOWN_INPUT_ITEM_KEYS = frozenset({"id", "label", "impact", "confidence", "ease"})
_KNOWN_OUTPUT_ITEM_KEYS = frozenset({"id", "label", "impact", "confidence", "ease", "ice_score"})
_KNOWN_RANKING_KEYS = frozenset({"item_id", "ice_score"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _numbers_close(a: Any, b: Any, tolerance: float = SCORE_TOLERANCE) -> bool:
    """Strict numeric-closeness check that FAILS (does not silently pass) on NaN/inf/bool on EITHER side --
    a bare ``abs(a - b) <= tolerance`` would let a NaN-tampered value through, since every NaN comparison in
    Python is False (``abs(nan - x) > tolerance`` is also False, so a naive check would wrongly treat a
    NaN-tampered ranking entry as 'matching'). Same defensive discipline
    ``compute/ice/scoring.py::score_matches`` already applies to a different field pair."""
    for value in (a, b):
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            return False
    return abs(a - b) <= tolerance


def _input_item_shape_is_valid(item: Any) -> bool:
    """Caller-supplied item shape: EXACTLY id/label/impact/confidence/ease -- no pre-supplied ``ice_score``
    (see module docstring: the score can never be smuggled in as an input, only ever appears in the output
    this builder produces)."""
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_INPUT_ITEM_KEYS:
        return False
    return _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("label"))


def _output_item_shape_is_valid(item: Any) -> bool:
    """Same shape check, gate-side: the PERSISTED item additionally carries its own computed ``ice_score``."""
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_OUTPUT_ITEM_KEYS:
        return False
    return _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("label"))


def generate_ice_score_record(
    record_id: str,
    context: str,
    items: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ice-score-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/context/items shape, id-uniqueness across ``items``, then
    per-item dimension range + score computation (invariant #1, via ``compute_ice_score``). ``ice_score`` and
    ``ranking`` are ALWAYS computed here, never accepted as caller input -- see module docstring."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ICE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"ICE_EMPTY_RECORD_FIELD: context must be a non-empty string, got {context!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ICE_INVALID_VERSION: version must be a string, got {version!r}")
    if not isinstance(items, list) or not items or not all(_input_item_shape_is_valid(i) for i in items):
        raise InvariantViolation(
            f"ICE_INVALID_ITEMS: items must be a non-empty list of entries with EXACTLY id/label/impact/confidence/ease "
            f"(id/label non-empty strings; no pre-supplied ice_score), got {_shallow_describe(items)}"
        )

    item_ids = [i["id"] for i in items]
    if len(set(item_ids)) != len(item_ids):
        duplicates = sorted({i for i in item_ids if item_ids.count(i) > 1})
        raise InvariantViolation(f"ICE_DUPLICATE_ITEM_ID: id(s) {duplicates} used more than once across items")

    scored_items: list[dict[str, Any]] = []
    for item in items:
        ice_score = compute_ice_score(item["impact"], item["confidence"], item["ease"])
        scored_items.append({"id": item["id"], "label": item["label"], "impact": item["impact"], "confidence": item["confidence"], "ease": item["ease"], "ice_score": ice_score})

    ranking = [{"item_id": i["id"], "ice_score": i["ice_score"]} for i in sorted(scored_items, key=lambda i: i["ice_score"], reverse=True)]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "items": scored_items,
        "ranking": ranking,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- the same reuse
    `root_cause.pareto`/`decision.ahp`/`decision.mcda` already established, now exercised by a method whose
    own genuine compute is a plain arithmetic mean rather than a matrix or a normalization step. Guards
    ``isinstance(record, dict)`` itself before delegating, matching ``impact_effort.py``'s own precedent
    (critic finding, 2026-09-08 -- this gate previously crashed with ``AttributeError`` on non-dict input
    instead of failing closed; ``evaluate_statistical_gate`` itself now also guards this at the root, so this
    is defense-in-depth, not the only line standing)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_ice_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored consistency, including each item's own claimed ice_score and the ranking's own claimed order.
    Bundles both headline invariants (dimension range, score integrity -- including ranking) under one
    gate_id, same shape ``evaluate_fault_tree_integrity_gate`` already uses for its own family (several
    distinct structural reasons, one gate_id, each with its own distinguishable evidence ``reason``). Checks
    are ORDERED so the most specific root cause is reported first (e.g. a dimension actually out of range is
    reported as that, not as a generic score mismatch). FAILS CLOSED on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("ice_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("ice_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("ice_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("context")):
        return _result("ice_integrity", False, [{"reason": "context missing or empty"}], validator, timestamp)

    items = record.get("items")
    if not isinstance(items, list) or not items or not all(_output_item_shape_is_valid(i) for i in items):
        return _result("ice_integrity", False, [{"reason": "items invalid (empty, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)

    item_ids = [i["id"] for i in items]
    if len(set(item_ids)) != len(item_ids):
        return _result("ice_integrity", False, [{"reason": "duplicate item id"}], validator, timestamp)

    out_of_range = [i["id"] for i in items if not (is_valid_dimension_score(i["impact"]) and is_valid_dimension_score(i["confidence"]) and is_valid_dimension_score(i["ease"]))]
    if out_of_range:
        return _result("ice_integrity", False, [{"reason": "dimension out of range", "item_ids": out_of_range}], validator, timestamp)

    mismatched = [i["id"] for i in items if not score_matches(i["ice_score"], i["impact"], i["confidence"], i["ease"])]
    if mismatched:
        return _result("ice_integrity", False, [{"reason": "stored ice_score does not match recomputed mean", "item_ids": mismatched}], validator, timestamp)

    ranking = record.get("ranking")
    if not isinstance(ranking, list) or len(ranking) != len(items) or not all(isinstance(r, dict) and set(r.keys()) == _KNOWN_RANKING_KEYS for r in ranking):
        return _result("ice_integrity", False, [{"reason": "ranking malformed or wrong length"}], validator, timestamp)

    score_by_item_id = {i["id"]: i["ice_score"] for i in items}
    ranking_ids = [r["item_id"] for r in ranking]
    if set(ranking_ids) != set(item_ids) or len(set(ranking_ids)) != len(ranking_ids):
        return _result("ice_integrity", False, [{"reason": "ranking item_id set does not match items"}], validator, timestamp)
    if any(not _numbers_close(r["ice_score"], score_by_item_id[r["item_id"]]) for r in ranking):
        return _result("ice_integrity", False, [{"reason": "ranking ice_score does not match item's own stored ice_score"}], validator, timestamp)

    scores_in_ranking_order = [r["ice_score"] for r in ranking]
    if scores_in_ranking_order != sorted(scores_in_ranking_order, reverse=True):
        return _result("ice_integrity", False, [{"reason": "ranking not sorted descending by ice_score"}], validator, timestamp)

    return _result("ice_integrity", True, [{"item_count": len(items)}], validator, timestamp)


def evaluate_ice_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_ice_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
