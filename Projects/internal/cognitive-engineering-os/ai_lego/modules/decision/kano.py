"""``decision.kano`` -- F16 decision family, 12th of 13 concrete members (after ahp/mcda/impact_effort/
ice/rice/moscow/weighted_decision_matrix/topsis/decision_tree/expected_value/pareto_frontier). Atlas F16
table row L765 (grep-confirmed sole Atlas hit, bare 4-column row, no dedicated section, no §22.3 gate-table
row, no §28 routing mention): "Kano | Basic/Performance/Delighter | 功能需求分類 | 不只看票數".

CRITICAL DUE-DILIGENCE (both siblings read in full before writing this module): ``decision.moscow`` is a
categorical 4-bucket classifier for RELEASE-SCOPE items, caller-ASSERTS the bucket directly (no compute
layer -- MoSCoW buckets are business judgment with no more-primitive data to derive them from).
``decision.impact_effort`` COMPUTES a categorical quadrant from 2 continuous axes via threshold comparison.
Kano classifies FEATURES by satisfaction-curve shape -- a third, distinct axis (customer satisfaction
analysis, not scope-cut or impact/effort triage) -- and, like Impact-Effort, has a real, well-established
derivation mechanism to compute FROM, not just assert: the classical Kano evaluation table (functional
response x dysfunctional response -> category; external, public-domain PM convention, NOT Atlas content --
see ``ai_lego.compute.kano.classification`` module docstring for the 1984 citation and the multi-source
cross-verification this table's values were checked against). Zero pre-existing overlap confirmed (grepped
ai_lego/ and specs/ for kano/delighter/must_be/basic_need/performance_need/dysfunctional before writing --
no hits).

GENUINE_COMPUTE, not caller-asserted (full a-vs-b reasoning: methods/contracts/decision.kano.contract.yaml's
own compilation_decisions): Atlas's own benefit column "不只看票數" (not just vote counts) directly implies
real classification logic beats naive tallying -- a caller-asserted category would BE the naive tallying
Atlas's own text contrasts against. Same two-layer discipline every genuine-compute sibling in this family
already establishes: every feature's ``category`` is COMPUTED by
``ai_lego.compute.kano.classification.classify_kano_category`` at construction (no constructor parameter for
it) and independently RE-DERIVED at the gate (``evaluate_kano_integrity_gate``, bundled under gate_id
``kano_integrity``) -- a hand-tampered record with a mismatched category fails the gate.

The 6-category vocabulary (Atlas names 3: basic/performance/delighter; the classical model has 3 more --
indifferent/reverse/questionable, added here as a disclosed external-convention necessity: the lookup table
must be TOTAL over all 25 functional x dysfunctional combinations, and 3 categories cannot cover all 25
cells without leaving most unclassifiable).

No automatic-authority guard (unlike ``decision.impact_effort``'s own inferred §11.30 L1905-1906 rule): Atlas
gives Kano no dedicated section, no prose caution, and no §22.3 gate-table row (grep-confirmed) -- inventing
one here would be fabricated scope. Same precedent ``decision.moscow``'s own empty ``forbidden_transition``
already establishes for a bare-table-row-only method. Consequently this module exposes 3 gates
(provenance_required/genuine_compute/kano_integrity), not impact_effort's 4.

Gate style: isinstance-first / safe ``.get()``, per ``root_cause.fault_tree``. ``evaluate_kano_integrity_gate``
re-derives via the SAME raising validators construction uses (``validate_response``/``classify_kano_category``,
via try/except) rather than a second, parallel set of boolean predicates -- avoids two implementations of the
same response-validity logic that could drift, same trade-off ``evaluate_quadrant_integrity_gate``'s own
try/except style already accepts in this codebase. One structural consequence worth naming explicitly: an
illegal response VALUE can only ever be observed by the gate on a hand-tampered record -- the real
constructor's own shape check (``_feature_input_is_valid``) already refuses it earlier, as
``KANO_INVALID_FEATURES``, before ``classify_features``/``validate_response`` are ever reached (see
``test_kano.py``'s own dedicated test for this asymmetric-unreachable-through-construction case, same
precedent ``moscow.py``'s duplicate-id gate test already establishes for its own family).
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.kano.classification import (
    VALID_CATEGORIES,
    VALID_RESPONSES,
    classify_features,
    classify_kano_category,
    validate_response,
)
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.kano"
RECORD_ID_PREFIX = "KANO-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.kano.classification.classify_kano_category"

_KNOWN_FEATURE_INPUT_KEYS = frozenset({"id", "label", "functional_response", "dysfunctional_response"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline every sibling module in this family's own ``_shallow_describe`` uses."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _feature_input_is_valid(feature: Any) -> bool:
    """Shape only (keys closed, id/label non-empty strings, both responses legal enum values). Same
    three-independent-predicates split ``impact_effort.py``'s own ``_idea_input_is_valid`` already
    establishes, so a failure always names the specific bug class. Unlike impact/effort's numeric
    impact/effort (which has a genuinely separate later RANGE check), a Kano response's entire validity IS
    enum membership -- there is no weaker "type-only" stage to defer, so the full check lives here."""
    if not isinstance(feature, dict) or set(feature.keys()) != _KNOWN_FEATURE_INPUT_KEYS:
        return False
    if not _is_nonempty_str(feature["id"]) or not _is_nonempty_str(feature["label"]):
        return False
    return feature["functional_response"] in VALID_RESPONSES and feature["dysfunctional_response"] in VALID_RESPONSES


def generate_kano_classification_record(
    record_id: str,
    subject: str,
    features: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/kano-classification-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed, in this order: id/subject/version shape, feature shape,
    feature-id-uniqueness, then category computation (delegated to
    ``ai_lego.compute.kano.classification.classify_features``, which is where ``KANO_INVALID_RESPONSE`` would
    raise, though it is unreachable via this path -- see module docstring). ``category`` is COMPUTED -- there
    is no parameter for it; a caller cannot supply one."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"KANO_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"KANO_EMPTY_RECORD_FIELD: subject must be a non-empty string, got {subject!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"KANO_INVALID_VERSION: version must be a string, got {version!r}")
    if not isinstance(features, list) or not features or not all(_feature_input_is_valid(f) for f in features):
        raise InvariantViolation(
            f"KANO_INVALID_FEATURES: features must be a non-empty list of well-shaped entries "
            f"(id/label non-empty strings, functional_response/dysfunctional_response each one of {sorted(VALID_RESPONSES)}, "
            f"no extra/missing keys), got {_shallow_describe(features)}"
        )
    ids = [f["id"] for f in features]
    if len(set(ids)) != len(ids):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        raise InvariantViolation(f"KANO_DUPLICATE_FEATURE_ID: id(s) {duplicates} used more than once -- every feature id must be unique in the record")

    classified_features = classify_features(features)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "features": classified_features,
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
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- same reuse every
    genuine-compute sibling in this family already establishes, checking this record's own ``engine``/
    ``computation_provenance_ref``/``provenance`` METADATA fields resolve and are well-formed. Does NOT by
    itself re-derive whether the stored category VALUES are correct -- that is
    ``evaluate_kano_integrity_gate``'s own, stronger job; the two gates are complementary, not redundant.
    Guards ``isinstance(record, dict)`` itself before delegating, same discipline ``impact_effort.py``'s own
    identically-shaped gate already establishes."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_kano_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any stored
    value, including whether each feature's own ``category`` actually matches what
    ``ai_lego.compute.kano.classification.classify_kano_category`` recomputes fresh from that same feature's
    functional/dysfunctional responses. Reuses the SAME raising validators construction uses (via
    try/except) rather than a second, parallel set of boolean predicates -- avoids two implementations of the
    same response-validity logic that could drift, same trade-off
    ``evaluate_quadrant_integrity_gate``'s own try/except style already accepts in this codebase. Bundles
    feature-shape/response-validity/category-mismatch/duplicate-id under one gate_id, same shape
    ``evaluate_quadrant_integrity_gate`` already uses for its own family (several distinct, DEPENDENT
    structural reasons -- recomputing a category is only meaningful once the responses it depends on are
    themselves legal values -- one gate_id, each mismatch its own distinguishable evidence entry). FAILS
    CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("kano_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("kano_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("kano_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    features = record.get("features")
    if not isinstance(features, list) or not features:
        return _result("kano_integrity", False, [{"reason": "features missing, empty, or not a list"}], validator, timestamp)

    required_keys = {"id", "label", "functional_response", "dysfunctional_response", "category"}
    mismatches: list[str] = []
    for entry in features:
        if not isinstance(entry, dict) or not required_keys <= entry.keys():
            mismatches.append(f"feature entry malformed or missing a required key: {_shallow_describe(entry)}")
            continue
        try:
            validate_response(entry["functional_response"], "functional_response", entry.get("id", "?"))
            validate_response(entry["dysfunctional_response"], "dysfunctional_response", entry.get("id", "?"))
        except InvariantViolation as error:
            mismatches.append(str(error))
            continue
        if entry["category"] not in VALID_CATEGORIES:
            mismatches.append(f"feature {entry['id']!r}: stored category={entry['category']!r} is not one of the 6 canonical categories {sorted(VALID_CATEGORIES)}")
            continue
        recomputed = classify_kano_category(entry["functional_response"], entry["dysfunctional_response"])
        if entry["category"] != recomputed:
            mismatches.append(f"feature {entry['id']!r}: stored category={entry['category']!r} does not match recomputed={recomputed!r}")

    ids = [e["id"] for e in features if isinstance(e, dict) and "id" in e]
    if len(set(ids)) != len(ids):
        mismatches.append("duplicate feature id across features[]")

    if mismatches:
        return _result("kano_integrity", False, [{"reason": "category/response mismatch", "details": mismatches}], validator, timestamp)

    category_counts = {c: sum(1 for e in features if e.get("category") == c) for c in VALID_CATEGORIES}
    return _result("kano_integrity", True, [{"feature_count": len(features), "category_counts": category_counts}], validator, timestamp)


def evaluate_kano_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_kano_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
