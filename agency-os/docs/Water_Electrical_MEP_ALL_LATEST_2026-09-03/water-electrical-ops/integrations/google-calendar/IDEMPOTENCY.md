# Google Calendar Idempotency

Key mapping: `(dispatch_id, employee_id, provider_account_id) -> provider_event_id`.

- First publish creates event and stores mapping.
- Amendment updates mapped event.
- Retry checks/stays on same mapping.
- Cancellation cancels/deletes the mapped event according to provider policy.
- Reconciliation detects missing/divergent projections without writing provider state back into Dispatch.
