# Audits agency-os/reports/status/*-LATEST.json against the detector contract
# (scripts/lib/_detector-contract.ps1): `overall`, `measured`, `generated_utc` present, and measured=0 never PASS.
# Phase-1 legacy violators live in scripts/detector-contract-legacy.txt, which may only shrink:
# an unlisted violation fails, and so does a listed file that already complies (stale entry).
# Exit: 0 no new violation / no stale entry, 1 otherwise.
param(
    [string]$StatusDir = "",
    [string]$AllowlistPath = "",
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')
. (Join-Path $PSScriptRoot 'lib\_detector-contract.ps1')

if (-not $StatusDir) { $StatusDir = Join-Path (Resolve-AgencyRoot) 'reports\status' }
if (-not $AllowlistPath) { $AllowlistPath = Join-Path $PSScriptRoot 'detector-contract-legacy.txt' }

$legacy = @()
if (Test-Path -LiteralPath $AllowlistPath) {
    $legacy = @(Get-Content -LiteralPath $AllowlistPath -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
}

function Get-ContractViolation {
    param([string]$Path)
    try {
        $j = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return "unparseable JSON"
    }
    $names = @($j.PSObject.Properties.Name)
    $missing = @('overall', 'measured', 'generated_utc') | Where-Object { $names -notcontains $_ }
    if ($missing) { return "missing " + ($missing -join '+') }
    if ($j.measured -isnot [int] -and $j.measured -isnot [long]) { return "measured is not an integer" }
    $gen = [datetime]::MinValue
    if (-not [datetime]::TryParse([string]$j.generated_utc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$gen)) { return "generated_utc is not a timestamp" }
    if ($j.measured -le 0 -and (Test-DetectorPassVerdict -Overall ([string]$j.overall))) { return "measured=0 but overall=$($j.overall)" }
    return $null
}

$files = @(Get-ChildItem -LiteralPath $StatusDir -Filter '*-LATEST.json' -File | Sort-Object Name)
$fail = @(); $legacyHit = @(); $stale = @(); $okCount = 0
foreach ($f in $files) {
    $v = Get-ContractViolation -Path $f.FullName
    $isLegacy = $legacy -contains $f.Name
    if ($v -and $isLegacy) { $legacyHit += "$($f.Name): $v" }
    elseif ($v) { $fail += "$($f.Name): $v" }
    elseif ($isLegacy) { $stale += $f.Name }
    else { $okCount++ }
}
$gone = @($legacy | Where-Object { $files.Name -notcontains $_ })
$stale += $gone

if (-not $Quiet) {
    foreach ($l in $fail) { Write-Output "FAIL   $l" }
    foreach ($s in $stale) { Write-Output "STALE  $s -- complies (or file gone); delete its line from detector-contract-legacy.txt" }
    foreach ($l in $legacyHit) { Write-Output "LEGACY $l" }
}
Write-Output ("detector-contract: files={0} compliant={1} legacy={2} FAIL={3} stale-allowlist={4}" -f $files.Count, $okCount, $legacyHit.Count, $fail.Count, $stale.Count)
if ($fail.Count -gt 0 -or $stale.Count -gt 0) { exit 1 }
exit 0
