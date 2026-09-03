# Provider Outage Runbook

1. Confirm authoritative dispatch/database health.
2. Identify LINE vs Google provider degradation.
3. Stop unsafe manual replay if idempotency state is unknown.
4. Inspect delivery/projection backlog and idempotency keys.
5. Retry bounded failed work after provider recovery.
6. Reconcile projections/deliveries.
7. Record incident/audit evidence.

Expected result: provider outage never corrupts company dispatch truth.
