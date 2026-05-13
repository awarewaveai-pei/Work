# generate-customer-delivery-status.ps1
# M3 Next-Gen alignment: queries Supabase for all client orgs and outputs
# reports/status/customer-delivery-status-LATEST.md — a machine-readable
# per-client snapshot covering health, WP update status, and 20-department
# coverage, cross-referenced to DEPARTMENT_COVERAGE_MATRIX.md.
#
# Called by generate-integrated-status-report.ps1 automatically.
# Can also run standalone: .\scripts\generate-customer-delivery-status.ps1
#
# Requires env vars (set via secrets-vault or .env):
#   SUPABASE_URL             — e.g. https://xyz.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY — service role key (read-only path only)
#   NEXT_PUBLIC_APP_URL       — optional, for department-summary API call
#                               falls back to computing from metadata directly

param(
    [string]$WorkspaceRoot = "",
    [string]$SupabaseUrl   = "",
    [string]$SupabaseKey   = "",
    [string]$AppBaseUrl    = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve paths ─────────────────────────────────────────────────────────────

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) {
        $candidate = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
        $aoCandidate = Join-Path $candidate "agency-os"
        if (Test-Path (Join-Path $aoCandidate "TASKS.md")) { return $aoCandidate }
        return $candidate
    }
    return (Get-Location).Path
}

$root    = Resolve-Root $WorkspaceRoot
$outDir  = Join-Path $root "reports\status"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$stamp     = (Get-Date -Format "yyyyMMdd-HHmmss")
$outFile   = Join-Path $outDir ("customer-delivery-status-$stamp.md")
$latestFile = Join-Path $outDir "customer-delivery-status-LATEST.md"

# ── Resolve credentials ───────────────────────────────────────────────────────

if (-not $SupabaseUrl)  { $SupabaseUrl  = $env:SUPABASE_URL }
if (-not $SupabaseKey)  { $SupabaseKey  = $env:SUPABASE_SERVICE_ROLE_KEY }
if (-not $AppBaseUrl)   { $AppBaseUrl   = $env:NEXT_PUBLIC_APP_URL }

# ── 20-department cluster catalog (mirrors department-catalog.ts) ─────────────
# Stable IDs; do not change without a change-request.

$ALL_CLUSTERS = @(
    [PSCustomObject]@{ id="CLU_STRATEGY_GOVERN"; label="董事/策略/治理";       group="core";         smb="on" }
    [PSCustomObject]@{ id="CLU_FINANCE";          label="財務/管理會計";         group="core";         smb="on" }
    [PSCustomObject]@{ id="CLU_SECURITY_IT";      label="資安/身分/存取";        group="core";         smb="on" }
    [PSCustomObject]@{ id="CLU_ENGINEERING";      label="工程技術/DevOps";      group="platform";     smb="on" }
    [PSCustomObject]@{ id="CLU_ORDER_OPS";        label="訂單/客服/交付";        group="core";         smb="on" }
    [PSCustomObject]@{ id="CLU_MARKETING";        label="市場行銷";              group="revenue";      smb="by_industry" }
    [PSCustomObject]@{ id="CLU_PRODUCT";          label="產品管理/UX";           group="platform";     smb="by_industry" }
    [PSCustomObject]@{ id="CLU_SALES_BD";         label="銷售/商務拓展";         group="revenue";      smb="off" }
    [PSCustomObject]@{ id="CLU_CUSTOMER_SUCCESS"; label="客戶成功/CRM";          group="revenue";      smb="by_industry" }
    [PSCustomObject]@{ id="CLU_PROCUREMENT";      label="採購/供應商";           group="supply_chain"; smb="off" }
    [PSCustomObject]@{ id="CLU_LOGISTICS";        label="物流/倉儲/履約";        group="supply_chain"; smb="off" }
    [PSCustomObject]@{ id="CLU_DATA_AI";          label="數據/BI/AI";            group="platform";     smb="off" }
    [PSCustomObject]@{ id="CLU_PRIVACY_RETENTION";label="資料/隱私/留存";        group="horizontal";   smb="by_industry" }
    [PSCustomObject]@{ id="CLU_RISK_FRAUD";       label="風控/反詐欺";           group="horizontal";   smb="off" }
    [PSCustomObject]@{ id="CLU_TAX_TRADE";        label="稅務/關務";             group="cross_border"; smb="off" }
    [PSCustomObject]@{ id="CLU_LEGAL";            label="法務/合規";             group="cross_border"; smb="off" }
    [PSCustomObject]@{ id="CLU_HR";               label="人力資源";              group="support";      smb="off" }
    [PSCustomObject]@{ id="CLU_BRAND_COMMS";      label="對外溝通/品牌";         group="horizontal";   smb="by_industry" }
    [PSCustomObject]@{ id="CLU_REGIONAL";         label="區域/國際化營運";       group="cross_border"; smb="off" }
    [PSCustomObject]@{ id="CLU_IR";               label="投資人關係/IR";          group="support";      smb="off" }
)

function Get-Tier {
    param([string[]]$ActiveIds)
    $n = $ActiveIds.Count
    if ($n -eq 0) { return "not_configured" }
    $crossBorder = @("CLU_TAX_TRADE","CLU_LEGAL","CLU_REGIONAL") | Where-Object { $ActiveIds -contains $_ }
    if ($n -ge 14 -or $crossBorder.Count -gt 0) { return "enterprise" }
    if ($n -ge 8)  { return "growth" }
    return "smb"
}

# ── Query Supabase ────────────────────────────────────────────────────────────

$rows = @()

if ($SupabaseUrl -and $SupabaseKey) {
    try {
        $headers = @{
            "apikey"        = $SupabaseKey
            "Authorization" = "Bearer $SupabaseKey"
            "Content-Type"  = "application/json"
        }
        $uri = "$($SupabaseUrl.TrimEnd('/'))/rest/v1/organizations?select=id,slug,name,type,status,metadata&order=created_at.asc"
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method GET -TimeoutSec 15
        $rows = $response
    } catch {
        Write-Warning "generate-customer-delivery-status: Supabase query failed — $($_.Exception.Message)"
        Write-Warning "Report will be generated with 'no data' notice."
    }
} else {
    Write-Warning "generate-customer-delivery-status: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Report will reflect no data."
}

# ── Build report ──────────────────────────────────────────────────────────────

$sb = [System.Text.StringBuilder]::new()

[void]$sb.AppendLine("# Customer Delivery Status")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> **Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') UTC+0")
[void]$sb.AppendLine("> **Source:** Supabase ``organizations.metadata`` (client_config + 20-department selection)")
[void]$sb.AppendLine("> **SSOT:** ``agency-os/tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md``")
[void]$sb.AppendLine("> **M3 Next-Gen alignment:** console output mapped to 20-department responsibility matrix.")
[void]$sb.AppendLine("")

if ($rows.Count -eq 0) {
    [void]$sb.AppendLine("_No client data available. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars._")
} else {
    # ── Summary table ─────────────────────────────────────────────────────────
    [void]$sb.AppendLine("## Summary ($($rows.Count) clients)")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Client | Status | Platform | Dept Coverage | Tier | WP Last Run | Dept Reviewed |")
    [void]$sb.AppendLine("|--------|--------|----------|---------------|------|-------------|---------------|")

    foreach ($row in $rows) {
        $meta   = $row.metadata
        $cfg    = if ($meta -and $meta.client_config) { $meta.client_config } else { [PSCustomObject]@{} }
        $wp     = if ($meta -and $meta.wp_update_latest) { $meta.wp_update_latest } else { $null }

        $platform = if ($cfg.platform) { $cfg.platform } else { "—" }
        $status   = if ($row.status)   { $row.status }   else { "—" }

        # Department coverage
        $deptIds = @()
        if ($cfg.department_selection -and $cfg.department_selection -is [System.Array]) {
            $deptIds = @($cfg.department_selection)
        }
        $deptCount   = $deptIds.Count
        $deptTotal   = 20
        $deptPct     = if ($deptTotal -gt 0) { [int][Math]::Round($deptCount / $deptTotal * 100) } else { 0 }
        $tier        = Get-Tier -ActiveIds $deptIds
        $deptReviewed = if ($cfg.department_selection_reviewed_at) { $cfg.department_selection_reviewed_at } else { "未記錄" }
        $coverageStr = if ($deptCount -eq 0) { "**未設定**" } else { "$deptCount/$deptTotal ($deptPct%)" }

        # WP
        $wpStr = if ($wp -and $wp.ran_at) {
            $ranAt = [datetime]::Parse($wp.ran_at)
            $days  = [int]([datetime]::UtcNow - $ranAt).TotalDays
            if ($days -eq 0) { "今日" } elseif ($days -eq 1) { "昨日" } else { "${days}天前" }
        } else { "—" }

        [void]$sb.AppendLine("| $($row.name) | $status | $platform | $coverageStr | $tier | $wpStr | $deptReviewed |")
    }
    [void]$sb.AppendLine("")

    # ── Per-client department detail ─────────────────────────────────────────
    [void]$sb.AppendLine("## Per-Client Department Detail")
    [void]$sb.AppendLine("")

    foreach ($row in $rows) {
        $meta = $row.metadata
        $cfg  = if ($meta -and $meta.client_config) { $meta.client_config } else { [PSCustomObject]@{} }

        $deptIds = @()
        if ($cfg.department_selection -and $cfg.department_selection -is [System.Array]) {
            $deptIds = @($cfg.department_selection)
        }
        $activeSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($id in $deptIds) { [void]$activeSet.Add($id) }

        $tier = Get-Tier -ActiveIds $deptIds

        [void]$sb.AppendLine("### $($row.name) (``$($row.slug)``)")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("- **Tier:** $tier")
        [void]$sb.AppendLine("- **Active departments:** $($deptIds.Count) / 20")
        [void]$sb.AppendLine("- **Last reviewed:** $(if ($cfg.department_selection_reviewed_at) { $cfg.department_selection_reviewed_at } else { 'N/A' })")
        [void]$sb.AppendLine("")

        if ($deptIds.Count -eq 0) {
            [void]$sb.AppendLine("> ⚠ ``department_selection`` not set in Supabase metadata. Update ``organizations.metadata.client_config.department_selection`` with a ``ClusterId[]``.")
            [void]$sb.AppendLine("")
            continue
        }

        [void]$sb.AppendLine("| Cluster | Label | Active |")
        [void]$sb.AppendLine("|---------|-------|--------|")
        foreach ($c in $ALL_CLUSTERS) {
            $active = if ($activeSet.Contains($c.id)) { "yes" } else { "—" }
            [void]$sb.AppendLine("| ``$($c.id)`` | $($c.label) | $active |")
        }
        [void]$sb.AppendLine("")
    }
}

[void]$sb.AppendLine("---")
[void]$sb.AppendLine("_Cross-reference: ``agency-os/tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md``_")
[void]$sb.AppendLine("_API: ``GET /api/ops/clients/:slug/department-summary``_")

# ── Write output ──────────────────────────────────────────────────────────────

$text = $sb.ToString()
Set-Content -LiteralPath $outFile    -Value $text -Encoding UTF8
Set-Content -LiteralPath $latestFile -Value $text -Encoding UTF8

Write-Output "Customer delivery status: reports/status/$([System.IO.Path]::GetFileName($outFile))"
Write-Output "Also written to: reports/status/customer-delivery-status-LATEST.md"
