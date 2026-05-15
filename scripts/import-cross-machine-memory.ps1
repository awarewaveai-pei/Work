# import-cross-machine-memory.ps1
# Auto-imports all cross-machine files from the sync folder on AO-RESUME.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# Sources:
#   MEMORY.md    -- $env:AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\MEMORY.md
#   secrets      -- $env:AO_SYNC_SECRETS_ROOT\  (user-env.ps1, .ssh\*, AWARE_WAVE_CREDENTIALS.md)
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
    $fromWorkScripts   = Join-Path $PSScriptRoot "..\agency-os\scripts\system-guard.ps1"
    $fromAgencyScripts = Join-Path $PSScriptRoot "system-guard.ps1"
    if (Test-Path -LiteralPath $fromWorkScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } elseif (Test-Path -LiteralPath $fromAgencyScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    }
}

# ── Helper: SHA256 hash of a file, empty string if missing ───────────────────
function Get-SafeHash([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }
    return ""
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
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item -LiteralPath $Path -Destination $dst -Force -ErrorAction SilentlyContinue
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
        # Only import if other machine's export is strictly newer than own machine's latest export.
        # Prevents overwriting fresh local data with stale data from another machine.
        ($ownLatestDateStr -eq $null -or $_.DateStr -gt $ownLatestDateStr)
    } | Sort-Object DateStr -Descending   # newest date first
)

if ($ownLatestDateStr -and $candidateFolders.Count -eq 0 -and $allFolders.Count -gt 0) {
    Write-Host "  cross-machine import: skipped — own machine export ($ownLatestDateStr) is same date or newer than all other-machine exports" -ForegroundColor DarkGray
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
            Copy-Item -LiteralPath $srcFile -Destination (Join-Path $memDest "MEMORY.md") -Force
            $fromLabel = if ($best.FolderMachine) { $best.FolderMachine } `
                         elseif ($best.ExportedBy) { $best.ExportedBy } `
                         else { 'unknown machine' }
            $script:ImportFromMachine = $fromLabel
            Write-Host "  cross-machine import: MEMORY.md imported from $($best.Folder.Name) [by: $fromLabel]" -ForegroundColor Green
        }
    }
} elseif ($candidateFolders.Count -eq 0 -and $allFolders.Count -gt 0) {
    Write-Host "  cross-machine import: MEMORY.md skipped (no other-machine AO-SYNC folder found)" -ForegroundColor DarkGray
}

# ── 3. Secrets import ─────────────────────────────────────────────────────────
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
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
                if (Copy-Atomic $credsSrc $credsDst) {
                    Update-LocalStateHash 'AWARE_WAVE_CREDENTIALS.md' (Get-SafeHash $credsSrc)
                    Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md updated" -ForegroundColor Green
                }
            }
        }
    }

    # ── Flush local state to disk (once per session) ──────────────────────────
    if ($script:LocalStateModified) {
        Write-LocalState
        Write-Host "  local state saved: $script:LocalStatePath" -ForegroundColor DarkGray
    }

    Write-Host "== cross-machine import: secrets from $secretsRoot ==" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
    Write-Host "  Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
}

exit 0
