# Telegram Command Policy

> Companion to `COMMAND_PLANE_RUNBOOK.md`. This file is owner-of-truth for Telegram-specific authentication, allowlist, hard blocks, audit, and rate-limiting rules. The general routing / risk table lives in the command plane doc.

## 1. Authentication (request-level)

Every `POST /api/internal/commands/telegram` request must satisfy all three:

1. Header `X-Telegram-Bot-Api-Secret-Token` equals env `TELEGRAM_WEBHOOK_SECRET` (timing-safe compare). Set during `setWebhook`.
2. JSON body parses as a Telegram `Update` with `update_id` and `message.from.id`.
3. `message.from.id` is in env `TELEGRAM_ALLOWED_USER_IDS` (csv) **and** `message.chat.id` is in `TELEGRAM_ALLOWED_CHAT_IDS` (csv).

Any failure:

- writes one row to `error_events` with `source_type = 'telegram_auth_failed'`,
- captures a Sentry warning (no PII beyond redacted payload),
- returns `200 OK` with no body content. We do not return `401` — that would let an attacker enumerate which secret values are wrong.

## 2. Risk routing (Telegram-specific projections)

| Risk | Telegram behaviour |
|---|---|
| low | dispatched inline; replies with handler text |
| medium | `command_requests.status = 'queued'`; replies "queued for approval"; Phase 2 picks up |
| high | hard-blocked from Telegram; replies "this command must be issued from ops console" |
| critical | hard-blocked from any source; replies "command not permitted from any external source" |
| unknown | `status='blocked_by_policy'`, `rejection_reason='unknown_command'` |

The full RISK_TABLE lives in `lib/command-plane/policyEngine.ts`.

## 3. Hard blocks (defence-in-depth)

Even if the actor is in the allowlist, the policy engine drops any command whose args contain:

- `--no-verify`
- `--force`
- shell metacharacters: `;`, `&`, `|`, backtick, `$(`

These are `risk='critical'` blocks (status = `blocked_by_policy`, reason = `forbidden_arg_pattern`).

## 4. Audit

Every Telegram update — including those that are silently dropped at the auth layer — produces at least one persistent record:

- successful or policy-blocked commands → `command_requests` row (with `status` reflecting outcome)
- auth failures → `error_events` row (`source_type = 'telegram_auth_failed'`)

Both rows carry the redacted payload for forensic replay. PII keys (`token`, `password`, `auth*`, `cookie`, `session`, `credential`) are scrubbed via `lib/ops-inbox/redactSecrets.ts` before logging.

## 5. Rate limiting (Phase 1 stance)

Phase 1 does not implement automatic rate-limiting in code. The single-actor deployment + Cloudflare DNS + Telegram's own server-side rate limits (≈ 30 messages/sec to a single chat) make abuse impractical. Phase 2 adds:

- per-actor rolling counter in `command_requests` (already indexable via `actor_type, actor_ref`),
- automatic flip to `system_modes.scope='client', mode='read_only'` for 30 minutes when a single actor exceeds 10 commands per 60 seconds,
- Slack alert on auto-flip.

## 6. Bot creation (one-time, by the operator)

Telegram's API does **not** allow programmatic bot creation. The operator must:

1. Open Telegram, search for `@BotFather`, send `/newbot`.
2. Follow prompts: choose display name, then a unique username ending in `bot`.
3. Save the bot token from BotFather (format `123456789:ABC-...`).
4. From the same chat, find your numeric user id by sending `/start` to `@userinfobot` (or any equivalent).
5. From monorepo root:
   ```powershell
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_BOT_TOKEN -Value '<paste from BotFather>'
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_WEBHOOK_SECRET -Value (
     [Convert]::ToBase64String([byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   )
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_ALLOWED_USER_IDS -Value '<your numeric user id>'
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_ALLOWED_CHAT_IDS -Value '<your numeric user id>'
   .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env
   ```
6. Open a fresh PowerShell session, then:
   ```powershell
   .\scripts\configure-telegram-webhook.ps1
   ```
7. In Telegram, send `/status` to your bot. Expected: a system-status reply within ≈ 30 s.

## 7. Related documents

- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` — owner doc for the full plane
- `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql` — schema
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/` — implementation

_Last updated: 2026-05-07_
