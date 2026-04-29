# Registers monthly task via Register-ScheduledTask (AgencyOS-MonthlySystemReview).

param(
    [string]$WorkspaceRoot = "",
    [int]$DayOfMonth = 1,
    [string]$StartTime = "09:20",
    [switch]$NoInteractive,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

function Quote-Arg {
    param([string]$Value)
    if ($null -eq $Value) { return '""' }
    return '"' + $Value.Replace('"', '""') + '"'
}

function Invoke-Schtasks {
    param([string[]]$Args)
    $output = & schtasks.exe @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("schtasks failed: " + ($output | Out-String))
    }
    return ($output | Out-String).Trim()
}

if ($DayOfMonth -lt 1 -or $DayOfMonth -gt 28) {
    throw "DayOfMonth must be 1..28 for stable cross-month scheduling (got: $DayOfMonth)"
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$monthlyScript = Join-Path $root "scripts\monthly-system-review.ps1"
if (-not (Test-Path -LiteralPath $monthlyScript)) {
    throw "Missing monthly script: $monthlyScript"
}
$monorepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $monorepoRoot "scripts\scheduled-task-launcher.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing scheduled-task-launcher.ps1 at $launcher (expected monorepo root scripts)."
}

$taskName = "AgencyOS-MonthlySystemReview"
try { Invoke-Schtasks -Args @("/Delete", "/F", "/TN", $taskName) | Out-Null } catch {}

if ($RemoveOnly) {
    Write-Output "Removed scheduled task: $taskName"
    exit 0
}

$rootSq = $root.Replace("'", "''")
$extra = Encode-ExtraArgsB64 -Plain ("-AgencyOsRoot '{0}'" -f $rootSq)
$tr = "powershell -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File " + (Quote-Arg $launcher) +
    " -TargetScript " + (Quote-Arg $monthlyScript) +
    " -ExtraArgsB64 " + $extra +
    " -LogStem " + (Quote-Arg "MonthlySystemReview")

$args = @("/Create", "/F", "/SC", "MONTHLY", "/D", [string]$DayOfMonth, "/TN", $taskName, "/TR", (Quote-Arg $tr), "/ST", $StartTime)
if (-not $NoInteractive) { $args += "/IT" }
Invoke-Schtasks -Args $args | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $taskName) | Out-Null

Write-Output "Registered: $taskName (day $DayOfMonth at $StartTime local)."
Write-Output "Verify: schtasks /Query /TN `"$taskName`" /V /FO LIST"
