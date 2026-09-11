"""``systems.stock_and_flow`` -- F09 systems thinking family (Atlas L541-559), second member this batch.

Atlas F09 tool table (L546, verbatim sense): "Stock & Flow｜建模累積量與流量｜stocks→in/out flows→rates→
equations｜可進入動態模擬" (model accumulations and flows: stocks -> in/out flows -> rates -> equations -> can
enter dynamic simulation).

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag), same discipline ``stakeholders.game_theory``'s own module already established:

1. **Every flow references a real declared stock** (``SNF_FLOW_UNKNOWN_STOCK``): ``flows[].target_stock_id`` must
   resolve to a real ``stocks[]`` id -- a dangling reference is refused, same ``edges->nodes`` referential-
   integrity pattern ``causal.dag`` already established for a different graph-shaped method.
2. **Every stock has at least one associated flow** (``SNF_STOCK_WITHOUT_FLOW``): Atlas's own ``stocks->in/out
   flows`` sequence (L546) names flows as what makes a stock a stock-and-flow MODEL element at all -- a declared
   stock nothing ever flows into or out of is refused, not silently accepted as a placeholder.
3. **Every stock's initial_value is a genuine finite number** (``SNF_INVALID_INITIAL_VALUE``): ``bool`` excluded
   (Python's ``bool`` is an ``int`` subclass -- the same trap ``stakeholders.game_theory``'s own
   ``_is_number_excluding_bool`` guards), and a ``float`` NaN/+-inf is excluded via ``math.isfinite`` -- but an
   ``int`` is NOT passed through ``math.isfinite`` (Python ints are arbitrary-precision and never inf/nan; a huge
   ``int`` makes ``math.isfinite`` itself raise ``OverflowError`` on implicit float conversion, the exact crash
   class a second critic pass already found and fixed in ``stakeholders.game_theory``/``challenge.stress_testing``/
   ``challenge.hazop`` -- applied here proactively, not found after the fact).

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "stock and flow"/"stock_and_flow"/"SNF-" before writing any of this method's own
files: zero pre-existing implementation, zero contract-backlog entry (method-inventory.yaml's own F09 row for
this method is a ``contract_status: pending`` placeholder, not a real prior definition).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.stock_and_flow"
RECORD_ID_PREFIX = "SNF-"
VALID_DIRECTIONS = frozenset({"IN", "OUT"})
_STOCK_KEYS = frozenset({"id", "name", "initial_value"})
_FLOW_KEYS = frozenset({"id", "name", "direction", "target_stock_id", "rate_description"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "stocks", "flows", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number_excluding_bool(value: Any) -> bool:
    """Same idiom every prior module in this corpus that checks a numeric field already uses (``stakeholders.
    game_theory``/``challenge.stress_testing``/``challenge.hazop``): ``bool`` excluded (int subclass trap), plain
    ``int`` unconditionally accepted (arbitrary precision, never inf/nan, and NOT passed through
    ``math.isfinite`` -- a huge int would make that call itself raise ``OverflowError``), only ``float`` needs
    the NaN/+-inf check."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


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


def stock(stock_id: str, name: str, initial_value: float) -> dict[str, Any]:
    """One item of ``typed-objects/stock-and-flow-model.schema.yaml#/properties/stocks``."""
    if not _is_finite_number_excluding_bool(initial_value):
        raise InvariantViolation(f"SNF_INVALID_INITIAL_VALUE: initial_value must be a finite real number (bool excluded), got {initial_value!r}")
    return {"id": stock_id, "name": name, "initial_value": initial_value}


def flow(flow_id: str, name: str, direction: str, target_stock_id: str, rate_description: str) -> dict[str, Any]:
    """One item of ``typed-objects/stock-and-flow-model.schema.yaml#/properties/flows``."""
    if direction not in VALID_DIRECTIONS:
        raise InvariantViolation(f"SNF_INVALID_DIRECTION: {direction!r} is not one of {sorted(VALID_DIRECTIONS)} (Atlas L546's own in/out vocabulary)")
    return {"id": flow_id, "name": name, "direction": direction, "target_stock_id": target_stock_id, "rate_description": rate_description}


# --------------------------------------------------------------------------
# Structural validators -- shared by the builder and the gate's own independent re-derivation.
# --------------------------------------------------------------------------


def _validate_stocks(stocks: Any) -> list[str]:
    """Returns the list of valid stock ids, or raises. Never returns a partial/best-effort result."""
    if not isinstance(stocks, list) or not stocks:
        raise InvariantViolation(f"SNF_INVALID_STOCKS: stocks must be a non-empty list, got {_shallow_describe(stocks)}")
    ids: list[str] = []
    for index, s in enumerate(stocks):
        if not isinstance(s, dict) or set(s.keys()) - _STOCK_KEYS or not _STOCK_KEYS <= s.keys():
            raise InvariantViolation(f"SNF_INVALID_STOCK: stocks[{index}] must be a dict with exactly keys {sorted(_STOCK_KEYS)}, got {_shallow_describe(s)}")
        if not _is_nonempty_str(s.get("id")) or not _is_nonempty_str(s.get("name")):
            raise InvariantViolation(f"SNF_INVALID_STOCK: stocks[{index}] id and name must each be a non-empty string, got {_shallow_describe(s)}")
        if not _is_finite_number_excluding_bool(s.get("initial_value")):
            raise InvariantViolation(f"SNF_INVALID_INITIAL_VALUE: stocks[{index}] initial_value must be a finite real number (bool excluded), got {s.get('initial_value')!r}")
        ids.append(s["id"])
    duplicates = {sid for sid in ids if ids.count(sid) > 1}
    if duplicates:
        raise InvariantViolation(f"SNF_DUPLICATE_STOCK_ID: stock id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_flows(flows: Any, stock_ids: list[str]) -> list[str]:
    """Returns the list of valid flow ids, or raises. Checks every flow references a real stock, no duplicate
    flow id, and -- the real invariant this method exists to enforce -- every stock is touched by >=1 flow."""
    if not isinstance(flows, list) or not flows:
        raise InvariantViolation(f"SNF_INVALID_FLOWS: flows must be a non-empty list, got {_shallow_describe(flows)}")
    stock_id_set = set(stock_ids)
    ids: list[str] = []
    touched_stocks: set[str] = set()
    for index, f in enumerate(flows):
        if not isinstance(f, dict) or set(f.keys()) - _FLOW_KEYS or not _FLOW_KEYS <= f.keys():
            raise InvariantViolation(f"SNF_INVALID_FLOW: flows[{index}] must be a dict with exactly keys {sorted(_FLOW_KEYS)}, got {_shallow_describe(f)}")
        flow_id, name, direction, target_stock_id, rate_description = (
            f.get("id"), f.get("name"), f.get("direction"), f.get("target_stock_id"), f.get("rate_description")
        )
        if not _is_nonempty_str(flow_id) or not _is_nonempty_str(name) or not _is_nonempty_str(rate_description):
            raise InvariantViolation(f"SNF_INVALID_FLOW: flows[{index}] id, name, and rate_description must each be a non-empty string, got {_shallow_describe(f)}")
        if direction not in VALID_DIRECTIONS:
            raise InvariantViolation(f"SNF_INVALID_DIRECTION: flows[{index}] direction {direction!r} is not one of {sorted(VALID_DIRECTIONS)}")
        if not _is_nonempty_str(target_stock_id):
            raise InvariantViolation(f"SNF_INVALID_FLOW: flows[{index}] target_stock_id must be a non-empty string, got {target_stock_id!r}")
        if target_stock_id not in stock_id_set:
            raise InvariantViolation(f"SNF_FLOW_UNKNOWN_STOCK: flows[{index}] target_stock_id {target_stock_id!r} does not reference any entry in stocks")
        ids.append(flow_id)
        touched_stocks.add(target_stock_id)
    duplicates = {fid for fid in ids if ids.count(fid) > 1}
    if duplicates:
        raise InvariantViolation(f"SNF_DUPLICATE_FLOW_ID: flow id(s) {sorted(duplicates)} appear more than once")
    untouched = stock_id_set - touched_stocks
    if untouched:
        raise InvariantViolation(
            f"SNF_STOCK_WITHOUT_FLOW: stock id(s) {sorted(untouched)} have no associated flow -- Atlas L546's own "
            f"'stocks->in/out flows' sequence means a stock nothing flows into or out of is not a modeled stock-and-flow element"
        )
    return ids


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_stock_and_flow_model(
    record_id: str,
    stocks: list[dict[str, Any]],
    flows: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stock-and-flow-model.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then stocks (non-empty,
    well-formed, unique, finite initial_value), then flows (non-empty, well-formed, valid direction, real stock
    reference, no duplicates, and -- the invariant this method exists to enforce -- every declared stock touched
    by at least one flow).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SNF_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SNF_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"SNF_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    stock_ids = _validate_stocks(stocks)
    _validate_flows(flows, stock_ids)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "stocks": [dict(s) for s in stocks],
        "flows": [dict(f) for f in flows],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_stock_and_flow_model -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
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


def evaluate_stock_flow_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_stock_and_flow_model``, so a hand-tampered record that bypassed the builder entirely
    (e.g. a stock spliced in post-hoc with no flow touching it) is caught here exactly as a builder-refused one
    would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("stock_flow_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("stock_flow_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("stock_flow_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    # Record-level key-set check: an added/removed top-level key is caught here directly, not only via schema
    # validation -- same discipline stakeholders.game_theory's own equivalent gate established (critic-found gap
    # there, applied here proactively).
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "stock_flow_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    stock_ids: list[str] = []
    try:
        stock_ids = _validate_stocks(record.get("stocks"))
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        if stock_ids:
            _validate_flows(record.get("flows"), stock_ids)
        else:
            problems.append("flows could not be checked: stocks failed validation")
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("stock_flow_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_stock_and_flow_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stock_flow_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
