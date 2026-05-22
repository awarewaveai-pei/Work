#requires -Version 5.1
<#
.SYNOPSIS
  Repair Center Phase 4 weekly check — 3 checks, ~5 minutes.
  Writes report to agency-os/reports/repair-center/phase4-LATEST.md
  Sends Telegram summary to TELEGRAM_ALLOWED_CHAT_IDS.

.STATUS
  DEPRECATED 2026-05-22 — kept as manual fallback only.
  Primary execution path: Claude routine AgencyOS-RepairCenterPhase4Weekly
  Routine SSOT: agency-os/automation/claude-routines/phase4-weekly.md
  Watchdog: scripts/system-health-check.ps1 §11 (phase4-LATEST.md mtime > 8d → WARN)

.NOTES
  Trigger paths (in order of preference):
    1. Claude routine (primary, always-on, no machine dependency)
    2. Manual fallback: chcp 65001 ; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase4-weekly-check.ps1
  File saved with UTF-8 BOM so PowerShell 5.1 parses CJK characters correctly
  regardless of system codepage (Big5 / GBK / Shift-JIS, etc). Do not strip the BOM.
#>
param(
    [string]$WorkRoot = "",
    [switch]$SkipTelegram
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

if (-not $WorkRoot) {
    try { $WorkRoot = (git -C $PSScriptRoot rev-parse --show-toplevel 2>$null).Trim() } catch {}
    if (-not $WorkRoot) { $WorkRoot = Split-Path $PSScriptRoot -Parent }
}
$WorkRoot = (Resolve-Path $WorkRoot).Path

$reportDir = Join-Path $WorkRoot "agency-os\reports\repair-center"
$null = New-Item -ItemType Directory -Force -Path $reportDir

$now       = Get-Date
$dateLabel = $now.ToString("yyyy-MM-dd HH:mm")
$results   = [ordered]@{}

Write-Host "== Phase 4 週巡檢 $dateLabel ==" -ForegroundColor Cyan

# ── Check 1: 重複修復偵測 ──────────────────────────────────────────────────
Write-Host "`n[Check 1] 重複修復偵測..." -ForegroundColor Cyan
$check1Status = "PASS"
$check1Detail = ""
try {
    $prJson = & gh pr list --repo awarewaveai-pei/Work --label auto-repair --state all --limit 30 --json number,title,createdAt 2>$null
    if ($LASTEXITCODE -eq 0 -and $prJson) {
        $prs = $prJson | ConvertFrom-Json
        # Group by simplified title (first 40 chars, lowercase, strip PR# prefix)
        $titleMap = @{}
        foreach ($pr in $prs) {
            $key = ($pr.title -replace '#\d+', '' -replace '\s+', ' ').Trim().ToLower().Substring(0, [Math]::Min(40, $pr.title.Length))
            if (-not $titleMap[$key]) { $titleMap[$key] = @() }
            $titleMap[$key] += "#$($pr.number)"
        }
        $dupes = $titleMap.GetEnumerator() | Where-Object { $_.Value.Count -ge 2 }
        if (@($dupes).Count -gt 0) {
            $check1Status = "WARNING"
            $check1Detail = ($dupes | ForEach-Object { "$($_.Value -join ', '): $($_.Key)..." }) -join "; "
            Write-Host "   WARNING: 重複修復 — $check1Detail" -ForegroundColor Yellow
        } else {
            Write-Host "   PASS: 無重複修復 ($($prs.Count) auto-repair PRs 已檢查)" -ForegroundColor Green
        }
    } else {
        $check1Status = "SKIP"
        $check1Detail = "gh CLI 不可用或無 PR"
        Write-Host "   SKIP: $check1Detail" -ForegroundColor DarkYellow
    }
} catch {
    $check1Status = "SKIP"
    $check1Detail = "錯誤: $_"
}
$results["check1"] = @{ status = $check1Status; detail = $check1Detail }

# ── Check 2: needs-human-review 開放 PR ───────────────────────────────────
Write-Host "`n[Check 2] needs-human-review PR..." -ForegroundColor Cyan
$check2Status = "PASS"
$check2Detail = ""
try {
    $prJson2 = & gh pr list --repo awarewaveai-pei/Work --label needs-human-review --state open --limit 10 --json number,title,url 2>$null
    if ($LASTEXITCODE -eq 0 -and $prJson2) {
        $prs2 = $prJson2 | ConvertFrom-Json
        if (@($prs2).Count -gt 0) {
            $check2Status = "WARNING"
            $check2Detail = (@($prs2) | ForEach-Object { "#$($_.number): $($_.title)" }) -join " | "
            Write-Host "   WARNING: $(@($prs2).Count) 個 PR 需人工審查 — $check2Detail" -ForegroundColor Yellow
        } else {
            Write-Host "   PASS: 無開放中 needs-human-review PR" -ForegroundColor Green
        }
    } else {
        $check2Status = "SKIP"
        $check2Detail = "gh CLI 不可用"
        Write-Host "   SKIP: $check2Detail" -ForegroundColor DarkYellow
    }
} catch {
    $check2Status = "SKIP"
    $check2Detail = "錯誤: $_"
}
$results["check2"] = @{ status = $check2Status; detail = $check2Detail }

# ── Check 3: BACKUP_RESTORE_PROOF 新鮮度 ──────────────────────────────────
Write-Host "`n[Check 3] BACKUP_RESTORE_PROOF 新鮮度（>7天警告）..." -ForegroundColor Cyan
$check3Status = "PASS"
$check3Detail = ""
$proofFiles   = Get-ChildItem -Path (Join-Path $WorkRoot "agency-os\tenants") -Filter "BACKUP_RESTORE_PROOF.md" -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch "templates" }
$staleList    = @()
foreach ($f in $proofFiles) {
    $raw = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    # Match most recent date entry: lines like "## 2026-05-08" or "date: 2026-05-08" or "**Date**: 2026-05-08"
    $dateMatches = [regex]::Matches($raw, '\b(20\d\d-\d{2}-\d{2})\b')
    if ($dateMatches.Count -gt 0) {
        $latestDate = ($dateMatches | ForEach-Object { [datetime]$_.Value } | Sort-Object -Descending | Select-Object -First 1)
        $ageDays    = [int]($now - $latestDate).TotalDays
        $tenantSlug = ($f.FullName -split '\\' | Where-Object { $_ -like 'company-*' } | Select-Object -First 1)
        if ($ageDays -gt 7) {
            $staleList += "${tenantSlug}: ${ageDays}天前 ($($latestDate.ToString('yyyy-MM-dd')))"
            Write-Host "   WARNING: $tenantSlug — 最新備份 $($latestDate.ToString('yyyy-MM-dd')) ($ageDays 天前)" -ForegroundColor Yellow
        } else {
            Write-Host "   OK: $tenantSlug — $($latestDate.ToString('yyyy-MM-dd')) ($ageDays 天前)" -ForegroundColor Green
        }
    } else {
        $staleList += "$($f.DirectoryName | Split-Path -Leaf): 無可解析日期"
        Write-Host "   WARNING: $($f.FullName) — 無可解析日期" -ForegroundColor Yellow
    }
}
if ($proofFiles.Count -eq 0) {
    $check3Status = "SKIP"
    $check3Detail = "無 BACKUP_RESTORE_PROOF.md 找到"
    Write-Host "   SKIP: $check3Detail" -ForegroundColor DarkYellow
} elseif ($staleList.Count -gt 0) {
    $check3Status = "WARNING"
    $check3Detail = $staleList -join "; "
} else {
    Write-Host "   PASS: 所有備份均在 7 天內" -ForegroundColor Green
}
$results["check3"] = @{ status = $check3Status; detail = $check3Detail }

# ── 寫報告 ─────────────────────────────────────────────────────────────────
$allPass = ($results.Values | Where-Object { $_.status -eq "WARNING" }).Count -eq 0
$overall = if ($allPass) { "✅ 全PASS" } else { "⚠️ $(@($results.Values | Where-Object { $_.status -eq 'WARNING' }).Count) 項需注意" }

$report = @"
# Repair Center Phase 4 週巡檢
- 日期: $dateLabel CST
- Check 1 重複修復: $($results.check1.status)$(if ($results.check1.detail) { " — $($results.check1.detail)" })
- Check 2 needs-human-review PR: $($results.check2.status)$(if ($results.check2.detail) { " — $($results.check2.detail)" })
- Check 3 BACKUP_RESTORE_PROOF: $($results.check3.status)$(if ($results.check3.detail) { " — $($results.check3.detail)" })
- 整體: $overall
"@

$utf8 = New-Object System.Text.UTF8Encoding $false
$latestPath = Join-Path $reportDir "phase4-LATEST.md"
$archivePath = Join-Path $reportDir "phase4-$($now.ToString('yyyy-MM-dd')).md"
[System.IO.File]::WriteAllText($latestPath,  $report + "`n", $utf8)
[System.IO.File]::WriteAllText($archivePath, $report + "`n", $utf8)
Write-Host "`n報告 → $latestPath" -ForegroundColor DarkGray

# ── Telegram 通知 ──────────────────────────────────────────────────────────
if (-not $SkipTelegram) {
    try {
        $vaultScript = Join-Path $WorkRoot "scripts\secrets-vault.ps1"
        $tokenRaw  = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vaultScript -Action get -Name TELEGRAM_BOT_TOKEN  2>&1 | Select-String '=')
        $chatRaw   = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vaultScript -Action get -Name TELEGRAM_ALLOWED_CHAT_IDS 2>&1 | Select-String '=')
        $token  = $tokenRaw.ToString().Split('=', 2)[1].Trim()
        $chatId = $chatRaw.ToString().Split('=',  2)[1].Trim().Split(',')[0].Trim()

        if ($token -and $chatId) {
            $emoji = if ($allPass) { '✅' } else { '⚠️' }
            $text  = "$emoji Repair Center Phase 4 週巡檢 $($now.ToString('MM/dd HH:mm'))`n"
            $text += "1 重複修復: $($results.check1.status)`n"
            $text += "2 needs-human-review: $($results.check2.status)`n"
            $text += "3 備份新鮮度: $($results.check3.status)`n"
            if (-not $allPass) { $text += "`n詳細: reports/repair-center/phase4-LATEST.md" }
            $body  = @{ chat_id = $chatId; text = $text } | ConvertTo-Json -Compress
            $resp  = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/sendMessage" `
                         -ContentType 'application/json' -Body $body -ErrorAction Stop
            Write-Host "Telegram 通知已發送 → chat $chatId" -ForegroundColor Green
        } else {
            Write-Host "WARN: Telegram 憑證無法讀取，跳過通知" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "WARN: Telegram 發送失敗 — $_" -ForegroundColor Yellow
    }
}

Write-Host "`n== Phase 4 週巡檢完成: $overall ==" -ForegroundColor $(if ($allPass) { 'Green' } else { 'Yellow' })
exit 0
