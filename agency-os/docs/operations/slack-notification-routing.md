# Slack and Telegram Notification Routing

This is the current AwareWave notification contract. Keep this page aligned with:

- `scripts/sync-slack-alert-webhooks.ps1`
- `lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`
- `lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/notify/*`

## Channel Contract

| Channel | Role | Expected producers | Notes |
| --- | --- | --- | --- |
| `#infra-alerts` | Tier 1 firehose for infrastructure signals | endpoint-alert, Grafana contact point, other raw infra monitors | Noisy is acceptable. This channel must not depend on Ops Inbox being healthy. |
| `#ops-incidents` | Tier 2 curated incident stream | endpoint-alert secondary webhook, SG deploy drift, Ops Inbox notifications | Deduped/throttled where possible. This is the channel humans should triage first. |

Telegram is not a third Slack channel. It is the phone backup for operator-critical signals:

| Surface | Role | Expected producers | Notes |
| --- | --- | --- | --- |
| Telegram bot DM | Phone backup and command plane | endpoint-alert, SG deploy drift, Ops Inbox notifications, Telegram command ingress | Use only for human-actionable signals. It must not become the raw firehose. |

Do not route Ops Inbox notifications back into `#infra-alerts`. A monitor may feed both layers from the same source event, but the direction must stay one-way:

```text
raw monitor -> #infra-alerts
raw monitor -> Ops Inbox -> #ops-incidents
```

This avoids notification loops, duplicate fan-out, and ambiguous ownership.

## Current Producers

### endpoint-alert

- Checks the public URL set in `CHECK_URLS`.
- Sends failure/recovery through `scripts/notify.sh` (2026-10-25): Telegram + `#ops-incidents` + `#infra-alerts` (`SLACK_INFRA_ALERTS_WEBHOOK`).
- State lives under `/var/lib/awarewave-alert` to dedupe repeated identical failures.

### Netdata

- ks-aw-01 (2026-10-25): Netdata alerts through Netdata Cloud (claimed; email). The host has no `health_alarm_notify.conf`, so neither the old direct Slack route nor the `custom_sender()` -> Ops Inbox route runs; `sync-slack-alert-webhooks.ps1` no longer writes them (`lobster-factory/infra/netdata/README.md` still describes the EU-era setup).

### Ops Inbox

- Accepts Sentry, Grafana, Uptime Kuma, Netdata, and PostHog webhooks.
- Sends to `#ops-incidents` via `OPS_INBOX_SLACK_INCIDENTS_WEBHOOK`.
- For repairable incidents, Slack messages may include interactive buttons:
  - `approve_repair` posts to `/api/internal/commands/slack`, verifies `SLACK_SIGNING_SECRET`, then starts the same Repair Center flow used by `/ops/repairs`.
  - `acknowledge_only` records no repair run and is only a human acknowledgement.
- Sends a phone backup to Telegram when `OPS_INBOX_TELEGRAM_NOTIFY_ENABLED=true`.
- Telegram minimum severity is `OPS_INBOX_TELEGRAM_NOTIFY_MIN_SEVERITY` and defaults to `medium`.
- Telegram uses `OPS_INBOX_TELEGRAM_CHAT_IDS`, or falls back to `TELEGRAM_ALLOWED_CHAT_IDS`.
- Notification rules:
  - new incident: send
  - severity escalation: send
  - reopened incident: send
  - duplicate: send only after the throttle window
  - development environment: skip
  - ignored incident: skip

### SG deploy drift

- Cron runs `/root/lobster-phase1/scripts/check-drift-and-alert.sh` daily at `20:00 UTC` (`04:00 Asia/Taipei`), an hour after the nightly auto-deploy.
- Alerts when production is at least one commit behind `origin/main`.
- Sends through `scripts/notify.sh` (Telegram when switched on + `#ops-incidents` + its own `SLACK_WEBHOOK_URL` channel); the dedupe key advances only when every channel took it.

## Health Contract

`/api/ops/probe` is the liveness heartbeat for Ops Inbox ingest. It upserts `ops_health_probes('ops-inbox')`.

`/api/ops/inbox/health` must read that probe row, not the latest incident. A healthy system can have zero incidents for days.

SG cron should call `/api/ops/probe` every 30 minutes. Health is expected to return:

```json
{
  "ok": true,
  "ingest_fresh": true,
  "probe_status": "ok"
}
```

## Validation

Run on SG:

```bash
/root/lobster-phase1/scripts/slack-alert-drill.sh
curl -fsS https://app.aware-wave.com/api/ops/inbox/health
```

Expected:

- `#infra-alerts` receives endpoint/Netdata drill messages.
- `#ops-incidents` receives endpoint secondary and Ops Inbox Netdata drill messages.
- Telegram receives endpoint failures/recoveries and curated Ops Inbox incidents at or above the configured severity.
- `/api/ops/inbox/health` returns HTTP 200.

## Invariants

- Never commit Slack webhook URLs or ingest tokens.
- Never commit Telegram bot tokens or chat IDs.
- `sync-slack-alert-webhooks.ps1` writes only `.env` `SLACK_INFRA_ALERTS_WEBHOOK` from vault `SLACK_INFRA_ALERTS_WEBHOOK`, and stops when the host already holds a different URL (`-ReplaceUrl` to rotate). Vault `AGENCY_OS_SLACK_WEBHOOK_URL` is another channel, never #infra-alerts.
- Keep `/etc/default/awarewave-endpoint-alert.local` as the operator override file for custom `CHECK_URLS`, heartbeat, and renotify settings.
- Every host script sends through `lobster-factory/infra/hetzner-phase1-core/scripts/notify.sh`: Telegram (`OPS_INBOX_TELEGRAM_CHAT_IDS`, when `OPS_INBOX_TELEGRAM_NOTIFY_ENABLED` is on) + `#ops-incidents` (`OPS_INBOX_SLACK_INCIDENTS_WEBHOOK`), plus a script's own channel by name. Settings live in `/root/lobster-phase1/.env` (same names next-admin uses). `/etc/default/awarewave-endpoint-alert*` holds no channel settings since 2026-10-25: main file `TIMEOUT_SEC`, `.local` `CHECK_URLS`/`CHECK_URLS_SLOW`/`HEARTBEAT_URL`, optional `.pagerduty`.
- Schedules on `/ops/schedules` that turn red or recover are announced by next-admin (`/api/internal/schedules/alerts`), plus a daily 09:00 Taipei line; no host script needs its own "I failed" message.
- Treat `#infra-alerts` as raw signal durability and `#ops-incidents` as human triage quality.
