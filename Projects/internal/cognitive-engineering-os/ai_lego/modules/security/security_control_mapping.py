"""``security.security_control_mapping`` -- fifty-third Method Atlas slice, TENTH and LAST member of the
`security` family (F20's own "資安／隱私套件"), closing F20 10/10, after `security.stride` (44th),
`security.linddun` (45th), `security.attack_tree` (46th), `security.pasta` (47th), `security.dpia_pia`
(48th), and four further F20 members built concurrently in this same session (Zero Trust Review, Secrets
Threat Review, Supply Chain Threat Model, Abuse Case -- 49th-52nd; this module does not depend on or
reference any of their outputs).

Atlas gives this method exactly ONE citation, its own F20 tool table row (L891: "Threat→Control→Evidence",
usage "每個威脅對應 preventive/detective/recovery control", benefit "控制可稽核、可測") -- no dedicated
section exists (grep-confirmed absent from §11.x/§12.x/§13.x), the thinnest of all ten F20 rows.

**Structurally NEW among F20 members**: every prior F20 module is a self-contained analysis. This one is
the FIRST (confirmed by grepping every ai_lego/modules/*/*.py gate signature -- zero prior hits of an extra
parameter beyond (record, validator, timestamp)) whose own core invariant is a REFERENCE to a DIFFERENT
record's own raw content. `source_record_id`/`source_record_type` name an EXISTING StrideThreatModelRecord
or LinddunPrivacyThreatModelRecord (the only two F20 siblings confirmed, by reading both schemas, to expose
an IDENTICAL flat `threats[]` shape), and every `control_mappings[]` entry classifies ONE of that source
record's own `threats[]` entries into Atlas's own literal three-word category vocabulary
(preventive/detective/recovery) plus a structured, auditable `evidence` record.

**Grounds for the CONSUMPTION design** (not a standalone, from-scratch threats[]/controls[] record): (1)
Atlas's own F20 row (L891) reads "每個威脅對應" (EACH THREAT maps to...) -- presupposing threats that
ALREADY EXIST; (2) Atlas §13.11 Security Review Recipe (L3472-3487) sequences "...→ STRIDE → LINDDUN →
Attack Tree → Secret/Identity Review → Supply Chain Review → Control Mapping → Adversarial Test →..." --
Control Mapping's own recipe position is immediately AFTER the threat-producing methods; (3)
`security.stride.contract.yaml`'s own compilation_decisions explicitly declined to build a
"Threat→Control→Evidence TRACEABILITY structure" itself, naming Security Control Mapping BY NAME as the
dedicated future home, and its own OQ-STRIDE-5 explicitly anticipated this. See
`methods/contracts/security.security_control_mapping.contract.yaml` for the full due-diligence trail.

Two real invariants, both two-layer (construction + gate, re-derived from raw fields, not trusted):

1. WITHIN-RECORD referential integrity -- every `control_mappings[]` entry's own `control_id` must name a
   real `controls[].control_id` (the same class STRIDE's own `threats[].element_name` ->
   `data_flow_elements[].name` check already establishes).
2. CROSS-RECORD referential integrity (the genuinely NEW class) -- every `control_mappings[]` entry's own
   `source_threat_index` must name a REAL entry in the EXTERNAL source record's own `threats[]` array, and
   its own denormalized `source_threat_element_name`/`source_threat_category` must MATCH what is actually
   stored there. The BUILDER always performs this fully (it requires the real, raw external
   `source_record` as an argument). The GATE performs it fully too WHEN the same raw external record is
   passed to its own optional `source_record` keyword (proven by `run_security_control_mapping_slice.py`'s
   own hand-tamper test); when it is NOT supplied, the gate still re-derives a real, weaker, fully
   self-contained invariant instead of skipping the check silently: that `control_mappings[]`'s own covered
   threat indices and `source_threats_with_no_control_mapping`'s own indices partition a contiguous
   `0..N-1` range with no overlap and no gap. Disclosed honestly in the method contract's own
   `compilation_decisions`/`open_questions` -- no prior F20 gate signature ever needed an extra parameter,
   because every prior invariant was fully self-contained within one record.

`source_threats_with_no_control_mapping` is GENUINE, RE-DERIVED evidence (never caller-supplied) -- the
source record's own `threats[]` indices with zero `control_mappings[]` entries referencing them, the same
"surfaced as information, not enforced" discipline STRIDE's own `elements_with_no_recorded_threats` already
establishes, applied here to CONTROL coverage instead of THREAT coverage.

A STRUCTURAL record (provenance_required + one integrity gate), NOT genuine_compute -- both invariants are
set-membership/referential derivations, not a numeric/statistical CALCULATED RESULT.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.security_control_mapping"
RECORD_ID_PREFIX = "SCM-"

SOURCE_RECORD_TYPES = frozenset({"stride", "linddun"})
# The only two F20 siblings directly confirmed (by reading both schemas) to expose an identical flat
# threats[] shape (required: [element_name, category, description, control, residual_risk, test_evidence]).
# Attack Tree (a recursive AND/OR tree) and PASTA (a single fixed-length pipeline, one terminal risk verdict)
# are confirmed structurally incompatible -- see method contract open_questions for the disclosed scope
# limit, not silently ignored.
_SOURCE_RECORD_PREFIXES: dict[str, str] = {"stride": "STRIDE-", "linddun": "LINDDUN-"}
_CONTROL_CATEGORIES = frozenset({"preventive", "detective", "recovery"})
_KNOWN_EVIDENCE_KEYS = frozenset({"description", "verified_by", "verified_date"})
_KNOWN_CONTROL_KEYS = frozenset({"control_id", "category", "description", "evidence"})
_KNOWN_MAPPING_KEYS = frozenset({"source_threat_index", "source_threat_element_name", "source_threat_category", "control_id"})
_KNOWN_UNMAPPED_KEYS = frozenset({"source_threat_index", "source_threat_element_name", "source_threat_category"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _evidence_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the three known keys, all non-empty strings. Called by BOTH the builder
    and the gate. A STRUCTURED record (description/verified_by/verified_date), not the flat free-text
    test_evidence string every sibling F20 threat entry carries -- Atlas's own benefit line for THIS method
    ('控制可稽核、可測') is made concretely checkable by who/when fields, not implied by prose alone."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_EVIDENCE_KEYS:
        return False
    return all(_is_nonempty_str(entry[k]) for k in _KNOWN_EVIDENCE_KEYS)


def _control_entry_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the four known keys, control_id CTRL- prefixed, category one of Atlas's
    own literal three words, description non-empty, evidence shape-valid. Called by BOTH the builder and
    the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_CONTROL_KEYS:
        return False
    if not (_is_nonempty_str(entry["control_id"]) and entry["control_id"].startswith("CTRL-")):
        return False
    if entry["category"] not in _CONTROL_CATEGORIES:
        return False
    if not _is_nonempty_str(entry["description"]):
        return False
    return _evidence_is_valid(entry["evidence"])


def _controls_are_valid(value: Any) -> tuple[bool, frozenset[str]]:
    """Returns (is_valid, declared_control_ids) -- callers need the id set to cross-check control_mappings,
    the same 'return what callers need rather than force a second pass' shape
    security.dpia_pia's own _risks_stage_is_valid already establishes. Real invariant: at least one entry,
    each shape-valid, control_id unique within the record."""
    if not isinstance(value, list) or not value or not all(_control_entry_is_valid(c) for c in value):
        return False, frozenset()
    ids = [c["control_id"] for c in value]
    if len(ids) != len(set(ids)):
        return False, frozenset()  # duplicate control_id within controls[] itself
    return True, frozenset(ids)


def _source_threats_from_record(source_record: Any, source_record_type: str) -> list[tuple[str, str]] | None:
    """Extracts a POSITIONAL list of (element_name, category) pairs from the RAW external source_record's
    own threats[] array -- the two fields this record's own referential integrity needs, nothing else. Does
    NOT re-validate the entire source record's own internal correctness (that is STRIDE's/LINDDUN's own gate
    job, already performed when that record was built) -- only confirms enough of its raw shape to trust the
    extraction. Returns None (not raises) on any malformed shape, so callers can fail closed uniformly."""
    if source_record_type not in SOURCE_RECORD_TYPES:
        return None
    if not isinstance(source_record, dict):
        return None
    expected_prefix = _SOURCE_RECORD_PREFIXES[source_record_type]
    if not (_is_nonempty_str(source_record.get("id")) and source_record["id"].startswith(expected_prefix)):
        return None
    threats = source_record.get("threats")
    if not isinstance(threats, list):
        return None
    extracted: list[tuple[str, str]] = []
    for threat in threats:
        if not isinstance(threat, dict) or not _is_nonempty_str(threat.get("element_name")) or not _is_nonempty_str(threat.get("category")):
            return None
        extracted.append((threat["element_name"], threat["category"]))
    return extracted


def _mapping_entry_is_valid(entry: Any, known_control_ids: frozenset[str], source_threats: list[tuple[str, str]]) -> bool:
    """Shared predicate (precondition: controls already valid, source_threats already extracted): exactly
    the four known keys, source_threat_index in range and its denormalized element_name/category MATCH what
    the real source record actually has at that index (cross-record referential integrity), control_id
    names a real controls[] entry. Called by BOTH the builder and the gate's full-verification path."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_MAPPING_KEYS:
        return False
    index = entry["source_threat_index"]
    if not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= len(source_threats):
        return False
    real_name, real_category = source_threats[index]
    if entry["source_threat_element_name"] != real_name or entry["source_threat_category"] != real_category:
        return False
    return entry["control_id"] in known_control_ids


def _control_mappings_are_valid(value: Any, known_control_ids: frozenset[str], source_threats: list[tuple[str, str]]) -> bool:
    """Shared predicate: at least one entry, each shape- and referentially-valid, no duplicate
    (source_threat_index, control_id) pair (pure redundant noise -- same source_threat_index paired with a
    DIFFERENT control_id is legal defense-in-depth, not a duplicate)."""
    if not isinstance(value, list) or not value:
        return False
    if not all(_mapping_entry_is_valid(m, known_control_ids, source_threats) for m in value):
        return False
    pairs = [(m["source_threat_index"], m["control_id"]) for m in value]
    return len(pairs) == len(set(pairs))


def _unmapped_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_UNMAPPED_KEYS:
        return False
    index = entry["source_threat_index"]
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        return False
    return _is_nonempty_str(entry["source_threat_element_name"]) and _is_nonempty_str(entry["source_threat_category"])


def _compute_source_threats_with_no_control_mapping(source_threats: list[tuple[str, str]], control_mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Order-preserving (by source index), deterministic set-difference: which source_threats[] indices have
    zero control_mappings[] entries referencing them. Pure structural derivation, not genuine compute -- the
    same class STRIDE's own elements_with_no_recorded_threats already performs, applied to control coverage
    rather than threat coverage."""
    referenced = {m["source_threat_index"] for m in control_mappings}
    return [
        {"source_threat_index": i, "source_threat_element_name": name, "source_threat_category": category}
        for i, (name, category) in enumerate(source_threats)
        if i not in referenced
    ]


def generate_security_control_mapping_record(
    record_id: str,
    system_or_component: str,
    source_record: dict[str, Any],
    source_record_type: str,
    controls: list[dict[str, Any]],
    control_mappings: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/security-control-mapping-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (SCM- prefix)/system_or_component non-empty,
    version a real string, source_record_type one of {stride, linddun}, source_record a well-shaped RAW
    external record of that type (id correctly prefixed, threats[] well-shaped), controls a non-empty list
    of well-shaped entries with unique control_id, and control_mappings a non-empty list of well-shaped
    entries with NO duplicate (source_threat_index, control_id) pair, each one's own source_threat_index/
    element_name/category genuinely matching the REAL source_record's own threats[] at that index (the
    CROSS-RECORD referential integrity this method exists to enforce), and control_id naming a real
    controls[] entry (WITHIN-RECORD referential integrity). ``source_record_id``/``source_threat_count`` are
    NOT caller-supplied parameters -- always taken/derived from the real source_record itself, so they can
    never silently disagree with it. ``source_threats_with_no_control_mapping`` is NOT a parameter -- always
    computed fresh. REBUILDS every nested object it owns; provenance is stored by reference, the same
    family-wide convention every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SCM_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"SCM_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SCM_INVALID_VERSION: version must be a string, got {version!r}")
    if source_record_type not in SOURCE_RECORD_TYPES:
        raise InvariantViolation(f"SCM_INVALID_SOURCE_RECORD_TYPE: source_record_type must be one of {sorted(SOURCE_RECORD_TYPES)}, got {source_record_type!r}")

    source_threats = _source_threats_from_record(source_record, source_record_type)
    if source_threats is None:
        raise InvariantViolation(
            f"SCM_INVALID_SOURCE_RECORD: source_record must be a dict with id prefixed {_SOURCE_RECORD_PREFIXES[source_record_type]!r} and a threats list of "
            f"well-shaped entries (non-empty element_name/category), got {source_record!r}"
        )
    if not source_threats:
        raise InvariantViolation("SCM_EMPTY_SOURCE_THREATS: source_record has zero threats[] entries -- there is nothing for this method to map controls against")

    controls_ok, known_control_ids = _controls_are_valid(controls)
    if not controls_ok:
        raise InvariantViolation(
            f"SCM_INVALID_CONTROLS: controls must be a non-empty list of well-shaped entries (control_id CTRL- prefixed and unique, category in {sorted(_CONTROL_CATEGORIES)}, "
            f"non-empty description, well-shaped evidence), got {controls!r}"
        )
    if not _control_mappings_are_valid(control_mappings, known_control_ids, source_threats):
        raise InvariantViolation(
            "SCM_INVALID_CONTROL_MAPPINGS: control_mappings must be a non-empty list of well-shaped entries, each source_threat_index in range with its "
            "element_name/category genuinely matching the real source_record's own threats[] at that index, control_id naming a real controls[] entry, "
            f"and no duplicate (source_threat_index, control_id) pair, got {control_mappings!r}"
        )

    rebuilt_controls = [
        {"control_id": c["control_id"], "category": c["category"], "description": c["description"], "evidence": dict(c["evidence"])}
        for c in controls
    ]
    rebuilt_mappings = [
        {
            "source_threat_index": m["source_threat_index"],
            "source_threat_element_name": m["source_threat_element_name"],
            "source_threat_category": m["source_threat_category"],
            "control_id": m["control_id"],
        }
        for m in control_mappings
    ]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "source_record_id": source_record["id"],
        "source_record_type": source_record_type,
        "source_threat_count": len(source_threats),
        "controls": rebuilt_controls,
        "control_mappings": rebuilt_mappings,
        "source_threats_with_no_control_mapping": _compute_source_threats_with_no_control_mapping(source_threats, rebuilt_mappings),
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


def _within_record_shape_is_valid(record: dict[str, Any]) -> tuple[bool, str, frozenset[str]]:
    """Shared first half of the gate, re-derived purely from the record's OWN raw fields (no external
    source_record needed): id/version/system_or_component/source_record_id/source_record_type well-shaped,
    controls well-shaped with unique ids. Returns (ok, reason_if_not_ok, known_control_ids)."""
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return False, f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}", frozenset()
    if not isinstance(record.get("version"), str):
        return False, "version missing or not a string", frozenset()
    if not _is_nonempty_str(record.get("system_or_component")):
        return False, "system_or_component missing or empty", frozenset()
    if record.get("source_record_type") not in SOURCE_RECORD_TYPES:
        return False, f"source_record_type missing or not one of {sorted(SOURCE_RECORD_TYPES)}", frozenset()
    expected_prefix = _SOURCE_RECORD_PREFIXES[record["source_record_type"]]
    if not _is_nonempty_str(record.get("source_record_id")) or not record["source_record_id"].startswith(expected_prefix):
        return False, f"source_record_id missing, empty, or not prefixed {expected_prefix!r} for source_record_type {record.get('source_record_type')!r}", frozenset()
    count = record.get("source_threat_count")
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        return False, "source_threat_count missing, not an integer, or less than 1", frozenset()
    controls_ok, known_control_ids = _controls_are_valid(record.get("controls"))
    if not controls_ok:
        return False, "controls invalid (empty, malformed entry, illegal category, or duplicate control_id)", frozenset()
    return True, "", known_control_ids


def evaluate_security_control_mapping_integrity_gate(record: dict[str, Any], validator: str, timestamp: str, *, source_record: dict[str, Any] | None = None) -> dict[str, Any]:
    """Re-derives structural preconditions from the record's own raw fields. Does not trust any stored
    value. FAILS CLOSED on malformed input rather than crashing.

    TWO-TIER cross-record check, disclosed honestly (see method contract compilation_decisions/
    open_questions -- no prior F20 gate signature ever took an extra parameter, because every prior
    invariant was fully self-contained within one record):

    * WHEN ``source_record`` (the real, raw external STRIDE/LINDDUN record) is supplied, this performs the
      FULL cross-record referential check: every control_mappings[] entry's own source_threat_index/
      element_name/category is re-verified against that record's own real threats[], AND
      source_threats_with_no_control_mapping is recomputed FRESH from the real total threat count and
      compared to the stored value.
    * WHEN it is NOT supplied, this still performs a real, weaker, FULLY SELF-CONTAINED check instead of
      skipping silently: control_mappings[]'s own covered source_threat_index values and
      source_threats_with_no_control_mapping's own indices must together partition a contiguous 0..N-1
      range with no overlap and no gap -- a genuine internal-consistency invariant that catches a
      hand-tampered record (e.g. an index quietly removed from the unmapped list without a corresponding
      mapping added) even with zero access to the external record's live content."""
    if not isinstance(record, dict):
        return _result("security_control_mapping_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    shape_ok, reason, known_control_ids = _within_record_shape_is_valid(record)
    if not shape_ok:
        return _result("security_control_mapping_integrity", False, [{"reason": reason}], validator, timestamp)

    control_mappings = record.get("control_mappings")
    unmapped = record.get("source_threats_with_no_control_mapping")
    if not isinstance(control_mappings, list) or not control_mappings:
        return _result("security_control_mapping_integrity", False, [{"reason": "control_mappings missing, empty, or not a list"}], validator, timestamp)
    if not isinstance(unmapped, list) or not all(_unmapped_entry_is_valid(u) for u in unmapped):
        return _result("security_control_mapping_integrity", False, [{"reason": "source_threats_with_no_control_mapping malformed"}], validator, timestamp)

    if source_record is not None:
        source_record_type = record["source_record_type"]
        source_threats = _source_threats_from_record(source_record, source_record_type)
        if source_threats is None:
            return _result("security_control_mapping_integrity", False, [{"reason": "supplied source_record is malformed or does not match source_record_type"}], validator, timestamp)
        if source_record["id"] != record["source_record_id"]:
            return _result("security_control_mapping_integrity", False, [{"reason": "supplied source_record's own id disagrees with the stored source_record_id"}], validator, timestamp)
        if len(source_threats) != record["source_threat_count"]:
            return _result(
                "security_control_mapping_integrity",
                False,
                [{"reason": "stored source_threat_count disagrees with the REAL source_record's own threat count", "stored": record["source_threat_count"], "real": len(source_threats)}],
                validator,
                timestamp,
            )
        if not _control_mappings_are_valid(control_mappings, known_control_ids, source_threats):
            return _result(
                "security_control_mapping_integrity",
                False,
                [{"reason": "control_mappings invalid against the REAL source_record (dangling control_id, out-of-range or mismatched source_threat reference, or duplicate pair)"}],
                validator,
                timestamp,
            )
        recomputed = _compute_source_threats_with_no_control_mapping(source_threats, control_mappings)
        if unmapped != recomputed:
            return _result(
                "security_control_mapping_integrity",
                False,
                [{"reason": "stored source_threats_with_no_control_mapping disagrees with recomputation against the REAL source_record", "stored": unmapped, "recomputed": recomputed}],
                validator,
                timestamp,
            )
        return _result(
            "security_control_mapping_integrity",
            True,
            [{"mode": "full_cross_record", "control_count": len(known_control_ids), "mapping_count": len(control_mappings), "unmapped_count": len(unmapped)}],
            validator,
            timestamp,
        )

    # --- Weaker, fully self-contained fallback: no live source_record was supplied to this gate call. ---
    if not all(isinstance(m, dict) and set(m.keys()) == _KNOWN_MAPPING_KEYS and m["control_id"] in known_control_ids for m in control_mappings):
        return _result("security_control_mapping_integrity", False, [{"reason": "control_mappings malformed or a control_id does not name a real controls[] entry"}], validator, timestamp)
    pairs = [(m["source_threat_index"], m["control_id"]) for m in control_mappings]
    if len(pairs) != len(set(pairs)):
        return _result("security_control_mapping_integrity", False, [{"reason": "control_mappings contains a duplicate (source_threat_index, control_id) pair"}], validator, timestamp)

    mapping_indices = {m["source_threat_index"] for m in control_mappings}
    unmapped_indices = {u["source_threat_index"] for u in unmapped}
    if mapping_indices & unmapped_indices:
        return _result(
            "security_control_mapping_integrity",
            False,
            [{"reason": "an index appears in BOTH control_mappings and source_threats_with_no_control_mapping -- internally inconsistent", "overlap": sorted(mapping_indices & unmapped_indices)}],
            validator,
            timestamp,
        )
    all_indices = mapping_indices | unmapped_indices
    expected = set(range(record["source_threat_count"]))
    if all_indices != expected:
        return _result(
            "security_control_mapping_integrity",
            False,
            [
                {
                    "reason": "mapped and unmapped indices together do not cover exactly 0..source_threat_count-1 (internally inconsistent without a live source_record to re-check against)",
                    "expected_count": record["source_threat_count"],
                    "indices": sorted(all_indices),
                }
            ],
            validator,
            timestamp,
        )
    return _result(
        "security_control_mapping_integrity",
        True,
        [{"mode": "self_contained_no_source_record", "control_count": len(known_control_ids), "mapping_count": len(control_mappings), "unmapped_count": len(unmapped)}],
        validator,
        timestamp,
    )


def evaluate_security_control_mapping_gates(record: dict[str, Any], validator: str, timestamp: str, *, source_record: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_security_control_mapping_integrity_gate(record, validator, timestamp, source_record=source_record),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
