#requires -Version 5.1
<#
.SYNOPSIS
  AwareWave app AI + tool cost report. Pulls REAL usage from Supabase ai_call_logs (text, image
  and video rows) and writes a dated markdown report.

.DESCRIPTION
  ai_call_logs is the only cost source, same as /ops/costs (next-admin lib/ai/spend-report.ts):
  cost_usd is computed + stored at call time, so this script needs NO rate table. ai_image_jobs is
  NOT a cost source (never reaches status=completed; image/video spend is already in ai_call_logs).
  Kind rule mirrors spendKind(): route video/* = video, kind image/video as stored, else text.
  Reads are paged, so the PostgREST max-rows cap cannot silently shorten the totals.

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

# --- All spend rows (paged; stop only on an empty page) ---
$rows = New-Object System.Collections.ArrayList
$textAvailable = $true
try {
  $offset = 0
  while ($true) {
    # PS 5.1 Invoke-RestMethod hands back a JSON array as ONE Object[]; @() alone would make it a
    # single "row". Piping through ForEach-Object unrolls it into real rows.
    $page = @(Invoke-Rest $creds "ai_call_logs?select=id,route,model,kind,cost_usd,input_tokens,output_tokens&created_at=gte.$sinceUtc&order=created_at.asc,id.asc&offset=$offset&limit=1000" | ForEach-Object { $_ })
    if ($page.Count -eq 0) { break }
    [void]$rows.AddRange($page)
    $offset += $page.Count
  }
} catch {
  $textAvailable = $false
  Write-Warning "ai_call_logs query failed (migration 0043 may not be applied yet): $($_.Exception.Message)"
}

$byRoute = @{}
$byKind = @{ text = 0.0; image = 0.0; video = 0.0 }
$countByKind = @{ text = 0; image = 0; video = 0 }
$totalUsd = 0.0
foreach ($r in $rows) {
  $route = if ($r.route) { $r.route } else { "(unknown)" }
  $kind = if ($route -like "video/*") { "video" } elseif ($r.kind -eq "image" -or $r.kind -eq "video") { $r.kind } else { "text" }
  $key = "$kind|$route"
  if (-not $byRoute.ContainsKey($key)) { $byRoute[$key] = @{ route = $route; kind = $kind; calls = 0; usd = 0.0; inTok = 0; outTok = 0 } }
  $byRoute[$key].calls += 1
  $byRoute[$key].usd  += [double]$r.cost_usd
  $byRoute[$key].inTok  += [int]$r.input_tokens
  $byRoute[$key].outTok += [int]$r.output_tokens
  $byKind[$kind] += [double]$r.cost_usd
  $countByKind[$kind] += 1
  $totalUsd += [double]$r.cost_usd
}

# --- Write report ---
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$outFile = Join-Path $OutDir "aware-wave-cost-$today.md"

$twdRate = 32
$totalNtd = [math]::Round($totalUsd * $twdRate, 0)

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# AwareWave App Cost Report -- $today")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Window: last $Days days (since $sinceUtc UTC). USD->NT$ = $twdRate.")
[void]$sb.AppendLine("Source: ai_call_logs (all kinds; same rows as /ops/costs). Amounts = usage x list price, not vendor invoices. Unit rates SSOT: lib/ai/cost-model.ts.")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Summary")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Metric | Value |")
[void]$sb.AppendLine("|---|---|")
[void]$sb.AppendLine("| Total AI spend | `$$([math]::Round($totalUsd,2)) USD / NT`$$totalNtd |")
foreach ($k in @("text", "image", "video")) {
  [void]$sb.AppendLine("| $k | `$$([math]::Round($byKind[$k],4)) USD ($($countByKind[$k]) rows) |")
}
[void]$sb.AppendLine("| Rows logged | $($rows.Count) |")
if (-not $textAvailable) {
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("> NOTE: ai_call_logs read failed -- totals cover only the rows read before the error.")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Spend by route (stored cost_usd)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Route | Kind | Calls | In tok | Out tok | USD | NT`$ |")
[void]$sb.AppendLine("|---|---|---:|---:|---:|---:|---:|")
foreach ($k in ($byRoute.Keys | Sort-Object { $byRoute[$_].usd } -Descending)) {
  $e = $byRoute[$k]
  $ntd = [math]::Round($e.usd * $twdRate, 0)
  $rEsc = $e.route -replace '\|', '\|'   # a '|' in a route would break the markdown table
  [void]$sb.AppendLine("| $rEsc | $($e.kind) | $($e.calls) | $($e.inTok) | $($e.outTok) | `$$([math]::Round($e.usd,4)) | NT`$$ntd |")
}
if ($byRoute.Count -eq 0) { [void]$sb.AppendLine("| (no records) | | | | | | |") }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Monthly report (per Taipei calendar month, by vendor/model/feature/client): /ops/costs tab 6")

Set-Content -Path $outFile -Value $sb.ToString() -Encoding UTF8
Write-Host "[ok] Report written: $outFile"
Write-Host "[ok] AI spend: `$$([math]::Round($totalUsd,2)) USD ($($rows.Count) rows)"
