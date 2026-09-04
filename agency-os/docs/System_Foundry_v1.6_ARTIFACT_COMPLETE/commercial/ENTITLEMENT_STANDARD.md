# Entitlement Standard

## Purpose
Entitlement is the single primitive that answers "can this actor do this thing, right now" — it is the enforcement layer beneath plans, editions, and feature flags. Every other commercial standard that talks about "access" or "limits" MUST route through this primitive rather than inventing a parallel check.

## The Entitlement Primitive
1. An entitlement grant MUST be a structured record: subject (account/tenant/user), capability/feature id, a value (boolean, numeric limit, or quota), and a validity window. Free-form "has_feature_x: true" flags scattered across services are prohibited once an entitlement system exists.
2. Entitlement checks MUST be enforced at every layer where the consequence matters (API, background job, data-export path) — not only in the UI. A UI-only entitlement check is not an entitlement check; it is a suggestion.

## Sources of Truth
3. There MUST be exactly one authoritative entitlement store per account/tenant. Any cache (edge, client-side, session) MUST be explicitly invalidated on entitlement change and MUST NOT be treated as authoritative during the invalidation gap for security-relevant checks.
4. Entitlements MUST be derivable from `commercial/EDITION_ARCHITECTURE.md` plan/edition assignment plus any individually-granted overrides; overrides MUST be recorded as distinct, audited records, not silent mutations of the plan's base grant.

## Limits and Usage
5. Numeric limits (seats, storage, API calls) MUST define what happens at the boundary: hard block, soft warn, or metered overage — this MUST be explicit per limit, not left to whatever the code happens to do.
6. Usage measurement feeding a limit check MUST be reconcilable against the same event log that feeds `commercial/UNIT_ECONOMICS_STANDARD.md` cost/usage tracking; entitlement usage and billing usage MUST NOT be computed by two divergent counters.

## Change and Grace
7. Entitlement changes triggered by a lifecycle transition (`commercial/CUSTOMER_LIFECYCLE.md`) MUST apply atomically with that transition. A downgrade that removes an entitlement a customer is actively using MUST define a grace behavior (read-only, export window, hard cutoff) rather than an undefined runtime error.
8. Every entitlement change MUST be recorded as an audit event with actor, reason (plan change, manual override, expiry), and before/after value, per `governance/AUTHORITY_MODEL.md`.

## Verification
9. A generated system's entitlement engine SHOULD be testable the way this framework tests its own capability resolution: given a plan/override set, the resulting entitlement set MUST be deterministic and reproducible (mirrors `assurance/SELECTION_OUTPUT_CORRECTNESS_STANDARD.md`'s determinism requirement).
