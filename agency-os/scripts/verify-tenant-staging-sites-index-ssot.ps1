param(
    [string]$WorkspaceRoot = ""
)

<#
.SYNOPSIS
  Verifies tenant staging URL SSOT: SITES_INDEX.md Staging URL column matches
  core/ENVIRONMENT_REGISTRY.md staging row (first https URL in each).

.DESCRIPTION
  - Skips tenants without ENVIRONMENT_REGISTRY.md or SITES_INDEX.md.
  - Skips tenants whose SITES_INDEX table has no "Staging URL" column (e.g. drill skeleton).
  - If registry staging row has a canonical https URL, every sites-index row must use the same URL (lifecycle suffix OK).
  - If registry has no https in staging row, sites-index rows must not carry an https staging URL.

.NOTES
  Owner: agency-os/scripts/system-health-check.ps1 invokes this gate.
  Encoding: UTF-8 (paths/content).
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkspaceRoot) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkspaceRoot = (Resolve-Path $WorkspaceRoot).Path
}

function Extract-NormalizedHttpsUrl {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    # Conservative hostname/path only — stops before whitespace, `（`, backticks, or |
    $m = [regex]::Match($Text, '(?i)https://[a-z0-9][a-z0-9./_-]*')
    if (-not $m.Success) { return $null }
    return ($m.Value.TrimEnd('/')).ToLowerInvariant()
}

function Get-RegistryStagingCell {
    param([string]$FilePath)
    $raw = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
    $m = [regex]::Match($raw, '(?m)^\|\s*staging\s*\|\s*([^|\r\n]+)\|')
    if (-not $m.Success) { return $null }
    return $m.Groups[1].Value.Trim()
}

function Find-StagingColumnIndex {
    param([string[]]$Lines)
    foreach ($line in $Lines) {
        if ($line -notmatch '^\|') { continue }
        if ($line -match '^\|\s*:?-+') { continue }
        $parts = @($line -split '\|' | ForEach-Object { $_.Trim() })
        if (-not ($parts -contains 'Site')) { continue }
        if (-not ($parts -contains 'Staging URL')) { continue }
        for ($i = 0; $i -lt $parts.Count; $i++) {
            if ($parts[$i] -eq 'Staging URL') { return $i }
        }
    }
    return -1
}

function Get-SitesIndexDataRows {
    param(
        [string[]]$Lines,
        [int]$StagingIdx
    )
    $rows = New-Object System.Collections.Generic.List[hashtable]
    $phase = 'header'
    foreach ($line in $Lines) {
        if ($line -notmatch '^\|') { continue }

        if ($phase -eq 'header') {
            if ($line -match '^\|\s*:?-+') { continue }
            $parts = @($line -split '\|' | ForEach-Object { $_.Trim() })
            if (($parts -contains 'Staging URL') -and ($StagingIdx -ge 0)) {
                $phase = 'seek-sep'
            }
            continue
        }

        if ($phase -eq 'seek-sep') {
            if ($line -match '^\|\s*:?-+') {
                $phase = 'data'
            }
            continue
        }

        if ($phase -eq 'data') {
            if ($line -match '^\|\s*:?-+') { break }
            $parts = @($line -split '\|' | ForEach-Object { $_.Trim() })
            if ($parts.Count -le $StagingIdx) { continue }
            $siteId = $parts[1]
            if ([string]::IsNullOrWhiteSpace($siteId)) { continue }
            $stagingCell = $parts[$StagingIdx]
            $rows.Add(@{ Site = $siteId; StagingCell = $stagingCell }) | Out-Null
        }
    }
    return $rows
}

$failures = New-Object System.Collections.Generic.List[string]
$tenantsRoot = Join-Path $WorkspaceRoot "tenants"

if (-not (Test-Path -LiteralPath $tenantsRoot)) {
    Write-Host "verify-tenant-staging-sites-index-ssot: tenants/ missing — skip"
    exit 0
}

$tenantDirs = @(Get-ChildItem -Path $tenantsRoot -Directory | Where-Object { $_.Name -like 'company-*' })

foreach ($tenant in $tenantDirs) {
    $tenantName = $tenant.Name
    $regPath = Join-Path $tenant.FullName "core\ENVIRONMENT_REGISTRY.md"
    $sitesPath = Join-Path $tenant.FullName "SITES_INDEX.md"

    if (-not (Test-Path -LiteralPath $regPath)) { continue }
    if (-not (Test-Path -LiteralPath $sitesPath)) { continue }

    $lines = @(Get-Content -LiteralPath $sitesPath -Encoding UTF8)
    $stagingIdx = Find-StagingColumnIndex -Lines $lines

    if ($stagingIdx -lt 0) {
        Write-Host "verify-tenant-staging-sites-index-ssot: skip $tenantName (no Staging URL column)"
        continue
    }

    $regCell = Get-RegistryStagingCell -FilePath $regPath
    $regUrl = Extract-NormalizedHttpsUrl -Text $regCell

    $rows = @(Get-SitesIndexDataRows -Lines $lines -StagingIdx $stagingIdx)

    if ($rows.Count -eq 0) {
        [void]$failures.Add("${tenantName}: SITES_INDEX has Staging URL column but no data rows parsed.")
        continue
    }

    foreach ($row in $rows) {
        $cellUrl = Extract-NormalizedHttpsUrl -Text $row.StagingCell

        if ($regUrl) {
            if ($cellUrl -ne $regUrl) {
                [void]$failures.Add(
                    "${tenantName} site $($row.Site): SITES_INDEX staging must match ENVIRONMENT_REGISTRY — registry='$regUrl' cell='$($row.StagingCell)'."
                )
            }
        } else {
            if ($cellUrl) {
                [void]$failures.Add(
                    "${tenantName} site $($row.Site): SITES_INDEX has staging HTTPS but ENVIRONMENT_REGISTRY staging row has no canonical HTTPS URL."
                )
            }
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Output ($failures -join "`n")
    exit 1
}

Write-Host "verify-tenant-staging-sites-index-ssot: PASS (tenants with Staging URL column)"
exit 0
