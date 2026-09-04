# Rollback Standard

Every deploy MUST have a rehearsed rollback path decided and tested before the deploy ships, not improvised after an incident starts.

Required: rollback coverage across every layer a release can touch — application code, database/schema state, configuration, policy/entitlement data, infrastructure, and any external provider integration state (`engineering/PROVIDER_RESILIENCE_STANDARD.md`). A rollback plan MUST state its own time budget and MUST account for data written by the new version that the old version cannot understand (data-migration-aware rollback, not code-only rollback).

Rollback decision authority MUST be named before deploy, not decided ad hoc mid-incident. A release whose forward migration is not backward-compatible (i.e. a plain code rollback would corrupt data) MUST NOT ship without a specific, tested reverse-migration or an accepted forward-fix-only decision made explicitly in advance, per `engineering/MIGRATION_STANDARD.md`.
