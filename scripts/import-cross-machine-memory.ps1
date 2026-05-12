# import-cross-machine-memory.ps1
# Auto-imports all cross-machine files from EverydayPW on AO-RESUME.
# Called by ao-resume.ps1 (non-blocking). Silent no-op when no AO-SYNC folder exists.
#
# MEMORY.md source:  $env:AO_SYNC_ROOT\AO-SYNC-<date>\memory\MEMORY.md
# Secrets source:    $env:AO_SYNC_SECRETS_ROOT\  (user-env.ps1, .ssh\*, AWARE_WAVE_CREDENTIALS.md)
#
# Desktop is always the source of truth — all files are overwritten on import.
# MEMORY.md skips re-import if already processed today (via .imported flag).

param([string]$WorkRoot = "")

# ── Resolve WorkRoot ──────────────────────────────────────────────────────────
if (-not $WorkRoot) {
    $fromWorkScripts   = Join-Path $PSScriptRoot "..\agency-os\scripts\system-guard.ps1"
    $fromAgencyScripts = Join-Path $PSScriptRoot "system-guard.ps1"
    if (Test-Path -LiteralPath $fromWorkScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } elseif (Test-Path -LiteralPath $fromAgencyScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    }
}

# ── 1. MEMORY.md import ───────────────────────────────────────────────────────
# Derive Claude Code project key from WorkRoot (works across machines with different usernames).
# Rule: lowercase drive letter, replace ':' and '\' with '-'
# e.g. C:\Users\USER\Work → c--Users-USER-Work
$projectKey = $WorkRoot.Substring(0,1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '\\', '-')
$memDest = Join-Path $env:USERPROFILE ".claude\projects\$projectKey\memory"

$searchRoots = @()
if ($env:AO_SYNC_ROOT) {
    $searchRoots += $env:AO_SYNC_ROOT
} else {
    # Auto-detect Google Drive by scanning G:\ (avoids hardcoding non-ASCII folder names)
    if (Test-Path "G:\") {
        $gdRoot = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
        if ($gdRoot) { $searchRoots += (Join-Path $gdRoot "AO-SYNC") }
    }
}
$searchRoots += [Environment]::GetFolderPath('Desktop')
$searchRoots = $searchRoots | Select-Object -Unique

$syncFolders = @(
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            Get-ChildItem -Path $root -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue
        }
    }
) | Sort-Object Name -Descending

if ($syncFolders.Count -gt 0) {
    $latest   = $syncFolders[0]
    $srcFile  = Join-Path $latest.FullName "memory\MEMORY.md"
    $doneFlag = Join-Path $latest.FullName ".imported"

    if ((Test-Path -LiteralPath $srcFile) -and -not (Test-Path -LiteralPath $doneFlag)) {
        if (-not (Test-Path -LiteralPath $memDest)) {
            New-Item -ItemType Directory -Path $memDest -Force | Out-Null
        }
        Copy-Item -LiteralPath $srcFile -Destination (Join-Path $memDest "MEMORY.md") -Force
        "imported $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" |
            Out-File -FilePath $doneFlag -Encoding UTF8 -Force
        Write-Host "  cross-machine import: MEMORY.md imported from $($latest.Name)" -ForegroundColor Green
    } elseif (Test-Path -LiteralPath $doneFlag) {
        Write-Host "  cross-machine import: MEMORY.md already current ($($latest.Name))" -ForegroundColor DarkGray
    }
}

# ── 2. Secrets import (AO_SYNC_SECRETS_ROOT) ─────────────────────────────────
# Desktop is source of truth — always overwrite so both machines are identical.
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
if ($secretsRoot -and (Test-Path -LiteralPath $secretsRoot)) {

    # user-env.ps1 → mcp\user-env.ps1 (then run it to apply env vars)
    $userEnvSrc = Join-Path $secretsRoot "user-env.ps1"
    if ((Test-Path -LiteralPath $userEnvSrc) -and $WorkRoot) {
        $userEnvDest = Join-Path $WorkRoot "mcp\user-env.ps1"
        Copy-Item -LiteralPath $userEnvSrc -Destination $userEnvDest -Force
        Write-Host "  cross-machine import: user-env.ps1 restored" -ForegroundColor Green
        # Apply env vars to current session + persist via setx
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $userEnvDest
        Write-Host "  cross-machine import: env vars applied" -ForegroundColor Green
    }

    # SSH keys → ~/.ssh\  (overwrite — desktop is source of truth)
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
            if (Test-Path -LiteralPath $src) {
                Copy-Item -LiteralPath $src -Destination (Join-Path $sshDest $key) -Force
                Write-Host "  cross-machine import: .ssh/$key restored" -ForegroundColor Green
            }
        }
    }

    # AWARE_WAVE_CREDENTIALS.md → user home
    $credsSrc = Join-Path $secretsRoot "AWARE_WAVE_CREDENTIALS.md"
    if (Test-Path -LiteralPath $credsSrc) {
        Copy-Item -LiteralPath $credsSrc -Destination (Join-Path $env:USERPROFILE "AWARE_WAVE_CREDENTIALS.md") -Force
        Write-Host "  cross-machine import: AWARE_WAVE_CREDENTIALS.md restored" -ForegroundColor Green
    }

    Write-Host "== cross-machine import: secrets restored from $secretsRoot ==" -ForegroundColor Cyan
} elseif ($secretsRoot) {
    Write-Host "  AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
}

exit 0
