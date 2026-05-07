# Always-On Command Plane

> **Owner**: this file. All other documents must reference, not duplicate.
> **Status**: Phase 1 — Telegram ingress + 5 low-risk commands.
> **Goal**: receive commands and run safe automations 24/7 without the operator's computer being on.

## 1. Purpose

Provide a single, governed entry point for external triggers (Telegram, Slack, Email, Webhook, Schedule) so they can be:

- authenticated and rate-limited at one boundary,
- recorded as `command_requests` rows before any side effect,
- evaluated against the kill switch and policy engine,
- dispatched to a small set of low-risk handlers (Phase 1) or queued for approval (Phase 2),
- replayed deterministically on failure (DLQ → `error_events`).

Phase 1 supports Telegram only. New ingress sources reuse the same router (§7).

## 2. Architecture

```
[Telegram / Schedule / Webhook / Slack(future)]
            ↓ HTTPS
[Cloudflare DNS-only → Hetzner EU 204.168.175.41]
            ↓
[Next.js API: /api/internal/commands/{telegram,dispatch}]
            ↓
[CommandRouter (lib/command-plane/)]
   ├─ verifyTelegramSecret          (header secret_token, timing-safe)
   ├─ verifyTelegramActor           (TELEGRAM_ALLOWED_USER_IDS / CHAT_IDS)
   ├─ evaluatePolicy                (RISK_TABLE + hard blocks per source)
   ├─ claimCommandRequest           (idempotency via unique constraint)
   ├─ getActiveMode + evaluateKillSwitch  (system_modes)
   └─ dispatch:
        ├─ low-risk → inline handler → result → command_requests.completed
        ├─ medium-risk → status='queued' (Phase 2: Trigger.dev)
        └─ high/critical → INSERT approvals (existing 0003 schema) + Slack ping
            ↓
[System of record: command_requests, plus existing
 workflow_runs / agent_runs / approvals / incidents / error_events]
            ↓
[Existing observability: Sentry / PostHog / Slack alert]
            ↓
[Telegram reply with trace_id]
```

## 3. Schema reference

Migration: `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql`

| Table | Purpose | Notes |
|---|---|---|
| `command_requests` | Ingress layer; one row per external event | unique `(source, source_event_id)` enforces idempotency |
| `system_modes` | Global + per-scope kill switch | seed row scope=`global`, mode=`normal` is created on migration |
| `workflow_runs.command_request_id` | Backref for Phase 2 dispatched runs | nullable; legacy runs unaffected |
| `workflow_runs.idempotency_key` | Optional dedupe key for Phase 2 dispatch | nullable; unique-where-not-null |
| `error_events.source_type` | DLQ via existing table | values: `command_ingress_failed`, `command_dispatch_failed`, `command_handler_failed`, `telegram_auth_failed` |

No new tables for DLQ or audit — existing `error_events` (0003) and `ops_audit_events` (0011) are reused.

## 4. API contract

All routes under `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/`.

- `POST /api/internal/commands/telegram` — Telegram webhook ingress
  - header `X-Telegram-Bot-Api-Secret-Token` must match `TELEGRAM_WEBHOOK_SECRET`
  - body: standard Telegram `Update` JSON
  - response: always `200 OK` (Telegram retries on non-200; we do not leak failure mode)
- `POST /api/internal/commands/dispatch` — Phase 2 only; returns `501` in Phase 1.

Library entry point: `lib/command-plane/commandRouter.ts → routeCommand(supabase, input, opts)`.

## 5. Risk routing table

Source: `lib/command-plane/policyEngine.ts:RISK_TABLE`. Adding a command is a one-line change + handler registration.

| Risk | Examples | Telegram | Slack | Webhook | Internal/Schedule |
|---|---|---|---|---|---|
| low | `/status` `/health` `/daily_review` `/weekly_review` `/list_failed_runs` `/runbook` `/draft_cursor_task` | ✅ run | ✅ run | ✅ run | ✅ run |
| medium | `/replay_dead_letter` `/trigger_staging_workflow` | ⏸️ queued (Phase 2) | ⏸️ queued | ✅ run | ✅ run |
| high | `/deploy_production` `/refund` `/dns_change` `/rotate_secrets` | 🚫 hard-block | 🚫 hard-block | ⏸️ approval | ⏸️ approval |
| critical | `/drop_table` `/read_secrets` `/destructive_migration` `/cross_tenant_export` `/disable_killswitch` | 🚫 hard-block | 🚫 hard-block | 🚫 hard-block | 🚫 hard-block |

Unknown commands default to `risk='high'`, `outcome='block'`, `rejection_reason='unknown_command'` (deny by default).

## 6. Hard blocks (security boundary)

Aligns with `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §10 and `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`.

The command plane **never** does any of these — even with valid actor auth:

- production deploy
- DB migration (any ALTER / DROP / TRUNCATE)
- read secrets / vault
- DNS / Cloudflare changes
- payment / refund / payout
- customer data deletion / cross-tenant export
- modifying RLS or approval policies themselves
- modifying `system_modes` (kill switch must come from ops console SSO)

Args that include any of `--no-verify`, `--force`, `;`, `&`, `|`, backtick, or `$(` are rejected as `risk='critical'` regardless of source.

## 7. Adding a new command

1. Add the command + risk to `lib/command-plane/policyEngine.ts:RISK_TABLE`.
2. Add a handler under `lib/command-plane/handlers/<name>.ts` exporting a `CommandHandler`.
3. Register the handler in `lib/command-plane/handlers/index.ts:phase1Handlers`.
4. Update the table in §5 of this doc.
5. (Optional) add an entry to `setMyCommands` list in `scripts/configure-telegram-webhook.ps1`.
6. Re-run `scripts/command-plane-smoke.ps1` to confirm no regression.

## 8. Adding a new ingress source (Phase 2 / 3)

Each source is a thin Next.js route that:

1. Verifies the source's authentication scheme (HMAC, signed JWT, etc).
2. Normalises the payload to `NormalizedCommand` (see `lib/command-plane/types.ts`).
3. Calls `routeCommand(supabase, input, { handlers: phase1Handlers })`.
4. Sends back any source-specific reply.

Slack and Email reuse the entire `lib/command-plane` core — only the route file is new.

## 9. Operations runbook

### Set kill switch (emergency stop)

```sql
-- as service role, from ops console SQL editor
update public.system_modes
   set mode = 'emergency_stop',
       reason = '<incident link or one-line>',
       set_at = now(),
       set_by = '<your profile.id>'
 where scope_type = 'global' and scope_id is null;
```

### Reset to normal

```sql
update public.system_modes
   set mode = 'normal', reason = 'incident closed', set_at = now()
 where scope_type = 'global' and scope_id is null;
```

### Disable Telegram ingress without touching DB

```powershell
.\scripts\configure-telegram-webhook.ps1 -Clear
```

Telegram stops sending updates within seconds; the route remains deployed (no rebuild required).

### Replay failed commands (manual, Phase 1)

```sql
select id, source, command, rejection_reason, received_at
  from public.command_requests
 where status = 'failed' and received_at > now() - interval '24 hours'
 order by received_at desc;

-- Inspect the matching error_events:
select error_message, event_payload, occurred_at
  from public.error_events
 where source_type like 'command_%'
   and trace_ref = '<trace_id from command_requests>'
 order by occurred_at desc;
```

To replay, send the same command from Telegram with a fresh message (Telegram update_id will differ, so idempotency does not block replay).

## 10. Verification

Run from monorepo root after any deploy:

```powershell
.\scripts\command-plane-smoke.ps1 `
  -BaseUrl https://app.aware-wave.com `
  -SupabaseUrl https://supabase.aware-wave.com `
  -SupabaseServiceRoleKey $env:SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY `
  -TelegramWebhookSecret $env:TELEGRAM_WEBHOOK_SECRET `
  -TestUserId $env:TELEGRAM_ALLOWED_USER_IDS.Split(',')[0] `
  -TestChatId $env:TELEGRAM_ALLOWED_CHAT_IDS.Split(',')[0] `
  -ReportPath .\agency-os\reports\status\command-plane-smoke-LATEST.json
```

The smoke test runs eight checks (see script header). Exit 0 = all green.

## 11. Phase 2 / 3 roadmap

- **Phase 2**: wire `/api/internal/commands/dispatch` to Trigger.dev's `dispatch-action-run` task; lift medium-risk commands; ops console UI for approvals + system_modes.
- **Phase 3**: Slack / Email ingress, Anthropic Routines integration (replace parts of `run-weekly-automation.ps1`), automated monthly restore drills, kill-switch one-click UI.

## 12. Related documents

- `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE_OPERATIONS.md` — **operator manual** (roles / functions / settings / troubleshooting)
- `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md` — Telegram-specific authentication and rate-limiting policy
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` — tool / MCP boundary spec
- `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` — 30-year execution contract
- `agency-os/docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md` — Sentry / PostHog / Uptime Kuma baseline this plane reuses

_Last updated: 2026-05-07_
