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

## Report

After running, summarize:
- Pass/fail for each of the 4 DoD checks
- Any `missingSources` (means `ops_action_runs` has no rows with that `metadata.source` value — seed required)
- Next step for any failing check
