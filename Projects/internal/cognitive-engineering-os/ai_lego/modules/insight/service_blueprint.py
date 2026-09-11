"""``insight.service_blueprint`` -- F06 human/customer insight family, new family, 5th member (see sibling
F06 modules for the other members opened in this same batch).

Atlas cites this method TWICE: the F06 tool table row (L465: "前台＋後台流程｜customer→frontstage→
backstage→support/system｜避免只改 UI｜適合服務系統") and a dedicated §12.16 section (L2738-2756) giving a
literal 5-layer vertical structure (Customer Actions / Frontstage / Backstage / Support Processes /
Systems-Data). §12.16's own 5 layers split the table row's own merged "support/system" stage into 2
distinct layers -- the dedicated section is more specific and authoritative, used as the real design here
(disclosed as a compilation decision in the contract, not a discrepancy silently resolved).

**Design-shape investigation (task-mandated, disclosed here)**: read ``strategy/porter_five_forces.py``'s
``FORCE_NAMES`` (a closed SET requiring completeness, each name EXACTLY once, no position) before choosing
this method's own shape. Porter's five forces are each a singular structural dimension of one industry --
Atlas's own §12.11 definition IS the five-way split, so "exactly once each" is the correct cardinality.
Service Blueprint's 5 layers are different: a single "frontstage" LAYER of a real service can contain
MULTIPLE concrete touchpoints (e.g. a phone call AND an in-person handoff), and neither citation for this
method states a one-entry-per-layer cardinality. So ``LAYER_TYPES`` below is an open-ended list (like
``causal/process_tracing.py``'s non-empty ``evidence[]``) that ALSO requires closed-vocabulary SET-COVERAGE
(like ``FORCE_NAMES``) -- every one of the 5 layer types must appear AT LEAST once, duplicates permitted,
count otherwise unbounded. This is a fourth shape, distinct from ``causal.dag``'s VALID_ROLES (any subset,
no completeness), ``causal.logic_model``'s STAGE_ORDER (closed, positional, exactly one per stage), and
``porter_five_forces``'s ``FORCE_NAMES`` (closed, unordered, exactly one per name).

**Provenance placement (task-mandated, fixed for this whole F06 batch, disclosed here)**: RECORD-LEVEL
ONLY -- a single top-level ``provenance`` field on the record. ``layers[]`` entries carry NO per-item
``provenance`` field at all (unlike ``porter_five_forces``'s per-force provenance). This is a deliberate
batch-wide decision to avoid the per-item/record-level provenance-placement ambiguity that hit both the F02
and F03 batches, not an Atlas citation.

Real invariants (grounded in Atlas L465/§12.16, each enforced BOTH at construction, raise BEFORE any record
is built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer
discipline every sibling module in this package already establishes):

1. ``layers`` is a non-empty list whose ``layer_type`` values, taken together, cover ALL 5 ``LAYER_TYPES``
   at least once (duplicates permitted, order carries no meaning either citation states). A blueprint
   missing even one of the 5 named layers has structurally reproduced the exact frontstage-only tunnel
   vision the method's own stated benefit ("避免只改 UI") exists to prevent -- directly grounded in Atlas's
   own §12.16 stated purpose ("找『畫面看起來簡單，但後端流程很痛』的問題").
2. Every layer entry carries a non-empty ``description`` (the actual blueprinted content for that layer) --
   a layer_type named but never described has not actually blueprinted that layer's process.
3. ``service_name`` (top-level, required, non-empty) -- §12.16's own definition blueprints a specific,
   named service system ("適合服務系統"), not a generic/unnamed process.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "service_blueprint"/"ServiceBlueprint" before writing any of this method's own files: zero pre-existing
implementation confirmed.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.service_blueprint"
RECORD_ID_PREFIX = "SVCBLUEPRINT-"
LAYER_TYPES: frozenset[str] = frozenset({"CUSTOMER_ACTIONS", "FRONTSTAGE", "BACKSTAGE", "SUPPORT_PROCESSES", "SYSTEMS_DATA"})
# Atlas §12.16 (L2743-2751) verbatim 5-line vertical list, transcribed as SCREAMING_SNAKE_CASE. See module
# docstring's design-shape investigation for why this is a closed vocabulary requiring SET-COVERAGE
# (>=1 each, duplicates allowed) rather than porter_five_forces's FORCE_NAMES (exactly once each).

_LAYER_KEYS = frozenset({"layer_type", "description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _layer_entry_shaped(entry: Any) -> bool:
    return isinstance(entry, dict) and set(entry.keys()) == _LAYER_KEYS


def _layers_are_valid(layers: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on an empty/short list up front: an empty list, like a non-empty
    list that never mentions e.g. SYSTEMS_DATA, is a coverage defect (``INCOMPLETE_LAYER_COVERAGE``), the
    same failure reason either way -- checking coverage after the per-entry loop lets both cases report the
    identical, correct reason instead of the empty case being misclassified as a generic shape defect."""
    if not isinstance(layers, list):
        return False, "SHAPE"
    seen_types: set[str] = set()
    for entry in layers:
        if not _layer_entry_shaped(entry):
            return False, "SHAPE"
        layer_type = entry.get("layer_type")
        if layer_type not in LAYER_TYPES:
            return False, "UNKNOWN_LAYER_TYPE"
        seen_types.add(layer_type)
        if not _is_nonempty_str(entry.get("description")):
            return False, "EMPTY_DESCRIPTION"
    if LAYER_TYPES - seen_types:
        return False, "INCOMPLETE_LAYER_COVERAGE"
    return True, None


def layer_entry(layer_type: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/service-blueprint.schema.yaml#/properties/layers``. Convenience
    constructor only -- emits ONLY the 2 known-good keys (deliberately NO ``provenance`` key: see module
    docstring's record-level-only provenance placement); does NOT itself enforce the set-coverage invariant
    (``generate_service_blueprint`` validates whatever list of dicts it is handed regardless of how each
    entry was built, same convention ``strategy/porter_five_forces.py``'s own ``force_entry`` already
    establishes)."""
    if layer_type not in LAYER_TYPES:
        raise InvariantViolation(f"SVCBLUEPRINT_UNKNOWN_LAYER_TYPE: {layer_type!r} is not one of {sorted(LAYER_TYPES)} (Atlas §12.16 L2743-2751 five-layer vocabulary)")
    return {"layer_type": layer_type, "description": description}


def generate_service_blueprint(
    blueprint_id: str,
    service_name: str,
    layers: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/service-blueprint.schema.yaml``.

    Enforces all three real invariants fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes -- never a record that itself proves it was
    built illegally. ``provenance`` is RECORD-LEVEL ONLY (this F06 batch's own fixed decision) -- there is
    no per-layer provenance parameter anywhere in this module.
    """
    if not _is_nonempty_str(blueprint_id) or not blueprint_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SVCBLUEPRINT_INVALID_ID: blueprint_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {blueprint_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SVCBLUEPRINT_INVALID_VERSION: version must be a string, got {version!r}")

    if not _is_nonempty_str(service_name):
        raise InvariantViolation(
            f"SVCBLUEPRINT_EMPTY_SERVICE_NAME: service_name must be a non-empty string -- §12.16's own definition blueprints a specific, named "
            f"service system ('適合服務系統'), got {service_name!r}"
        )

    valid, reason = _layers_are_valid(layers)
    if not valid:
        if reason == "UNKNOWN_LAYER_TYPE":
            raise InvariantViolation(f"SVCBLUEPRINT_UNKNOWN_LAYER_TYPE: layers contains a layer_type outside {sorted(LAYER_TYPES)}, got {layers!r}")
        if reason == "EMPTY_DESCRIPTION":
            raise InvariantViolation(f"SVCBLUEPRINT_EMPTY_DESCRIPTION: every layers[] entry must carry a non-empty 'description', got {layers!r}")
        if reason == "INCOMPLETE_LAYER_COVERAGE":
            raise InvariantViolation(
                f"SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE: layers must cover all 5 {sorted(LAYER_TYPES)} at least once -- Atlas §12.16's own stated "
                f"benefit ('避免只改 UI') IS this completeness, a record missing even one layer has not actually blueprinted the service, got {layers!r}"
            )
        raise InvariantViolation(f"SVCBLUEPRINT_INVALID_LAYER_SET: layers must be a list of well-shaped {{layer_type, description}} entries, got {layers!r}")

    return {
        "id": blueprint_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "provenance": provenance,
        "service_name": service_name,
        "layers": [dict(entry) for entry in layers],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the RECORD-LEVEL ``provenance`` field is
    schema-valid. Fails closed on non-dict input. No per-layer provenance to check (see module docstring --
    this F06 batch's own fixed record-level-only placement decision, unlike
    ``strategy/porter_five_forces.py``'s per-force provenance)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", record_provenance_ok, [{"record_provenance_valid": record_provenance_ok}], validator, timestamp)


def evaluate_service_blueprint_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_service_blueprint``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("service_blueprint_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("service_blueprint_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("service_blueprint_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("service_name")):
        return _result("service_blueprint_integrity", False, [{"reason": "EMPTY_SERVICE_NAME"}], validator, timestamp)

    valid, reason = _layers_are_valid(record.get("layers"))
    if not valid:
        return _result(
            "service_blueprint_integrity",
            False,
            [{"reason": f"layers invalid ({reason}) -- must cover all 5 {sorted(LAYER_TYPES)} at least once, well-shaped, non-empty descriptions"}],
            validator,
            timestamp,
        )

    return _result("service_blueprint_integrity", True, [{"layer_count": len(record["layers"])}], validator, timestamp)


def evaluate_service_blueprint_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see insight.service_blueprint.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy/bcg_matrix.py``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_service_blueprint_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
