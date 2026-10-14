param(
    [string]$WorkspaceRoot = ""
)

<#
.SYNOPSIS
  Verifies tenant staging URL SSOT against core/ENVIRONMENT_REGISTRY.md (staging row).

.DESCRIPTION
  Compares the registry staging row’s canonical HTTPS URL to:
  - SITES_INDEX.md — "Staging URL" column (per site row), when that column exists.
  - sites/<site>/SITE_PROFILE.md — any bullet line containing "Staging URL" with an HTTPS URL.
  - projects/*/02_EXECUTION_PLAN.md — lines that mention "staging" and contain HTTPS URL.
  Skips tenants without ENVIRONMENT_REGISTRY.md.
  Skips SITES_INDEX when there is no "Staging URL" column (e.g. drill skeleton).
  Skips SITE_PROFILE lines that mention Staging URL but contain no https:// (e.g. "見 registry").
  Skips 02_EXECUTION_PLAN lines without https://.

.NOTES
  Single implementation: local health + CI (no duplicate bash copy).
  Owner: monorepo scripts/system-health-check.ps1 invokes this gate.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib/repo-roots.ps1')   # forward slash: CI runs this on Linux pwsh
$WorkspaceRoot = Resolve-AgencyRoot -InputRoot $WorkspaceRoot

function Extract-NormalizedHttpsUrl {
    param([string]$Text, [switch]$IncludeStruck)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    # Drop markdown strikethrough spans first — repo convention marks abandoned/
    # decommissioned URLs as ~~https://...~~ (see ENVIRONMENT_REGISTRY.md staging
    # rows). A struck-through URL is not a LIVE declaration; callers that need to
    # tell "nothing here" apart from "struck here" (to still flag stale-but-struck
    # references against a since-revived live registry URL) pass -IncludeStruck to
    # get the URL back without stripping. Single choke point for both modes.
    $scanText = $Text
    if (-not $IncludeStruck) {
        $scanText = [regex]::Replace($Text, '~~[^~]*~~', '')
        if ([string]::IsNullOrWhiteSpace($scanText)) { return $null }
    }
    # Conservative hostname/path only — stops before whitespace, `（`, backticks, or |
    $m = [regex]::Match($scanText, '(?i)https://[a-z0-9][a-z0-9./_-]*')
    if (-not $m.Success) { return $null }
    return ($m.Value.TrimEnd('/')).ToLowerInvariant()
}

function Get-RegistryStagingCell {
    param([string]$FilePath)
    $raw = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
    # Label tolerates an optional ~~strikethrough~~ wrap (abandoned-row convention) so a
    # half-revived row (label still struck, URL cell updated to a live one) is still read
    # instead of silently returning null and causing false failures against other files
    # that already reference the (correct, live) URL.
    $m = [regex]::Match($raw, '(?m)^\|\s*(?:~~)?staging(?:~~)?\s*\|\s*([^|\r\n]+)\|')
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

function Get-StagingHttpsFromSiteProfile {
    param([string]$FilePath)
    if (-not (Test-Path -LiteralPath $FilePath)) { return $null }
    $lines = @(Get-Content -LiteralPath $FilePath -Encoding UTF8)
    foreach ($line in $lines) {
        if ($line -notmatch '(?i)staging\s+url') { continue }
        $u = Extract-NormalizedHttpsUrl -Text $line
        if ($u) { return @{ Url = $u; Struck = $false } }
        $su = Extract-NormalizedHttpsUrl -Text $line -IncludeStruck
        if ($su) { return @{ Url = $su; Struck = $true } }
    }
    return $null
}

function Get-StagingRefsFromExecutionPlan {
    param([string]$FilePath)
    $refs = New-Object System.Collections.Generic.List[hashtable]
    if (-not (Test-Path -LiteralPath $FilePath)) { return $refs }
    $lines = @(Get-Content -LiteralPath $FilePath -Encoding UTF8)
    foreach ($line in $lines) {
        if ($line -notmatch '(?i)staging') { continue }
        $u = Extract-NormalizedHttpsUrl -Text $line
        if ($u) { [void]$refs.Add(@{ Url = $u; Struck = $false }); continue }
        $su = Extract-NormalizedHttpsUrl -Text $line -IncludeStruck
        if ($su) { [void]$refs.Add(@{ Url = $su; Struck = $true }) }
    }
    return $refs
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

    $regCell = Get-RegistryStagingCell -FilePath $regPath
    $regUrl = Extract-NormalizedHttpsUrl -Text $regCell

    # --- SITES_INDEX (when table has Staging URL column)
    if (Test-Path -LiteralPath $sitesPath) {
        $lines = @(Get-Content -LiteralPath $sitesPath -Encoding UTF8)
        $stagingIdx = Find-StagingColumnIndex -Lines $lines

        if ($stagingIdx -ge 0) {
            $rows = @(Get-SitesIndexDataRows -Lines $lines -StagingIdx $stagingIdx)

            if ($rows.Count -eq 0) {
                [void]$failures.Add("${tenantName}: SITES_INDEX has Staging URL column but no data rows parsed.")
            }

            foreach ($row in $rows) {
                $cellUrl = Extract-NormalizedHttpsUrl -Text $row.StagingCell

                if ($regUrl) {
                    if ($cellUrl -ne $regUrl) {
                        [void]$failures.Add(
                            "${tenantName} site $($row.Site): SITES_INDEX staging must match ENVIRONMENT_REGISTRY — registry='$regUrl' cell='$($row.StagingCell)'."
                        )
                    }
                }
                elseif ($cellUrl) {
                    [void]$failures.Add(
                        "${tenantName} site $($row.Site): SITES_INDEX has staging HTTPS but ENVIRONMENT_REGISTRY staging row has no canonical HTTPS URL."
                    )
                }
            }
        } else {
            Write-Host "verify-tenant-staging-sites-index-ssot: skip $tenantName SITES_INDEX (no Staging URL column)"
        }
    }

    # --- sites/*/SITE_PROFILE.md (when inline Staging URL carries https)
    $sitesRoot = Join-Path $tenant.FullName "sites"
    if (-not (Test-Path -LiteralPath $sitesRoot)) { continue }

    foreach ($siteDir in @(Get-ChildItem -Path $sitesRoot -Directory)) {
        $profPath = Join-Path $siteDir.FullName "SITE_PROFILE.md"
        if (-not (Test-Path -LiteralPath $profPath)) { continue }

        $prof = Get-StagingHttpsFromSiteProfile -FilePath $profPath
        if (-not $prof) { continue }

        $rel = "${tenantName}/sites/$($siteDir.Name)/SITE_PROFILE.md"
        if ($prof.Struck) {
            if ($regUrl) {
                [void]$failures.Add(
                    "${rel}: SITE_PROFILE strikes out staging URL '$($prof.Url)' but ENVIRONMENT_REGISTRY staging is live '$regUrl' -- update SITE_PROFILE to the canonical URL or confirm staging is truly retired."
                )
            }
            continue
        }
        $profUrl = $prof.Url
        if ($regUrl) {
            if ($profUrl -ne $regUrl) {
                [void]$failures.Add(
                    "${rel}: SITE_PROFILE Staging URL '$profUrl' must match ENVIRONMENT_REGISTRY staging '$regUrl'."
                )
            }
        } else {
            [void]$failures.Add(
                "${rel}: SITE_PROFILE declares staging HTTPS but ENVIRONMENT_REGISTRY staging row has no canonical HTTPS URL."
            )
        }
    }

    # --- projects/*/02_EXECUTION_PLAN.md (only lines carrying https)
    $projectsRoot = Join-Path $tenant.FullName "projects"
    if (-not (Test-Path -LiteralPath $projectsRoot)) { continue }

    foreach ($projDir in @(Get-ChildItem -Path $projectsRoot -Directory)) {
        $planPath = Join-Path $projDir.FullName "02_EXECUTION_PLAN.md"
        if (-not (Test-Path -LiteralPath $planPath)) { continue }

        $planRefs = @(Get-StagingRefsFromExecutionPlan -FilePath $planPath)
        if ($planRefs.Count -eq 0) { continue }

        $rel = "${tenantName}/projects/$($projDir.Name)/02_EXECUTION_PLAN.md"
        foreach ($planRef in $planRefs) {
            if ($planRef.Struck) {
                if ($regUrl) {
                    [void]$failures.Add(
                        "${rel}: execution plan strikes out staging URL '$($planRef.Url)' but ENVIRONMENT_REGISTRY staging is live '$regUrl' -- update to the canonical URL or confirm staging is truly retired."
                    )
                }
                continue
            }
            $planUrl = $planRef.Url
            if ($regUrl) {
                if ($planUrl -ne $regUrl) {
                    [void]$failures.Add(
                        "${rel}: execution plan staging URL '$planUrl' must match ENVIRONMENT_REGISTRY staging '$regUrl'."
                    )
                }
            } else {
                [void]$failures.Add(
                    "${rel}: execution plan declares staging HTTPS but ENVIRONMENT_REGISTRY staging row has no canonical HTTPS URL."
                )
            }
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Output ($failures -join "`n")
    exit 1
}

Write-Host "verify-tenant-staging-sites-index-ssot: PASS"
exit 0
