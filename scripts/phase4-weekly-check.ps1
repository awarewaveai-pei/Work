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

# ── 執行單一 checker ───────────────────────────────────────────────────────
# 2026-08-26：本檔不再自己實作任何檢查。全部邏輯在 scripts/phase4-checks.py，
# 雲端 routine 與本檔呼叫同一支。這是為了關掉一個真的發生過的失效：CHECK 4 於
# 2026-05-23 只加進雲端 prompt，本檔三個月不知道它存在 —— 所謂「備援」其實是
# 另一顆不同的偵測器。以後新增檢查改 .py 一處，兩邊同時生效，不必動雲端 prompt。
#
# $ErrorActionPreference 從 SilentlyContinue 改為 Continue：舊值正是 Check 3 在
# 資料寫壞時整段靜默跳過、卻仍宣告健康的成因（2026-08-26 實測重現）。這裡改為
# 逐一檢查 exit code，任何失敗都必須看得見。
$ErrorActionPreference = "Continue"

$checker     = Join-Path $WorkRoot "scripts\phase4-checks.py"
$stamp       = $now.ToString("yyyy-MM-dd HH:mm")
$dateOnly    = $now.ToString("yyyy-MM-dd")
$latestPath  = Join-Path $reportDir "phase4-LATEST.md"
$archivePath = Join-Path $reportDir "phase4-$dateOnly.md"
$trigger     = "手動 fallback (scripts\phase4-weekly-check.ps1)"

function Write-SkipReport {
    param([string]$Reason)
    # 跑不起來時絕不可以長得像健康：四項全部 SKIP，理由直接寫進報告本體。
    $lines = @(
        "# Repair Center Phase 4 週巡檢",
        "- 日期: $stamp TPE",
        "- 觸發: $trigger",
        "- Check 1 重複修復: SKIP — $Reason",
        "- Check 2 needs-human-review PR: SKIP — $Reason",
        "- Check 3 租戶備份健康: SKIP — $Reason",
        "- Check 4 VPS auto-reboot SSOT: SKIP — $Reason",
        "- 整體: ⚠️ 0 項需注意, 4 項 SKIP"
    )
    $body = ($lines -join "`n") + "`n"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($latestPath,  $body, $utf8)
    [System.IO.File]::WriteAllText($archivePath, $body, $utf8)
    Write-Host "WARN: checker 無法執行 — $Reason" -ForegroundColor Red
    return $body
}

$python = $null
foreach ($cand in @("python3", "python", "py")) {
    $found = Get-Command $cand -ErrorAction SilentlyContinue
    if ($found) { $python = $found.Source; break }
}

$telegramText = $null
$allPass      = $false

if (-not $python) {
    $null = Write-SkipReport -Reason "找不到 python3/python（checker 需要 Python 3）"
    $telegramText = "⚠️ Repair Center Phase 4 週巡檢 $stamp`n四項全部 SKIP：本機找不到 Python 3"
} elseif (-not (Test-Path -LiteralPath $checker)) {
    $null = Write-SkipReport -Reason "找不到 $checker"
    $telegramText = "⚠️ Repair Center Phase 4 週巡檢 $stamp`n四項全部 SKIP：找不到 phase4-checks.py"
} else {
    $errFile = [System.IO.Path]::GetTempFileName()
    try {
        # Invoke-WithUtf8Console：外部命令 stdout 在 Big5 主機上會被 CP950 解碼吃掉
        # 中文與換行（見 scripts/_console-encoding-helpers.ps1 檔頭）。JSON 含中文，必包。
        $raw = Invoke-WithUtf8Console {
            & $python $checker --repo $WorkRoot --format json --write `
                --timestamp $stamp --trigger $trigger 2>$errFile
        }
        $rc = $LASTEXITCODE
        $stderrText = ""
        if (Test-Path -LiteralPath $errFile) {
            $stderrText = ((Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue) + "").Trim()
        }

        if ($rc -ne 0) {
            $null = Write-SkipReport -Reason "checker exit=$rc $stderrText"
            $telegramText = "⚠️ Repair Center Phase 4 週巡檢 $stamp`n四項全部 SKIP：checker exit=$rc"
        } else {
            $json = $null
            try { $json = ($raw -join "`n") | ConvertFrom-Json } catch { $json = $null }
            if (-not $json) {
                $null = Write-SkipReport -Reason "checker 輸出不是合法 JSON"
                $telegramText = "⚠️ Repair Center Phase 4 週巡檢 $stamp`n四項全部 SKIP：checker 輸出無法解析"
            } else {
                # 報告檔已由 checker 以 --write 寫入（單一寫入者 → 兩個呼叫端不會產出
                # 不同行尾或不同格式的同名檔）。這裡只負責顯示與通知。
                Write-Host $json.report
                $telegramText = $json.telegram
                $allPass = (($json.warnings -eq 0) -and ($json.skips -eq 0))
            }
        }
    } finally {
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "報告 → $latestPath" -ForegroundColor DarkGray

# ── Telegram 通知 ──────────────────────────────────────────────────────────
if (-not $SkipTelegram) {
    # 通知內容同樣來自 checker 的單一輸出（$json.telegram），不在這裡重新拼字串 ——
    # 否則 Check 4 那種「只加一邊」的漏接會在通知層重演一次。
    # 真值來自環境（mcp/user-env.ps1），絕不走 `secrets-vault -Action get`：那會回遮罩值，
    # 曾讓本通知靜默 404 直到 2026-08-12。見 scripts/lib/telegram-notify.ps1。
    try {
        $tgLib = Join-Path $WorkRoot "scripts\lib\telegram-notify.ps1"
        if (Test-Path -LiteralPath $tgLib) {
            . $tgLib
            $tgResult = Send-OpsTelegram -Text $telegramText -WorkRoot $WorkRoot
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

Write-Host "== Phase 4 週巡檢完成 ==" -ForegroundColor $(if ($allPass) { 'Green' } else { 'Yellow' })
exit 0
