# audit-cross-machine-bom.ps1
# Audits UTF-8 BOM compliance on all .md files that cross Google Drive sync.
# Reports drift; optionally fixes with -Fix (backs up originals first).
#
# Scope (files that cross Drive — see agency-os/AGENTS.md "跨機 .md 編碼紀律"):
#   ~/.claude/projects/<key>/memory/MEMORY.md
#   ~/.claude/projects/<key>/memory/*.md
#   $env:AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md  (if Drive mounted)
#
# NOT in scope: repo .md (goes via git, preserves bytes — needs no BOM).
#
# Exit codes:
#   0 = clean (all files have BOM, or fixed all)
#   1 = drift found and not fixed
#   2 = unrecoverable error (e.g., memory dir missing)
#
# Usage:
#   powershell -File scripts/audit-cross-machine-bom.ps1                  # report only
#   powershell -File scripts/audit-cross-machine-bom.ps1 -Fix             # backfill BOM
#   powershell -File scripts/audit-cross-machine-bom.ps1 -ProjectKey d--Work  # override autodetect
#   powershell -File scripts/audit-cross-machine-bom.ps1 -WorkRoot d:\Work    # override autodetect

param(
    [switch]$Fix,
    [string]$ProjectKey = "",
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve WorkRoot + project key (same algorithm as sync scripts) ──────────
if (-not $WorkRoot) {
    $candidate = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    if (Test-Path -LiteralPath (Join-Path $candidate "agency-os")) {
        $WorkRoot = $candidate
    } else {
        $WorkRoot = (Get-Location).Path
    }
}
$WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path

if (-not $ProjectKey) {
    $ProjectKey = $WorkRoot.Substring(0,1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '\\', '-')
}

$memoryDir   = Join-Path $env:USERPROFILE ".claude\projects\$ProjectKey\memory"
$vaultMdPath = if ($env:AO_SYNC_SECRETS_ROOT) { Join-Path $env:AO_SYNC_SECRETS_ROOT "AWARE_WAVE_CREDENTIALS.md" } else { $null }

Write-Host "==== audit-cross-machine-bom ====" -ForegroundColor Cyan
Write-Host "  WorkRoot   : $WorkRoot"
Write-Host "  ProjectKey : $ProjectKey"
Write-Host "  memory dir : $memoryDir"
Write-Host "  vault path : $(if ($vaultMdPath) { $vaultMdPath } else { '(AO_SYNC_SECRETS_ROOT not set — skip)' })"
Write-Host ""

if (-not (Test-Path -LiteralPath $memoryDir)) {
    Write-Host "FAIL: memory dir not found: $memoryDir" -ForegroundColor Red
    Write-Host "  (is the project key correct? try -ProjectKey c--Users-USER-Work for desktop)" -ForegroundColor DarkYellow
    exit 2
}

# ── Collect target files ─────────────────────────────────────────────────────
$bomBytes = [byte[]](0xEF, 0xBB, 0xBF)

function Test-FileHasBom([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $buf = New-Object byte[] 3
        $n = $fs.Read($buf, 0, 3)
        if ($n -lt 3) { return $false }
        return ($buf[0] -eq $bomBytes[0] -and $buf[1] -eq $bomBytes[1] -and $buf[2] -eq $bomBytes[2])
    } finally {
        $fs.Close()
    }
}

$targets = New-Object System.Collections.Generic.List[object]
Get-ChildItem -Path $memoryDir -Filter "*.md" -File -ErrorAction SilentlyContinue |
    Where-Object { -not ($_.FullName -match '\\\.bom-backfill-backup-') } |
    ForEach-Object {
        $targets.Add([PSCustomObject]@{
            Path = $_.FullName
            Label = "memory/$($_.Name)"
            HasBom = Test-FileHasBom $_.FullName
        }) | Out-Null
    }
if ($vaultMdPath -and (Test-Path -LiteralPath $vaultMdPath)) {
    $targets.Add([PSCustomObject]@{
        Path = $vaultMdPath
        Label = "vault/AWARE_WAVE_CREDENTIALS.md"
        HasBom = Test-FileHasBom $vaultMdPath
    }) | Out-Null
}

if ($targets.Count -eq 0) {
    Write-Host "WARN: no target .md files found under $memoryDir" -ForegroundColor Yellow
    exit 1
}

$withBom = @($targets | Where-Object { $_.HasBom })
$missing = @($targets | Where-Object { -not $_.HasBom })

Write-Host "==== Audit result ====" -ForegroundColor Cyan
Write-Host "  total .md   : $($targets.Count)"
Write-Host "  with BOM    : $($withBom.Count)" -ForegroundColor Green
Write-Host "  missing BOM : $($missing.Count)" -ForegroundColor $(if ($missing.Count -eq 0) { 'Green' } else { 'Red' })

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Files missing BOM:" -ForegroundColor Red
    foreach ($t in $missing) {
        Write-Host "  - $($t.Label)" -ForegroundColor Red
    }
}

# ── Fix mode ─────────────────────────────────────────────────────────────────
if ($Fix -and $missing.Count -gt 0) {
    Write-Host ""
    Write-Host "==== Fix mode: backing up + adding BOM ====" -ForegroundColor Cyan
    $backupDir = Join-Path $memoryDir (".bom-backfill-backup-" + (Get-Date).ToString("yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "  backup dir: $backupDir"

    $fixed = 0
    $errors = 0
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    foreach ($t in $missing) {
        try {
            # Memory-dir backups go alongside; vault backup goes next to vault file.
            $bakName = (Split-Path -Path $t.Path -Leaf) + ".pre-bom-" + (Get-Date).ToString("yyyyMMdd-HHmmss")
            $bakPath = if ($t.Path.StartsWith($memoryDir)) {
                Join-Path $backupDir (Split-Path -Path $t.Path -Leaf)
            } else {
                Join-Path (Split-Path -Path $t.Path -Parent) $bakName
            }
            Copy-Item -LiteralPath $t.Path -Destination $bakPath -Force
            $content = [System.IO.File]::ReadAllText($t.Path, [System.Text.Encoding]::UTF8)
            [System.IO.File]::WriteAllText($t.Path, $content, $utf8bom)
            if (Test-FileHasBom $t.Path) {
                Write-Host "  fixed: $($t.Label) (backup: $bakPath)" -ForegroundColor Green
                $fixed++
            } else {
                Write-Host "  FAIL: $($t.Label) — BOM still missing after write" -ForegroundColor Red
                $errors++
            }
        } catch {
            Write-Host "  ERROR: $($t.Label) — $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }
    Write-Host ""
    Write-Host "==== Fix summary: $fixed fixed, $errors error(s) ====" -ForegroundColor Cyan
    if ($errors -gt 0) { exit 1 }
    exit 0
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Re-run with -Fix to backfill (originals backed up under .bom-backfill-backup-<timestamp>/)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "==== CLEAN: all cross-Drive .md have UTF-8 BOM ====" -ForegroundColor Green
exit 0
