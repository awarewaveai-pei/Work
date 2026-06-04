---
name: Sentry should hold signal, error_events should hold audit
description: Auth failures from random scanners should write audit rows but NOT raise Sentry. Reserve Sentry for actionable engineering signals.
type: feedback
originSessionId: 6ed5055d-1f88-4ffe-968b-938f28b56a31
---
When a public webhook endpoint exists (Telegram bot ingress, Slack ingress, GitHub webhook, etc.), random internet scanners and smoke tests will hit it constantly. Naively wiring `Sentry.captureMessage` for every auth failure pollutes the Sentry inbox with high-volume / low-signal noise that masks real incidents.

**Why:** AwareWave Telegram webhook (2026-05-08) accumulated 19 events of `missing_secret_header` over 2 days from background scanners + the command-plane-smoke test. Two parallel Sentry sources (route.ts captureMessage + errorReporting.reportCommandError) compounded the problem. The fix took **two passes**: first pass only addressed the route.ts source; the errorReporting source kept firing until the second pass added a `silentSentry` option.

**How to apply:** When designing a new webhook ingress with auth checks:

1. **Two layers of recording**:
   - `error_events` (DB table): unconditional audit row for every auth failure → audit + replay + forensics
   - Sentry: ONLY for failures that carry actionable engineering signal

2. **Signal classification (reusable rule)**:
   - `missing_secret_header` / `missing_auth_header` → audit only, NO Sentry (random scanner)
   - `secret_mismatch` / `bad_token` → audit + Sentry (someone has wrong but-shaped value; possible leak)
   - `config_missing` / `server_misconfigured` → audit + Sentry (deployment broken)
   - `not_in_allowlist` (after authentic header) → audit + Sentry (legitimate caller hitting wrong env)

3. **Single Sentry source per failure**: If a request fails auth and goes through one error reporter, do NOT also captureMessage upstream. Pick one canonical path (we use `errorReporting.reportCommandError` with optional `silentSentry: boolean`).

4. **Audit table is the system of record**, not Sentry. Sentry is the alerting layer. They serve different purposes — never conflate them.

This rule generalizes beyond Telegram. Apply to any inbound surface that the public internet can hit: Slack, Discord, GitHub webhooks, public REST APIs.
