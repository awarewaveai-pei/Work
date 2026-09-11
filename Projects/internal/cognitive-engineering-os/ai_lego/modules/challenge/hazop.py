"""``challenge.hazop`` -- F12 challenge/red-team/risk family, ninth built member (red_team, blue_team,
independent_judge already built; this is 1 of 7 concurrent agents opening the rest of this family's remaining
methods in the same parallel batch -- zero file overlap between agents).

Atlas F12 tool table row (L651, the ONLY citation for this method -- no dedicated section exists, grep-confirmed):
"HAZOP｜用 guide words 找流程偏差｜nodes→No/More/Less/Reverse...｜高完整度流程風險分析" (HAZOP: use guide words to
find process deviations; nodes -> No/More/Less/Reverse/...; high-completeness process risk analysis). Atlas
truncates its own guide-word list with "..." after 4 words -- supplemented here with the standard, external
11-word HAZOP guide-word vocabulary (process-safety engineering convention, not invented; disclosed in
``methods/contracts/challenge.hazop.contract.yaml``'s own ``compilation_decisions``, same "disclosed compilation
choice" class every other under-specified Tier 1 contract in this corpus already uses).

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag), following the same "closed vocabulary + referential integrity" structural shape
``stakeholders.game_theory.py``'s own module docstring already establishes for this family of problem:

1. **At least 1 node, each well-formed and unique** (``HAZOP_TOO_FEW_NODES`` / ``HAZOP_INVALID_NODE`` /
   ``HAZOP_DUPLICATE_NODE_ID``): ``nodes`` has >=1 entry (Atlas L651's own 'nodes' pipeline stage -- a HAZOP
   study that examined zero process nodes did not actually study anything), each a non-empty ``{id,
   description}`` pair, no duplicate ``id``.

2. **Every deviation references a real node and a member of the closed 11-word guide-word set**
   (``HAZOP_INVALID_DEVIATION`` / ``HAZOP_DEVIATION_UNKNOWN_NODE`` / ``HAZOP_INVALID_GUIDE_WORD`` /
   ``HAZOP_INVALID_RISK_RATING``): a ``deviations[]`` entry's ``node_id`` must exist in ``nodes``; its
   ``guide_word`` must be a member of ``VALID_GUIDE_WORDS``; ``cause`` and ``consequence`` must be non-empty
   strings; ``safeguard`` must be a string (MAY be empty -- 'no safeguard exists yet' is itself a valid,
   important finding, same reasoning FMEA's ``existing_control`` field uses); an optional ``risk_rating`` must be
   a real, finite number excluding ``bool`` (Python's ``bool`` is an ``int`` subclass -- the same trap
   ``stakeholders.game_theory``'s ``payoffs[].value`` guards against, applied here to the same class of numeric
   field).

3. **``deviations`` may legitimately be empty** (task-mandated, deliberate non-invariant): a node can be examined
   against a guide word and found to have no real deviation -- a valid, useful HAZOP outcome. This method does
   NOT require full node-x-guide-word coverage (every node checked against every one of the 11 words): not every
   guide word applies to every node in practice, so the real, honest invariant is closed-vocabulary +
   referential integrity, not exhaustive coverage. Disclosed as a deliberate scope decision, same class every
   other Tier 1 contract's own ``compilation_decisions`` discloses.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "hazop" before writing any of this method's own files: zero pre-existing
implementation, zero contract-backlog entry.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.hazop"
RECORD_ID_PREFIX = "HAZOP-"

# Standard external HAZOP guide-word vocabulary (11 words). Atlas L651 names only 4 (No/More/Less/Reverse,
# mapped to NO_NOT/MORE/LESS/REVERSE below) before truncating its own list with "..." -- the remaining 7 are the
# well-established process-safety-engineering standard, not invented. Disclosed in the method contract's own
# compilation_decisions.
VALID_GUIDE_WORDS = frozenset(
    {"NO_NOT", "MORE", "LESS", "AS_WELL_AS", "PART_OF", "REVERSE", "OTHER_THAN", "EARLY", "LATE", "BEFORE", "AFTER"}
)

_NODE_KEYS = frozenset({"id", "description"})
_DEVIATION_REQUIRED_KEYS = frozenset({"node_id", "guide_word", "cause", "consequence", "safeguard"})
_DEVIATION_OPTIONAL_KEYS = frozenset({"risk_rating"})
_DEVIATION_ALL_KEYS = _DEVIATION_REQUIRED_KEYS | _DEVIATION_OPTIONAL_KEYS
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "nodes", "deviations", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_number_excluding_bool(value: Any) -> bool:
    """A ``risk_rating`` must be a real, finite number. Python's ``bool`` is an ``int`` subclass, so a bare
    ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as ratings 1/0 -- excluded
    explicitly, same trap ``stakeholders.game_theory``'s own ``_is_number_excluding_bool`` guards for
    ``payoffs[].value``. ``int`` is unconditionally finite (Python ints are arbitrary-precision, never inf/nan)
    and is NOT passed through ``math.isfinite`` -- a huge ``int`` would make ``math.isfinite`` itself raise
    ``OverflowError`` on the implicit float conversion. Only ``float`` needs the NaN/+-inf check."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``game_theory``/``jtbd``/
    ``bcg_matrix``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_nodes(nodes: Any) -> list[str]:
    """Returns the list of valid node ids, or raises on any structural defect. Never returns a partial/best-
    effort result -- fail-closed."""
    if not isinstance(nodes, list) or not nodes:
        raise InvariantViolation(f"HAZOP_TOO_FEW_NODES: nodes must be a non-empty list (Atlas L651's own 'nodes' pipeline stage), got {_shallow_describe(nodes)}")
    ids: list[str] = []
    for index, node in enumerate(nodes):
        if not isinstance(node, dict) or set(node.keys()) - _NODE_KEYS or not _NODE_KEYS <= node.keys():
            raise InvariantViolation(f"HAZOP_INVALID_NODE: nodes[{index}] must be a dict with exactly keys {sorted(_NODE_KEYS)}, got {_shallow_describe(node)}")
        if not _is_nonempty_str(node.get("id")) or not _is_nonempty_str(node.get("description")):
            raise InvariantViolation(f"HAZOP_INVALID_NODE: nodes[{index}] id and description must each be a non-empty string, got {_shallow_describe(node)}")
        ids.append(node["id"])
    duplicates = {nid for nid in ids if ids.count(nid) > 1}
    if duplicates:
        raise InvariantViolation(f"HAZOP_DUPLICATE_NODE_ID: node id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_deviations(deviations: Any, node_ids: list[str]) -> None:
    """Re-derives every deviation-level invariant: closed guide-word vocabulary, referential integrity to
    ``node_ids``, non-empty cause/consequence, string safeguard, and (if present) a genuine finite numeric
    risk_rating. ``deviations`` MAY be an empty list -- a node can be examined against a guide word and found
    clean (task-mandated, see module docstring point 3); only a non-list value is refused."""
    if not isinstance(deviations, list):
        raise InvariantViolation(f"HAZOP_INVALID_DEVIATIONS_TYPE: deviations must be a list (may be empty), got {_shallow_describe(deviations)}")
    node_id_set = set(node_ids)
    for index, deviation in enumerate(deviations):
        if not isinstance(deviation, dict):
            raise InvariantViolation(f"HAZOP_INVALID_DEVIATION: deviations[{index}] must be a dict, got {_shallow_describe(deviation)}")
        unknown = set(deviation.keys()) - _DEVIATION_ALL_KEYS
        missing = _DEVIATION_REQUIRED_KEYS - deviation.keys()
        if unknown or missing:
            raise InvariantViolation(f"HAZOP_INVALID_DEVIATION: deviations[{index}] key set invalid -- unknown={sorted(unknown)}, missing={sorted(missing)}")
        node_id, guide_word, cause, consequence, safeguard = (
            deviation.get("node_id"),
            deviation.get("guide_word"),
            deviation.get("cause"),
            deviation.get("consequence"),
            deviation.get("safeguard"),
        )
        if not _is_nonempty_str(node_id) or not _is_nonempty_str(cause) or not _is_nonempty_str(consequence):
            raise InvariantViolation(f"HAZOP_INVALID_DEVIATION: deviations[{index}] node_id, cause, and consequence must each be a non-empty string, got {_shallow_describe(deviation)}")
        if not isinstance(safeguard, str):
            raise InvariantViolation(f"HAZOP_INVALID_DEVIATION: deviations[{index}] safeguard must be a string (may be empty -- 'no safeguard exists yet' is a valid finding), got {_shallow_describe(safeguard)}")
        if node_id not in node_id_set:
            raise InvariantViolation(f"HAZOP_DEVIATION_UNKNOWN_NODE: deviations[{index}] node_id {node_id!r} does not reference any entry in nodes")
        if guide_word not in VALID_GUIDE_WORDS:
            raise InvariantViolation(f"HAZOP_INVALID_GUIDE_WORD: deviations[{index}] guide_word {guide_word!r} is not one of {sorted(VALID_GUIDE_WORDS)}")
        if "risk_rating" in deviation and not _is_number_excluding_bool(deviation["risk_rating"]):
            raise InvariantViolation(f"HAZOP_INVALID_RISK_RATING: deviations[{index}] risk_rating must be a real finite number (bool excluded), got {deviation['risk_rating']!r}")


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_hazop_study(
    record_id: str,
    nodes: list[dict[str, Any]],
    deviations: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/hazop-study.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then nodes (>=1,
    well-formed, unique), then deviations (closed guide-word vocabulary, referential integrity to nodes,
    non-empty cause/consequence, string safeguard, real finite numeric risk_rating if present). ``deviations``
    may be empty -- see module docstring point 3; this method deliberately does not require full
    node-x-guide-word coverage.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"HAZOP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"HAZOP_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"HAZOP_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    node_ids = _validate_nodes(nodes)
    _validate_deviations(deviations, node_ids)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        # dict(...) per element, not just list(...) on the outer list -- a shallow list() copy still shares the
        # caller's own nested dicts, same aliasing gap stakeholders.game_theory.py's own module docstring notes
        # (critic-found, 2026-09-11); every builder in this corpus that stores nested item dicts must rebuild
        # each element, not just the outer list.
        "nodes": [dict(node) for node in nodes],
        "deviations": [dict(deviation) for deviation in deviations],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_hazop_study -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
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


def evaluate_hazop_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_hazop_study``, so a hand-tampered record that bypassed the builder entirely (e.g. a
    dangling node_id or invalid guide_word spliced in after construction) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("hazop_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("hazop_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("hazop_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    # Record-level key-set check -- an added/removed top-level key must be caught by this gate too, not only by
    # JSON Schema (same discipline stakeholders.game_theory.py's own equivalent check establishes). unknown vs
    # missing are checked against different sets: unknown_keys against the full stored set (an ADDED key is
    # always wrong); missing_keys against the required set minus generated_by_method (schema-level default,
    # never populated by a validator).
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "hazop_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    node_ids: list[str] = []
    try:
        node_ids = _validate_nodes(record.get("nodes"))
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        if node_ids:
            _validate_deviations(record.get("deviations"), node_ids)
        else:
            problems.append("deviations could not be checked: nodes failed validation")
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("hazop_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_hazop_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and ``stakeholders.game_theory``'s own identical "only emit
    gates for what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_hazop_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
