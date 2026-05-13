# export-cross-machine-memory.ps1
# Exports the Claude Code project memory INDEX + secrets to the cross-machine sync folder.
# Called automatically at end of AO-CLOSE after git push. Non-blocking.
#
# Folder naming: AO-SYNC-<date>-<MACHINENAME>  (one per machine per day, no collision)
# Supports N machines: each machine has its own namespace; import always picks latest OTHER machine.
#
# Priority order for MEMORY.md destination:
#   1. -DestRoot param (explicit override)
#   2. $env:AO_SYNC_ROOT env var (machine-specific config) -- SET THIS on each machine
#   3. Auto-detect Google Drive: scan G:\ for first child directory (avoids non-ASCII encoding issues)
#   4. Desktop (fallback -- not recommended for sensitive files)
#
# Secrets destination:
#   $env:AO_SYNC_SECRETS_ROOT -- no auto-fallback; skipped if not set
#
# Per-machine setup (run once, open a new terminal after):
#   [System.Environment]::SetEnvironmentVariable('AO_SYNC_ROOT',         'G:\<MyDrive>\EverydayPW\AO-SYNC', 'User')
#   [System.Environment]::SetEnvironmentVariable('AO_SYNC_SECRETS_ROOT', 'G:\<MyDrive>\EverydayPW',         'User')
#
# What is exported:
#   MEMORY.md              -> $AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\MEMORY.md
#   .exported-by           -> $AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\.exported-by
#   user-env.ps1           -> $AO_SYNC_SECRETS_ROOT\user-env.ps1   (shared, last-write-wins)
#   .ssh\*                 -> $AO_SYNC_SECRETS_ROOT\.ssh\           (shared, last-write-wins)
#   AWARE_WAVE_CREDENTIALS -> $AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md
#
# Pruning rules (never touch other machines' history):
#   Own machine folders  : keep 7 most recent (AO-SYNC-*-<MACHINE>)
#   Other machine folders: auto-expire after 30 days
#
# What is NOT exported:
#   DPAPI vault (%LOCALAPPDATA%\AgencyOS\secrets\vault.json) -- machine-bound encryption
#   All repo files -- synced via git pull

param(
    [string]$WorkRoot = "",
    [string]$DestRoot = ""
)

$today      = Get-Date -Format "yyyy-MM-dd"
# Sanitise COMPUTERNAME: keep alphanumeric + hyphen only (safe for folder names on all OS/Drive mounts)
$machineTag = $env:COMPUTERNAME.ToUpper() -replace '[^A-Za-z0-9]', '-'

# ── 0. Load env vars from User registry if missing from process env ──────────
# Handles subprocess sessions that pre-date the setx calls
# (e.g. ao-close.ps1 launched via Bash before the registry vars were loaded).
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
if (-not $WorkRoot) {
    Write-Host "export-cross-machine-memory: WorkRoot not resolved; skip." -ForegroundColor Yellow
    exit 0
}

# ── 2. Derive Claude Code project key ─────────────────────────────────────────
# Rule: lowercase drive letter, replace ':' and '\' with '-'
# e.g.  C:\Users\USER\Work  ->  c--Users-USER-Work
#       D:\Work             ->  d--Work
$projectKey = $WorkRoot.Substring(0,1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '\\', '-')
$memSrc     = Join-Path $env:USERPROFILE ".claude\projects\$projectKey\memory"
$memIndex   = Join-Path $memSrc "MEMORY.md"

if (-not (Test-Path -LiteralPath $memIndex)) {
    Write-Host "export-cross-machine-memory: MEMORY.md not found ($memIndex); skip." -ForegroundColor DarkGray
    exit 0
}

# ── 3. Resolve sync root ──────────────────────────────────────────────────────
$syncRoot = if ($DestRoot) {
    $DestRoot
} elseif ($env:AO_SYNC_ROOT) {
    $env:AO_SYNC_ROOT
} else {
    # Auto-detect Google Drive by scanning G:\ for its first child directory.
    # Avoids hardcoding non-ASCII folder names that fail across locales/encodings.
    $gdRoot = $null
    if (Test-Path "G:\") {
        $gdRoot = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
    }
    if ($gdRoot) {
        Join-Path $gdRoot "AO-SYNC"
    } else {
        Join-Path $env:USERPROFILE "Desktop"
    }
}

# Each machine writes to its own subfolder: AO-SYNC-<date>-<MACHINE>
# Same machine, same day = overwrite own folder (idempotent). Different machine = separate folder (no collision).
$destBase = if ($DestRoot) { $DestRoot } else { Join-Path $syncRoot "AO-SYNC-$today-$machineTag" }

Write-Host ""
Write-Host "== AO-SYNC export ==" -ForegroundColor Cyan
Write-Host "   machine    : $($env:COMPUTERNAME)" -ForegroundColor DarkGray
Write-Host "   project-key: $projectKey" -ForegroundColor DarkGray
Write-Host "   destination: $destBase" -ForegroundColor DarkGray

# ── 4. Export MEMORY.md + machine identity tag ───────────────────────────────
$memDest = Join-Path $destBase "memory"
New-Item -ItemType Directory -Path $memDest -Force | Out-Null
Copy-Item -LiteralPath $memIndex -Destination (Join-Path $memDest "MEMORY.md") -Force
Write-Host "  copied: MEMORY.md" -ForegroundColor Green

# Write machine tag so the import script can skip re-importing our own export.
# Import logic: skip if .exported-by == $env:COMPUTERNAME; import otherwise.
$env:COMPUTERNAME | Out-File -FilePath (Join-Path $memDest ".exported-by") -Encoding UTF8 -NoNewline -Force
Write-Host "  tagged: .exported-by=$($env:COMPUTERNAME)" -ForegroundColor DarkGray

# ── 5. Secrets export ─────────────────────────────────────────────────────────
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
if ($secretsRoot -and (Test-Path -LiteralPath $secretsRoot)) {

    $syncNow = Get-Date

    # mcp/user-env.ps1 -> $AO_SYNC_SECRETS_ROOT\user-env.ps1
    $userEnvSrc = Join-Path $WorkRoot "mcp\user-env.ps1"
    if (Test-Path -LiteralPath $userEnvSrc) {
        $userEnvDest = Join-Path $secretsRoot "user-env.ps1"
        Copy-Item -LiteralPath $userEnvSrc -Destination $userEnvDest -Force
        (Get-Item -LiteralPath $userEnvDest).LastWriteTime = $syncNow
        Write-Host "  copied: mcp/user-env.ps1" -ForegroundColor Green
    }

    # ~/.ssh\* -> $AO_SYNC_SECRETS_ROOT\.ssh\
    $sshSrc  = Join-Path $env:USERPROFILE ".ssh"
    $sshDest = Join-Path $secretsRoot ".ssh"
    New-Item -ItemType Directory -Path $sshDest -Force | Out-Null
    $sshKeys = @("hetzner_trigger", "id_ed25519", "hostinger_soulful",
                 "hetzner_trigger.pub", "id_ed25519.pub", "hostinger_soulful.pub", "config")
    foreach ($key in $sshKeys) {
        $src = Join-Path $sshSrc $key
        if (Test-Path -LiteralPath $src) {
            $keyDest = Join-Path $sshDest $key
            Copy-Item -LiteralPath $src -Destination $keyDest -Force
            (Get-Item -LiteralPath $keyDest).LastWriteTime = $syncNow
            Write-Host "  copied: .ssh/$key" -ForegroundColor Green
        }
    }

    # ~/AWARE_WAVE_CREDENTIALS.md -> $AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md
    $credsSrc = Join-Path $env:USERPROFILE "AWARE_WAVE_CREDENTIALS.md"
    if (Test-Path -LiteralPath $credsSrc) {
        $credsDest = Join-Path $secretsRoot "AWARE_WAVE_CREDENTIALS.md"
        Copy-Item -LiteralPath $credsSrc -Destination $credsDest -Force
        (Get-Item -LiteralPath $credsDest).LastWriteTime = $syncNow
        Write-Host "  copied: AWARE_WAVE_CREDENTIALS.md" -ForegroundColor Green
    }

    Write-Host "  secrets -> $secretsRoot" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  WARN: AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
    Write-Host "        Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
} else {
    Write-Host "  AO_SYNC_SECRETS_ROOT not set; secrets not exported." -ForegroundColor DarkGray
    Write-Host "  Set once: [System.Environment]::SetEnvironmentVariable('AO_SYNC_SECRETS_ROOT','G:\<vault>','User')" -ForegroundColor DarkGray
}

# ── 6. Pruning (two independent rules, never touch what we don't own) ────────
# Skip pruning when DestRoot is an explicit override (caller controls that path).
if (-not $DestRoot) {

    # Rule A: own-machine folders — keep 7 most recent (AO-SYNC-*-<MACHINE>)
    $ownFolders = Get-ChildItem -Path $syncRoot -Filter "AO-SYNC-*-$machineTag" -Directory -ErrorAction SilentlyContinue |
                  Sort-Object Name -Descending
    if ($ownFolders.Count -gt 7) {
        $ownFolders | Select-Object -Skip 7 | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  pruned (own, >7): $($_.Name)" -ForegroundColor DarkGray
        }
    }

    # Rule B: other-machine folders — expire after 30 days (keeps cross-machine history without unbounded growth)
    # Also handles old-format AO-SYNC-<date> folders that have no machine suffix.
    $cutoff = (Get-Date).AddDays(-30)
    Get-ChildItem -Path $syncRoot -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "-$([regex]::Escape($machineTag))$" } |
        Where-Object {
            # Extract date from folder name (supports both old "AO-SYNC-date" and new "AO-SYNC-date-MACHINE")
            if ($_.Name -match '^AO-SYNC-(\d{4}-\d{2}-\d{2})') {
                try { [datetime]::ParseExact($matches[1], 'yyyy-MM-dd', $null) -lt $cutoff } catch { $false }
            } else { $false }
        } | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  pruned (other, >30d): $($_.Name)" -ForegroundColor DarkGray
        }
}

# ── 7. Write human-readable import guide (manual fallback reference) ──────────
$memDestPath = Join-Path $memDest "MEMORY.md"
$instructions = @"
# AO-SYNC Export -- $today  (machine: $($env:COMPUTERNAME) [$machineTag], key: $projectKey)

Auto-generated by AO-CLOSE.
The import is FULLY AUTOMATED via import-cross-machine-memory.ps1 (called by ao-resume.ps1).
This file is a manual fallback guide only -- you should never need to run these steps by hand.

## Folder naming convention
  AO-SYNC-<date>-<MACHINENAME>/   <- one per machine per day, no collision across machines
  Other machines: import this folder on their next AO-RESUME (picks latest non-self folder).

## What is in this export

| Location | Content |
|----------|---------|
| memory/MEMORY.md | Claude Code project memory index |
| memory/.exported-by | Machine that created this export ($($env:COMPUTERNAME)) |
| (secrets root)/user-env.ps1 | All MCP API keys (shared, last-write-wins) |
| (secrets root)/.ssh/* | SSH keys (shared, last-write-wins) |
| (secrets root)/AWARE_WAVE_CREDENTIALS.md | Credentials reference (shared) |

## Manual import (fallback only)

``````powershell
# Step 1: git pull (syncs memory content files, rules, WORKLOG)
git pull origin main

# Step 2: AI tool alignment
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1

# Step 3: Import MEMORY.md index
`$dest = "`$env:USERPROFILE\.claude\projects\$projectKey\memory"
if (-not (Test-Path `$dest)) { New-Item -ItemType Directory -Path `$dest -Force }
Copy-Item "$memDestPath" "`$dest\MEMORY.md" -Force
Write-Host "Import complete" -ForegroundColor Green
``````

## NOT exported (by design)

| Item | Reason |
|------|--------|
| DPAPI vault (%LOCALAPPDATA%\AgencyOS\secrets\vault.json) | Machine-bound encryption; cannot decrypt on another machine |
| All repo files | Synced via git pull |
"@

$instructions | Out-File -FilePath (Join-Path $destBase "IMPORT_INSTRUCTIONS.md") -Encoding UTF8 -Force

Write-Host ""
Write-Host "== cross-machine export complete -> $destBase ==" -ForegroundColor Cyan
Write-Host "   AO-RESUME on the other machine will auto-import (no manual steps needed)." -ForegroundColor DarkGray
