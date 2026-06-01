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

# CP950 protection for ssh/git stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

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

function Invoke-NonFastForwardRecovery {
    # Recovers from a rejected `git push` caused by the remote being ahead (non-fast-forward).
    # Typical scenario: this machine created a checkpoint commit (ahead=1) while another machine
    # pushed N commits in the interim → push rejected → run git pull --rebase to merge histories.
    #
    # Returns:
    #   0        = fully recovered (rebased, pushed, align-retried successfully)
    #  -1        = behindCount=0, not a NFF issue; caller should handle original push error
    #  other >0  = recovery failed; caller should surface the error
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string[]]$AlignArgs
    )

    # 1. Determine if remote is ahead (non-fast-forward case).
    $behindCount = 0
    try {
        $bStr = (& git -C $Root rev-list --count "HEAD..origin/main" 2>$null | Select-Object -Last 1)
        if ($bStr -match '^\s*(\d+)\s*$') { $behindCount = [int]$Matches[1] }
    } catch { }
    if ($behindCount -eq 0) { return -1 }  # Not NFF; caller uses original error path

    Write-Host ("== AO-RESUME: push rejected (non-fast-forward) — remote ahead by {0}; running git pull --rebase origin main ==" -f $behindCount) -ForegroundColor Yellow

    # 2. Pull --rebase: replay our local checkpoint commits on top of the remote state.
    $savedEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & git -C $Root pull --rebase origin main 2>&1 | Out-Host
    $pullExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    $ErrorActionPreference = $savedEAP

    if ($pullExit -ne 0) {
        # 3. Rebase stopped. Check what kind of failure this is.
        $conflicted = @(& git -C $Root diff --name-only --diff-filter=U 2>$null |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

        if ($conflicted.Count -eq 0) {
            # No conflict markers: rebase failed for a non-conflict reason (index.lock, hook failure,
            # untracked-file overwrite, git internal error, etc.). Do NOT try to continue — abort cleanly.
            Write-Host "AO-RESUME: pull --rebase failed with no conflict markers (git internal error?). Aborting rebase." -ForegroundColor Red
            Write-Host "  Re-run AO-RESUME after verifying no stale .git/index.lock or pre-rebase hook errors." -ForegroundColor Yellow
            $savedEAP2 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            & git -C $Root rebase --abort 2>&1 | Out-Null
            $ErrorActionPreference = $savedEAP2
            return $pullExit
        }

        $nonLatest = @($conflicted | Where-Object { $_ -notmatch '-LATEST\.(md|json|txt)$' })
        if ($nonLatest.Count -gt 0) {
            # Conflict in real code/docs — cannot auto-resolve; require human decision.
            Write-Host "AO-RESUME: pull --rebase conflict in non-LATEST files — cannot auto-resolve. Aborting rebase." -ForegroundColor Red
            $nonLatest | ForEach-Object { Write-Host ("  conflict: {0}" -f $_) -ForegroundColor Red }
            Write-Host "  Fix: resolve conflicts manually, git add, git rebase --continue, then re-run AO-RESUME." -ForegroundColor Yellow
            $savedEAP2 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            & git -C $Root rebase --abort 2>&1 | Out-Null
            $ErrorActionPreference = $savedEAP2
            return 1
        }

        # 4. All conflicts are auto-generated LATEST files — safe to take our local checkpoint.
        #    Rebase semantics: --theirs = the commit being replayed (our checkpoint). --ours = upstream.
        Write-Host ("AO-RESUME: auto-resolving {0} LATEST-file conflict(s) with local checkpoint (--theirs)..." -f $conflicted.Count) -ForegroundColor Yellow
        $savedEAP3 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        $resolveOk = $true
        foreach ($cf in $conflicted) {
            Write-Host ("  auto-resolve: {0}" -f $cf) -ForegroundColor DarkYellow
            & git -C $Root checkout --theirs -- $cf 2>&1 | Out-Null
            $checkoutExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            if ($checkoutExit -ne 0) {
                # checkout --theirs fails on delete/modify conflicts; treat as unresolvable.
                Write-Host ("  ERROR: git checkout --theirs failed for '{0}' (delete/modify conflict?). Aborting." -f $cf) -ForegroundColor Red
                $resolveOk = $false
                break
            }
            & git -C $Root add -- $cf 2>&1 | Out-Null
            $addExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            if ($addExit -ne 0) {
                Write-Host ("  ERROR: git add failed for '{0}'. Aborting." -f $cf) -ForegroundColor Red
                $resolveOk = $false
                break
            }
        }
        $ErrorActionPreference = $savedEAP3

        if (-not $resolveOk) {
            $savedEAP4 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            & git -C $Root rebase --abort 2>&1 | Out-Null
            $ErrorActionPreference = $savedEAP4
            return 1
        }

        # 5. Force non-interactive editor so `rebase --continue` never hangs waiting for vim/notepad.
        #    GIT_EDITOR=true: 'true' exits immediately with 0 → git accepts the existing commit message.
        $savedEditor = $env:GIT_EDITOR; $env:GIT_EDITOR = 'true'
        $savedSeqEditor = $env:GIT_SEQUENCE_EDITOR; $env:GIT_SEQUENCE_EDITOR = 'true'
        $savedEAP5 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        & git -C $Root rebase --continue 2>&1 | Out-Host
        $pullExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
        $ErrorActionPreference = $savedEAP5
        $env:GIT_EDITOR = $savedEditor
        $env:GIT_SEQUENCE_EDITOR = $savedSeqEditor

        if ($pullExit -ne 0) {
            Write-Host ("AO-RESUME: rebase --continue failed after auto-resolve (exit {0}). Aborting." -f $pullExit) -ForegroundColor Red
            $savedEAP6 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            & git -C $Root rebase --abort 2>&1 | Out-Null
            $ErrorActionPreference = $savedEAP6
            return $pullExit
        }
    }

    # 6. Rebase succeeded. Push the rebased commits.
    Write-Host "== AO-RESUME: pull --rebase succeeded; pushing... ==" -ForegroundColor Cyan
    $savedEAP7 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & git -C $Root push 2>&1 | Out-Host
    $pushExit2 = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    $ErrorActionPreference = $savedEAP7
    if ($pushExit2 -ne 0) {
        Write-Host ("AO-RESUME: push failed after pull --rebase (exit {0}). Fix auth/network then re-run AO-RESUME." -f $pushExit2) -ForegroundColor Yellow
        return $pushExit2
    }

    # 7. Push succeeded — retry git-align (aheadMain is now 0 after rebase+push; reset --hard works).
    Write-Host "== AO-RESUME: push succeeded; retrying git-align... ==" -ForegroundColor Cyan
    & powershell.exe @AlignArgs | Out-Host
    return $(if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE })
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
                # Local Continue: git push writes progress / "To <url>" to stderr by design.
                # With $ErrorActionPreference = "Stop" + `2>&1`, those stderr lines are raised as
                # NativeCommandError and abort the script before $LASTEXITCODE is checked. Use the
                # same save/restore pattern as the `$savedEAPReboot` VPS reboot block around L590
                # so the outer strict policy is preserved while git push's normal stderr is tolerated.
                # Real fail is still caught via $LASTEXITCODE != 0.
                $savedEAPPush1 = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                try {
                    & git push 2>&1 | Out-Host
                    $pushExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
                } finally { $ErrorActionPreference = $savedEAPPush1 }
            } finally { Pop-Location }
            if ($pushExit -ne 0) {
                $recoveryExit = Invoke-NonFastForwardRecovery -Root $Root -AlignArgs $AlignArgs
                if ($recoveryExit -ne -1) { return $recoveryExit }
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
            # Local Continue: see L125 above for full rationale (git push stderr vs strict mode).
            $savedEAPPush2 = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                & git push 2>&1 | Out-Host
                $pushExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            } finally { $ErrorActionPreference = $savedEAPPush2 }
            if ($pushExit -ne 0) {
                $recoveryExit = Invoke-NonFastForwardRecovery -Root $Root -AlignArgs $AlignArgs
                if ($recoveryExit -ne -1) { return $recoveryExit }
                Write-Host "AO-RESUME: git push failed (exit $pushExit). Fix auth/network/upstream then re-run AO-RESUME." -ForegroundColor Yellow
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

# --- MCP config sync (auto-regenerate from SSOT; idempotent, non-blocking) ---
# Regenerates .mcp.json / .cursor/mcp.json / Codex / Gemini from mcp/registry.template.json.
# MUST run BEFORE sync-claude-userlevel merge: sync-mcp-config writes the full server list
# back into .claude/mcp.json (which via junction = ~/.claude/mcp.json), overwriting any prior
# normalization. Running merge AFTER ensures ~/.claude/mcp.json ends at {} (SSOT) before verify.
# Root cause fix (2026-06-01): ordering bug — sync-mcp-config ran after merge, writing full list
# back to ~/.claude/mcp.json → sync verify detected drift → H2 gate HARD fail → ao-resume abort.
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

# --- Claude Code user-level alignment (BEFORE preflight; idempotent, non-blocking) ---
# CONTRACT: invoke sync-claude-userlevel.ps1 -Mode merge
# MUST run AFTER sync-mcp-config (which may write to .claude/mcp.json via junction) and
# BEFORE check-three-way-sync / verify-build-gates because check-claude-sync.ps1 H2 calls
# `sync-claude-userlevel -Mode verify`. Running merge last ensures ~/.claude/mcp.json = {}
# (SSOT) before verify, regardless of what sync-mcp-config wrote.
# Class A fix (2026-05-29): merge must run before verify (not after).
# Ordering fix (2026-06-01): merge must also run after sync-mcp-config (not before).
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

# --- VPS auto-reboot health snapshot (warn-only; surfaces B-Minimal drift in EVERY AO-RESUME) ---
# Rationale: operator should never need to remember `/auto-reboot-status` slash command.
# This script writes agency-os/reports/status/auto-reboot-LATEST.md, which Claude reads at AO-RESUME
# (same pattern as backup-health-LATEST.md + cf-security-LATEST.md). 30-year zero-effort visibility.
$autoRebootHealthScript = Join-Path $WorkRoot "scripts\check-vps-auto-reboot-health.ps1"
if (Test-Path -LiteralPath $autoRebootHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: VPS auto-reboot health snapshot (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $autoRebootHealthScript -WorkRoot $WorkRoot
    $arExit = $LASTEXITCODE
    if ($arExit -ne 0) {
        Write-Host "WARN: VPS auto-reboot health snapshot returned non-zero (see agency-os/reports/status/auto-reboot-LATEST.md)." -ForegroundColor Yellow
        Write-Host "      AO-RESUME continues because this check is warn-only." -ForegroundColor Yellow
        Write-Host ""
    }
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
        # Null-guard: WriteAllText is non-atomic on Windows (truncate-then-write). A concurrent
        # reader hitting the ~5ms window between truncate and write would otherwise get $null,
        # then .Trim() throws under StrictMode → terminates AO-RESUME at this line.
        $closeRaw = Get-Content -LiteralPath $closeStampPath -Raw -Encoding UTF8
        $closeTs = if ($closeRaw) { $closeRaw.Trim() } else { "" }
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
                    # CP950 protection: %s contains commit subjects which may include CJK — capture under
                    # forced UTF-8 console to prevent mojibake + newline-eating (exact bug class that bit
                    # backfill-missed-daily.ps1 2026-05-22).
                    $rawLog = Invoke-WithUtf8Console { git log --since="$($stampUtc.ToString('o'))" --pretty=format:"%cd|%s" --date=format:"%Y-%m-%d" 2>$null }
                } finally {
                    Pop-Location
                }
                $realCommitDates = @(
                    $rawLog |
                        Where-Object { $_ -and ($_ -notmatch '\[(claude|cursor|codex)\]\s+checkpoint') } |
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
                # Health check must never break AO-RESUME (degrade gracefully), but leave a
                # forensic trail so the operator can diagnose if the check itself stops working.
                # Common triggers: git lock, corrupted index, stamp file with unparseable timestamp.
                Write-Host ("   (health check skipped: {0})" -f $_.Exception.Message) -ForegroundColor DarkGray
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
# AO-RESUME output so the hook's log_tail (last 200 lines, see ao-resume-on-prompt.ps1)
# captures it and Claude reads it from ao-resume-hook-last.json. Defense in depth:
# AGENTS.md text rule + this mechanical detector + steps_summary structured field —
# do not rely on LLM attention alone.
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
                # ops_inbox_commands: signals.ops_inbox_commands.messages[] (renamed from telegram 2026-05-28)
                if ($rebootDj.PSObject.Properties.Name -contains 'ops_inbox_commands' -and `
                    $rebootDj.ops_inbox_commands -and `
                    $rebootDj.ops_inbox_commands.PSObject.Properties.Name -contains 'messages' -and `
                    $rebootDj.ops_inbox_commands.messages) {
                    foreach ($m in $rebootDj.ops_inbox_commands.messages) {
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

# --- WORKLOG excerpt since last AO-CLOSE ---
# Writes .agency-state/worklog-excerpt.md so Claude reads the bounded gap window
# instead of an arbitrary last-30-lines tail. WORKLOG is descending (newest first).
Write-Host ""
Write-Host "== AO-RESUME: WORKLOG excerpt (since last AO-CLOSE) ==" -ForegroundColor Cyan
$worklogSrcPath    = Join-Path $WorkRoot "agency-os\WORKLOG.md"
$worklogExcerptPath = Join-Path $stateDir "worklog-excerpt.md"
$wlUtf8NoBom       = New-Object System.Text.UTF8Encoding $false
$maxWlLines        = 300
if (Test-Path -LiteralPath $worklogSrcPath) {
    # Null-guard: Get-Content returns $null on 0-byte file; $null.Count throws under StrictMode.
    $wlRaw   = Get-Content -LiteralPath $worklogSrcPath -Encoding UTF8
    $wlLines = if ($wlRaw) { @($wlRaw) } else { @() }
    $excerptHeader = ""
    $excerptBody   = ""
    $closeStampForWl = Join-Path $stateDir "ao-close-last.txt"
    if (Test-Path -LiteralPath $closeStampForWl) {
        $wlParsedOk = $false
        $closeDateForWl = ""
        try {
            # Null-guard: non-atomic WriteAllText can yield empty read in a ~5ms race window (same pattern as L442-443).
            $rawCloseForWl  = Get-Content -LiteralPath $closeStampForWl -Raw -Encoding UTF8
            $rawCloseForWl  = if ($rawCloseForWl) { $rawCloseForWl.Trim() } else { "" }
            $closeUtcForWl  = [DateTime]::Parse($rawCloseForWl, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
            $closeDateForWl = $closeUtcForWl.ToLocalTime().ToString("yyyy-MM-dd")
            $wlParsedOk     = $true
        } catch {
            Write-Host ("   (WORKLOG excerpt: close stamp parse skipped: {0})" -f $_.Exception.Message) -ForegroundColor DarkGray
        }
        if ($wlParsedOk) {
            # WORKLOG descending: scan for first section >= close_date (start of in-range block),
            # then stop at first section < close_date (end boundary).
            $firstInRangeIdx = -1
            $endBoundaryIdx  = $wlLines.Count
            for ($wi = 0; $wi -lt $wlLines.Count; $wi++) {
                if ($wlLines[$wi] -match '^## (\d{4}-\d{2}-\d{2})') {
                    $sDate = $Matches[1]
                    if ([string]::Compare($sDate, $closeDateForWl, $false) -ge 0) {
                        if ($firstInRangeIdx -lt 0) { $firstInRangeIdx = $wi }
                    } else {
                        $endBoundaryIdx = $wi
                        break
                    }
                }
            }
            if ($firstInRangeIdx -ge 0) {
                $wlSlice = $wlLines[$firstInRangeIdx..($endBoundaryIdx - 1)]
                if ($wlSlice.Count -gt $maxWlLines) {
                    $wlSlice = @() + $wlSlice[0..($maxWlLines - 1)] + @("", "...[capped at $maxWlLines lines -- older entries omitted]")
                }
                $excerptHeader = "# WORKLOG excerpt -- gap since AO-CLOSE $closeDateForWl (CST)"
                $excerptBody   = $wlSlice -join "`n"
                Write-Host ("   WORKLOG excerpt: {0} lines (sections >= {1})" -f $wlSlice.Count, $closeDateForWl) -ForegroundColor DarkGray
            } else {
                $excerptHeader = "# WORKLOG excerpt -- fallback: last 30 lines (no section >= $closeDateForWl found)"
                $excerptBody   = ($wlLines | Select-Object -Last 30) -join "`n"
                Write-Host "   WORKLOG excerpt: no section >= $closeDateForWl; fallback last 30 lines" -ForegroundColor Yellow
            }
        } else {
            $excerptHeader = "# WORKLOG excerpt -- fallback: last 30 lines (close stamp parse error)"
            $excerptBody   = ($wlLines | Select-Object -Last 30) -join "`n"
            Write-Host "   WORKLOG excerpt: close stamp parse error; fallback last 30 lines" -ForegroundColor Yellow
        }
    } else {
        $excerptHeader = "# WORKLOG excerpt -- fallback: last 30 lines (ao-close-last.txt missing)"
        $excerptBody   = ($wlLines | Select-Object -Last 30) -join "`n"
        Write-Host "   WORKLOG excerpt: ao-close-last.txt missing; fallback last 30 lines" -ForegroundColor Yellow
    }
    if ($excerptHeader) {
        # Warn-only: a transient disk/lock error must not abort the AO-RESUME stamp write (L749-751).
        try {
            [System.IO.File]::WriteAllText($worklogExcerptPath, ($excerptHeader + "`n`n" + $excerptBody + "`n"), $wlUtf8NoBom)
        } catch {
            Write-Host ("   WARN: WORKLOG excerpt write failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   WORKLOG excerpt: WORKLOG.md not found at $worklogSrcPath" -ForegroundColor Yellow
}
# --- end WORKLOG excerpt ---

$nowStamp = (Get-Date).ToUniversalTime().ToString("o")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($stampPath, $nowStamp + [Environment]::NewLine, $utf8NoBom)
Write-Host ""
Write-Host ("AO-RESUME stamp updated: {0}" -f $nowStamp) -ForegroundColor DarkGray

exit 0
