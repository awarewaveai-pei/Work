# AwareWave Repair Center App Architecture

## Scope

This file defines where the repair system belongs inside `https://app.aware-wave.com/` and how it must relate to the existing ops surfaces.

Primary app: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`

## Route Topology

| Route | Role |
|------|------|
| `/ops/inbox` | Incident intake and curated alert triage |
| `/ops/repairs` | Repair orchestration layer |
| `/ops/approvals` | High-risk command approvals |
| `/ops/system-modes` | Global kill switch / maintenance boundaries |
| `/build` | Release execution surface |

`/ops/repairs` must sit between intake and release. It is not a replacement for any of the above routes.

## Canonical Flow

1. Alerts land in `Ops Inbox`.
2. Repair Center selects incidents that are repairable.
3. Human approval allows a repair run to start.
4. Backup gate passes before any GitHub issue or PR is created.
5. Claude / GitHub handles code analysis and PR creation.
6. Human merge remains required.
7. Deploy remains manual through existing release tooling.
8. Health failure triggers rollback and notification.

## Signal Source Taxonomy

Repair Center must treat Sentry, Uptime Kuma, and Netdata as the first production intake set, not as the full monitoring boundary. The platform already has additional ops signals through Grafana/Loki, PostHog, GitHub Actions, health endpoints, Cloudflare, Supabase, n8n, Trigger.dev, deploy drift checks, and WordPress/MainWP.

Use this taxonomy when adding or changing sources:

| Source family | Examples | Repair policy | Rationale |
|------|------|------|------|
| Code exception | Sentry | `auto_repair` | Stack traces and file/line context can produce bounded code PRs. |
| Availability and SLO | Uptime Kuma, Grafana alerting, endpoint probes | `analysis_only` | Downtime can be code, DNS, DB, nginx, capacity, or deploy drift; triage must come before PR. |
| Infrastructure resource | Netdata, host disk, CPU, memory, container health | `human_only` by default | Resource incidents usually require operator action, scaling, cleanup, or infra changes, not blind code edits. |
| Product and business behavior | PostHog funnel drop, conversion anomaly, feature usage anomaly | `analysis_only` | Behavior anomalies are evidence, not proof of a code bug. They need diagnosis before repair. |
| Delivery and workflow | GitHub Actions, Trigger.dev, n8n, deploy drift, backup freshness | `triage_needed` or `analysis_only` | These can indicate broken automation; repair is allowed only after owner boundary is clear. |
| Security, identity, DNS, payment, secrets | Cloudflare WAF/security events, auth/role changes, billing/provider events | `human_only` | These are high-risk control-plane changes and must not trigger autonomous code repair. |

New sources should first normalize into Ops Inbox. Only after they have stable severity, fingerprint, ownership, and drill behavior may they be promoted into Repair Center policy.

## Ownership Boundaries

| Surface | Owns | Must not own |
|------|------|------|
| Ops Inbox | ingest, dedup, severity, reopen, throttle | PR lifecycle, deploy orchestration |
| Repair Center | repair candidate selection, repair run lifecycle, GitHub handoff | raw alert ingestion, global system mode |
| Approvals | high-risk command approvals | incident triage, repair queue |
| System Modes | kill switch / read-only / maintenance | repair state |
| Build Console | deploy execution | incident intake, PR generation |

## Repair Run State Model

Use one linear state model for future `repair_runs` data:

- `detected`
- `triage_needed`
- `approved`
- `backing_up`
- `repairing`
- `pr_ready`
- `deploy_pending`
- `deploying`
- `rolled_back`
- `resolved`
- `human_only`

Do not create multiple overlapping state machines across Slack, Ops Inbox, and GitHub comments.

## Invariants

1. `Ops Inbox` is the only curated incident source of truth.
2. `Repair Center` is the only repair orchestration source of truth.
3. `Slack` is the primary human incident surface.
4. `Telegram` is backup notification plus command plane only.
5. No backup means no repair run.
6. No human merge means no production code change.
7. No manual deploy means no production release.

## UI Information Architecture

The first usable Repair Center screen should contain:

1. Queue panel: repairable incidents waiting for approval.
2. Runs panel: active and recent repair runs.
3. Safety panel: backup gate, system mode, deploy gate, rollback gate.
4. Linked records: incident, issue, PR, deploy log, backup proof.
5. Policy panel: which incident classes are auto-repair, analysis-only, or human-only.

## Forbidden Design Moves

1. Do not create a second alert inbox under `/ops/repairs`.
2. Do not move deploy controls into the repair queue.
3. Do not bypass `/ops/system-modes`.
4. Do not add Telegram-only repair actions.
5. Do not create a second dedup or severity pipeline outside Ops Inbox.

## 2026-05-13 Implementation Baseline

The first real implementation is now anchored in the existing Next.js app:

| Layer | Implementation |
|------|------|
| Data model | `lobster-factory/packages/db/migrations/0027_repair_runs.sql` |
| UI | `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/repairs/page.tsx` |
| UI actions | `app/ops/repairs/RepairActions.tsx` |
| API | `app/api/ops/repairs/*` |
| Health | `app/api/ops/repairs/health/route.ts` |
| Slack callback | `app/api/internal/commands/slack/route.ts` |
| GitHub workflows | `.github/workflows/auto-repair-claude.yml`, `.github/workflows/auto-repair-pr-notify.yml` |

Environment variables:

| Variable | Purpose |
|------|------|
| `AUTO_REPAIR_BACKUP_WEBHOOK_URL` | Required backup gate. If missing or failing, no GitHub issue is created. |
| `AUTO_REPAIR_BACKUP_WEBHOOK_TOKEN` | Optional bearer token for the backup gate webhook. |
| `AUTO_REPAIR_SG_SSH_HOST` / `AUTO_REPAIR_SG_SSH_PORT` / `AUTO_REPAIR_SG_SSH_USER` / `AUTO_REPAIR_SG_SSH_KEY_B64` | SSH fallback backup gate for SG when no backup webhook is configured. |
| `AUTO_REPAIR_EU_SSH_HOST` / `AUTO_REPAIR_EU_SSH_PORT` / `AUTO_REPAIR_EU_SSH_USER` / `AUTO_REPAIR_EU_SSH_KEY_B64` | SSH fallback backup gate for EU. Required by default. |
| `AUTO_REPAIR_REQUIRE_EU_BACKUP` | Defaults to required. Set `false` only for deliberate SG-only drills. |
| `AUTO_REPAIR_SG_PHASE1_ROOT` | Defaults to `/root/lobster-phase1`. |
| `AUTO_REPAIR_SG_BACKUP_SCRIPT` / `AUTO_REPAIR_SG_VERIFY_SCRIPT` | Defaults to `./scripts/backup-phase1.sh` and `./scripts/verify-backup.sh`. |
| `AUTO_REPAIR_EU_BACKUP_SCRIPT` / `AUTO_REPAIR_EU_VERIFY_SCRIPT` | Defaults to `/root/scripts/backup-eu-stack.sh` and `/root/scripts/verify-backup-eu.sh`. |
| `AUTO_REPAIR_GITHUB_TOKEN` | GitHub issue creation token. Falls back to `GITHUB_TOKEN` when available. |
| `AUTO_REPAIR_GITHUB_OWNER` / `AUTO_REPAIR_GITHUB_REPO` | Default GitHub target. Defaults to `awarewaveai-pei/Work`. |
| `SLACK_SIGNING_SECRET` | Verifies Slack interactive approve callbacks. |

`/api/ops/repairs/health` must expose the active source policy catalog as `source_policies` so drills and operators can verify that UI, code, and documentation agree on auto-repair vs analysis-only vs human-only behavior.

Backup gate order:

1. If `AUTO_REPAIR_BACKUP_WEBHOOK_URL` is configured, call it.
2. Otherwise use SSH fallback to run existing SG/EU backup and verify scripts.
3. If either required backup path fails, stop the run before GitHub issue creation.

Current policy mapping:

| Source | Policy |
|------|------|
| `sentry` | `auto_repair` |
| `uptime_kuma` / `grafana` | `analysis_only` |
| `posthog` | `analysis_only` |
| `netdata` | `human_only` |
| other critical sources | `triage_needed` |

Production deploy remains manual. Repair Center may mark a run as `deploy_pending`, but does not run deploy.
