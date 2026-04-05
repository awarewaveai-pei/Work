param(
    [Parameter(Mandatory = $true)][string]$TenantSlug,
    [ValidateSet("daily", "weekly", "monthly", "adhoc")][string]$Frequency = "daily",
    [string]$WorkspaceRoot = ""
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

function Write-Json {
    param([string]$Path, [object]$Data)
    Set-Content -Path $Path -Value ($Data | ConvertTo-Json -Depth 10) -Encoding UTF8
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Invoke-TaskCommand {
    param([string]$CommandText)
    if (-not $CommandText) { return @{ ok = $true; output = "No command provided." } }
    try {
        $output = Invoke-Expression $CommandText | Out-String
        return @{ ok = $true; output = $output.Trim() }
    } catch {
        return @{ ok = $false; output = $_.Exception.Message }
    }
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$tenantDir = Join-Path $root ("tenants/" + $TenantSlug)
$schedulePath = Join-Path $tenantDir "OPERATIONS_SCHEDULE.json"
$queuePath = Join-Path $tenantDir "OPS_QUEUE.json"

if (-not (Test-Path $schedulePath)) { throw "Missing schedule file: $schedulePath" }

$schedule = Read-Json -Path $schedulePath
$runAt = (Get-Date)
$results = @()

if ($Frequency -ne "adhoc") {
    $tasks = @()
    if ($schedule.tasks -and $schedule.tasks.$Frequency) {
        $tasks = @($schedule.tasks.$Frequency)
    }
    foreach ($task in $tasks) {
        if ($task.enabled -eq $false) { continue }
        $exec = Invoke-TaskCommand -CommandText $task.command
        $results += [ordered]@{
            id = $task.id
            title = $task.title
            type = $task.type
            frequency = $Frequency
            ok = $exec.ok
            output = $exec.output
            run_at = $runAt.ToString("o")
        }
    }
}

if ($Frequency -eq "adhoc") {
    if (-not (Test-Path $queuePath)) {
        Write-Json -Path $queuePath -Data @{ items = @() }
    }
    $queue = Read-Json -Path $queuePath
    $items = @($queue.items)
    $now = (Get-Date).ToUniversalTime()

    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        if ($item.status -ne "pending") { continue }
        $canRun = $true
        if ($item.not_before_utc) {
            $nb = [datetime]::Parse($item.not_before_utc).ToUniversalTime()
            if ($nb -gt $now) { $canRun = $false }
        }
        if (-not $canRun) { continue }

        $exec = Invoke-TaskCommand -CommandText $item.command
        $items[$i].status = if ($exec.ok) { "done" } else { "failed" }
        $items[$i].executed_at_utc = $now.ToString("o")
        $items[$i].result = $exec.output
        $results += [ordered]@{
            id = $item.id
            title = $item.title
            type = "adhoc"
            frequency = "adhoc"
            ok = $exec.ok
            output = $exec.output
            run_at = $runAt.ToString("o")
        }
    }

    $queue.items = $items
    Write-Json -Path $queuePath -Data $queue
}

$reportDir = Join-Path $root ("reports/automation/" + $TenantSlug)
Ensure-Dir -Path $reportDir
$stamp = $runAt.ToString("yyyyMMdd-HHmmss")
$reportPath = Join-Path $reportDir ("run-" + $Frequency + "-" + $stamp + ".md")
$jsonPath = Join-Path $reportDir ("run-" + $Frequency + "-" + $stamp + ".json")

$lines = @()
$lines += "# Tenant Automation Run"
$lines += ""
$lines += ('- Tenant: `{0}`' -f $TenantSlug)
$lines += ('- Frequency: `{0}`' -f $Frequency)
$lines += ('- Time: `{0}`' -f $runAt.ToString("yyyy-MM-dd HH:mm:ss"))
$lines += ""
$lines += "## Results"
if ($results.Count -eq 0) {
    $lines += "- No tasks executed."
} else {
    foreach ($r in $results) {
        $status = if ($r.ok) { "OK" } else { "FAILED" }
        $lines += ('- [{0}] `{1}` - {2}' -f $status, $r.id, $r.title)
    }
}

Set-Content -Path $reportPath -Value ($lines -join "`r`n") -Encoding UTF8
Write-Json -Path $jsonPath -Data @{ tenant = $TenantSlug; frequency = $Frequency; run_at = $runAt.ToString("o"); results = $results }

Write-Output ("Automation report: reports/automation/" + $TenantSlug + "/" + [System.IO.Path]::GetFileName($reportPath))
