---
name: client-status
description: Show health and WordPress plugin update status for every client, or one named client.
argument-hint: [client-slug]
---

Show health and WordPress plugin update status for all clients (or one specific client).

## Usage

```
/client-status              # all clients
/client-status soulful      # one client by slug (partial match OK)
```

## What to show

Fetch `GET /api/ops/clients` from the running Next.js instance, then for each org:

1. **Health** — HTTP status + latency (already in the API response)
2. **WP update summary** — `wp_update_latest`: updated_count, failed_count, pending_license_count, ran_at, plugins_group
3. **SSH or MainWP** — how this client's updates are managed

Format as a compact table:

```
┌─ Clients (2/2 healthy) ─────────────────────────────────┐
│ AwareWave Ops        SaaS/hetzner   ● HTTP 200  67ms    │
│ Soulful Expression   WP/hostinger   ● HTTP 200  25ms    │
│   WP: ✅ 4 updated · 0 failed · wave1 · 今日            │
└──────────────────────────────────────────────────────────┘
```

If a specific slug is given, show full detail:
- All wave assignments (wave1/wave2/wave3 plugin lists)
- Last run timestamp + health_final
- License-gated plugins (skipped_license)
- Link to dashboard: https://app.aware-wave.com/ops/clients/<slug>

## Implementation

```powershell
# Quick check via curl on ks-aw-01 (for reference)
ssh -i "$HOME\.ssh\id_ed25519" -p 58122 ubuntu@145.239.195.47 `
  "sudo curl -s http://127.0.0.1:3002/api/ops/clients" | ConvertFrom-Json | Select-Object -Expand clients
```

Or call directly if the dashboard is reachable:
```
GET https://app.aware-wave.com/api/ops/clients
Header: Authorization: Basic <base64(awarewave:<GRAFANA_BASIC_PASSWORD>)>
```

## Data source

`organizations.metadata.client_config` + `organizations.metadata.wp_update_latest` in Supabase.
No extra queries needed — the API already aggregates everything.

## Owner doc

`agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md` §5 — `/client_status` is the Telegram equivalent of this slash command.
