"""``research.citation_verification`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_citation_verification_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.citation_verification import METHOD_ID, all_gates_pass, evaluate_citation_verification_gates, generate_citation_verification

SCHEMA = "ai-lego://specs/cognitive/typed-objects/citation-verification-record.schema.yaml"
P = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _literature() -> dict[str, Any]:
    return {
        "set_id": "LITERATURE-SET-DEMO-001",
        "query": "arts-based inquiry doctoral education",
        "items": [
            {"literature_id": "W1", "title": "A well-formed source", "doi": "10.1000/example.1", "authors": ["A. Author"], "publication_year": 2021, "venue": "Journal of Education Research"},
            {"literature_id": "W2", "title": "A source missing its DOI", "doi": None, "authors": ["B. Writer"], "publication_year": 2019, "venue": None},
        ],
    }


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    return ("CITVER-2026-09-17-001", _literature(), P), {}


def refuse() -> Any:
    """A literature set with no items at all."""
    return generate_citation_verification("CITVER-BAD-001", {"set_id": "EMPTY", "items": []}, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["summary"]["structurally_complete"] = record["summary"]["total"]  # claim everything passed
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_citation_verification,
    gates=evaluate_citation_verification_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="citation_verification",
    summary=lambda r: f"{r['summary']['structurally_complete']}/{r['summary']['total']} structurally complete,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
