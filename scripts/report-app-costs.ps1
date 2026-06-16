#requires -Version 5.1
<#
.SYNOPSIS
  AwareWave app AI + tool cost report. Pulls REAL usage from Supabase (ai_call_logs for exact
  text spend, ai_image_jobs for image volume) and writes a dated markdown report.

.DESCRIPTION
  Text spend is authoritative: ai_call_logs.cost_usd is computed + stored at call time by
  lib/ai/cost-calculator (so this script needs NO rate table -> zero drift from the TS SSOT).
  Image cost is reported as volume only here (counts by model); the per-image USD breakdown lives
  on /ops/costs (sourced from cost-model.ts IMAGE_RATES). Keeping rates out of this script is
  deliberate -- one source of truth (R4).

  Credentials: reads $env:SUPABASE_URL + $env:SUPABASE_SERVICE_ROLE_KEY. If absent, dot-sources
  mcp/user-env.ps1 (the documented per-machine credential location) when present.

.PARAMETER Days
  Lookback window in days (default 30).

.PARAMETER OutDir
  Report output directory (default agency-os/reports/cost).

.EXAMPLE
  pwsh ./scripts/report-app-costs.ps1 -Days 30
#>
[CmdletBinding()]
param(
  [int]$Days = 30,
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

# Resolve script dir robustly: $PSScriptRoot can be empty in a param default under -File on some
# hosts, so compute it in the body with a fallback.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $OutDir) { $OutDir = Join-Path $ScriptDir "..\agency-os\reports\cost" }

function Get-SupabaseCreds {
  # The app (next-admin) talks to the AwareWave Supabase. In the SG container the canonical names are
  # SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; locally mcp/user-env.ps1 aliases them as
  # SUPABASE_AWAREWAVE_*. Accept either (canonical first, then the AwareWave alias).
  function Resolve-Env([string[]]$names) { foreach ($n in $names) { $v = [Environment]::GetEnvironmentVariable($n); if ($v) { return $v } } return $null }

  $url = Resolve-Env @("SUPABASE_URL", "SUPABASE_AWAREWAVE_URL")
  $key = Resolve-Env @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY")
  if (-not $url -or -not $key) {
    $userEnv = Join-Path $script:ScriptDir "..\mcp\user-env.ps1"
    if (Test-Path $userEnv) {
      Write-Host "[info] SUPABASE creds not in env; dot-sourcing mcp/user-env.ps1"
      . $userEnv
      $url = Resolve-Env @("SUPABASE_URL", "SUPABASE_AWAREWAVE_URL")
      $key = Resolve-Env @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY")
    }
  }
  if (-not $url -or -not $key) {
    throw "SUPABASE_URL/_SERVICE_ROLE_KEY (or SUPABASE_AWAREWAVE_*) not set. Set them in env or mcp/user-env.ps1."
  }
  return @{ Url = $url.TrimEnd("/"); Key = $key }
}

function Invoke-Rest($creds, $path) {
  $headers = @{ apikey = $creds.Key; Authorization = "Bearer $($creds.Key)" }
  return Invoke-RestMethod -Uri "$($creds.Url)/rest/v1/$path" -Headers $headers -Method Get
}

$creds = Get-SupabaseCreds
$sinceUtc = (Get-Date).ToUniversalTime().AddDays(-$Days).ToString("yyyy-MM-ddTHH:mm:ssZ")
$today = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "[info] Pulling cost data since $sinceUtc (last $Days days)..."

# --- Text spend (exact, from ai_call_logs.cost_usd) ---
$textRows = @()
$textAvailable = $true
try {
  $textRows = Invoke-Rest $creds "ai_call_logs?select=route,model,vendor,cost_usd,input_tokens,output_tokens&created_at=gte.$sinceUtc&limit=100000"
} catch {
  $textAvailable = $false
  Write-Warning "ai_call_logs query failed (migration 0043 may not be applied yet): $($_.Exception.Message)"
}

$textByRoute = @{}
$textTotalUsd = 0.0
$textCalls = 0
foreach ($r in $textRows) {
  $route = if ($r.route) { $r.route } else { "(unknown)" }
  if (-not $textByRoute.ContainsKey($route)) { $textByRoute[$route] = @{ calls = 0; usd = 0.0; inTok = 0; outTok = 0 } }
  $textByRoute[$route].calls += 1
  $textByRoute[$route].usd  += [double]$r.cost_usd
  $textByRoute[$route].inTok  += [int]$r.input_tokens
  $textByRoute[$route].outTok += [int]$r.output_tokens
  $textTotalUsd += [double]$r.cost_usd
  $textCalls += 1
}

# --- Image volume (counts by model, from ai_image_jobs) ---
$imgRows = @()
try {
  # Only completed jobs bill as a real image (failed/queued/cancelled produced nothing).
  $imgRows = Invoke-Rest $creds "ai_image_jobs?select=model_name,provider&status=eq.completed&created_at=gte.$sinceUtc&limit=100000"
} catch {
  Write-Warning "ai_image_jobs query failed: $($_.Exception.Message)"
}
$imgByModel = @{}
$imgTotal = 0
foreach ($r in $imgRows) {
  $m = if ($r.model_name) { $r.model_name } else { "(unknown)" }
  if (-not $imgByModel.ContainsKey($m)) { $imgByModel[$m] = 0 }
  $imgByModel[$m] += 1
  $imgTotal += 1
}

# --- Write report ---
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$outFile = Join-Path $OutDir "aware-wave-cost-$today.md"

$twdRate = 32
$textTotalNtd = [math]::Round($textTotalUsd * $twdRate, 0)

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# AwareWave App Cost Report -- $today")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Window: last $Days days (since $sinceUtc UTC). USD->NT$ = $twdRate.")
[void]$sb.AppendLine("Source: ai_call_logs (exact text spend) + ai_image_jobs (image volume). Unit rates SSOT: lib/ai/cost-model.ts.")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Summary")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Metric | Value |")
[void]$sb.AppendLine("|---|---|")
[void]$sb.AppendLine("| Text AI spend (exact) | `$$([math]::Round($textTotalUsd,2)) USD / NT`$$textTotalNtd |")
[void]$sb.AppendLine("| Text calls logged | $textCalls |")
[void]$sb.AppendLine("| Images generated | $imgTotal |")
if (-not $textAvailable) {
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("> NOTE: ai_call_logs unavailable -- migration 0043 not applied or no text calls yet. Text spend shown as 0.")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Text spend by route (exact cost_usd)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Route | Calls | In tok | Out tok | USD | NT`$ |")
[void]$sb.AppendLine("|---|---:|---:|---:|---:|---:|")
foreach ($k in ($textByRoute.Keys | Sort-Object { $textByRoute[$_].usd } -Descending)) {
  $e = $textByRoute[$k]
  $ntd = [math]::Round($e.usd * $twdRate, 0)
  $kEsc = $k -replace '\|', '\|'   # a '|' in a route would break the markdown table
  [void]$sb.AppendLine("| $kEsc | $($e.calls) | $($e.inTok) | $($e.outTok) | `$$([math]::Round($e.usd,4)) | NT`$$ntd |")
}
if ($textByRoute.Count -eq 0) { [void]$sb.AppendLine("| (no records) | | | | | |") }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Image volume by model")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Model | Count |")
[void]$sb.AppendLine("|---|---:|")
foreach ($k in ($imgByModel.Keys | Sort-Object { $imgByModel[$_] } -Descending)) {
  $kEsc = $k -replace '\|', '\|'
  [void]$sb.AppendLine("| $kEsc | $($imgByModel[$k]) |")
}
if ($imgByModel.Count -eq 0) { [void]$sb.AppendLine("| (no records) | |") }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Image USD breakdown + monthly estimator: /ops/costs")

Set-Content -Path $outFile -Value $sb.ToString() -Encoding UTF8
Write-Host "[ok] Report written: $outFile"
Write-Host "[ok] Text spend: `$$([math]::Round($textTotalUsd,2)) USD ($textCalls calls) | Images: $imgTotal"
