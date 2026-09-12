"""``jurisdiction.applicable_law_graph`` -- F23 global jurisdiction/compliance/localization family (Atlas L936,
table-row-only citation).

Atlas's own table row (L936, verbatim): "Applicable Law Graph | 法規來源與
適用條件圖譜 | jurisdiction→source→effective date→scope→conflict | 支援版本
與衝突法" (a graph of legal sources and applicability conditions, via
jurisdiction, source, effective date, scope, conflict, supporting versioning
and conflict-of-law). Grep-confirmed no dedicated §11.x section exists for
this method (unlike siblings Jurisdiction Resolver §11.53 and Market
Admission Control §11.54) -- §13.6's Global Market Entry Recipe (L3356-3357)
places it right after Jurisdiction Resolver, corroborating no additional
content beyond the table row.

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``ALG_DANGLING_JURISDICTION_REF``) -- every
   ``law_entries[].jurisdiction_id`` must resolve to a declared
   ``jurisdiction_nodes[]`` entry.
2. **Source/date well-formedness** (``ALG_INVALID_LAW_ENTRY``) -- every law
   entry requires a non-empty ``source`` and a valid ISO-8601
   ``effective_date`` (Atlas L936's own pipeline stages).
3. **Conflict flagging, THE real invariant this method exists to enforce**
   (``ALG_UNFLAGGED_CONFLICT``) -- any two law entries sharing the same
   ``jurisdiction_id`` + ``scope`` whose ``[effective_date, expiry_date)``
   ranges overlap must BOTH carry a non-null ``conflict`` field. Atlas's
   own benefit column ("支援版本與衝突法", support versioning AND
   conflict-of-law) is defeated by construction if two silently-
   contradicting laws can coexist unflagged for the same
   jurisdiction+scope.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"applicable_law_graph"/"ApplicableLawGraph" before writing any of this
method's own files: zero pre-existing implementation or schema title
overlap. Pre-existing ``specs/jurisdiction/conflict-of-laws-output.schema.yaml``
models a DIFFERENT, heavier Master-Plan-§98-sourced concept (a runtime
Conflict-of-Laws Engine's escalation-to-human-counsel output) -- not reused
here, per the method contract's own OQ-ALG-2 disclosure.
"""

from __future__ import annotations

import copy
from datetime import date
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.applicable_law_graph"
RECORD_ID_PREFIX = "ALG-"

_NODE_KEYS = frozenset({"jurisdiction_id", "description"})
_ENTRY_KEYS = frozenset({"law_id", "jurisdiction_id", "scope", "source", "effective_date", "expiry_date", "conflict"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _parse_date(value: Any) -> date | None:
    """Returns the parsed date, or None if ``value`` is not a valid ISO-8601 date string. Never raises --
    callers treat None as "malformed", fail-closed."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _node_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped jurisdiction_nodes[] entry". Both ``jurisdiction_node()``
    (construction layer) and the gate (independent re-derivation layer) consult it, same single-shared-
    predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _NODE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _NODE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_NODE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("jurisdiction_id")):
        return f"jurisdiction_id must be a non-empty string, got {value.get('jurisdiction_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def jurisdiction_node(jurisdiction_id: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/applicable-law-graph-record.schema.yaml#/properties/jurisdiction_nodes``."""
    record = {"jurisdiction_id": jurisdiction_id, "description": description}
    problem = _node_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ALG_INVALID_JURISDICTION_NODE: {problem}")
    return record


def _entry_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped law_entries[] entry" -- shape/date-validity only, NOT
    referential integrity against ``jurisdiction_nodes[]`` or conflict flagging, which need the sibling
    entries and are checked once in ``generate_applicable_law_graph``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ENTRY_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ENTRY_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ENTRY_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("law_id")):
        return f"law_id must be a non-empty string, got {value.get('law_id')!r}"
    if not _is_nonempty_str(value.get("jurisdiction_id")):
        return f"jurisdiction_id must be a non-empty string, got {value.get('jurisdiction_id')!r}"
    if not _is_nonempty_str(value.get("scope")):
        return f"scope must be a non-empty string, got {value.get('scope')!r}"
    if not _is_nonempty_str(value.get("source")):
        return f"source must be a non-empty string, got {value.get('source')!r}"
    if _parse_date(value.get("effective_date")) is None:
        return f"effective_date must be a valid ISO-8601 date string, got {value.get('effective_date')!r}"
    expiry = value.get("expiry_date")
    if expiry is not None and _parse_date(expiry) is None:
        return f"expiry_date must be null or a valid ISO-8601 date string, got {expiry!r}"
    conflict = value.get("conflict")
    if conflict is not None and not _is_nonempty_str(conflict):
        return f"conflict must be null or a non-empty string, got {conflict!r}"
    return None


def law_entry(law_id: str, jurisdiction_id: str, scope: str, source: str, effective_date: str, expiry_date: str | None = None, conflict: str | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/applicable-law-graph-record.schema.yaml#/properties/law_entries``. Does NOT
    itself check referential integrity against a declared ``jurisdiction_nodes[]`` list or conflict flagging
    against sibling entries -- those cross-field checks happen once, in ``generate_applicable_law_graph``,
    after every entry has been rebuilt."""
    record = {
        "law_id": law_id,
        "jurisdiction_id": jurisdiction_id,
        "scope": scope,
        "source": source,
        "effective_date": effective_date,
        "expiry_date": expiry_date,
        "conflict": conflict,
    }
    problem = _entry_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ALG_INVALID_LAW_ENTRY: {problem}")
    return record


def _ranges_overlap(a_start: date, a_end: date | None, b_start: date, b_end: date | None) -> bool:
    """Half-open interval overlap: [a_start, a_end) intersects [b_start, b_end). ``None`` end = open-ended
    (infinity). Two ranges that merely touch at a shared boundary (one's end == the other's start) do NOT
    overlap -- see typed-objects/applicable-law-graph-record.schema.yaml's own compilation_decisions."""
    a_before_b_ends = b_end is None or a_start < b_end
    b_before_a_ends = a_end is None or b_start < a_end
    return a_before_b_ends and b_before_a_ends


def _detect_unflagged_conflicts(entries: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Returns [(law_id_a, law_id_b), ...] pairs that overlap in jurisdiction_id+scope+date-range but where
    EITHER entry's ``conflict`` field is null. Assumes every entry already passed ``_entry_problem`` (valid
    dates). Groups by (jurisdiction_id, scope) first -- entries in different groups can never conflict."""
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for e in entries:
        key = (e["jurisdiction_id"], e["scope"])
        groups.setdefault(key, []).append(e)

    unflagged: list[tuple[str, str]] = []
    for group in groups.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                a_start, a_end = _parse_date(a["effective_date"]), _parse_date(a["expiry_date"]) if a["expiry_date"] else None
                b_start, b_end = _parse_date(b["effective_date"]), _parse_date(b["expiry_date"]) if b["expiry_date"] else None
                if _ranges_overlap(a_start, a_end, b_start, b_end):
                    if a["conflict"] is None or b["conflict"] is None:
                        unflagged.append((a["law_id"], b["law_id"]))
    return unflagged


def generate_applicable_law_graph(
    record_id: str,
    jurisdiction_nodes: list[dict[str, Any]],
    law_entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/applicable-law-graph-record.schema.yaml``.

    Rebuilds every ``jurisdiction_nodes[]``/``law_entries[]`` entry via ``jurisdiction_node()``/``law_entry()``
    (never trusting the caller's raw dicts), then enforces the method contract's own real invariants fail-
    closed, in order: id/version/provenance shape, >=1 distinct jurisdiction node, >=1 unique-id law entry,
    every entry resolves to a real jurisdiction node -- and, the invariant Atlas's own "支援版本與衝突法"
    benefit exists to enforce, no two entries sharing jurisdiction_id+scope may have overlapping
    [effective_date, expiry_date) ranges with either entry's ``conflict`` left null -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ALG_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ALG_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ALG_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(jurisdiction_nodes, list):
        raise InvariantViolation(f"ALG_INVALID_JURISDICTION_NODES: jurisdiction_nodes must be a list, got {type(jurisdiction_nodes).__name__}")
    rebuilt_nodes: list[dict[str, Any]] = []
    for i, n in enumerate(jurisdiction_nodes):
        if not isinstance(n, dict):
            raise InvariantViolation(f"ALG_INVALID_JURISDICTION_NODES: jurisdiction_nodes[{i}] must be a dict, got {n!r}")
        rebuilt_nodes.append(jurisdiction_node(n.get("jurisdiction_id"), n.get("description")))
    node_ids = [n["jurisdiction_id"] for n in rebuilt_nodes]
    if len(node_ids) != len(set(node_ids)):
        duplicate = sorted({n for n in node_ids if node_ids.count(n) > 1})
        raise InvariantViolation(f"ALG_DUPLICATE_JURISDICTION_ID: jurisdiction_id(s) {duplicate} declared more than once")
    if len(rebuilt_nodes) < 1:
        raise InvariantViolation("ALG_TOO_FEW_JURISDICTION_NODES: at least 1 declared jurisdiction node is required")

    if not isinstance(law_entries, list):
        raise InvariantViolation(f"ALG_INVALID_LAW_ENTRIES: law_entries must be a list, got {type(law_entries).__name__}")
    rebuilt_entries: list[dict[str, Any]] = []
    for i, e in enumerate(law_entries):
        if not isinstance(e, dict):
            raise InvariantViolation(f"ALG_INVALID_LAW_ENTRIES: law_entries[{i}] must be a dict, got {e!r}")
        try:
            rebuilt_entries.append(
                law_entry(e.get("law_id"), e.get("jurisdiction_id"), e.get("scope"), e.get("source"), e.get("effective_date"), e.get("expiry_date"), e.get("conflict"))
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"ALG_INVALID_LAW_ENTRIES: law_entries[{i}]: {error}") from error
    if len(rebuilt_entries) < 1:
        raise InvariantViolation("ALG_TOO_FEW_LAW_ENTRIES: at least 1 law entry is required")

    law_ids = [e["law_id"] for e in rebuilt_entries]
    if len(law_ids) != len(set(law_ids)):
        duplicate = sorted({l for l in law_ids if law_ids.count(l) > 1})
        raise InvariantViolation(f"ALG_DUPLICATE_LAW_ID: law_id(s) {duplicate} declared more than once")

    node_id_set = set(node_ids)
    dangling = sorted({e["jurisdiction_id"] for e in rebuilt_entries} - node_id_set)
    if dangling:
        raise InvariantViolation(f"ALG_DANGLING_JURISDICTION_REF: law_entries[] reference jurisdiction_id(s) {dangling} not present in jurisdiction_nodes[]")

    unflagged = _detect_unflagged_conflicts(rebuilt_entries)
    if unflagged:
        raise InvariantViolation(
            f"ALG_UNFLAGGED_CONFLICT: overlapping law entries share jurisdiction+scope with no conflict flag set on at least one side: {unflagged}. "
            "Atlas L936's own benefit ('支援版本與衝突法') requires every temporally-overlapping same-jurisdiction+scope pair to name the conflict"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "jurisdiction_nodes": rebuilt_nodes,
        "law_entries": rebuilt_entries,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives jurisdiction_nodes/law_entries shape, node-count minimum, and referential integrity directly
    from raw fields using the SAME ``_node_problem``/``_entry_problem`` predicates the builder uses -- without
    this the gate could pass records the builder refuses. Fails closed on malformed entries rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    nodes = record.get("jurisdiction_nodes")
    node_id_set: set[Any] = set()
    if isinstance(nodes, list):
        malformed_nodes = [f"jurisdiction_nodes[{i}]: {problem}" for i, problem in ((i, _node_problem(n)) for i, n in enumerate(nodes)) if problem]
        problems.extend(malformed_nodes)
        well_shaped_nodes = [n for n in nodes if _node_problem(n) is None]
        node_ids = [n["jurisdiction_id"] for n in well_shaped_nodes]
        node_id_set = set(node_ids)
        if not malformed_nodes and len(node_id_set) < 1:
            problems.append("fewer than 1 distinct jurisdiction node")
        if len(node_ids) != len(node_id_set):
            problems.append(f"duplicate jurisdiction_id in jurisdiction_nodes[]: {node_ids!r}")
    else:
        problems.append("jurisdiction_nodes must be a list")

    entries = record.get("law_entries")
    if isinstance(entries, list):
        malformed = [f"law_entries[{i}]: {problem}" for i, problem in ((i, _entry_problem(e)) for i, e in enumerate(entries)) if problem]
        problems.extend(malformed)
        well_shaped_entries = [e for e in entries if _entry_problem(e) is None]
        if not malformed and len(well_shaped_entries) < 1:
            problems.append("fewer than 1 well-shaped law entry")
        law_ids = [e["law_id"] for e in well_shaped_entries]
        if len(law_ids) != len(set(law_ids)):
            problems.append(f"duplicate law_id in law_entries[]: {law_ids!r}")
        dangling = sorted({e["jurisdiction_id"] for e in well_shaped_entries} - node_id_set, key=repr)
        if dangling:
            problems.append(f"dangling jurisdiction_id ref(s) in law_entries[]: {dangling}")
    else:
        problems.append("law_entries must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_conflict_flagging_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L936's own '支援版本與衝突法' requirement directly from raw fields -- any two law
    entries sharing jurisdiction_id+scope with an overlapping date range must both carry a non-null conflict
    field. Fails closed on malformed entries rather than crashing, and does NOT assume referential integrity
    already passed (recomputes against well-shaped entries only)."""
    if not isinstance(record, dict):
        return _result("conflict_flagging", False, [{"reason": "record is not a dict"}], validator, timestamp)
    entries = record.get("law_entries")
    if not isinstance(entries, list):
        return _result("conflict_flagging", False, [{"reason": "law_entries must be a list"}], validator, timestamp)

    well_shaped_entries = [e for e in entries if _entry_problem(e) is None]
    problems: list[str] = []
    if len(well_shaped_entries) != len(entries):
        problems.append("one or more law_entries[] entries are malformed")

    unflagged = _detect_unflagged_conflicts(well_shaped_entries)
    if unflagged:
        problems.append(f"unflagged overlapping pair(s): {unflagged}")

    passed = not problems
    return _result("conflict_flagging", passed, [{"unflagged_pairs": unflagged, "problems": problems}], validator, timestamp)


def evaluate_applicable_law_graph_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_conflict_flagging_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
