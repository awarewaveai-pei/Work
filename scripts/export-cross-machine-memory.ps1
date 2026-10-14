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
#   3. Auto-detect Google Drive: tries drive letters G H F E D I J (not hardcoded to G:)
#   4. Desktop (fallback -- not recommended for sensitive files)
#
# Secrets destination:
#   $env:AO_SYNC_SECRETS_ROOT -- no auto-fallback; skipped if not set
#
# Per-machine setup (run once, open a new terminal after):
#   Secrets are stored unencrypted in Google Drive at G:\我的雲端硬碟\MySecretVault\MySecretVault\
#   Use the Google Drive path directly to avoid dependency on Cryptomator mount state (E:\).
#   [System.Environment]::SetEnvironmentVariable('AO_SYNC_ROOT',         'G:\我的雲端硬碟\MySecretVault\MySecretVault\AO-SYNC', 'User')
#   [System.Environment]::SetEnvironmentVariable('AO_SYNC_SECRETS_ROOT', 'G:\我的雲端硬碟\MySecretVault\MySecretVault',        'User')
#   NOTE: if G:\ drive letter changes (new machine), update both vars above accordingly.
#
# What is exported:
#   MEMORY.md                  -> $AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\MEMORY.md
#   .exported-by               -> $AO_SYNC_ROOT\AO-SYNC-<date>-<MACHINE>\memory\.exported-by
#   user-env.ps1               -> $AO_SYNC_SECRETS_ROOT\user-env.ps1   (shared, last-write-wins)
#   .ssh\*                     -> $AO_SYNC_SECRETS_ROOT\.ssh\           (dynamic scan, excl. machine-specific)
#   AWARE_WAVE_CREDENTIALS.md  -> $AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md
#   .manifest-<MACHINE>.json   -> $AO_SYNC_SECRETS_ROOT\               (sha256 + size per file; read by import for logging)
#
# Note: ~/.claude/settings.json is NOT synced via this vault. Cross-machine alignment for
# settings.json is done via scripts\sync-claude-userlevel.ps1 with mcp\claude-userlevel\
# settings.template.json as the placeholder-based SSOT. Removed 2026-05-28 (Phase B of plan Z):
# the previous vault export captured machine-resolved absolute paths (e.g. C:\Users\USER\Work)
# which clobbered the receiving machine's correctly-resolved paths each AO-SYNC, causing
# guaranteed sync-claude-userlevel verify drift every cross-machine open. See WORKLOG 2026-05-28.
#
# SSH exclusion (never exported):
#   known_hosts, known_hosts.old, authorized_keys, *.txt, *.old, *.bkup, *.backup
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

# Copy a .md file while enforcing UTF-8 BOM at the destination. Reason: .md files crossing
# Google Drive can be misread as Big5 by PowerShell on Windows when no BOM is present, causing
# CJK garbling. Reading source as UTF-8 then writing with BOM normalises encoding at the
# cross-machine boundary; idempotent (source-with-BOM round-trips identically).
function Copy-MdWithUtf8Bom {
    param(
        [Parameter(Mandatory=$true)][string]$Source,
        [Parameter(Mandatory=$true)][string]$Destination
    )
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    $content = [System.IO.File]::ReadAllText($Source, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($Destination, $content, $utf8bom)
}

$syncNow    = Get-Date
$today      = $syncNow.ToString("yyyy-MM-dd")
$machineTag = $env:COMPUTERNAME.ToUpper() -replace '[^A-Za-z0-9]', '-'

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
if (-not $WorkRoot) {
    Write-Host "export-cross-machine-memory: WorkRoot not resolved; skip." -ForegroundColor Yellow
    exit 0
}
# Normalise WorkRoot to Windows-style backslash before deriving project key.
# Required because Join-Path normalises '/' to '\' inside the resulting path,
# which would split 'd-/Work' into TWO segments ('d-', 'Work') instead of the
# single segment 'd--Work' that Claude Code actually uses.
try { $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path } catch { }

# ── 2. Derive Claude Code project key ─────────────────────────────────────────
$projectKey = $WorkRoot.Substring(0,1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '\\', '-')
$memSrc     = Join-Path $env:USERPROFILE ".claude\projects\$projectKey\memory"
$memIndex   = Join-Path $memSrc "MEMORY.md"

if (-not (Test-Path -LiteralPath $memIndex)) {
    Write-Host "export-cross-machine-memory: MEMORY.md not found ($memIndex); skip." -ForegroundColor DarkGray
    exit 0
}

# ── 3. Resolve sync root (drive-letter-agnostic auto-detect) ─────────────────
$syncRoot = if ($DestRoot) {
    $DestRoot
} elseif ($env:AO_SYNC_ROOT) {
    $env:AO_SYNC_ROOT
} else {
    $detected = $null
    foreach ($drvLetter in @('G','H','F','E','D','I','J')) {
        $drvRoot = "${drvLetter}:\"
        if (-not (Test-Path $drvRoot)) { continue }
        $myDrive = Get-ChildItem $drvRoot -Directory -ErrorAction SilentlyContinue |
                   Select-Object -First 1 -ExpandProperty FullName
        if (-not $myDrive) { continue }
        $found = Get-ChildItem -Path $myDrive -Filter "AO-SYNC" -Directory `
                     -Recurse -Depth 2 -ErrorAction SilentlyContinue |
                 Select-Object -First 1 -ExpandProperty FullName
        if ($found) { $detected = $found; break }
    }
    if ($detected) { $detected } else { Join-Path $env:USERPROFILE "Desktop" }
}

if (-not $env:AO_SYNC_SECRETS_ROOT -and $syncRoot -ne (Join-Path $env:USERPROFILE "Desktop")) {
    $env:AO_SYNC_SECRETS_ROOT = Split-Path $syncRoot -Parent
    Write-Host "  auto-derived: AO_SYNC_SECRETS_ROOT = $env:AO_SYNC_SECRETS_ROOT" -ForegroundColor DarkGray
}

$destBase = if ($DestRoot) { $DestRoot } else { Join-Path $syncRoot "AO-SYNC-$today-$machineTag" }

Write-Host ""
Write-Host "== AO-SYNC export ==" -ForegroundColor Cyan
Write-Host "   machine    : $($env:COMPUTERNAME)" -ForegroundColor DarkGray
Write-Host "   project-key: $projectKey" -ForegroundColor DarkGray
Write-Host "   destination: $destBase" -ForegroundColor DarkGray

# ── 4. Export all memory *.md files + machine identity tag ────────────────────
$memDest = Join-Path $destBase "memory"
New-Item -ItemType Directory -Path $memDest -Force | Out-Null

$memDestFile = Join-Path $memDest "MEMORY.md"
Copy-MdWithUtf8Bom -Source $memIndex -Destination $memDestFile
(Get-Item $memDestFile).LastWriteTime = $syncNow
Write-Host "  copied (UTF-8 BOM enforced): MEMORY.md" -ForegroundColor Green

# Export individual memory files (all *.md except MEMORY.md itself).
# These are the actual memory content files — without them the index is useless on another machine.
# All .md copies enforce UTF-8 BOM to survive Google Drive sync (prevents Big5 misread on other machines).
$exportedMemFiles = 0
Get-ChildItem -Path $memSrc -Filter "*.md" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "MEMORY.md" } |
    ForEach-Object {
        $dstPath = Join-Path $memDest $_.Name
        Copy-MdWithUtf8Bom -Source $_.FullName -Destination $dstPath
        (Get-Item $dstPath).LastWriteTime = $syncNow
        Write-Host "  copied (UTF-8 BOM enforced): memory/$($_.Name)" -ForegroundColor Green
        $exportedMemFiles++
    }
if ($exportedMemFiles -gt 0) {
    Write-Host "  exported: $exportedMemFiles individual memory file(s)" -ForegroundColor DarkGray
}

$env:COMPUTERNAME | Out-File -FilePath (Join-Path $memDest ".exported-by") -Encoding UTF8 -NoNewline -Force
Write-Host "  tagged: .exported-by=$($env:COMPUTERNAME)" -ForegroundColor DarkGray

# ── 5. Secrets export ─────────────────────────────────────────────────────────
$secretsRoot = $env:AO_SYNC_SECRETS_ROOT
if ($secretsRoot -and (Test-Path -LiteralPath $secretsRoot)) {

    # mcp/user-env.ps1 -> $AO_SYNC_SECRETS_ROOT\user-env.ps1
    $userEnvSrc = Join-Path $WorkRoot "mcp\user-env.ps1"
    if (Test-Path -LiteralPath $userEnvSrc) {
        $userEnvDest = Join-Path $secretsRoot "user-env.ps1"
        Copy-Item -LiteralPath $userEnvSrc -Destination $userEnvDest -Force
        (Get-Item $userEnvDest).LastWriteTime = $syncNow
        Write-Host "  copied: mcp/user-env.ps1" -ForegroundColor Green
    }

    # ~/.ssh\* -> $AO_SYNC_SECRETS_ROOT\.ssh\
    # Dynamic scan: picks up any new key automatically.
    # Exclusion list: machine-specific or reference-only files that must NOT roam.
    $sshSrc          = Join-Path $env:USERPROFILE ".ssh"
    $sshDest         = Join-Path $secretsRoot ".ssh"
    $sshExcludeNames = @('known_hosts', 'known_hosts.old', 'authorized_keys')
    $sshExcludeExts  = @('.txt', '.old', '.bkup', '.backup')
    $exportedSshKeys = [System.Collections.Generic.List[string]]::new()
    New-Item -ItemType Directory -Path $sshDest -Force | Out-Null
    if (Test-Path -LiteralPath $sshSrc) {
        Get-ChildItem -Path $sshSrc -File -ErrorAction SilentlyContinue | ForEach-Object {
            if ($sshExcludeNames -contains $_.Name) { return }
            if ($sshExcludeExts  -contains $_.Extension.ToLower()) { return }
            $keyDest = Join-Path $sshDest $_.Name
            Copy-Item -LiteralPath $_.FullName -Destination $keyDest -Force
            (Get-Item $keyDest).LastWriteTime = $syncNow
            Write-Host "  copied: .ssh/$($_.Name)" -ForegroundColor Green
            $exportedSshKeys.Add($_.Name)
        }
    }

    # ~/AWARE_WAVE_CREDENTIALS.md -> $AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md
    # Always written with UTF-8 BOM so vault is authoritative encoding source.
    # VSCode saves without BOM; this ensures BOM is never lost through the sync cycle.
    $credsSrc = Join-Path $env:USERPROFILE "AWARE_WAVE_CREDENTIALS.md"
    if (Test-Path -LiteralPath $credsSrc) {
        $credsDest = Join-Path $secretsRoot "AWARE_WAVE_CREDENTIALS.md"
        $utf8bom = New-Object System.Text.UTF8Encoding($true)
        $credsContent = [System.IO.File]::ReadAllText($credsSrc, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText($credsDest, $credsContent, $utf8bom)
        (Get-Item $credsDest).LastWriteTime = $syncNow
        Write-Host "  copied (UTF-8 BOM enforced): AWARE_WAVE_CREDENTIALS.md" -ForegroundColor Green

        # Update local state so next import sees 'import' instead of 'local-modified'.
        # Root cause of BOM garbling loop: export writes vault WITH BOM but never updates
        # ao-sync-state.json. On next AO-RESUME, stateHash (old BOM hash) != dstHash (VSCode
        # stripped BOM) -> 'local-modified' -> import blocked -> BOM never restored -> garbled.
        # Fix: after export, store current local hash as stateHash so import can safely overwrite.
        $localStateFile = Join-Path $env:LOCALAPPDATA 'AgencyOS\ao-sync-state.json'
        try {
            $localState = if (Test-Path -LiteralPath $localStateFile) {
                Get-Content -LiteralPath $localStateFile -Raw -Encoding UTF8 | ConvertFrom-Json
            } else {
                [pscustomobject]@{ last_import_utc = ''; from_machine = ''; files = [pscustomobject]@{} }
            }
            if ($null -eq $localState.files) {
                $localState | Add-Member -NotePropertyName files -NotePropertyValue ([pscustomobject]@{}) -Force
            }
            $localCredHash = (Get-FileHash -LiteralPath $credsSrc -Algorithm SHA256).Hash
            $localState.files | Add-Member -NotePropertyName 'AWARE_WAVE_CREDENTIALS.md' `
                -NotePropertyValue @{ sha256 = $localCredHash } -Force
            $stateDir = Split-Path $localStateFile -Parent
            if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
            $localState | ConvertTo-Json -Depth 3 | Out-File -LiteralPath $localStateFile -Encoding UTF8 -Force
            Write-Host "  local state synced: AWARE_WAVE_CREDENTIALS.md sha256=$localCredHash" -ForegroundColor DarkGray
        } catch {
            Write-Host "  WARN: could not update local state for CREDENTIALS ($($_.Exception.Message))" -ForegroundColor Yellow
        }
    }

    # ~/.claude/settings.json export REMOVED 2026-05-28 (Phase B of plan Z).
    # Reason: settings.json contains machine-resolved absolute paths in
    # permissions.additionalDirectories (e.g. C:\Users\USER\Work). Exporting them via
    # vault and importing on a different machine clobbered the receiving machine's
    # correctly-resolved paths every AO-SYNC, causing guaranteed
    # `sync-claude-userlevel.ps1 -Mode verify` drift each cross-machine open.
    # Cross-machine alignment for settings.json now goes through the single SSOT:
    # mcp\claude-userlevel\settings.template.json (placeholder-based) + sync-claude-userlevel.ps1.

    # agency-os/.agency-state/ao-close-last.txt -> $AO_SYNC_SECRETS_ROOT\ao-close-last.txt
    # Allows the other machine to anchor fetch-external-signals to the real last AO-CLOSE time.
    $aoCloseSrc = Join-Path $PSScriptRoot "..\agency-os\.agency-state\ao-close-last.txt"
    if (Test-Path -LiteralPath $aoCloseSrc) {
        $aoCloseDest = Join-Path $secretsRoot "ao-close-last.txt"
        Copy-Item -LiteralPath $aoCloseSrc -Destination $aoCloseDest -Force
        Write-Host "  copied: ao-close-last.txt" -ForegroundColor Green
    }

    # Write export manifest: records sha256 + size per file for import-side logging and integrity check.
    # Import uses its own local-state file (not this manifest) for conflict detection.
    $manifestEntries = [ordered]@{}
    $manifestSources = [System.Collections.Generic.List[object]]::new()
    $manifestSources.Add([pscustomobject]@{ key = 'user-env.ps1';              path = Join-Path $secretsRoot 'user-env.ps1' })
    $manifestSources.Add([pscustomobject]@{ key = 'AWARE_WAVE_CREDENTIALS.md'; path = Join-Path $secretsRoot 'AWARE_WAVE_CREDENTIALS.md' })
    # NOTE: claude-settings.json removed 2026-05-28 (Phase B of plan Z); see header comment.
    foreach ($kn in $exportedSshKeys) {
        $manifestSources.Add([pscustomobject]@{ key = ".ssh/$kn"; path = Join-Path $sshDest $kn })
    }
    foreach ($mf in $manifestSources) {
        if (Test-Path -LiteralPath $mf.path) {
            $manifestEntries[$mf.key] = [ordered]@{
                sha256 = (Get-FileHash -LiteralPath $mf.path -Algorithm SHA256).Hash
                size   = (Get-Item -LiteralPath $mf.path).Length
            }
        }
    }
    [ordered]@{
        exported_utc = $syncNow.ToUniversalTime().ToString('o')
        machine      = $env:COMPUTERNAME
        machine_tag  = $machineTag
        files        = $manifestEntries
    } | ConvertTo-Json -Depth 3 |
        Out-File -FilePath (Join-Path $secretsRoot ".manifest-$machineTag.json") -Encoding UTF8 -Force
    Write-Host "  manifest: .manifest-$machineTag.json ($($manifestEntries.Count) entries)" -ForegroundColor DarkGray

    Write-Host "  secrets -> $secretsRoot" -ForegroundColor Cyan

} elseif ($secretsRoot) {
    Write-Host "  WARN: AO_SYNC_SECRETS_ROOT set but path not found: $secretsRoot" -ForegroundColor Yellow
    Write-Host "        Is Google Drive running? Is Cryptomator vault unlocked?" -ForegroundColor Yellow
} else {
    Write-Host "  AO_SYNC_SECRETS_ROOT not set; secrets not exported." -ForegroundColor DarkGray
    Write-Host "  Set once: [System.Environment]::SetEnvironmentVariable('AO_SYNC_SECRETS_ROOT','G:\<vault>','User')" -ForegroundColor DarkGray
}

# ── 6. Pruning (two independent rules, never touch what we don't own) ────────
if (-not $DestRoot) {

    $ownFolders = @(
        Get-ChildItem -Path $syncRoot -Filter "AO-SYNC-*-$machineTag" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    )
    if ($ownFolders.Count -gt 7) {
        $ownFolders | Select-Object -Skip 7 | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  pruned (own, >7): $($_.Name)" -ForegroundColor DarkGray
        }
    }

    $cutoff = (Get-Date).AddDays(-30)
    Get-ChildItem -Path $syncRoot -Filter "AO-SYNC-*" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "-$([regex]::Escape($machineTag))$" } |
        Where-Object {
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
| memory/*.md | Individual memory files (feedback, project, reference entries) |
| memory/.exported-by | Machine that created this export ($($env:COMPUTERNAME)) |
| (secrets root)/user-env.ps1 | All MCP API keys (shared, last-write-wins) |
| (secrets root)/.ssh/* | SSH keys (dynamic scan; excl. known_hosts / authorized_keys / *.txt) |
| (secrets root)/AWARE_WAVE_CREDENTIALS.md | Credentials reference (shared) |
| (secrets root)/.manifest-$machineTag.json | Export manifest (sha256 + timestamp per file) |

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
| known_hosts, known_hosts.old | Machine-specific; would create SSH confusion on other machines |
| authorized_keys | Server-side key list; must not roam |
| *.txt, *.old, *.bkup | Reference or backup copies; not needed on other machines |
| All repo files | Synced via git pull |
"@

$instructions | Out-File -FilePath (Join-Path $destBase "IMPORT_INSTRUCTIONS.md") -Encoding UTF8 -Force

Write-Host ""
Write-Host "== cross-machine export complete -> $destBase ==" -ForegroundColor Cyan
Write-Host "   AO-RESUME on the other machine will auto-import (no manual steps needed)." -ForegroundColor DarkGray
