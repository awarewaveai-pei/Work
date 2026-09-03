# Phase 1 Implementation Backlog

Every task starts only after stack selection and exact path confirmation.

## P1-001 Repository/bootstrap
- Paths: `apps/web/`, `modules/*`, `packages/offline-sync/`, `integrations/*`, `tests/*`, `infra/*`, `.foundry/*`
- Expected: one RWD web codebase, offline web boundary included, no native app/installable PWA manifest.

## P1-002 Identity + authorization
- Paths: `modules/identity/`, `modules/authorization/`
- Server Role + Scope + Permission; queued offline actions re-authorized on sync.

## P1-003 Workforce
- `modules/workforce/`: Employee/Crew/Foreman lifecycle; preserve history.

## P1-004 Project/site
- `modules/project/`: Project/Site/contact/responsibility/lifecycle.

## P1-005 Dispatch aggregate
- `modules/dispatch/`: multi-person assignment, revisioning, acknowledgement, re-ack, unassigned workforce, My Dispatch.
- Invariant: planned Dispatch is not actual/approved labor time.

## P1-006 Company calendar + RWD planning UI
- `apps/web/features/dispatch/`, `apps/web/features/calendar/`
- Desktop drag/drop; narrow-screen tap/select equivalent using same commands.

## P1-007 Bounded offline web
- `packages/offline-sync/`, `apps/web/OFFLINE_WEB_CONTRACT.md`, `tests/contract/offline/`
- Cache current/next dispatch and field site summary.
- Queue allow-listed acknowledgement only initially.
- Stable idempotency key, server re-authorization/version check, explicit conflict/rejection, cache/session isolation.
- Rollback: versioned cache namespace + forced safe resync.

## P1-008 LINE adapter
- `integrations/line/`: publish/amend/cancel/reminder idempotency/retry/audit.

## P1-009 Google Calendar adapter
- `integrations/google-calendar/`: stable event mapping/update same event/reconciliation.

## P1-010 Audit/observability
- `modules/audit/`, `observability/`: before/after + provider/offline sync metrics/runbooks.

## P1-011 Acceptance E2E
- `tests/e2e/`: source 11-step online flow + offline continuity/reconnect/stale-conflict scenarios.

## Deferred contract tasks (not Phase 1 implementation)
- P4: create `labor_time` module before labor costing; approved labor time is authoritative cost input.
- P4: create accounting adapter/reconciliation module; provider undecided.
- P4: explicitly exclude online payment gateway.
