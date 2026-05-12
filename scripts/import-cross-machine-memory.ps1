# import-cross-machine-memory.ps1
# Auto-imports MEMORY.md from AO-SYNC-*\ if a newer version is found.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# Search order for AO-SYNC folders:
#   1. $env:AO_SYNC_ROOT (machine-specific config)
#   2. G:\我的雲端硬碟\AO-SYNC (Google Drive default, if drive exists)
#   3. Desktop (legacy fallback)
# Searches ALL available locations and picks the latest folder by name.
#
# Logic:
#   1. Find latest AO-SYNC-<date> folder across all search paths (by name, descending)
#   2. Skip if .imported flag exists in that folder (already processed this export)
#   3. Skip if destination MEMORY.md is already newer than source
#   4. Import and write .imported flag so next AO-RESUME doesn't re-import same file

param([string]$WorkRoot = "")

$memDest = "$env:USERPROFILE\.claude\projects\c--Users-USER-Work\memory"

# Build list of directories to search
# Priority: env var > Google Drive auto-detect (scan G:\ to avoid non-ASCII hardcoding) > Desktop
$searchRoots = @()
if ($env:AO_SYNC_ROOT) {
    $searchRoots += $env:AO_SYNC_ROOT
} else {
    # Auto-detect: scan G:\ for first child directory (avoids hardcoding non-ASCII folder names)
    if (Test-Path "G:\") {
        $gdRoot = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
        if ($gdRoot) { $searchRoots += (Join-Path $gdRoot "AO-SYNC") }
    }
}
$searchRoots += [Environment]::GetFolderPath('Desktop')
$searchRoots = $searchRoots | Select-Object -Unique

# Collect AO-SYNC-* folders across all roots, pick latest by name
$syncFolders = @(
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            Get-ChildItem -Path $root -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue
        }
    }
) | Sort-Object Name -Descending

if ($syncFolders.Count -eq 0) {
    # Normal for primary machine — no AO-SYNC to import
    exit 0
}

$latest   = $syncFolders[0]
$srcFile  = Join-Path $latest.FullName "memory\MEMORY.md"
$doneFlag = Join-Path $latest.FullName ".imported"

if (-not (Test-Path -LiteralPath $srcFile)) {
    exit 0
}

# Already imported this export
if (Test-Path -LiteralPath $doneFlag) {
    exit 0
}

# Compare timestamps
$destFile = Join-Path $memDest "MEMORY.md"
$srcTime  = (Get-Item -LiteralPath $srcFile).LastWriteTimeUtc

if (Test-Path -LiteralPath $destFile) {
    $destTime = (Get-Item -LiteralPath $destFile).LastWriteTimeUtc
    if ($srcTime -le $destTime) {
        # Destination already current — mark flag and exit
        "already-current $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" |
            Out-File -FilePath $doneFlag -Encoding UTF8 -Force
        Write-Host "  cross-machine import: MEMORY.md already current ($(($latest).Name))" -ForegroundColor DarkGray
        exit 0
    }
}

if (-not (Test-Path -LiteralPath $memDest)) {
    New-Item -ItemType Directory -Path $memDest -Force | Out-Null
}
Copy-Item -LiteralPath $srcFile -Destination $destFile -Force

"imported $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" |
    Out-File -FilePath $doneFlag -Encoding UTF8 -Force

Write-Host "  cross-machine import: MEMORY.md imported from $(($latest).Name)" -ForegroundColor Green
exit 0
