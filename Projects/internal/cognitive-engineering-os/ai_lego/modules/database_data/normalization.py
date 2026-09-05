"""``database_data.normalization`` -- forty-first Method Atlas slice, SEVENTH member of the `database_data`
family (F21). Directly closes `database_data.erd`'s own `OQ-ERD-3`.

Atlas's own F21 tool table formula (L900: "1NF→2NF→3NF/BCNF；必要時有意識
denormalize") names a real, well-defined, COMPUTABLE fact from
relational database theory -- not a caller assertion. `achieved_normal
_form` and its three violation lists are NEVER caller-supplied
parameters (the builder's own public interface does not even let a
caller ATTEMPT to fake them, the same discipline `devops_sre
.capacity_model`'s own builder already established) -- they are always
computed fresh by `ai_lego.compute.normalization.closure
.classify_normal_form` from the record's own raw `primary_key
_attributes`/`non_key_attributes`/`functional_dependencies`.

`schema_ref` is an OPTIONAL format-only soft link to an already-built
`database_data.erd` record (`ERD-` prefix), resolving `OQ-ERD-3`.
`denormalization_decision` answers Atlas's own "必要時有意識
denormalize" qualifier -- a recorded decision, either way, always
carries non-empty `reasoning`.

This method reuses `ai_lego.modules.research.gates
.evaluate_statistical_gate` UNCHANGED for its `genuine_compute` gate --
the ELEVENTH reuse this session (CORRECTED post-critic-review of the
following slice, `database_data.data_quality_dimensions`, whose own
critic round found this docstring's own chain had silently dropped
four intervening reuses; the real chain is `root_cause.pareto`/
`decision.ahp`/`decision.mcda`/`devops_sre.error_budget`/`database_data
.data_lineage`/`database_data.reconciliation`/`devops_sre
.capacity_model`/`devops_sre.load_test`/`devops_sre.stress_test`/
`devops_sre.soak_test`).

**CRITICAL, fixed after a critic review of this slice's own first
draft**: a declared `primary_key_attributes` set that is a superkey
but NOT MINIMAL (irreducible) silently made the closure algorithm
OVER-REPORT the achieved normal form -- "prime attribute" (3NF's own
exception) is only meaningful relative to a MINIMAL key, and a caller
supplying e.g. `{A, B}` as the key when `{A}` alone (via an explicit
FD plus the key's own defining closure) already reaches every
attribute would incorrectly treat `B` as prime. `_primary_key_is
_minimal` (backed by `ai_lego.compute.normalization.closure
.primary_key_is_minimal`) is now a REAL, fail-closed precondition at
BOTH layers -- the first draft's own contract claimed this method
"will never over-report" the normal form, which a critic review's own
constructed counterexample proved false; the claim is corrected to
"a non-minimal declared key is REFUSED, not silently miscomputed."

Two further critic-caught fixes: (1) `functional_dependencies` may not
contain two entries describing the SAME dependency (identical
determinant SET + dependent) even if their determinant lists are
written in a different order -- previously accepted, which both
polluted violation-list evidence with duplicates and made
`classify_normal_form`'s own claimed order-independence untestable (two
differently-ordered but semantically-identical FDs could tie under the
sort key); (2) this record's own `id` (`NORM-` prefix) AND `version`
(a real string) are checked at BOTH the builder and the gate from this
revision -- the first draft's own docstring claimed it had already
applied `database_data.data_contract`'s own critic-caught id/version
lesson in full, but only actually covered `id`, leaving `version`
exactly as unenforced as `data_contract`'s own first draft had left it.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.normalization.closure import classify_normal_form, primary_key_is_minimal
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "database_data.normalization"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.normalization.closure.classify_normal_form"
RECORD_ID_PREFIX = "NORM-"
SCHEMA_REF_PREFIX = "ERD-"
_KNOWN_FD_KEYS = frozenset({"determinant", "dependent"})
_VALID_DENORMALIZATION_DECISIONS = frozenset({"keep_normalized", "denormalize"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _unique_nonempty_str_list(value: Any) -> bool:
    """Shared predicate: a list of unique, non-empty strings (may itself be empty). Called by BOTH the
    builder and the gate for primary_key_attributes (which additionally must be non-empty, checked by the
    dedicated wrapper below) and non_key_attributes."""
    if not isinstance(value, list) or not all(_is_nonempty_str(v) for v in value):
        return False
    return len(value) == len(set(value))


def _primary_key_is_valid(value: Any) -> bool:
    """Shared predicate: at least 1 entry, unique, non-empty strings. Called by BOTH the builder and the
    gate."""
    return isinstance(value, list) and bool(value) and _unique_nonempty_str_list(value)


def _key_and_nonkey_are_disjoint(primary_key: list[str], non_key: list[str]) -> bool:
    """Shared predicate: an attribute cannot be both key and non-key. Called by BOTH the builder and the
    gate."""
    return not (set(primary_key) & set(non_key))


def _fd_shape_is_valid(fd: Any, all_attributes: frozenset[str]) -> bool:
    """Shared predicate: exactly the two known keys, determinant a non-empty list of unique real attribute
    names, dependent a real attribute name not present in its own determinant (no trivial FDs). Called by
    BOTH the builder and the gate."""
    if not isinstance(fd, dict) or set(fd.keys()) != _KNOWN_FD_KEYS:
        return False
    determinant = fd["determinant"]
    dependent = fd["dependent"]
    if not _unique_nonempty_str_list(determinant) or not determinant:
        return False
    if not all(attr in all_attributes for attr in determinant):
        return False
    if not _is_nonempty_str(dependent) or dependent not in all_attributes:
        return False
    return dependent not in determinant


def _fds_are_valid(fds: Any, all_attributes: frozenset[str]) -> bool:
    """Shared predicate: a list (may be empty), every entry shape-valid. Called by BOTH the builder and the
    gate."""
    return isinstance(fds, list) and all(_fd_shape_is_valid(fd, all_attributes) for fd in fds)


def _fds_have_no_duplicates(fds: list[dict[str, Any]]) -> bool:
    """Shared predicate (precondition: every entry already shape-valid): no two entries describe the SAME
    functional dependency -- identical determinant SET (order-independent) + identical dependent. ADDED
    post-critic-review: without this, two differently-ordered-but-identical FDs could both be present,
    polluting violation-list evidence with duplicates and making classify_normal_form's own order-
    independence untestable (two such entries tie under its internal sort key by construction). Called by
    BOTH the builder and the gate."""
    keys = [(frozenset(fd["determinant"]), fd["dependent"]) for fd in fds]
    return len(keys) == len(set(keys))


def _soft_ref_is_valid(ref: Any, prefix: str) -> bool:
    """Shared predicate: is a SUPPLIED soft-link ref a non-empty string carrying the given prefix? (Absence
    is handled by the caller -- schema_ref is optional.) Format-only by design, see method contract
    compilation_decisions. Called by BOTH the builder and the gate."""
    return _is_nonempty_str(ref) and ref.startswith(prefix)


def _denormalization_decision_is_valid(value: Any) -> bool:
    """Shared predicate: is a SUPPLIED denormalization_decision a dict with exactly {decision, reasoning},
    decision a legal enum value, reasoning a non-empty string? (Absence is handled by the caller -- the
    field is optional.) Called by BOTH the builder and the gate."""
    if not isinstance(value, dict) or set(value.keys()) != {"decision", "reasoning"}:
        return False
    return value["decision"] in _VALID_DENORMALIZATION_DECISIONS and _is_nonempty_str(value["reasoning"])


def generate_normalization_record(
    record_id: str,
    entity_name: str,
    primary_key_attributes: list[str],
    non_key_attributes: list[str],
    functional_dependencies: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    schema_ref: str | None = None,
    denormalization_decision: dict[str, Any] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/normalization-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id (NORM- prefix)/entity_name non-empty, version a real string,
    primary_key_attributes a non-empty list of unique non-empty strings that is also MINIMAL (irreducible --
    a critic-caught Critical, see module docstring), non_key_attributes a list (may be empty) of unique
    non-empty strings disjoint from primary_key_attributes, every functional_dependencies[] entry shape-valid
    and referentially real with no trivial FD and no duplicate FD, and every supplied soft-link/decision
    field well-shaped. ``achieved_normal_form`` and its three violation lists are NOT parameters -- always
    computed fresh via ``classify_normal_form``, the same "no parameter even lets a caller attempt to fake
    it" discipline ``devops_sre.capacity_model``'s own builder already established. REBUILDS every nested
    object it owns, INCLUDING each violation entry's own ``determinant`` list (a critic-caught Major: a
    first-draft ``dict(fd)`` shallow-copy left every violation entry's own ``determinant`` list ALIASED to
    the SAME list object stored in ``functional_dependencies``); provenance is stored by reference, the same
    family-wide convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"NORMALIZATION_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(entity_name):
        raise InvariantViolation(f"NORMALIZATION_EMPTY_RECORD_FIELD: entity_name must be a non-empty string, got {entity_name!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"NORMALIZATION_INVALID_VERSION: version must be a string, got {version!r}")
    if not _primary_key_is_valid(primary_key_attributes):
        raise InvariantViolation(f"NORMALIZATION_INVALID_PRIMARY_KEY: primary_key_attributes must be a non-empty list of unique, non-empty strings, got {primary_key_attributes!r}")
    if not _unique_nonempty_str_list(non_key_attributes):
        raise InvariantViolation(f"NORMALIZATION_INVALID_NON_KEY_ATTRIBUTES: non_key_attributes must be a list of unique, non-empty strings, got {non_key_attributes!r}")
    if not _key_and_nonkey_are_disjoint(primary_key_attributes, non_key_attributes):
        raise InvariantViolation(f"NORMALIZATION_KEY_NONKEY_OVERLAP: primary_key_attributes and non_key_attributes share at least one attribute: {sorted(set(primary_key_attributes) & set(non_key_attributes))}")
    all_attributes = frozenset(primary_key_attributes) | frozenset(non_key_attributes)
    if not _fds_are_valid(functional_dependencies, all_attributes):
        raise InvariantViolation(f"NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES: every entry must have known keys (determinant/dependent), a non-empty unique determinant naming real attributes, a real dependent attribute, and dependent must not be in its own determinant (no trivial FDs), got {functional_dependencies!r}")
    if not _fds_have_no_duplicates(functional_dependencies):
        raise InvariantViolation(f"NORMALIZATION_DUPLICATE_FUNCTIONAL_DEPENDENCY: two or more entries describe the same functional dependency (identical determinant set + dependent), got {functional_dependencies!r}")
    if not primary_key_is_minimal(frozenset(primary_key_attributes), functional_dependencies, all_attributes):
        raise InvariantViolation(
            f"NORMALIZATION_PRIMARY_KEY_NOT_MINIMAL: primary_key_attributes {primary_key_attributes!r} is not irreducible -- removing at least one attribute still leaves a superkey under the declared functional_dependencies, "
            "which would make 'prime attribute' meaningless and silently OVER-REPORT the achieved normal form (see module docstring)"
        )
    if schema_ref is not None and not _soft_ref_is_valid(schema_ref, SCHEMA_REF_PREFIX):
        raise InvariantViolation(f"NORMALIZATION_INVALID_SOFT_REF: schema_ref must be None or a non-empty string beginning with {SCHEMA_REF_PREFIX!r}, got {schema_ref!r}")
    if denormalization_decision is not None and not _denormalization_decision_is_valid(denormalization_decision):
        raise InvariantViolation(f"NORMALIZATION_INVALID_DENORMALIZATION_DECISION: must be None or a dict with exactly decision (one of {sorted(_VALID_DENORMALIZATION_DECISIONS)}) and a non-empty reasoning, got {denormalization_decision!r}")

    rebuilt_fds = [{"determinant": list(fd["determinant"]), "dependent": fd["dependent"]} for fd in functional_dependencies]
    classification = classify_normal_form(frozenset(primary_key_attributes), frozenset(non_key_attributes), rebuilt_fds)

    def _rebuild_fd(fd: dict[str, Any]) -> dict[str, Any]:
        return {"determinant": list(fd["determinant"]), "dependent": fd["dependent"]}

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "entity_name": entity_name,
        "primary_key_attributes": list(primary_key_attributes),
        "non_key_attributes": list(non_key_attributes),
        "functional_dependencies": rebuilt_fds,
        "achieved_normal_form": classification["achieved_normal_form"],
        "partial_dependency_violations": [_rebuild_fd(fd) for fd in classification["partial_dependency_violations"]],
        "transitive_dependency_violations": [_rebuild_fd(fd) for fd in classification["transitive_dependency_violations"]],
        "bcnf_violations": [_rebuild_fd(fd) for fd in classification["bcnf_violations"]],
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }
    if schema_ref is not None:
        record["schema_ref"] = schema_ref
    if denormalization_decision is not None:
        record["denormalization_decision"] = dict(denormalization_decision)
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
    provenance/computation_provenance_ref/engine, all of which NormalizationRecord also carries at the top
    level. Eleventh reuse of this gate this session (CORRECTED post-critic-review, see module docstring)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_normalization_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    NORM- prefix), a real string version, entity_name, well-shaped key/non-key attribute lists (disjoint),
    a MINIMAL (irreducible) primary key, well-shaped functional dependencies (referentially real, no trivial
    or duplicate FDs), every present soft-link/decision field, AND RECOMPUTES ``classify_normal_form`` fresh
    from the record's own raw primary_key_attributes/non_key_attributes/functional_dependencies, comparing
    against the stored achieved_normal_form and all three violation lists. Does not trust any stored value.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("normalization_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("normalization_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("normalization_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("entity_name")):
        return _result("normalization_integrity", False, [{"reason": "entity_name missing or empty"}], validator, timestamp)

    primary_key = record.get("primary_key_attributes")
    non_key = record.get("non_key_attributes")
    if not _primary_key_is_valid(primary_key):
        return _result("normalization_integrity", False, [{"reason": "primary_key_attributes invalid (empty, malformed, non-string entry, or duplicate)"}], validator, timestamp)
    if not _unique_nonempty_str_list(non_key):
        return _result("normalization_integrity", False, [{"reason": "non_key_attributes invalid (malformed, non-string entry, or duplicate)"}], validator, timestamp)
    if not _key_and_nonkey_are_disjoint(primary_key, non_key):
        return _result("normalization_integrity", False, [{"reason": "primary_key_attributes and non_key_attributes are not disjoint"}], validator, timestamp)

    all_attributes = frozenset(primary_key) | frozenset(non_key)
    fds = record.get("functional_dependencies")
    if not _fds_are_valid(fds, all_attributes):
        return _result("normalization_integrity", False, [{"reason": "functional_dependencies invalid (malformed entry, unknown keys, non-real attribute reference, or a trivial FD)"}], validator, timestamp)
    if not _fds_have_no_duplicates(fds):
        return _result("normalization_integrity", False, [{"reason": "functional_dependencies contains two or more entries describing the same dependency (identical determinant set + dependent)"}], validator, timestamp)
    if not primary_key_is_minimal(frozenset(primary_key), fds, all_attributes):
        return _result("normalization_integrity", False, [{"reason": "primary_key_attributes is not minimal (irreducible) -- at least one attribute can be removed while remaining a superkey"}], validator, timestamp)

    if "schema_ref" in record and not _soft_ref_is_valid(record.get("schema_ref"), SCHEMA_REF_PREFIX):
        return _result("normalization_integrity", False, [{"reason": f"schema_ref present but malformed (missing {SCHEMA_REF_PREFIX!r} prefix or empty)"}], validator, timestamp)
    if "denormalization_decision" in record and not _denormalization_decision_is_valid(record.get("denormalization_decision")):
        return _result("normalization_integrity", False, [{"reason": "denormalization_decision present but malformed (unknown keys, illegal decision value, or empty reasoning)"}], validator, timestamp)

    recomputed = classify_normal_form(frozenset(primary_key), frozenset(non_key), fds)
    stored = {
        "achieved_normal_form": record.get("achieved_normal_form"),
        "partial_dependency_violations": record.get("partial_dependency_violations"),
        "transitive_dependency_violations": record.get("transitive_dependency_violations"),
        "bcnf_violations": record.get("bcnf_violations"),
    }
    if stored["achieved_normal_form"] != recomputed["achieved_normal_form"]:
        return _result("normalization_integrity", False, [{"reason": "stored achieved_normal_form disagrees with recomputation", "stored": stored["achieved_normal_form"], "recomputed": recomputed["achieved_normal_form"]}], validator, timestamp)
    for violation_key in ("partial_dependency_violations", "transitive_dependency_violations", "bcnf_violations"):
        if stored[violation_key] != recomputed[violation_key]:
            return _result("normalization_integrity", False, [{"reason": f"stored {violation_key} disagrees with recomputation", "stored": stored[violation_key], "recomputed": recomputed[violation_key]}], validator, timestamp)

    return _result(
        "normalization_integrity",
        True,
        [{"attribute_count": len(all_attributes), "functional_dependency_count": len(fds), "achieved_normal_form": recomputed["achieved_normal_form"]}],
        validator,
        timestamp,
    )


def evaluate_normalization_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_normalization_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
