---
name: command-plane-verify
description: Diagnose a silent Telegram command-plane bot: run the -Verify check and inspect the container environment on the host.
---

Diagnose why the Telegram bot is silent. Runs the -Verify check and inspects docker env on SG.

## Step 1 — Webhook URL + recent errors (local, no SSH needed)

Run from monorepo root (requires TELEGRAM_BOT_TOKEN in env — run `/vault-sync` first if needed):

```powershell
.\scripts\configure-telegram-webhook.ps1 -Verify
```

Read the output:
- `URL match: OK` + `Last error: none` → webhook side is fine, go to Step 2
- `URL match: MISMATCH` → re-register: `.\scripts\configure-telegram-webhook.ps1`
- `Last error: 400 Bad Request` → secret mismatch between Telegram and server, go to Step 3

## Step 2 — Docker env check (requires SSH to ks-aw-01: `-p 58122 ubuntu@145.239.195.47`, sudo)

```bash
docker inspect lobster-next-admin --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'TELEGRAM|COMMAND_PLANE'
```

Must see ALL of these:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_USER_IDS`
- `COMMAND_PLANE_DEFAULT_ORG_ID`

If any are missing → add to `/root/lobster-phase1/.env`, then rebuild:
```bash
cd /root/lobster-phase1 && docker compose --env-file .env up -d --build next-admin
```

> `COMMAND_PLANE_DEFAULT_WORKSPACE_ID` must be a valid UUID or **empty string** — whitespace causes a silent uuid parse error.

## Step 3 — Secret drift check

Compare vault secret (local) vs server `.env`:

```powershell
# Local vault value:
.\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_WEBHOOK_SECRET   # 輸出為遮罩，僅供確認存在（真值在 mcp\user-env.ps1）   # 輸出為遮罩，僅供確認存在（真值在 mcp\user-env.ps1）
```

```bash
# Server value (SSH):
grep TELEGRAM_WEBHOOK_SECRET /root/lobster-phase1/.env
```

If they differ → copy vault value into server `.env` → rebuild next-admin.

## Step 4 — Verify fix

After rebuild, send `/status` to `@awarewave_ops_bot`. Should respond within 5 seconds.

For a full 8-check smoke test: `.\scripts\command-plane-smoke.ps1 -BaseUrl https://app.aware-wave.com`

## Quick reference

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| URL MISMATCH in -Verify | Webhook not set | Re-run configure-telegram-webhook.ps1 |
| Pending msgs accumulate, URL OK | Server not accepting → missing env var | Step 2 |
| last_error: 400 | Secret drift | Step 3 |
| Intermittent replies | WORKSPACE_ID has whitespace | Set to empty string or UUID |
| Sentry `command_plane.startup.env_missing` | Cold-start with missing env vars | Step 2 |

Full runbook: `runbooks/COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md`
