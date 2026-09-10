"""``association.attribute_listing`` -- F04 associative-mapping family (methods/contracts/
association.attribute_listing.contract.yaml), the 1st real F04 member built (F04 had 0 built before this
batch -- grep-confirmed no ``ai_lego/modules/association/`` directory existed). Built in parallel with
``association.mind_map`` / ``association.concept_map`` / ``association.affinity_diagram`` /
``association.morphological_analysis`` (4 other concurrent agents, same batch -- not read or depended on
here, per this task's own scope boundary).

Atlas's ONLY citation: F04 table row (L415: "Attribute Listing｜拆屬性再逐項變換｜attributes→變換→重組｜產品改良｜
SCAMPER"). Grep-confirmed no dedicated §11.x section exists (heading numbering jumps §11.11 Morphological
Analysis L1436 straight to §11.12 Jobs To Be Done L1463) and no §22.3 Method-specific Gate row.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"attribute_listing"/"attribute listing" -- zero pre-existing implementation (only method-inventory.yaml's own
stale catalog rows, both copies cite Atlas line 414; the real F04 table row is line 415).

**Structural point, taken literally (not just as a docstring claim):** the F04 table's own "使用方式" column is
explicit -- "attributes→變換→重組" (decompose into attributes -> TRANSFORM each individually -> RECOMBINE into
a new whole). This is a decompose-transform(-recombine) PIPELINE anchored to ONE existing ``subject``,
structurally distinct from the concurrent sibling ``association.morphological_analysis`` (an abstract,
from-scratch, no-single-subject dimensions x options x constraints combinatorial space -- see this method's
own contract ``compilation_decisions`` for the full disambiguation).

Three real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this suite already establishes:

1. ``attributes`` has >=1 entry, every ``attribute_name`` is unique across the array, and every entry is
   well-shaped: non-empty ``original_value``, >=1 ``transformed_variants`` entries (an attribute with zero
   transformed variants is not doing this method's own "逐項變換" job).
2. Every ``transformed_variants`` entry's ``variant_text`` is genuinely distinct (case/whitespace-insensitive,
   NFKC-normalized) from its own attribute's ``original_value`` AND from every sibling variant of the SAME
   attribute -- a near-duplicate echo is not a real transformation. Every ``variant_id`` is unique within its
   own attribute (not required globally unique).
3. IF ``recombination`` is present: ``combined_from`` has >=2 entries (combining a single variant is not
   "重組", it is merely selecting one transformation), and every entry's ``(attribute_name, variant_id)`` pair
   MUST resolve to an actually-existing attribute+variant in THIS record's own ``attributes`` -- same
   referential-integrity invariant class ``ai_lego/modules/framing/frame_storming.py``'s own
   ``selected_frame_ref`` <-> ``candidate_framings[].id`` cross-reference already establishes, generalized
   from a single reference to a list. No two ``combined_from`` entries may reference the identical pair.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.attribute_listing"
RECORD_ID_PREFIX = "ATTRLIST-"
MIN_COMBINED_FROM = 2

_ATTRIBUTE_REQUIRED_KEYS = frozenset({"attribute_name", "original_value", "transformed_variants", "provenance"})
_ATTRIBUTE_ALLOWED_KEYS = _ATTRIBUTE_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})
_VARIANT_REQUIRED_KEYS = frozenset({"variant_id", "variant_text", "provenance"})
_VARIANT_ALLOWED_KEYS = _VARIANT_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})
_RECOMBINATION_REQUIRED_KEYS = frozenset({"combined_from", "proposal_description", "provenance"})
_COMBINED_FROM_ENTRY_KEYS = frozenset({"attribute_name", "variant_id"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role ``framing.frame_storming``'s own
    ``_normalize`` already establishes for its own distinctness check. NFKC-normalized first so width-variant
    characters (e.g. ASCII vs full-width punctuation) don't defeat distinctness."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``ai_lego/modules/decision/ice.py``'s and ``framing.frame_storming``'s own
    ``_shallow_describe`` already use."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _variant_shape_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not (_VARIANT_REQUIRED_KEYS <= keys <= _VARIANT_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("variant_id")):
        return False
    if not _is_nonempty_str(entry.get("variant_text")):
        return False
    if not _refs_shape_ok(entry):
        return False
    return True


def _attribute_shape_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not (_ATTRIBUTE_REQUIRED_KEYS <= keys <= _ATTRIBUTE_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("attribute_name")):
        return False
    if not _is_nonempty_str(entry.get("original_value")):
        return False
    variants = entry.get("transformed_variants")
    if not isinstance(variants, list) or len(variants) < 1:
        return False
    if not all(_variant_shape_is_valid(v) for v in variants):
        return False
    if not _refs_shape_ok(entry):
        return False
    return True


def _attributes_are_valid(attributes: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this suite already establishes.

    Real invariants: >=1 well-shaped attribute; every attribute_name unique across the array; every
    attribute's variant_id unique within that same attribute; every transformed_variants entry's variant_text
    genuinely distinct (normalized) from its own original_value and from every sibling variant of the SAME
    attribute.
    """
    if not isinstance(attributes, list) or len(attributes) < 1:
        return False, "TOO_FEW"
    if not all(_attribute_shape_is_valid(a) for a in attributes):
        return False, "SHAPE"

    names = [a["attribute_name"] for a in attributes]
    if len(set(names)) != len(names):
        return False, "DUPLICATE_ATTRIBUTE_NAME"

    for attribute in attributes:
        variant_ids = [v["variant_id"] for v in attribute["transformed_variants"]]
        if len(set(variant_ids)) != len(variant_ids):
            return False, "DUPLICATE_VARIANT_ID"

        normalized_original = _normalize(attribute["original_value"])
        normalized_texts = [_normalize(v["variant_text"]) for v in attribute["transformed_variants"]]
        if any(text == normalized_original for text in normalized_texts):
            return False, "VARIANT_ECHOES_ORIGINAL"
        if len(set(normalized_texts)) != len(normalized_texts):
            return False, "DUPLICATE_VARIANT_TEXT"

    return True, None


def _recombination_is_valid(recombination: Any, attributes: list[dict[str, Any]]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. ``None`` is always legal (recombination is OPTIONAL -- see
    module docstring and this method's own contract compilation_decisions). Callers MUST have already
    confirmed ``attributes`` itself is valid (via ``_attributes_are_valid``) before calling this, since the
    known-pairs set below is built directly from it.
    """
    if recombination is None:
        return True, None
    if not isinstance(recombination, dict) or set(recombination.keys()) != _RECOMBINATION_REQUIRED_KEYS:
        return False, "SHAPE"
    if not _is_nonempty_str(recombination.get("proposal_description")):
        return False, "SHAPE"

    combined_from = recombination.get("combined_from")
    if not isinstance(combined_from, list) or len(combined_from) < MIN_COMBINED_FROM:
        return False, "TOO_FEW_COMBINED_FROM"
    for entry in combined_from:
        if not isinstance(entry, dict) or set(entry.keys()) != _COMBINED_FROM_ENTRY_KEYS:
            return False, "SHAPE"
        if not _is_nonempty_str(entry.get("attribute_name")) or not _is_nonempty_str(entry.get("variant_id")):
            return False, "SHAPE"

    known_pairs = {(a["attribute_name"], v["variant_id"]) for a in attributes for v in a["transformed_variants"]}
    pairs = [(entry["attribute_name"], entry["variant_id"]) for entry in combined_from]
    if any(pair not in known_pairs for pair in pairs):
        return False, "COMBINED_FROM_NOT_FOUND"
    if len(set(pairs)) != len(pairs):
        return False, "DUPLICATE_COMBINED_FROM"

    return True, None


def transformed_variant(
    variant_id: str,
    variant_text: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/attribute-listing-record.schema.yaml#/$defs/attribute_entry/transformed_variants``.
    A thin convenience constructor that emits ONLY the keys the caller actually passed -- it does NOT itself
    enforce the distinctness/uniqueness invariants (``generate_attribute_listing_record`` validates whatever
    dict it is handed regardless of how it was built), same "helper is not the invariant boundary" discipline
    every sibling module in this family already establishes.
    """
    record: dict[str, Any] = {"variant_id": variant_id, "variant_text": variant_text, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def attribute_entry(
    attribute_name: str,
    original_value: str,
    transformed_variants: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/attribute-listing-record.schema.yaml#/properties/attributes``. Same
    "helper is not the invariant boundary" discipline as ``transformed_variant`` above."""
    record: dict[str, Any] = {
        "attribute_name": attribute_name,
        "original_value": original_value,
        "transformed_variants": [dict(v) for v in transformed_variants],
        "provenance": provenance,
    }
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def recombination_entry(
    combined_from: list[dict[str, Any]],
    proposal_description: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    """``typed-objects/attribute-listing-record.schema.yaml#/properties/recombination``. Same "helper is not
    the invariant boundary" discipline -- referential integrity is checked by the builder/gate, not here."""
    return {"combined_from": [dict(c) for c in combined_from], "proposal_description": proposal_description, "provenance": provenance}


def generate_attribute_listing_record(
    record_id: str,
    subject: str,
    attributes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    recombination: dict[str, Any] | None = None,
    informs_scamper_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/attribute-listing-record.schema.yaml``. Enforces all three real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in this suite
    already establishes -- never a record that itself proves it was built illegally."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ATTRIBUTELISTING_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ATTRIBUTELISTING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"ATTRIBUTELISTING_EMPTY_SUBJECT: subject must be a non-empty string, got {subject!r}")
    if informs_scamper_ref is not None and not _is_nonempty_str(informs_scamper_ref):
        raise InvariantViolation(f"ATTRIBUTELISTING_INVALID_INFORMS_SCAMPER_REF: informs_scamper_ref, when present, must be a non-empty string, got {informs_scamper_ref!r}")

    attrs_ok, attrs_reason = _attributes_are_valid(attributes)
    if not attrs_ok:
        if attrs_reason == "TOO_FEW":
            raise InvariantViolation(f"ATTRIBUTELISTING_TOO_FEW_ATTRIBUTES: attributes must carry at least 1 entry, got {_shallow_describe(attributes)}")
        if attrs_reason == "DUPLICATE_ATTRIBUTE_NAME":
            raise InvariantViolation(f"ATTRIBUTELISTING_DUPLICATE_ATTRIBUTE_NAME: attribute_name must be unique across attributes, got {[a.get('attribute_name') for a in attributes]!r}")
        if attrs_reason == "DUPLICATE_VARIANT_ID":
            raise InvariantViolation("ATTRIBUTELISTING_DUPLICATE_VARIANT_ID: two or more transformed_variants entries of the same attribute share a variant_id")
        if attrs_reason == "VARIANT_ECHOES_ORIGINAL":
            raise InvariantViolation(
                "ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL: a transformed_variants entry's variant_text is effectively identical "
                "(case/whitespace-insensitive) to its own attribute's original_value -- that is not '逐項變換' (transform), it is an echo"
            )
        if attrs_reason == "DUPLICATE_VARIANT_TEXT":
            raise InvariantViolation(
                "ATTRIBUTELISTING_DUPLICATE_VARIANT_TEXT: two or more transformed_variants entries of the same attribute have effectively "
                "identical variant_text (case/whitespace-insensitive) -- genuinely distinct transformations are required"
            )
        raise InvariantViolation(
            f"ATTRIBUTELISTING_INVALID_ATTRIBUTE_SHAPE: every attributes entry must carry a non-empty attribute_name, a non-empty "
            f"original_value, and at least 1 well-shaped transformed_variants entry, got {_shallow_describe(attributes)}"
        )

    recomb_ok, recomb_reason = _recombination_is_valid(recombination, attributes)
    if not recomb_ok:
        if recomb_reason == "TOO_FEW_COMBINED_FROM":
            raise InvariantViolation(
                f"ATTRIBUTELISTING_TOO_FEW_COMBINED_FROM: recombination.combined_from must carry at least {MIN_COMBINED_FROM} entries -- "
                f"combining a single variant is not '重組' (recombination), got {_shallow_describe((recombination or {}).get('combined_from'))}"
            )
        if recomb_reason == "COMBINED_FROM_NOT_FOUND":
            raise InvariantViolation(
                "ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND: every recombination.combined_from entry's (attribute_name, variant_id) pair "
                "must resolve to an actually-existing attribute+variant in this record's own attributes -- a free-floating reference is not allowed"
            )
        if recomb_reason == "DUPLICATE_COMBINED_FROM":
            raise InvariantViolation("ATTRIBUTELISTING_DUPLICATE_COMBINED_FROM: recombination.combined_from must not reference the identical (attribute_name, variant_id) pair twice")
        raise InvariantViolation(f"ATTRIBUTELISTING_INVALID_RECOMBINATION_SHAPE: recombination, when present, must be well-shaped per the typed-object schema, got {_shallow_describe(recombination)}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "attributes": [dict(a) for a in attributes],
        "provenance": provenance,
    }
    if recombination is not None:
        record["recombination"] = dict(recombination)
    if informs_scamper_ref is not None:
        record["informs_scamper_ref"] = informs_scamper_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every attribute, every transformed_variant, the
    optional recombination, AND the overall record carry a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    attributes = record.get("attributes")
    attributes = attributes if isinstance(attributes, list) else []
    invalid: list[str] = []
    for a in attributes:
        if not isinstance(a, dict):
            continue
        if not provenance_is_valid(a.get("provenance")):
            invalid.append(a.get("attribute_name"))
        for v in a.get("transformed_variants") or []:
            if isinstance(v, dict) and not provenance_is_valid(v.get("provenance")):
                invalid.append(f"{a.get('attribute_name')}::{v.get('variant_id')}")
    recombination = record.get("recombination")
    recombination_provenance_ok = recombination is None or provenance_is_valid(recombination.get("provenance") if isinstance(recombination, dict) else None)
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(attributes) and not invalid and recombination_provenance_ok and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"attributes_checked": len(attributes), "invalid_provenance": invalid, "recombination_provenance_valid": recombination_provenance_ok, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check every sibling
    module in this suite already uses: an EVIDENCE-labeled original_value or variant_text must actually cite
    supporting_evidence_refs."""
    attributes = record.get("attributes") if isinstance(record, dict) else None
    attributes = attributes if isinstance(attributes, list) else []
    problems: list[dict[str, Any]] = []
    for a in attributes:
        if not isinstance(a, dict):
            continue
        epistemic_type = (a.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"attribute_name": a.get("attribute_name"), "reason": "no epistemic_type label"})
        elif epistemic_type == "EVIDENCE" and not a.get("supporting_evidence_refs"):
            problems.append({"attribute_name": a.get("attribute_name"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
        for v in a.get("transformed_variants") or []:
            if not isinstance(v, dict):
                continue
            v_epistemic_type = (v.get("provenance") or {}).get("epistemic_type")
            if v_epistemic_type is None:
                problems.append({"attribute_name": a.get("attribute_name"), "variant_id": v.get("variant_id"), "reason": "no epistemic_type label"})
            elif v_epistemic_type == "EVIDENCE" and not v.get("supporting_evidence_refs"):
                problems.append({"attribute_name": a.get("attribute_name"), "variant_id": v.get("variant_id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(attributes) and not problems
    return _result("evidence_labeling_required", passed, [{"attributes_checked": len(attributes), "problems": problems}], validator, timestamp)


def evaluate_attribute_listing_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_attribute_listing_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. In particular, this is
    the ONLY place ``recombination.combined_from`` is checked against the actual (attribute_name, variant_id)
    pairs that exist -- a record whose ``combined_from`` was edited to reference a removed/renamed variant
    fails here even though each field is, in isolation, individually well-shaped. FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("attribute_listing_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("attribute_listing_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("attribute_listing_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("attribute_listing_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)
    ref = record.get("informs_scamper_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("attribute_listing_integrity", False, [{"reason": "informs_scamper_ref present but not a non-empty string"}], validator, timestamp)

    attrs_ok, attrs_reason = _attributes_are_valid(record.get("attributes"))
    if not attrs_ok:
        return _result("attribute_listing_integrity", False, [{"reason": f"attributes invalid ({attrs_reason})"}], validator, timestamp)

    attributes = record["attributes"]
    recomb_ok, recomb_reason = _recombination_is_valid(record.get("recombination"), attributes)
    if not recomb_ok:
        return _result("attribute_listing_integrity", False, [{"reason": f"recombination invalid ({recomb_reason})"}], validator, timestamp)

    return _result(
        "attribute_listing_integrity",
        True,
        [{"attribute_count": len(attributes), "has_recombination": record.get("recombination") is not None}],
        validator,
        timestamp,
    )


def evaluate_attribute_listing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation (which also re-derives the recombination referential-
    integrity check)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_attribute_listing_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
