"""``database_data.erd`` -- thirty-ninth Method Atlas slice, FIFTH member of the `database_data` family (F21).

Atlas's own F21 tool table formula (L899: "entities→keys→
relationships→constraints") AND the dedicated §11.47 實體關係圖（ERD）
section (L2294-2306) together ground real referential-integrity
invariants that make this record a genuine MODEL, not a bag of
independently-valid parts: every entity has at least one attribute
flagged `is_primary_key: true` ("keys"); every relationship's own
`from_entity`/`to_entity` name a REAL entity in `entities[]`; and every
relationship's own `foreign_key_attributes[]` entries ALL name REAL
attributes of that relationship's own `from_entity` (the side that
structurally HOLDS a foreign key -- an ARRAY, not a single string, so a
COMPOSITE foreign key referencing a composite primary key is ONE
relationship entry, not artificially split into several -- a design bug
a critic review caught in this slice's own first draft, which used a
single string and could not represent that shape even though composite
PRIMARY keys were already legal). `cardinality` is therefore only
`one_to_one` or `many_to_one` from `from_entity`'s own perspective;
`many_to_many` is modeled via a junction entity with two `many_to_one`
relationships (this record models a PHYSICAL/LOGICAL relational schema,
not a conceptual ER diagram -- see the method contract's own
compilation_decisions for the corrected, narrower claim about which ERD
NOTATIONS actually require a junction table).

`migration_ref` is an OPTIONAL format-only soft link to
`database_data.expand_contract_migration`'s own output, resolving
Atlas's own §11.47 L2305 "起點" (starting-point) benefit for migration
-- also added after a critic review found the first draft's own
`recommended_next: []` had silently dropped a real, Atlas-grounded
pairing.

No genuine-compute gate is reused here -- like `devops_sre.rto_rpo`,
this method performs no arithmetic; it is a structured, cross-
referentially-validated record (provenance_required + one integrity
gate only). `provenance` is stored BY REFERENCE, not rebuilt -- the
same family-wide convention every prior module in this package already
follows (a critic review found this module's own first-draft docstring
overclaimed "REBUILDS every nested object" without that caveat).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.erd"
_KNOWN_ATTRIBUTE_KEYS = frozenset({"name", "data_type", "is_primary_key"})
_KNOWN_ENTITY_KEYS = frozenset({"name", "attributes"})
_KNOWN_RELATIONSHIP_KEYS = frozenset({"from_entity", "to_entity", "cardinality", "foreign_key_attributes"})
VALID_CARDINALITIES = frozenset({"one_to_one", "many_to_one"})
MIGRATION_REF_PREFIX = "ECMIG-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _attribute_is_valid(attribute: Any) -> bool:
    """Shared predicate: exactly the three known keys, name/data_type non-empty strings, is_primary_key a
    real bool. Called by BOTH the builder (which additionally rebuilds from known fields) and the gate
    (where this IS the only defense, since the gate does not rebuild anything)."""
    if not isinstance(attribute, dict) or set(attribute.keys()) != _KNOWN_ATTRIBUTE_KEYS:
        return False
    return _is_nonempty_str(attribute["name"]) and _is_nonempty_str(attribute["data_type"]) and isinstance(attribute["is_primary_key"], bool)


def _entity_shape_is_valid(entity: Any) -> bool:
    """Shared predicate: exactly the two known keys, name non-empty, attributes a non-empty list of valid
    attributes. Does NOT check attribute-name uniqueness or the at-least-one-key rule -- see the dedicated
    predicates below. Called by BOTH the builder and the gate."""
    if not isinstance(entity, dict) or set(entity.keys()) != _KNOWN_ENTITY_KEYS:
        return False
    if not _is_nonempty_str(entity["name"]):
        return False
    attributes = entity["attributes"]
    if not isinstance(attributes, list) or not attributes:
        return False
    return all(_attribute_is_valid(a) for a in attributes)


def _attribute_names_are_unique(entity: dict[str, Any]) -> bool:
    """Shared predicate (precondition: ``_entity_shape_is_valid`` already true): no two attributes on the
    same entity share a name."""
    names = [a["name"] for a in entity["attributes"]]
    return len(names) == len(set(names))


def _entity_has_a_key(entity: dict[str, Any]) -> bool:
    """Shared predicate (precondition: ``_entity_shape_is_valid`` already true): Atlas's own 'keys' formula
    step -- at least one attribute flagged is_primary_key:true. A composite key (more than one) is legal."""
    return any(a["is_primary_key"] for a in entity["attributes"])


def _entity_is_fully_valid(entity: Any) -> bool:
    """Shared predicate composing shape + uniqueness + has-a-key. Called by BOTH the builder and the gate."""
    return _entity_shape_is_valid(entity) and _attribute_names_are_unique(entity) and _entity_has_a_key(entity)


def _entities_are_valid(entities: Any) -> bool:
    """Shared predicate: at least 1 entity, each fully valid, entity names unique across the whole record
    (case-sensitive exact match -- see method contract compilation_decisions). Called by BOTH the builder and
    the gate."""
    if not isinstance(entities, list) or not entities:
        return False
    if not all(_entity_is_fully_valid(e) for e in entities):
        return False
    names = [e["name"] for e in entities]
    return len(names) == len(set(names))


def _foreign_key_attributes_are_valid(value: Any) -> bool:
    """Shared predicate: a non-empty list of non-empty strings. Composite foreign keys are >1 entry -- see
    the method contract's own compilation_decisions for why this is an array, not a single string."""
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _relationship_shape_is_valid(relationship: Any) -> bool:
    """Shared predicate: exactly the four known keys, from_entity/to_entity non-empty strings,
    foreign_key_attributes a valid non-empty list, cardinality one of the two legal values. Does NOT check
    referential integrity against entities -- see ``_relationship_refs_are_valid``. Called by BOTH the
    builder and the gate."""
    if not isinstance(relationship, dict) or set(relationship.keys()) != _KNOWN_RELATIONSHIP_KEYS:
        return False
    return (
        _is_nonempty_str(relationship["from_entity"])
        and _is_nonempty_str(relationship["to_entity"])
        and _foreign_key_attributes_are_valid(relationship["foreign_key_attributes"])
        and relationship["cardinality"] in VALID_CARDINALITIES
    )


def _relationships_are_shape_valid(relationships: Any) -> bool:
    """Shared predicate: relationships is a list (may be empty), every entry shape-valid. Called by BOTH the
    builder and the gate."""
    return isinstance(relationships, list) and all(_relationship_shape_is_valid(r) for r in relationships)


def _attribute_names_of(entity: dict[str, Any]) -> frozenset[str]:
    return frozenset(a["name"] for a in entity["attributes"])


def _relationship_refs_are_valid(relationship: dict[str, Any], entities_by_name: dict[str, dict[str, Any]]) -> bool:
    """Shared predicate (precondition: relationship shape-valid, entities valid): from_entity and to_entity
    both name a REAL entity, and EVERY entry in foreign_key_attributes names a REAL attribute of from_entity
    (the side that structurally holds the foreign key -- ALL entries must match for a composite key to be
    genuinely referentially valid). Called by BOTH the builder and the gate."""
    from_entity = entities_by_name.get(relationship["from_entity"])
    if from_entity is None or relationship["to_entity"] not in entities_by_name:
        return False
    from_attribute_names = _attribute_names_of(from_entity)
    return all(fk in from_attribute_names for fk in relationship["foreign_key_attributes"])


def _invalid_relationship_refs(relationships: list[dict[str, Any]], entities_by_name: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Shared predicate: which relationships (if any) fail referential-integrity, sorted by (from_entity,
    to_entity, foreign_key_attributes) for deterministic evidence. Called by BOTH the builder and the gate."""
    invalid = [r for r in relationships if not _relationship_refs_are_valid(r, entities_by_name)]
    return sorted(invalid, key=lambda r: (r["from_entity"], r["to_entity"], tuple(r["foreign_key_attributes"])))


def _constraints_are_valid(constraints: Any) -> bool:
    """Shared predicate: a list (may be empty) of non-empty strings. Called by BOTH the builder and the
    gate."""
    return isinstance(constraints, list) and all(_is_nonempty_str(c) for c in constraints)


def _migration_ref_is_valid(ref: Any) -> bool:
    """Shared predicate: is a SUPPLIED migration_ref a non-empty string carrying the
    database_data.expand_contract_migration id prefix? (Absence is handled by the caller -- the field is
    optional.) Format-only by design, see the method contract's own compilation_decisions."""
    return _is_nonempty_str(ref) and ref.startswith(MIGRATION_REF_PREFIX)


def generate_erd_record(
    record_id: str,
    system_or_database: str,
    entities: list[dict[str, Any]],
    relationships: list[dict[str, Any]],
    constraints: list[str],
    provenance: dict[str, Any],
    *,
    migration_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/erd-record.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed: record_id/system_or_database non-empty, entities well-shaped with unique names/attribute
    names and at least one key per entity, every relationship shape-valid AND referentially consistent with
    entities (every foreign_key_attributes[] entry, supporting composite foreign keys), constraints a list of
    non-empty strings, and a supplied migration_ref carrying the ECMIG- prefix. REBUILDS every nested object
    it owns (entities/relationships/constraints) from known fields; provenance is stored by reference, the
    same family-wide convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(system_or_database):
        raise InvariantViolation(f"ERD_EMPTY_RECORD_FIELD: record_id/system_or_database must both be non-empty strings, got {record_id!r}/{system_or_database!r}")
    if not _entities_are_valid(entities):
        raise InvariantViolation(f"ERD_INVALID_ENTITIES: entities must be a non-empty list of well-shaped entities with unique names, unique attribute names per entity, and at least one is_primary_key:true attribute each, got {entities!r}")
    if not _relationships_are_shape_valid(relationships):
        raise InvariantViolation(f"ERD_INVALID_RELATIONSHIPS: relationships must be a list of well-shaped entries (known keys, non-empty from_entity/to_entity, a non-empty foreign_key_attributes list of non-empty strings, cardinality in {sorted(VALID_CARDINALITIES)}), got {relationships!r}")
    if not _constraints_are_valid(constraints):
        raise InvariantViolation(f"ERD_INVALID_CONSTRAINTS: constraints must be a list of non-empty strings, got {constraints!r}")
    if migration_ref is not None and not _migration_ref_is_valid(migration_ref):
        raise InvariantViolation(f"ERD_INVALID_MIGRATION_REF: migration_ref must be None or a non-empty string beginning with {MIGRATION_REF_PREFIX!r}, got {migration_ref!r}")

    rebuilt_entities = [
        {"name": e["name"], "attributes": [{"name": a["name"], "data_type": a["data_type"], "is_primary_key": a["is_primary_key"]} for a in e["attributes"]]}
        for e in entities
    ]
    entities_by_name = {e["name"]: e for e in rebuilt_entities}
    rebuilt_relationships = [
        {"from_entity": r["from_entity"], "to_entity": r["to_entity"], "cardinality": r["cardinality"], "foreign_key_attributes": list(r["foreign_key_attributes"])}
        for r in relationships
    ]
    invalid_refs = _invalid_relationship_refs(rebuilt_relationships, entities_by_name)
    if invalid_refs:
        raise InvariantViolation(f"ERD_DANGLING_RELATIONSHIP_REF: relationship(s) reference an entity that does not exist, or a foreign_key_attributes entry not present on their own from_entity: {invalid_refs}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_database": system_or_database,
        "entities": rebuilt_entities,
        "relationships": rebuilt_relationships,
        "constraints": list(constraints),
        "provenance": provenance,
    }
    if migration_ref is not None:
        record["migration_ref"] = migration_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_erd_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id/
    system_or_database, well-shaped entities with unique names/attribute names/at-least-one-key, well-shaped
    relationships (including every foreign_key_attributes[] entry), referential integrity of every
    relationship against the record's own entities, valid constraints, and a valid migration_ref if present.
    Does not trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("erd_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")):
        return _result("erd_integrity", False, [{"reason": "id missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_database")):
        return _result("erd_integrity", False, [{"reason": "system_or_database missing or empty"}], validator, timestamp)

    entities = record.get("entities")
    if not _entities_are_valid(entities):
        return _result("erd_integrity", False, [{"reason": "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)"}], validator, timestamp)

    relationships = record.get("relationships")
    if not _relationships_are_shape_valid(relationships):
        return _result("erd_integrity", False, [{"reason": "relationships invalid (malformed entry, unknown keys, or an illegal cardinality value)"}], validator, timestamp)

    entities_by_name = {e["name"]: e for e in entities}
    invalid_refs = _invalid_relationship_refs(relationships, entities_by_name)
    if invalid_refs:
        return _result("erd_integrity", False, [{"reason": "one or more relationships reference an entity that does not exist, or a foreign_key_attributes entry not present on their own from_entity", "invalid_relationships": invalid_refs}], validator, timestamp)

    if not _constraints_are_valid(record.get("constraints")):
        return _result("erd_integrity", False, [{"reason": "constraints invalid (not a list, or contains a non-string/empty entry)"}], validator, timestamp)

    if "migration_ref" in record and not _migration_ref_is_valid(record.get("migration_ref")):
        return _result("erd_integrity", False, [{"reason": "migration_ref present but malformed (missing ECMIG- prefix or empty)"}], validator, timestamp)

    return _result("erd_integrity", True, [{"entity_count": len(entities), "relationship_count": len(relationships), "constraint_count": len(record["constraints"])}], validator, timestamp)


def evaluate_erd_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_erd_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
