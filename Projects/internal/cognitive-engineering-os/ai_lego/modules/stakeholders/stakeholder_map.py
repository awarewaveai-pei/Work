"""``stakeholders.stakeholder_map`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero
built methods before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` real implementation
existed at batch start; 1 of 10 concurrent agents opening every F07 member in this same parallel batch).

Atlas cites this method via the F07 tool table row (L487: "Stakeholder Map｜找所有影響與被影響者｜直接/間接/
受益/承擔風險者→關係圖｜防止只看決策者") and dedicated §11.14 (L1516-1544, a 16-item reference checklist of
stakeholder categories -- User, Buyer, Payer, ... Media, L1523-1540 -- explicitly scoped to "對大型全球計畫至
少要考慮", a reference list for large global projects, NOT a mandatory closed set every record must satisfy).

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored flag):

1. **Non-empty map** (``STKMAP_EMPTY_MAP``): ``stakeholders`` must be a non-empty list -- a stakeholder map
   naming zero stakeholders has not actually mapped anything (§11.14's own "完整列出" purpose).

2. **Per-entry shape** (``STKMAP_INVALID_ENTRY``): every entry needs a non-empty ``name``, a nullable-but-
   non-empty-if-present free-text ``category`` (same "empty string is not a legal disclosure" discipline every
   other nullable content field in this corpus uses -- e.g. ``insight.jtbd``'s own ``workaround``), and a
   non-empty ``relationship_types`` array drawn ONLY from the table row's own literal 4-word closed set
   (``DIRECT``/``INDIRECT``/``BENEFICIARY``/``RISK_BEARER``, L487's "直接/間接/受益/承擔風險者"), no duplicate
   value within one entry's own array.

3. **Whole-map relationship_types coverage** (``STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW``) -- THE real
   invariant this method exists to enforce, not a per-item shape check: the UNION of ``relationship_types``
   across every entry in the whole map must cover >=2 distinct values. A map where every single entry is
   tagged only ``DIRECT`` has structurally degenerated into "只看決策者" (only looking at decision-makers) --
   the exact failure mode §11.14's own 效益 names verbatim: "防止「只看客戶」或「只看老闆」" (prevent "only
   looking at the customer" or "only looking at the boss"). This is a machine-checkable proxy for that prose
   caution: a map cannot claim to have "completely listed" (完整列出) who influences, who is affected, who
   pays, who executes, and who bears risk (§11.14's own 用途 line) while every entry only answers ONE of those
   questions.

Record-level-only provenance (NOT per-entry) -- a deliberate BATCH-WIDE decision for this whole F07 build
(matching ``insight.jtbd``'s own F06-batch record-level placement and ``decomposition.functional_decomposition``'s
own record-level placement before it), made specifically to avoid the per-item/record-level ambiguity that hit
earlier batches (see their own WORKLOG entries). A StakeholderMap's entries are one coherent map of who is
involved in one decision, not a list of independently-sourced items each needing its own epistemic stamp.

``quality.evidence_labeling_required`` is ``false`` on the method contract, same reasoning every sibling
opening-member contract in this corpus discloses: this method takes no ``EvidenceSet`` input
(``inputs.required: []``), so the flag's own schema-scoped meaning ("claims from an EvidenceSet input") has
nothing to check.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"stakeholder_map"/"StakeholderMap"/"stakeholder-map" before writing any of this method's own files: zero
pre-existing implementation (only the pre-created, batch-wide ``ai_lego/modules/stakeholders/__init__.py``
placeholder, not touched here).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.stakeholder_map"
RECORD_ID_PREFIX = "STKMAP-"

DIRECT = "DIRECT"
INDIRECT = "INDIRECT"
BENEFICIARY = "BENEFICIARY"
RISK_BEARER = "RISK_BEARER"
VALID_RELATIONSHIP_TYPES: frozenset[str] = frozenset({DIRECT, INDIRECT, BENEFICIARY, RISK_BEARER})
# Table row L487's own literal 4-word closed set ("直接/間接/受益/承擔風險者") -- NOT Atlas §11.14's 16-item
# category checklist (that one is disclosed as free text, see module docstring and the schema's own
# compilation_decisions).

MIN_RELATIONSHIP_TYPE_COVERAGE = 2
# The real invariant's own threshold (module docstring, invariant #3): the whole map's relationship_types
# union must span at least this many distinct values out of the 4 legal ones.

_ENTRY_KEYS = frozenset({"name", "category", "relationship_types"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_null_or_nonempty_str(value: Any) -> bool:
    """``category``'s own shape: either None (no category assigned yet -- legitimate) or a non-empty string
    (an empty string is refused, same discipline every other nullable content field in this corpus uses)."""
    return value is None or _is_nonempty_str(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``bcg_matrix``/
    ``functional_decomposition``/``jtbd``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _relationship_types_is_valid(value: Any) -> bool:
    """Shape-only check for ONE entry's own ``relationship_types``: a non-empty list, every element a legal
    value from ``VALID_RELATIONSHIP_TYPES``, no duplicate value within this same list. Does NOT check
    whole-map coverage -- that is invariant #3's own job, computed separately once every entry's own list is
    already known to be individually well-shaped (see ``_relationship_type_coverage`` below)."""
    if not isinstance(value, list) or not value:
        return False
    if not all(isinstance(item, str) and item in VALID_RELATIONSHIP_TYPES for item in value):
        return False
    return len(set(value)) == len(value)


def _entry_is_valid(entry: Any) -> bool:
    """Shared shape predicate for ONE ``stakeholders[]`` entry -- called by BOTH the builder and the gate
    (there is no separate ``stored`` shape here, unlike ``strategy.bcg_matrix``'s own input-vs-stored split:
    a stakeholder entry carries no computed field, so its input shape and its stored shape are identical)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_KEYS:
        return False
    if not _is_nonempty_str(entry.get("name")):
        return False
    if not _is_null_or_nonempty_str(entry.get("category")):
        return False
    return _relationship_types_is_valid(entry.get("relationship_types"))


def _relationship_type_coverage(entries: list[dict[str, Any]]) -> set[str]:
    """PURE -- the union of every valid entry's own ``relationship_types``, across the whole map. Invariant
    #3 (module docstring) is BOTH the builder and the gate independently recomputing this same union and
    checking its cardinality; neither trusts a stored flag or the other's own prior computation. Callers must
    have already confirmed every entry is ``_entry_is_valid`` before relying on this for an integrity check
    (both call sites below do)."""
    coverage: set[str] = set()
    for entry in entries:
        coverage.update(entry["relationship_types"])
    return coverage


# --------------------------------------------------------------------------
# Convenience constructor -- eager, minimal validation, same discipline every prior module's own constructors
# (``portfolio_item``/``function_node``/``interface``) use. NOT the invariant boundary:
# ``generate_stakeholder_map`` validates whatever list of dicts it is handed regardless of how they were
# built (a raw hand-built dict is exercised the same way in the CLI slice/tests).
# --------------------------------------------------------------------------


def stakeholder_entry(name: str, relationship_types: list[str], *, category: str | None = None) -> dict[str, Any]:
    """One INPUT entry for ``generate_stakeholder_map``'s own ``stakeholders`` parameter."""
    if not _is_nonempty_str(name):
        raise InvariantViolation(f"STKMAP_EMPTY_NAME: name must be a non-empty string, got {name!r}")
    if not _is_null_or_nonempty_str(category):
        raise InvariantViolation(f"STKMAP_INVALID_CATEGORY: category must be None or a non-empty string, got {category!r}")
    if not _relationship_types_is_valid(relationship_types):
        raise InvariantViolation(
            f"STKMAP_INVALID_RELATIONSHIP_TYPES: relationship_types must be a non-empty list of unique values "
            f"from {sorted(VALID_RELATIONSHIP_TYPES)} (table row L487's own closed set), got {_shallow_describe(relationship_types)}"
        )
    return {"name": name, "category": category, "relationship_types": list(relationship_types)}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_stakeholder_map(
    record_id: str,
    stakeholders: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stakeholder-map.schema.yaml``.

    Enforces all 3 real invariants fail-closed, in order: id/version/provenance shape, invariant #1
    (non-empty map), invariant #2 (every entry individually well-shaped), THEN invariant #3 (whole-map
    relationship_types coverage -- computed from the already-validated entries' own raw fields, never from a
    stored flag). A StakeholderMap failing any one of these is refused at construction, never silently stored
    as a degenerate "only looked at one relationship dimension" map.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"STKMAP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"STKMAP_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"STKMAP_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(stakeholders, list) or not stakeholders:
        raise InvariantViolation(
            f"STKMAP_EMPTY_MAP: stakeholders must be a non-empty list (a stakeholder map with zero entries has "
            f"not actually mapped anything -- §11.14's own '完整列出' purpose), got {_shallow_describe(stakeholders)}"
        )
    if not all(_entry_is_valid(entry) for entry in stakeholders):
        raise InvariantViolation(
            f"STKMAP_INVALID_ENTRY: every stakeholders[] entry must have exactly the keys {sorted(_ENTRY_KEYS)}, "
            f"a non-empty name, category either None or a non-empty string, and relationship_types a non-empty "
            f"list of unique values from {sorted(VALID_RELATIONSHIP_TYPES)}, got {_shallow_describe(stakeholders)}"
        )

    coverage = _relationship_type_coverage(stakeholders)
    if len(coverage) < MIN_RELATIONSHIP_TYPE_COVERAGE:
        raise InvariantViolation(
            f"STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW: the whole map's relationship_types union is {sorted(coverage)} "
            f"(only {len(coverage)} distinct value(s)) -- at least {MIN_RELATIONSHIP_TYPE_COVERAGE} of "
            f"{sorted(VALID_RELATIONSHIP_TYPES)} must be covered across all entries combined, or the map has "
            f"degenerated into '只看決策者' (§11.14's own 效益: 防止「只看客戶」或「只看老闆」)"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "stakeholders": [{"name": entry["name"], "category": entry["category"], "relationship_types": list(entry["relationship_types"])} for entry in stakeholders],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive all 3 invariants from raw fields, fail-closed on malformed input. Never
# call generate_stakeholder_map -- a hand-tampered record that bypassed the builder entirely must be caught
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


def evaluate_stakeholder_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #1 and #2 from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_stakeholder_map``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("stakeholder_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("stakeholder_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("stakeholder_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    stakeholders = record.get("stakeholders")
    if not isinstance(stakeholders, list) or not stakeholders:
        return _result("stakeholder_map_integrity", False, [{"reason": "stakeholders missing, not a list, or empty"}], validator, timestamp)
    if not all(_entry_is_valid(entry) for entry in stakeholders):
        return _result("stakeholder_map_integrity", False, [{"reason": "stakeholders contains a malformed entry (missing/extra key, empty name, invalid category, or invalid relationship_types)"}], validator, timestamp)

    return _result("stakeholder_map_integrity", True, [{"entry_count": len(stakeholders)}], validator, timestamp)


def evaluate_relationship_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #3, THE real differentiator, re-derived independently: re-walks the record's OWN raw
    ``stakeholders`` entries to recompute the relationship_types union fresh (never trusts that
    ``evaluate_stakeholder_map_integrity_gate`` already ran, or that the builder ever ran at all) and checks
    its cardinality against ``MIN_RELATIONSHIP_TYPE_COVERAGE``. Requires entries to already be individually
    well-shaped (returns FAIL directly if not, rather than computing a coverage set over malformed data).
    Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("relationship_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)

    stakeholders = record.get("stakeholders")
    if not isinstance(stakeholders, list) or not stakeholders or not all(_entry_is_valid(entry) for entry in stakeholders):
        return _result("relationship_coverage", False, [{"reason": "stakeholders missing, not a list, empty, or contains a malformed entry -- cannot evaluate coverage"}], validator, timestamp)

    coverage = _relationship_type_coverage(stakeholders)
    passed = len(coverage) >= MIN_RELATIONSHIP_TYPE_COVERAGE
    return _result("relationship_coverage", passed, [{"relationship_types_covered": sorted(coverage), "distinct_count": len(coverage), "minimum_required": MIN_RELATIONSHIP_TYPE_COVERAGE}], validator, timestamp)


def evaluate_stakeholder_map_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of the contract's real gates, in catalog order: the one declared ``quality`` property, then both
    independent structural-and-coverage integrity re-derivations. No ``evidence_labeling_required`` gate --
    the contract sets that flag to ``false`` (see module docstring and ``insight.jtbd.contract.yaml``'s own
    identical "only emit gates for what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stakeholder_map_integrity_gate(record, validator, timestamp),
        evaluate_relationship_coverage_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
