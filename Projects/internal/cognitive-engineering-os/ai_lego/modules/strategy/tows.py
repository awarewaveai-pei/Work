"""``strategy.tows`` -- F08 context/strategy family, 2nd member (after ``strategy.swot``),
methods/contracts/strategy.tows.contract.yaml.

Atlas F08 table row L519 ("TOWS｜SWOT 轉策略｜SO/ST/WO/WT 配對｜避免 SWOT 停在清單｜MCDA") + SWOT→TOWS sub-table
L530-536 + dedicated §11.8 (L1351-1362, same SO/ST/WO/WT table plus benefit line "把「分析清單」真正轉成
Strategy Options") + L1335 usage step 5 ("SWOT 完成後進 TOWS") + §14.1 legal chain (L3536-3544, `SwotAnalysis ->
TOWS -> StrategyOptions -> MCDA -> DecisionCandidate -> HumanDecision`).

**Real, mandatory cross-method dependency** (task-mandated, not a bare ref-string convenience): this module's
``generate_tows_matrix`` takes the ACTUAL ``SwotAnalysis`` record built by
``ai_lego.modules.strategy.swot.generate_swot_analysis`` and validates every pairing's two factor ids against
that record's real ``factors[]`` -- same referential-integrity discipline ``ai_lego.modules.causal.dag``'s
edges->nodes check already establishes, but one level deeper: TOWS reaches INTO an upstream typed object's own
field values (``category``), not merely a same-record collection. ``is_internal``/``VALID_CATEGORIES`` are
imported directly from ``ai_lego.modules.strategy.swot`` (read-only reuse -- swot.py is NOT edited by this
module) rather than re-declared, because Atlas defines the STRENGTH/WEAKNESS/OPPORTUNITY/THREAT split exactly
once (L1327, inside SWOT's own citation) and TOWS's pairing_type derivation is a pure function of that SAME
split -- re-declaring it here would risk the two copies silently drifting.

Core invariant: ``pairing_type`` (SO/ST/WO/WT) is GENUINE_COMPUTE, never caller-supplied. ``tows_pairing()``
(the pairing constructor) does not even accept a ``pairing_type`` parameter -- ``generate_tows_matrix`` derives
it from the two referenced factors' real categories via ``derive_pairing_type``, the same function an
independent gate (``evaluate_tows_integrity_gate``) re-runs from raw fields against a caller-supplied
``swot_analysis`` to catch a hand-tampered record. This eliminates the "caller asserts SO on a WEAKNESS+THREAT
pair" hazard structurally rather than accepting the field and then refusing a mismatch.

Real invariants (beyond per-field completeness), enforced at BOTH construction (raise before any record is
built) AND independently re-derived by a gate from raw fields against the real SwotAnalysis -- same two-layer
discipline every sibling module in this package establishes:

1. **TOWS_INVALID_SWOT_ANALYSIS**: the referenced SwotAnalysis must be a real dict with a non-empty
   ``factors[]`` of well-formed id+category entries.
2. **TOWS_UNKNOWN_FACTOR_ID**: every ``internal_factor_id``/``external_factor_id`` must resolve to a factor
   actually present in that SwotAnalysis.
3. **TOWS_INTERNAL_FACTOR_NOT_INTERNAL** / **TOWS_EXTERNAL_FACTOR_NOT_EXTERNAL**: Atlas's own SO/ST/WO/WT
   structure is ALWAYS one internal (STRENGTH/WEAKNESS) + one external (OPPORTUNITY/THREAT) factor, never two
   of the same side.
4. **TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED**: a raw pairing dict carrying its own ``pairing_type`` key
   is refused outright -- this field is ALWAYS computed, never trusted from input.
5. **TOWS_EMPTY_STRATEGY_OPTION**: Atlas §11.8's own defining benefit line (L1361) -- a pairing with a type
   label but no real strategy content has not done this method's job.

Grepped the whole ``ai_lego`` tree case-insensitively for "tows" before writing any of this method's own files:
zero pre-existing implementation (one unrelated forward-reference mention in
``docs/THIRD_SLICE_STRATEGY_SWOT.md``'s own §14.1 quote, not an implementation).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.swot import VALID_CATEGORIES, is_internal

METHOD_ID = "strategy.tows"
RECORD_ID_PREFIX = "TOWS-"
COMPUTATION_PROVENANCE_REF = "ai_lego.modules.strategy.tows.derive_pairing_type"

# Independently defined (NOT imported from ai_lego.modules.strategy.swot.AUTOMATIC_DEPLOYMENT_HAZARD_ID) --
# identical string value because Atlas's forbidden target node ("AutomaticProductionDeployment", L3550-3552) is
# the SAME hazard across the whole legal chain (see strategy.tows.contract.yaml's own compilation_decisions),
# but kept as a local constant to avoid a runtime import dependency between two otherwise-unrelated Tier 1
# method modules over a single shared string.
AUTOMATIC_DEPLOYMENT_HAZARD_ID = "strategy.automatic_production_deployment"

_PAIRING_TYPE_BY_CATEGORIES: dict[tuple[str, str], str] = {
    ("STRENGTH", "OPPORTUNITY"): "SO",
    ("STRENGTH", "THREAT"): "ST",
    ("WEAKNESS", "OPPORTUNITY"): "WO",
    ("WEAKNESS", "THREAT"): "WT",
}
# Atlas L519/§11.8 (L1354-1360) SO/ST/WO/WT table, transcribed as a lookup: (internal category, external
# category) -> pairing type. The ONLY four legal combinations -- Atlas's SO/ST/WO/WT structure is always one
# internal + one external factor, never two internal or two external (task-mandated structural rule).


def derive_pairing_type(internal_category: str, external_category: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning two real SwotAnalysis factor categories into a
    pairing_type. Called by BOTH the builder (at construction) and the gate (re-derived from raw fields) --
    neither can drift from the other. Raises if the two categories don't form a legal internal+external pair
    (defense in depth -- by the time this is called, ``generate_tows_matrix``/``evaluate_tows_integrity_gate``
    have already confirmed each category's internal/external side)."""
    key = (internal_category, external_category)
    if key not in _PAIRING_TYPE_BY_CATEGORIES:
        raise InvariantViolation(
            f"TOWS_UNRESOLVABLE_PAIRING_TYPE: ({internal_category!r}, {external_category!r}) is not one of the "
            f"4 legal internal+external category combinations {sorted(_PAIRING_TYPE_BY_CATEGORIES)} (Atlas L519/"
            "§11.8 SO/ST/WO/WT structure)"
        )
    return _PAIRING_TYPE_BY_CATEGORIES[key]


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def tows_pairing(pairing_id: str, internal_factor_id: str, external_factor_id: str, strategy_option: str) -> dict[str, Any]:
    """One item of ``typed-objects/tows-matrix.schema.yaml#/properties/pairings`` -- BEFORE ``pairing_type`` is
    computed. Deliberately has NO ``pairing_type`` parameter: see module docstring, this is the structural half
    of the "never caller-asserted" invariant. A thin constructor, not a validator -- referential integrity
    against the real ``SwotAnalysis`` is checked by ``generate_tows_matrix``/``evaluate_tows_integrity_gate``,
    not here."""
    return {"id": pairing_id, "internal_factor_id": internal_factor_id, "external_factor_id": external_factor_id, "strategy_option": strategy_option}


def _factor_category_map(swot_analysis: dict[str, Any]) -> dict[str, str]:
    """Validates ``swot_analysis`` is a real SwotAnalysis dict and returns its ``factor id -> category`` map.
    Shared by the builder and the gate so neither can drift from the other."""
    factors = swot_analysis.get("factors") if isinstance(swot_analysis, dict) else None
    if not isinstance(factors, list) or not factors:
        raise InvariantViolation("TOWS_INVALID_SWOT_ANALYSIS: swot_analysis must be a real SwotAnalysis dict with a non-empty factors[] list")
    mapping: dict[str, str] = {}
    for factor in factors:
        if not isinstance(factor, dict) or not _is_nonempty_str(factor.get("id")) or factor.get("category") not in VALID_CATEGORIES:
            raise InvariantViolation(f"TOWS_INVALID_SWOT_ANALYSIS: malformed factor entry {factor!r} (must carry a non-empty id and a category in {sorted(VALID_CATEGORIES)})")
        mapping[factor["id"]] = factor["category"]
    return mapping


def _resolve_pairing_type(pairing: dict[str, Any], factor_category_map: dict[str, str]) -> str:
    """Real referential-integrity + genuine-compute core, shared by the builder and the gate. Raises
    ``InvariantViolation`` with a specific code on every distinct failure mode -- never silently guesses."""
    if "pairing_type" in pairing:
        raise InvariantViolation(
            f"TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED: pairing {pairing.get('id')!r} carries a caller-"
            "supplied pairing_type -- this field is ALWAYS computed from the two referenced factors' real "
            "categories, never trusted from input (a caller-asserted 'SO' on a WEAKNESS+THREAT pair would "
            "otherwise pass silently)"
        )
    internal_id = pairing.get("internal_factor_id")
    external_id = pairing.get("external_factor_id")
    if internal_id not in factor_category_map:
        raise InvariantViolation(f"TOWS_UNKNOWN_FACTOR_ID: internal_factor_id {internal_id!r} does not resolve to any factor in the referenced SwotAnalysis")
    if external_id not in factor_category_map:
        raise InvariantViolation(f"TOWS_UNKNOWN_FACTOR_ID: external_factor_id {external_id!r} does not resolve to any factor in the referenced SwotAnalysis")
    internal_category = factor_category_map[internal_id]
    external_category = factor_category_map[external_id]
    if not is_internal(internal_category):
        raise InvariantViolation(
            f"TOWS_INTERNAL_FACTOR_NOT_INTERNAL: internal_factor_id {internal_id!r} resolves to category "
            f"{internal_category!r}, which is EXTERNAL (Atlas's SO/ST/WO/WT structure requires one INTERNAL + "
            "one EXTERNAL factor per pairing)"
        )
    if is_internal(external_category):
        raise InvariantViolation(
            f"TOWS_EXTERNAL_FACTOR_NOT_EXTERNAL: external_factor_id {external_id!r} resolves to category "
            f"{external_category!r}, which is INTERNAL (Atlas's SO/ST/WO/WT structure requires one INTERNAL + "
            "one EXTERNAL factor per pairing)"
        )
    return derive_pairing_type(internal_category, external_category)


def generate_tows_matrix(
    record_id: str,
    swot_analysis: dict[str, Any],
    pairings: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/tows-matrix.schema.yaml``. Enforces every real invariant fail-closed BEFORE
    constructing a record -- same discipline every sibling module in this package establishes. ``swot_analysis``
    is the REAL ``SwotAnalysis`` dict (e.g. straight from
    ``ai_lego.modules.strategy.swot.generate_swot_analysis``), not a bare ref string -- this is the genuine
    cross-method dependency the method's own citation (Atlas L1335 step 5, §14.1 legal chain) mandates."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TOWS_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TOWS_INVALID_VERSION: version must be a string, got {version!r}")

    factor_category_map = _factor_category_map(swot_analysis)

    if not isinstance(pairings, list) or not pairings:
        raise InvariantViolation("TOWS_EMPTY_PAIRINGS: tows-matrix.schema.yaml requires pairings minItems:1")

    built_pairings: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for pairing in pairings:
        if not isinstance(pairing, dict) or not _is_nonempty_str(pairing.get("id")):
            raise InvariantViolation(f"TOWS_PAIRING_MISSING_ID: every pairing must carry a non-empty id, got {pairing!r}")
        if pairing["id"] in seen_ids:
            raise InvariantViolation(f"TOWS_DUPLICATE_PAIRING_ID: pairing id {pairing['id']!r} appears more than once")
        seen_ids.add(pairing["id"])
        if not _is_nonempty_str(pairing.get("strategy_option")):
            raise InvariantViolation(
                f"TOWS_EMPTY_STRATEGY_OPTION: pairing {pairing['id']!r} must carry a non-empty strategy_option "
                "(Atlas §11.8 benefit: 把「分析清單」真正轉成 Strategy Options)"
            )
        pairing_type = _resolve_pairing_type(pairing, factor_category_map)
        built_pairings.append(
            {
                "id": pairing["id"],
                "internal_factor_id": pairing["internal_factor_id"],
                "external_factor_id": pairing["external_factor_id"],
                "pairing_type": pairing_type,
                "strategy_option": pairing["strategy_option"],
            }
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "swot_analysis_ref": swot_analysis["id"],
        "pairings": built_pairings,
        "referential_integrity_verified": True,
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance_record is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_tows_integrity_gate(record: dict[str, Any], swot_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields against the SAME real ``swot_analysis``
    -- does not trust any stored value, does NOT call ``generate_tows_matrix``, so a hand-tampered record (or
    one checked against a swot_analysis it does not actually belong to) is caught here exactly as a
    builder-refused one would have been. This is the genuine cross-method dependency at the GATE layer, not
    only at construction. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("tows_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("tows_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("tows_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    try:
        factor_category_map = _factor_category_map(swot_analysis)
    except InvariantViolation as error:
        return _result("tows_integrity", False, [{"reason": f"INVALID_SWOT_ANALYSIS: {error}"}], validator, timestamp)

    if record.get("swot_analysis_ref") != swot_analysis.get("id"):
        return _result(
            "tows_integrity",
            False,
            [{"reason": "SWOT_ANALYSIS_REF_MISMATCH", "record_ref": record.get("swot_analysis_ref"), "swot_analysis_id": swot_analysis.get("id")}],
            validator,
            timestamp,
        )

    pairings = record.get("pairings")
    if not isinstance(pairings, list) or not pairings:
        return _result("tows_integrity", False, [{"reason": "EMPTY_PAIRINGS"}], validator, timestamp)

    problems: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for pairing in pairings:
        if not isinstance(pairing, dict) or not _is_nonempty_str(pairing.get("id")):
            problems.append({"pairing": pairing, "reason": "MISSING_ID"})
            continue
        pairing_id = pairing["id"]
        if pairing_id in seen_ids:
            problems.append({"pairing": pairing_id, "reason": "DUPLICATE_PAIRING_ID"})
            continue
        seen_ids.add(pairing_id)
        if not _is_nonempty_str(pairing.get("strategy_option")):
            problems.append({"pairing": pairing_id, "reason": "EMPTY_STRATEGY_OPTION"})
            continue
        internal_id = pairing.get("internal_factor_id")
        external_id = pairing.get("external_factor_id")
        stored_type = pairing.get("pairing_type")
        if internal_id not in factor_category_map:
            problems.append({"pairing": pairing_id, "reason": "UNKNOWN_INTERNAL_FACTOR_ID"})
            continue
        if external_id not in factor_category_map:
            problems.append({"pairing": pairing_id, "reason": "UNKNOWN_EXTERNAL_FACTOR_ID"})
            continue
        internal_category = factor_category_map[internal_id]
        external_category = factor_category_map[external_id]
        if not is_internal(internal_category):
            problems.append({"pairing": pairing_id, "reason": "INTERNAL_FACTOR_NOT_INTERNAL"})
            continue
        if is_internal(external_category):
            problems.append({"pairing": pairing_id, "reason": "EXTERNAL_FACTOR_NOT_EXTERNAL"})
            continue
        try:
            recomputed_type = derive_pairing_type(internal_category, external_category)
        except InvariantViolation:
            problems.append({"pairing": pairing_id, "reason": "UNRESOLVABLE_PAIRING_TYPE"})
            continue
        if stored_type != recomputed_type:
            problems.append({"pairing": pairing_id, "reason": "PAIRING_TYPE_MISMATCH", "stored": stored_type, "recomputed": recomputed_type})

    if record.get("referential_integrity_verified") is not True:
        problems.append({"reason": "REFERENTIAL_INTEGRITY_VERIFIED_NOT_TRUE"})

    passed = not problems
    return _result("tows_integrity", passed, [{"pairings_checked": len(pairings), "problems": problems}], validator, timestamp)


def evaluate_tows_gates(record: dict[str, Any], swot_analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_tows_integrity_gate(record, swot_analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
