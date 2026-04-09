<#
.SYNOPSIS
  Alias: same as ao-resume.ps1 default (full check including machine-environment-audit -Strict).

.DESCRIPTION
  Kept for stable naming in docs; behavior matches .\scripts\ao-resume.ps1 with no quick/skip flags.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\align-workstation.ps1
#>
param(
    [string]$WorkRoot = "",
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowPendingStash,
    [switch]$SkipWorkflowsDeps,
    [switch]$SkipOpenTasksList
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$here = $PSScriptRoot
$resume = Join-Path $here "ao-resume.ps1"
if (-not (Test-Path -LiteralPath $resume)) {
    Write-Error "align-workstation: missing $resume"
    exit 1
}

$argv = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $resume
)
if ($WorkRoot) { $argv += "-WorkRoot", $WorkRoot }
if ($AllowUnexpectedDirty) { $argv += "-AllowUnexpectedDirty" }
if ($AllowStashBeforePull) { $argv += "-AllowStashBeforePull" }
if ($AllowPendingStash) { $argv += "-AllowPendingStash" }
if ($SkipWorkflowsDeps) { $argv += "-SkipWorkflowsDeps" }
if ($SkipOpenTasksList) { $argv += "-SkipOpenTasksList" }

& powershell.exe @argv
exit $LASTEXITCODE
