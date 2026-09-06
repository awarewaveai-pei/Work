"""``security.linddun`` -- forty-fifth Method Atlas slice, SECOND member of the `security` family (F20),
immediately after `security.stride` (44th slice).

Atlas's own F20 tool table LINDDUN row (L885) AND dedicated §11.45
section (L2249-2267: seven dimensions -- Linkability/Identifiability/
Non-repudiation/Detectability/Disclosure/Unawareness/Non-compliance --
"DFD → privacy threat category enumeration → controls") ground
`data_flow_elements[]`/`threats[]`. Execution Contract §32 Security
Change Contract (L1231-1260, explicitly naming LINDDUN alongside
STRIDE) grounds `assets`/`trust_boundaries`/`entry_points` plus the
four per-threat fields.

Field shape DELIBERATELY MIRRORS `stride.py`'s own shape exactly --
every shared predicate below is the SAME logic `stride.py` already
uses, differing ONLY in `VALID_CATEGORIES` (LINDDUN's seven privacy
dimensions, not STRIDE's six security categories) and the `id` prefix.
See `methods/contracts/security.linddun.contract.yaml`'s own
compilation_decisions for why this is NOT factored into a shared base
module yet (`OQ-LINDDUN-4`, the direct continuation of `OQ-STRIDE-4`)
-- two real instances is deliberately treated as still too thin an
evidence base for the right shape of a shared abstraction.

A STRUCTURAL record (provenance_required + one integrity gate), NOT
genuine compute: `elements_with_no_recorded_threats` is a re-derived
structural set-difference, the same class `security.stride`'s own
record already establishes.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.linddun"
RECORD_ID_PREFIX = "LINDDUN-"
VALID_ELEMENT_TYPES = frozenset({"external_entity", "process", "data_store", "data_flow"})
VALID_CATEGORIES = frozenset({"linkability", "identifiability", "non_repudiation", "detectability", "disclosure", "unawareness", "non_compliance"})
_KNOWN_TRUST_BOUNDARY_KEYS = frozenset({"name", "description"})
_KNOWN_DFD_ELEMENT_KEYS = frozenset({"name", "element_type"})
_KNOWN_THREAT_KEYS = frozenset({"element_name", "category", "description", "control", "residual_risk", "test_evidence"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_str_list_is_valid(value: Any) -> bool:
    """Shared predicate: a list (possibly empty) of non-empty strings. Called by BOTH the builder and the
    gate for entry_points (assets uses the dedicated non-empty wrapper below)."""
    return isinstance(value, list) and all(_is_nonempty_str(v) for v in value)


def _assets_are_valid(value: Any) -> bool:
    """Shared predicate: at least 1 entry, all non-empty strings. Called by BOTH the builder and the gate."""
    return isinstance(value, list) and bool(value) and _nonempty_str_list_is_valid(value)


def _trust_boundary_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the two known keys, name/description non-empty strings. Called by BOTH the
    builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_TRUST_BOUNDARY_KEYS:
        return False
    return _is_nonempty_str(entry["name"]) and _is_nonempty_str(entry["description"])


def _trust_boundaries_are_valid(value: Any) -> bool:
    """Shared predicate: a list (may be empty), every entry shape-valid. Called by BOTH the builder and the
    gate."""
    return isinstance(value, list) and all(_trust_boundary_is_valid(e) for e in value)


def _data_flow_element_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the two known keys, name a non-empty string, element_type the standard
    four-value DFD vocabulary. Called by BOTH the builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_DFD_ELEMENT_KEYS:
        return False
    return _is_nonempty_str(entry["name"]) and entry["element_type"] in VALID_ELEMENT_TYPES


def _data_flow_elements_are_valid(value: Any) -> bool:
    """Shared predicate: at least 1 entry, each shape-valid, names unique within the record. Called by BOTH
    the builder and the gate."""
    if not isinstance(value, list) or not value:
        return False
    if not all(_data_flow_element_is_valid(e) for e in value):
        return False
    names = [e["name"] for e in value]
    return len(names) == len(set(names))


def _threat_is_valid(entry: Any, known_element_names: frozenset[str]) -> bool:
    """Shared predicate (precondition: data_flow_elements already valid): exactly the six known keys,
    element_name a real data_flow_elements entry, category a legal LINDDUN enum value, description/control
    /residual_risk/test_evidence all non-empty strings. Called by BOTH the builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_THREAT_KEYS:
        return False
    if entry["element_name"] not in known_element_names:
        return False
    if entry["category"] not in VALID_CATEGORIES:
        return False
    return all(_is_nonempty_str(entry[field]) for field in ("description", "control", "residual_risk", "test_evidence"))


def _threats_are_valid(value: Any, known_element_names: frozenset[str]) -> bool:
    """Shared predicate: a list (may be empty), every entry shape-valid and referentially real. Called by
    BOTH the builder and the gate."""
    return isinstance(value, list) and all(_threat_is_valid(t, known_element_names) for t in value)


def _compute_elements_with_no_recorded_threats(data_flow_elements: list[dict[str, Any]], threats: list[dict[str, Any]]) -> list[str]:
    """Order-preserving (per data_flow_elements' own order), deterministic set-difference: which
    data_flow_elements[] names have zero threats[] entries referencing them. Pure structural derivation, the
    same class security.stride's own module already performs."""
    referenced = {t["element_name"] for t in threats}
    return [e["name"] for e in data_flow_elements if e["name"] not in referenced]


def generate_linddun_privacy_threat_model_record(
    record_id: str,
    system_or_component: str,
    assets: list[str],
    trust_boundaries: list[dict[str, Any]],
    entry_points: list[str],
    data_flow_elements: list[dict[str, Any]],
    threats: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/linddun-privacy-threat-model-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (LINDDUN- prefix)/system_or_component non-empty,
    version a real string, assets a non-empty list of non-empty strings, trust_boundaries/entry_points/threats
    lists (may be empty) of well-shaped entries, data_flow_elements a non-empty list of well-shaped entries
    with unique names, and every threats[] entry's own element_name naming a real data_flow_elements entry.
    ``elements_with_no_recorded_threats`` is NOT a parameter -- always computed fresh. REBUILDS every nested
    object it owns; provenance is stored by reference, the same family-wide convention security.stride's own
    module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LINDDUN_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"LINDDUN_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LINDDUN_INVALID_VERSION: version must be a string, got {version!r}")
    if not _assets_are_valid(assets):
        raise InvariantViolation(f"LINDDUN_INVALID_ASSETS: assets must be a non-empty list of non-empty strings, got {assets!r}")
    if not _trust_boundaries_are_valid(trust_boundaries):
        raise InvariantViolation(f"LINDDUN_INVALID_TRUST_BOUNDARIES: every entry must have known keys (name/description), both non-empty, got {trust_boundaries!r}")
    if not _nonempty_str_list_is_valid(entry_points):
        raise InvariantViolation(f"LINDDUN_INVALID_ENTRY_POINTS: entry_points must be a list of non-empty strings, got {entry_points!r}")
    if not _data_flow_elements_are_valid(data_flow_elements):
        raise InvariantViolation(f"LINDDUN_INVALID_DATA_FLOW_ELEMENTS: must be a non-empty list of well-shaped entries (known keys name/element_type, element_type in {sorted(VALID_ELEMENT_TYPES)}) with unique names, got {data_flow_elements!r}")
    known_element_names = frozenset(e["name"] for e in data_flow_elements)
    if not _threats_are_valid(threats, known_element_names):
        raise InvariantViolation(
            f"LINDDUN_INVALID_THREATS: every entry must have known keys (element_name/category/description/control/residual_risk/test_evidence), "
            f"element_name naming a real data_flow_elements entry, category in {sorted(VALID_CATEGORIES)}, and non-empty description/control/residual_risk/test_evidence, got {threats!r}"
        )

    rebuilt_assets = list(assets)
    rebuilt_trust_boundaries = [{"name": tb["name"], "description": tb["description"]} for tb in trust_boundaries]
    rebuilt_entry_points = list(entry_points)
    rebuilt_data_flow_elements = [{"name": e["name"], "element_type": e["element_type"]} for e in data_flow_elements]
    rebuilt_threats = [
        {"element_name": t["element_name"], "category": t["category"], "description": t["description"], "control": t["control"], "residual_risk": t["residual_risk"], "test_evidence": t["test_evidence"]}
        for t in threats
    ]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "assets": rebuilt_assets,
        "trust_boundaries": rebuilt_trust_boundaries,
        "entry_points": rebuilt_entry_points,
        "data_flow_elements": rebuilt_data_flow_elements,
        "threats": rebuilt_threats,
        "elements_with_no_recorded_threats": _compute_elements_with_no_recorded_threats(rebuilt_data_flow_elements, rebuilt_threats),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_linddun_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    LINDDUN- prefix), a real string version, system_or_component, well-shaped assets/trust_boundaries/
    entry_points/data_flow_elements (unique names), well-shaped and referentially real threats, AND
    RECOMPUTES ``elements_with_no_recorded_threats`` fresh, comparing against the stored value. Does not
    trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("linddun_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("linddun_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("linddun_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("linddun_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    if not _assets_are_valid(record.get("assets")):
        return _result("linddun_integrity", False, [{"reason": "assets invalid (empty, malformed, or non-string entry)"}], validator, timestamp)
    if not _trust_boundaries_are_valid(record.get("trust_boundaries")):
        return _result("linddun_integrity", False, [{"reason": "trust_boundaries invalid (malformed entry or unknown keys)"}], validator, timestamp)
    if not _nonempty_str_list_is_valid(record.get("entry_points")):
        return _result("linddun_integrity", False, [{"reason": "entry_points invalid (not a list, or contains a non-string/empty entry)"}], validator, timestamp)

    data_flow_elements = record.get("data_flow_elements")
    if not _data_flow_elements_are_valid(data_flow_elements):
        return _result("linddun_integrity", False, [{"reason": "data_flow_elements invalid (empty, malformed entry, illegal element_type, or duplicate name)"}], validator, timestamp)

    known_element_names = frozenset(e["name"] for e in data_flow_elements)
    threats = record.get("threats")
    if not _threats_are_valid(threats, known_element_names):
        return _result("linddun_integrity", False, [{"reason": "threats invalid (malformed entry, unknown keys, illegal category, dangling element_name, or empty description/control/residual_risk/test_evidence)"}], validator, timestamp)

    recomputed = _compute_elements_with_no_recorded_threats(data_flow_elements, threats)
    if record.get("elements_with_no_recorded_threats") != recomputed:
        return _result(
            "linddun_integrity",
            False,
            [{"reason": "stored elements_with_no_recorded_threats disagrees with recomputation", "stored": record.get("elements_with_no_recorded_threats"), "recomputed": recomputed}],
            validator,
            timestamp,
        )

    return _result(
        "linddun_integrity",
        True,
        [{"asset_count": len(record["assets"]), "data_flow_element_count": len(data_flow_elements), "threat_count": len(threats), "elements_with_no_recorded_threats_count": len(recomputed)}],
        validator,
        timestamp,
    )


def evaluate_linddun_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_linddun_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
