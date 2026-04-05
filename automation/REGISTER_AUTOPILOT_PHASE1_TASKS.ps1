param(
    [string]$WorkRoot = "",
    [switch]$EnableLogoffCloseout,
    [switch]$EnablePushOnLogoff,
    [switch]$NoInteractive,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
    return (Get-Location).Path
}

function Invoke-Schtasks {
    param([string[]]$Args)
    $output = & schtasks.exe @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("schtasks failed: " + ($output | Out-String))
    }
    return ($output | Out-String).Trim()
}

function Quote-Arg {
    param([string]$Value)
    if ($null -eq $Value) { return '""' }
    return '"' + $Value.Replace('"', '""') + '"'
}

function New-TaskSafe {
    param(
        [string[]]$BaseArgs,
        [switch]$PreferInteractive
    )
    if ($PreferInteractive) {
        try {
            Invoke-Schtasks -Args ($BaseArgs + @("/IT")) | Out-Null
            return
        } catch {
            Write-Warning "Interactive task registration failed; retrying without /IT."
        }
    }
    Invoke-Schtasks -Args $BaseArgs | Out-Null
}

function Assert-TaskExists {
    param([string]$TaskName)
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ($null -eq $task) { throw "Task not found: $TaskName" }
    } catch {
        throw "Scheduled task registration verification failed: $TaskName"
    }
}

$root = Resolve-WorkRoot -InputRoot $WorkRoot
$autopilot = Join-Path $root "scripts\autopilot-phase1.ps1"
if (-not (Test-Path -LiteralPath $autopilot)) {
    throw "Missing autopilot script: $autopilot"
}

$nameStartup = "AgencyOS-Autopilot-Startup"
$nameAlert = "AgencyOS-Autopilot-AlertMonitor"
$nameLogoff = "AgencyOS-Autopilot-LogoffCloseout"

foreach ($n in @($nameStartup, $nameAlert, $nameLogoff)) {
    try { Invoke-Schtasks -Args @("/Delete", "/F", "/TN", $n) | Out-Null } catch {}
}

if ($RemoveOnly) {
    Write-Output "Removed autopilot phase1 scheduled tasks."
    exit 0
}

$autopilotQ = Quote-Arg -Value $autopilot
$rootQ = Quote-Arg -Value $root

$trStartup = "powershell -NoProfile -ExecutionPolicy Bypass -File $autopilotQ -Mode startup -WorkRoot $rootQ"
$trAlert = "powershell -NoProfile -ExecutionPolicy Bypass -File $autopilotQ -Mode alert -WorkRoot $rootQ"
$trLogoff = "powershell -NoProfile -ExecutionPolicy Bypass -File $autopilotQ -Mode closeout -WorkRoot $rootQ"
if ($EnablePushOnLogoff) {
    $trLogoff += " -EnablePushOnCloseout"
}

New-TaskSafe -BaseArgs @("/Create", "/F", "/SC", "ONSTART", "/TN", $nameStartup, "/TR", $trStartup) -PreferInteractive:(-not $NoInteractive)
New-TaskSafe -BaseArgs @("/Create", "/F", "/SC", "MINUTE", "/MO", "10", "/TN", $nameAlert, "/TR", $trAlert) -PreferInteractive:(-not $NoInteractive)
if ($EnableLogoffCloseout) {
    New-TaskSafe -BaseArgs @("/Create", "/F", "/SC", "ONLOGOFF", "/TN", $nameLogoff, "/TR", $trLogoff) -PreferInteractive:(-not $NoInteractive)
}

Assert-TaskExists -TaskName $nameStartup
Assert-TaskExists -TaskName $nameAlert
if ($EnableLogoffCloseout) {
    Assert-TaskExists -TaskName $nameLogoff
}

Write-Output "Registered autopilot phase1 tasks."
Write-Output ("- Startup preflight: " + $nameStartup)
Write-Output ("- Alert monitor (every 10 min): " + $nameAlert)
if ($EnableLogoffCloseout) {
    Write-Output ("- Logoff closeout: " + $nameLogoff + $(if ($EnablePushOnLogoff) { " (push enabled)" } else { " (skip push)" }))
} else {
    Write-Output "- Logoff closeout: not enabled (optional)"
}
