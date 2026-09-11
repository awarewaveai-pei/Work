"""``stakeholders.coalition_mapping`` -- F07 stakeholder/power/negotiation family (Atlas L483-507), 1 of 10
concurrent agents opening this family's members in the same parallel batch (family had 0 real methods built
before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` real module existed, only the
orchestrator's own pre-created package-init placeholder).

Atlas cites this method ONCE: the F07 tool table row (L496: "Coalition Mapping｜找可能聯盟｜
interests/power/resources→coalition scenarios｜政策與治理特別重要"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation class
``strategy.bcg_matrix`` already establishes for its own F08 sibling with a single table-row citation.

Two objects, transcribed directly from the table row's own "interests/power/resources→coalition scenarios"
shape: ``stakeholder_profiles`` (one card per stakeholder, the row's own "interests/power/resources" 3-field
disclosure -- same completeness-floor spirit the still-unbuilt ``stakeholders.incentive_mapping``'s own
Goals/Incentives/Constraints/Risks card would use, but with THIS row's own different 3 fields, not that
method's 4) and ``coalition_scenarios`` (the row's own "→coalition scenarios" output -- caller-supplied
content, this method does NOT run a coalition-recommendation algorithm; see the two real invariants below for
exactly what IS mechanically enforced).

Two real invariants, EACH enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. **Stakeholder profile completeness** (``COALMAP_INVALID_STAKEHOLDER_PROFILES`` /
   ``COALMAP_DUPLICATE_STAKEHOLDER_ID``): ``stakeholder_profiles`` is a list of at least 2 well-shaped
   ``{id, name, interests, power, resources}`` entries (2 is the structural floor -- a coalition needs at
   least 2 distinct members drawn from this pool, same "floor tied to the method's own defining structural
   point" reasoning ``association.concept_map``'s own ``nodes: minItems 2`` already establishes for its own
   sibling graph shape), unique ``id`` values, and ``interests``/``power``/``resources`` each a non-empty
   string per entry -- the table row's own literal 3-field disclosure, no field left blank.
2. **Coalition scenario referential integrity + minimum size** (``COALMAP_EMPTY_COALITION_SCENARIOS`` /
   ``COALMAP_SCENARIO_TOO_FEW_MEMBERS`` / ``COALMAP_SCENARIO_DANGLING_MEMBER_REF`` /
   ``COALMAP_SCENARIO_DUPLICATE_MEMBER`` / ``COALMAP_DUPLICATE_SCENARIO_ID``): ``coalition_scenarios`` is a
   non-empty list of well-shaped ``{id, label, member_ids}`` entries with unique scenario ``id`` values; every
   ``member_ids`` list has at least 2 UNIQUE entries (a coalition is, by definition, at least two parties --
   one member does not constitute a coalition) and EVERY member id must resolve to a real
   ``stakeholder_profiles[].id`` declared in the SAME record -- a dangling reference to a stakeholder who was
   never profiled is refused, same referential-integrity class ``association.concept_map.py``'s own
   ``CONCEPTMAP_EDGE_DANGLING_REF`` already establishes for its own sibling from_node_id/to_node_id shape.
   This method does NOT generate or score coalition scenarios itself -- ``coalition_scenarios`` is
   caller-supplied content (the table row's own "→coalition scenarios" is this method's OUTPUT of the
   interests/power/resources analysis, not a separate recommendation engine this module runs); only structural
   completeness and referential integrity against the declared stakeholder pool are mechanically enforced.

Record-level-only provenance (NOT per-field, NOT per-stakeholder, NOT per-scenario) -- a deliberate
BATCH-WIDE decision for this whole F07 build (matching ``insight.jtbd``'s own identical record-level
placement for its F06 batch), made to avoid the per-item/record-level ambiguity that hit both the F02 and F03
batches (see their own WORKLOG entries). A CoalitionMappingRecord's stakeholder pool and scenario set describe
ONE coherent snapshot of one situation's stakeholder landscape, not a list of independently-sourced items each
needing its own epistemic stamp.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "coalition" before writing any of
this method's own files: zero pre-existing implementation (only the table row itself and the
``method-inventory.yaml`` backlog entry, both read, neither edited).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.coalition_mapping"
RECORD_ID_PREFIX = "COALMAP-"

_PROFILE_KEYS = frozenset({"id", "name", "interests", "power", "resources"})
_SCENARIO_KEYS = frozenset({"id", "label", "member_ids"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``bcg_matrix``/
    ``functional_decomposition``/``insight.jtbd``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _shaped(entry: Any, required_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == required_keys


# --------------------------------------------------------------------------
# Shared predicates -- reused by BOTH the builder and the gate so neither can drift from the other, same
# discipline ``association.concept_map``'s own ``_nodes_are_valid``/``_edges_are_valid`` already establishes.
# --------------------------------------------------------------------------


def _is_valid_id(value: Any) -> bool:
    """An id must be non-empty AND carry no leading/trailing whitespace (2nd critic pass, 2026-09-11: the
    first fix's approach -- silently STRIP ids for comparison purposes while storing the raw, unstripped
    value -- closed the immediate duplicate-detection symptom but left the record itself internally
    inconsistent: a stored ``member_ids: ["eu", "us"]`` could still fail to join against a stored
    ``stakeholder_profiles`` id of ``"eu "`` (different raw bytes), so a record could pass every check here
    and still be unjoinable downstream, and a rebuilt scenario-id uniqueness check the first fix missed
    entirely (``COALMAP_DUPLICATE_SCENARIO_ID`` bypassed by ``"s1"``/``"s1 "``) would have needed the same
    normalization duplicated a third time. Root-caused instead: reject the malformed id at the SHAPE
    boundary, for every id-typed field (profile id, scenario id, member_ids entries) uniformly, so every id
    that ever gets stored or compared is already exactly its own stripped form -- comparisons stay plain `==`
    everywhere, correctly, with nothing left to normalize."""
    return _is_nonempty_str(value) and value == value.strip()


def _stakeholder_profiles_are_valid(profiles: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``.

    Real invariant: a list of at least 2 well-shaped ``{id, name, interests, power, resources}`` entries
    (structural floor -- see module docstring), unique, whitespace-free ``id`` values (see ``_is_valid_id``),
    and non-empty ``name``/``interests``/``power``/``resources`` strings per entry.
    """
    if not isinstance(profiles, list) or len(profiles) < 2:
        return False, "TOO_FEW"
    seen_ids: set[str] = set()
    for profile in profiles:
        if not _shaped(profile, _PROFILE_KEYS):
            return False, "SHAPE"
        if not _is_valid_id(profile.get("id")):
            return False, "SHAPE"
        if not all(_is_nonempty_str(profile.get(key)) for key in ("name", "interests", "power", "resources")):
            return False, "SHAPE"
        if profile["id"] in seen_ids:
            return False, "DUPLICATE_ID"
        seen_ids.add(profile["id"])
    return True, None


def _coalition_scenarios_are_valid(scenarios: Any, stakeholder_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``.

    Real invariant: a non-empty list of well-shaped ``{id, label, member_ids}`` entries with unique,
    whitespace-free scenario ``id`` values (see ``_is_valid_id``); every ``member_ids`` has >=2 UNIQUE,
    whitespace-free entries, each resolving to a real id in ``stakeholder_ids`` -- a dangling reference is
    refused, never silently accepted.
    """
    if not isinstance(scenarios, list) or not scenarios:
        return False, "EMPTY"
    seen_scenario_ids: set[str] = set()
    for scenario in scenarios:
        if not _shaped(scenario, _SCENARIO_KEYS):
            return False, "SHAPE"
        if not _is_valid_id(scenario.get("id")) or not _is_nonempty_str(scenario.get("label")):
            return False, "SHAPE"
        if scenario["id"] in seen_scenario_ids:
            return False, "DUPLICATE_ID"
        seen_scenario_ids.add(scenario["id"])
        member_ids = scenario.get("member_ids")
        if not isinstance(member_ids, list) or not all(_is_valid_id(m) for m in member_ids):
            return False, "SHAPE"
        if len(member_ids) < 2:
            return False, "TOO_FEW_MEMBERS"
        if len(set(member_ids)) != len(member_ids):
            return False, "DUPLICATE_MEMBER"
        if not all(m in stakeholder_ids for m in member_ids):
            return False, "DANGLING_REF"
    return True, None


# --------------------------------------------------------------------------
# Convenience constructors -- thin, do NOT themselves enforce shape/uniqueness (``generate_...`` validates
# whatever list it is handed regardless of how it was built, same "helper is not the invariant boundary"
# discipline ``association.concept_map``'s own ``concept_node``/``concept_edge`` already establish; mutation
# tests build entries directly, bypassing these helpers, to prove the builder itself enforces the invariants).
# --------------------------------------------------------------------------


def stakeholder_profile(profile_id: str, name: str, interests: str, power: str, resources: str) -> dict[str, Any]:
    """One item of ``typed-objects/coalition-mapping.schema.yaml#/properties/stakeholder_profiles``."""
    return {"id": profile_id, "name": name, "interests": interests, "power": power, "resources": resources}


def coalition_scenario(scenario_id: str, label: str, member_ids: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/coalition-mapping.schema.yaml#/properties/coalition_scenarios``."""
    return {"id": scenario_id, "label": label, "member_ids": list(member_ids)}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_coalition_mapping_record(
    record_id: str,
    context: str,
    stakeholder_profiles: list[dict[str, Any]],
    coalition_scenarios: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/coalition-mapping.schema.yaml``.

    Enforces both real invariants fail-closed, in order: id/version/context shape, the stakeholder-profile
    completeness invariant, then the coalition-scenario referential-integrity + minimum-size invariant. A
    CoalitionMappingRecord failing any one of these is refused at construction, never silently stored with a
    dangling member reference or a single-member "coalition".
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"COALMAP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"COALMAP_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"COALMAP_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"COALMAP_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    profiles_ok, profiles_reason = _stakeholder_profiles_are_valid(stakeholder_profiles)
    if not profiles_ok:
        if profiles_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"COALMAP_DUPLICATE_STAKEHOLDER_ID: stakeholder_profiles ids must be unique within one record, got {_shallow_describe(stakeholder_profiles)}")
        raise InvariantViolation(
            f"COALMAP_INVALID_STAKEHOLDER_PROFILES: stakeholder_profiles must be a list of >=2 well-shaped "
            f"{{id, name, interests, power, resources}} entries (each field non-empty), got {_shallow_describe(stakeholder_profiles)}"
        )

    stakeholder_ids = frozenset(p["id"] for p in stakeholder_profiles)
    scenarios_ok, scenarios_reason = _coalition_scenarios_are_valid(coalition_scenarios, stakeholder_ids)
    if not scenarios_ok:
        if scenarios_reason == "EMPTY":
            raise InvariantViolation("COALMAP_EMPTY_COALITION_SCENARIOS: coalition_mapping is defined by its own scenarios (Atlas L496's own '→coalition scenarios') -- at least 1 scenario is required")
        if scenarios_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"COALMAP_DUPLICATE_SCENARIO_ID: coalition_scenarios ids must be unique within one record, got {_shallow_describe(coalition_scenarios)}")
        if scenarios_reason == "TOO_FEW_MEMBERS":
            raise InvariantViolation(f"COALMAP_SCENARIO_TOO_FEW_MEMBERS: every coalition_scenarios entry's member_ids must have at least 2 unique entries (a coalition is at least two parties), got {_shallow_describe(coalition_scenarios)}")
        if scenarios_reason == "DUPLICATE_MEMBER":
            raise InvariantViolation(f"COALMAP_SCENARIO_DUPLICATE_MEMBER: a coalition_scenarios entry's member_ids must not repeat the same stakeholder id, got {_shallow_describe(coalition_scenarios)}")
        if scenarios_reason == "DANGLING_REF":
            raise InvariantViolation(f"COALMAP_SCENARIO_DANGLING_MEMBER_REF: every coalition_scenarios member_ids entry must resolve to a stakeholder_profiles id declared in this record, got {_shallow_describe(coalition_scenarios)}")
        raise InvariantViolation(f"COALMAP_INVALID_COALITION_SCENARIOS: coalition_scenarios must be a non-empty list of well-shaped {{id, label, member_ids}} entries, got {_shallow_describe(coalition_scenarios)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "stakeholder_profiles": [dict(p) for p in stakeholder_profiles],
        "coalition_scenarios": [dict(s) for s in coalition_scenarios],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never call
# generate_coalition_mapping_record -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid
    (record-level ONLY, see module docstring -- no per-profile or per-scenario provenance field exists to
    check). Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_coalition_mapping_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_coalition_mapping_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Checks id/version/context shape,
    stakeholder-profile completeness, and coalition-scenario referential integrity + minimum size, all
    independently. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("coalition_mapping_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("coalition_mapping_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("coalition_mapping_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("context")):
        return _result("coalition_mapping_integrity", False, [{"reason": "context missing or empty"}], validator, timestamp)

    profiles_ok, profiles_reason = _stakeholder_profiles_are_valid(record.get("stakeholder_profiles"))
    if not profiles_ok:
        return _result("coalition_mapping_integrity", False, [{"reason": f"stakeholder_profiles invalid ({profiles_reason})"}], validator, timestamp)
    stakeholder_ids = frozenset(p["id"] for p in record["stakeholder_profiles"])

    scenarios_ok, scenarios_reason = _coalition_scenarios_are_valid(record.get("coalition_scenarios"), stakeholder_ids)
    if not scenarios_ok:
        return _result("coalition_mapping_integrity", False, [{"reason": f"coalition_scenarios invalid ({scenarios_reason})"}], validator, timestamp)

    return _result(
        "coalition_mapping_integrity",
        True,
        [{"stakeholder_count": len(record["stakeholder_profiles"]), "scenario_count": len(record["coalition_scenarios"])}],
        validator,
        timestamp,
    )


def evaluate_coalition_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and ``insight.jtbd``'s own identical "only emit gates for what
    is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_coalition_mapping_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
