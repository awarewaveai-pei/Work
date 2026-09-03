# Deployment, Migration and Rollback

## Deployment shape
Start as one modular application + relational database + durable integration worker/outbox + bounded browser offline layer. Do not introduce distributed services without verified ownership/load justification.

## Release
- backward-compatible DB changes first;
- deploy server and web assets;
- service-worker/cache changes must use versioned cache namespaces and controlled activation to avoid stale-code/data corruption;
- verify online and offline E2E;
- progressively enable provider integrations where practical.

## Rollback
- application release rollback per release;
- destructive DB changes use expand/contract or forward recovery;
- service-worker/cache rollback includes invalidating bad cache version and forcing safe resync;
- queued offline operations remain auditable and are not blindly replayed across incompatible command versions;
- provider side effects reconcile rather than blindly replay;
- backup/restore verification remains Foundry baseline.

## Expected result
A failed server/web/offline release can return to the prior verified state without losing authoritative dispatch/audit records or silently replaying stale local actions.
