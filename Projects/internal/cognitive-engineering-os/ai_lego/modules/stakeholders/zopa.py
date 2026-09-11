"""``stakeholders.zopa`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero built
methods before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` implementation existed at
batch start; 1 of 10 concurrent agents opening every F07 member in this same parallel batch, same pattern the
F06 insight family and the F03 batch already established).

Atlas cites this method TWICE: F07 tool table row (L493: "ZOPA｜找可成交區間｜reservation points→重疊範圍｜提高
談判效率") and dedicated §11.17 (L1583-1595), which gives the method's own literal diagram::

    Seller minimum ---------[ ZOPA ]--------- Buyer maximum

plus its explicit purpose statement (§11.17, verbatim): "找雙方 reservation point 是否有重疊" (find whether the
two parties' reservation points overlap). Grep-confirmed these are the only 2 real citations for this method
case-insensitively across the whole Atlas file (the one other hit, L4475, is a DIFFERENT method's own
quick-tool-selection table row naming ZOPA as a companion tool, not a second dedicated section here).

DUE-DILIGENCE against the pre-existing ``stakeholder.regulator.contract.yaml`` (read in full before writing
this module): that file is a LENS (LEGO dimension C, "Perspective"), validated against ``lens.schema.yaml``,
carrying a singular ``family: stakeholder``. This method is a METHOD (LEGO dimension A), validated against
``method.schema.yaml``, carrying the PLURAL ``family: stakeholders`` per this task's own mandated
``method_id``. Structurally different objects sharing an adjacent English word -- not a duplicate, not reused.

Real invariant, re-derived independently at both construction time and gate time (never trusting a stored
flag) -- the SAME invariant, split into its two component checks per this task's own framing:

1. **zopa_exists is decisively derived, never caller-supplied** (``ZOPA_INVALID_SELLER_MINIMUM`` /
   ``ZOPA_INVALID_BUYER_MAXIMUM`` at construction; re-derivation at the gate): ``seller_minimum`` and
   ``buyer_maximum`` must each be a finite real number (§11.17's own diagram names exactly these two
   reservation points as the method's whole input). ``zopa_exists`` is COMPUTED as
   ``seller_minimum <= buyer_maximum`` -- there is no constructor parameter for it, so a legitimately-built
   record cannot carry a contradictory value. This comparison IS the method's entire reason to exist (§11.17's
   own "找雙方 reservation point 是否有重疊" -- not a caution about misuse, but the literal definition of what
   this method computes).
2. **zopa_range is exactly [seller_minimum, buyer_maximum] when zopa_exists is true, else null**: also
   COMPUTED, also no constructor parameter. §11.17's own diagram shows the range's two bounds ARE the two
   reservation points, nothing else -- a range built from independently-authored numbers (even numerically
   equal ones) would misrepresent the method's own derivation as an independent fact.

Record-level-only provenance (NOT per-field) -- the same F06/F07-batch-wide decision ``insight.jtbd`` (read in
full before writing this module, this same batch's template) already establishes: two numbers and their
derived comparison are one coherent claim about one negotiation, not a list of independently-sourced items.

``quality.evidence_labeling_required`` is ``false`` on the method contract for the same reason ``insight.jtbd``
discloses: that flag's own schema definition (``method.schema.yaml``) scopes it to claims originating from an
``EvidenceSet`` INPUT, which this method does not take (``inputs.required: []``).

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "zopa" before writing any of this
method's own files: zero pre-existing METHOD implementation (only the unrelated Lens file discussed above).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.zopa"
RECORD_ID_PREFIX = "ZOPA-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Excludes ``bool`` deliberately -- Python's ``bool`` is an ``int`` subclass, so
    ``isinstance(True, int)`` is ``True``; without this exclusion ``seller_minimum=True`` would silently pass
    as ``1``, same discipline every numeric-field module in this codebase (``decision.ice``/``decision.wsjf``/
    ``root_cause.fault_tree`` etc.) already applies."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``insight.jtbd``/
    ``decision.pareto_frontier``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_zopa_analysis(
    record_id: str,
    seller_minimum: float,
    buyer_maximum: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/zopa.schema.yaml``.

    Enforces the real invariant fail-closed, in order: id/version/provenance shape, then seller_minimum/
    buyer_maximum finiteness. ``zopa_exists``/``zopa_range`` are ALWAYS computed here -- there is no
    parameter for either, so a caller cannot construct a contradictory record (e.g. ``zopa_exists=True`` with
    non-overlapping reservation points) even by accident.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ZOPA_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ZOPA_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"ZOPA_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _is_finite_number(seller_minimum):
        raise InvariantViolation(
            f"ZOPA_INVALID_SELLER_MINIMUM: seller_minimum must be a finite real number (§11.17's own 'Seller minimum' reservation point), got {seller_minimum!r}"
        )
    if not _is_finite_number(buyer_maximum):
        raise InvariantViolation(
            f"ZOPA_INVALID_BUYER_MAXIMUM: buyer_maximum must be a finite real number (§11.17's own 'Buyer maximum' reservation point), got {buyer_maximum!r}"
        )

    zopa_exists = seller_minimum <= buyer_maximum
    zopa_range: list[float] | None = [seller_minimum, buyer_maximum] if zopa_exists else None

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "seller_minimum": seller_minimum,
        "buyer_maximum": buyer_maximum,
        "zopa_exists": zopa_exists,
        "zopa_range": zopa_range,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive the real invariant from raw fields, fail-closed on malformed input. Never
# call generate_zopa_analysis -- a hand-tampered record that bypassed the builder entirely must be caught
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


def evaluate_zopa_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_zopa_analysis``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Checks id/version shape, seller_minimum/
    buyer_maximum finiteness, then independently recomputes ``zopa_exists`` and ``zopa_range`` and compares
    each against what the record actually stores. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("zopa_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("zopa_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("zopa_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    seller_minimum = record.get("seller_minimum")
    buyer_maximum = record.get("buyer_maximum")
    problems: list[str] = []
    if not _is_finite_number(seller_minimum):
        problems.append(f"seller_minimum must be a finite real number, got {_shallow_describe(seller_minimum)}")
    if not _is_finite_number(buyer_maximum):
        problems.append(f"buyer_maximum must be a finite real number, got {_shallow_describe(buyer_maximum)}")
    if problems:
        # Cannot meaningfully recompute zopa_exists/zopa_range without two real numbers -- stop here rather
        # than raising a Python TypeError from the comparison below.
        return _result("zopa_content_integrity", False, [{"problems": problems}], validator, timestamp)

    expected_exists = seller_minimum <= buyer_maximum
    stored_exists = record.get("zopa_exists")
    if not isinstance(stored_exists, bool):
        problems.append(f"zopa_exists must be a boolean, got {_shallow_describe(stored_exists)}")
    elif stored_exists != expected_exists:
        problems.append(f"zopa_exists={stored_exists} does not match recomputed (seller_minimum <= buyer_maximum)={expected_exists}")

    expected_range: list[float] | None = [seller_minimum, buyer_maximum] if expected_exists else None
    stored_range = record.get("zopa_range")
    if expected_range is None:
        if stored_range is not None:
            problems.append(f"zopa_range must be null when zopa_exists is false, got {_shallow_describe(stored_range)}")
    else:
        shape_ok = isinstance(stored_range, list) and len(stored_range) == 2 and all(_is_finite_number(x) for x in stored_range)
        if not shape_ok or list(stored_range) != expected_range:
            problems.append(f"zopa_range must be exactly [seller_minimum, buyer_maximum]={expected_range}, got {_shallow_describe(stored_range)}")

    return _result("zopa_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_zopa_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_zopa_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
