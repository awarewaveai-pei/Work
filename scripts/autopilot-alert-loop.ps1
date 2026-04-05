param(
    [string]$WorkRoot = "",
    [int]$IntervalSeconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$mutexName = "Global\\AgencyOS-Autopilot-AlertLoop"
$created = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$created)
if (-not $created) {
    exit 0
}

try {
    while ($true) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $WorkRoot "scripts\autopilot-phase1.ps1") -Mode alert -WorkRoot $WorkRoot | Out-Null
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
