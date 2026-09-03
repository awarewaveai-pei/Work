# Phase 1 Security

## Mandatory
- HTTPS and secure session/authentication handling.
- Server-side Role + Scope + Permission authorization.
- LINE/Google secrets remain server-side.
- OAuth tokens secured at rest and not exposed to browser JavaScript unnecessarily.
- CSRF controls where cookie sessions apply; login/ack abuse protection.
- Audit permission/integration credential changes.
- CSP and secure headers appropriate to selected framework.

## Offline-specific controls
- Local cache is minimized to explicit field-use scope and bound to the authenticated user/session.
- Queued offline writes carry stable idempotency key, actor, target/version and integrity metadata.
- Server re-authorizes every queued action; cached UI permission is never authority.
- Revoked/disabled users cannot successfully synchronize queued writes after revocation.
- Sensitive cached fields are protected using platform/browser capabilities selected during implementation; no secret/provider credential is cached for offline use.
- Logout/account switch clears protected cached data and queued intents according to policy.

## Provider trust boundary
LINE/Google/Accounting provider identities and records never become authoritative project/dispatch/cost truth without explicit server-side mapping/reconciliation.
