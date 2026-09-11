"""``systems.causal_loop_diagram`` -- F09 systems thinking family (Atlas L541-559), opening member this batch.

Atlas F09 tool table (L545, verbatim sense): "Causal Loop Diagram｜找 feedback loops｜變數→+/- 因果箭頭→
reinforcing/balancing→delay｜揭露非線性與反直覺結果" (find feedback loops: variables -> +/- causal arrows ->
reinforcing/balancing -> delay -> reveals non-linear and counter-intuitive results). Atlas's own worked mermaid
diagram sits directly below the tool table (L554-562): 5 variables, 6 signed edges, 2 closed loops -- both
independently recomputed BALANCING by this module's own parity rule (each contains exactly 1 negative edge).

Real invariant, GENUINE_COMPUTE, re-derived independently at both construction time and gate time (never trusting
a stored/caller-claimed value), same discipline ``causal.dag``'s own ``acyclic_verified`` recompute already
established for a different structural graph property:

1. **loop_type is never a trusted caller label** (``CLD_LOOP_TYPE_MISMATCH``): recomputed from the loop's own
   edges' polarities via the standard system-dynamics parity rule -- an odd count of ``-`` edges around the cycle
   is BALANCING (negative feedback, self-correcting), an even count (including zero) is REINFORCING (positive
   feedback, self-amplifying). A caller-claimed ``loop_type`` that disagrees with the recomputation is refused
   BEFORE the record is constructed.
2. **edge_ids must form a genuinely closed cycle** (``CLD_LOOP_NOT_CLOSED``): each edge's ``to_variable_id`` must
   equal the next edge's ``from_variable_id`` in ``edge_ids`` order, and the last edge's ``to_variable_id`` must
   equal the first edge's ``from_variable_id`` -- a bag of edge ids that does not actually chain into a cycle is
   not a feedback loop, structural integrity beyond "these ids all exist".
3. **Referential integrity** (``CLD_EDGE_UNKNOWN_VARIABLE`` / ``CLD_LOOP_UNKNOWN_EDGE``): every edge's
   ``from_variable_id``/``to_variable_id`` must reference a real declared ``variables[]`` id, and every loop's
   ``edge_ids`` must reference real declared ``edges[]`` ids -- same ``edges->nodes`` pattern ``causal.dag``
   already established for a different graph-shaped method.

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "causal loop"/"causal_loop"/"feedback loop"/"CLD-" before writing any of this
method's own files: zero pre-existing implementation, zero contract-backlog entry (method-inventory.yaml's own
F09 row for this method is a ``contract_status: pending`` placeholder, not a real prior definition).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.causal_loop_diagram"
RECORD_ID_PREFIX = "CLD-"
VALID_POLARITIES = frozenset({"+", "-"})
VALID_LOOP_TYPES = frozenset({"REINFORCING", "BALANCING"})
_VARIABLE_KEYS = frozenset({"id", "name"})
_EDGE_KEYS = frozenset({"id", "from_variable_id", "to_variable_id", "polarity"})
_LOOP_KEYS = frozenset({"id", "edge_ids", "loop_type"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "variables", "edges", "loops", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Item constructors -- raise before construction, don't rely only on the aggregate builder, same discipline
# ``causal.dag``'s own ``dag_node``/``challenge.red_team``'s own ``finding()`` already establish.
# --------------------------------------------------------------------------


def variable(variable_id: str, name: str) -> dict[str, Any]:
    """One item of ``typed-objects/causal-loop-diagram.schema.yaml#/properties/variables``."""
    return {"id": variable_id, "name": name}


def edge(edge_id: str, from_variable_id: str, to_variable_id: str, polarity: str) -> dict[str, Any]:
    """One item of ``typed-objects/causal-loop-diagram.schema.yaml#/properties/edges``."""
    if polarity not in VALID_POLARITIES:
        raise InvariantViolation(f"CLD_INVALID_POLARITY: {polarity!r} is not one of {sorted(VALID_POLARITIES)} (Atlas L545's own +/- vocabulary)")
    return {"id": edge_id, "from_variable_id": from_variable_id, "to_variable_id": to_variable_id, "polarity": polarity}


def loop(loop_id: str, edge_ids: list[str], loop_type: str) -> dict[str, Any]:
    """One item of ``typed-objects/causal-loop-diagram.schema.yaml#/properties/loops``. ``loop_type`` is only
    shape-checked here (a member of the enum) -- whether it actually MATCHES the edges' own recomputed value is
    ``generate_causal_loop_diagram``'s/the gate's job, not this thin item constructor's."""
    if loop_type not in VALID_LOOP_TYPES:
        raise InvariantViolation(f"CLD_INVALID_LOOP_TYPE: {loop_type!r} is not one of {sorted(VALID_LOOP_TYPES)}")
    return {"id": loop_id, "edge_ids": list(edge_ids), "loop_type": loop_type}


# --------------------------------------------------------------------------
# Structural + GENUINE_COMPUTE validators -- shared by the builder and the gate's own independent re-derivation.
# --------------------------------------------------------------------------


def _validate_variables(variables: Any) -> list[str]:
    """Returns the list of valid variable ids, or raises. Never returns a partial/best-effort result."""
    if not isinstance(variables, list) or len(variables) < 2:
        raise InvariantViolation(f"CLD_TOO_FEW_VARIABLES: variables must be a list of at least 2 entries (a causal loop needs at least two variables to relate), got {_shallow_describe(variables)}")
    ids: list[str] = []
    for index, var in enumerate(variables):
        if not isinstance(var, dict) or set(var.keys()) - _VARIABLE_KEYS or not _VARIABLE_KEYS <= var.keys():
            raise InvariantViolation(f"CLD_INVALID_VARIABLE: variables[{index}] must be a dict with exactly keys {sorted(_VARIABLE_KEYS)}, got {_shallow_describe(var)}")
        if not _is_nonempty_str(var.get("id")) or not _is_nonempty_str(var.get("name")):
            raise InvariantViolation(f"CLD_INVALID_VARIABLE: variables[{index}] id and name must each be a non-empty string, got {_shallow_describe(var)}")
        ids.append(var["id"])
    duplicates = {vid for vid in ids if ids.count(vid) > 1}
    if duplicates:
        raise InvariantViolation(f"CLD_DUPLICATE_VARIABLE_ID: variable id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_edges(edges: Any, variable_ids: list[str]) -> dict[str, dict[str, str]]:
    """Returns {edge_id: {from_variable_id, to_variable_id, polarity}} for every valid edge, or raises."""
    if not isinstance(edges, list) or not edges:
        raise InvariantViolation(f"CLD_EMPTY_EDGES: edges must be a non-empty list, got {_shallow_describe(edges)}")
    variable_id_set = set(variable_ids)
    by_id: dict[str, dict[str, str]] = {}
    ids: list[str] = []
    for index, e in enumerate(edges):
        if not isinstance(e, dict) or set(e.keys()) - _EDGE_KEYS or not _EDGE_KEYS <= e.keys():
            raise InvariantViolation(f"CLD_INVALID_EDGE: edges[{index}] must be a dict with exactly keys {sorted(_EDGE_KEYS)}, got {_shallow_describe(e)}")
        edge_id, from_id, to_id, polarity = e.get("id"), e.get("from_variable_id"), e.get("to_variable_id"), e.get("polarity")
        if not _is_nonempty_str(edge_id) or not _is_nonempty_str(from_id) or not _is_nonempty_str(to_id):
            raise InvariantViolation(f"CLD_INVALID_EDGE: edges[{index}] id, from_variable_id, and to_variable_id must each be a non-empty string, got {_shallow_describe(e)}")
        if polarity not in VALID_POLARITIES:
            raise InvariantViolation(f"CLD_INVALID_POLARITY: edges[{index}] polarity {polarity!r} is not one of {sorted(VALID_POLARITIES)}")
        if from_id not in variable_id_set or to_id not in variable_id_set:
            raise InvariantViolation(f"CLD_EDGE_UNKNOWN_VARIABLE: edges[{index}] references variable id(s) not in variables (from={from_id!r}, to={to_id!r})")
        ids.append(edge_id)
        by_id[edge_id] = {"from_variable_id": from_id, "to_variable_id": to_id, "polarity": polarity}
    duplicates = {eid for eid in ids if ids.count(eid) > 1}
    if duplicates:
        raise InvariantViolation(f"CLD_DUPLICATE_EDGE_ID: edge id(s) {sorted(duplicates)} appear more than once")
    return by_id


def _recompute_loop_type(loop_index: int, edge_ids: Any, edges_by_id: dict[str, dict[str, str]]) -> str:
    """The GENUINE_COMPUTE core: given an ordered edge_ids chain, verify it forms a genuinely closed cycle
    referencing real edges, then recompute REINFORCING/BALANCING from the edges' own polarities (standard
    system-dynamics parity rule: odd count of '-' edges = BALANCING, even = REINFORCING). Raises, never returns
    a best-effort guess."""
    if not isinstance(edge_ids, list) or len(edge_ids) < 2:
        raise InvariantViolation(f"CLD_LOOP_TOO_FEW_EDGES: loops[{loop_index}] edge_ids must be a list of at least 2 entries, got {_shallow_describe(edge_ids)}")
    unknown = [eid for eid in edge_ids if eid not in edges_by_id]
    if unknown:
        raise InvariantViolation(f"CLD_LOOP_UNKNOWN_EDGE: loops[{loop_index}] edge_ids {unknown} do not reference any entry in edges")
    chained_edges = [edges_by_id[eid] for eid in edge_ids]
    for current_edge, next_edge in zip(chained_edges, chained_edges[1:] + chained_edges[:1]):
        if current_edge["to_variable_id"] != next_edge["from_variable_id"]:
            raise InvariantViolation(
                f"CLD_LOOP_NOT_CLOSED: loops[{loop_index}] edge_ids {edge_ids} do not form a closed cycle -- "
                f"{current_edge['to_variable_id']!r} does not chain into {next_edge['from_variable_id']!r}"
            )
    negative_count = sum(1 for e in chained_edges if e["polarity"] == "-")
    return "BALANCING" if negative_count % 2 == 1 else "REINFORCING"


def _validate_loops(loops: Any, edges_by_id: dict[str, dict[str, str]]) -> None:
    """Validates every loop: real edge references, genuine closure, and -- the invariant this method exists to
    enforce -- a caller-claimed loop_type that matches the independently recomputed one. Never trusts loop_type
    as given."""
    if not isinstance(loops, list):
        raise InvariantViolation(f"CLD_INVALID_LOOPS: loops must be a list, got {_shallow_describe(loops)}")
    ids: list[str] = []
    for index, lp in enumerate(loops):
        if not isinstance(lp, dict) or set(lp.keys()) - _LOOP_KEYS or not _LOOP_KEYS <= lp.keys():
            raise InvariantViolation(f"CLD_INVALID_LOOP: loops[{index}] must be a dict with exactly keys {sorted(_LOOP_KEYS)}, got {_shallow_describe(lp)}")
        loop_id, edge_ids, claimed_loop_type = lp.get("id"), lp.get("edge_ids"), lp.get("loop_type")
        if not _is_nonempty_str(loop_id):
            raise InvariantViolation(f"CLD_INVALID_LOOP: loops[{index}] id must be a non-empty string, got {loop_id!r}")
        if claimed_loop_type not in VALID_LOOP_TYPES:
            raise InvariantViolation(f"CLD_INVALID_LOOP_TYPE: loops[{index}] loop_type {claimed_loop_type!r} is not one of {sorted(VALID_LOOP_TYPES)}")
        recomputed_loop_type = _recompute_loop_type(index, edge_ids, edges_by_id)
        if claimed_loop_type != recomputed_loop_type:
            raise InvariantViolation(
                f"CLD_LOOP_TYPE_MISMATCH: loops[{index}] claims loop_type={claimed_loop_type!r} but the edges' own "
                f"polarities recompute to {recomputed_loop_type!r} -- loop_type is never a trusted caller value"
            )
        ids.append(loop_id)
    duplicates = {lid for lid in ids if ids.count(lid) > 1}
    if duplicates:
        raise InvariantViolation(f"CLD_DUPLICATE_LOOP_ID: loop id(s) {sorted(duplicates)} appear more than once")


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_causal_loop_diagram(
    diagram_id: str,
    variables: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    loops: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/causal-loop-diagram.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then variables (>=2,
    well-formed, unique), then edges (real polarity, valid variable references, no duplicates), then loops (real
    edge references, genuine cycle closure, and -- the invariant this method exists to enforce -- a
    caller-claimed loop_type that matches the independently recomputed one). ``loops`` may be empty: a diagram
    may name variables and edges without yet closing a cycle.
    """
    if not _is_nonempty_str(diagram_id) or not diagram_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CLD_INVALID_ID: diagram_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {diagram_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CLD_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"CLD_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    variable_ids = _validate_variables(variables)
    edges_by_id = _validate_edges(edges, variable_ids)
    _validate_loops(loops, edges_by_id)

    return {
        "id": diagram_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "variables": [dict(var) for var in variables],
        "edges": [dict(e) for e in edges],
        "loops": [{**lp, "edge_ids": list(lp["edge_ids"])} for lp in loops],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_causal_loop_diagram -- a hand-tampered record that bypassed the builder entirely (e.g. a loop_type
# flipped after construction) must be caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_loop_type_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_causal_loop_diagram``, so a hand-tampered record that bypassed the builder entirely
    (e.g. ``loops[0]['loop_type']`` flipped after construction) is caught here exactly as a builder-refused one
    would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("loop_type_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("loop_type_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("loop_type_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    # Record-level key-set check: an added/removed top-level key is caught here directly, not only via schema
    # validation -- same discipline stakeholders.game_theory's own equivalent gate established (critic-found gap
    # there, applied here proactively).
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "loop_type_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    variable_ids: list[str] = []
    edges_by_id: dict[str, dict[str, str]] = {}
    try:
        variable_ids = _validate_variables(record.get("variables"))
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        edges_by_id = _validate_edges(record.get("edges"), variable_ids) if variable_ids else {}
        if not variable_ids:
            problems.append("edges could not be checked: variables failed validation")
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        if edges_by_id:
            _validate_loops(record.get("loops"), edges_by_id)
        else:
            problems.append("loops could not be checked: edges failed validation")
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("loop_type_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_causal_loop_diagram_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_loop_type_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
