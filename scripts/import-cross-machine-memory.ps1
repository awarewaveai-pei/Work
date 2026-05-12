# import-cross-machine-memory.ps1
# Auto-imports all cross-machine files from the sync folder on AO-RESUME.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# Sources:
#   MEMORY.md    -- $env:AO_SYNC_ROOT\AO-SYNC-<date>\memory\MEMORY.md
#   secrets      -- $env:AO_SYNC_SECRETS_ROOT\  (user-env.ps1, .ssh\*, AWARE_WAVE_CREDENTIALS.md)
#
# Bidirectional sync -- last AO-CLOSE wins:
#   MEMORY.md    -- skipped if memory\.exported-by matches THIS machine's COMPUTERNAME
#                   (prevents re-importing your own export; imports from the other machine)
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
    # Auto-detect Google Drive by scanning G:\ for its first child directory.
    $gdFound = $false
    if (Test-Path "G:\") {
        $gdRoot = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
        if ($gdRoot) {
            $searchRoots += (Join-Path $gdRoot "AO-SYNC")
            $gdFound = $true
        }
    }
    # Desktop fallback only when Google Drive auto-detect also finds nothing.
    if (-not $gdFound) {
        $searchRoots += [Environment]::GetFolderPath('Desktop')
    }
}
$searchRoots = $searchRoots | Select-Object -Unique

$syncFolders = @(
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            Get-ChildItem -Path $root -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue
        }
    }
) | Sort-Object Name -Descending

if ($syncFolders.Count -gt 0 -and $memDest) {
    $latest         = $syncFolders[0]
    $srcFile        = Join-Path $latest.FullName "memory\MEMORY.md"
    $exportedByFile = Join-Path $latest.FullName "memory\.exported-by"

    # Read machine tag written by the exporting machine.
    # Skip if WE exported this folder (prevents circular re-import of our own data).
    # Import if exported by another machine, or if tag is absent (legacy export).
    $exportedBy = ""
    if (Test-Path -LiteralPath $exportedByFile) {
        $exportedBy = (Get-Content -LiteralPath $exportedByFile -Raw -Encoding UTF8).Trim()
    }

    if (-not (Test-Path -LiteralPath $srcFile)) {
        Write-Host "  cross-machine import: MEMORY.md not found in $($latest.Name)" -ForegroundColor DarkGray
    } elseif ($exportedBy -eq $env:COMPUTERNAME) {
        Write-Host "  cross-machine import: MEMORY.md skipped (this machine exported $($latest.Name))" -ForegroundColor DarkGray
    } else {
        if (-not (Test-Path -LiteralPath $memDest)) {
            New-Item -ItemType Directory -Path $memDest -Force | Out-Null
        }
        Copy-Item -LiteralPath $srcFile -Destination (Join-Path $memDest "MEMORY.md") -Force
        $fromLabel = if ($exportedBy) { $exportedBy } else { "unknown machine" }
        Write-Host "  cross-machine import: MEMORY.md imported from $($latest.Name) [by: $fromLabel]" -ForegroundColor Green
    }
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
        } else {
            Write-Host "  cross-machine import: user-env.ps1 unchanged (setx skipped)" -ForegroundColor DarkGray
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
