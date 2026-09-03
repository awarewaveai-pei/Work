# Offline Sync Conflict Runbook

1. Identify user, queued action ID/idempotency key and target revision.
2. Compare current authoritative server revision.
3. Never force-apply a stale acknowledgement or high-impact command.
4. Mark conflict/rejection evidence and instruct user to refresh/current-version acknowledge.
5. Purge/resync corrupted or incompatible local cache if required.
6. Verify backlog/conflict metrics return to baseline.
