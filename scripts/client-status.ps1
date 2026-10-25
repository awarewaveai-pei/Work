#requires -Version 5.1
<#
.SYNOPSIS
  Client health + WordPress update status, read straight from Supabase (organizations.metadata).

.DESCRIPTION
  Same data and probe as the Telegram /client_status handler
  (next-admin lib/command-plane/handlers/clientStatus.ts). It does NOT call /api/ops/clients:
  that route sits behind the staff session cookie (middleware.ts), so a script gets 401/404.
  Read-only. Credentials: $env:SUPABASE_URL/_SERVICE_ROLE_KEY or the SUPABASE_AWAREWAVE_* alias,
  else dot-sources mcp/user-env.ps1 (same as report-app-costs.ps1).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\client-status.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\client-status.ps1 -Slug soulful
#>
[CmdletBinding()]
param(
  [string]$Slug = ""
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Resolve-Env([string[]]$names) {
  foreach ($n in $names) { $v = [Environment]::GetEnvironmentVariable($n); if ($v) { return $v } }
  return $null
}

$url = Resolve-Env @("SUPABASE_URL", "SUPABASE_AWAREWAVE_URL")
$key = Resolve-Env @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY")
if (-not $url -or -not $key) {
  $userEnv = Join-Path $ScriptDir "..\mcp\user-env.ps1"
  if (Test-Path $userEnv) { . $userEnv }
  $url = Resolve-Env @("SUPABASE_URL", "SUPABASE_AWAREWAVE_URL")
  $key = Resolve-Env @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY")
}
if (-not $url -or -not $key) { throw "SUPABASE_URL/_SERVICE_ROLE_KEY (or SUPABASE_AWAREWAVE_*) not set." }

$headers = @{ apikey = $key; Authorization = "Bearer $key" }
# PS 5.1 hands a JSON array back as ONE object; unroll it through the pipeline.
$orgs = @(Invoke-RestMethod -Method Get -Headers $headers `
  -Uri "$($url.TrimEnd('/'))/rest/v1/organizations?select=id,slug,name,type,status,metadata&order=created_at.asc" |
  ForEach-Object { $_ })

$filter = $Slug.Trim().ToLower()
if ($filter) { $orgs = @($orgs | Where-Object { $_.slug -like "*$filter*" -or $_.name.ToLower() -like "*$filter*" }) }
if ($orgs.Count -eq 0) { Write-Host "No client matches '$Slug'."; exit 1 }

function Get-Health([string]$siteUrl) {
  if (-not $siteUrl) { return "no URL" }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -Uri $siteUrl -Method Head -TimeoutSec 5 -UseBasicParsing -MaximumRedirection 5
    return "OK HTTP $([int]$r.StatusCode) $($sw.ElapsedMilliseconds)ms"
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -and $code -lt 400) { return "OK HTTP $code $($sw.ElapsedMilliseconds)ms" }
    return "DOWN" + $(if ($code) { " HTTP $code" } else { " (no answer)" })
  }
}

function Get-Day([string]$iso) {
  if (-not $iso) { return "never" }
  $days = [math]::Floor(((Get-Date).ToUniversalTime() - ([datetime]$iso).ToUniversalTime()).TotalDays)
  if ($days -le 0) { return "today" } elseif ($days -eq 1) { return "yesterday" } else { return "$days days ago" }
}

$up = 0
foreach ($org in $orgs) {
  $cfg = $org.metadata.client_config
  $wp = $org.metadata.wp_update_latest
  $health = Get-Health $cfg.site_url
  if ($health -like "OK*") { $up++ }
  Write-Host ("{0,-28} {1,-22} {2}" -f $org.name, "$($cfg.platform)/$($cfg.hosting_type)", $health)
  if ($cfg.site_url) { Write-Host "    url: $($cfg.site_url)" }
  if ($cfg.platform -eq "wordpress") {
    if (-not $wp) { Write-Host "    WP updates: no run recorded" }
    else {
      $license = @($wp.results | Where-Object { $_.status -eq "skipped_license" }).Count
      Write-Host ("    WP updates: {0} updated, {1} failed, {2} need licence, group {3}, health {4}, last run {5} ({6})" -f `
        [int]$wp.updated_count, [int]$wp.failed_count, $license, $wp.plugins_group, $wp.health_final, (Get-Day $wp.ran_at), $wp.ran_at)
      if ($filter) {
        foreach ($r in @($wp.results)) { Write-Host "      [$($r.status)] $($r.plugin) $($r.from) -> $($r.to)" }
        if ($cfg.waves) {
          Write-Host "    wave1: $(@($cfg.waves.wave1) -join ', ')"
          Write-Host "    wave2: $(@($cfg.waves.wave2) -join ', ')"
          Write-Host "    wave3: $(@($cfg.waves.wave3) -join ', ')"
        }
      }
    }
  }
  if ($filter) { Write-Host "    dashboard: https://app.aware-wave.com/ops/clients/$($org.slug)" }
}
Write-Host ""
Write-Host "Clients up: $up/$($orgs.Count)"
