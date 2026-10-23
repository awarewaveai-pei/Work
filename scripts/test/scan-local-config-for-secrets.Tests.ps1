<#
.SYNOPSIS
  Regression tests for scripts/scan-local-config-for-secrets.ps1.

.DESCRIPTION
  Pester-free and value-safe. Uses fake token-shaped values in a temp git repo.
  Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/scan-local-config-for-secrets.Tests.ps1
#>

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot '..\_console-encoding-helpers.ps1')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$scanner = Join-Path $repoRoot 'scripts\scan-local-config-for-secrets.ps1'

$script:fail = 0
$script:pass = 0
function Assert([bool]$cond, [string]$name) {
    if ($cond) { $script:pass++; Write-Host ("  PASS  {0}" -f $name) -ForegroundColor Green }
    else       { $script:fail++; Write-Host ("  FAIL  {0}" -f $name) -ForegroundColor Red }
}

function Invoke-ScannerCase {
    param(
        [string]$WorkRoot,
        [string]$Baseline
    )
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scanner, '-WorkRoot', $WorkRoot, '-Quiet')
    if ($Baseline) {
        $args += @('-KnownSuppressedBaseline', $Baseline)
    }
    $output = & powershell.exe @args *>&1 | Out-String
    return [pscustomobject]@{
        exitCode = $LASTEXITCODE
        output   = $output
    }
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("scan-secrets-test-" + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path (Join-Path $tmpRoot 'mcp') -Force | Out-Null
    Push-Location $tmpRoot
    try {
        Invoke-WithUtf8Console { git init -q }
    } finally {
        Pop-Location
    }

    $configPath = Join-Path $tmpRoot 'mcp\user-env.ps1'
    $baselinePath = Join-Path $tmpRoot 'baseline.json'
    $knownLine = '$env:KNOWN_GITHUB_TOKEN = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
    $newLine = '$env:NEW_GITHUB_TOKEN = "ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"'

    $baseline = [ordered]@{
        schemaVersion = 1
        suppressions = @(
            [ordered]@{
                file      = 'mcp/user-env.ps1'
                pattern   = 'GitHub PAT (classic)'
                sourceKey = 'KNOWN_GITHUB_TOKEN'
                reason    = 'test known local token'
            }
        )
    } | ConvertTo-Json -Depth 5
    Set-Content -LiteralPath $baselinePath -Value $baseline -Encoding UTF8

    Write-Host "== scan-local-config-for-secrets baseline contract ==" -ForegroundColor Cyan

    Set-Content -LiteralPath $configPath -Value $knownLine -Encoding UTF8
    $known = Invoke-ScannerCase -WorkRoot $tmpRoot -Baseline $baselinePath
    Assert ($known.exitCode -eq 0) "known baseline finding exits 0"
    Assert ($known.output -match 'known-suppressed') "known baseline finding is reported as suppressed"

    Set-Content -LiteralPath $configPath -Value @($knownLine, $newLine) -Encoding UTF8
    $miss = Invoke-ScannerCase -WorkRoot $tmpRoot -Baseline $baselinePath
    Assert ($miss.exitCode -eq 2) "baseline-miss local finding exits 2"
    Assert ($miss.output -match 'NEW_GITHUB_TOKEN') "baseline-miss output names non-secret source key"

    Set-Content -LiteralPath $configPath -Value $knownLine -Encoding UTF8
    Push-Location $tmpRoot
    try {
        Invoke-WithUtf8Console { git add mcp/user-env.ps1 }
    } finally {
        Pop-Location
    }
    $tracked = Invoke-ScannerCase -WorkRoot $tmpRoot -Baseline $baselinePath
    Assert ($tracked.exitCode -eq 2) "tracked finding is never suppressed"
    Assert ($tracked.output -match 'tracked=True') "tracked finding remains visible"
} finally {
    if (Test-Path -LiteralPath $tmpRoot) {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force
    }
}

Write-Host ""
$summaryColor = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("RESULT: {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor $summaryColor
if ($script:fail -gt 0) { exit 1 }
exit 0
