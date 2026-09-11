"""``strategy.value_proposition_canvas`` -- F08 context/strategy family, 14th and FINAL member (after
``strategy.swot``/``strategy.pestel``/``strategy.steepv``/``strategy.three_c``/``strategy.tows``/
``strategy.porter_five_forces``/``strategy.vrio``/``strategy.value_chain``/``strategy.stp``/``strategy.ansoff``
plus this batch's 3 concurrent siblings ``strategy.bcg_matrix``/``strategy.blue_ocean``/
``strategy.business_model_canvas``, none read or touched here).

Atlas F08 table row L528 ("Value Proposition Canvas｜customer jobs/pains/gains 對齊方案｜Customer profile→
Value map→fit hypotheses｜提高 product-market fit｜JTBD、Prototype") -- no dedicated §12.x section exists
(grep-confirmed: the only 2 other "Value Proposition"-family hits in the whole Atlas file are L2711, an
unrelated STP §12.14 "搭配" mention, and L2723, an unrelated "Value Propositions" cell inside §12.15 Business
Model Canvas's own 9-block list). Real, standard Osterwalder structure: Customer Profile side (jobs/pains/
gains, 3 parts) + Value Map side (products_and_services/pain_relievers/gain_creators, 3 parts -- NOT
Atlas-cited at this granularity, disclosed in methods/contracts/strategy.value_proposition_canvas.contract.yaml's
own compilation_decisions as independently-verified domain knowledge) + `fit_hypotheses[]` as the citation's own
literal 3rd pipeline stage.

Core invariant: each `fit_hypotheses[]` entry's `fit_type` (PAIN_RELIEF/GAIN_CREATION) is GENUINE_COMPUTE,
referentially derived from real `pain_relievers`/`gain_creators` and `pains`/`gains` ids -- never
caller-supplied, same class `ai_lego.modules.strategy.tows`'s `pairing_type` and
`ai_lego.modules.strategy.stp`'s `targeted_segment_id` resolution already establish. Unlike TOWS's
cross-record dependency (pairings check against an upstream SwotAnalysis) or STP's single-record reference
(targeting_decision -> segments[]), VPC's referential check is entirely SELF-CONTAINED but spans FOUR sibling
collections within the same record: `reliever_or_creator_id` must resolve into `pain_relievers[]` OR
`gain_creators[]`, and `pain_or_gain_id` must resolve into `pains[]` OR `gains[]`, with the two resolutions
cross-checked against each other (a pain_reliever may only pair with a pain; a gain_creator may only pair with
a gain).

Real invariants (beyond per-field completeness), enforced at BOTH construction (raise before any record is
built) AND independently re-derived by a gate from raw fields -- same two-layer discipline every sibling module
in this package establishes:

1. **VPC_EMPTY_<ARRAY>** (one per jobs/pains/gains/products_and_services/pain_relievers/gain_creators): all 6
   sides of the canvas must be non-empty -- the method contract's own precondition list, not only the 2
   Atlas-cited "sides".
2. **VPC_<ARRAY>_MISSING_ID** / **VPC_DUPLICATE_<ARRAY>_ID** / **VPC_<ARRAY>_MISSING_STATEMENT**: every entry in
   every one of the 6 arrays carries a non-empty, array-unique id and a non-empty statement.
3. **VPC_ID_COLLISION_PAIN_GAIN** / **VPC_ID_COLLISION_RELIEVER_CREATOR**: no id is reused across pains/gains
   (or pain_relievers/gain_creators) -- fit_hypotheses references must resolve unambiguously into exactly one
   collection.
4. **VPC_EMPTY_FIT_HYPOTHESES**: Atlas's own citation's literal, final 3rd pipeline stage.
5. **VPC_UNKNOWN_RELIEVER_OR_CREATOR_ID** / **VPC_UNKNOWN_PAIN_OR_GAIN_ID**: every fit_hypotheses reference must
   resolve to a real id in this same record.
6. **VPC_FIT_TYPE_MUST_NOT_BE_CALLER_SUPPLIED**: a raw fit_hypothesis dict carrying its own `fit_type` key is
   refused outright -- this field is ALWAYS computed, never trusted from input.
7. **VPC_FIT_TYPE_MISMATCH**: a pain_reliever addressing a "gain" or a gain_creator addressing a "pain" is not
   a coherent fit hypothesis (the citation's own "align jobs/pains/gains with a solution" sense).
8. **VPC_EMPTY_FIT_RATIONALE**: a fit_type label with no disclosed reasoning has not demonstrated real fit,
   only asserted a category.

Grepped the whole ``ai_lego`` tree case-insensitively for "value_proposition_canvas" before writing any of this
method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.value_proposition_canvas"
RECORD_ID_PREFIX = "VPC-"
COMPUTATION_PROVENANCE_REF = "ai_lego.modules.strategy.value_proposition_canvas.derive_fit_type"

# The 6 Customer-Profile / Value-Map arrays, per methods/contracts/strategy.value_proposition_canvas.contract.
# yaml's own preconditions. Order matters only for readability -- each is validated independently.
CANVAS_ARRAYS: tuple[str, ...] = ("jobs", "pains", "gains", "products_and_services", "pain_relievers", "gain_creators")

_EMPTY_CODE_BY_ARRAY: dict[str, str] = {name: f"VPC_EMPTY_{name.upper()}" for name in CANVAS_ARRAYS}

_FIT_TYPE_BY_CATEGORIES: dict[tuple[str, str], str] = {
    ("PAIN_RELIEVER", "PAIN"): "PAIN_RELIEF",
    ("GAIN_CREATOR", "GAIN"): "GAIN_CREATION",
}
# Atlas L528's own 3rd pipeline stage ("fit hypotheses"), transcribed via the real, standard Osterwalder
# pairing rule: a Pain Reliever pairs ONLY with a Pain, a Gain Creator pairs ONLY with a Gain (see method
# contract's own compilation_decisions) -- the ONLY 2 legal (reliever_or_creator category, pain_or_gain
# category) combinations.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def derive_fit_type(reliever_or_creator_category: str, pain_or_gain_category: str) -> str:
    """GENUINE_COMPUTE: the sole authority for turning a (reliever_or_creator category, pain_or_gain category)
    pair into a fit_type. Called by BOTH the builder (at construction) and the gate (re-derived from raw
    fields) -- neither can drift from the other. Raises if the two categories don't form a legal pain_reliever
    +pain / gain_creator+gain pair (defense in depth -- by the time this is called, the caller has already
    confirmed each id resolves into a real collection)."""
    key = (reliever_or_creator_category, pain_or_gain_category)
    if key not in _FIT_TYPE_BY_CATEGORIES:
        raise InvariantViolation(
            f"VPC_FIT_TYPE_MISMATCH: ({reliever_or_creator_category!r}, {pain_or_gain_category!r}) is not one of "
            f"the 2 legal reliever/creator+pain/gain combinations {sorted(_FIT_TYPE_BY_CATEGORIES)} -- a "
            "pain_reliever may only pair with a pain, and a gain_creator may only pair with a gain"
        )
    return _FIT_TYPE_BY_CATEGORIES[key]


def canvas_item(item_id: str, statement: str) -> dict[str, Any]:
    """One item of any of the 6 labeled_item_list arrays (jobs/pains/gains/products_and_services/
    pain_relievers/gain_creators) -- all 6 share this identical {id, statement} shape (see typed-object
    schema's own `$defs/labeled_item_list`). A thin constructor, not a validator -- completeness is checked by
    ``generate_value_proposition_canvas``/``evaluate_vpc_integrity_gate``, not here."""
    return {"id": item_id, "statement": statement}


def fit_hypothesis(hypothesis_id: str, reliever_or_creator_id: str, pain_or_gain_id: str, fit_rationale: str) -> dict[str, Any]:
    """One item of ``typed-objects/value-proposition-canvas.schema.yaml#/properties/fit_hypotheses`` -- BEFORE
    ``fit_type`` is computed. Deliberately has NO ``fit_type`` parameter: see module docstring, this is the
    structural half of the "never caller-asserted" invariant. Referential integrity against the real
    pain_relievers/gain_creators/pains/gains collections is checked by
    ``generate_value_proposition_canvas``/``evaluate_vpc_integrity_gate``, not here."""
    return {"id": hypothesis_id, "reliever_or_creator_id": reliever_or_creator_id, "pain_or_gain_id": pain_or_gain_id, "fit_rationale": fit_rationale}


def _labeled_item_id_set(items: Any, array_name: str) -> tuple[bool, set[str] | None, str | None]:
    """Validates one of the 6 canvas arrays' shape and returns ``(is_valid, id_set, failure_reason)``. Shared
    by the builder and the gate so neither can drift from the other."""
    empty_code = _EMPTY_CODE_BY_ARRAY[array_name]
    if not isinstance(items, list) or not items:
        return False, None, empty_code
    upper = array_name.upper()
    ids: set[str] = set()
    for entry in items:
        if not isinstance(entry, dict) or not _is_nonempty_str(entry.get("id")):
            return False, None, f"VPC_{upper}_MISSING_ID"
        if entry["id"] in ids:
            return False, None, f"VPC_DUPLICATE_{upper}_ID"
        if not _is_nonempty_str(entry.get("statement")):
            return False, None, f"VPC_{upper}_MISSING_STATEMENT"
        ids.add(entry["id"])
    return True, ids, None


def _validate_all_arrays(canvas_arrays: dict[str, Any]) -> dict[str, set[str]]:
    """Runs ``_labeled_item_id_set`` over all 6 arrays, raising on the first failure (fail-closed, same
    ordering every sibling module in this package establishes). Returns ``{array_name: id_set}`` on success."""
    id_sets: dict[str, set[str]] = {}
    for name in CANVAS_ARRAYS:
        ok, id_set, reason = _labeled_item_id_set(canvas_arrays[name], name)
        if not ok:
            raise InvariantViolation(f"{reason}: array {name!r} failed completeness check, got {canvas_arrays[name]!r}")
        id_sets[name] = id_set  # type: ignore[assignment]
    return id_sets


def _check_no_id_collision(id_sets: dict[str, set[str]], left: str, right: str, code: str) -> None:
    overlap = id_sets[left] & id_sets[right]
    if overlap:
        raise InvariantViolation(f"{code}: id(s) {sorted(overlap)} appear in BOTH {left!r} and {right!r} -- fit_hypotheses references would be ambiguous")


def _reliever_or_creator_category(item_id: str, id_sets: dict[str, set[str]]) -> str | None:
    if item_id in id_sets["pain_relievers"]:
        return "PAIN_RELIEVER"
    if item_id in id_sets["gain_creators"]:
        return "GAIN_CREATOR"
    return None


def _pain_or_gain_category(item_id: str, id_sets: dict[str, set[str]]) -> str | None:
    if item_id in id_sets["pains"]:
        return "PAIN"
    if item_id in id_sets["gains"]:
        return "GAIN"
    return None


def _resolve_fit_type(hypothesis: dict[str, Any], id_sets: dict[str, set[str]]) -> str:
    """Real referential-integrity + genuine-compute core, shared by the builder and the gate. Raises
    ``InvariantViolation`` with a specific code on every distinct failure mode -- never silently guesses."""
    if "fit_type" in hypothesis:
        raise InvariantViolation(
            f"VPC_FIT_TYPE_MUST_NOT_BE_CALLER_SUPPLIED: fit_hypothesis {hypothesis.get('id')!r} carries a "
            "caller-supplied fit_type -- this field is ALWAYS computed from reliever_or_creator_id/"
            "pain_or_gain_id's real collection membership, never trusted from input"
        )
    reliever_or_creator_id = hypothesis.get("reliever_or_creator_id")
    reliever_or_creator_category = _reliever_or_creator_category(reliever_or_creator_id, id_sets)
    if reliever_or_creator_category is None:
        raise InvariantViolation(
            f"VPC_UNKNOWN_RELIEVER_OR_CREATOR_ID: reliever_or_creator_id {reliever_or_creator_id!r} does not "
            "resolve to any entry in pain_relievers[] or gain_creators[]"
        )
    pain_or_gain_id = hypothesis.get("pain_or_gain_id")
    pain_or_gain_category = _pain_or_gain_category(pain_or_gain_id, id_sets)
    if pain_or_gain_category is None:
        raise InvariantViolation(f"VPC_UNKNOWN_PAIN_OR_GAIN_ID: pain_or_gain_id {pain_or_gain_id!r} does not resolve to any entry in pains[] or gains[]")
    return derive_fit_type(reliever_or_creator_category, pain_or_gain_category)


def generate_value_proposition_canvas(
    record_id: str,
    jobs: list[dict[str, Any]],
    pains: list[dict[str, Any]],
    gains: list[dict[str, Any]],
    products_and_services: list[dict[str, Any]],
    pain_relievers: list[dict[str, Any]],
    gain_creators: list[dict[str, Any]],
    fit_hypotheses: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/value-proposition-canvas.schema.yaml``. Enforces every real invariant
    fail-closed BEFORE constructing a record -- same discipline every sibling module in this package
    establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"VPC_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"VPC_INVALID_VERSION: version must be a string, got {version!r}")

    raw_arrays = {"jobs": jobs, "pains": pains, "gains": gains, "products_and_services": products_and_services, "pain_relievers": pain_relievers, "gain_creators": gain_creators}
    id_sets = _validate_all_arrays(raw_arrays)

    _check_no_id_collision(id_sets, "pains", "gains", "VPC_ID_COLLISION_PAIN_GAIN")
    _check_no_id_collision(id_sets, "pain_relievers", "gain_creators", "VPC_ID_COLLISION_RELIEVER_CREATOR")

    if not isinstance(fit_hypotheses, list) or not fit_hypotheses:
        raise InvariantViolation("VPC_EMPTY_FIT_HYPOTHESES: fit_hypotheses must be a non-empty list -- Atlas L528's own literal, final 3rd pipeline stage")

    built_hypotheses: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for hypothesis in fit_hypotheses:
        if not isinstance(hypothesis, dict) or not _is_nonempty_str(hypothesis.get("id")):
            raise InvariantViolation(f"VPC_FIT_HYPOTHESIS_MISSING_ID: every fit_hypothesis must carry a non-empty id, got {hypothesis!r}")
        if hypothesis["id"] in seen_ids:
            raise InvariantViolation(f"VPC_DUPLICATE_FIT_HYPOTHESIS_ID: fit_hypothesis id {hypothesis['id']!r} appears more than once")
        seen_ids.add(hypothesis["id"])
        if not _is_nonempty_str(hypothesis.get("fit_rationale")):
            raise InvariantViolation(
                f"VPC_EMPTY_FIT_RATIONALE: fit_hypothesis {hypothesis['id']!r} must carry a non-empty fit_rationale "
                "-- a fit_type label with no disclosed reasoning has not demonstrated real fit, only asserted a category"
            )
        fit_type = _resolve_fit_type(hypothesis, id_sets)
        built_hypotheses.append(
            {
                "id": hypothesis["id"],
                "reliever_or_creator_id": hypothesis["reliever_or_creator_id"],
                "pain_or_gain_id": hypothesis["pain_or_gain_id"],
                "fit_type": fit_type,
                "fit_rationale": hypothesis["fit_rationale"],
            }
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "jobs": [dict(item) for item in jobs],
        "pains": [dict(item) for item in pains],
        "gains": [dict(item) for item in gains],
        "products_and_services": [dict(item) for item in products_and_services],
        "pain_relievers": [dict(item) for item in pain_relievers],
        "gain_creators": [dict(item) for item in gain_creators],
        "fit_hypotheses": built_hypotheses,
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


def evaluate_vpc_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_value_proposition_canvas``, so a hand-tampered record (one that bypassed the
    builder entirely) is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("vpc_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("vpc_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("vpc_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    problems: list[dict[str, Any]] = []
    id_sets: dict[str, set[str]] = {}
    for name in CANVAS_ARRAYS:
        ok, id_set, reason = _labeled_item_id_set(record.get(name), name)
        if not ok:
            problems.append({"array": name, "reason": reason})
            id_sets[name] = set()
        else:
            id_sets[name] = id_set  # type: ignore[assignment]

    if id_sets["pains"] & id_sets["gains"]:
        problems.append({"reason": "VPC_ID_COLLISION_PAIN_GAIN", "ids": sorted(id_sets["pains"] & id_sets["gains"])})
    if id_sets["pain_relievers"] & id_sets["gain_creators"]:
        problems.append({"reason": "VPC_ID_COLLISION_RELIEVER_CREATOR", "ids": sorted(id_sets["pain_relievers"] & id_sets["gain_creators"])})

    fit_hypotheses = record.get("fit_hypotheses")
    if not isinstance(fit_hypotheses, list) or not fit_hypotheses:
        problems.append({"reason": "VPC_EMPTY_FIT_HYPOTHESES"})
    else:
        seen_ids: set[str] = set()
        for hypothesis in fit_hypotheses:
            if not isinstance(hypothesis, dict) or not _is_nonempty_str(hypothesis.get("id")):
                problems.append({"hypothesis": hypothesis, "reason": "MISSING_ID"})
                continue
            hypothesis_id = hypothesis["id"]
            if hypothesis_id in seen_ids:
                problems.append({"hypothesis": hypothesis_id, "reason": "DUPLICATE_FIT_HYPOTHESIS_ID"})
                continue
            seen_ids.add(hypothesis_id)
            if not _is_nonempty_str(hypothesis.get("fit_rationale")):
                problems.append({"hypothesis": hypothesis_id, "reason": "VPC_EMPTY_FIT_RATIONALE"})
                continue
            reliever_or_creator_id = hypothesis.get("reliever_or_creator_id")
            pain_or_gain_id = hypothesis.get("pain_or_gain_id")
            stored_type = hypothesis.get("fit_type")
            reliever_or_creator_category = _reliever_or_creator_category(reliever_or_creator_id, id_sets)
            if reliever_or_creator_category is None:
                problems.append({"hypothesis": hypothesis_id, "reason": "VPC_UNKNOWN_RELIEVER_OR_CREATOR_ID"})
                continue
            pain_or_gain_category = _pain_or_gain_category(pain_or_gain_id, id_sets)
            if pain_or_gain_category is None:
                problems.append({"hypothesis": hypothesis_id, "reason": "VPC_UNKNOWN_PAIN_OR_GAIN_ID"})
                continue
            try:
                recomputed_type = derive_fit_type(reliever_or_creator_category, pain_or_gain_category)
            except InvariantViolation:
                problems.append({"hypothesis": hypothesis_id, "reason": "VPC_FIT_TYPE_MISMATCH"})
                continue
            if stored_type != recomputed_type:
                problems.append({"hypothesis": hypothesis_id, "reason": "FIT_TYPE_MISMATCH", "stored": stored_type, "recomputed": recomputed_type})

    if record.get("referential_integrity_verified") is not True:
        problems.append({"reason": "REFERENTIAL_INTEGRITY_VERIFIED_NOT_TRUE"})

    passed = not problems
    return _result("vpc_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_vpc_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_vpc_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
