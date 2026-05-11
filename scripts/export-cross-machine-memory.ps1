# export-cross-machine-memory.ps1
# Exports the Claude Code project memory INDEX to AO-SYNC-<date>\ for cross-machine transfer.
# Called automatically at end of AO-CLOSE after git push. Non-blocking.
#
# Priority order for export destination:
#   1. -DestRoot param (explicit override)
#   2. $env:AO_SYNC_ROOT env var (machine-specific config)
#   3. G:\我的雲端硬碟\AO-SYNC (Google Drive default, if drive exists)
#   4. Desktop\AO-SYNC-<date> (legacy fallback)
#
# All memory CONTENT files (feedback_*.md, user_devices.md) are now in repo (agency-os/memory/)
# and synced automatically via git pull — no manual copy needed for those.
#
# Only MEMORY.md (the index Claude Code reads) lives outside git at:
#   ~/.claude/projects/c--Users-USER-Work/memory/MEMORY.md
# This file must exist on every machine for Claude Code to load project memory.

param(
    [string]$WorkRoot = "",
    [string]$DestRoot = ""
)

$today = Get-Date -Format "yyyy-MM-dd"

# Resolve sync root: param > env var > Google Drive > Desktop
$syncRoot = if ($DestRoot) {
    $DestRoot
} elseif ($env:AO_SYNC_ROOT) {
    $env:AO_SYNC_ROOT
} elseif (Test-Path "G:\我的雲端硬碟") {
    "G:\我的雲端硬碟\AO-SYNC"
} else {
    Join-Path $env:USERPROFILE "Desktop"
}

$destBase = if ($DestRoot) { $DestRoot } else { Join-Path $syncRoot "AO-SYNC-$today" }
$memSrc   = Join-Path $env:USERPROFILE ".claude\projects\c--Users-USER-Work\memory"
$memIndex = Join-Path $memSrc "MEMORY.md"

if (-not (Test-Path -LiteralPath $memIndex)) {
    Write-Host "export-cross-machine-memory: MEMORY.md not found ($memIndex); skip." -ForegroundColor DarkGray
    exit 0
}

$memDest = Join-Path $destBase "memory"
New-Item -ItemType Directory -Path $memDest -Force | Out-Null
Copy-Item -LiteralPath $memIndex -Destination (Join-Path $memDest "MEMORY.md") -Force
Write-Host "  copied: MEMORY.md" -ForegroundColor Green

# Write import instructions
$instructions = @"
# AO-SYNC Export — $today

自動由 AO-CLOSE 產生。把整個 ``AO-SYNC-$today`` 資料夾帶到另一台機器後執行匯入。

## 匯入步驟（另一台機器 — 貼上執行）

``````powershell
# Step 1: git pull（取得所有 memory 內容檔、rules、WORKLOG 等）
git pull origin main

# Step 2: AI 工具對齊（公司桌機必做；筆電漂移時補跑）
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1

# Step 3: 匯入 MEMORY.md index（Claude Code project memory）
`$dest = "`$env:USERPROFILE\.claude\projects\c--Users-USER-Work\memory"
if (-not (Test-Path `$dest)) { New-Item -ItemType Directory -Path `$dest -Force }
Copy-Item "$(Join-Path $memDest 'MEMORY.md')" "`$dest\MEMORY.md" -Force
Write-Host "匯入完成" -ForegroundColor Green
``````

## 為什麼只有 MEMORY.md？

所有 memory 內容（feedback_git_push.md、feedback_trigger_deploy.md、user_devices.md）已移入 repo ``agency-os/memory/``，``git pull`` 自動同步。
只有 MEMORY.md（Claude Code 讀取的 index）不在 git，需要手動帶過。

## 不在此匯出

| 項目 | 原因 |
|------|------|
| SSH key (``.ssh/hetzner_trigger``) | 一次性設定；首次換機請手動複製 |
| DPAPI vault | 機器綁定加密，複製後無法解密 |
| ``mcp/user-env.ps1`` | 每台機器各自設定，不共用 |
| repo 所有檔案 | ``git pull`` 自動同步 |
"@

$instructions | Out-File -FilePath (Join-Path $destBase "IMPORT_INSTRUCTIONS.md") -Encoding UTF8 -Force

Write-Host ""
Write-Host "== cross-machine export: MEMORY.md -> $destBase ==" -ForegroundColor Cyan
Write-Host "   See IMPORT_INSTRUCTIONS.md in the AO-SYNC folder for 3-step import guide." -ForegroundColor DarkGray
