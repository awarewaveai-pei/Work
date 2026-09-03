# Test Strategy

## Unit
Dispatch transitions, acknowledgement invalidation, permission decisions, reminder timing, adapter mapping, offline queue state transitions and conflict classification.

## Contract
LINE, Google Calendar, authorization, offline queued-action envelope, sync result and cache-scope contracts.

## Integration
Database transaction + durable side effects, idempotent Google update, LINE retry, audit before/after, offline action server re-authorization and stale-version rejection.

## E2E — source-defined online flow
Use `sources/water_electrical_project_management_spec.md:1103-1128`.

## E2E — offline continuity
1. Synchronize current/next dispatch and site summary.
2. Drop network.
3. Field user can read cached allowed data.
4. Queue acknowledgement offline.
5. Reconnect and synchronize with stable idempotency key.
6. Verify company-system acknowledgement, then provider side effects as applicable.
7. Repeat with dispatch amended while user was offline; stale acknowledgement must reject/conflict and require current-version acknowledgement.

## Negative/adversarial
- cross-project unauthorized read/write rejected;
- revoked user queued action rejected on reconnect;
- duplicate sync retry does not duplicate acknowledgement/provider event;
- local user switch does not expose another user's cached data;
- no `apps/mobile`, native-app scaffold or installable PWA manifest generated;
- service-worker/offline implementation is allowed and must obey cache/sync contracts.
