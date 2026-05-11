# export-cross-machine-memory.ps1
# Exports non-git Claude Code memory files to Desktop\AO-SYNC-<date>\ for cross-machine transfer.
# Called automatically at end of AO-CLOSE after git push. Non-blocking.
#
# What gets exported:
#   ~/.claude/projects/c--Users-USER-Work/memory/*.md  (learned behaviors & preferences)
#
# What does NOT get exported (machine-specific or security-sensitive):
#   SSH keys, DPAPI vault, mcp/user-env.ps1, repo files (git pull handles those)

param(
    [string]$WorkRoot = "",
    [string]$DestRoot = ""
)

$today      = Get-Date -Format "yyyy-MM-dd"
$destBase   = if ($DestRoot) { $DestRoot } else { Join-Path $env:USERPROFILE "Desktop\AO-SYNC-$today" }
$memSrc     = Join-Path $env:USERPROFILE ".claude\projects\c--Users-USER-Work\memory"

if (-not (Test-Path -LiteralPath $memSrc)) {
    Write-Host "export-cross-machine-memory: memory dir not found ($memSrc); skip." -ForegroundColor DarkGray
    exit 0
}

$memDest = Join-Path $destBase "memory"
New-Item -ItemType Directory -Path $memDest -Force | Out-Null

$files  = @(Get-ChildItem -LiteralPath $memSrc -Filter "*.md" -File)
$copied = 0
foreach ($f in $files) {
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $memDest $f.Name) -Force
    Write-Host "  copied: $($f.Name)" -ForegroundColor Green
    $copied++
}

# Write import instructions
$fileList = ($files | ForEach-Object { "- $($_.Name)" }) -join "`n"
$instructions = @"
# AO-SYNC Export — $today

自動由 AO-CLOSE 產生。把整個 ``AO-SYNC-$today`` 資料夾帶到另一台機器後執行：

## 匯入步驟（另一台機器上貼上執行）

``````powershell
`$dest = "`$env:USERPROFILE\.claude\projects\c--Users-USER-Work\memory"
if (-not (Test-Path `$dest)) { New-Item -ItemType Directory -Path `$dest -Force }
Copy-Item "$memDest\*.md" "`$dest\" -Force
Write-Host "匯入完成" -ForegroundColor Green
``````

## 本次匯出清單

$fileList

## 不在此匯出（原因）

| 項目 | 原因 |
|------|------|
| SSH keys (``.ssh/hetzner_trigger``) | 一次性設定；如尚未設定請手動複製 |
| DPAPI vault | 機器綁定加密，複製後無法解密 |
| ``mcp/user-env.ps1`` | 每台機器各自設定，不共用 |
| repo 所有檔案 | ``git pull`` 自動同步 |
"@

$instructions | Out-File -FilePath (Join-Path $destBase "IMPORT_INSTRUCTIONS.md") -Encoding UTF8 -Force

Write-Host ""
Write-Host "== cross-machine export: $copied file(s) → $destBase ==" -ForegroundColor Cyan
Write-Host "   帶到另一台機器後，照 IMPORT_INSTRUCTIONS.md 執行匯入。" -ForegroundColor DarkGray
