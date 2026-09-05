[CmdletBinding()]
param(
    [ValidateRange(1, 60)]
    [int]$PollSeconds = 2,
    [switch]$Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$preflight = Join-Path $PSScriptRoot 'docker-desktop-runtime-preflight.ps1'

do {
    # The preflight is a no-op while Docker is alive. Once it is stopped, it
    # quarantines only stale reparse-point socket directories for the next launch.
    & $preflight -Quiet
    if ($Once) { break }
    Start-Sleep -Seconds $PollSeconds
} while ($true)
