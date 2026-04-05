param(
    [Parameter(Mandatory = $true)]
    [string]$TenantSlug,
    [Parameter(Mandatory = $true)]
    [string]$ProjectSlug,
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$runKey = "$stamp-$TenantSlug-$ProjectSlug"
$targetDir = Join-Path $root ("reports\e2e\onboarding-a10-2\" + $runKey)

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$createdAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$context = @"
# Onboarding/A10-2 Evidence Context

- tenant_slug: $TenantSlug
- project_slug: $ProjectSlug
- run_key: $runKey
- created_at: $createdAt
- traceability_spec: docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md
"@
Set-Content -LiteralPath (Join-Path $targetDir "00-context.md") -Value $context -Encoding UTF8

$p1 = @"
# Onboarding Evidence (NEW_TENANT_ONBOARDING_SOP)

## Checklist
- [ ] Tenant skeleton created
- [ ] First site created
- [ ] First project created
- [ ] Security/access baseline completed
- [ ] TASKS/WORKLOG/memory updated

## Evidence
- tenant path:
- project path:
- health report:
- notes:
"@
Set-Content -LiteralPath (Join-Path $targetDir "01-onboarding-evidence.md") -Value $p1 -Encoding UTF8

$p2 = @"
# A10-2 Evidence (Business Loop)

## Checklist
- [ ] Staging flow executed
- [ ] Acceptance evidence captured
- [ ] Production trigger prepared/executed (as approved)
- [ ] Artifacts/logs_ref recorded
- [ ] WORKLOG + memory synced

## Evidence
- workflow_run_id:
- package_install_run_id:
- logs_ref:
- e2e_report_path:
- rollback_path (if any):
- notes:
"@
Set-Content -LiteralPath (Join-Path $targetDir "02-a10-2-evidence.md") -Value $p2 -Encoding UTF8

$runMap = @"
# Run ID Map

| tenant_slug | project_slug | workflow_run_id | package_install_run_id | logs_ref | git_commit | e2e_report_path | status | note |
|---|---|---|---|---|---|---|---|---|
| $TenantSlug | $ProjectSlug |  |  |  |  |  | planned | skeleton initialized |
"@
Set-Content -LiteralPath (Join-Path $targetDir "03-run-id-map.md") -Value $runMap -Encoding UTF8

Write-Host ("Onboarding/A10-2 evidence skeleton created: " + $targetDir) -ForegroundColor Green
