"""Evidence-graph engine (Master Plan §13.3): assembly, reverse tracing, locator derivation.

Record builders for the Shared Kernel nouns (Source/Evidence/Claim/provenance)
live in ``ai_lego.core.domain``; this module only assembles and walks graphs.
``reverse_trace`` is the mechanism behind the Citation Gate: it walks
Sentence -> Claim -> Evidence -> Source -> locator THROUGH the graph and
fails on the first dangling link instead of trusting the record's own claim
that a chain exists.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.evidence import audio_locator
from ai_lego.errors import InvariantViolation

TERMINAL_LOCATOR_FIELD = {"audio_timestamp": "start_seconds", "text_page": "page_number", "image_region": "bounding_box"}


def build_evidence_graph(sources: list[dict[str, Any]], evidences: list[dict[str, Any]], claims: list[dict[str, Any]], graph_id: str | None = None) -> dict[str, Any]:
    """Instance of ``evidence-graph.schema.yaml#/evidence_graph``; edges EVIDENCE-DERIVED_FROM->SOURCE, EVIDENCE-SUPPORTS->CLAIM."""
    nodes: list[dict[str, Any]] = list(sources)
    nodes += [{"node_type": "EVIDENCE", "data": evidence} for evidence in evidences]
    nodes += [{"node_type": "CLAIM", "data": claim} for claim in claims]
    edges: list[dict[str, Any]] = []
    for evidence in evidences:
        edges.append({"from": {"node_type": "EVIDENCE", "node_id": evidence["evidence_id"]}, "to": {"node_type": "SOURCE", "node_id": evidence["source"]}, "relation_type": "DERIVED_FROM"})
    for claim in claims:
        for stub in claim["supporting_evidence"]:
            edges.append({"from": {"node_type": "EVIDENCE", "node_id": stub["evidence_id"]}, "to": {"node_type": "CLAIM", "node_id": claim["claim_id"]}, "relation_type": "SUPPORTS"})
    return {"graph_id": graph_id, "nodes": nodes, "edges": edges}


def _node_ids(graph: dict[str, Any], node_type: str) -> set[str]:
    ids: set[str] = set()
    for node in graph["nodes"]:
        if node["node_type"] != node_type:
            continue
        if node_type == "SOURCE":
            ids.add(node["source_id"])
        elif node_type == "EVIDENCE":
            ids.add(node["data"]["evidence_id"])
        elif node_type == "CLAIM":
            ids.add(node["data"]["claim_id"])
    return ids


def _has_edge(graph: dict[str, Any], from_type: str, from_id: str, relation: str, to_type: str, to_id: str) -> bool:
    return any(
        edge["from"] == {"node_type": from_type, "node_id": from_id} and edge["to"] == {"node_type": to_type, "node_id": to_id} and edge["relation_type"] == relation
        for edge in graph["edges"]
    )


def reverse_trace(sentence_provenance: dict[str, Any], graph: dict[str, Any]) -> dict[str, Any]:
    """Sentence -> Claim -> Evidence -> Source -> locator, verified link by link against the graph."""
    claim_id = sentence_provenance["claim"]["claim_id"]
    evidence_id = sentence_provenance["evidence"]["evidence_id"]
    source_id = sentence_provenance["source_id"]
    locator = sentence_provenance["locator"]
    if claim_id not in _node_ids(graph, "CLAIM"):
        raise InvariantViolation(f"TRACE_BROKEN: claim {claim_id} not in evidence graph")
    if evidence_id not in _node_ids(graph, "EVIDENCE"):
        raise InvariantViolation(f"TRACE_BROKEN: evidence {evidence_id} not in evidence graph")
    if not _has_edge(graph, "EVIDENCE", evidence_id, "SUPPORTS", "CLAIM", claim_id):
        raise InvariantViolation(f"TRACE_BROKEN: no SUPPORTS edge {evidence_id} -> {claim_id}")
    if source_id not in _node_ids(graph, "SOURCE"):
        raise InvariantViolation(f"TRACE_BROKEN: source {source_id} not in evidence graph")
    if not _has_edge(graph, "EVIDENCE", evidence_id, "DERIVED_FROM", "SOURCE", source_id):
        raise InvariantViolation(f"TRACE_BROKEN: no DERIVED_FROM edge {evidence_id} -> {source_id}")
    terminal = TERMINAL_LOCATOR_FIELD.get(locator.get("locator_type", ""))
    if terminal is None or locator.get(terminal) is None:
        raise InvariantViolation(f"TRACE_BROKEN: locator {locator.get('locator_type')!r} lacks its terminal field")
    return {"sentence": sentence_provenance["sentence_text"], "claim_id": claim_id, "evidence_id": evidence_id, "source_id": source_id, "locator": locator}


def locator_from_transcript(transcription: dict[str, Any], quote: str) -> tuple[dict[str, Any], str]:
    """Find the transcript segment that carries ``quote`` and return its audio span.

    Returns ``(locator, precision)`` where precision is ``SEGMENT_MATCH`` when a
    segment contains the first words of the quote, or ``TRANSCRIPT_SPAN_FALLBACK``
    (whole-file span) when real speech-to-text rendered the words differently.
    The fallback is reported, never hidden -- a locator is only as precise as
    the recogniser's segmentation allowed.
    """
    words = [word.strip(".,;:!?\"'") for word in quote.casefold().split()]
    probes = [" ".join(words[i : i + 3]) for i in range(0, max(1, len(words) - 2))]
    for segment in transcription["segments"]:
        text = " ".join(part.strip(".,;:!?\"'") for part in segment["text"].casefold().split())
        if any(probe and probe in text for probe in probes):
            return audio_locator(segment["start_seconds"], segment["end_seconds"]), "SEGMENT_MATCH"
    return audio_locator(0.0, transcription["duration_seconds"]), "TRANSCRIPT_SPAN_FALLBACK"
