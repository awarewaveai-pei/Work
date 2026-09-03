# Observability and SRE

## Signals
- Dispatch create/update/cancel success/error rate.
- LINE delivery failures/retry age.
- Google Calendar projection failures/reconciliation backlog.
- Acknowledgement lag / unacknowledged count.
- Offline queued-action backlog, oldest age, sync success/failure, conflict/rejection count.
- Authorization denial/error metrics without sensitive values.
- Web/API latency/error rate.
- DB health, backup status, restore verification evidence.

## Dashboards
1. Business operations: unassigned staff, unacknowledged dispatches, provider failures.
2. Technical operations: latency/errors/provider/outbox/offline-sync backlog and conflict rate.

## Runbooks
Provider outage, OAuth failure, duplicate projection, stale acknowledgement, offline conflict, offline cache reset/resync, failed release rollback, database restore.
