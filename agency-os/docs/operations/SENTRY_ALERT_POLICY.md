# Sentry Alert Policy (Phase 1 Baseline)

## Purpose

Define a long-run, low-noise, high-signal Sentry baseline for the current self-hosted stack:

- `node-api`
- Trigger.dev workflows
- `n8n` backend and optional frontend
- `next-admin`
- WordPress/PHP

This file is the operator SSOT for DSN split, alert thresholds, smoke tests, and review cadence.

## DSN Contract (Service -> Env Key)

- `node-api` -> `SENTRY_DSN_NODE_API`
- Trigger workflows -> `SENTRY_DSN_TRIGGER_WORKFLOWS`
- `n8n` backend -> `SENTRY_DSN_N8N_BACKEND` (or `N8N_SENTRY_DSN`)
- `n8n` frontend -> `SENTRY_DSN_N8N_FRONTEND` (optional)
- `next-admin` -> `SENTRY_DSN_NEXT_ADMIN`
- WordPress/PHP -> `SENTRY_DSN_WORDPRESS`

Backward-compatible aliases may remain temporarily, but all new setup and docs must use the keys above as primary contract.

## Required Tags

All services should include these tags where supported:

- `environment`: `staging` or `production`
- `service`: `node-api` / `trigger-workflows` / `n8n` / `next-admin` / `wordpress`
- `owner`: `lobster-factory`

Trigger workflow events should also carry:

- `workflow.id`
- `workflow.route` (if available)

## Alert Severity Matrix

- `P1` (immediate): auth failures, secrets/config corruption, task runner unavailable, repeated 5xx affecting customer path
- `P2` (same day): workflow failures with retries exhausted, degraded but operating
- `P3` (weekly cleanup): one-off coding issues, known test/smoke events, non-customer-facing failures

## Minimum Alert Rules (Phase 1)

Apply these rules in each Sentry project:

1. **New issue in production** -> notify immediately (Slack/email).
2. **Regression** (issue resolved then reopens) -> notify immediately.
3. **High volume** (same issue N events in 10 minutes; start with N=20) -> escalate as `P1`.
4. **Staging-only issues** -> route to daily triage, not pager.

## Noise Control

- Mark smoke-test issues with tag `smoke-test=true`.
- Resolve smoke-test issues after validation to avoid polluting active triage view.
- Do not disable alerting globally to suppress noise; fix at rule/tag level.

## Smoke Test Baseline (Must Stay Operable)

- `node-api`: call `/rag/supabase-health` with invalid key in staging once, verify Sentry issue, restore key.
- Trigger workflows: force a controlled task exception and verify `workflow.id` tag appears.
- `n8n`: execute one controlled failing workflow, verify backend issue arrival.
- `next-admin`: call `/api/sentry-test` in staging.
- WordPress: trigger one controlled handled exception path in staging.

## Review Cadence

- Weekly: triage unresolved `P1/P2`, confirm no stale critical issues.
- Monthly: tune thresholds and suppressions; verify tag completeness.
- Quarterly: run full smoke suite and confirm alert routing recipients still valid.

## Change Management

- Any changes to DSN contract, severity definitions, or routing must update:
  - `lobster-factory/infra/hetzner-phase1-core/.env.example`
  - `lobster-factory/infra/hetzner-phase1-core/README.md`
  - this file (`SENTRY_ALERT_POLICY.md`)
- Record decisions in `WORKLOG.md`.
