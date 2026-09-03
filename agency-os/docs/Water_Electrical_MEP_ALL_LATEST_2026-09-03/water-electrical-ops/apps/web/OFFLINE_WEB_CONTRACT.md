# Offline Web Contract

## Authority
Browser offline state is a bounded cache/intent queue, never the authoritative company record.

## Initial cache scope
Current/next dispatch, project/site summary, address/contact/navigation data required in the field.

## Initial queued-command allow-list
`ACKNOWLEDGE_DISPATCH` only. Expansion requires ADR, security review, conflict semantics, rollback and tests.

## Queue envelope
Stable idempotency key, actor/user, command type/version, target ID + target revision, created-at, integrity metadata and minimized payload.

## Sync
Reconnect -> authenticate -> re-authorize -> version/conflict check -> authoritative commit -> audit -> provider/outbox delivery.

## Failure
Stale/revoked/unauthorized actions become explicit REJECTED/CONFLICT records; never silently overwrite server state.
