"""``research.reporting_guideline_checklist`` -- elicit a manuscript's content item-by-item against
an official academic reporting standard (e.g. SRQR).

Operator's EdD methodology-chapter workflow: draft each official checklist item's content via the
generic AI Gateway (``ai_lego/platform/ai_gateway/draft.py``, unchanged -- this method needs no
platform code), then edit field-by-field in the existing dashboard. GROUNDED ORIGINAL DESIGN, not in
the Method Atlas mother document; disclosed in the contract.

The guideline's official items live in exactly one place -- ``reference-data/reporting-guidelines.
reference.yaml`` under the read-only spec root (kept OUTSIDE ``specs/`` deliberately: ``SchemaContracts``
treats every ``$id``-bearing YAML under ``specs/`` as a JSON Schema resource, and this file is a plain
data catalog, not a schema) -- loaded lazily and cached (``draft.py``'s own ``_schema_index`` idiom),
never hardcoded here, so the wording stays independently auditable against its academic citation. Only
``SRQR`` is populated; a future guideline is a data-only addition to that catalog.

Real invariants (builder raises; gate re-derives from raw fields):
1. ``guideline_id`` must resolve in the reference catalog, and ``guideline_citation`` must match its
   citation verbatim.
2. ``items`` must cover EXACTLY the guideline's official ``item_id`` set (no missing, no extra, no
   duplicate), and each item's ``requirement_text`` must match the catalog's official wording
   verbatim (normalized) -- a caller (or an AI draft) cannot silently paraphrase the standard.
3. ``completion_percentage`` is never stored -- ``completeness_summary()`` recomputes it fresh from
   each item's own ``drafted_content`` (a ``TBD:`` prefix is this corpus's own AI-draft placeholder
   marker, ``ai_lego/platform/ai_gateway/draft.py``'s ``_SYSTEM`` prompt), ignoring the item's
   caller-supplied ``status`` label so a tampered/asserted status cannot inflate the reported
   completeness (same "recompute, never trust a stored claim" discipline as
   ``art_therapy.life_wheel``'s ``balance_gap``).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.domain.record_kit import (
    all_gates_pass,
    base_record,
    entries_problem,
    first_duplicate,
    integrity_gate,
    is_nonempty_str,
    is_one_of,
    normalize,
    provenance_required_gate,
    require,
    require_header,
)
from ai_lego.errors import InvariantViolation

METHOD_ID = "research.reporting_guideline_checklist"
RECORD_ID_PREFIX = "RPTCHK-"
_CATALOG_RELATIVE_PATH = "reference-data/reporting-guidelines.reference.yaml"
_PLACEHOLDER_PREFIX = "TBD:"

_ITEM_STATUSES = frozenset({"NOT_STARTED", "DRAFTED", "NOT_APPLICABLE"})
_ITEM_KEYS = frozenset({"item_id", "requirement_text", "drafted_content", "status"})
_ITEM_CHECKS = {
    "item_id": is_nonempty_str,
    "requirement_text": is_nonempty_str,
    "drafted_content": is_nonempty_str,
    "status": lambda v: is_one_of(v, _ITEM_STATUSES),
}

__all__ = [
    "METHOD_ID",
    "RECORD_ID_PREFIX",
    "generate_reporting_guideline_checklist",
    "evaluate_reporting_guideline_checklist_gates",
    "completeness_summary",
    "catalog_items",
    "catalog_citation",
    "build_checklist_brief",
    "all_gates_pass",
]


@lru_cache(maxsize=1)
def _catalog() -> dict[str, dict[str, Any]]:
    """``guideline_id -> {citation, items: {item_id: requirement_text}}``, read once per process from
    the spec root's own reference-data file."""
    path = resolve_spec_root() / _CATALOG_RELATIVE_PATH
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    catalog: dict[str, dict[str, Any]] = {}
    for guideline_id, entry in document["guidelines"].items():
        catalog[guideline_id] = {
            "citation": entry["citation"].strip(),
            "items": {item["item_id"]: item["requirement_text"].strip() for item in entry["items"]},
        }
    return catalog


def _guideline(guideline_id: Any) -> dict[str, Any] | None:
    if not isinstance(guideline_id, str):
        return None
    return _catalog().get(guideline_id)


def _require_guideline(guideline_id: str) -> dict[str, Any]:
    guideline = _guideline(guideline_id)
    if guideline is None:
        raise InvariantViolation(f"RPTCHK_UNKNOWN_GUIDELINE: no reference catalog entry for guideline_id {guideline_id!r}")
    return guideline


def catalog_items(guideline_id: str) -> list[dict[str, str]]:
    """Public, read-only view of one guideline's official items, in the reference catalog's own
    order: ``[{item_id, requirement_text}, ...]``. Named distinctly from the builder's own ``items``
    parameter and used by the CLI slice fixture and by ``build_checklist_brief``."""
    guideline = _require_guideline(guideline_id)
    return [{"item_id": item_id, "requirement_text": text} for item_id, text in guideline["items"].items()]


def catalog_citation(guideline_id: str) -> str:
    """Named distinctly from the builder's own ``guideline_citation`` parameter -- see ``catalog_items``."""
    return _require_guideline(guideline_id)["citation"]


def _is_placeholder(value: Any) -> bool:
    return isinstance(value, str) and value.strip().upper().startswith(_PLACEHOLDER_PREFIX)


def _items_problem(guideline_id: str, canonical_items: dict[str, str], items: Any) -> str | None:
    """The single definition of "is this a well-shaped, catalog-conformant items list" -- shared by
    the builder and the gate, so the gate can never be laxer than construction."""
    problem = entries_problem(items, _ITEM_KEYS, _ITEM_KEYS, _ITEM_CHECKS, min_items=len(canonical_items))
    if problem is not None:
        return f"items {problem}"
    duplicate = first_duplicate(item["item_id"] for item in items)
    if duplicate is not None:
        return f"duplicate item_id {duplicate!r}"
    ids = {item["item_id"] for item in items}
    missing = set(canonical_items) - ids
    if missing:
        return f"missing required item_id(s) {sorted(missing)} for guideline {guideline_id!r}"
    extra = ids - set(canonical_items)
    if extra:
        return f"unknown item_id(s) {sorted(extra)} for guideline {guideline_id!r}"
    for item in items:
        if normalize(item["requirement_text"]) != normalize(canonical_items[item["item_id"]]):
            return f"requirement_text for {item['item_id']!r} does not match the official {guideline_id} wording"
    return None


def generate_reporting_guideline_checklist(
    record_id: str,
    guideline_id: str,
    guideline_citation: str,
    items: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    require_header("RPTCHK", record_id, RECORD_ID_PREFIX, version, provenance)
    guideline = _guideline(guideline_id)
    require(guideline is not None, "RPTCHK_UNKNOWN_GUIDELINE", f"no reference catalog entry for guideline_id {guideline_id!r}")
    require(
        is_nonempty_str(guideline_citation) and normalize(guideline_citation) == normalize(guideline["citation"]),
        "RPTCHK_CITATION_MISMATCH",
        f"guideline_citation must match the reference catalog citation for {guideline_id!r}",
    )
    problem = _items_problem(guideline_id, guideline["items"], items)
    require(problem is None, "RPTCHK_INVALID_ITEMS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, guideline_id=guideline_id, guideline_citation=guideline_citation, items=items)


def completeness_summary(record: dict[str, Any]) -> dict[str, Any]:
    """Derived view, recomputed every call: an item counts as complete when its ``drafted_content``
    is not a ``TBD:`` placeholder, regardless of its own ``status`` label (never trust a stored or
    asserted claim)."""
    items = record["items"]
    total = len(items)
    placeholder = sum(1 for item in items if _is_placeholder(item["drafted_content"]))
    complete = total - placeholder
    return {
        "guideline_id": record["guideline_id"],
        "total_items": total,
        "complete_items": complete,
        "placeholder_items": placeholder,
        "completion_percentage": round(100 * complete / total, 1) if total else 0.0,
    }


def _record_problem(record: dict[str, Any]) -> str | None:
    guideline_id = record.get("guideline_id")
    guideline = _guideline(guideline_id)
    if guideline is None:
        return f"guideline_id {guideline_id!r} has no reference catalog entry"
    if normalize(str(record.get("guideline_citation") or "")) != normalize(guideline["citation"]):
        return "guideline_citation does not match the reference catalog citation"
    return _items_problem(guideline_id, guideline["items"], record.get("items"))


def evaluate_reporting_guideline_checklist_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("reporting_guideline_checklist_integrity", record, RECORD_ID_PREFIX, _record_problem, completeness_summary, validator, timestamp),
    ]


def build_checklist_brief(guideline_id: str, research_facts: str) -> str:
    """Compose the ``brief`` string for ``POST /ai/draft/method/{METHOD_ID}``
    (``ai_lego.platform.ai_gateway.draft.draft_method_kwargs``): the guideline's own official item
    wording (so the model transcribes it rather than recalling a checklist from training data --
    the builder+gate round trip then verifies the transcription is exact), the caller's research
    facts, and an explicit anti-fabrication instruction reusing this corpus's own ``TBD:`` placeholder
    convention (``ai_lego/platform/ai_gateway/draft.py``'s ``_SYSTEM`` prompt)."""
    if not is_nonempty_str(research_facts):
        raise InvariantViolation("RPTCHK_BRIEF_RESEARCH_FACTS_REQUIRED: research_facts must be a non-empty string")
    citation = catalog_citation(guideline_id)
    items = catalog_items(guideline_id)
    lines = [
        f"Draft a {guideline_id} reporting-guideline checklist record for the study described below.",
        f"guideline_citation must be exactly: {citation}",
        f"items must cover EXACTLY these {len(items)} item_id values, each with requirement_text copied VERBATIM "
        "(do not paraphrase; it is checked against the official wording):",
    ]
    lines.extend(f"- {item['item_id']}: {item['requirement_text']}" for item in items)
    lines.append(
        "For each item, write drafted_content addressing that requirement using ONLY the research facts below. "
        "If the facts do not cover an item, set drafted_content to 'TBD: <what is missing>' and status to "
        "'NOT_STARTED' rather than inventing study details. Set status to 'NOT_APPLICABLE' (with a one-sentence "
        "justification as drafted_content) only when the item genuinely does not apply to this study design; "
        "otherwise set status to 'DRAFTED'."
    )
    lines.append("RESEARCH FACTS:\n" + research_facts.strip())
    return "\n".join(lines)
