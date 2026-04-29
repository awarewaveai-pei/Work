param(
    [string]$AgencyOsRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $AgencyOsRoot) {
    $AgencyOsRoot = Join-Path $PSScriptRoot "..\agency-os"
}
$agency = (Resolve-Path -LiteralPath $AgencyOsRoot).Path
$target = Join-Path $agency "scripts\check-supabase-memory-monthly.ps1"
if (-not (Test-Path -LiteralPath $target)) {
    throw "Missing target script: $target"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target -AgencyOsRoot $agency
exit $LASTEXITCODE
