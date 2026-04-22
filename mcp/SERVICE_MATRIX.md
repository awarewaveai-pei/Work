# Service Matrix

This matrix describes how the shared MCP setup reaches each AwareWave service.

## Direct or official MCP

- `GitHub`: official GitHub MCP server
- `Supabase B`: hosted Supabase MCP (`supabase`)
- `Supabase A`: hosted Supabase MCP (`supabase-a`)
- `Trigger.dev`: local wrapper around `scripts/start-trigger-mcp.ps1`
- `n8n`: remote HTTP MCP
- `Cloudflare`: remote MCP endpoint
- `PostHog`: remote MCP endpoint
- `Resend`: official `resend-mcp`

## AwareWave Ops MCP

These services are exposed through the local `awarewave-ops` wrapper so any MCP-capable AI client can call their HTTP APIs through one consistent tool:

- `api.aware-wave.com`
- `app.aware-wave.com`
- `Hetzner`
- `Uptime Kuma`
- `Grafana`
- `Netdata`
- `Slack`
- `Sentry`
- `Resend API`
- `Cloudflare API`
- `PostHog API`
- `n8n REST API`
- `Trigger API`
- `Supabase A REST`
- `Supabase B REST`

## Notes

- `Slack` has an official MCP offering, but this repo currently standardizes on `awarewave-ops` for machine-to-machine API control.
- `Grafana` supports MCP in some product areas, but your current control-plane workflows are better handled through the local wrapper plus repo scripts.
- `Uptime Kuma`, `Hetzner`, and `Netdata` are treated as custom integrations in this repo.
