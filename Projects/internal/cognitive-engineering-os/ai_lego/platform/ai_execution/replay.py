"""Replay (`/platform/ai-execution/replay`): Current State = Projection(Events), Master Plan §57.

Decryption goes through the vault's CURRENT key state, which is what makes
crypto-shred replay-safe: replaying to T0 (before a deletion) reads the same
ledger bytes it always did, but the DEK is gone, so the projection shows
REDACTED -- the event still exists, its content is no longer readable.

Two more invariants live here rather than in the emitter:

* a ``LOCKED_FACT`` code is immutable: a later AI suggestion that targets it
  is kept as a SEPARATE ``ai_suggestions_for_locked`` entry, never applied;
  an event that tries to relabel a locked code is refused loudly;
* theme sets are kept per prompt version, so ``PromptVersionRollback``
  restores the champion's exact structure rather than trusting whatever was
  emitted last.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.errors import InvariantViolation
from ai_lego.security.key_vault.local_key_vault import LocalKeyVault


def project(events: list[dict[str, Any]], vault: LocalKeyVault) -> dict[str, Any]:
    transcripts: dict[str, dict[str, Any]] = {}
    themes_by_version: dict[int, list[dict[str, Any]]] = {}
    locked_codes: dict[str, Any] = {}
    ai_suggestions_for_locked: dict[str, list[dict[str, Any]]] = {}
    annotations: list[dict[str, Any]] = []
    theme_review_diffs: list[dict[str, Any]] = []
    prompt_version: int | None = None
    for event in events:
        payload = event["payload"]
        kind = event["event_type"]
        if kind == "TranscriptGenerated":
            subject_id = payload["subject_id"]
            transcripts[subject_id] = {
                "source_id": payload["source_id"],
                "text": payload["redacted_transcript"],
                "pii": {field: vault.decrypt_or_redact(event["tenant_id"], subject_id, envelope) for field, envelope in payload["encrypted_pii"].items()},
            }
        elif kind == "AnnotationAdded":
            annotations.append(copy.deepcopy(payload))
        elif kind == "HumanCodeLocked":
            if payload["code_id"] in locked_codes:
                raise InvariantViolation(f"LOCKED_FACT_REWRITE_REFUSED: {payload['code_id']} is already locked")
            locked_codes[payload["code_id"]] = copy.deepcopy(payload)
        elif kind == "CodeRelabelled":
            if payload["code_id"] in locked_codes:
                raise InvariantViolation(f"LOCKED_FACT_REWRITE_REFUSED: {payload['code_id']} is LOCKED_FACT")
        elif kind == "AISuggestionProposed":
            target = payload.get("target_code_id")
            if target in locked_codes:
                ai_suggestions_for_locked.setdefault(target, []).append(copy.deepcopy(payload))
        elif kind == "ThemeSetProduced":
            prompt_version = int(payload["prompt_version"])
            themes_by_version[prompt_version] = copy.deepcopy(payload["themes"])
        elif kind == "ThemeGroupingRejected":
            theme_review_diffs.append(copy.deepcopy(payload))
        elif kind == "PromptVersionRollback":
            restored = int(payload["restored_prompt_version"])
            if restored not in themes_by_version:
                raise InvariantViolation(f"ROLLBACK_TARGET_MISSING: no ThemeSet for prompt v{restored}")
            prompt_version = restored
    return {
        "transcripts": transcripts,
        "themes": copy.deepcopy(themes_by_version.get(prompt_version, [])) if prompt_version is not None else [],
        "themes_by_version": themes_by_version,
        "locked_codes": locked_codes,
        "ai_suggestions_for_locked": ai_suggestions_for_locked,
        "annotations": annotations,
        "theme_review_diffs": theme_review_diffs,
        "prompt_version": prompt_version,
        "event_ids": [event["event_id"] for event in events],
    }
