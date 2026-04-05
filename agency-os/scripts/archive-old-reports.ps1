param(
    [string]$WorkspaceRoot = "",
    [int]$KeepDays = 30,
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }

    # Monorepo guardrail: if invoked from D:\Work, force canonical agency root.
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\archive-old-reports.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }

    return $resolved
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$reportsRoot = Join-Path $root "reports"
if (-not (Test-Path $reportsRoot)) {
    Write-Output "No reports directory found. Nothing to archive."
    exit 0
}

$archiveRoot = Join-Path $root "reports/archive"
$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$sessionArchiveRoot = Join-Path $archiveRoot $stamp

$cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($KeepDays))
$targets = @()

Get-ChildItem -Path $reportsRoot -Recurse -File | ForEach-Object {
    $full = $_.FullName
    if ($full.StartsWith($archiveRoot, [System.StringComparison]::OrdinalIgnoreCase)) { return }
    if ($_.LastWriteTime -lt $cutoff) {
        $targets += $_
    }
}

if ($targets.Count -eq 0) {
    Write-Output ("No files older than {0} days." -f $KeepDays)
    exit 0
}

$preview = $targets | Group-Object { $_.DirectoryName.Replace($root + "\", "") } | Sort-Object Name
Write-Output ("Archive candidates: {0} files older than {1} days." -f $targets.Count, $KeepDays)
foreach ($g in $preview) {
    Write-Output ("- {0}: {1}" -f $g.Name, $g.Count)
}

if (-not $Apply) {
    Write-Output "Preview mode only. Re-run with -Apply to archive files."
    exit 0
}

Ensure-Dir -Path $sessionArchiveRoot
foreach ($f in $targets) {
    $rel = $f.FullName.Replace($root + "\", "")
    $dest = Join-Path $sessionArchiveRoot $rel
    Ensure-Dir -Path ([System.IO.Path]::GetDirectoryName($dest))
    Move-Item -Path $f.FullName -Destination $dest -Force
}

Write-Output ("Archived files to: {0}" -f $sessionArchiveRoot)
