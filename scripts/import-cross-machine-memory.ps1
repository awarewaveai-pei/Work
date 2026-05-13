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
# Import decision (per file):
#   1. SHA256 same                                              -> log "unchanged", skip write
#   2. SHA256 differs AND manifest exists AND local mtime newer -> WARN "local-newer", keep local
#   3. SHA256 differs AND (no manifest OR local is older)       -> backup + atomic copy + verify
#
# SSH exclusion (never imported):
#   known_hosts, known_hosts.old, authorized_keys, *.txt, *.old, *.bkup, *.backup
#
# Pre-overwrite backup: %LOCALAPPDATA%\AgencyOS\cross-machine-backup\<timestamp>\
#   Auto-purges: keeps last 5 backup sets (older sets deleted on each run).
#
# Drive detection: tries G H F E D I J (not hardcoded to G:).

param([string]$WorkRoot = "")

# ── 0. Load env vars from User registry if missing from process env ──────────
if (-not $env:AO_SYNC_ROOT) {
    $regVal = [System.Environment]::GetEnvironmentVariable('AO_SYNC_ROOT', 'User')
    if ($regVal) { $env:AO_SYNC_ROOT = $regVal }
}
if (-not $env:AO_SYNC_SECRETS_ROOT) {
    $regVal = [System.Environment]::GetEnvironmentVariable('AO_SYNC_SECRETS_ROOT', 'User')
    if ($regVal) { $env:AO_SYNC_SECRETS_ROOT = $regVal }
}

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

# ── Helper: read the most-recent export manifest ─────────────────────────────
# Returns a PSCustomObject with exported_utc, machine, files — or $null if none found.
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

# ── Helper: decide whether to import a file ───────────────────────────────────
# Returns: 'unchanged' | 'local-newer' | 'import'
#   unchanged  : SHA256 identical -> no write needed
#   local-newer: SHA256 differs but local mtime > manifest.exported_utc -> keep local
#   import     : SHA256 differs and source is authoritative -> proceed with backup+copy
function Get-ImportDecision([string]$SrcPath, [string]$DstPath, $Manifest) {
    if ((Get-SafeHash $SrcPath) -eq (Get-SafeHash $DstPath)) { return 'unchanged' }
    if (-not $Manifest) { return 'import' }
    try {
        $exportedUtc = [datetime]::Parse($Manifest.exported_utc, $null,
                           [System.Globalization.DateTimeStyles]::RoundtripKind)
        if ((Test-Path -LiteralPath $DstPath) -and
            (Get-Item -LiteralPath $DstPath).LastWriteTimeUtc -gt $exportedUtc) {
            return 'local-newer'
        }
    } catch { }
    return 'import'
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
            # Auto-derive secrets root from AO-SYNC location (parent = EverydayPW)
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
        # New format: exclude own machine by folder name (fast, no file I/O needed)
        -not ($_.IsNewFormat -and $_.FolderMachine -eq $machineTag)
    } | Sort-Object DateStr -Descending   # newest date first
)

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
            Write-Host "  cross-machine import: MEMORY.md imported from $($best.Folder.Name) [by: $fromLabel]" -ForegroundColor Green
        }
    }
} elseif ($candidateFolders.Count -eq 0 -and $allFolders.Count -gt 0) {
    Write-Host "  cross-machine import: MEMORY.md skipped (no other-machine AO-SYNC folder found)" -ForegroundColor DarkGray
}

# ── 3. Secrets import ─────────────────────────────────────────────────────────
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
if ($secretsRoot -and (Test-Path -LiteralPath $secretsRoot)) {

    # Load the most recent export manifest for timestamp-aware conflict resolution.
    # If no manifest exists (e.g. export was run before this upgrade), falls back to hash-only.
    $manifest = Read-ExportManifest $secretsRoot
    if ($manifest) {
        Write-Host "  manifest loaded: exported by $($manifest.machine) at $($manifest.exported_utc)" -ForegroundColor DarkGray
    }

    # Purge old local backups (keep last 5 sets, run once per import session)
    Invoke-PurgeOldBackups

    # ── user-env.ps1 -> mcp\user-env.ps1 ─────────────────────────────────────
    $userEnvSrc = Join-Path $secretsRoot "user-env.ps1"
    if ((Test-Path -LiteralPath $userEnvSrc) -and $WorkRoot) {
        $userEnvDest = Join-Path $WorkRoot "mcp\user-env.ps1"
        $decision    = Get-ImportDecision $userEnvSrc $userEnvDest $manifest
        switch ($decision) {
            'unchanged'  {
                Write-Host "  cross-machine import: user-env.ps1 unchanged (setx + vault skipped)" -ForegroundColor DarkGray
            }
            'local-newer' {
                Write-Host "  cross-machine import: user-env.ps1 WARN — local is newer than manifest ($($manifest.exported_utc)), kept local" -ForegroundColor Yellow
            }
            'import' {
                Invoke-LocalBackup $userEnvDest "user-env.ps1"
                if (Copy-Atomic $userEnvSrc $userEnvDest) {
                    Write-Host "  cross-machine import: user-env.ps1 updated" -ForegroundColor Green
                    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $userEnvDest
                    Write-Host "  cross-machine import: env vars applied (open a new terminal to inherit)" -ForegroundColor Green
                    # Sync updated keys into vault so health check stays at 100%.
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
    # Dynamic scan from Google Drive .ssh/ — picks up any new key automatically.
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
            $name = $_.Name
            if ($sshExcludeNames -contains $name) { return }
            if ($sshExcludeExts  -contains $_.Extension.ToLower()) { return }
            $src      = $_.FullName
            $dst      = Join-Path $sshDest $name
            $decision = Get-ImportDecision $src $dst $manifest
            switch ($decision) {
                'unchanged'   {
                    Write-Host "  cross-machine import: .ssh/$name unchanged" -ForegroundColor DarkGray
                }
                'local-newer' {
                    Write-Host "  cross-machine import: .ssh/$name WARN — local is newer than manifest, kept local" -ForegroundColor Yellow
                }
                'import' {
                    Invoke-LocalBackup $dst "ssh/$name"
                    if (Copy-Atomic $src $dst) {
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
        $decision = Get-ImportDecision $credsSrc $credsDst $manifest
        switch ($decision) {
            'unchanged'   {
                Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md unchanged" -ForegroundColor DarkGray
            }
            'local-newer' {
                Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md WARN — local is newer than manifest, kept local" -ForegroundColor Yellow
            }
            'import' {
                Invoke-LocalBackup $credsDst "AWARE_WAVE_CREDENTIALS.md"
                if (Copy-Atomic $credsSrc $credsDst) {
                    Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md updated" -ForegroundColor Green
                }
            }
        }
    }

    Write-Host "== cross-machine import: secrets from $secretsRoot ==" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
    Write-Host "  Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
}

exit 0
