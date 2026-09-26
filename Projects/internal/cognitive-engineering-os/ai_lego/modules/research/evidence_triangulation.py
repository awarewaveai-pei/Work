"""Offline literature and evidence triangulation adapters for the first Research slice.

The adapters are deliberately deterministic and read-only.  The literature
corpus is a fixture, not a claim about current scholarship; its stale status
is part of the returned value so a downstream workflow cannot silently treat
it as a fresh search result.
"""

from __future__ import annotations

from typing import Any, Callable

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation


OFFLINE_SOURCE_STALE = "OFFLINE_SOURCE_STALE"
NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"
# source_kind values a triangulation may cross-reference: the offline synthetic corpus, and
# (since RESEARCH_LINES_MASTER_PLAN WC-P2-07a) a run's own Project Sources. Still no
# network-backed literature provider (see recipe_runtime.py's build_registered_capability_adapters
# docstring) -- PROJECT_SOURCE items come from the Project's already-collected Source table, not a
# live call this adapter makes itself.
_CITABLE_SOURCE_KINDS = frozenset({"SYNTHETIC_FIXTURE", "PROJECT_SOURCE"})

_FIXTURE_LITERATURE = (
    {
        "literature_id": "LIT-FIXTURE-001",
        "title": "Synthetic study of after-hours work boundaries",
        "citation": "SYNTHETIC-FIXTURE-001",
        "keywords": ("after-hours", "boundary", "remote"),
    },
    {
        "literature_id": "LIT-FIXTURE-002",
        "title": "Synthetic study of emotional exhaustion in distributed work",
        "citation": "SYNTHETIC-FIXTURE-002",
        "keywords": ("exhaustion", "remote", "work"),
    },
)


def offline_literature_search(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Return a provenance-bearing local corpus result, never a fresh-search claim."""
    question = payload.get("research.question")
    if not isinstance(question, str) or not question.strip():
        raise InvariantViolation("LITERATURE_SEARCH_QUESTION_REQUIRED")
    return {
        "literature": {
            "set_id": "LITERATURE-SET-SYNTHETIC-001",
            "query": question,
            "items": [
                {
                    "literature_id": item["literature_id"],
                    "title": item["title"],
                    "citation": item["citation"],
                    "source_kind": "SYNTHETIC_FIXTURE",
                    "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
                }
                for item in _FIXTURE_LITERATURE
            ],
            "retrieval": {
                "mode": "OFFLINE_LOCAL_CORPUS",
                "status_code": OFFLINE_SOURCE_STALE,
                "side_state": NEEDS_HUMAN_REVIEW,
                "freshness_claim": "NOT_CLAIMED",
                "corpus_snapshot": "synthetic-fixture-v1",
            },
        }
    }


def _project_source_citation(source: dict[str, Any]) -> str:
    """Every LiteratureSet item MUST be citable (literature_search.capability.yaml:150-152).
    A Project Source may lack both URLs (e.g. an uploaded PDF); fall back through DOI and
    finally the manifest id vocabulary (``source:<source_id>``, plan P-K2) rather than emit
    ``None``."""
    return (
        source.get("canonical_url")
        or source.get("source_uri")
        or (f"doi:{source['doi']}" if source.get("doi") else None)
        or f"source:{source['source_id']}"
    )


def project_literature_search(project_sources: list[dict[str, Any]]) -> Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]:
    """Adapter factory: ``literature_search`` backed by one Project's own academic Sources
    (RESEARCH_LINES_MASTER_PLAN WC-P2-07a, P-K9) instead of the offline synthetic fixture.

    Only active, ``source_class=academic`` Sources are citable. Fails closed at build time,
    not silently: a Project with zero such Sources never falls back to fixture literature it
    never asked for -- the caller passed ``project_sources`` because this run has a real
    Project, so an empty result set is a caller error, not a reason to substitute a fixture.
    """
    academic_sources = [
        source
        for source in project_sources
        if source.get("status") == "active" and source.get("source_class") == "academic"
    ]
    if not academic_sources:
        raise InvariantViolation("LITERATURE_NO_PROJECT_SOURCES")
    fetched_ats = sorted(source["fetched_at"] for source in academic_sources if source.get("fetched_at"))
    freshness_claim = fetched_ats[0] if fetched_ats else "NOT_CLAIMED"

    def adapter(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        question = payload.get("research.question")
        if not isinstance(question, str) or not question.strip():
            raise InvariantViolation("LITERATURE_SEARCH_QUESTION_REQUIRED")
        return {
            "literature": {
                "set_id": "LITERATURE-SET-PROJECT-SOURCES",
                "query": question,
                "items": [
                    {
                        "literature_id": source["source_id"],
                        "title": source["title"],
                        "citation": _project_source_citation(source),
                        "source_kind": "PROJECT_SOURCE",
                        "fetched_at": source.get("fetched_at"),
                        "content_sha256": source["content_sha256"],
                        "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
                    }
                    for source in academic_sources
                ],
                "retrieval": {
                    "mode": "PROJECT_SOURCES",
                    # A Project Source is a previously-collected, fetched snapshot, not a live
                    # search result -- same OFFLINE_SOURCE_STALE/NEEDS_HUMAN_REVIEW obligation as the
                    # synthetic fixture (literature_search.capability.yaml#/offline_behaviour); `mode`
                    # above is the distinguisher, not the status code (critic finding A-m1, 2026-09-26).
                    "status_code": OFFLINE_SOURCE_STALE,
                    "side_state": NEEDS_HUMAN_REVIEW,
                    "freshness_claim": freshness_claim,
                    "corpus_snapshot": "project-sources",
                },
            }
        }

    return adapter


def triangulate_themes_and_literature(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Cross-reference theme labels with citable literature items.

    A fixture or stale corpus never produces a publication-ready conclusion;
    every finding stays explicitly pending human review.
    """
    themes = payload.get("outputs.coding", {}).get("coding_outputs", {}).get("theme_set", {}).get("themes")
    literature = payload.get("outputs.literature", {}).get("literature")
    if not isinstance(themes, list) or not themes:
        raise InvariantViolation("TRIANGULATION_THEMES_REQUIRED")
    if payload.get("outputs.literature", {}).get("status") == "NOT_INVOKED":
        return {
            "triangulation": {
                "findings": [],
                "source_count": 1,
                "status": NEEDS_HUMAN_REVIEW,
                "offline_status_code": "CAPABILITY_NOT_RESOLVED",
                "provenance_complete": False,
                "reason": "literature capability was unavailable; no literature claim is made",
            }
        }
    if not isinstance(literature, dict) or not isinstance(literature.get("items"), list) or not literature["items"]:
        raise InvariantViolation("TRIANGULATION_LITERATURE_REQUIRED")

    findings = []
    for theme in themes:
        label = str(theme.get("label", theme.get("theme_id", ""))).strip()
        if not label:
            raise InvariantViolation("TRIANGULATION_THEME_LABEL_REQUIRED")
        # Any citable fixture item is a candidate cross-reference; validation_status stays
        # NEEDS_HUMAN_REVIEW regardless -- the human, not the adapter, decides.
        related = [item["literature_id"] for item in literature["items"] if item.get("source_kind") in _CITABLE_SOURCE_KINDS]
        retrieval_mode = literature.get("retrieval", {}).get("mode")
        if retrieval_mode == "PROJECT_SOURCES":
            reason = "collected project Sources, not verified for publication; no publication claim is made"
        elif retrieval_mode == "ONLINE_PROVIDER":
            reason = "provider results are unverified citations (no retraction/citation check yet); no publication claim is made"
        else:
            reason = "local synthetic corpus is stale/unverified; no publication claim is made"
        findings.append(
            {
                "finding_id": f"TRIANGULATED-{theme.get('theme_id', label)}",
                "theme_id": theme.get("theme_id"),
                "theme_label": label,
                "literature_refs": related,
                "validation_status": NEEDS_HUMAN_REVIEW,
                "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
                "reason": reason,
            }
        )
    return {
        "triangulation": {
            "findings": findings,
            "source_count": 2,
            "status": NEEDS_HUMAN_REVIEW,
            "offline_status_code": literature["retrieval"]["status_code"],
            "provenance_complete": all(item.get("provenance") for item in literature["items"]),
        }
    }
