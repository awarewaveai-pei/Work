# Human-Centered System Standard

## Required artifacts
- actor and operator inventory
- critical user journeys and task flows
- high-impact / destructive action inventory
- error and recovery map
- cognitive-load and information-priority review
- user-visible state/status vocabulary
- human-oversight points
- usability acceptance criteria

## Design rules
- Preserve a single source of truth for decision-relevant values.
- Never hide uncertainty, disagreement, stale evidence, degraded mode, or partial completion.
- Destructive operations require preview/confirmation appropriate to risk.
- Long operations expose progress, cancellation semantics, idempotency/retry behavior, and final state.
- Forms preserve safe user input after recoverable errors.
- Permissions and denied actions explain the governing boundary without leaking secrets.
- Empty/loading/error/degraded/offline states are designed states, not implementation accidents.
- User-facing terminology maps to canonical domain/status codes.

## Verification
For critical journeys, prove: happy path, permission denial, invalid input, partial failure, timeout, retry, cancellation, stale state, concurrent update, rollback/recovery, and accessibility path where applicable.
