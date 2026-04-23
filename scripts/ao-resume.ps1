param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    # Autopilot / 極速開機：略過結尾的 machine-environment-audit -Strict（仍可能已用 -SkipVerify 略過 verify-build-gates）。
    [switch]$SkipStrictEnvironmentAudit,
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowPendingStash,
    [switch]$SkipWorkflowsDeps,
    [switch]$SkipOpenTasksList,
    # 與 GitHub 主線對齊：`fetch` → `checkout main` → `reset --hard origin/main` →（**預設不切功能分支**；可選切回功能分支並 `merge origin/main`）。**不**與 Autopilot（`-SkipStrictEnvironmentAudit`）併用。關鍵字 **AO-RESUME** 由 `.cursor/rules/30-resume-keyword.mdc` 預設傳此旗標。
    [switch]$FullMainlineParity,
    [string]$FullMainlineFeatureBranch = "fix/trigger-clickhouse-oom",
    [switch]$FullMainlinePushFeature,
    # Default: $true (main-only). Use `-FullMainlineMainOnly:$false` or `-FullMainlineFeature` to re-enable the feature-branch continuation flow.
    [bool]$FullMainlineMainOnly = $true,
    # Optional explicit opt-in for feature-branch flow (works well with nested `powershell -File` calls).
    [switch]$FullMainlineFeature,
    [switch]$FullMainlineAllowStash,
    # Passed through to `git-align-main-aoresume-feature.ps1`.
    # Default: missing feature branch (no local, no origin) does not fail the whole AO-RESUME; use `-FullMainlineRequireFeatureBranch` for legacy hard-fail.
    [switch]$FullMainlineRequireFeatureBranch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-AoResumeQuickFix {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][int]$ExitCode
    )
    Write-Host ""
    Write-Host ("AO-RESUME quick fix ({0}, exit {1}):" -f $Step, $ExitCode) -ForegroundColor Yellow
    switch ($Step) {
        "preflight" {
            Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -AllowUnexpectedDirty'
            Write-Host "  (If still failing, run: git status -sb)"
        }
        "workflows-deps" {
            Write-Host '  cd ".\lobster-factory\packages\workflows"; npm ci; cd "..\..\.."; powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1'
        }
        "open-tasks" {
            Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\print-open-tasks.ps1 -WorkRoot .'
        }
        "strict-audit" {
            Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -WorkRoot . -FetchOrigin'
            Write-Host "  (Then re-run AO-RESUME after fixing WARN/FAIL)"
        }
        "rules-consistency" {
            Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1 -MonorepoRoot .'
            Write-Host "  (Then re-run AO-RESUME)"
        }
        default {
            Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1'
        }
    }
}

function Assert-AoResumeRuleConsistency {
    param([Parameter(Mandatory = $true)][string]$Root)

    $ownerSpec = Join-Path $Root "agency-os\docs\operations\rules-version-and-enforcement.md"
    if (-not (Test-Path -LiteralPath $ownerSpec)) {
        Write-Error "ao-resume: missing rule owner spec at $ownerSpec"
        return 1
    }
    $ownerRaw = Get-Content -LiteralPath $ownerSpec -Raw -Encoding UTF8
    if ($ownerRaw -notmatch 'Version:\s*`?\d{4}-\d{2}-\d{2}\.\d+`?') {
        Write-Error "ao-resume: owner spec missing Version marker (rules-version-and-enforcement.md)."
        return 1
    }

    $syncVerify = Join-Path $Root "scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1"
    if (Test-Path -LiteralPath $syncVerify) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncVerify -MonorepoRoot $Root -VerifyOnly -Quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-resume: rules mirror consistency check failed (root .cursor/rules != agency-os canonical)."
            return $LASTEXITCODE
        }
    }
    return 0
}

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$checkScript = Join-Path $WorkRoot "scripts\check-three-way-sync.ps1"
if (-not (Test-Path -LiteralPath $checkScript)) {
    Write-Error "ao-resume: missing check script at $checkScript"
    exit 1
}

$rulesConsistencyExit = Assert-AoResumeRuleConsistency -Root $WorkRoot
if ($rulesConsistencyExit -ne 0) {
    Show-AoResumeQuickFix -Step "rules-consistency" -ExitCode $rulesConsistencyExit
    exit $rulesConsistencyExit
}

# Optional: hard-reset local main to origin/main, then ensure feature branch contains main (no nested ao-resume — we run once below).
if ($FullMainlineParity) {
    if ($SkipStrictEnvironmentAudit) {
        Write-Host "== AO-RESUME: -FullMainlineParity ignored with -SkipStrictEnvironmentAudit (Autopilot / lightweight path) ==" -ForegroundColor DarkYellow
    } else {
        $alignScript = Join-Path $WorkRoot "scripts\git-align-main-aoresume-feature.ps1"
        if (-not (Test-Path -LiteralPath $alignScript)) {
            Write-Error "ao-resume: missing $alignScript (required for -FullMainlineParity)."
            exit 1
        }
        Write-Host "== AO-RESUME: FullMainlineParity (git align via git-align-main-aoresume-feature.ps1 -SkipAoResume) ==" -ForegroundColor Cyan
        $alignArgs = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", $alignScript,
            "-WorkRoot", $WorkRoot,
            "-SkipAoResume"
        )
        # Prefer main-only by default.
        # NOTE: older versions used `[switch]$FullMainlineMainOnly` (presence == main-only). New default is `[bool]$FullMainlineMainOnly = $true`.
        $mainOnlyBound = $PSBoundParameters.ContainsKey("FullMainlineMainOnly")
        $mainOnlyVal = $true
        if ($mainOnlyBound) {
            if ($FullMainlineMainOnly -is [System.Management.Automation.SwitchParameter]) {
                $mainOnlyVal = [bool][int]$FullMainlineMainOnly
            } else {
                $mainOnlyVal = [bool]$FullMainlineMainOnly
            }
        }

        $includeFeature = $false
        if ($FullMainlineFeature) {
            $includeFeature = $true
            if ($mainOnlyBound -and $mainOnlyVal) {
                Write-Host "== AO-RESUME: -FullMainlineFeature overrides -FullMainlineMainOnly (feature-branch continuation enabled) ==" -ForegroundColor DarkYellow
            }
        } elseif ($mainOnlyBound -and -not $mainOnlyVal) {
            $includeFeature = $true
        }

        if (-not $includeFeature) {
            $alignArgs += "-SkipFeature"
        } else {
            $alignArgs += "-FeatureBranch", $FullMainlineFeatureBranch
        }
        if ($FullMainlinePushFeature) { $alignArgs += "-PushFeature" }
        if ($FullMainlineRequireFeatureBranch) { $alignArgs += "-RequireFeatureBranch" }
        $alignStash = $FullMainlineAllowStash -or $AllowStashBeforePull -or $AllowUnexpectedDirty
        if ($alignStash) { $alignArgs += "-AllowStash" }
        & powershell.exe @alignArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-resume: FullMainlineParity git align failed (exit $LASTEXITCODE). Fix dirty tree or pass -FullMainlineAllowStash / -AllowUnexpectedDirty."
            exit $LASTEXITCODE
        }
    }
}

# Refresh snapshot before git preflight so AO-RESUME / agents still see current TASKS.md
# even when check-three-way-sync fails (dirty tree / behind / etc.).
Write-Host "== AO-RESUME: refresh open-tasks snapshot (TASKS.md) ==" -ForegroundColor Cyan
$openTasksScript = Join-Path $WorkRoot "scripts\print-open-tasks.ps1"
if (-not $SkipOpenTasksList -and (Test-Path -LiteralPath $openTasksScript)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $openTasksScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Show-AoResumeQuickFix -Step "open-tasks" -ExitCode $LASTEXITCODE
        Write-Error "ao-resume: print-open-tasks failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
} elseif ($SkipOpenTasksList) {
    Write-Host "== AO-RESUME: -SkipOpenTasksList（略過待辦快照）==" -ForegroundColor DarkYellow
}

Write-Host "== AO-RESUME: preflight auto-fix ==" -ForegroundColor Cyan

# Script-scoped flag: survives nested powershell.exe -File (print-open-tasks). Compute here so StrictMode never reads an "unassigned" switch at script top.
$skipStrictRequested = $false
if ($PSBoundParameters.ContainsKey('SkipStrictEnvironmentAudit')) {
    $skipStrictRequested = [bool]$SkipStrictEnvironmentAudit
}
$script:StrictEnvAudit = -not $skipStrictRequested

$syncArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $checkScript,
    "-WorkRoot", $WorkRoot,
    "-AutoFix"
)
# 預設＝完整開工（含 verify-build-gates + 結尾 Strict 環境稽核）。只有加上 -SkipStrictEnvironmentAudit 才允許「只跑輕量 preflight」。
if ($SkipVerify -and $script:StrictEnvAudit) { Write-Host "== AO-RESUME: 預設完整檢查 — 忽略 -SkipVerify（仍跑 verify-build-gates）==" -ForegroundColor DarkYellow }
if ($SkipVerify -and -not $script:StrictEnvAudit) { $syncArgs += "-SkipVerify" }
if ($AllowUnexpectedDirty) { $syncArgs += "-AllowUnexpectedDirty" }
if ($AllowUnexpectedDirty -or $AllowStashBeforePull) { $syncArgs += "-AllowStashBeforePull" }
if ($AllowUnexpectedDirty -or $AllowPendingStash) { $syncArgs += "-AllowPendingStash" }

& powershell.exe @syncArgs
if ($LASTEXITCODE -ne 0) {
    Show-AoResumeQuickFix -Step "preflight" -ExitCode $LASTEXITCODE
    Write-Error "ao-resume: preflight check failed (exit $LASTEXITCODE)."
    exit $LASTEXITCODE
}

Write-Host "AO-RESUME preflight completed: repo is synced and ready." -ForegroundColor Green

$depsScript = Join-Path $WorkRoot "scripts\ensure-lobster-workflows-deps.ps1"
if (-not $SkipWorkflowsDeps -and (Test-Path -LiteralPath $depsScript)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $depsScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Show-AoResumeQuickFix -Step "workflows-deps" -ExitCode $LASTEXITCODE
        Write-Error "ao-resume: workflows dependency step failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
} elseif ($SkipWorkflowsDeps) {
    Write-Host "== AO-RESUME: -SkipWorkflowsDeps（略過 npm ci 檢查）==" -ForegroundColor DarkYellow
}

if ($script:StrictEnvAudit) {
    $auditScript = Join-Path $WorkRoot "scripts\machine-environment-audit.ps1"
    if (-not (Test-Path -LiteralPath $auditScript)) {
        Write-Error "ao-resume: machine-environment-audit missing at $auditScript"
        exit 1
    }
    Write-Host ""
    Write-Host "== AO-RESUME: 預設完整檢查（machine-environment-audit -FetchOrigin -Strict）==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $auditScript -WorkRoot $WorkRoot -FetchOrigin -Strict
    if ($LASTEXITCODE -ne 0) {
        Show-AoResumeQuickFix -Step "strict-audit" -ExitCode $LASTEXITCODE
        Write-Error "ao-resume: machine-environment-audit -Strict failed (exit $LASTEXITCODE). Fix output above; no manual markdown checklist required."
        exit $LASTEXITCODE
    }
}

# Report delta since last AO-RESUME (local stamp under agency-os/.agency-state/)
$stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
$stampPath = Join-Path $stateDir "ao-resume-last.txt"
$null = New-Item -ItemType Directory -Force -Path $stateDir

$lastUtc = $null
if (Test-Path -LiteralPath $stampPath) {
    try {
        $raw = (Get-Content -LiteralPath $stampPath -Raw).Trim()
        if ($raw) { $lastUtc = [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    } catch {
        $lastUtc = $null
    }
}

$subdirs = @("closeout", "health", "guard", "status")
$allFiles = New-Object System.Collections.Generic.List[System.IO.FileInfo]
foreach ($sub in $subdirs) {
    $dir = Join-Path $WorkRoot "agency-os\reports\$sub"
    if (Test-Path -LiteralPath $dir) {
        foreach ($f in (Get-ChildItem -LiteralPath $dir -File -Recurse -ErrorAction SilentlyContinue)) {
            $allFiles.Add($f)
        }
    }
}

$newer = New-Object System.Collections.Generic.List[System.IO.FileInfo]
foreach ($f in $allFiles) {
    $t = $f.LastWriteTimeUtc
    if (-not $lastUtc -or $t -gt $lastUtc) { $newer.Add($f) }
}

$sorted = @($newer | Sort-Object LastWriteTimeUtc -Descending)
$cap = 30
Write-Host ""
Write-Host "== Reports since last AO-RESUME ==" -ForegroundColor Cyan
if (-not $lastUtc) {
    Write-Host "No prior stamp at agency-os/.agency-state/ao-resume-last.txt (first run or reset)." -ForegroundColor DarkYellow
}
if ($sorted.Count -eq 0) {
    Write-Host "No new or updated files under agency-os/reports/{closeout,health,guard,status} since last stamp." -ForegroundColor Green
} else {
    $show = $sorted
    if ($sorted.Count -gt $cap) {
        Write-Host ("Total newer files: {0} (showing newest {1})" -f $sorted.Count, $cap) -ForegroundColor DarkYellow
        $show = $sorted | Select-Object -First $cap
    } else {
        Write-Host ("Newer files: {0}" -f $sorted.Count) -ForegroundColor Green
    }
    foreach ($f in $show) {
        $rel = $f.FullName.Substring($WorkRoot.Length).TrimStart("\", "/")
        Write-Host ("  {0:u}  {1}" -f $f.LastWriteTimeUtc, $rel)
    }
}

$nowStamp = (Get-Date).ToUniversalTime().ToString("o")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($stampPath, $nowStamp + [Environment]::NewLine, $utf8NoBom)
Write-Host ""
Write-Host ("AO-RESUME stamp updated: {0}" -f $nowStamp) -ForegroundColor DarkGray

exit 0
