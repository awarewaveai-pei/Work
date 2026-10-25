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

## How to run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\client-status.ps1              # all clients
powershell -ExecutionPolicy Bypass -File .\scripts\client-status.ps1 -Slug soulful # one client, full detail
```

The script reads Supabase `organizations` directly (service-role key from `mcp/user-env.ps1`) and HEAD-probes each `client_config.site_url` -- the same data and probe as the Telegram `/client_status` (`next-admin lib/command-plane/handlers/clientStatus.ts`). Do NOT call `/api/ops/clients`: it is behind the staff session cookie (`middleware.ts`), so curl gets 401/404 and the old Basic-auth recipe no longer works.

## What to report

Per client: health (HTTP code + latency), platform/hosting, and for WordPress the last `wp_update_latest` (updated / failed / licence-gated, group, health_final, last run). With `-Slug`: every result row, wave1/2/3 lists, dashboard link `https://app.aware-wave.com/ops/clients/<slug>`.

`wp_update_latest` is written only by the dashboard one-click update (`update-client-wp-plugins.ps1`); updates done by WP-CLI on the host do not appear there, so an old "last run" does not mean the site was never maintained -- say so instead of calling it stale.

## Data source

`organizations.metadata.client_config` + `organizations.metadata.wp_update_latest` in Supabase.
The script reads these two fields; nothing else is needed.

## Owner doc

`scripts/client-status.ps1`; the Telegram equivalent is `/client_status` (`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/handlers/clientStatus.ts`).
