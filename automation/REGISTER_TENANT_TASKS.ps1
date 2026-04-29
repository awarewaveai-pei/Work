param(
    [Parameter(Mandatory = $true)][string]$TenantSlug,
    [string]$WorkspaceRoot = "",
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

function Read-Json {
    param([string]$Path)
    return (Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json)
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

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$monorepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$launcher = Join-Path $monorepoRoot "scripts\scheduled-task-launcher.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing scheduled-task-launcher.ps1 at $launcher (expected monorepo root scripts)."
}
$tenantDir = Join-Path $root ("tenants/" + $TenantSlug)
$schedulePath = Join-Path $tenantDir "OPERATIONS_SCHEDULE.json"
if (-not (Test-Path $schedulePath)) { throw "Missing schedule file: $schedulePath" }

$conf = Read-Json -Path $schedulePath
$scheduler = $conf.PSObject.Properties["scheduler"]
if ($null -eq $scheduler -or $null -eq $scheduler.Value) {
    # Backward-compatible defaults for legacy tenant schedule files.
    $schedulerObj = [pscustomobject]@{
        daily_time = "09:00"
        weekly_day = "MON"
        weekly_time = "09:30"
        monthly_day = 1
        monthly_time = "10:00"
        adhoc_interval_minutes = 15
    }
} else {
    $schedulerObj = $scheduler.Value
}
$adhocEnabled = $true
$adhocProp = $schedulerObj.PSObject.Properties["adhoc_enabled"]
if ($null -ne $adhocProp -and $null -ne $adhocProp.Value) {
    $adhocEnabled = [bool]$adhocProp.Value
}

$runnerPath = Join-Path $root "automation/TENANT_AUTOMATION_RUNNER.ps1"
$runnerPathQuoted = Quote-Arg -Value $runnerPath
$launcherQuoted = Quote-Arg -Value $launcher
$rootSq = $root.Replace("'", "''")
$slugSq = $TenantSlug.Replace("'", "''")
$taskBase = "AgencyOS-" + $TenantSlug

$names = @{
    daily = $taskBase + "-daily"
    weekly = $taskBase + "-weekly"
    monthly = $taskBase + "-monthly"
    adhoc = $taskBase + "-adhoc"
}

foreach ($key in @("daily", "weekly", "monthly", "adhoc")) {
    try { Invoke-Schtasks -Args @("/Delete", "/F", "/TN", $names[$key]) | Out-Null } catch {}
}

if ($RemoveOnly) {
    Write-Output ("Removed tasks for tenant: " + $TenantSlug)
    exit 0
}

function New-TenantTr {
    param([string]$Frequency, [string]$LogStem)
    $plain = "-TenantSlug '$slugSq' -Frequency $Frequency -WorkspaceRoot '$rootSq'"
    return "powershell -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File " + $launcherQuoted +
        " -TargetScript " + $runnerPathQuoted +
        " -ExtraArgsB64 " + (Encode-ExtraArgsB64 -Plain $plain) +
        " -LogStem " + (Quote-Arg $LogStem)
}

$trDaily = New-TenantTr -Frequency "daily" -LogStem ("Tenant-" + $TenantSlug + "-daily")
$trWeekly = New-TenantTr -Frequency "weekly" -LogStem ("Tenant-" + $TenantSlug + "-weekly")
$trMonthly = New-TenantTr -Frequency "monthly" -LogStem ("Tenant-" + $TenantSlug + "-monthly")

Invoke-Schtasks -Args @("/Create", "/F", "/SC", "DAILY", "/TN", $names.daily, "/TR", (Quote-Arg $trDaily), "/ST", $schedulerObj.daily_time) | Out-Null
Invoke-Schtasks -Args @("/Create", "/F", "/SC", "WEEKLY", "/D", $schedulerObj.weekly_day, "/TN", $names.weekly, "/TR", (Quote-Arg $trWeekly), "/ST", $schedulerObj.weekly_time) | Out-Null
Invoke-Schtasks -Args @("/Create", "/F", "/SC", "MONTHLY", "/D", [string]$schedulerObj.monthly_day, "/TN", $names.monthly, "/TR", (Quote-Arg $trMonthly), "/ST", $schedulerObj.monthly_time) | Out-Null
if ($adhocEnabled) {
    $trAdhoc = New-TenantTr -Frequency "adhoc" -LogStem ("Tenant-" + $TenantSlug + "-adhoc")
    Invoke-Schtasks -Args @("/Create", "/F", "/SC", "MINUTE", "/MO", [string]$schedulerObj.adhoc_interval_minutes, "/TN", $names.adhoc, "/TR", (Quote-Arg $trAdhoc)) | Out-Null
}

Invoke-Schtasks -Args @("/Query", "/TN", $names.daily) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $names.weekly) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $names.monthly) | Out-Null
if ($adhocEnabled) {
    Invoke-Schtasks -Args @("/Query", "/TN", $names.adhoc) | Out-Null
} else {
    Write-Output ("Adhoc task disabled for tenant: " + $TenantSlug)
}

Write-Output ("Registered tasks for tenant: " + $TenantSlug)
