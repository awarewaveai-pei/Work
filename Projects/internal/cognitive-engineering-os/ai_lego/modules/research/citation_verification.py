"""``research.citation_verification`` -- Master Plan §42 Research Integrity Engine, FIRST sub-capability only
("Citation Verification"), structural scope.

MP §42 (L2028-2050) lists eight sub-capabilities: Citation Verification, Evidence Strength, Retraction Check,
Contradiction Detection, Data Provenance, Methodology Check, Statistical Validation, Reproducibility Package.
This method builds ONLY the first, and only its STRUCTURAL half: for each item in a ``literature`` set (the
object ``literature_search`` emits -- ``ai_lego/modules/research/literature_providers.py``), it checks that the
citation metadata a reader would need is present and well-formed (DOI format, non-empty authors, a plausible
publication year, a non-empty title). It does NOT check whether the DOI actually resolves, whether the paper
was retracted, or whether its claims contradict other sources -- those are Retraction Check / Contradiction
Detection, separate, unbuilt sub-capabilities that would need a new external data source (a retraction
database) and are explicitly out of scope here (see ``scope: STRUCTURAL_ONLY`` on every record this emits).

This is GENUINE_COMPUTE, the same idiom as ``feasibility.npv``: the builder has no ``checks``/``summary``
parameter at all -- both are computed from the caller's own ``literature`` items, and the gate re-derives them
fresh from the record's own stored ``literature_items`` projection, never trusting the stored ``checks``.

Traps for future readers:
- ``venue`` missing is a soft issue (preprints and working papers legitimately lack one) -- it appears in
  ``issues`` but never flips ``structurally_complete`` to ``False``. Every other issue is hard.
- The record stores a LEAN projection of each item (id/title/doi/authors/year/venue), not the full literature
  item (abstract, cited_by_count, etc. are dropped) -- keeps the record small and is exactly the fields the
  gate needs to re-derive ``checks`` from scratch.
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, first_duplicate, integrity_gate, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "research.citation_verification"
RECORD_ID_PREFIX = "CITVER-"

_DOI_PATTERN = re.compile(r"^10\.\d{4,9}/\S+$")
_MIN_YEAR = 1400  # a floor that catches garbage (e.g. 0, negative years), not a real historical claim
_MAX_YEAR = 2100  # a generous static ceiling; avoids importing a wall-clock "now" into a pure, deterministic function

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_citation_verification", "evaluate_citation_verification_gates", "all_gates_pass"]


def _item_projection(item: Any) -> dict[str, Any]:
    """The lean fields this method actually checks -- never the full literature item (abstract dropped, etc.)."""
    if not isinstance(item, dict):
        return {"literature_id": None, "title": None, "doi": None, "authors": None, "publication_year": None, "venue": None}
    return {
        "literature_id": item.get("literature_id"),
        "title": item.get("title"),
        "doi": item.get("doi"),
        "authors": item.get("authors"),
        "publication_year": item.get("publication_year"),
        "venue": item.get("venue"),
    }


def _verify_item(item: Any) -> dict[str, Any]:
    """Pure structural check on one projected item. Never raises -- an item shaped wrong is reported as issues,
    not a crash (the gate calls this on caller-controlled, potentially-tampered stored data)."""
    if not isinstance(item, dict):
        return {"literature_id": None, "structurally_complete": False, "doi_format_valid": None, "issues": ["ITEM_NOT_AN_OBJECT"]}
    issues: list[str] = []
    literature_id = item.get("literature_id")
    if not is_nonempty_str(literature_id):
        issues.append("MISSING_LITERATURE_ID")
        literature_id = None
    if not is_nonempty_str(item.get("title")):
        issues.append("MISSING_TITLE")
    doi = item.get("doi")
    if doi is None or (isinstance(doi, str) and not doi.strip()):
        doi_format_valid: bool | None = None
        issues.append("MISSING_DOI")
    elif not isinstance(doi, str) or _DOI_PATTERN.fullmatch(doi.strip()) is None:
        doi_format_valid = False
        issues.append("DOI_FORMAT_INVALID")
    else:
        doi_format_valid = True
    authors = item.get("authors")
    if not isinstance(authors, list) or not authors or not all(is_nonempty_str(a) for a in authors):
        issues.append("MISSING_AUTHORS")
    year = item.get("publication_year")
    if not isinstance(year, int) or isinstance(year, bool) or not (_MIN_YEAR <= year <= _MAX_YEAR):
        issues.append("MISSING_OR_IMPLAUSIBLE_YEAR")
    if not is_nonempty_str(item.get("venue")):
        issues.append("MISSING_VENUE")  # soft: never a hard failure
    hard_issues = [code for code in issues if code != "MISSING_VENUE"]
    return {
        "literature_id": literature_id,
        "structurally_complete": not hard_issues,
        "doi_format_valid": doi_format_valid,
        "issues": issues,
    }


def _summarize(checks: list[dict[str, Any]]) -> dict[str, int]:
    complete = sum(1 for c in checks if c["structurally_complete"])
    return {"total": len(checks), "structurally_complete": complete, "with_issues": len(checks) - complete}


def _literature_problem(literature: Any) -> str | None:
    if not isinstance(literature, dict):
        return "literature is not a dict"
    if not is_nonempty_str(literature.get("set_id")):
        return "literature.set_id missing or empty"
    items = literature.get("items")
    if not isinstance(items, list) or not items:
        return "literature.items must be a non-empty list"
    return None


def generate_citation_verification(record_id: str, literature: dict[str, Any], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("CITVER", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _literature_problem(literature)
    require(problem is None, "CITVER_INVALID_LITERATURE", problem or "")
    projected = [_item_projection(item) for item in literature["items"]]
    checks = [_verify_item(item) for item in projected]
    duplicate = first_duplicate(c["literature_id"] for c in checks if c["literature_id"] is not None)
    require(duplicate is None, "CITVER_DUPLICATE_LITERATURE_ID", f"literature_id {duplicate!r} appears more than once")
    return base_record(
        record_id,
        version,
        generated_by_method,
        provenance,
        literature_set_id=literature["set_id"],
        literature_items=projected,
        checks=checks,
        summary=_summarize(checks),
        scope="STRUCTURAL_ONLY",
    )


def _core_problem_from_record(record: dict[str, Any]) -> str | None:
    """Re-derive ``checks`` and ``summary`` from the record's OWN stored ``literature_items`` (never trusting the
    stored ``checks``/``summary``), and require exact agreement -- the same tamper-detection idiom as
    ``feasibility.npv``'s gate recomputing ``npv`` from stored ``cash_flows``."""
    items = record.get("literature_items")
    if not isinstance(items, list) or not items:
        return "literature_items missing or empty"
    stored_checks = record.get("checks")
    if not isinstance(stored_checks, list) or len(stored_checks) != len(items):
        return "checks missing or does not match literature_items length"
    recomputed = [_verify_item(item) for item in items]
    if recomputed != stored_checks:
        return "checks do not match a fresh re-derivation from literature_items"
    if record.get("summary") != _summarize(recomputed):
        return "summary does not match a fresh re-derivation from checks"
    if record.get("scope") != "STRUCTURAL_ONLY":
        return "scope must be STRUCTURAL_ONLY (this method performs no retraction/contradiction check)"
    return None


def evaluate_citation_verification_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate(
            "citation_verification_integrity",
            record,
            RECORD_ID_PREFIX,
            _core_problem_from_record,
            lambda r: dict(r["summary"]),
            validator,
            timestamp,
        ),
    ]
