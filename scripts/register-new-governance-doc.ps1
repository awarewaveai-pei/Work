param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string[]]$Targets,
    # Allow registering before some target files exist (not recommended for release).
    [switch]$SkipTargetExistCheck,
    [string]$WorkspaceRoot = "",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\doc-sync-automation.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }
    return $resolved
}

function Normalize-RelPath {
    param([string]$Value)
    return ($Value.Trim().Replace('\', '/').TrimStart('/'))
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$normSource = Normalize-RelPath $Source
$normTargets = @($Targets | ForEach-Object { Normalize-RelPath $_ } | Where-Object { $_ } | Select-Object -Unique)

if ($normTargets.Count -eq 0) {
    throw "Provide at least one -Targets path."
}

$srcFull = Join-Path $root ($normSource.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
if (-not (Test-Path -LiteralPath $srcFull)) {
    throw "Source file does not exist: $normSource (expected under agency-os root)"
}

if (-not $SkipTargetExistCheck) {
    foreach ($t in $normTargets) {
        $tf = Join-Path $root ($t.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $tf)) {
            throw "Target missing (use -SkipTargetExistCheck to override): $t"
        }
    }
}

$mapPath = Join-Path $root "docs/change-impact-map.json"
$matrixPath = Join-Path $root "docs/CHANGE_IMPACT_MATRIX.md"
if (-not (Test-Path -LiteralPath $mapPath)) { throw "Missing $mapPath" }
if (-not (Test-Path -LiteralPath $matrixPath)) { throw "Missing $matrixPath" }

$mapJson = Get-Content -Raw -Path $mapPath -Encoding UTF8 | ConvertFrom-Json
foreach ($r in $mapJson.rules) {
    if ($r.source -eq $normSource) {
        throw "change-impact-map.json already has a rule for source: $normSource"
    }
}

$newRule = [ordered]@{
    source  = $normSource
    targets = @($normTargets)
}
$list = [System.Collections.ArrayList]::new()
foreach ($x in $mapJson.rules) { [void]$list.Add($x) }
[void]$list.Add([pscustomobject]$newRule)
$mapJson.rules = @($list.ToArray())

$bt = [char]96
$targetsCell = (($normTargets | ForEach-Object { $bt + $_ + $bt }) -join ', ')
$matrixRow = '| ' + $bt + $normSource + $bt + ' | ' + $targetsCell + ' |'

$matrixRaw = Get-Content -Raw -Path $matrixPath -Encoding UTF8
$matrixNeedle = '| ' + $bt + $normSource + $bt + ' |'
if ($matrixRaw.Contains($matrixNeedle)) {
    throw "CHANGE_IMPACT_MATRIX.md already contains a row for: $normSource"
}

# Anchor heading in CHANGE_IMPACT_MATRIX.md (UTF-8 bytes avoid lexer issues in some consoles).
$anchorUtf8 = [byte[]]@(
    0x23, 0x23, 0x20,
    0xE6, 0x9C, 0x80, 0xE5, 0xB0, 0x8F, 0xE5, 0x90, 0x8C, 0xE6, 0xAD, 0xA5,
    0xE6, 0xB8, 0x85, 0xE5, 0x96, 0xAE, 0xEF, 0xBC, 0x88,
    0xE6, 0xAF, 0x8F, 0xE6, 0xAC, 0xA1, 0xE6, 0x94, 0xB9, 0xE7, 0x89, 0x88,
    0xEF, 0xBC, 0x89
)
$anchor = [System.Text.Encoding]::UTF8.GetString($anchorUtf8)
$idx = $matrixRaw.IndexOf($anchor, [StringComparison]::Ordinal)
if ($idx -lt 0) {
    throw 'Matrix anchor not found (## minimum sync section).'
}
$nl = [Environment]::NewLine
$insert = $matrixRow + $nl + $nl
$newMatrix = $matrixRaw.Substring(0, $idx) + $insert + $matrixRaw.Substring($idx)

if ($DryRun) {
    Write-Output "DRY RUN - would append rule to change-impact-map.json and row to CHANGE_IMPACT_MATRIX.md"
    Write-Output ("Rule: {0} -> {1}" -f $normSource, ($normTargets -join ", "))
    Write-Output ("Matrix row: {0}" -f $matrixRow)
    exit 0
}

$mapJson | ConvertTo-Json -Depth 12 | Set-Content -Path $mapPath -Encoding UTF8
Set-Content -Path $matrixPath -Value $newMatrix -Encoding UTF8

Write-Output ("Updated docs/change-impact-map.json (new rule for " + $normSource + ")")
Write-Output "Updated docs/CHANGE_IMPACT_MATRIX.md (new row)"
Write-Output ""
Write-Output "Next: add README / docs/README entry if needed, then doc-sync and health:"
$cfArg = '@("' + $normSource + '")'
Write-Output ('  powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -ChangedFiles ' + $cfArg)
Write-Output '  powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1'
