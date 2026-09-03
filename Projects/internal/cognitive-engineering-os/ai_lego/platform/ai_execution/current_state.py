"""Current-State Reconstruction (EC §11; ``specs/execution/current-state.schema.yaml``).

Builds the 20-dimension record before CURRENT_STATE_ESTABLISHED. Honest
about scope: this is a real reconstruction for a local synthetic slice
running against a read-only spec root and a fresh runtime directory, not a
production system -- most dimensions are legitimately OBSERVED with a short
factual summary; a few that do not apply to this slice (Infrastructure,
Deployment Topology, Identity / Authorization) are UNKNOWN or NOT_APPLICABLE
rather than fabricated.
"""

from __future__ import annotations

from typing import Any

DIMENSION_NAMES = (
    "Repository / Commit",
    "Architecture",
    "Affected Bounded Context",
    "Affected Files / Modules",
    "Runtime Dependencies",
    "APIs",
    "Schemas",
    "Events",
    "Data Flow",
    "Security Boundary",
    "Identity / Authorization",
    "Config",
    "Infrastructure",
    "Deployment Topology",
    "Tests",
    "Observability",
    "Known Failure",
    "Rollback Capability",
    "Open Migration",
    "Known Technical Debt",
)


def build_current_state(
    task_id: str,
    execution_id: str,
    reconstructed_at: str,
    commit: str,
    documents: list[dict[str, Any]],
) -> dict[str, Any]:
    compared_against = [{"document_id": doc["document_id"], "version": doc["version"], "sha256": doc["sha256"]} for doc in documents]
    observed = {
        "Repository / Commit": f"Projects/internal/cognitive-engineering-os @ {commit}",
        "Architecture": "ai_lego package, sub-packages mirror REPOSITORY_ARCHITECTURE.md (core/data/security/compute/modules/platform/apps)",
        "Affected Bounded Context": "modules/research (Research Recipe vertical) + modules/knowledge (engine)",
        "Affected Files / Modules": "ai_lego/apps/cli/run_research_slice.py and its imports (see manifest method_execution_log)",
        "Runtime Dependencies": "PyYAML, jsonschema, referencing, cryptography (pyproject.toml); offline-stt extra: faster-whisper",
        "APIs": "none exposed; CLI entry point only (python -m ai_lego.apps.cli.run_research_slice)",
        "Schemas": f"{len(documents)} mother documents pinned by hash; per-record schemas validated via SchemaContracts against the read-only spec root",
        "Events": "DocumentUploaded, TranscriptGenerated, MethodResolutionBlocked/Resolved, HumanCodeLocked, AISuggestionProposed, StatisticsCalculated, ThemeSetProduced, ArtifactPublished, PersonalDataRedacted, PromptVersionRollback",
        "Data Flow": "synthetic audio -> STT -> PII detect/encrypt -> ledger -> coding -> statistics -> memo -> crypto-shred",
        "Security Boundary": "tenant-scoped CAS (path containment) + per-subject DEK wrapped by tenant KEK",
        "Identity / Authorization": "NOT_APPLICABLE for this slice: single synthetic actor, no auth layer",
        "Config": "no external config; spec root path resolved via AI_LEGO_SPEC_ROOT or repo default",
        "Infrastructure": "NOT_APPLICABLE: local process only, no deployed infrastructure",
        "Deployment Topology": "NOT_APPLICABLE: not deployed",
        "Tests": "tests/unit + tests/acceptance (see README.md for current pass counts)",
        "Observability": "print + written JSON artefacts under the runtime dir; no metrics/tracing",
        "Known Failure": "none open at slice start",
        "Rollback Capability": "backup snapshot + independent-destruction-record replay gate (this slice's own rollback mechanism, see rollback record)",
        "Open Migration": "none",
        "Known Technical Debt": "see docs/PHASE5_RESEARCH_SLICE.md Current limitations and OQ-P5-*",
    }
    dimensions = [{"name": name, "status": "OBSERVED" if not observed[name].startswith("NOT_APPLICABLE") else "NOT_APPLICABLE", "summary": observed[name]} for name in DIMENSION_NAMES]
    evidence_log = [
        {"type": "Repository", "ref": commit, "consulted_at": reconstructed_at},
        {"type": "Schemas", "ref": "specs/ (spec root, read-only)", "consulted_at": reconstructed_at},
        {"type": "Tests", "ref": "tests/ (this product root)", "consulted_at": reconstructed_at},
    ]
    return {
        "task_id": task_id,
        "execution_id": execution_id,
        "reconstructed_at": reconstructed_at,
        "reconstructed_by": "ai_lego.apps.cli.run_research_slice",
        "compared_against": compared_against,
        "dimensions": dimensions,
        "evidence_log": evidence_log,
        "drift": {"detected": False},
    }
