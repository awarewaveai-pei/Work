"""``stakeholders.batna`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero built
methods before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` directory with real content
existed at batch start, only a pre-created placeholder ``__init__.py`` [avoids a package-init race across
parallel build agents]; this is 1 of 10 concurrent agents opening ALL F07 members in the same parallel batch,
each its own distinct machine_id, own module file, no shared file touched).

Atlas cites this method TWICE: F07 tool table row (L492: "BATNA｜談判失敗最佳替代｜列 alternatives→估值→改善
BATNA｜避免接受差交易") and dedicated §11.16 (L1565-1579), which gives the method's own literal 5-step
procedure verbatim::

    1. 列出談不成時可做的 alternatives.
    2. 估算每個 alternative 的價值與成本.
    3. 選最佳 BATNA.
    4. 先改善 BATNA，再進談判.
    5. 依 BATNA 推 reservation point.

Grep-confirmed these are the only 2 real citations for this method case-insensitively across the whole Atlas
file (no §4 composition formula, no §14.1 legal-chain mention, no §22.3 gate-table row).

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag), map directly onto the 5-step procedure above:

1. **Alternatives floor** (``BATNA_INVALID_ALTERNATIVES`` / ``BATNA_DUPLICATE_ALTERNATIVE_ID``): step 1's own
   "列出...alternatives" -- ``alternatives`` must be a non-empty list of well-shaped entries (``id``/``label``
   non-empty strings; ``value_estimate``/``cost_estimate`` finite, non-boolean numbers), each ``id`` unique
   within the record. A single, well-estimated fallback is a legitimate, complete BATNA (Atlas's own plural
   wording describes the general case, not a floor of 2 -- contrast ``decision.pareto_frontier``'s own genuine
   >=2 floor, which exists because a 1-option "frontier" is a structurally different, meaningless concept; no
   equivalent structural argument applies here).

2. **Referential integrity, step 3** (``BATNA_BEST_ALTERNATIVE_NOT_FOUND``): ``best_alternative_id`` must equal
   a real ``alternatives[].id``. Step 3's own "選最佳 BATNA" is a SELECTION FROM step 1's own list -- it is not
   an independently-typed string a caller could smuggle in that names no real alternative. This is the genuine
   unbounded-blast-radius invariant this method's own task brief calls out by name: a ``best_alternative_id``
   that does not resolve inside ``alternatives[]`` would silently misrepresent which fallback was actually
   chosen.

3. **Genuine-compute, step 5** (bundled into ``evaluate_batna_integrity_gate``'s own evidence):
   ``reservation_point`` is COMPUTED at construction -- there is no constructor parameter for it -- as the
   selected best alternative's own ``value_estimate`` minus its own ``cost_estimate`` (the net value of walking
   away to that alternative, net of what it costs to realize it -- standard negotiation-theory reservation-price
   definition: the point at which a negotiator is indifferent between the deal on the table and walking away).
   Independently RE-DERIVED at the gate from the record's own raw ``alternatives``/``best_alternative_id``,
   compared against whatever ``reservation_point`` is actually stored. This mechanizes step 5's own causal "依
   BATNA 推 reservation point" relationship (derive FROM the BATNA) structurally -- a hand-tampered
   ``reservation_point`` unrelated to the selected alternative's own numbers is caught, not merely a field that
   happens to sit next to ``best_alternative_id`` in the record.

**Disclosed packaging decision** (see contract's own ``compilation_decisions``): unlike ``decision.ice`` /
``decision.impact_effort`` / ``decision.pareto_frontier``, which isolate their own genuine-compute field in a
dedicated ``ai_lego/compute/<name>/`` package and expose ``engine``/``computation_provenance_ref`` metadata
(reused via ``ai_lego.modules.research.gates.evaluate_statistical_gate``), this method's own computed field
(``reservation_point``) is a single one-line subtraction with no cross-item aggregation, no external
methodology citation, and no reuse need those heavier siblings' own packages exist to isolate. It is kept
inline in THIS module's own builder and gate, both independently applying the identical formula (neither
trusts the other) -- the same "never trust stored, always re-derive" discipline, just without the extra
package/metadata scaffolding. This task's own file boundary also fixes exactly 4 deliverable files (no new
``ai_lego/compute/`` package for this method).

Step 4 ("先改善 BATNA，再進談判") has NO schema field -- it is procedural guidance about WHEN to negotiate, not
a data element the record's own shape needs to store (see method contract's own ``open_questions``,
OQ-BATNA-1).

Record-level-only provenance (NOT per-field) -- a deliberate BATCH-WIDE decision for this whole F07 build
(matching ``insight.jtbd``'s own record-level placement in the F06 batch). A BatnaAnalysis's content fields
describe ONE coherent analysis of one negotiation's walk-away option, not a list of independently-sourced items
each needing its own epistemic stamp.

This module does NOT import or touch ``stakeholders.zopa`` (built by a different concurrent agent in this same
F07 batch) -- Atlas §11.17 ZOPA is the immediately next section and a plausible downstream consumer of
``reservation_point``, but the two methods are built and validated fully independently in this batch (see
contract's own OQ-BATNA-2).

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "batna" before writing any of this
method's own files: zero pre-existing implementation (only ``method-inventory.yaml``'s own
``has_contract: false`` placeholder entry, F07 stakeholders).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.batna"
RECORD_ID_PREFIX = "BATNA-"

_KNOWN_ALTERNATIVE_KEYS = frozenset({"id", "label", "value_estimate", "cost_estimate"})
_RESERVATION_POINT_TOLERANCE = 1e-9
_OPTIMALITY_REL_TOLERANCE = 1e-9


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``bcg_matrix``/
    ``functional_decomposition``/``pareto_frontier``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_non_bool_number(value: Any) -> bool:
    """``int`` is unconditionally finite (Python ints are arbitrary-precision, never inf/nan) and is NOT
    passed through ``math.isfinite`` -- a huge ``int`` (e.g. ``10**400``) makes ``math.isfinite`` itself raise
    ``OverflowError`` on the implicit float conversion (2nd critic pass, 2026-09-11, found the identical class
    of bug in this module's own sibling ``game_theory.py``, latent here too before this fix). Only ``float``
    can actually be NaN/+-inf, so only ``float`` needs the check."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _numbers_close(a: Any, b: Any, tolerance: float = _RESERVATION_POINT_TOLERANCE) -> bool:
    """Strict numeric-closeness check that FAILS (does not silently pass) on NaN/inf/bool on EITHER side --
    same defensive discipline ``decision.ice``'s own ``_numbers_close`` already establishes: a bare
    ``abs(a - b) <= tolerance`` would let a NaN-tampered value through, since every NaN comparison in Python is
    False."""
    if not _is_finite_non_bool_number(a) or not _is_finite_non_bool_number(b):
        return False
    return abs(a - b) <= tolerance


def _is_effectively_optimal(candidate_net_value: float, best_net_value: float) -> bool:
    """Tie/near-tie tolerance for the 選最佳 BATNA optimality check -- deliberately NOT
    ``_RESERVATION_POINT_TOLERANCE`` reused as-is (2nd critic pass, 2026-09-11: that tolerance is an ABSOLUTE
    1e-9 sized for float round-trip noise on the reservation_point-recomputation match; reusing it here let a
    genuinely 2x-worse alternative pass at small magnitudes, e.g. nets 1e-10 vs 2e-10, both well inside 1e-9 of
    each other). ``math.isclose`` combines a relative tolerance (scales with magnitude, closes that hole) with
    the same absolute floor (still tolerates true near-zero ties). ``candidate_net_value`` can never legitimately
    exceed ``best_net_value`` (the caller always computes it as ``max(...)`` over the same alternatives), so
    this only needs to ask "is candidate close enough to best", not which direction."""
    return math.isclose(candidate_net_value, best_net_value, rel_tol=_OPTIMALITY_REL_TOLERANCE, abs_tol=_RESERVATION_POINT_TOLERANCE)


def _alternative_shape_is_valid(alternative: Any) -> bool:
    """Shape only (closed keys, id/label non-empty strings, value_estimate/cost_estimate finite non-boolean
    numbers). Uniqueness of ``id`` across the whole ``alternatives`` list is checked separately by the caller
    (JSON Schema, and this shape check alone, cannot express cross-item uniqueness on a single field -- same
    disclosed gap class ``decision.pareto_frontier``'s own per-item shape checks leave to a dedicated
    duplicate-id pass)."""
    if not isinstance(alternative, dict) or set(alternative.keys()) != _KNOWN_ALTERNATIVE_KEYS:
        return False
    if not _is_nonempty_str(alternative.get("id")) or not _is_nonempty_str(alternative.get("label")):
        return False
    return _is_finite_non_bool_number(alternative.get("value_estimate")) and _is_finite_non_bool_number(alternative.get("cost_estimate"))


def _compute_reservation_point(alternative: dict[str, Any]) -> float:
    """Step 5's own '依 BATNA 推 reservation point' -- the net value of walking away to the selected
    alternative (its own value_estimate minus its own cost_estimate), standard negotiation-theory reservation-
    price definition. Takes an already-shape-validated alternative dict; never called on unvalidated input."""
    return alternative["value_estimate"] - alternative["cost_estimate"]


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_batna_analysis(
    record_id: str,
    subject: str,
    alternatives: list[dict[str, Any]],
    best_alternative_id: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/batna.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed, in this order: id/subject/version/provenance shape, then ``alternatives`` shape (step 1-2's
    own floor) and id-uniqueness, then ``best_alternative_id``'s own referential-integrity invariant (step 3 --
    must resolve to a real ``alternatives[].id``). ``reservation_point`` is ALWAYS computed here (step 5), never
    accepted as a parameter -- see module docstring."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BATNA_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BATNA_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BATNA_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"BATNA_EMPTY_SUBJECT: subject must be a non-empty string (the negotiation this BATNA supports), got {subject!r}")

    if not isinstance(alternatives, list) or not alternatives or not all(_alternative_shape_is_valid(a) for a in alternatives):
        raise InvariantViolation(
            f"BATNA_INVALID_ALTERNATIVES: alternatives must be a non-empty list of well-shaped entries "
            f"(id/label non-empty strings, value_estimate/cost_estimate finite non-boolean numbers, no extra/missing keys) "
            f"-- §11.16's own step 1 ('列出談不成時可做的 alternatives'), got {_shallow_describe(alternatives)}"
        )
    alternative_ids = [a["id"] for a in alternatives]
    if len(set(alternative_ids)) != len(alternative_ids):
        duplicates = sorted({i for i in alternative_ids if alternative_ids.count(i) > 1})
        raise InvariantViolation(f"BATNA_DUPLICATE_ALTERNATIVE_ID: id(s) {duplicates} used more than once -- every alternative id must be unique in the record")

    if not _is_nonempty_str(best_alternative_id) or best_alternative_id not in alternative_ids:
        raise InvariantViolation(
            f"BATNA_BEST_ALTERNATIVE_NOT_FOUND: best_alternative_id must equal a real alternatives[].id -- §11.16's own step 3 "
            f"('選最佳 BATNA') selects FROM step 1's own list, it is never an independently-typed string; got {best_alternative_id!r}, "
            f"known ids: {sorted(alternative_ids)}"
        )

    best_alternative = next(a for a in alternatives if a["id"] == best_alternative_id)
    reservation_point = _compute_reservation_point(best_alternative)
    if not _is_finite_non_bool_number(reservation_point):
        # 2nd critic pass (2026-09-11): the shape check on value_estimate/cost_estimate above only bounds
        # EACH input alone -- it does not bound their DIFFERENCE. Two individually-finite floats near the
        # float range's edge (e.g. value_estimate=1.5e308, cost_estimate=-1.5e308) can still subtract to
        # +-inf. Without this check the builder emitted a non-finite reservation_point that its OWN gate
        # then rejected -- a builder/gate disagreement on a record the builder itself just produced.
        raise InvariantViolation(f"BATNA_RESERVATION_POINT_NOT_FINITE: computed reservation_point {reservation_point!r} is not finite (value_estimate - cost_estimate overflowed)")

    # Optimality, not just referential integrity (critic-found gap, 2026-09-11): the earlier check only
    # confirmed best_alternative_id resolves to a REAL alternative, not that it is actually the BEST one --
    # §11.16 step 3 is literally "選最佳 BATNA" (select the BEST), not "select an alternative". Naming a
    # strictly inferior alternative silently understated reservation_point, the one GENUINE_COMPUTE number
    # ZOPA is the named downstream consumer of (OQ-BATNA-2). Ties are legitimate (see _is_effectively_optimal).
    best_net_value = max(_compute_reservation_point(a) for a in alternatives)
    if not _is_effectively_optimal(reservation_point, best_net_value):
        raise InvariantViolation(
            f"BATNA_BEST_ALTERNATIVE_NOT_OPTIMAL: best_alternative_id {best_alternative_id!r} nets {reservation_point!r} "
            f"(value_estimate - cost_estimate), but alternatives[] contains one netting {best_net_value!r} -- §11.16 step 3 "
            f"selects the BEST alternative, not merely a real one"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "alternatives": [dict(a) for a in alternatives],
        "best_alternative_id": best_alternative_id,
        "reservation_point": reservation_point,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_batna_analysis -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_batna_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_batna_analysis``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Checks id/version/subject shape, alternatives
    shape + id-uniqueness (step 1-2), best_alternative_id's own referential integrity (step 3), and
    reservation_point's own genuine-compute correctness (step 5), all independently, in that order so the most
    specific root cause is reported first. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("batna_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("batna_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("batna_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("batna_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    alternatives = record.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives or not all(_alternative_shape_is_valid(a) for a in alternatives):
        return _result("batna_integrity", False, [{"reason": "alternatives invalid (empty, not a list, or a malformed entry)"}], validator, timestamp)
    alternative_ids = [a["id"] for a in alternatives]
    if len(set(alternative_ids)) != len(alternative_ids):
        return _result("batna_integrity", False, [{"reason": "duplicate alternative id across alternatives"}], validator, timestamp)

    best_alternative_id = record.get("best_alternative_id")
    if not _is_nonempty_str(best_alternative_id) or best_alternative_id not in alternative_ids:
        return _result("batna_integrity", False, [{"reason": f"best_alternative_id {best_alternative_id!r} is not a real alternatives[].id"}], validator, timestamp)

    stored_reservation_point = record.get("reservation_point")
    if not _is_finite_non_bool_number(stored_reservation_point):
        return _result("batna_integrity", False, [{"reason": "reservation_point missing or not a finite non-boolean number"}], validator, timestamp)

    best_alternative = next(a for a in alternatives if a["id"] == best_alternative_id)
    recomputed_reservation_point = _compute_reservation_point(best_alternative)
    if not _numbers_close(stored_reservation_point, recomputed_reservation_point):
        return _result(
            "batna_integrity",
            False,
            [{"reason": "reservation_point does not match recomputed value_estimate - cost_estimate of best_alternative_id", "stored": stored_reservation_point, "recomputed": recomputed_reservation_point}],
            validator,
            timestamp,
        )

    # Optimality re-derivation (critic-found gap, 2026-09-11): a self-consistent reservation_point (matches
    # its own best_alternative_id) can still name a NON-optimal alternative -- the check above alone would
    # not catch it. Independently re-checked here, same as the builder.
    best_net_value = max(_compute_reservation_point(a) for a in alternatives)
    if not _is_effectively_optimal(recomputed_reservation_point, best_net_value):
        return _result(
            "batna_integrity",
            False,
            [{"reason": "best_alternative_id is not optimal -- a better alternative exists in alternatives[]", "best_alternative_net_value": recomputed_reservation_point, "best_available_net_value": best_net_value}],
            validator,
            timestamp,
        )

    return _result(
        "batna_integrity",
        True,
        [{"alternative_count": len(alternatives), "best_alternative_id": best_alternative_id, "reservation_point": stored_reservation_point}],
        validator,
        timestamp,
    )


def evaluate_batna_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and ``insight.jtbd``'s own identical "only emit gates for what
    is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_batna_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
