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

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$tenantDir = Join-Path $root ("tenants/" + $TenantSlug)
$schedulePath = Join-Path $tenantDir "OPERATIONS_SCHEDULE.json"
if (-not (Test-Path $schedulePath)) { throw "Missing schedule file: $schedulePath" }

$conf = Read-Json -Path $schedulePath
$scheduler = $conf.scheduler
if (-not $scheduler) { throw "Missing scheduler config in OPERATIONS_SCHEDULE.json" }
$adhocEnabled = $true
if ($null -ne $scheduler.adhoc_enabled) {
    $adhocEnabled = [bool]$scheduler.adhoc_enabled
}

$runnerPath = Join-Path $root "automation/TENANT_AUTOMATION_RUNNER.ps1"
$runnerPathQuoted = Quote-Arg -Value $runnerPath
$rootQuoted = Quote-Arg -Value $root
$tenantSlugQuoted = Quote-Arg -Value $TenantSlug
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

$trDaily = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $runnerPathQuoted + " -TenantSlug " + $tenantSlugQuoted + " -Frequency daily -WorkspaceRoot " + $rootQuoted
$trWeekly = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $runnerPathQuoted + " -TenantSlug " + $tenantSlugQuoted + " -Frequency weekly -WorkspaceRoot " + $rootQuoted
$trMonthly = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $runnerPathQuoted + " -TenantSlug " + $tenantSlugQuoted + " -Frequency monthly -WorkspaceRoot " + $rootQuoted

Invoke-Schtasks -Args @("/Create", "/F", "/SC", "DAILY", "/TN", $names.daily, "/TR", $trDaily, "/ST", $scheduler.daily_time) | Out-Null
Invoke-Schtasks -Args @("/Create", "/F", "/SC", "WEEKLY", "/D", $scheduler.weekly_day, "/TN", $names.weekly, "/TR", $trWeekly, "/ST", $scheduler.weekly_time) | Out-Null
Invoke-Schtasks -Args @("/Create", "/F", "/SC", "MONTHLY", "/D", [string]$scheduler.monthly_day, "/TN", $names.monthly, "/TR", $trMonthly, "/ST", $scheduler.monthly_time) | Out-Null
if ($adhocEnabled) {
    $trAdhoc = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $runnerPathQuoted + " -TenantSlug " + $tenantSlugQuoted + " -Frequency adhoc -WorkspaceRoot " + $rootQuoted
    Invoke-Schtasks -Args @("/Create", "/F", "/SC", "MINUTE", "/MO", [string]$scheduler.adhoc_interval_minutes, "/TN", $names.adhoc, "/TR", $trAdhoc) | Out-Null
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
