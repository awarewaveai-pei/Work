---
name: smoke-test
description: Run the daily mechanical smoke tests and report overall plus blind_spots verbatim from the JSON, without arithmetic.
---

Run the daily mechanical smoke tests. This is the first check after AO-RESUME — runs automatically on session start per Blueprint §3.

## 1. Ops-console DoD (primary daily check)

Covers tenant, workflow sources, permissions, and audit events in one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ops-console-smoke.ps1 `
  -BaseUrl https://app.aware-wave.com `
  -TenantId <org-uuid> -ExpectedTenantId <org-uuid> -ExpectedTenantSlug awarewave-ops `
  -ExpectedMinWorkflowRuns 1 -ExpectedWorkflowSources trigger,n8n `
  -EnableWriteChecks -EnableRoleChecks `
  -ReportPath .\agency-os\reports\status\ops-console-smoke-LATEST.json
```

What this checks:
- **tenant** — `/api/ops/summary` reflects the correct tenant slug
- **source** — workflow runs include both `trigger` and `n8n` (`runSource` from `ops_action_runs.metadata.source`)
- **permissions** — viewer role gets 403 on writes; admin succeeds
- **audit** — AI job creation produces a traceable `ai_image_job_created` audit event

If `TenantId` is unknown, run bootstrap first:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ops-console-bootstrap.ps1 `
  -SupabaseUrl <url> -SupabaseServiceRoleKey <key> `
  -TenantSlug awarewave-ops -TenantName "AwareWave Ops"
```

## 2. n8n MCP connectivity

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

Exit 3 + `TRY_ALT_MCP_URL` = wrong URL path; check `docs/operations/n8n-self-hosted-mcp-troubleshooting.md`.

## 3. Network pre-check (if connectivity is suspect)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ops-network-precheck.ps1 `
  -AppBaseUrl https://app.aware-wave.com `
  -SupabaseUrl https://supabase.aware-wave.com `
  -ApiHealthUrl https://api.aware-wave.com/health
```

## 4. Repair Center health gate

Checks backup gate, GitHub token, Slack signing secret, DB table, and system mode in one call:

```powershell
$resp = Invoke-RestMethod -Uri "https://app.aware-wave.com/api/ops/repairs/health" `
  -Headers @{ Authorization = "Bearer $env:OPS_API_TOKEN" }
$resp | ConvertTo-Json -Depth 3
```

Expected healthy response (`ok: true`, HTTP 200):
```json
{
  "ok": true,
  "system_mode": "normal",
  "active_runs": 0,
  "table_ok": true,
  "backup_configured": true,
  "backup_mode": "webhook|ssh",
  "github_configured": true,
  "slack_signing_configured": true,
  "deploy_mode": "manual_sg_deploy_only"
}
```

If HTTP **404** → Repair Center not yet deployed to SG. Run `/sg-deploy` then recheck.

If `ok: false` (HTTP 503), check the fields:

| Field | `false` means | Fix |
|-------|---------------|-----|
| `table_ok` | `repair_runs` table missing or Supabase unreachable | Apply migration `0027_repair_runs.sql` |
| `backup_configured` | No `AUTO_REPAIR_BACKUP_WEBHOOK_URL` and no SSH keys set | Add env vars to server `.env`, rebuild |
| `github_configured` | No `AUTO_REPAIR_GITHUB_TOKEN` / `GITHUB_TOKEN` | Add to server `.env`, rebuild |
| `slack_signing_configured` | No `SLACK_SIGNING_SECRET` | Add to server `.env`, rebuild |
| `system_mode != "normal"` | Kill switch active | Unlock via `/ops/system-modes` or Telegram → web ops console |

If auth is needed and `OPS_API_TOKEN` is not set, open the URL in a browser (Clerk SSO).

## Report

After running, summarize:
- Pass/fail for each of the 4 DoD checks
- Any `missingSources` (means `ops_action_runs` has no rows with that `metadata.source` value — seed required)
- Repair Center: `ok` status + any `false` fields with fix recommendation
- Next step for any failing check
