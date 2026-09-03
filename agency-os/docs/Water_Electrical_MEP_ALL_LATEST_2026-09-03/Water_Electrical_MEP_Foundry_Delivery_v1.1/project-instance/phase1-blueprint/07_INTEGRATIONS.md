# LINE and Google Calendar Integrations

## Source-of-truth direction
`Company System -> Integration Adapter -> Provider`

Provider data SHALL NOT overwrite official Dispatch data.

## LINE
Events: dispatch published, amended, cancelled, reminder, acknowledgement link/action.
Required controls: idempotency key, delivery status, retry/backoff, rate-limit handling, secret isolation, audit reference.

## Google Calendar
- Create event on first publish.
- Update the same event on amendment.
- Cancel/delete projection on dispatch cancellation.
- Keep stable provider event ID mapping.
- Reconcile failed/out-of-sync projections.

## Failure behavior
Provider outage degrades notification/projection, not the company source of truth. Operations UI must expose sync/delivery failures requiring attention.

## Offline delivery ordering
When an allow-listed action is performed offline, synchronize the company-system command first. LINE/Google side effects are emitted only after authoritative commit and may be retried/reconciled independently.

## Future accounting integration
Phase 4 requires an accounting adapter and reconciliation boundary. Provider-specific IDs/protocols stay inside `accounting_integration`.
