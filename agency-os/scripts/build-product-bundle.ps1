param(
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

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$outDir = Join-Path $root "dist"
Ensure-Dir -Path $outDir

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$bundleDir = Join-Path $outDir ("agency-os-bundle-" + $stamp)
Ensure-Dir -Path $bundleDir

$include = @(
    "README.md",
    "AGENTS.md",
    "BOOTSTRAP.md",
    "TASKS.md",
    "WORKLOG.md",
    "docs",
    "automation",
    "project-kit",
    "tenants/templates",
    "scripts/doc-sync-automation.ps1",
    "scripts/system-health-check.ps1",
    "scripts/system-guard.ps1",
    "scripts/build-product-bundle.ps1"
)

foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $bundleDir $item
    if ((Get-Item $src).PSIsContainer) {
        Copy-Item -Path $src -Destination $dst -Recurse -Force
    } else {
        Ensure-Dir -Path ([System.IO.Path]::GetDirectoryName($dst))
        Copy-Item -Path $src -Destination $dst -Force
    }
}

$zipPath = Join-Path $outDir ("agency-os-bundle-" + $stamp + ".zip")
if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath

Write-Output ("Bundle created: dist/" + [System.IO.Path]::GetFileName($zipPath))
