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

. (Join-Path $PSScriptRoot '_console-encoding-helpers.ps1')

if (-not $WorkRoot) {
    try { $WorkRoot = (Invoke-WithUtf8Console { git -C $PSScriptRoot rev-parse --show-toplevel 2>$null }).Trim() } catch {}
    if (-not $WorkRoot) { $WorkRoot = Split-Path $PSScriptRoot -Parent }
}
if (Test-Path $WorkRoot) { $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path }

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

# ── Check 3: BACKUP_RESTORE_PROOF 健康（status frontmatter + JSON cross-truth）──
# 2026-05-30: 退役舊「抓最新日期」proxy 邏輯（會誤報 not-onboarded tenant），改對齊
# cloud routine AgencyOS-RepairCenterPhase4Weekly 的 status-frontmatter 邏輯：
#   not-onboarded → SKIP（靜默，不算 WARNING）
#   active → 3A restore_drill_due_after 逾期 + 3B BACKUP_AUTO_STATUS.json last_success > 8 天
Write-Host "`n[Check 3] BACKUP_RESTORE_PROOF 健康（status frontmatter）..." -ForegroundColor Cyan
$check3Status = "PASS"
$check3Detail = ""
$proofFiles   = Get-ChildItem -Path (Join-Path $WorkRoot "agency-os\tenants") -Filter "BACKUP_RESTORE_PROOF.md" -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch "template" }
$warnList = @()
$nowUtc   = (Get-Date).ToUniversalTime()
foreach ($f in $proofFiles) {
    $tenantSlug = ($f.FullName -split '\\' | Where-Object { $_ -like 'company-*' } | Select-Object -First 1)
    if (-not $tenantSlug) { $tenantSlug = Split-Path (Split-Path $f.DirectoryName -Parent) -Leaf }
    $raw = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue

    $status = $null
    $fmMatch = [regex]::Match($raw, '(?ms)\A---\s*\r?\n(.*?)\r?\n---')
    if ($fmMatch.Success) {
        $sMatch = [regex]::Match($fmMatch.Groups[1].Value, '(?m)^\s*status:\s*(\S+)')
        if ($sMatch.Success) { $status = $sMatch.Groups[1].Value.Trim() }
    }

    if ($status -eq 'not-onboarded') {
        Write-Host "   SKIP: $tenantSlug — not-onboarded" -ForegroundColor DarkGray
        continue
    }
    if ($status -ne 'active') {
        $warnList += "${tenantSlug}: 未知/缺 status frontmatter ($status)"
        Write-Host "   WARNING: $tenantSlug — 未知 status '$status'" -ForegroundColor Yellow
        continue
    }

    $tenantWarn = @()

    # 3A — restore drill due
    $drillMatch = [regex]::Match($fmMatch.Groups[1].Value, '(?m)^\s*restore_drill_due_after:\s*(\d{4}-\d{2}-\d{2})')
    if ($drillMatch.Success) {
        $due = [datetime]::ParseExact($drillMatch.Groups[1].Value, 'yyyy-MM-dd', $null)
        if ($nowUtc.Date -gt $due.Date) {
            $tenantWarn += "restore drill overdue (due $($drillMatch.Groups[1].Value))"
        }
    }

    # 3B — automated backup freshness (truth source)
    $jsonPath = Join-Path $f.DirectoryName "BACKUP_AUTO_STATUS.json"
    if (-not (Test-Path $jsonPath)) {
        $tenantWarn += "BACKUP_AUTO_STATUS.json missing — no truth source"
    } else {
        try {
            $j       = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
            $unix    = [long]$j.last_success.unix_utc
            $lastUtc = [datetimeoffset]::FromUnixTimeSeconds($unix).UtcDateTime
            $ageDays = [Math]::Floor(($nowUtc - $lastUtc).TotalDays)
            if ($ageDays -gt 8) {
                $tenantWarn += "last success ${ageDays}d ago ($($j.last_success.iso_utc)); over 8d"
            }
        } catch {
            $tenantWarn += "BACKUP_AUTO_STATUS.json parse error / missing last_success.unix_utc"
        }
    }

    if ($tenantWarn.Count -gt 0) {
        $warnList += "${tenantSlug}: $($tenantWarn -join ', ')"
        Write-Host "   WARNING: $tenantSlug — $($tenantWarn -join ', ')" -ForegroundColor Yellow
    } else {
        Write-Host "   OK: $tenantSlug — active, drill+backup fresh" -ForegroundColor Green
    }
}
if (@($proofFiles).Count -eq 0) {
    $check3Status = "SKIP"
    $check3Detail = "無 BACKUP_RESTORE_PROOF.md 找到"
    Write-Host "   SKIP: $check3Detail" -ForegroundColor DarkYellow
} elseif ($warnList.Count -gt 0) {
    $check3Status = "WARNING"
    $check3Detail = $warnList -join "; "
} else {
    Write-Host "   PASS: active tenant 備份健康；not-onboarded 已 SKIP" -ForegroundColor Green
}
$results["check3"] = @{ status = $check3Status; detail = $check3Detail }

# ── 寫報告 ─────────────────────────────────────────────────────────────────
$warnCount = @($results.Values | Where-Object { $_.status -eq "WARNING" }).Count
$skipCount = @($results.Values | Where-Object { $_.status -eq "SKIP" }).Count
$allPass   = ($warnCount -eq 0)
$overall   = if ($warnCount -eq 0 -and $skipCount -eq 0) { "✅ 全PASS" }
             elseif ($skipCount -eq 0) { "⚠️ $warnCount 項需注意" }
             else { "⚠️ $warnCount 項需注意, $skipCount 項 SKIP" }

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
    # Real values come from the environment (mcp/user-env.ps1), never from
    # `secrets-vault -Action get` — that returns a MASKED value and made this
    # notification 404 silently until 2026-08-12. See scripts/lib/telegram-notify.ps1.
    try {
    $tgLib = Join-Path $WorkRoot "scripts\lib\telegram-notify.ps1"
    if (Test-Path -LiteralPath $tgLib) {
        . $tgLib
        $emoji = if ($allPass) { '✅' } else { '⚠️' }
        $text  = "$emoji Repair Center Phase 4 週巡檢 $($now.ToString('MM/dd HH:mm'))`n"
        $text += "1 重複修復: $($results.check1.status)`n"
        $text += "2 needs-human-review: $($results.check2.status)`n"
        $text += "3 備份新鮮度: $($results.check3.status)`n"
        if (-not $allPass) { $text += "`n詳細: reports/repair-center/phase4-LATEST.md" }
        $tgResult = Send-OpsTelegram -Text $text -WorkRoot $WorkRoot
        if ($tgResult.Sent) {
            Write-Host "Telegram 通知已發送（$($tgResult.Reason)）" -ForegroundColor Green
        } else {
            Write-Host "WARN: Telegram 發送失敗 — $($tgResult.Reason)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "WARN: 找不到 scripts\lib\telegram-notify.ps1，跳過通知" -ForegroundColor Yellow
    }
    } catch {
        Write-Host "WARN: Telegram 發送失敗 - $_" -ForegroundColor Yellow
    }
}

Write-Host "`n== Phase 4 週巡檢完成: $overall ==" -ForegroundColor $(if ($allPass) { 'Green' } else { 'Yellow' })
exit 0
