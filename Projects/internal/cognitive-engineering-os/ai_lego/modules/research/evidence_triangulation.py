"""Offline literature and evidence triangulation adapters for the first Research slice.

The adapters are deliberately deterministic and read-only.  The literature
corpus is a fixture, not a claim about current scholarship; its stale status
is part of the returned value so a downstream workflow cannot silently treat
it as a fresh search result.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation


OFFLINE_SOURCE_STALE = "OFFLINE_SOURCE_STALE"
NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"

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


def triangulate_themes_and_literature(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Cross-reference theme labels with citable literature items.

    A fixture or stale corpus never produces a publication-ready conclusion;
    every finding stays explicitly pending human review.
    """
    themes = payload.get("outputs.coding", {}).get("coding_outputs", {}).get("theme_set", {}).get("themes")
    literature = payload.get("outputs.literature", {}).get("literature")
    if not isinstance(themes, list) or not themes:
        raise InvariantViolation("TRIANGULATION_THEMES_REQUIRED")
    if not isinstance(literature, dict) or not isinstance(literature.get("items"), list) or not literature["items"]:
        raise InvariantViolation("TRIANGULATION_LITERATURE_REQUIRED")

    findings = []
    for theme in themes:
        label = str(theme.get("label", theme.get("theme_id", ""))).strip()
        if not label:
            raise InvariantViolation("TRIANGULATION_THEME_LABEL_REQUIRED")
        related = [item["literature_id"] for item in literature["items"] if item.get("source_kind") == "SYNTHETIC_FIXTURE"]
        findings.append(
            {
                "finding_id": f"TRIANGULATED-{theme.get('theme_id', label)}",
                "theme_id": theme.get("theme_id"),
                "theme_label": label,
                "literature_refs": related,
                "validation_status": NEEDS_HUMAN_REVIEW,
                "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
                "reason": "local synthetic corpus is stale/unverified; no publication claim is made",
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
