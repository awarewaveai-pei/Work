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
    [string]$FullMainlineFeatureBranch = "",
    [switch]$FullMainlinePushFeature,
    # Default: $true (main-only). Use `-FullMainlineMainOnly:$false` or `-FullMainlineFeature` to re-enable the feature-branch continuation flow.
    [bool]$FullMainlineMainOnly = $true,
    # Optional explicit opt-in for feature-branch flow (works well with nested `powershell -File` calls).
    [switch]$FullMainlineFeature,
    [switch]$FullMainlineAllowStash,
    # Passed through to `git-align-main-aoresume-feature.ps1`.
    # Default: missing feature branch (no local, no origin) does not fail the whole AO-RESUME; use `-FullMainlineRequireFeatureBranch` for legacy hard-fail.
    [switch]$FullMainlineRequireFeatureBranch,
    # Destructive: passed to git-align as `-AllowResetAheadOfOrigin` — allows reset --hard to drop unpublished commits on main.
    [switch]$FullMainlineAllowResetAheadOfOrigin
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

function Invoke-FullMainlineAlignWithAutoCheckpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string[]]$AlignArgs
    )

    # Nested powershell.exe writes stdout to the success stream; when this function is invoked as
    # `$x = Invoke-...`, that output would fuse with `return`, producing bogus non-numeric exits.
    & powershell.exe @AlignArgs | Out-Host
    # NOTE: After `| Out-Host` the pipeline can leave $LASTEXITCODE null in PS 5.1.
    # Treat null as 0 (not 1): git-align.ps1 now has an explicit `exit 0` at the end,
    # so null here means "script completed without a native command setting the code" = success.
    $exit1 = if ($null -eq $LASTEXITCODE -or $LASTEXITCODE -eq '') { 0 } else { [int]$LASTEXITCODE }
    if ($exit1 -eq 0) {
        return 0
    }

    $statusShort = @(
        git -C $Root status --short 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if ($statusShort.Count -eq 0) {
        # Clean tree but git-align still failed — branch is ahead of origin without a dirty worktree.
        # This happens when ao-close-last.txt was committed but not pushed (ao-close-last.txt is now
        # gitignored, but old checkpoints may have included it). Push and retry rather than propagating
        # a phantom exit-1 that would skip all downstream AO-RESUME steps.
        $aheadCount = 0
        try {
            $aStr = (& git -C $Root rev-list --count "origin/main..HEAD" 2>$null | Select-Object -Last 1)
            if ($aStr -match '^\s*(\d+)\s*$') { $aheadCount = [int]$Matches[1] }
        } catch { }
        if ($aheadCount -gt 0) {
            Write-Host ("== AO-RESUME: clean tree; main is {0} commit(s) ahead of origin — push then retry align ==" -f $aheadCount) -ForegroundColor Yellow
            Push-Location -LiteralPath $Root
            try {
                & git push 2>&1 | Out-Host
                $pushExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            } finally { Pop-Location }
            if ($pushExit -ne 0) {
                Write-Host "AO-RESUME: git push failed (exit $pushExit). Fix auth/network then re-run AO-RESUME." -ForegroundColor Yellow
                return $pushExit
            }
            & powershell.exe @AlignArgs | Out-Host
            return $(if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE })
        }
        return $exit1
    }

    Write-Host "== AO-RESUME: FullMainlineParity detected dirty tree; run one auto-checkpoint retry ==" -ForegroundColor Yellow
    $checkpointScript = Join-Path $Root "scripts\commit-checkpoint.ps1"
    if (-not (Test-Path -LiteralPath $checkpointScript)) {
        Write-Host "AO-RESUME: checkpoint script not found, cannot auto-heal dirty tree." -ForegroundColor DarkYellow
        return $exit1
    }

    $checkpointMsg = "[cursor] checkpoint: auto-save dirty tree before FullMainlineParity retry"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkpointScript -Message $checkpointMsg -WorkRoot $Root | Out-Host
    $checkpointExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    if ($checkpointExit -ne 0) {
        Write-Host "AO-RESUME: auto-checkpoint failed (exit $checkpointExit)." -ForegroundColor DarkYellow
        return $checkpointExit
    }

    Write-Host "== AO-RESUME: git push (publish checkpoint before align reset; avoids orphan local-only commits) ==" -ForegroundColor Yellow
    Push-Location -LiteralPath $Root
    try {
        $null = git rev-parse --git-dir 2>$null
        if ($LASTEXITCODE -eq 0) {
            & git push 2>&1 | Out-Host
            $pushExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            if ($pushExit -ne 0) {
                Write-Host "AO-RESUME: git push failed (exit $pushExit). Fix auth/network/upstream, run git push, then re-run AO-RESUME. Align retry skipped so checkpoint is not reset away." -ForegroundColor Yellow
                return $pushExit
            }
        }
    }
    finally {
        Pop-Location | Out-Null
    }

    & powershell.exe @AlignArgs | Out-Host
    $exit2 = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    return $exit2
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
        # Stat-cache refresh: clear false-dirty entries (CRLF/mode noise that produces "M" with empty diff).
        # Without this, git-align rejects a working tree that is materially clean. Cheap, idempotent, no side effects.
        Push-Location $WorkRoot
        try {
            & git update-index --really-refresh 2>&1 | Out-Null
        } finally { Pop-Location }

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

        if ($includeFeature) {
            if ([string]::IsNullOrWhiteSpace($FullMainlineFeatureBranch)) {
                Write-Error "ao-resume: -FullMainlineFeature (or main-only:`$false) requires -FullMainlineFeatureBranch <branch-name>. Repo policy: stay on main unless you explicitly name a branch."
                exit 1
            }
            $alignArgs += "-ContinueWithFeatureBranch"
            $alignArgs += "-FeatureBranch", $FullMainlineFeatureBranch
        }
        if ($FullMainlinePushFeature) { $alignArgs += "-PushFeature" }
        if ($FullMainlineRequireFeatureBranch) { $alignArgs += "-RequireFeatureBranch" }
        if ($FullMainlineAllowResetAheadOfOrigin) { $alignArgs += "-AllowResetAheadOfOrigin" }
        $alignStash = $FullMainlineAllowStash -or $AllowStashBeforePull -or $AllowUnexpectedDirty
        if ($alignStash) { $alignArgs += "-AllowStash" }
        $alignExit = Invoke-FullMainlineAlignWithAutoCheckpoint -Root $WorkRoot -AlignArgs $alignArgs
        if ($alignExit -ne 0) {
            Write-Error "ao-resume: FullMainlineParity git align failed (exit $alignExit). Fix dirty tree or pass -FullMainlineAllowStash / -AllowUnexpectedDirty."
            exit $alignExit
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

# --- Claude Code user-level alignment (auto-merge; idempotent, non-blocking) ---
# CONTRACT: invoke sync-claude-userlevel.ps1 -Mode merge
# -Mode merge is a superset of -Mode verify: auto-fixes governed keys AND detects drift.
# Overwrites only governed keys (hooks/deny/additionalDirs/theme), PRESERVES permissions.allow.
# normalizer auto-fixes PS 5.1 1-element-array bug — no manual patching needed.
$claudeUserlevelSync = Join-Path $WorkRoot "scripts\sync-claude-userlevel.ps1"
if (Test-Path -LiteralPath $claudeUserlevelSync) {
    Write-Host ""
    Write-Host "== AO-RESUME: Claude user-level sync (auto-merge) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $claudeUserlevelSync -Mode merge
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: sync-claude-userlevel -Mode merge returned non-zero; hooks/settings may be stale." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- MCP config sync (auto-regenerate from SSOT; idempotent, non-blocking) ---
# Regenerates .mcp.json / .cursor/mcp.json / Codex / Gemini from mcp/registry.template.json.
$mcpSyncScript = Join-Path $WorkRoot "scripts\sync-mcp-config.ps1"
if (Test-Path -LiteralPath $mcpSyncScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: MCP config sync (auto) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $mcpSyncScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: sync-mcp-config returned non-zero; MCP settings may be stale." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- Cross-machine memory import (auto; non-blocking) ---
# Imports MEMORY.md from Desktop\AO-SYNC-*\ if a newer version exists.
# Silent no-op when no AO-SYNC folder is present (normal for primary/laptop machine).
$importMemScript = Join-Path $WorkRoot "scripts\import-cross-machine-memory.ps1"
if (Test-Path -LiteralPath $importMemScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: cross-machine memory import (auto) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $importMemScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: import-cross-machine-memory returned non-zero." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- Backup health snapshot (warn-only; AO-RESUME companion report) ---
$backupHealthScript = Join-Path $WorkRoot "scripts\check-backup-health.ps1"
if (Test-Path -LiteralPath $backupHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: backup health snapshot (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupHealthScript -WorkRoot $WorkRoot
    $backupExit = $LASTEXITCODE
    if ($backupExit -ne 0) {
        Write-Host "WARN: backup health snapshot returned non-zero (see agency-os/reports/status/backup-health-LATEST.md)." -ForegroundColor Yellow
        Write-Host "      AO-RESUME continues because this check is warn-only." -ForegroundColor Yellow
        Write-Host ""
    }
    # Warn-only: prevent poisoning AO-RESUME success path.
    $global:LASTEXITCODE = 0
}

# Fetch external signals (Telegram ops inbox + Slack) since last AO-CLOSE — non-blocking.
# Pass -From explicitly so the gap window is always (last AO-CLOSE → now), not a stale fallback.
$fetchSignalsScript = Join-Path $WorkRoot "scripts\fetch-external-signals.ps1"
if (Test-Path -LiteralPath $fetchSignalsScript) {
    Write-Host "== AO-RESUME: fetch external signals (Telegram + Slack) ==" -ForegroundColor Cyan
    $aoStateDir     = Join-Path $WorkRoot "agency-os\.agency-state"
    $closeStampPath = Join-Path $aoStateDir "ao-close-last.txt"
    $fromArgs = @()
    if (Test-Path -LiteralPath $closeStampPath) {
        $closeTs = (Get-Content -LiteralPath $closeStampPath -Raw -Encoding UTF8).Trim()
        if ($closeTs) {
            $fromArgs = @("-From", $closeTs)
            Write-Host ("   gap-start: {0} (ao-close-last.txt)" -f $closeTs) -ForegroundColor DarkGray

            # Health check: detect "missed AO-CLOSE" by scanning for commit dates that have NO
            # corresponding daily file. This is the definitive signal (a day with real work but
            # no scaffold = AO-CLOSE never ran). Filters out [claude] checkpoint commits so a
            # day with only auto-checkpoint activity doesn't false-fire.
            # Print the exact backfill command so the operator can paste-and-run.
            try {
                $stampUtc = [DateTime]::Parse($closeTs, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
                Push-Location $WorkRoot
                try {
                    # Get commit dates since stamp, EXCLUDING auto-checkpoint commits (those are not real work).
                    $rawLog = git log --since="$($stampUtc.ToString('o'))" --pretty=format:"%cd|%s" --date=format:"%Y-%m-%d" 2>$null
                } finally {
                    Pop-Location
                }
                $realCommitDates = @(
                    $rawLog |
                        Where-Object { $_ -and ($_ -notmatch '\[claude\]\s+checkpoint') } |
                        ForEach-Object { ($_ -split '\|', 2)[0] } |
                        Sort-Object -Unique
                )
                $missedDates = @(
                    $realCommitDates | Where-Object {
                        -not (Test-Path -LiteralPath (Join-Path $WorkRoot "agency-os\memory\daily\$_.md"))
                    }
                )
                if ($missedDates.Count -gt 0) {
                    Write-Host ""
                    Write-Host "  WARN: AO-CLOSE may have been missed on these date(s) — daily file(s) absent:" -ForegroundColor Yellow
                    foreach ($d in $missedDates) {
                        Write-Host ("        - daily/{0}.md  (real commits exist but no scaffold)" -f $d) -ForegroundColor Yellow
                    }
                    Write-Host "  RECOVERY (copy-paste exactly):" -ForegroundColor Cyan
                    foreach ($d in $missedDates) {
                        Write-Host ("    powershell -File scripts/backfill-missed-daily.ps1 -Date {0}" -f $d) -ForegroundColor White
                    }
                    Write-Host ""
                }
            } catch {
                # Silent: health check must never break AO-RESUME.
            }
        }
    } else {
        Write-Host "   WARN: ao-close-last.txt missing — signals will use 24h fallback (run AO-CLOSE to fix)" -ForegroundColor Yellow
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $fetchSignalsScript -WorkRoot $WorkRoot @fromArgs
    $global:LASTEXITCODE = 0
    # Freshness gate: if digest is >10 min old after the fetch, the API calls likely failed.
    $digestPath = Join-Path $aoStateDir "external-signals-digest.json"
    if (Test-Path -LiteralPath $digestPath) {
        try {
            $dj     = Get-Content -LiteralPath $digestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $genUtc = [DateTime]::Parse($dj.generated_utc, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
            $ageMin = [int]([DateTime]::UtcNow - $genUtc).TotalMinutes
            if ($ageMin -gt 10) {
                Write-Host ("   SIGNALS-STALE: digest is {0} min old — Telegram/Slack fetch likely failed; check vault credentials" -f $ageMin) -ForegroundColor Yellow
            } else {
                $src = if ($dj.gap_window) { $dj.gap_window.source } else { "unknown" }
                Write-Host ("   signals-fresh: digest {0} min old, source={1}, fetch_status={2}" -f $ageMin, $src, $dj.fetch_status) -ForegroundColor Green
            }
        } catch {
            Write-Host "   WARN: could not read digest for freshness check" -ForegroundColor Yellow
        }
    }
}

# Cloudflare security posture check (warn-only) — bot fight mode + WAF rules.
$cfSecScript = Join-Path $WorkRoot "scripts\check-cloudflare-security.ps1"
if (Test-Path -LiteralPath $cfSecScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: Cloudflare security check (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cfSecScript -WorkRoot $WorkRoot
    $global:LASTEXITCODE = 0
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

# ---------- VPS reboot-required mechanical detection ----------
# Scans the existing external-signals-digest.json for Netdata "post_update_reboot_status"
# alerts mentioning a known VPS host (EU/SG). Emits a hard-to-ignore block at the END of
# AO-RESUME output so the hook's log_tail (last 48 lines) captures it and Claude reads
# it from ao-resume-hook-last.json. Defense in depth: AGENTS.md text rule + this
# mechanical detector — do not rely on LLM attention alone.
$savedEAPReboot = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $rebootHits = @()
    $rebootDigestPath = Join-Path $WorkRoot "agency-os\.agency-state\external-signals-digest.json"
    if (Test-Path -LiteralPath $rebootDigestPath) {
        $rebootDigestRaw = Get-Content -LiteralPath $rebootDigestPath -Raw -Encoding UTF8
        # Coarse string scan first — only parse JSON if pattern is present in raw bytes.
        if ($rebootDigestRaw -match 'post_update_reboot|requires reboot|needs reboot|System restart required') {
            try {
                $rebootDj = $rebootDigestRaw | ConvertFrom-Json
                $rebootCandidateMsgs = New-Object System.Collections.Generic.List[object]
                # Slack: signals.slack.channels.<name>.messages[]
                if ($rebootDj.PSObject.Properties.Name -contains 'slack' -and `
                    $rebootDj.slack -and `
                    $rebootDj.slack.PSObject.Properties.Name -contains 'channels' -and `
                    $rebootDj.slack.channels) {
                    foreach ($chProp in $rebootDj.slack.channels.PSObject.Properties) {
                        $ch = $chProp.Value
                        if ($ch -and $ch.PSObject.Properties.Name -contains 'messages' -and $ch.messages) {
                            foreach ($m in $ch.messages) {
                                $rebootCandidateMsgs.Add([PSCustomObject]@{ src = ("slack/" + $chProp.Name); msg = $m }) | Out-Null
                            }
                        }
                    }
                }
                # Telegram: signals.telegram.messages[]
                if ($rebootDj.PSObject.Properties.Name -contains 'telegram' -and `
                    $rebootDj.telegram -and `
                    $rebootDj.telegram.PSObject.Properties.Name -contains 'messages' -and `
                    $rebootDj.telegram.messages) {
                    foreach ($m in $rebootDj.telegram.messages) {
                        $rebootCandidateMsgs.Add([PSCustomObject]@{ src = "telegram"; msg = $m }) | Out-Null
                    }
                }
                foreach ($cand in $rebootCandidateMsgs) {
                    $m = $cand.msg
                    if (-not ($m.PSObject.Properties.Name -contains 'text')) { continue }
                    $msgText = [string]$m.text
                    if ($msgText -match 'post_update_reboot|requires reboot|needs reboot|System restart required') {
                        $hitHost = $null
                        if ($msgText -match 'awarewave-eu-hel1|hel1-cpx32|204\.168\.175\.41') {
                            $hitHost = 'EU (awarewave-eu-hel1-cpx32 / 204.168.175.41)'
                        } elseif ($msgText -match 'wordpress-ubuntu-4gb-sin|sin-1|5\.223\.93\.113') {
                            $hitHost = 'SG (wordpress-ubuntu-4gb-sin-1 / 5.223.93.113)'
                        }
                        if ($hitHost) {
                            $msgDate = if ($m.PSObject.Properties.Name -contains 'date') { [string]$m.date } else { '?' }
                            $rebootHits += [PSCustomObject]@{
                                host   = $hitHost
                                text   = $msgText
                                date   = $msgDate
                                source = $cand.src
                            }
                        }
                    }
                }
            } catch {
                # JSON parse failure — silent; raw-scan match without parsable JSON is unusual but non-fatal.
            }
        }
    }
    if (@($rebootHits).Count -gt 0) {
        # Dedupe by host (one host may emit multiple matching messages).
        $rebootByHost = @{}
        foreach ($h in $rebootHits) {
            if (-not $rebootByHost.ContainsKey($h.host)) { $rebootByHost[$h.host] = $h }
        }
        Write-Host ""
        Write-Host "==================================================================" -ForegroundColor Red
        Write-Host "WARN VPS REBOOT REQUIRED -- handle this turn, do not defer" -ForegroundColor Red
        Write-Host "==================================================================" -ForegroundColor Red
        foreach ($key in $rebootByHost.Keys) {
            $h = $rebootByHost[$key]
            $slug = if ($h.host -like 'EU*') { 'eu-reboot' } else { 'sg-reboot' }
            Write-Host ("  host    : {0}" -f $h.host) -ForegroundColor Yellow
            Write-Host ("  signal  : {0} @ {1}" -f $h.source, $h.date) -ForegroundColor Yellow
            Write-Host ("  action  : run /{0} (auto-runs pre-flight read-only; wait for go-ahead to reboot)" -f $slug) -ForegroundColor Cyan
            Write-Host ""
        }
        Write-Host "Claude: surface this in your AO-RESUME 7-segment output immediately, do not bury it." -ForegroundColor Red
        Write-Host "==================================================================" -ForegroundColor Red
    }
} catch {
    # Top-level catch — never break AO-RESUME on detection bugs.
}
$ErrorActionPreference = $savedEAPReboot
# ---------- end VPS reboot detection ----------

$nowStamp = (Get-Date).ToUniversalTime().ToString("o")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($stampPath, $nowStamp + [Environment]::NewLine, $utf8NoBom)
Write-Host ""
Write-Host ("AO-RESUME stamp updated: {0}" -f $nowStamp) -ForegroundColor DarkGray

exit 0
