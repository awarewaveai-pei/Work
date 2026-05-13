# import-cross-machine-memory.ps1
# Auto-imports all cross-machine files from the sync folder on AO-RESUME.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# Sources:
#   MEMORY.md    -- $env:AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\MEMORY.md
#   secrets      -- $env:AO_SYNC_SECRETS_ROOT\  (user-env.ps1, .ssh\*, AWARE_WAVE_CREDENTIALS.md)
#
# Folder selection strategy (N-machine safe):
#   New format (AO-SYNC-date-MACHINE): exclude own machine by folder name suffix → pick newest OTHER machine
#   Old format (AO-SYNC-date):         exclude own machine via .exported-by tag   → backward compatible
#   Both formats sorted by date desc; picks the single best candidate.
#
# Bidirectional sync -- last AO-CLOSE wins:
#   MEMORY.md    -- import from latest OTHER machine's folder; skip own-machine exports
#   user-env.ps1 -- skipped if SHA256 of sync copy matches local copy (avoids ~60 setx calls)
#   SSH keys     -- skipped per-key if SHA256 matches local copy
#   AWARE_WAVE_CREDENTIALS.md -- skipped if SHA256 matches local copy

param([string]$WorkRoot = "")

# ── 0. Load env vars from User registry if missing from process env ──────────
# Handles subprocess sessions that pre-date the setx calls
# (e.g. ao-resume.ps1 launched via Bash before the registry vars were loaded).
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
    # Auto-detect: search for the AO-SYNC folder inside Google Drive (depth ≤ 2).
    # Resolves G:\<MyDrive>\EverydayPW\AO-SYNC correctly without hardcoding folder names.
    $gdFound = $false
    if (Test-Path "G:\") {
        $myDrive = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue |
                   Select-Object -First 1 -ExpandProperty FullName
        if ($myDrive) {
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
            }
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

$candidateFolders = $allFolders | ForEach-Object {
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
} | Sort-Object DateStr -Descending   # newest date first; within same date, order is arbitrary (all acceptable)

# ── MEMORY.md import ──────────────────────────────────────────────────────────
if ($candidateFolders.Count -gt 0 -and $memDest) {

    # Walk sorted candidates; for old-format folders, verify .exported-by before accepting.
    $best = $null
    foreach ($entry in $candidateFolders) {
        if ($entry.IsNewFormat) {
            $best = $entry   # new format: already filtered by name; accept immediately
            break
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
            # else: own-machine old-format folder — skip, try next candidate
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

    # user-env.ps1 -> mcp\user-env.ps1
    # Only copies + runs setx when content has changed (avoids ~60 setx calls on every AO-RESUME).
    $userEnvSrc = Join-Path $secretsRoot "user-env.ps1"
    if ((Test-Path -LiteralPath $userEnvSrc) -and $WorkRoot) {
        $userEnvDest = Join-Path $WorkRoot "mcp\user-env.ps1"
        if ((Get-SafeHash $userEnvSrc) -ne (Get-SafeHash $userEnvDest)) {
            Copy-Item -LiteralPath $userEnvSrc -Destination $userEnvDest -Force
            Write-Host "  cross-machine import: user-env.ps1 updated" -ForegroundColor Green
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $userEnvDest
            Write-Host "  cross-machine import: env vars applied (open a new terminal to inherit)" -ForegroundColor Green

            # Sync updated keys into vault so health check stays at 100%.
            # Vault (DPAPI) and user-env.ps1 (setx) are separate stores;
            # this bridges them automatically after every content change.
            $vaultScript = Join-Path $WorkRoot "scripts\secrets-vault.ps1"
            if (Test-Path -LiteralPath $vaultScript) {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vaultScript -Action import-user-env -McpPath $userEnvDest
                Write-Host "  cross-machine import: vault synced from user-env.ps1" -ForegroundColor Green
            }
        } else {
            Write-Host "  cross-machine import: user-env.ps1 unchanged (setx + vault skipped)" -ForegroundColor DarkGray
        }
    }

    # SSH keys -> ~/.ssh\  (per-key hash check; only copies changed keys)
    $sshSrc  = Join-Path $secretsRoot ".ssh"
    $sshDest = Join-Path $env:USERPROFILE ".ssh"
    if (Test-Path -LiteralPath $sshSrc) {
        if (-not (Test-Path -LiteralPath $sshDest)) {
            New-Item -ItemType Directory -Path $sshDest -Force | Out-Null
        }
        $sshKeys = @("hetzner_trigger", "id_ed25519", "hostinger_soulful",
                     "hetzner_trigger.pub", "id_ed25519.pub", "hostinger_soulful.pub", "config")
        foreach ($key in $sshKeys) {
            $src = Join-Path $sshSrc $key
            $dst = Join-Path $sshDest $key
            if (Test-Path -LiteralPath $src) {
                if ((Get-SafeHash $src) -ne (Get-SafeHash $dst)) {
                    Copy-Item -LiteralPath $src -Destination $dst -Force
                    Write-Host "  cross-machine import: .ssh/$key updated" -ForegroundColor Green
                }
            }
        }
    }

    # AWARE_WAVE_CREDENTIALS.md -> user home
    $credsSrc = Join-Path $secretsRoot "AWARE_WAVE_CREDENTIALS.md"
    $credsDst = Join-Path $env:USERPROFILE "AWARE_WAVE_CREDENTIALS.md"
    if (Test-Path -LiteralPath $credsSrc) {
        if ((Get-SafeHash $credsSrc) -ne (Get-SafeHash $credsDst)) {
            Copy-Item -LiteralPath $credsSrc -Destination $credsDst -Force
            Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md updated" -ForegroundColor Green
        } else {
            Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md unchanged" -ForegroundColor DarkGray
        }
    }

    Write-Host "== cross-machine import: secrets from $secretsRoot ==" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
    Write-Host "  Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
}

exit 0
