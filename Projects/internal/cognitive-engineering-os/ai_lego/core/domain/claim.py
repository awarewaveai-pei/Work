"""Claim record (Shared Kernel noun). Shape owned by ``specs/evidence/claim.schema.yaml``."""

from __future__ import annotations

from typing import Any


def claim_record(claim_id: str, statement: str, supporting: list[dict[str, Any]], provenance: dict[str, Any]) -> dict[str, Any]:
    """``supporting`` are evidence records; only their minimal stubs are embedded (schema allows either)."""
    return {
        "claim_id": claim_id,
        "statement": statement,
        "supporting_evidence": [{"evidence_id": item["evidence_id"], "provenance": item["provenance"]} for item in supporting],
        "contradicting_evidence": [],
        "provenance": provenance,
    }
