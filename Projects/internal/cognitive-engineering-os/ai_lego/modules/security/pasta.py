"""``security.pasta`` -- forty-seventh Method Atlas slice, FOURTH member of the `security` family (F20),
after `security.stride` (44th), `security.linddun` (45th), and `security.attack_tree` (46th).

Atlas gives this method exactly ONE citation anywhere in this spec
root -- the F20 tool table's PASTA row (L884: "business→scope
→decompose→threat→vulnerability→attack→risk"), the thinnest grounding
of any F20 member built so far. No dedicated section, no worked
example, and conspicuously absent from Atlas's own §10 default recipe
and §13.11 Security Review Recipe. Execution Contract §32 Security
Change Contract (L1231-1260, naming PASTA) is the ONLY other citation,
grounding `assets`/`trust_boundaries`/`entry_points`, kept identically
shaped to the three siblings' own fields.

A genuinely THIRD structural shape among F20 members (after STRIDE
/LINDDUN's shared flat-DFD shape and Attack Tree's own recursive
tree): `stages` is a fixed-length-seven, POSITIONALLY ORDERED tuple --
Atlas's own "→" chain is a real dependency order, not an unordered set.
All per-stage field detail beyond Atlas's own seven-word formula is
explicitly grounded in real, external, named PASTA methodology
practice, NOT an Atlas citation -- see the method contract's own
description and compilation_decisions for why this module deliberately
stays minimal (stage_id/summary only for the six process stages) rather
than importing that external methodology's own richer per-stage
structure.

A STRUCTURAL record (provenance_required + one integrity gate), NOT
genuine_compute: the real invariant is stage completeness-and-order,
the same class of structural derivation STRIDE/LINDDUN's own
`elements_with_no_recorded_threats` already establishes -- no numeric
/ordinal aggregation like `security.attack_tree`'s own.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.pasta"
RECORD_ID_PREFIX = "PASTA-"
STAGE_ORDER: tuple[str, ...] = ("business", "scope", "decompose", "threat", "vulnerability", "attack", "risk")
# Atlas's own literal seven-word chain (L884), transcribed verbatim and in Atlas's own order -- the real
# invariant this module enforces is that caller-supplied stages match this EXACT sequence, positionally.
_KNOWN_TRUST_BOUNDARY_KEYS = frozenset({"name", "description"})
_KNOWN_PROCESS_STAGE_KEYS = frozenset({"stage_id", "summary"})
_KNOWN_RISK_STAGE_KEYS = frozenset({"stage_id", "summary", "control", "residual_risk", "test_evidence"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_str_list_is_valid(value: Any) -> bool:
    return isinstance(value, list) and all(_is_nonempty_str(v) for v in value)


def _assets_are_valid(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and _nonempty_str_list_is_valid(value)


def _trust_boundary_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_TRUST_BOUNDARY_KEYS:
        return False
    return _is_nonempty_str(entry["name"]) and _is_nonempty_str(entry["description"])


def _trust_boundaries_are_valid(value: Any) -> bool:
    return isinstance(value, list) and all(_trust_boundary_is_valid(e) for e in value)


def _process_stage_is_valid(stage: Any, expected_stage_id: str) -> bool:
    """Shared predicate: exactly the two known process-stage keys, stage_id matching the EXPECTED value at
    this position (not merely 'a legal stage_id' -- position-specific), summary non-empty. Called by BOTH
    the builder and the gate."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_PROCESS_STAGE_KEYS:
        return False
    if stage["stage_id"] != expected_stage_id:
        return False
    return _is_nonempty_str(stage["summary"])


def _risk_stage_is_valid(stage: Any) -> bool:
    """Shared predicate: exactly the five known risk-stage keys, stage_id=='risk', summary/control
    /residual_risk/test_evidence all non-empty. Called by BOTH the builder and the gate."""
    if not isinstance(stage, dict) or set(stage.keys()) != _KNOWN_RISK_STAGE_KEYS:
        return False
    if stage["stage_id"] != "risk":
        return False
    return all(_is_nonempty_str(stage[field]) for field in ("summary", "control", "residual_risk", "test_evidence"))


def _stages_are_valid(stages: Any) -> bool:
    """Shared predicate (the real order invariant): stages must be a list of EXACTLY seven entries, the
    first six matching STAGE_ORDER[0:6] POSITIONALLY (process stages), the seventh the distinguished risk
    stage. A same-SET-different-ORDER list is INVALID -- Atlas's own '->' chain is a dependency order, not
    an unordered set. Called by BOTH the builder and the gate."""
    if not isinstance(stages, list) or len(stages) != len(STAGE_ORDER):
        return False
    for position, expected_stage_id in enumerate(STAGE_ORDER[:-1]):
        if not _process_stage_is_valid(stages[position], expected_stage_id):
            return False
    return _risk_stage_is_valid(stages[-1])


def generate_pasta_threat_model_record(
    record_id: str,
    system_or_component: str,
    assets: list[str],
    trust_boundaries: list[dict[str, Any]],
    entry_points: list[str],
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pasta-threat-model-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed: record_id (PASTA- prefix)/system_or_component non-empty, version a real
    string, assets a non-empty list of non-empty strings, trust_boundaries/entry_points lists (may be empty)
    of well-shaped entries, and stages EXACTLY Atlas's own seven-stage chain in Atlas's own literal order.
    REBUILDS every nested object it owns, including every stage; provenance is stored by reference, the same
    family-wide convention every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PASTA_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"PASTA_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PASTA_INVALID_VERSION: version must be a string, got {version!r}")
    if not _assets_are_valid(assets):
        raise InvariantViolation(f"PASTA_INVALID_ASSETS: assets must be a non-empty list of non-empty strings, got {assets!r}")
    if not _trust_boundaries_are_valid(trust_boundaries):
        raise InvariantViolation(f"PASTA_INVALID_TRUST_BOUNDARIES: every entry must have known keys (name/description), both non-empty, got {trust_boundaries!r}")
    if not _nonempty_str_list_is_valid(entry_points):
        raise InvariantViolation(f"PASTA_INVALID_ENTRY_POINTS: entry_points must be a list of non-empty strings, got {entry_points!r}")
    if not _stages_are_valid(stages):
        raise InvariantViolation(
            f"PASTA_INVALID_STAGES: stages must be EXACTLY the seven entries {STAGE_ORDER} in that literal order -- the first six "
            f"process stages (stage_id/summary only) followed by the risk stage (stage_id/summary/control/residual_risk/test_evidence), got {stages!r}"
        )

    rebuilt_stages = []
    for stage in stages[:-1]:
        rebuilt_stages.append({"stage_id": stage["stage_id"], "summary": stage["summary"]})
    risk = stages[-1]
    rebuilt_stages.append({"stage_id": risk["stage_id"], "summary": risk["summary"], "control": risk["control"], "residual_risk": risk["residual_risk"], "test_evidence": risk["test_evidence"]})

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "assets": list(assets),
        "trust_boundaries": [{"name": tb["name"], "description": tb["description"]} for tb in trust_boundaries],
        "entry_points": list(entry_points),
        "stages": rebuilt_stages,
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


def evaluate_pasta_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    PASTA- prefix), a real string version, system_or_component, well-shaped assets/trust_boundaries
    /entry_points, AND that stages is EXACTLY Atlas's own seven-stage chain in Atlas's own literal order.
    Does not trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("pasta_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("pasta_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("pasta_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("pasta_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    if not _assets_are_valid(record.get("assets")):
        return _result("pasta_integrity", False, [{"reason": "assets invalid (empty, malformed, or non-string entry)"}], validator, timestamp)
    if not _trust_boundaries_are_valid(record.get("trust_boundaries")):
        return _result("pasta_integrity", False, [{"reason": "trust_boundaries invalid (malformed entry or unknown keys)"}], validator, timestamp)
    if not _nonempty_str_list_is_valid(record.get("entry_points")):
        return _result("pasta_integrity", False, [{"reason": "entry_points invalid (not a list, or contains a non-string/empty entry)"}], validator, timestamp)

    stages = record.get("stages")
    if not _stages_are_valid(stages):
        return _result(
            "pasta_integrity",
            False,
            [{"reason": f"stages invalid (must be exactly the seven entries {STAGE_ORDER} in that literal order, correct shape, non-empty content)"}],
            validator,
            timestamp,
        )

    return _result("pasta_integrity", True, [{"asset_count": len(record["assets"]), "stage_count": len(stages)}], validator, timestamp)


def evaluate_pasta_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_pasta_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
