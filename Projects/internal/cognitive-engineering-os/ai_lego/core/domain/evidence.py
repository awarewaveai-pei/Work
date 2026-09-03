"""Source / Evidence / sentence-level provenance records (Shared Kernel nouns, Master Plan §13.1).

Shapes owned by ``specs/evidence/evidence.schema.yaml``,
``specs/evidence/evidence-graph.schema.yaml#/definitions/source_node`` and
``specs/evidence/sentence-provenance.schema.yaml``. Builders only -- graph
assembly and traversal live in ``modules/knowledge`` (the engine).
"""

from __future__ import annotations

from typing import Any


def source_node(source_id: str, locator_hint: str, provenance: dict[str, Any] | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {"node_type": "SOURCE", "source_id": source_id, "locator_hint": locator_hint}
    if provenance:
        node["provenance"] = provenance
    return node


def evidence_record(evidence_id: str, content: str, source_id: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return {"evidence_id": evidence_id, "content": content, "source": source_id, "provenance": provenance}


def audio_locator(start_seconds: float, end_seconds: float) -> dict[str, Any]:
    """``sentence-provenance.schema.yaml`` audio_timestamp locator."""
    return {"locator_type": "audio_timestamp", "start_seconds": start_seconds, "end_seconds": end_seconds, "media_type": "audio"}


def format_audio_timestamp(seconds: float) -> str:
    whole = int(seconds)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def build_sentence_provenance(
    provenance_id: str,
    sentence_text: str,
    claim: dict[str, Any],
    evidence: dict[str, Any],
    locator: dict[str, Any],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": provenance_id,
        "sentence_text": sentence_text,
        "claim": {"claim_id": claim["claim_id"], "statement": claim["statement"], "provenance": claim["provenance"]},
        "evidence": {"evidence_id": evidence["evidence_id"], "provenance": evidence["provenance"]},
        "source_id": evidence["source"],
        "locator": locator,
        "provenance": provenance,
    }
