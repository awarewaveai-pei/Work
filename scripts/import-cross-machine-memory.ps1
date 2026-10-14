# import-cross-machine-memory.ps1
# Auto-imports all cross-machine files from the sync folder on AO-RESUME.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# Sources:
#   MEMORY.md             -- $env:AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\MEMORY.md
#   secrets               -- $env:AO_SYNC_SECRETS_ROOT\  (user-env.ps1, .ssh\*, AWARE_WAVE_CREDENTIALS.md)
#                            ~/.claude/settings.json no longer imported here (removed 2026-05-28, Phase B of plan Z);
#                            use scripts\sync-claude-userlevel.ps1 -Mode merge for cross-machine alignment.
#
# Folder selection strategy (N-machine safe):
#   New format (AO-SYNC-date-MACHINE): exclude own machine by folder name suffix -> pick newest OTHER machine
#   Old format (AO-SYNC-date):         exclude own machine via .exported-by tag  -> backward compatible
#   Both formats sorted by date desc; picks the single best candidate.
#
# Import decision (per file) — content-hash based, NO mtime dependency:
#   1. SHA256(vault) == SHA256(local)                            -> unchanged (skip write)
#   2. SHA256(vault) != SHA256(local):
#      a. -Force flag present                                     -> import (force overwrite)
#      b. no local-state entry (first run / new file)            -> import (vault is authoritative)
#      c. SHA256(local) == local-state entry                     -> import (local unchanged since last sync)
#      d. SHA256(local) != local-state entry                     -> local-modified WARN (keep local)
#
# Local state file (machine-local, NOT in git, NOT synced):
#   %LOCALAPPDATA%\AgencyOS\ao-sync-state.json
#   Records SHA256 of each file at last successful import.
#   Enables mtime-free conflict detection: if SHA256(local) matches local-state, the file was not
#   modified since the last import — safe to overwrite with the vault update.
#   Written at end of each session; read lazily at first use.
#
# Use -Force to bypass conflict detection and always overwrite with vault version.
#
# SSH exclusion (never imported):
#   known_hosts, known_hosts.old, authorized_keys, *.txt, *.old, *.bkup, *.backup
#
# Pre-overwrite backup: %LOCALAPPDATA%\AgencyOS\cross-machine-backup\<timestamp>\
#   Auto-purges: keeps last 5 backup sets (older sets deleted on each run).
#
# Drive detection: tries G H F E D I J (not hardcoded to G:).

param(
    [string]$WorkRoot = "",
    [switch]$Force   # Bypass local-modified check; always import vault version
)

# ── 0. Load env vars — User registry always wins over stale process env ─────
# Reason: process env vars can be stale (inherited from IDE started before setx ran).
# Always prefer the persisted User registry value; fall back to process env only if registry is empty.
$_regSyncRoot    = [System.Environment]::GetEnvironmentVariable('AO_SYNC_ROOT',         'User')
$_regSecretsRoot = [System.Environment]::GetEnvironmentVariable('AO_SYNC_SECRETS_ROOT', 'User')
if ($_regSyncRoot)    { $env:AO_SYNC_ROOT         = $_regSyncRoot }
if ($_regSecretsRoot) { $env:AO_SYNC_SECRETS_ROOT = $_regSecretsRoot }

# ── 1. Resolve WorkRoot ───────────────────────────────────────────────────────
if (-not $WorkRoot) {
    # scripts\ sits directly under the monorepo root (the only scripts tree).
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
# Normalise WorkRoot to Windows-style backslash before deriving project key.
# Same reason as the export script: Join-Path normalises '/' to '\' which would
# split 'd-/Work' into TWO path segments. Defensive against forward-slash callers.
if ($WorkRoot) {
    try { $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path } catch { }
}

# ── Helper: SHA256 hash of a file, empty string if missing ───────────────────
function Get-SafeHash([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }
    return ""
}

# ── Helper: ensure UTF-8 BOM on a .md file (idempotent) ──────────────────────
# Why: .md files crossing Google Drive can be misread as Big5 by PowerShell on Windows
# when no BOM is present, producing garbled CJK. Read-as-UTF-8 handles both BOM and
# non-BOM source; write-with-BOM normalises. Used at the cross-machine boundary so
# downstream readers (any PowerShell version, any code page) decode correctly.
function Set-Utf8BomOnFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($Path, $content, $utf8bom)
}

# ── Helper: pre-overwrite local backup ───────────────────────────────────────
# Saves the current local file before overwriting so recovery is always possible.
# Location: %LOCALAPPDATA%\AgencyOS\cross-machine-backup\<timestamp>\<RelLabel>
$script:BackupTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$script:BackupRoot      = Join-Path $env:LOCALAPPDATA 'AgencyOS\cross-machine-backup'

function Invoke-LocalBackup([string]$Path, [string]$RelLabel) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $dst    = Join-Path $script:BackupRoot "$script:BackupTimestamp\$($RelLabel -replace '/', '\')"
    $dstDir = Split-Path $dst -Parent
    try {
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force -ErrorAction Stop | Out-Null }
        Copy-Item -LiteralPath $Path -Destination $dst -Force -ErrorAction Stop
    } catch {
        Write-Host "  WARN: backup failed for '$RelLabel' -> '$dst': $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Invoke-PurgeOldBackups {
    if (-not (Test-Path $script:BackupRoot)) { return }
    Get-ChildItem $script:BackupRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -Skip 5 |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}

# ── Helper: read the most-recent export manifest (logging only) ───────────────
# Returns PSCustomObject with exported_utc, machine, files — or $null if none found.
# NOTE: manifest is used for logging only; import decisions use local state (not manifest).
function Read-ExportManifest([string]$SecretsRoot) {
    if (-not (Test-Path -LiteralPath $SecretsRoot)) { return $null }
    $best = $null; $bestUtc = [datetime]::MinValue
    Get-ChildItem -Path $SecretsRoot -Filter '.manifest-*.json' -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            try {
                $data = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                $utc  = [datetime]::Parse($data.exported_utc, $null,
                            [System.Globalization.DateTimeStyles]::RoundtripKind)
                if ($utc -gt $bestUtc) { $bestUtc = $utc; $best = $data }
            } catch { }
        }
    return $best
}

# Per-machine export timestamp from .manifest-<machine>.json (full UTC, for same-date tie-break).
function Get-MachineExportUtc([string]$SecretsRoot, [string]$Machine) {
    if (-not $SecretsRoot -or -not $Machine -or -not (Test-Path -LiteralPath $SecretsRoot)) { return $null }
    $mf = Join-Path $SecretsRoot ".manifest-$Machine.json"
    if (-not (Test-Path -LiteralPath $mf)) { return $null }
    try {
        $data = Get-Content -LiteralPath $mf -Raw -Encoding UTF8 | ConvertFrom-Json
        return [datetime]::Parse($data.exported_utc, $null,
                   [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    } catch { return $null }
}

# True when an other-machine folder dated the SAME calendar day as own machine carries a
# strictly newer manifest timestamp (folder names hold date only -> must compare full UTC).
# Unreadable / missing timestamps -> $false (keep the safe "skip same-date" behaviour).
function Test-SameDateOtherNewer($Entry, $OwnUtc, [string]$SecretsRoot) {
    if (-not $Entry.IsNewFormat -or -not $Entry.FolderMachine -or -not $OwnUtc) { return $false }
    # Both machines' manifests live in the SAME secrets root, so reuse the caller-resolved root
    # (honours $env:AO_SYNC_SECRETS_ROOT, same precedence as the own-side lookup) and only fall
    # back to deriving from the folder path when the caller passed nothing.
    $sr = if ($SecretsRoot) { $SecretsRoot } else { Split-Path (Split-Path $Entry.Folder.FullName -Parent) -Parent }
    $otherUtc = Get-MachineExportUtc $sr $Entry.FolderMachine
    if (-not $otherUtc) { return $false }
    # Assumes both machines are NTP-synced; collision window is bounded to a single calendar day.
    return ($otherUtc -gt $OwnUtc)
}

# ── Local state: tracks SHA256 of each file at last successful import ─────────
# Stored machine-locally (not in git, not synced to other machines).
# Enables mtime-free conflict detection:
#   SHA256(local) == local-state.sha256  ->  local unchanged since last sync  ->  safe to overwrite
#   SHA256(local) != local-state.sha256  ->  local was modified               ->  true conflict, keep local
$script:LocalStatePath     = Join-Path $env:LOCALAPPDATA 'AgencyOS\ao-sync-state.json'
$script:LocalState         = $null    # loaded lazily on first Get-LocalStateHash call
$script:LocalStateModified = $false
$script:ImportFromMachine  = ''

function Read-LocalState {
    if ($null -ne $script:LocalState) { return $script:LocalState }
    if (Test-Path -LiteralPath $script:LocalStatePath) {
        try {
            $raw = Get-Content -LiteralPath $script:LocalStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
            # ConvertFrom-Json returns PSCustomObject; convert .files to hashtable for dynamic key access.
            $ht = @{}
            if ($null -ne $raw.files) {
                $raw.files.PSObject.Properties | ForEach-Object { $ht[$_.Name] = $_.Value }
            }
            $script:LocalState = [PSCustomObject]@{
                last_import_utc = [string]$raw.last_import_utc
                from_machine    = [string]$raw.from_machine
                files           = $ht
            }
            return $script:LocalState
        } catch { }
    }
    # No state file yet (first run on this machine).
    $script:LocalState = [PSCustomObject]@{ last_import_utc = ''; from_machine = ''; files = @{} }
    return $script:LocalState
}

function Get-LocalStateHash([string]$FileKey) {
    $entry = (Read-LocalState).files[$FileKey]
    if ($null -eq $entry) { return '' }
    return [string]$entry.sha256   # works for both PSCustomObject and hashtable values
}

# Called after each successful import or unchanged confirmation. Marks local state dirty.
function Update-LocalStateHash([string]$FileKey, [string]$Sha256) {
    (Read-LocalState).files[$FileKey] = @{ sha256 = $Sha256 }
    $script:LocalStateModified = $true
}

# Flush in-memory state to disk. Called once at end of import session.
function Write-LocalState {
    $state = Read-LocalState
    $state.last_import_utc = (Get-Date).ToUniversalTime().ToString('o')
    $state.from_machine    = $script:ImportFromMachine
    $dir = Split-Path $script:LocalStatePath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [ordered]@{
        last_import_utc = $state.last_import_utc
        from_machine    = $state.from_machine
        files           = $state.files
    } | ConvertTo-Json -Depth 3 | Out-File -LiteralPath $script:LocalStatePath -Encoding UTF8 -Force
}

# ── Helper: decide whether to import a file (content-hash, no mtime) ─────────
# Returns: 'unchanged' | 'import' | 'local-modified' | 'local-ahead'
#   unchanged    : SHA256 identical — no write needed
#   import       : vault has update; local not modified since last sync — safe to overwrite
#   local-modified: SHA256 differs AND local was modified since last sync — keep local, warn user
#   local-ahead  : same-machine vault (own ao-close snapshot); local is newer than vault — normal, no action
#
# -Force bypasses conflict checks and always returns 'import'.
# $SameMachine: $true when vault was exported by this machine — changes WARN to informational.
function Get-ImportDecision([string]$SrcPath, [string]$DstPath, [string]$FileKey, [bool]$SameMachine = $false) {
    $srcHash = Get-SafeHash $SrcPath
    $dstHash = Get-SafeHash $DstPath

    if ($srcHash -eq $dstHash) { return 'unchanged' }
    if ($Force)                { return 'import' }

    # Re-verify after short pause — catches transient reads (OS cache flush, sync client mid-write).
    # Prevents false WARN when files are actually identical but hash was read during a write operation.
    Start-Sleep -Milliseconds 400
    $srcHash = Get-SafeHash $SrcPath
    $dstHash = Get-SafeHash $DstPath
    if ($srcHash -eq $dstHash) { return 'unchanged' }

    # Same-machine vault: local being ahead of vault is expected (modified after last ao-close).
    # Not a conflict — local changes will be exported on next ao-close.
    if ($SameMachine) { return 'local-ahead' }

    $stateHash = Get-LocalStateHash $FileKey
    if ($stateHash -eq '')         { return 'import' }   # first run / new file — vault authoritative
    if ($dstHash   -eq $stateHash) { return 'import' }   # local unchanged since last sync
    return 'local-modified'                               # cross-machine conflict — keep local, warn user
}

# ── Helper: atomic copy with post-write SHA256 verification ──────────────────
# Writes to a .tmp file, verifies hash, then renames. Prevents partial writes.
# Returns $true on success.
function Copy-Atomic([string]$Src, [string]$Dst) {
    $tmp = "$Dst.aosync-tmp"
    try {
        Copy-Item -LiteralPath $Src -Destination $tmp -Force
        if ((Get-SafeHash $tmp) -ne (Get-SafeHash $Src)) {
            Write-Host "  WARN: post-copy verify failed -- skipped: $(Split-Path $Dst -Leaf)" -ForegroundColor Yellow
            return $false
        }
        Move-Item -LiteralPath $tmp -Destination $Dst -Force
        return $true
    } catch {
        Write-Host "  WARN: copy-atomic error ($($_.Exception.Message))" -ForegroundColor Yellow
        return $false
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

# ── 2. MEMORY.md import ───────────────────────────────────────────────────────
# Derive Claude Code project key from WorkRoot (works across machines/drives).
# e.g.  C:\Users\USER\Work  ->  c--Users-USER-Work
#       D:\Work             ->  d--Work
if ($WorkRoot) {
    $projectKey = $WorkRoot.Substring(0,1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '\\', '-')
    $memDest    = Join-Path $env:USERPROFILE ".claude\projects\$projectKey\memory"
} else {
    $projectKey = ""
    $memDest    = ""
}

$searchRoots = @()
if ($env:AO_SYNC_ROOT) {
    # Env var is set -- search only that path; do NOT also search Desktop.
    # Mixing paths with the same folder names causes the wrong version to be picked.
    $searchRoots += $env:AO_SYNC_ROOT
} else {
    # Auto-detect: tries drive letters G H F E D I J (not hardcoded to G:).
    $gdFound = $false
    foreach ($drvLetter in @('G', 'H', 'F', 'E', 'D', 'I', 'J')) {
        $drvRoot = "${drvLetter}:\"
        if (-not (Test-Path $drvRoot)) { continue }
        $myDrive = Get-ChildItem $drvRoot -Directory -ErrorAction SilentlyContinue |
                   Select-Object -First 1 -ExpandProperty FullName
        if (-not $myDrive) { continue }
        $detected = Get-ChildItem -Path $myDrive -Filter "AO-SYNC" -Directory `
                        -Recurse -Depth 2 -ErrorAction SilentlyContinue |
                    Select-Object -First 1 -ExpandProperty FullName
        if ($detected) {
            $searchRoots += $detected
            $gdFound = $true
            # Auto-derive secrets root from AO-SYNC location (parent folder)
            if (-not $env:AO_SYNC_SECRETS_ROOT) {
                $env:AO_SYNC_SECRETS_ROOT = Split-Path $detected -Parent
                Write-Host "  auto-derived: AO_SYNC_SECRETS_ROOT = $env:AO_SYNC_SECRETS_ROOT" -ForegroundColor DarkGray
            }
            break
        }
    }
    # Desktop fallback only when Google Drive auto-detect also finds nothing.
    if (-not $gdFound) {
        $searchRoots += [Environment]::GetFolderPath('Desktop')
    }
}
$searchRoots = $searchRoots | Select-Object -Unique

# Sanitise own machine tag (same rule as export script)
$machineTag = $env:COMPUTERNAME.ToUpper() -replace '[^A-Za-z0-9]', '-'

# ── Collect + classify all AO-SYNC-* folders ─────────────────────────────────
# Supports both naming formats:
#   New: AO-SYNC-2026-05-13-DESKTOP-PC   (per-machine, no collision)
#   Old: AO-SYNC-2026-05-13              (legacy, single folder per day)
$allFolders = @(
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            Get-ChildItem -Path $root -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue
        }
    }
)

# Find own machine's latest export date (to avoid importing older data from another machine).
# Scenario: same-machine AO-CLOSE → AO-RESUME — own export is today, other machine is yesterday.
# Without this guard, we would overwrite today's MEMORY.md with yesterday's other-machine version.
$ownLatestDateStr = $allFolders | ForEach-Object {
    if ($_.Name -match "^AO-SYNC-(\d{4}-\d{2}-\d{2})-$([regex]::Escape($machineTag))$") { $matches[1] }
} | Sort-Object -Descending | Select-Object -First 1

# Own machine's full export timestamp (for the same-date tie-break below). Folder names carry
# the date only, so two machines that export on the same calendar day are indistinguishable by
# name; the manifest exported_utc breaks the tie. Null when own machine has no manifest yet.
$ownExportUtc   = $null
$ownSecretsRoot = $null
if ($ownLatestDateStr) {
    $ownFolder = $allFolders | Where-Object { $_.Name -eq "AO-SYNC-$ownLatestDateStr-$machineTag" } | Select-Object -First 1
    $ownSecretsRoot = if ($env:AO_SYNC_SECRETS_ROOT) { $env:AO_SYNC_SECRETS_ROOT }
                      elseif ($ownFolder) { Split-Path (Split-Path $ownFolder.FullName -Parent) -Parent }
                      else { $null }
    $ownExportUtc = Get-MachineExportUtc $ownSecretsRoot $machineTag
}

$candidateFolders = @(
    $allFolders | ForEach-Object {
        $name = $_.Name
        if ($name -match '^AO-SYNC-(\d{4}-\d{2}-\d{2})-(.+)$') {
            [PSCustomObject]@{ Folder = $_; DateStr = $matches[1]; IsNewFormat = $true;  FolderMachine = $matches[2] }
        } elseif ($name -match '^AO-SYNC-(\d{4}-\d{2}-\d{2})$') {
            [PSCustomObject]@{ Folder = $_; DateStr = $matches[1]; IsNewFormat = $false; FolderMachine = '' }
        }
        # Folders that don't match either pattern are silently ignored
    } | Where-Object {
        $_ -ne $null -and
        # Exclude own machine folders
        -not ($_.IsNewFormat -and $_.FolderMachine -eq $machineTag) -and
        # Import when the other machine's export is newer than own machine's latest export:
        #   newer date          -> always import
        #   same date           -> compare full manifest timestamps (fixes 2026-06-16 same-day skip bug)
        #   older / unreadable   -> skip (protect fresh local data)
        (
            $null -eq $ownLatestDateStr -or
            $_.DateStr -gt $ownLatestDateStr -or
            ($_.DateStr -eq $ownLatestDateStr -and (Test-SameDateOtherNewer $_ $ownExportUtc $ownSecretsRoot))
        )
    } | Sort-Object DateStr -Descending   # newest date first
)

if ($ownLatestDateStr -and $candidateFolders.Count -eq 0 -and $allFolders.Count -gt 0) {
    Write-Host "  cross-machine import: skipped — no other-machine export newer than own machine's latest ($ownLatestDateStr); local is current" -ForegroundColor DarkGray
}

# ── MEMORY.md import ──────────────────────────────────────────────────────────
# Always overwrites -- last-AO-CLOSE-wins by design (no SHA256 guard on MEMORY.md).
if ($candidateFolders.Count -gt 0 -and $memDest) {

    $best = $null
    foreach ($entry in $candidateFolders) {
        if ($entry.IsNewFormat) {
            $best = $entry; break
        } else {
            # Old format: double-check .exported-by (backward compat)
            $exportedByFile = Join-Path $entry.Folder.FullName "memory\.exported-by"
            $exportedBy = ''
            if (Test-Path -LiteralPath $exportedByFile) {
                $exportedBy = (Get-Content -LiteralPath $exportedByFile -Raw -Encoding UTF8).Trim()
            }
            if ($exportedBy -ne $env:COMPUTERNAME) {
                $best = $entry
                $best | Add-Member -NotePropertyName ExportedBy -NotePropertyValue $exportedBy -Force
                break
            }
        }
    }

    if (-not $best) {
        Write-Host "  cross-machine import: MEMORY.md skipped (all AO-SYNC folders belong to this machine)" -ForegroundColor DarkGray
    } else {
        $srcFile = Join-Path $best.Folder.FullName "memory\MEMORY.md"
        if (-not (Test-Path -LiteralPath $srcFile)) {
            Write-Host "  cross-machine import: MEMORY.md not found in $($best.Folder.Name)" -ForegroundColor DarkGray
        } else {
            if (-not (Test-Path -LiteralPath $memDest)) {
                New-Item -ItemType Directory -Path $memDest -Force | Out-Null
            }
            $memDestPath = Join-Path $memDest "MEMORY.md"
            Copy-Item -LiteralPath $srcFile -Destination $memDestPath -Force
            # Normalise to UTF-8 BOM so PowerShell on this machine never misreads it as Big5
            # regardless of how the source machine wrote it.
            try { Set-Utf8BomOnFile -Path $memDestPath } catch { }
            $fromLabel = if ($best.FolderMachine) { $best.FolderMachine } `
                         elseif ($best.ExportedBy) { $best.ExportedBy } `
                         else { 'unknown machine' }
            $script:ImportFromMachine = $fromLabel
            Write-Host "  cross-machine import: MEMORY.md imported from $($best.Folder.Name) [by: $fromLabel] (UTF-8 BOM enforced)" -ForegroundColor Green
        }

        # ── Individual memory files import ───────────────────────────────────
        # Import each *.md (except MEMORY.md) using SHA256 conflict detection.
        # First run (no local state entry) = vault is authoritative, import.
        # Local-modified (changed since last sync) = keep local, warn user.
        $srcMemDir = Join-Path $best.Folder.FullName "memory"
        if ((Test-Path -LiteralPath $srcMemDir) -and $memDest) {
            if (-not (Test-Path -LiteralPath $memDest)) {
                New-Item -ItemType Directory -Path $memDest -Force | Out-Null
            }
            Get-ChildItem -Path $srcMemDir -Filter "*.md" -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -ne "MEMORY.md" } |
                ForEach-Object {
                    $indSrc  = $_.FullName
                    $indDst  = Join-Path $memDest $_.Name
                    $fileKey = "memory/$($_.Name)"
                    $decision = Get-ImportDecision $indSrc $indDst $fileKey $false
                    # Use $fileKey (captured before switch) instead of $_.Name inside switch blocks.
                    # In PowerShell 5.1, switch ($x) overwrites $_ with $x — $_.Name would be $null.
                    switch ($decision) {
                        'unchanged' {
                            Update-LocalStateHash $fileKey (Get-SafeHash $indSrc)
                            Write-Host "  cross-machine import: $fileKey unchanged" -ForegroundColor DarkGray
                        }
                        'local-modified' {
                            Write-Host "  cross-machine import: $fileKey CONFLICT — vault differs; local kept. Use -Force to take vault." -ForegroundColor Yellow
                        }
                        'import' {
                            Invoke-LocalBackup $indDst $fileKey
                            if (Copy-Atomic $indSrc $indDst) {
                                try { Set-Utf8BomOnFile -Path $indDst } catch { }
                                Update-LocalStateHash $fileKey (Get-SafeHash $indDst)
                                Write-Host "  cross-machine import: $fileKey imported (UTF-8 BOM enforced)" -ForegroundColor Green
                            }
                        }
                    }
                }
        }
    }
} elseif ($candidateFolders.Count -eq 0 -and $allFolders.Count -gt 0) {
    # Distinguish two cases: (a) other-machine folders exist but are older than own machine;
    # (b) all folders belong to own machine (single-machine workflow).
    $otherMachineFolders = @($allFolders | Where-Object {
        $_.Name -match '^AO-SYNC-(\d{4}-\d{2}-\d{2})-(.+)$' -and $matches[2] -ne $machineTag
    } | Sort-Object Name -Descending)
    if ($otherMachineFolders.Count -gt 0) {
        $newestOtherDate = ($otherMachineFolders[0].Name -replace '^AO-SYNC-(\d{4}-\d{2}-\d{2}).*', '$1')
        Write-Host ("  cross-machine import: MEMORY.md skipped — other-machine export ({0}) older than own machine ({1}); local MEMORY.md is current" -f $newestOtherDate, $ownLatestDateStr) -ForegroundColor DarkGray
    } else {
        Write-Host "  cross-machine import: MEMORY.md skipped — single-machine workflow (no other-machine AO-SYNC folder)" -ForegroundColor DarkGray
    }
}

# ── 3. Secrets import ─────────────────────────────────────────────────────────
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
# ASCII-safe display form for log lines. The real path may contain CJK (Google Drive's
# 「我的雲端硬碟」). This script runs as a child of ao-resume.ps1 whose stdout is captured
# under CP950 on Big5 Windows → CJK paths mojibake in ao-resume-hook-last.json log_tail.
# Functionality is unaffected (path is used via -LiteralPath); only the LOG display is masked.
$secretsRootDisplay = if ($secretsRoot -and ($secretsRoot -match '[^\x00-\x7F]')) {
    # Drive letter via regex (Split-Path -Qualifier throws on UNC paths); fall back to <sync>.
    $qual = if ($secretsRoot -match '^([A-Za-z]:)') { $matches[1] } else { '<sync>' }
    $leaf = Split-Path -Leaf $secretsRoot           # "MySecretVault" (ASCII)
    if ($leaf -match '[^\x00-\x7F]') { $leaf = '<vault>' }   # mask if leaf itself is CJK
    "$qual\...\$leaf"
} else { $secretsRoot }
if ($secretsRoot -and (Test-Path -LiteralPath $secretsRoot)) {

    # Load manifest for logging only (not used in import decision logic).
    $manifest = Read-ExportManifest $secretsRoot
    if ($manifest) {
        Write-Host "  manifest loaded: exported by $($manifest.machine) at $($manifest.exported_utc)" -ForegroundColor DarkGray
        if (-not $script:ImportFromMachine) { $script:ImportFromMachine = $manifest.machine }
    }

    # Determine if vault was exported by this machine (own ao-close snapshot).
    # own-machine: local being ahead of vault is normal — local changes will export on next ao-close.
    # cross-machine: vault may have updates from other machine — conflict detection needed.
    $sameMachine = $manifest -and ($manifest.machine -eq $env:COMPUTERNAME)

    if ($Force) {
        Write-Host "  -Force: conflict check bypassed — vault version always wins" -ForegroundColor Yellow
    }

    # Purge old local backups (keep last 5 sets, run once per import session)
    Invoke-PurgeOldBackups

    # ── user-env.ps1 -> mcp\user-env.ps1 ─────────────────────────────────────
    $userEnvSrc = Join-Path $secretsRoot "user-env.ps1"
    if ((Test-Path -LiteralPath $userEnvSrc) -and $WorkRoot) {
        $userEnvDest = Join-Path $WorkRoot "mcp\user-env.ps1"
        $decision    = Get-ImportDecision $userEnvSrc $userEnvDest 'user-env.ps1' $sameMachine
        switch ($decision) {
            'unchanged' {
                Update-LocalStateHash 'user-env.ps1' (Get-SafeHash $userEnvSrc)
                Write-Host "  cross-machine import: user-env.ps1 unchanged" -ForegroundColor DarkGray
            }
            'local-ahead' {
                Update-LocalStateHash 'user-env.ps1' (Get-SafeHash $userEnvDest)
                Write-Host "  cross-machine import: user-env.ps1 local has changes since last ao-close (will export on next ao-close)" -ForegroundColor DarkGray
            }
            'local-modified' {
                Write-Host "  cross-machine import: user-env.ps1 CONFLICT — vault differs from local; local changes kept. Use -Force to take vault version." -ForegroundColor Yellow
            }
            'import' {
                Invoke-LocalBackup $userEnvDest "user-env.ps1"
                if (Copy-Atomic $userEnvSrc $userEnvDest) {
                    Update-LocalStateHash 'user-env.ps1' (Get-SafeHash $userEnvSrc)
                    Write-Host "  cross-machine import: user-env.ps1 updated" -ForegroundColor Green
                    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $userEnvDest
                    Write-Host "  cross-machine import: env vars applied (open a new terminal to inherit)" -ForegroundColor Green
                    $vaultScript = Join-Path $WorkRoot "scripts\secrets-vault.ps1"
                    if (Test-Path -LiteralPath $vaultScript) {
                        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vaultScript -Action import-user-env -McpPath $userEnvDest
                        Write-Host "  cross-machine import: vault synced from user-env.ps1" -ForegroundColor Green
                    }
                }
            }
        }
    }

    # ── SSH keys -> ~/.ssh\ ───────────────────────────────────────────────────
    # Dynamic scan from vault .ssh/ — picks up any new key automatically.
    # Exclusion list: machine-specific or reference-only files that must not roam.
    $sshSrc          = Join-Path $secretsRoot ".ssh"
    $sshDest         = Join-Path $env:USERPROFILE ".ssh"
    $sshExcludeNames = @('known_hosts', 'known_hosts.old', 'authorized_keys')
    $sshExcludeExts  = @('.txt', '.old', '.bkup', '.backup')
    if (Test-Path -LiteralPath $sshSrc) {
        if (-not (Test-Path -LiteralPath $sshDest)) {
            New-Item -ItemType Directory -Path $sshDest -Force | Out-Null
        }
        Get-ChildItem -Path $sshSrc -File -ErrorAction SilentlyContinue | ForEach-Object {
            $name    = $_.Name
            if ($sshExcludeNames -contains $name) { return }
            if ($sshExcludeExts  -contains $_.Extension.ToLower()) { return }
            $src     = $_.FullName
            $dst     = Join-Path $sshDest $name
            $fileKey = ".ssh/$name"
            $decision = Get-ImportDecision $src $dst $fileKey $sameMachine
            switch ($decision) {
                'unchanged' {
                    Update-LocalStateHash $fileKey (Get-SafeHash $src)
                    Write-Host "  cross-machine import: .ssh/$name unchanged" -ForegroundColor DarkGray
                }
                'local-ahead' {
                    Update-LocalStateHash $fileKey (Get-SafeHash $dst)
                    Write-Host "  cross-machine import: .ssh/$name local has changes since last ao-close (will export on next ao-close)" -ForegroundColor DarkGray
                }
                'local-modified' {
                    Write-Host "  cross-machine import: .ssh/$name CONFLICT — vault differs from local; local changes kept. Use -Force to take vault version." -ForegroundColor Yellow
                }
                'import' {
                    Invoke-LocalBackup $dst "ssh/$name"
                    if (Copy-Atomic $src $dst) {
                        Update-LocalStateHash $fileKey (Get-SafeHash $src)
                        Write-Host "  cross-machine import: .ssh/$name updated" -ForegroundColor Green
                    }
                }
            }
        }
    }

    # ── AWARE_WAVE_CREDENTIALS.md -> user home ────────────────────────────────
    $credsSrc = Join-Path $secretsRoot "AWARE_WAVE_CREDENTIALS.md"
    $credsDst = Join-Path $env:USERPROFILE "AWARE_WAVE_CREDENTIALS.md"
    if (Test-Path -LiteralPath $credsSrc) {
        $decision = Get-ImportDecision $credsSrc $credsDst 'AWARE_WAVE_CREDENTIALS.md' $sameMachine
        switch ($decision) {
            'unchanged' {
                Update-LocalStateHash 'AWARE_WAVE_CREDENTIALS.md' (Get-SafeHash $credsSrc)
                Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md unchanged" -ForegroundColor DarkGray
            }
            'local-ahead' {
                Update-LocalStateHash 'AWARE_WAVE_CREDENTIALS.md' (Get-SafeHash $credsDst)
                Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md local has changes since last ao-close (will export on next ao-close)" -ForegroundColor DarkGray
            }
            'local-modified' {
                Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md CONFLICT — vault differs from local; local changes kept. Use -Force to take vault version." -ForegroundColor Yellow
            }
            'import' {
                Invoke-LocalBackup $credsDst "AWARE_WAVE_CREDENTIALS.md"
                # Write with UTF-8 BOM — vault should already have BOM, but enforce here as defence-in-depth
                try {
                    $utf8bom = New-Object System.Text.UTF8Encoding($true)
                    $credsContent = [System.IO.File]::ReadAllText($credsSrc, [System.Text.Encoding]::UTF8)
                    [System.IO.File]::WriteAllText($credsDst, $credsContent, $utf8bom)
                    Update-LocalStateHash 'AWARE_WAVE_CREDENTIALS.md' (Get-SafeHash $credsDst)
                    Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md updated (UTF-8 BOM enforced)" -ForegroundColor Green
                } catch {
                    Write-Host "  WARN: AWARE_WAVE_CREDENTIALS.md import failed ($($_.Exception.Message))" -ForegroundColor Yellow
                }
            }
        }
    }

    # ── claude-settings.json import REMOVED 2026-05-28 (Phase B of plan Z) ──────────────────────
    # Previously imported ~/.claude/settings.json from vault. Removed because vault snapshots
    # captured machine-resolved absolute paths (permissions.additionalDirectories), so importing
    # on a different machine clobbered correctly-resolved paths and caused guaranteed
    # `sync-claude-userlevel.ps1 -Mode verify` drift each cross-machine open.
    # Cross-machine alignment for settings.json now goes through:
    #   mcp\claude-userlevel\settings.template.json (placeholder SSOT)
    #   + scripts\sync-claude-userlevel.ps1 -Mode merge
    # Stale vault file (G:\...\claude-settings.json) can be deleted manually; see WORKLOG 2026-05-28.

    # ── ao-close-last.txt: import only if vault timestamp is strictly newer than local ──
    # Monotonic guarantee: stamp only moves forward in time. Prevents the historical bug where
    # a stale vault value (e.g. set by a partial AO-CLOSE on machine B) overwrote a fresh local
    # value on machine A, permanently anchoring AO-RESUME signals to old timestamps.
    # -Force still bypasses this guard for emergency recovery.
    $aoCloseSrc = Join-Path $secretsRoot "ao-close-last.txt"
    if (Test-Path -LiteralPath $aoCloseSrc) {
        $aoCloseDst = Join-Path $PSScriptRoot "..\agency-os\.agency-state\ao-close-last.txt"
        $aoCloseDir = Split-Path $aoCloseDst -Parent
        if (-not (Test-Path -LiteralPath $aoCloseDir)) { New-Item -ItemType Directory -Path $aoCloseDir -Force | Out-Null }

        $shouldImport = $true
        $reason = "vault newer (initial state)"
        if ((Test-Path -LiteralPath $aoCloseDst) -and (-not $Force)) {
            # Parse vault and local timestamps INDEPENDENTLY so we can distinguish which side is corrupt.
            # Bug class avoided: a single try/catch around both parses lets a corrupt vault overwrite
            # a good local — the exact bug class this fix is meant to prevent.
            $vaultOk = $false; $localOk = $false
            $vaultTs = $null; $localTs = $null
            try {
                $vaultRaw = Get-Content -LiteralPath $aoCloseSrc -Raw -Encoding UTF8
                if ($vaultRaw) { $vaultTs = [DateTime]::Parse($vaultRaw.Trim(), $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime(); $vaultOk = $true }
            } catch { }
            try {
                $localRaw = Get-Content -LiteralPath $aoCloseDst -Raw -Encoding UTF8
                if ($localRaw) { $localTs = [DateTime]::Parse($localRaw.Trim(), $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime(); $localOk = $true }
            } catch { }

            if ($vaultOk -and $localOk) {
                if ($vaultTs -le $localTs) {
                    $shouldImport = $false
                    $reason = "skipped (vault $($vaultTs.ToString('o')) <= local $($localTs.ToString('o')))"
                } else {
                    $reason = "vault newer ($($vaultTs.ToString('o')) > $($localTs.ToString('o')))"
                }
            } elseif ($vaultOk -and -not $localOk) {
                $shouldImport = $true
                $reason = "recovery: local corrupt/empty, importing vault"
                Write-Host "  cross-machine import: ao-close-last.txt local unreadable — importing vault as recovery" -ForegroundColor Yellow
            } elseif (-not $vaultOk -and $localOk) {
                $shouldImport = $false
                $reason = "vault corrupt/empty, keeping local"
                Write-Host "  cross-machine import: ao-close-last.txt vault unreadable — keeping local (no overwrite)" -ForegroundColor Yellow
            } else {
                $shouldImport = $false
                $reason = "both corrupt/empty, manual fix needed"
                Write-Host "  cross-machine import: ao-close-last.txt both sides unreadable — skipping (run AO-CLOSE locally to recreate)" -ForegroundColor Red
            }
        }

        if ($shouldImport) {
            Copy-Item -LiteralPath $aoCloseSrc -Destination $aoCloseDst -Force
            $importedContent = (Get-Content -LiteralPath $aoCloseDst -Raw -Encoding UTF8).Trim()
            Write-Host "  cross-machine import: ao-close-last.txt synced ($importedContent)" -ForegroundColor Green
        } else {
            Write-Host "  cross-machine import: ao-close-last.txt $reason" -ForegroundColor DarkGray
        }
    }

    # ── Flush local state to disk (once per session) ──────────────────────────
    if ($script:LocalStateModified) {
        Write-LocalState
        Write-Host "  local state saved: $script:LocalStatePath" -ForegroundColor DarkGray
    }

    Write-Host "== cross-machine import: secrets from $secretsRootDisplay ==" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  AO_SYNC_SECRETS_ROOT set but path not found: $secretsRootDisplay" -ForegroundColor Yellow
    Write-Host "  Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
}

exit 0
