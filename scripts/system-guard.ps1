param(
    [string]$WorkspaceRoot = "",
    [double]$MinHealthScore = 100.0,
    [ValidateSet("manual", "daily", "pre_shutdown", "startup")][string]$Mode = "manual",
    [switch]$OpenStatusFile,
    # 排程／無使用者工作階段：不跳 WScript.Popup、不強制開 LAST_SYSTEM_STATUS.md
    [switch]$HideUi,
    # 保守自動修復：只重跑 doc-sync + system-health-check（不做任何資料/程式碼變更）
    [switch]$DisableAutoRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Get-LatestFile {
    param([string]$Dir, [string]$Filter)
    if (-not (Test-Path $Dir)) { return $null }
    return Get-ChildItem -Path $Dir -Filter $Filter -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

function Parse-HealthScore {
    param([string]$HealthReportPath)
    if (-not (Test-Path $HealthReportPath)) { return 0.0 }
    $text = Get-Content -Raw -Encoding UTF8 -Path $HealthReportPath
    $m = [regex]::Match($text, "Score:\s*\*\*(?<score>[0-9]+(\.[0-9]+)?)%\*\*")
    if ($m.Success) { return [double]$m.Groups["score"].Value }
    return 0.0
}

function Invoke-GuardChildPwsh {
    param(
        [string]$ScriptPath,
        [string[]]$ScriptArgs = @()
    )
    $pre = @()
    if ($HideUi -or ($env:AGENCYOS_SCHEDULED_QUIET -eq "1")) {
        $pre = @("-WindowStyle", "Hidden", "-NonInteractive")
    }
    & powershell.exe @pre -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @ScriptArgs | Out-Null
}

function Show-DesktopPopup {
    param(
        [string]$Title,
        [string]$Message,
        [bool]$IsError = $false
    )
    try {
        $ws = New-Object -ComObject WScript.Shell
        $iconCode = if ($IsError) { 16 } else { 64 }
        # Auto-close in 8 seconds to avoid blocking automation runs.
        [void]$ws.Popup($Message, 8, $Title, $iconCode)
    } catch {
        # Non-interactive session fallback: keep file-based status only.
    }
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$healthUtils = Join-Path $PSScriptRoot "health-report-utils.ps1"
if (Test-Path -LiteralPath $healthUtils) {
    . (Resolve-Path -LiteralPath $healthUtils).Path
}
$noUi = $HideUi -or ($env:AGENCYOS_SCHEDULED_QUIET -eq "1")

# 1) Sync relationships
Invoke-GuardChildPwsh -ScriptPath (Join-Path $PSScriptRoot "doc-sync-automation.ps1") -ScriptArgs @("-AutoDetect")

# 2) Health check — skip if a fresh 100% report exists from this session (< 10 min)
$healthDir = Join-Path $root "reports/health"
$closeoutDir = Join-Path $root "reports/closeout"
$healthExitCode = 1
$freshCutoff = [DateTime]::UtcNow.AddMinutes(-10)
$existingHealth = Get-LatestFile -Dir $healthDir -Filter "health-*.md"
$usedFreshReport = $false
if ($existingHealth -and $existingHealth.LastWriteTimeUtc -gt $freshCutoff) {
    $freshScore = Parse-HealthScore -HealthReportPath $existingHealth.FullName
    if ($freshScore -ge 100.0) {
        $healthExitCode = 0
        $usedFreshReport = $true
        Write-Host "system-guard: reusing fresh health report ($($existingHealth.Name), score=$($freshScore)%) — skipping duplicate run" -ForegroundColor Cyan
    }
}
if (-not $usedFreshReport) {
    Invoke-GuardChildPwsh -ScriptPath (Join-Path $PSScriptRoot "system-health-check.ps1") -ScriptArgs @("-WorkspaceRoot", $root)
    $healthExitCode = $LASTEXITCODE
}
$guardDir = Join-Path $root "reports/guard"
Ensure-Dir -Path $guardDir

$latestHealth = Get-LatestFile -Dir $healthDir -Filter "health-*.md"
$latestCloseout = Get-LatestFile -Dir $closeoutDir -Filter "closeout-*.md"
$score = $null
if (Get-Command Get-LatestHealthScorePercent -ErrorAction SilentlyContinue) {
    $score = Get-LatestHealthScorePercent -HealthDir $healthDir
}
if ($null -eq $score -and $latestHealth) {
    $score = Parse-HealthScore -HealthReportPath $latestHealth.FullName
}
if ($null -eq $score) { $score = 0.0 }
$closeoutExists = $null -ne $latestCloseout
$gateOk = ($healthExitCode -eq 0) -and $closeoutExists
$ok = ($score -ge $MinHealthScore) -and $gateOk

$autoRepairAttempted = $false
$autoRepairResult = "N/A"

# Auto-repair (conservative): retry once with doc-sync + health check only.
if (-not $ok -and -not $DisableAutoRepair) {
    $autoRepairAttempted = $true
    try {
        Write-Host "System guard auto-repair: retry doc-sync + system-health-check once..." -ForegroundColor Yellow

        Invoke-GuardChildPwsh -ScriptPath (Join-Path $PSScriptRoot "doc-sync-automation.ps1") -ScriptArgs @("-AutoDetect")
        Invoke-GuardChildPwsh -ScriptPath (Join-Path $PSScriptRoot "system-health-check.ps1") -ScriptArgs @("-WorkspaceRoot", $root)
        $healthExitCode = $LASTEXITCODE

        $latestHealth = Get-LatestFile -Dir $healthDir -Filter "health-*.md"
        $latestCloseout = Get-LatestFile -Dir $closeoutDir -Filter "closeout-*.md"
        $score = $null
        if (Get-Command Get-LatestHealthScorePercent -ErrorAction SilentlyContinue) {
            $score = Get-LatestHealthScorePercent -HealthDir $healthDir
        }
        if ($null -eq $score -and $latestHealth) {
            $score = Parse-HealthScore -HealthReportPath $latestHealth.FullName
        }
        if ($null -eq $score) { $score = 0.0 }
        $closeoutExists = $null -ne $latestCloseout
        $gateOk = ($healthExitCode -eq 0) -and $closeoutExists
        $ok = ($score -ge $MinHealthScore) -and $gateOk

        if ($ok) { $autoRepairResult = "PASS" } else { $autoRepairResult = "FAIL" }
    } catch {
        # 自動修復失敗時保守處理：仍沿用原本 FAIL 邏輯並生成 ALERT。
        $autoRepairResult = "ERROR"
    }
}

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$guardReport = Join-Path $guardDir ("guard-" + $stamp + ".md")
$statusFile = Join-Path $root "LAST_SYSTEM_STATUS.md"
$alertFile = Join-Path $root "ALERT_REQUIRED.txt"

$lines = @()
$lines += "# System Guard Status"
$lines += ""
$lines += ('- Mode: `{0}`' -f $Mode)
$lines += ('- Time: `{0}`' -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
$lines += ('- Health score: **{0}%**' -f $score)
$lines += ('- Threshold: **{0}%**' -f $MinHealthScore)
$lines += ('- Health gate exit code: **{0}**' -f $healthExitCode)
$lines += ('- Closeout report exists: **{0}**' -f ($(if ($closeoutExists) { "YES" } else { "NO" })))
$lines += ('- Result: **{0}**' -f ($(if ($ok) { "PASS" } else { "FAIL" })))
$lines += ('- Auto-repair attempted: **{0}**' -f ($(if ($autoRepairAttempted) { "YES" } else { "NO" })))
$lines += ('- Auto-repair result: **{0}**' -f $autoRepairResult)
$lines += ""
$lines += "## Latest Reports"
$healthRef = if ($latestHealth) { "reports/health/" + $latestHealth.Name } else { "N/A" }
$closeoutRef = if ($latestCloseout) { "reports/closeout/" + $latestCloseout.Name } else { "N/A" }
$lines += ('- Health: `{0}`' -f $healthRef)
$lines += ('- Closeout: `{0}`' -f $closeoutRef)
$lines += ""
$lines += "## Action"
if ($ok) {
    $lines += "- No blocking issue detected."
} else {
    $lines += "- Blocking issues detected. Review latest health/closeout reports immediately."
}

# Full per-run snapshot always lands in the gitignored reports/guard/ report.
Set-Content -Path $guardReport -Value ($lines -join "`r`n") -Encoding UTF8

# Only rewrite the git-tracked LAST_SYSTEM_STATUS.md when the MEANINGFUL status changed.
# The Time stamp and the two timestamped report filenames (Health:/Closeout:) change every
# run, so writing them into a tracked file made the working tree dirty at every session start.
# The AO-RESUME hook then auto-committed that churn into a checkpoint, which could not
# fast-forward when the other machine had pushed -> divergence + manual reset on every machine
# switch (root cause, 2026-06-02). Excluding those volatile lines (and a leading UTF-8 BOM)
# from the comparison keeps the tracked file byte-stable across runs with the same status.
$newStatus = ($lines -join "`r`n")
$stableStatusOf = {
    param($text)
    if (-not $text) { return "" }
    $t = ([string]$text).TrimStart([char]0xFEFF)
    (($t -split "`r?`n" | Where-Object { $_ -notmatch '^- (Time|Health|Closeout): ' }) -join "`n").TrimEnd()
}
$existingStatus = if (Test-Path -LiteralPath $statusFile) { Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 } else { "" }
if ((& $stableStatusOf $existingStatus) -ne (& $stableStatusOf $newStatus)) {
    Set-Content -Path $statusFile -Value $newStatus -Encoding UTF8
}

if ($ok) {
    if (Test-Path $alertFile) { Remove-Item -Path $alertFile -Force }
} else {
    Set-Content -Path $alertFile -Value ("System Guard FAIL at " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")) -Encoding UTF8
}

if (-not $noUi) {
    $popupTitle = "AgencyOS System Guard - " + ($(if ($ok) { "PASS" } else { "FAIL" }))
    $popupMessage = "Health Score: " + $score + "%`r`nStatus: " + $(if ($ok) { "PASS" } else { "FAIL" }) + "`r`nSee: LAST_SYSTEM_STATUS.md"
    if (-not $ok) {
        $popupMessage += "`r`nALERT_REQUIRED.txt generated."
    }
    Show-DesktopPopup -Title $popupTitle -Message $popupMessage -IsError:(-not $ok)
}

if (($OpenStatusFile -or $Mode -eq "startup") -and -not $noUi) {
    try {
        Start-Process -FilePath $statusFile | Out-Null
    } catch {
        # Ignore if running in non-interactive session.
    }
}

Write-Output ("System guard report: reports/guard/" + [System.IO.Path]::GetFileName($guardReport))
Write-Output ("Status file: LAST_SYSTEM_STATUS.md")
if (-not $ok) {
    Write-Output ("ALERT file generated: ALERT_REQUIRED.txt")
    exit 1
}
exit 0
