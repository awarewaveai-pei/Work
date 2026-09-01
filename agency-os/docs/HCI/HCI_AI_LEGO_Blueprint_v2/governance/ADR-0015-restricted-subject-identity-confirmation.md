# ADR-0015 — Restricted-Subject Identity Confirmation

Status: **ACCEPTED — RUNTIME SKELETON ONLY**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-04=A`

## Decision

`MATCH_CONFIRMED` for a RESTRICTED subject requires either deterministic identifier evidence or explicit human confirmation. An LLM similarity/confidence score alone is never a confirmation method.

## Runtime gate

The synthetic local schema separates identity candidates from verification records and rejects a confirmation without a `DETERMINISTIC` or `HUMAN` verification carrying an evidence reference. This is not a public-intelligence pipeline, identity-scoring formula, or production admission decision.

## Rollback

Only a superseding ADR may change the allowed methods. Any data-bearing change requires a reviewed migration and new negative tests.
