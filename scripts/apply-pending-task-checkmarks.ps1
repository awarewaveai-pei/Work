param(
    [string]$WorkRoot = ""
)

# Legacy entry: only the gitignored pending file (no WORKLOG markers).
# Prefer scripts/apply-closeout-task-checkmarks.ps1 (used by AO-CLOSE).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$owner = Join-Path $PSScriptRoot "apply-closeout-task-checkmarks.ps1"
if (-not (Test-Path -LiteralPath $owner)) {
    Write-Error "apply-pending-task-checkmarks: missing $owner"
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $owner -WorkRoot $WorkRoot -PendingFileOnly
exit $LASTEXITCODE
