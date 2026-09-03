# Dispatch State Machine

## States
`DRAFT -> PUBLISHED -> ACK_REQUIRED -> ACKNOWLEDGED`

Material amendment:
`PUBLISHED|ACK_REQUIRED|ACKNOWLEDGED -> AMENDED -> ACK_REQUIRED`

Cancellation:
`DRAFT|PUBLISHED|ACK_REQUIRED|ACKNOWLEDGED|AMENDED -> CANCELLED`

## Material amendment fields
At minimum: site/project, date, start/end time, work content, foreman/assigned members when the employee's assignment changes.

## Invariants
- Acknowledgement is version-bound.
- A stale version cannot be acknowledged.
- Publication/amendment/cancellation creates integration work through a durable side-effect mechanism.
- Failed LINE/Google delivery never rolls back authoritative dispatch truth after the transaction is committed; it becomes a visible retry/reconciliation state.
