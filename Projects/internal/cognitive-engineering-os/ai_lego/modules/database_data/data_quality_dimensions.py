"""``database_data.data_quality_dimensions`` -- forty-second Method Atlas slice, EIGHTH member of the
`database_data` family (F21). Directly closes `database_data.data_contract`'s own `OQ-DC-2`.

Atlas's own F21 tool table formula (L904: "rules→profiling→threshold→
quarantine→owner") plus dedicated §12.39 section (L3066-3082: six
dimensions -- Completeness/Accuracy/Consistency/Uniqueness/Timeliness/
Validity) name a real, derived fact per dimension entry
(``profiled_score >= threshold``) and for the dataset as a whole
(``quality_gate_status``). Neither is a caller-supplied parameter --
the builder's own public interface does not accept them, computed
fresh via ``ai_lego.compute.data_quality.gate.evaluate_dimensions``,
the same "no parameter even lets a caller attempt to fake it"
discipline `devops_sre.capacity_model`'s and `database_data
.normalization`'s own builders already establish.

FOUR optional fields are format-only soft links to already-built
sibling records: `schema_ref` (`ERD-`, `database_data.erd`),
`lineage_ref` (`DLR-`, `database_data.data_lineage`),
`restore_drill_ref` (`DRILL-`, `database_data.backup_restore_drill`)
-- together the other three pillars of the mother document's own
"Data Gate" quartet (L4379) -- and `data_contract_ref` (`DC-`,
`database_data.data_contract`, resolving OQ-DC-2).

Reuses `ai_lego.modules.research.gates.evaluate_statistical_gate`
UNCHANGED for the `genuine_compute` gate -- the TWELFTH reuse this
session (CORRECTED post-critic-review from a first-draft miscount of
"eighth", which conflated "Nth member of the `database_data` family"
with "Nth reuse of this shared gate function" -- the real chain is
pareto/ahp/mcda/error_budget/data_lineage/reconciliation/
capacity_model/load_test/stress_test/soak_test/normalization/
data_quality_dimensions). This record's own `id` (`DQ-` prefix) and
`version` (a real string) are checked at BOTH the builder and the gate
FROM THIS FIRST DRAFT -- applying the exact lesson `database_data
.normalization`'s own critic round had to learn the hard way (that
slice's own first draft claimed it had already applied `database_data
.data_contract`'s id/version lesson in full, but had only covered
`id`); a critic review of THIS slice confirmed by direct mutation that
the claim actually holds here.

`profiled_score`/`threshold` are validated as FINITE reals in
`[0.0, 1.0]` (rejecting Infinity/NaN and bool) at both layers --
applying `devops_sre.capacity_model`'s own critic-caught lesson that a
YAML-parsed `-.inf` or a stray boolean can silently defeat a
threshold-bearing field's own numeric guarantee. A critic review of
THIS slice found the explicit `math.isfinite` check is, here,
redundant with the `[0.0, 1.0]` bound comparison alone (`0.0 <= inf
<= 1.0` and `0.0 <= nan <= 1.0` are both already `False` in Python) --
kept anyway as INTENTIONAL defense-in-depth (a future revision that
widens the bound, e.g. to allow scores above 1.0 for a different
normalization convention, would silently lose the Infinity/NaN guard
if it relied on the bound comparison alone). The bool-as-int guard
(`isinstance(value, bool)`) is NOT redundant -- `True`/`False` pass
both the bound check and `math.isfinite` and must be excluded
explicitly.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.data_quality.gate import evaluate_dimensions
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "database_data.data_quality_dimensions"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.data_quality.gate.evaluate_dimensions"
RECORD_ID_PREFIX = "DQ-"
SCHEMA_REF_PREFIX = "ERD-"
LINEAGE_REF_PREFIX = "DLR-"
RESTORE_DRILL_REF_PREFIX = "DRILL-"
DATA_CONTRACT_REF_PREFIX = "DC-"
VALID_DIMENSIONS = frozenset({"completeness", "accuracy", "consistency", "uniqueness", "timeliness", "validity"})
_KNOWN_INPUT_KEYS = frozenset({"dimension", "rule", "profiled_score", "threshold", "owner"})
_KNOWN_STORED_KEYS = _KNOWN_INPUT_KEYS | {"passes_threshold"}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _score_is_valid(value: Any) -> bool:
    """Shared predicate: a finite real number in [0.0, 1.0], not a bool (bool is a Python int subclass).
    Called by BOTH the builder and the gate."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value) and 0.0 <= value <= 1.0


def _dimension_input_is_valid(entry: Any) -> bool:
    """Shared predicate for BUILDER INPUT shape: exactly the five known keys (no passes_threshold -- that is
    computed, never accepted), dimension a legal enum value, rule/owner non-empty strings,
    profiled_score/threshold finite reals in [0.0, 1.0]. Called by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_INPUT_KEYS:
        return False
    return (
        entry["dimension"] in VALID_DIMENSIONS
        and _is_nonempty_str(entry["rule"])
        and _is_nonempty_str(entry["owner"])
        and _score_is_valid(entry["profiled_score"])
        and _score_is_valid(entry["threshold"])
    )


def _dimensions_input_are_valid(dimensions: Any) -> bool:
    """Shared predicate: at least 1 entry, each valid builder-input shape. Called by the builder."""
    return isinstance(dimensions, list) and bool(dimensions) and all(_dimension_input_is_valid(e) for e in dimensions)


def _dimension_stored_is_valid(entry: Any) -> bool:
    """Shared predicate for STORED (gate-layer) shape: the same five fields PLUS passes_threshold, a real
    bool. Called by the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_STORED_KEYS:
        return False
    return (
        entry["dimension"] in VALID_DIMENSIONS
        and _is_nonempty_str(entry["rule"])
        and _is_nonempty_str(entry["owner"])
        and _score_is_valid(entry["profiled_score"])
        and _score_is_valid(entry["threshold"])
        and isinstance(entry["passes_threshold"], bool)
    )


def _dimensions_stored_are_valid(dimensions: Any) -> bool:
    """Shared predicate: at least 1 entry, each valid stored shape. Called by the gate."""
    return isinstance(dimensions, list) and bool(dimensions) and all(_dimension_stored_is_valid(e) for e in dimensions)


def _soft_ref_is_valid(ref: Any, prefix: str) -> bool:
    """Shared predicate: is a SUPPLIED soft-link ref a non-empty string carrying the given prefix? (Absence
    is handled by the caller -- every soft-link field in this record is optional.) Format-only by design.
    Called by BOTH the builder and the gate."""
    return _is_nonempty_str(ref) and ref.startswith(prefix)


def generate_data_quality_assessment_record(
    record_id: str,
    dataset_or_topic: str,
    dimensions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    schema_ref: str | None = None,
    lineage_ref: str | None = None,
    restore_drill_ref: str | None = None,
    data_contract_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/data-quality-assessment-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (DQ- prefix)/dataset_or_topic non-empty, version a
    real string, dimensions a non-empty list of well-shaped entries (legal dimension enum, non-empty
    rule/owner, finite [0.0, 1.0] profiled_score/threshold), and every supplied soft-link ref carrying its
    own required prefix. ``passes_threshold``/`quality_gate_status`/`quarantined_dimensions` are NOT
    parameters -- always computed fresh via ``evaluate_dimensions``. REBUILDS every nested object it owns;
    provenance is stored by reference, the same family-wide convention every prior module in this package
    already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DATAQUALITY_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(dataset_or_topic):
        raise InvariantViolation(f"DATAQUALITY_EMPTY_RECORD_FIELD: dataset_or_topic must be a non-empty string, got {dataset_or_topic!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DATAQUALITY_INVALID_VERSION: version must be a string, got {version!r}")
    if not _dimensions_input_are_valid(dimensions):
        raise InvariantViolation(
            f"DATAQUALITY_INVALID_DIMENSIONS: dimensions must be a non-empty list of well-shaped entries "
            f"(known keys dimension/rule/profiled_score/threshold/owner, dimension in {sorted(VALID_DIMENSIONS)}, "
            f"non-empty rule/owner, finite profiled_score/threshold in [0.0, 1.0]), got {dimensions!r}"
        )
    for ref_name, ref_value, prefix in (
        ("schema_ref", schema_ref, SCHEMA_REF_PREFIX),
        ("lineage_ref", lineage_ref, LINEAGE_REF_PREFIX),
        ("restore_drill_ref", restore_drill_ref, RESTORE_DRILL_REF_PREFIX),
        ("data_contract_ref", data_contract_ref, DATA_CONTRACT_REF_PREFIX),
    ):
        if ref_value is not None and not _soft_ref_is_valid(ref_value, prefix):
            raise InvariantViolation(f"DATAQUALITY_INVALID_SOFT_REF: {ref_name} must be None or a non-empty string beginning with {prefix!r}, got {ref_value!r}")

    rebuilt_input = [{"dimension": e["dimension"], "rule": e["rule"], "profiled_score": e["profiled_score"], "threshold": e["threshold"], "owner": e["owner"]} for e in dimensions]
    computed = evaluate_dimensions(rebuilt_input)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "dataset_or_topic": dataset_or_topic,
        "dimensions": computed["dimensions"],
        "quality_gate_status": computed["quality_gate_status"],
        "quarantined_dimensions": computed["quarantined_dimensions"],
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }
    if schema_ref is not None:
        record["schema_ref"] = schema_ref
    if lineage_ref is not None:
        record["lineage_ref"] = lineage_ref
    if restore_drill_ref is not None:
        record["restore_drill_ref"] = restore_drill_ref
    if data_contract_ref is not None:
        record["data_contract_ref"] = data_contract_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which DataQualityAssessmentRecord also carries at
    the top level. Twelfth reuse of this gate this session (CORRECTED post-critic-review, see module docstring)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_data_quality_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    DQ- prefix), a real string version, dataset_or_topic, well-shaped dimensions (legal enum, non-empty
    rule/owner, finite [0.0, 1.0] scores, real bool passes_threshold), every present soft-link ref, AND
    RECOMPUTES ``evaluate_dimensions`` fresh from the record's own raw dimensions (stripped of their own
    stored passes_threshold), comparing the recomputed passes_threshold/quality_gate_status/
    quarantined_dimensions against the stored values. Does not trust any stored value. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("data_quality_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("data_quality_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("data_quality_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("dataset_or_topic")):
        return _result("data_quality_integrity", False, [{"reason": "dataset_or_topic missing or empty"}], validator, timestamp)

    dimensions = record.get("dimensions")
    if not _dimensions_stored_are_valid(dimensions):
        return _result("data_quality_integrity", False, [{"reason": "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)"}], validator, timestamp)

    for ref_name, prefix in (
        ("schema_ref", SCHEMA_REF_PREFIX),
        ("lineage_ref", LINEAGE_REF_PREFIX),
        ("restore_drill_ref", RESTORE_DRILL_REF_PREFIX),
        ("data_contract_ref", DATA_CONTRACT_REF_PREFIX),
    ):
        if ref_name in record and not _soft_ref_is_valid(record.get(ref_name), prefix):
            return _result("data_quality_integrity", False, [{"reason": f"{ref_name} present but malformed (missing {prefix!r} prefix or empty)"}], validator, timestamp)

    raw_input = [{"dimension": e["dimension"], "rule": e["rule"], "profiled_score": e["profiled_score"], "threshold": e["threshold"], "owner": e["owner"]} for e in dimensions]
    recomputed = evaluate_dimensions(raw_input)
    stored_quarantined = record.get("quarantined_dimensions")
    if dimensions != recomputed["dimensions"]:
        return _result("data_quality_integrity", False, [{"reason": "stored dimensions (including passes_threshold) disagrees with recomputation", "stored": dimensions, "recomputed": recomputed["dimensions"]}], validator, timestamp)
    if record.get("quality_gate_status") != recomputed["quality_gate_status"]:
        return _result("data_quality_integrity", False, [{"reason": "stored quality_gate_status disagrees with recomputation", "stored": record.get("quality_gate_status"), "recomputed": recomputed["quality_gate_status"]}], validator, timestamp)
    if stored_quarantined != recomputed["quarantined_dimensions"]:
        return _result("data_quality_integrity", False, [{"reason": "stored quarantined_dimensions disagrees with recomputation", "stored": stored_quarantined, "recomputed": recomputed["quarantined_dimensions"]}], validator, timestamp)

    return _result(
        "data_quality_integrity",
        True,
        [{"dimension_count": len(dimensions), "quality_gate_status": recomputed["quality_gate_status"], "quarantined_count": len(recomputed["quarantined_dimensions"])}],
        validator,
        timestamp,
    )


def evaluate_data_quality_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_data_quality_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
