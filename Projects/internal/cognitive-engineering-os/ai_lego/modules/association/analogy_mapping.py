"""``association.analogy_mapping`` -- F04 associative-mapping family (methods/contracts/
association.analogy_mapping.contract.yaml), the 6th and LAST F04 member built (mind_map/concept_map/
affinity_diagram/morphological_analysis/attribute_listing landed earlier in this same batch -- F04 is
0/6 -> 6/6 COMPLETE after this module). Built in parallel with a separate agent's
``database_data.schema_compatibility_analysis`` (F21, unrelated family, not read or depended on here).

Atlas's ONLY citation: F04 table row (L416: "Analogy Mapping｜把外部機制映射到問題｜source domain→抽象機制→
target mapping｜跨產業移植｜Historical Analogy"). Grep-confirmed no dedicated §11.x section exists (heading
numbering jumps §11.11 Morphological Analysis L1436 straight to §11.12 Jobs To Be Done L1463, the same gap
class ``association.attribute_listing``'s own citation falls into) and no §22.3 Method-specific Gate row.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"analogy_mapping"/"analogy mapping" -- zero pre-existing implementation. Grepped the whole Atlas for
"Analogy"/"類比": 3 hits (F03 Synectics L388, this method's own F04 row L416, F13 Historical Analogy L674)
plus a 4th related discovery, F13 Cross-industry Transfer (L675, near-identical benefit-column wording to
this row's own "跨產業移植") -- see the method contract's own ``compilation_decisions``/``open_questions`` for
the full 3-way disambiguation (Synectics: a divergent-creativity TOOL using analogy/metaphor to reframe a
problem, F03, different structural shape; Historical Analogy: this row's own cited best-pairing, scoped
specifically to historical comparisons with an explicit "限制類比" discipline step this row's own citation
lacks, F13; Cross-industry Transfer: discovered during due diligence, not named by the task's own
disambiguation instructions, flagged as an open question, not depended on).

**Structural point, taken literally:** the F04 table's own "使用方式" column is a flat, literal 3-step LINEAR
pipeline -- "source domain→抽象機制→target mapping" (identify a SOURCE DOMAIN with a known working mechanism
-> ABSTRACT the underlying mechanism out of its original context -> MAP that abstracted mechanism onto a
TARGET problem). Unlike ``framing.frame_storming``'s own citation (an explicit generate-multiple-then-select
process), this row names no "generate several candidates" step -- a multi-candidate shape was deliberately
NOT built here (see the typed-object schema's own compilation_decisions).

ONE real invariant, enforced BOTH at construction (raise BEFORE any record is built) AND independently by a
gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every sibling
module in this suite already establishes:

1. ``source_domain_description``, ``abstracted_mechanism``, and ``target_mapping`` must be PAIRWISE genuinely
   distinct (case/whitespace-insensitive, NFKC-normalized) across all 3 unique pairs -- any two stages
   collapsing to the same text means the row's own abstraction step was skipped, not actually performed. This
   is a deliberately SYNTACTIC (near-duplicate text) check only -- it does NOT verify abstracted_mechanism is
   genuinely a HIGHER level of abstraction than either end, which would require semantic reasoning no runtime
   gate can honestly perform (see the method contract's own compilation_decisions for the full restraint
   argument).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.analogy_mapping"
RECORD_ID_PREFIX = "ANALOGY-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role
    ``association.attribute_listing``'s own ``_normalize`` already establishes for its own distinctness
    check. NFKC-normalized first so width-variant characters (e.g. ASCII vs full-width punctuation) don't
    defeat distinctness."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _optional_refs_shape_ok(value: Any) -> bool:
    """None (absent) or a non-empty list of non-empty strings -- matches the schema's own
    ``supporting_evidence_refs`` shape (minItems:1 when present), same convention every sibling module in
    this suite already uses for its own optional evidence-refs field."""
    return value is None or (isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value))


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline every sibling module in this suite already uses."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _stages_are_valid(source_domain_description: Any, abstracted_mechanism: Any, target_mapping: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this suite already establishes.

    Real invariant: all 3 non-empty, AND pairwise genuinely distinct (normalized) across all 3 unique pairs --
    not just the 2 ends (source vs mapping), because a source-vs-mapping-only check would let
    abstracted_mechanism silently echo one of the two ends and still pass. See module docstring and the
    method contract's own compilation_decisions for the full reasoning.
    """
    if not _is_nonempty_str(source_domain_description):
        return False, "EMPTY_SOURCE_DOMAIN"
    if not _is_nonempty_str(abstracted_mechanism):
        return False, "EMPTY_ABSTRACTED_MECHANISM"
    if not _is_nonempty_str(target_mapping):
        return False, "EMPTY_TARGET_MAPPING"

    source_key = _normalize(source_domain_description)
    mechanism_key = _normalize(abstracted_mechanism)
    mapping_key = _normalize(target_mapping)

    if mechanism_key == source_key:
        return False, "MECHANISM_ECHOES_SOURCE"
    if mapping_key == mechanism_key:
        return False, "MAPPING_ECHOES_MECHANISM"
    if mapping_key == source_key:
        return False, "MAPPING_ECHOES_SOURCE"
    return True, None


def generate_analogy_mapping_record(
    record_id: str,
    target_problem: str,
    source_domain_description: str,
    abstracted_mechanism: str,
    target_mapping: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    supporting_evidence_refs: list[str] | None = None,
    informs_historical_analogy_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/analogy-mapping-record.schema.yaml``. Enforces the real invariant
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in this suite
    already establishes -- never a record that itself proves it was built illegally."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ANALOGYMAPPING_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ANALOGYMAPPING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(target_problem):
        raise InvariantViolation(f"ANALOGYMAPPING_EMPTY_TARGET_PROBLEM: target_problem must be a non-empty string, got {target_problem!r}")

    stages_ok, stages_reason = _stages_are_valid(source_domain_description, abstracted_mechanism, target_mapping)
    if not stages_ok:
        if stages_reason == "EMPTY_SOURCE_DOMAIN":
            raise InvariantViolation(f"ANALOGYMAPPING_EMPTY_SOURCE_DOMAIN: source_domain_description must be a non-empty string, got {source_domain_description!r}")
        if stages_reason == "EMPTY_ABSTRACTED_MECHANISM":
            raise InvariantViolation(f"ANALOGYMAPPING_EMPTY_ABSTRACTED_MECHANISM: abstracted_mechanism must be a non-empty string, got {abstracted_mechanism!r}")
        if stages_reason == "EMPTY_TARGET_MAPPING":
            raise InvariantViolation(f"ANALOGYMAPPING_EMPTY_TARGET_MAPPING: target_mapping must be a non-empty string, got {target_mapping!r}")
        if stages_reason == "MECHANISM_ECHOES_SOURCE":
            raise InvariantViolation(
                "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE: abstracted_mechanism is effectively identical (case/whitespace-insensitive) to "
                "source_domain_description -- that is not '抽象機制' (abstraction), it is an echo of the source domain unchanged"
            )
        if stages_reason == "MAPPING_ECHOES_MECHANISM":
            raise InvariantViolation(
                "ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM: target_mapping is effectively identical (case/whitespace-insensitive) to "
                "abstracted_mechanism -- a real mapping step must say something about how the mechanism applies to target_problem, not just restate the mechanism"
            )
        raise InvariantViolation(
            "ANALOGYMAPPING_MAPPING_ECHOES_SOURCE: target_mapping is effectively identical (case/whitespace-insensitive) to "
            "source_domain_description -- that skips both the abstraction AND the mapping steps, restating the source domain unchanged"
        )

    if not _optional_refs_shape_ok(supporting_evidence_refs):
        raise InvariantViolation(f"ANALOGYMAPPING_INVALID_SUPPORTING_EVIDENCE_REFS: supporting_evidence_refs, when present, must be a non-empty list of non-empty strings, got {_shallow_describe(supporting_evidence_refs)}")
    if informs_historical_analogy_ref is not None and not _is_nonempty_str(informs_historical_analogy_ref):
        raise InvariantViolation(f"ANALOGYMAPPING_INVALID_INFORMS_HISTORICAL_ANALOGY_REF: informs_historical_analogy_ref, when present, must be a non-empty string, got {informs_historical_analogy_ref!r}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "target_problem": target_problem,
        "source_domain_description": source_domain_description,
        "abstracted_mechanism": abstracted_mechanism,
        "target_mapping": target_mapping,
        "provenance": provenance,
    }
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    if informs_historical_analogy_ref is not None:
        record["informs_historical_analogy_ref"] = informs_historical_analogy_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check every sibling
    module in this suite already uses: an EVIDENCE-labeled record must actually cite
    supporting_evidence_refs (backing source_domain_description's own empirical claim, see module docstring)."""
    if not isinstance(record, dict):
        return _result("evidence_labeling_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    epistemic_type = (record.get("provenance") or {}).get("epistemic_type")
    problem: dict[str, Any] | None = None
    if epistemic_type is None:
        problem = {"reason": "no epistemic_type label"}
    elif epistemic_type == "EVIDENCE" and not record.get("supporting_evidence_refs"):
        problem = {"reason": "labeled EVIDENCE but cites no supporting_evidence_refs"}
    return _result("evidence_labeling_required", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_analogy_mapping_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_analogy_mapping_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. FAILS CLOSED on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("analogy_mapping_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("analogy_mapping_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("analogy_mapping_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("target_problem")):
        return _result("analogy_mapping_integrity", False, [{"reason": "target_problem missing or empty"}], validator, timestamp)

    stages_ok, stages_reason = _stages_are_valid(record.get("source_domain_description"), record.get("abstracted_mechanism"), record.get("target_mapping"))
    if not stages_ok:
        return _result("analogy_mapping_integrity", False, [{"reason": f"stages invalid ({stages_reason})"}], validator, timestamp)

    if not _optional_refs_shape_ok(record.get("supporting_evidence_refs")):
        return _result("analogy_mapping_integrity", False, [{"reason": "supporting_evidence_refs present but not a non-empty list of non-empty strings"}], validator, timestamp)
    ref = record.get("informs_historical_analogy_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("analogy_mapping_integrity", False, [{"reason": "informs_historical_analogy_ref present but not a non-empty string"}], validator, timestamp)

    return _result(
        "analogy_mapping_integrity",
        True,
        [{"has_supporting_evidence_refs": bool(record.get("supporting_evidence_refs")), "has_informs_historical_analogy_ref": ref is not None}],
        validator,
        timestamp,
    )


def evaluate_analogy_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_analogy_mapping_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
