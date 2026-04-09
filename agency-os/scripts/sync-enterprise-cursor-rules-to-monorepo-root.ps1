# Single-owner implementation lives at monorepo scripts/; this file delegates so agency-os callers stay aligned.
param(
    [string]$MonorepoRoot = "",
    [switch]$VerifyOnly,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mono = if ($MonorepoRoot) {
    (Resolve-Path -LiteralPath $MonorepoRoot).Path.TrimEnd('\')
} else {
    (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path.TrimEnd('\')
}

$main = Join-Path $mono "scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1"
if (-not (Test-Path -LiteralPath $main)) {
    Write-Error "sync-enterprise-cursor-rules: missing SSOT at $main"
    exit 1
}

$params = @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $main, '-MonorepoRoot', $mono)
if ($VerifyOnly) { $params += '-VerifyOnly' }
if ($Quiet) { $params += '-Quiet' }
& powershell @params
exit $LASTEXITCODE
