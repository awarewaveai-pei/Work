"""Reusable capability adapters for the Research vertical slice.

Adapters in this module are deterministic and side-effect free.  Persistence of
the returned artifact belongs to the workflow's artifact/CAS boundary, not to
the capability implementation itself.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.statistics.reliability import interrater_reliability_result
from ai_lego.errors import InvariantViolation


def pre_transcribed_input_adapter(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Accept an already-normalized Transcript; never claim to transcribe media."""
    transcript = payload.get("transcript")
    if not isinstance(transcript, dict) or transcript.get("status") != "normalized":
        raise InvariantViolation("TRANSCRIPT_NORMALIZED_INPUT_REQUIRED")
    if not isinstance(transcript.get("provenance"), dict):
        raise InvariantViolation("TRANSCRIPT_PROVENANCE_REQUIRED")
    return {"transcript": transcript, "mode": "PRE_TRANSCRIBED_INPUT", "media_transcription_claimed": False}


def run_statistics_adapter(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Compute the contracted two-rater result through Trusted Compute."""
    rater_set = payload.get("rater_coding_set")
    if isinstance(rater_set, dict):
        coder_one = rater_set.get("coder_one")
        coder_two = rater_set.get("coder_two")
    else:
        coder_one = payload.get("coder_one")
        coder_two = payload.get("coder_two")
    if isinstance(coder_one, list) and all(isinstance(item, dict) for item in coder_one):
        coder_one = [item.get("label") for item in coder_one]
    if isinstance(coder_two, list) and all(isinstance(item, dict) for item in coder_two):
        coder_two = [item.get("label") for item in coder_two]
    if not isinstance(coder_one, list) or not isinstance(coder_two, list) or any(not isinstance(item, str) for item in [*coder_one, *coder_two]):
        raise InvariantViolation("RATER_CODING_SET_REQUIRED: coder_one and coder_two lists are required")
    if len(coder_one) != len(coder_two) or len(coder_one) < 2:
        raise InvariantViolation("RATER_CODING_SET_INVALID: equally-sized lists with at least two units required")
    return {
        "interrater_reliability_result": interrater_reliability_result(coder_one, coder_two),
        "judgment_source": f"BOUND_INPUT:{len(coder_one)}_SHARED_UNITS",
    }


def research_paper_artifact_adapter(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    """Build a memo artifact value without writing to an operator-controlled path."""
    findings = payload.get("triangulated_findings")
    reliability = payload.get("interrater_reliability_result")
    if not isinstance(findings, dict) or not isinstance(findings.get("findings"), list):
        raise InvariantViolation("RESEARCH_MEMO_FINDINGS_REQUIRED")
    if not isinstance(reliability, dict) or reliability.get("provenance", {}).get("epistemic_type") != "CALCULATED_RESULT":
        raise InvariantViolation("RESEARCH_MEMO_CALCULATED_RESULT_REQUIRED")
    lines = [
        "# Research memo",
        "",
        f"Triangulated findings: {len(findings['findings'])}",
        f"Cohen's Kappa: {reliability.get('kappa')}",
        f"95% CI: {reliability.get('confidence_interval_95')}",
    ]
    return {
        "artifact": {
            "artifact_type": "ResearchMemoArtifact",
            "content": "\n".join(lines) + "\n",
            "provenance": {"source": "research_paper_artifact_adapter", "epistemic_type": "AI_GENERATED"},
        }
    }
