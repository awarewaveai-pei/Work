param(
    [string]$WorkspaceRoot = "",
    [double]$MinHealthScore = 100.0,
    [ValidateSet("manual", "daily", "pre_shutdown", "startup")][string]$Mode = "manual",
    [switch]$OpenStatusFile,
    # 保守自動修復：只重跑 doc-sync + system-health-check（不做任何資料/程式碼變更）
    [switch]$DisableAutoRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }

    # Monorepo guardrail: if invoked from D:\Work, force canonical agency root.
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\system-guard.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }

    return $resolved
}

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

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot

# 1) Sync relationships
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts/doc-sync-automation.ps1") -AutoDetect | Out-Null

# 2) Health check
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts/system-health-check.ps1") -WorkspaceRoot $root | Out-Null
$healthExitCode = $LASTEXITCODE

$healthDir = Join-Path $root "reports/health"
$closeoutDir = Join-Path $root "reports/closeout"
$guardDir = Join-Path $root "reports/guard"
Ensure-Dir -Path $guardDir

$latestHealth = Get-LatestFile -Dir $healthDir -Filter "health-*.md"
$latestCloseout = Get-LatestFile -Dir $closeoutDir -Filter "closeout-*.md"
$score = if ($latestHealth) { Parse-HealthScore -HealthReportPath $latestHealth.FullName } else { 0.0 }
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

        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts/doc-sync-automation.ps1") -AutoDetect | Out-Null
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts/system-health-check.ps1") -WorkspaceRoot $root | Out-Null
        $healthExitCode = $LASTEXITCODE

        $latestHealth = Get-LatestFile -Dir $healthDir -Filter "health-*.md"
        $latestCloseout = Get-LatestFile -Dir $closeoutDir -Filter "closeout-*.md"
        $score = if ($latestHealth) { Parse-HealthScore -HealthReportPath $latestHealth.FullName } else { 0.0 }
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

Set-Content -Path $guardReport -Value ($lines -join "`r`n") -Encoding UTF8
Set-Content -Path $statusFile -Value ($lines -join "`r`n") -Encoding UTF8

if ($ok) {
    if (Test-Path $alertFile) { Remove-Item -Path $alertFile -Force }
} else {
    Set-Content -Path $alertFile -Value ("System Guard FAIL at " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")) -Encoding UTF8
}

$popupTitle = "AgencyOS System Guard - " + ($(if ($ok) { "PASS" } else { "FAIL" }))
$popupMessage = "Health Score: " + $score + "%`r`nStatus: " + $(if ($ok) { "PASS" } else { "FAIL" }) + "`r`nSee: LAST_SYSTEM_STATUS.md"
if (-not $ok) {
    $popupMessage += "`r`nALERT_REQUIRED.txt generated."
}
Show-DesktopPopup -Title $popupTitle -Message $popupMessage -IsError:(-not $ok)

if ($OpenStatusFile -or $Mode -eq "startup") {
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
