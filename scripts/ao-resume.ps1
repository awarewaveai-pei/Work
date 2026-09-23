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
    # 與 GitHub 主線對齊：`fetch` → `checkout main` → `reset --hard origin/main` →（**預設不切功能分支**；可選切回功能分支並 `merge origin/main`）。**不**與 Autopilot（`-SkipStrictEnvironmentAudit`）併用。關鍵字 **AO-RESUME** 由 `.claude/commands/ao-resume.md` 預設傳此旗標（Cursor 於 2026-08-26 退場）。
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
    [switch]$FullMainlineAllowResetAheadOfOrigin,
    # OPT-IN: write the AO-RESUME archive skeleton (reports/ao-resume/<stamp>.md) only when set.
    # The interactive hook (ao-resume-on-prompt.ps1) passes this ONLY for an explicit "AO-RESUME"
    # prompt, where the agent will produce + archive a real report (ao-resume.md Step 3). Non-
    # interactive runs (boot fallback, autopilot, new-session auto-refresh) omit it, so they never
    # leave orphan skeletons. Root cause: 2026-06-11 investigation (orphans 2026-06-08-1807 / 2026-06-10-1718).
    [switch]$WriteArchiveSkeleton
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

    # Cursor rules mirror check REMOVED 2026-08-26: Cursor is retired, and both
    # .cursor/rules (mirror) and agency-os/.cursor/rules (canonical) are deleted. The
    # check was already guarded by Test-Path on the sync script, so it would have
    # self-skipped -- removed outright rather than left as a dormant branch referring to
    # directories that no longer exist. The owner-spec Version check above still applies:
    # it governs .claude rules too, not just Cursor's.
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
        $bStr = (Invoke-WithUtf8Console { & git -C $Root rev-list --count "HEAD..origin/main" 2>$null } | Select-Object -Last 1)
        if ($bStr -match '^\s*(\d+)\s*$') { $behindCount = [int]$Matches[1] }
    } catch { }
    if ($behindCount -eq 0) { return -1 }  # Not NFF; caller uses original error path

    Write-Host ("== AO-RESUME: push rejected (non-fast-forward) — remote ahead by {0}; running git pull --rebase origin main ==" -f $behindCount) -ForegroundColor Yellow

    # 2. Pull --rebase: replay our local checkpoint commits on top of the remote state.
    $savedEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    Invoke-WithUtf8Console { & git -C $Root pull --rebase origin main 2>&1 } | Out-Host
    $pullExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    $ErrorActionPreference = $savedEAP

    if ($pullExit -ne 0) {
        # 3. Rebase stopped. Check what kind of failure this is.
        $conflicted = @(Invoke-WithUtf8Console { & git -C $Root diff --name-only --diff-filter=U 2>$null } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

        if ($conflicted.Count -eq 0) {
            # No conflict markers: rebase failed for a non-conflict reason (index.lock, hook failure,
            # untracked-file overwrite, git internal error, etc.). Do NOT try to continue — abort cleanly.
            Write-Host "AO-RESUME: pull --rebase failed with no conflict markers (git internal error?). Aborting rebase." -ForegroundColor Red
            Write-Host "  Re-run AO-RESUME after verifying no stale .git/index.lock or pre-rebase hook errors." -ForegroundColor Yellow
            $savedEAP2 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            Invoke-WithUtf8Console { & git -C $Root rebase --abort 2>&1 } | Out-Null
            $ErrorActionPreference = $savedEAP2
            return $pullExit
        }

        $nonLatest = @($conflicted | Where-Object { $_ -notmatch '-LATEST\.(md|json|txt)$' -and $_ -notmatch '(?:^|[/\\])agency-os[/\\]reports[/\\]' -and $_ -notmatch '(?:^|[/\\])agency-os[/\\]\.agency-state[/\\]' })
        if ($nonLatest.Count -gt 0) {
            # Conflict in real code/docs — cannot auto-resolve; require human decision.
            Write-Host "AO-RESUME: pull --rebase conflict in non-LATEST files — cannot auto-resolve. Aborting rebase." -ForegroundColor Red
            $nonLatest | ForEach-Object { Write-Host ("  conflict: {0}" -f $_) -ForegroundColor Red }
            Write-Host "  Fix: resolve conflicts manually, git add, git rebase --continue, then re-run AO-RESUME." -ForegroundColor Yellow
            $savedEAP2 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            Invoke-WithUtf8Console { & git -C $Root rebase --abort 2>&1 } | Out-Null
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
            Invoke-WithUtf8Console { & git -C $Root checkout --theirs -- $cf 2>&1 } | Out-Null
            $checkoutExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            if ($checkoutExit -ne 0) {
                # checkout --theirs fails on delete/modify conflicts; treat as unresolvable.
                Write-Host ("  ERROR: git checkout --theirs failed for '{0}' (delete/modify conflict?). Aborting." -f $cf) -ForegroundColor Red
                $resolveOk = $false
                break
            }
            Invoke-WithUtf8Console { & git -C $Root add -- $cf 2>&1 } | Out-Null
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
            Invoke-WithUtf8Console { & git -C $Root rebase --abort 2>&1 } | Out-Null
            $ErrorActionPreference = $savedEAP4
            return 1
        }

        # 5. Force non-interactive editor so `rebase --continue` never hangs waiting for vim/notepad.
        #    GIT_EDITOR=true: 'true' exits immediately with 0 → git accepts the existing commit message.
        $savedEditor = $env:GIT_EDITOR; $env:GIT_EDITOR = 'true'
        $savedSeqEditor = $env:GIT_SEQUENCE_EDITOR; $env:GIT_SEQUENCE_EDITOR = 'true'
        $savedEAP5 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        Invoke-WithUtf8Console { & git -C $Root rebase --continue 2>&1 } | Out-Host
        $pullExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
        $ErrorActionPreference = $savedEAP5
        $env:GIT_EDITOR = $savedEditor
        $env:GIT_SEQUENCE_EDITOR = $savedSeqEditor

        if ($pullExit -ne 0) {
            Write-Host ("AO-RESUME: rebase --continue failed after auto-resolve (exit {0}). Aborting." -f $pullExit) -ForegroundColor Red
            $savedEAP6 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            Invoke-WithUtf8Console { & git -C $Root rebase --abort 2>&1 } | Out-Null
            $ErrorActionPreference = $savedEAP6
            return $pullExit
        }
    }

    # 6. Rebase succeeded. Push the rebased commits.
    Write-Host "== AO-RESUME: pull --rebase succeeded; pushing... ==" -ForegroundColor Cyan
    $savedEAP7 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    Invoke-WithUtf8Console { & git -C $Root push 2>&1 } | Out-Host
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

# Renamed 2026-08-25 from Invoke-FullMainlineAlignWithAutoCheckpoint. There is no
# checkpoint any more: a dirty tree is stashed by git-align (-AllowStash, always passed)
# and restored in its finally. Keeping the old name would have left the codebase asserting
# a behaviour it no longer has, which is the same class of defect this whole change set is
# about. Historical references in WORKLOG/reports are left alone -- they describe what was
# true then.
function Invoke-FullMainlineAlignWithRetry {
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
        Invoke-WithUtf8Console { git -C $Root status --short 2>$null } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if ($statusShort.Count -eq 0) {
        # Clean tree but git-align still failed — branch is ahead of origin without a dirty worktree.
        # This happens when ao-close-last.txt was committed but not pushed (ao-close-last.txt is now
        # gitignored, but old checkpoints may have included it). Push and retry rather than propagating
        # a phantom exit-1 that would skip all downstream AO-RESUME steps.
        $aheadCount = 0
        try {
            $aStr = (Invoke-WithUtf8Console { & git -C $Root rev-list --count "origin/main..HEAD" 2>$null } | Select-Object -Last 1)
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
                    Invoke-WithUtf8Console { & git push 2>&1 } | Out-Host
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

    # REMOVED 2026-08-25: the auto-checkpoint retry that used to live here.
    # git-align is now always invoked with -AllowStash, so a dirty tree is parked in a
    # named stash and restored in git-align's finally rather than committed. That makes
    # this fallback both unnecessary and undesirable: reaching it would mean committing
    # the operator's in-progress work under a message that describes nothing, publishing
    # it to main, and doing so on a path where the align had ALREADY failed for some
    # other reason. Six documented harm classes came from exactly that habit
    # (agency-os/WORKLOG.md 2026-08-25).
    #
    # If align still fails with a dirty tree, that is a real condition the operator must
    # see, not something to commit our way out of.
    Write-Host "AO-RESUME: git align failed (exit $exit1) with a dirty working tree." -ForegroundColor Yellow
    Write-Host "           The tree is NOT committed automatically. Inspect with: git status" -ForegroundColor Yellow
    Write-Host "           If a stash was left behind, git-align prints its name and exits 3." -ForegroundColor Yellow
    return $exit1
}

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
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
    Show-AoResumeQuickFix -Step "default" -ExitCode $rulesConsistencyExit
    exit $rulesConsistencyExit
}

# --- Cross-machine memory import — runs BEFORE git-align (unconditional) ---
# Import reads Google Drive vault (all target files are gitignored); logically
# independent of git state. Must not be gated on git-align success.
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
            # EAP guard: update-index can emit stderr; under EAP=Stop + 2>&1 that throws
            # NativeCommandError — and this is try/FINALLY (no catch), so it would propagate
            # and abort AO-RESUME before git-align even runs.
            $savedEAPRefresh = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            try { Invoke-WithUtf8Console { & git update-index --really-refresh 2>&1 } | Out-Null }
            finally { $ErrorActionPreference = $savedEAPRefresh }
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
        # ALWAYS stash. git-align needs a clean tree; the only question is how it gets one.
        # Until 2026-08-25 the answer was "auto-commit everything", which is how unverified
        # work reached main and how uncommitted edits were swept into the repo. -AllowStash
        # now stashes under a unique name and restores it in git-align's finally (all exit
        # paths), reporting exit 3 if the restore conflicts. The flags below are kept because
        # they also control other dirty-tree behaviour upstream of this call.
        $null = $FullMainlineAllowStash -or $AllowStashBeforePull -or $AllowUnexpectedDirty
        $alignArgs += "-AllowStash"
        $alignExit = Invoke-FullMainlineAlignWithRetry -Root $WorkRoot -AlignArgs $alignArgs
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
# Regenerates .mcp.json / Codex / Copilot / Gemini from mcp/registry.template.json.
# (.cursor/mcp.json dropped 2026-08-28 -- Cursor retired 2026-08-26.)
# Ordering note (2026-06-01, SUPERSEDED 2026-08-25): this used to have to run BEFORE
# sync-claude-userlevel merge, because sync-mcp-config wrote the full server list into
# .claude/mcp.json (= ~/.claude/mcp.json via junction), undoing the normalization; merge running
# after was what kept the file at {} before the H2 verify gate. sync-mcp-config no longer writes
# that file at all (duplicate ownership removed), so this ordering is no longer load-bearing.
# sync-claude-userlevel.ps1 is now the ONLY writer of every governed user-level config
# (~/.claude/mcp.json, ~/.claude.json), per mcp/claude-userlevel/manifest.json. The ~/.cursor/mcp.json
# entry was removed 2026-08-28 with Cursor; note that %APPDATA%\Claude\claude_desktop_config.json
# -- which Claude DOES load, merged with the repo .mcp.json -- has never been in the manifest at all.
# sanitize-user-mcp-config.ps1 backs those files up and delegates here rather than rewriting them,
# so running it by hand can no longer reintroduce drift.
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
# MUST run BEFORE check-three-way-sync / verify-build-gates, because check-claude-sync.ps1 H2
# calls `sync-claude-userlevel -Mode verify`: merge has to land ~/.claude/mcp.json = {} (SSOT)
# before that verify reads it.
# Class A fix (2026-05-29): merge must run before verify (not after).
# Ordering fix (2026-06-01): merge also had to run AFTER sync-mcp-config, because that script
#   wrote ~/.claude/mcp.json itself and would leave the full registry there.
#   SUPERSEDED 2026-08-25: sync-mcp-config no longer touches that file at all -- duplicate
#   ownership of one file by two scripts was the bug (see the comment at its former write site).
#   Ordering between these two syncs is now free; only the before-verify constraint is load-bearing.
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

# --- Codex Claude-first bridge alignment (same source, no copied workflows) ---
# The generator writes only thin repo skill/native-agent bridges and removes
# verified legacy duplicates after backup. Source edits themselves are live,
# but new/renamed Claude assets need this deterministic discovery step.
$codexBridgeSync = Join-Path $WorkRoot "mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1"
$codexParityCheck = Join-Path $WorkRoot "mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1"
$codexHome = Join-Path $env:USERPROFILE ".codex"
if ((Test-Path -LiteralPath $codexBridgeSync) -and (Test-Path -LiteralPath $codexHome)) {
    Write-Host ""
    Write-Host "== AO-RESUME: Codex Claude-first bridge sync (auto) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $codexBridgeSync -WorkRoot $WorkRoot -Mode linked
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: Codex bridge sync returned non-zero; generated bridges may be stale." -ForegroundColor Yellow
    } elseif (Test-Path -LiteralPath $codexParityCheck) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $codexParityCheck -WorkRoot $WorkRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARN: Codex bridge parity check failed after sync; inspect the named checks above." -ForegroundColor Yellow
        }
    }
    $global:LASTEXITCODE = 0
}

Write-Host "== AO-RESUME: preflight auto-fix ==" -ForegroundColor Cyan

# Health gate exit code: populated if any health gate fails; ao-resume continues to generate ALL
# state files regardless so Claude always receives fresh data. Final exit uses this code so the
# hook correctly records failure (exit≠0) while state files are still fresh.
# Root cause fix (2026-06-01): health gates previously hard-exited, truncating state generation.
$healthGateExit = 0

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
    Write-Host ("ao-resume: preflight FAILED (exit {0}) — health issues noted; continuing to generate state files." -f $LASTEXITCODE) -ForegroundColor Red
    $healthGateExit = $LASTEXITCODE
} else {
    Write-Host "AO-RESUME preflight completed: repo is synced and ready." -ForegroundColor Green
}

$depsScript = Join-Path $WorkRoot "scripts\ensure-lobster-workflows-deps.ps1"
if (-not $SkipWorkflowsDeps -and (Test-Path -LiteralPath $depsScript)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $depsScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Show-AoResumeQuickFix -Step "workflows-deps" -ExitCode $LASTEXITCODE
        Write-Host ("ao-resume: workflows-deps FAILED (exit {0}) — continuing to generate state files." -f $LASTEXITCODE) -ForegroundColor Red
        if ($healthGateExit -eq 0) { $healthGateExit = $LASTEXITCODE }
    }
} elseif ($SkipWorkflowsDeps) {
    Write-Host "== AO-RESUME: -SkipWorkflowsDeps（略過 npm ci 檢查）==" -ForegroundColor DarkYellow
}

if ($script:StrictEnvAudit) {
    $auditScript = Join-Path $WorkRoot "scripts\machine-environment-audit.ps1"
    if (-not (Test-Path -LiteralPath $auditScript)) {
        Write-Host "ao-resume: machine-environment-audit missing at $auditScript — skipping strict audit." -ForegroundColor Yellow
        if ($healthGateExit -eq 0) { $healthGateExit = 1 }
    } else {
        Write-Host ""
        Write-Host "== AO-RESUME: 預設完整檢查（machine-environment-audit -FetchOrigin -Strict）==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $auditScript -WorkRoot $WorkRoot -FetchOrigin -Strict
        if ($LASTEXITCODE -ne 0) {
            Show-AoResumeQuickFix -Step "strict-audit" -ExitCode $LASTEXITCODE
            Write-Host ("ao-resume: machine-environment-audit FAILED (exit {0}) — health issues noted; generating state files." -f $LASTEXITCODE) -ForegroundColor Red
            if ($healthGateExit -eq 0) { $healthGateExit = $LASTEXITCODE }
        }
    }
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

# --- ClickHouse self-telemetry health (warn-only; catches the 4x-recurring EU flood class) ---
# Rationale: ClickHouse was "fixed" on 2026-04-20 / 04-29 / 07-05 / 08-15 and came back each
# time, because the first three fixes raised the memory ceiling or deleted accumulated rows
# instead of stopping the generators. Nobody saw the trend between incidents. This snapshot
# reports self-telemetry vs application data as a ratio, so the next flood is visible early
# and regardless of which table produces it. Writes reports/status/clickhouse-LATEST.md.
$clickhouseHealthScript = Join-Path $WorkRoot "scripts\check-clickhouse-health.ps1"
if (Test-Path -LiteralPath $clickhouseHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: ClickHouse self-telemetry snapshot (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $clickhouseHealthScript -WorkRoot $WorkRoot
    $chExit = $LASTEXITCODE
    if ($chExit -ne 0) {
        Write-Host "WARN: ClickHouse health snapshot returned non-zero (see agency-os/reports/status/clickhouse-LATEST.md)." -ForegroundColor Yellow
        Write-Host "      AO-RESUME continues because this check is warn-only." -ForegroundColor Yellow
        Write-Host ""
    }
    $global:LASTEXITCODE = 0
}

# --- Stranded align-stash detector (warn-only) ---
# Ships WITH the mechanism it watches, not after the first incident. git-align parks a dirty
# tree in a stash named git-align-main-aoresume-feature-<stamp> and restores it in its
# finally; if that restore ever conflicts it exits 3 and deliberately leaves the stash in
# place so nothing is lost. That is the right behaviour, but it means work can sit in a
# stash indefinitely if the operator does not act -- and an unread stash is indistinguishable
# from no stash at all. So: name them out loud at every AO-RESUME until they are gone.
# (Invariant I6: any mechanism that moves work out of the working tree must guarantee its
# return or fail loudly. This is the "fail loudly" half, made durable.)
Push-Location -LiteralPath $WorkRoot
try {
    $strandedStashes = @(
        Invoke-WithUtf8Console { & git stash list --format="%gd %gs" 2>$null } |
        Where-Object { $_ -like "*git-align-main-aoresume-feature-*" }
    )
} catch {
    $strandedStashes = @()
} finally { Pop-Location | Out-Null }
if ($strandedStashes.Count -gt 0) {
    Write-Host ""
    Write-Host ("== AO-RESUME: {0} align stash(es) still holding uncommitted work ==" -f $strandedStashes.Count) -ForegroundColor Yellow
    foreach ($st in $strandedStashes) { Write-Host ("   {0}" -f $st) -ForegroundColor Yellow }
    Write-Host "   Restore with: git stash pop <ref>   (resolve conflicts, then re-run AO-RESUME)" -ForegroundColor Yellow
    Write-Host ""
}
$global:LASTEXITCODE = 0

# --- CI health (warn-only; surfaces a gate that has quietly gone red) ---
# Rationale: nothing in this repo looked at GitHub Actions. Found 2026-08-25 while
# root-causing the fifth ClickHouse incident - `Trigger infra config guard` had failed on
# every push since 2026-08-15 (four red runs over ten days), and the commit that turned it
# red was the fix for the FOURTH ClickHouse incident. So the gate that existed to stop
# ClickHouse config regressions was itself off for the whole window in which the next
# ClickHouse incident developed, and no flow the operator runs would have mentioned it.
# Writes reports/status/ci-LATEST.md. Pattern: runbooks/ADD-PERIODIC-HEALTH-CHECK.md.
$ciHealthScript = Join-Path $WorkRoot "scripts\check-ci-health.ps1"
if (Test-Path -LiteralPath $ciHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: CI health snapshot (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ciHealthScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: CI health snapshot returned non-zero (see agency-os/reports/status/ci-LATEST.md)." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- Capacity health across ks-aw-01 / SG / EU (warn-only) ---
# Rationale: ks-aw-01 is now the 128 GB KS-6 sole production host for soulful + Chatwoot
# and the EU/SG stacks. This check is the early-warning control for whole-host pressure,
# so it has to run in a flow that happens anyway -- a slash command nobody remembers to
# type would leave the single-host risk unmanaged.
# Measures outcome AND mechanism per runbooks/ADD-PERIODIC-HEALTH-CHECK.md (2026-08-25
# addendum): MemAvailable and disk %, but also PSI stall time, OOM counters from two
# independent sources, swap, and container restarts -- because "percent used" alone is a
# bad memory detector in both directions. Writes reports/status/capacity-LATEST.md.
$capacityHealthScript = Join-Path $WorkRoot "scripts\check-capacity-health.ps1"
if (Test-Path -LiteralPath $capacityHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: capacity health snapshot (warn-only) ==" -ForegroundColor Cyan
    # Freshness is captured BEFORE the run so a crash can be told apart from a verdict.
    # The child exits 0/1/2 for PASS/WARN/FAIL, but an unhandled StrictMode throw ALSO exits
    # 1 -- so "one host unreachable" and "the check died and wrote nothing" were previously
    # the same yellow line. That mattered here more than elsewhere: this check is the agreed
    # capacity control for the sole production host, and its stale report reads
    # green.
    $capReport = Join-Path $WorkRoot ("agency-os" + [IO.Path]::DirectorySeparatorChar + "reports" + [IO.Path]::DirectorySeparatorChar + "status" + [IO.Path]::DirectorySeparatorChar + "capacity-LATEST.json")
    $capBefore = if (Test-Path -LiteralPath $capReport) { (Get-Item -LiteralPath $capReport).LastWriteTimeUtc } else { [datetime]::MinValue }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $capacityHealthScript -WorkRoot $WorkRoot
    $capExit = $LASTEXITCODE
    $capAfter = if (Test-Path -LiteralPath $capReport) { (Get-Item -LiteralPath $capReport).LastWriteTimeUtc } else { [datetime]::MinValue }
    if ($capAfter -le $capBefore) {
        Write-Host "FAIL: capacity check wrote NO report - the file on disk is STALE and its verdict means nothing." -ForegroundColor Red
        Write-Host "      Do not report a capacity verdict at AO-RESUME until this is fixed." -ForegroundColor Red
    } elseif ($capExit -ge 2) {
        Write-Host "FAIL: capacity check reports a RED condition (see agency-os/reports/status/capacity-LATEST.md)." -ForegroundColor Red
    } elseif ($capExit -eq 1) {
        Write-Host "WARN: capacity check reports drift or a blind spot (see agency-os/reports/status/capacity-LATEST.md)." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- site-watch watchdog (warn-only; the client-site monitor's own monitor) ---
# Rationale: site-watch (agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md) is silent when every
# client site is fine -- and exactly as silent when site-watch itself is dead. This check reads the
# mechanism (heartbeat stamps, per-target overdue runs, notifications owed > 3h) so a dead monitor
# surfaces here instead of looking like good news. Writes reports/status/site-watch-LATEST.md.
# Same stale-report guard as capacity: a crash must not leave an old verdict standing.
$siteWatchHealthScript = Join-Path $WorkRoot "scripts\check-site-watch-health.ps1"
if (Test-Path -LiteralPath $siteWatchHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: site-watch watchdog (warn-only) ==" -ForegroundColor Cyan
    $swReport = Join-Path $WorkRoot "agency-os\reports\status\site-watch-LATEST.json"
    $swBefore = if (Test-Path -LiteralPath $swReport) { (Get-Item -LiteralPath $swReport).LastWriteTimeUtc } else { [datetime]::MinValue }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $siteWatchHealthScript -WorkRoot $WorkRoot
    $swExit = $LASTEXITCODE
    $swAfter = if (Test-Path -LiteralPath $swReport) { (Get-Item -LiteralPath $swReport).LastWriteTimeUtc } else { [datetime]::MinValue }
    if ($swAfter -le $swBefore) {
        Write-Host "FAIL: site-watch watchdog wrote NO report - the file on disk is STALE; do not report its verdict." -ForegroundColor Red
    } elseif ($swExit -ge 2) {
        Write-Host "FAIL: site-watch watchdog reports RED (see agency-os/reports/status/site-watch-LATEST.md)." -ForegroundColor Red
    } elseif ($swExit -eq 1) {
        Write-Host "WARN: site-watch watchdog reports YELLOW or a blind spot (see agency-os/reports/status/site-watch-LATEST.md)." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}

# --- Claude routine output freshness (warn-only; surfaces silent routine failure at startup) ---
# Rationale: a cloud routine whose source drifts / auth lapses / gets disabled stops landing
# its report — and the operator should learn this at AO-RESUME (when they can act), not only
# buried in the AO-CLOSE health gate. Writes reports/status/routine-freshness-LATEST.md, which
# Claude reads at AO-RESUME §1 (same zero-effort pattern as backup-health / auto-reboot). The
# always-on Telegram leg (for when the operator does NOT boot) lives on the EU VPS.
$routineFreshScript = Join-Path $WorkRoot "scripts\check-routine-freshness.ps1"
if (Test-Path -LiteralPath $routineFreshScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: Claude routine output freshness (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $routineFreshScript -WorkRoot $WorkRoot
    $rfExit = $LASTEXITCODE
    if ($rfExit -ne 0) {
        Write-Host "WARN: a Claude routine report is stale/missing (see agency-os/reports/status/routine-freshness-LATEST.md)." -ForegroundColor Yellow
        Write-Host "      AO-RESUME continues because this check is warn-only." -ForegroundColor Yellow
        Write-Host ""
    }
    $global:LASTEXITCODE = 0
}

# --- staging 站三層對帳（warn-only；佈建漏出來的殘留要看得見）---
# Rationale: 佈建會在三個地方留東西（SG 檔案系統 / MariaDB / Supabase wp_sites），而在
# 2026-08-26 之前沒有任何拆除路徑，於是漂移到 7 目錄 / 13 資料庫 / 3 列都沒人知道。
# deprovision-staging.sh 補上拆除，這支補上「漏了要看得見」。12 小時內跑過就跳過 —— 這個
# 檢查要開十幾個 docker exec，每次 AO-RESUME 都重跑不划算，而漂移是以天計的（同 cf-security
# 的 mtime 節流作法）。
$stagingOrphanScript = Join-Path $WorkRoot "scripts\check-staging-orphans.ps1"
$stagingOrphanReport = Join-Path $WorkRoot "agency-os\reports\status\staging-orphans-LATEST.json"
if (Test-Path -LiteralPath $stagingOrphanScript) {
    $soFresh = $false
    if (Test-Path -LiteralPath $stagingOrphanReport) {
        $soAge = (Get-Date) - (Get-Item -LiteralPath $stagingOrphanReport).LastWriteTime
        if ($soAge.TotalHours -lt 12) { $soFresh = $true }
    }
    if ($soFresh) {
        Write-Host ""
        Write-Host "== AO-RESUME: staging orphan reconcile (skipped, report < 12h old) ==" -ForegroundColor DarkGray
    } else {
        Write-Host ""
        Write-Host "== AO-RESUME: staging orphan reconcile (warn-only) ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stagingOrphanScript -WorkRoot $WorkRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARN: staging 三層對帳有孤兒或盲點（見 agency-os/reports/status/staging-orphans-LATEST.md）。" -ForegroundColor Yellow
        }
        $global:LASTEXITCODE = 0
    }
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

# Application-layer smoke tests (warn-only) — n8n MCP + Repair Center health.
# Rationale: operator should never need to remember /smoke-test; results surface automatically.
# Writes agency-os/reports/status/smoke-LATEST.json; Claude reads it in AO-RESUME §1.
$smokeScript = Join-Path $WorkRoot "scripts\check-smoke-tests.ps1"
if (Test-Path -LiteralPath $smokeScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: smoke tests (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smokeScript -WorkRoot $WorkRoot
    $global:LASTEXITCODE = 0
}

# Monthly checks (warn-only) — run at most once per 30 days.
# Pattern identical to backup-health / auto-reboot / cloudflare blocks above.
$monthlyStamp = Join-Path $WorkRoot "agency-os\.agency-state\monthly-checks-last.txt"
$runMonthly = $false
if (-not (Test-Path -LiteralPath $monthlyStamp)) {
    $runMonthly = $true
} else {
    try {
        $lastRun = [DateTime]::Parse((Get-Content -LiteralPath $monthlyStamp -Raw -Encoding UTF8).Trim())
        if (([DateTime]::UtcNow - $lastRun).TotalDays -gt 30) { $runMonthly = $true }
    } catch { $runMonthly = $true }
}

if ($runMonthly) {
    Write-Host ""
    Write-Host "== AO-RESUME: monthly checks (warn-only, last run > 30d ago) ==" -ForegroundColor Cyan
    $monthlyResults = @{}

    # 1. Monthly system review (includes supabase-memory internally; do NOT call separately)
    $monthlyReview = Join-Path $WorkRoot "scripts\monthly-system-review.ps1"
    if (Test-Path -LiteralPath $monthlyReview) {
        Write-Host "  -> monthly-system-review..." -ForegroundColor DarkCyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $monthlyReview `
            -AgencyOsRoot (Join-Path $WorkRoot "agency-os") -NoAlert -ReportOnly
        $reviewExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $monthlyResults["system_review"] = if ($reviewExit -eq 0) { "PASS" } elseif ($reviewExit -eq 1) { "WARN" } else { "FAIL" }
        $global:LASTEXITCODE = 0
    } else { $monthlyResults["system_review"] = "SKIP" }

    # 2. Supabase memory check (SSH → EU VPS) — separate from monthly-system-review
    $supaMem = Join-Path $WorkRoot "scripts\check-supabase-memory-monthly.ps1"
    if (Test-Path -LiteralPath $supaMem) {
        Write-Host "  -> check-supabase-memory..." -ForegroundColor DarkCyan
        $supOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $supaMem `
            -AgencyOsRoot (Join-Path $WorkRoot "agency-os") 2>&1
        $supaExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $supaPercent = ($supOutput | Select-String 'RESULT_PERCENT=(.+)').Matches.Groups[1].Value
        $supaStatus  = if ($supaExit -eq 0) { "PASS" } elseif ($supaExit -eq 1) { "WARN" } else { "FAIL" }
        $monthlyResults["supabase_memory"] = if ($supaPercent) { "$supaStatus ($supaPercent%)" } else { $supaStatus }
        $global:LASTEXITCODE = 0
    } else { $monthlyResults["supabase_memory"] = "SKIP" }

    # 3. Governance docs drift check
    $govDrift = Join-Path $WorkRoot "scripts\check-governance-docs-drift.ps1"
    if (Test-Path -LiteralPath $govDrift) {
        Write-Host "  -> check-governance-docs-drift..." -ForegroundColor DarkCyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $govDrift -WorkRoot $WorkRoot
        $driftExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $monthlyResults["governance_drift"] = if ($driftExit -eq 0) { "PASS" } elseif ($driftExit -eq 1) { "WARN" } else { "FAIL" }
        $global:LASTEXITCODE = 0
    } else { $monthlyResults["governance_drift"] = "SKIP" }

    # 4. CF origin IP refresh (SSH to SG, warn-only)
    $cfRefresh = Join-Path $WorkRoot "scripts\refresh-cf-origin-ips.ps1"
    if (Test-Path -LiteralPath $cfRefresh) {
        Write-Host "  -> refresh-cf-origin-ips..." -ForegroundColor DarkCyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cfRefresh -WorkRoot $WorkRoot
        $cfRefreshExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $monthlyResults["cf_ip_refresh"] = if ($cfRefreshExit -eq 0) { "PASS" } else { "WARN" }
        $global:LASTEXITCODE = 0
    } else { $monthlyResults["cf_ip_refresh"] = "SKIP" }

    # 5. Change Impact Matrix drift check (2026-08-24 — generalizes the same gap that let
    #    TOOL_TRIGGER_MAP.md go 7 weeks stale: check every declared 主文件->impacted pair
    #    in docs/CHANGE_IMPACT_MATRIX.md for one-directional mtime drift, not just the 4
    #    docs check #3 above already covers.)
    $impactMatrixDrift = Join-Path $WorkRoot "scripts\check-change-impact-matrix-drift.ps1"
    if (Test-Path -LiteralPath $impactMatrixDrift) {
        Write-Host "  -> check-change-impact-matrix-drift..." -ForegroundColor DarkCyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $impactMatrixDrift -WorkRoot $WorkRoot
        $matrixDriftExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $monthlyResults["impact_matrix_drift"] = if ($matrixDriftExit -eq 0) { "PASS" } elseif ($matrixDriftExit -eq 1) { "WARN" } else { "FAIL" }
        $global:LASTEXITCODE = 0
    } else { $monthlyResults["impact_matrix_drift"] = "SKIP" }

    # Write consolidated monthly-LATEST.json to reports/status/ — single place to read.
    $monthlyStatusDir = Join-Path $WorkRoot "agency-os\reports\status"
    $null = New-Item -ItemType Directory -Force -Path $monthlyStatusDir
    $monthlyPayload = @{
        generated            = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        system_review        = $monthlyResults["system_review"]
        supabase_memory      = $monthlyResults["supabase_memory"]
        governance_drift     = $monthlyResults["governance_drift"]
        cf_ip_refresh        = $monthlyResults["cf_ip_refresh"]
        impact_matrix_drift  = $monthlyResults["impact_matrix_drift"]
    }
    $monthlyPayload | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $monthlyStatusDir "monthly-LATEST.json") -Encoding UTF8

    # --- Notifications: Slack + Telegram ---
    $allPass    = @($monthlyResults.Values | Where-Object { $_ -notlike "PASS*" -and $_ -notlike "SKIP*" }).Count -eq 0
    $overallEmoji = if ($allPass) { "✅" } else { "⚠️" }
    $overallWord  = if ($allPass) { "全部正常" } else { "有項目需注意" }
    $monthLabel   = (Get-Date).ToString("yyyy-MM")

    # Human-readable descriptions for each check
    $humanDesc = @{
        system_review        = "系統架構 / build gates / 程式碼品質"
        supabase_memory      = "EU 資料庫記憶體使用量"
        governance_drift     = "四份核心治理文件一致性"
        cf_ip_refresh        = "CF origin IP ranges on SG ipset"
        impact_matrix_drift  = "CHANGE_IMPACT_MATRIX 全部關係漂移"
    }

    # Build body lines (技術術語 + 人話)
    $lines = @()
    foreach ($key in @("system_review","supabase_memory","governance_drift","cf_ip_refresh","impact_matrix_drift")) {
        $val   = $monthlyResults[$key]
        $icon  = if ($val -like "PASS*") { "✅" } elseif ($val -like "WARN*") { "⚠️" } elseif ($val -like "FAIL*") { "❌" } else { "⏭" }
        $lines += "$icon $($humanDesc[$key]): $val"
    }
    $bodyText = $lines -join "`n"

    # Slack
    $notifyScript = Join-Path $WorkRoot "scripts\notify-ops.ps1"
    if (Test-Path -LiteralPath $notifyScript) {
        $slackTitle = "$overallEmoji 月度系統巡檢 $monthLabel — $overallWord"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $notifyScript `
            -Title $slackTitle -Message $bodyText -Level $(if ($allPass) { "success" } else { "warn" })
        $global:LASTEXITCODE = 0
    }

    # Telegram — real values come from the environment (mcp/user-env.ps1), never
    # from `secrets-vault -Action get`, which returns a MASKED value and produced
    # a silent 404 here until 2026-08-12. See scripts/lib/telegram-notify.ps1.
    # Wrapped: a notifier failure must never abort AO-RESUME. If it did, the
    # $monthlyStamp write below would be skipped, the next session would decide
    # the monthly review is still due, and the same throw would repeat forever.
    try {
        $tgLib = Join-Path $WorkRoot "scripts\lib\telegram-notify.ps1"
        if (Test-Path -LiteralPath $tgLib) {
            . $tgLib
            $tgText = "$overallEmoji 月度系統巡檢 $monthLabel`n$bodyText"
            $tgResult = Send-OpsTelegram -Text $tgText -WorkRoot $WorkRoot
            if ($tgResult.Sent) {
                Write-Host "  Telegram 通知已發送（$($tgResult.Reason)）" -ForegroundColor DarkCyan
            } else {
                Write-Host "  WARN: Telegram 通知失敗 - $($tgResult.Reason)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  WARN: 找不到 scripts\lib\telegram-notify.ps1，略過 Telegram 通知" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  WARN: Telegram 通知失敗 - $_" -ForegroundColor Yellow
    }

    # Update stamp
    [DateTime]::UtcNow.ToString("o") | Set-Content -LiteralPath $monthlyStamp -Encoding UTF8
    Write-Host "  monthly-LATEST.json + monthly-checks-last.txt updated." -ForegroundColor DarkCyan
}

# Report delta since last AO-RESUME (local stamp under agency-os/.agency-state/)
$stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
$stampPath = Join-Path $stateDir "ao-resume-last.txt"
$null = New-Item -ItemType Directory -Force -Path $stateDir

$lastUtc = $null
if (Test-Path -LiteralPath $stampPath) {
    try {
        $raw = (Get-Content -LiteralPath $stampPath -Raw -Encoding UTF8).Trim()
        if ($raw) { $lastUtc = [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    } catch {
        $lastUtc = $null
    }
}

$subdirs = @("closeout", "health", "guard", "status", "monthly", "governance")
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
    Write-Host "No new or updated files under agency-os/reports/{closeout,health,guard,status,monthly,governance} since last stamp." -ForegroundColor Green
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
                            $hitHost = 'ks-aw-01 (145.239.195.47; KS-6 host switch on 2026-08-31)'
                        } elseif ($msgText -match 'wordpress-ubuntu-4gb-sin|sin-1|5\.223\.93\.113') {
                            $hitHost = 'ks-aw-01 (145.239.195.47; KS-6 host switch on 2026-08-31)'
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
            # 2026-08-30: SG and EU are the same physical box (ks-aw-01) since the
            # 2026-08-28 consolidation, and the old per-box slugs pointed their SSH
            # Connection: at IPs deleted 2026-08-30 -- /codex-review caught that this
            # would send Claude to run a command that fails outright. One slug now,
            # regardless of which legacy label matched the alert text.
            $slug = 'ks-aw-01-reboot'
            Write-Host ("  host    : {0}" -f $h.host) -ForegroundColor Yellow
            Write-Host ("  signal  : {0} @ {1}" -f $h.source, $h.date) -ForegroundColor Yellow
            Write-Host ("  action  : run /{0} (auto-runs pre-flight read-only; wait for go-ahead to reboot)" -f $slug) -ForegroundColor Cyan
            Write-Host ""
        }
        Write-Host "Claude: surface this in your AO-RESUME report immediately, do not bury it." -ForegroundColor Red
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
# Advance ao-resume-last.txt ONLY for a real report-producing AO-RESUME (-WriteArchiveSkeleton).
# The stamp is the AO-CLOSE archive-gate anchor (verify-aoresume-archive.ps1): it must move in
# lockstep with the skeleton, else an auto-refresh / non-interactive run would advance the stamp
# with no matching archive and falsely fail the gate at the next AO-CLOSE. Auto-refresh regenerates
# state files only — it is NOT an AO-RESUME report event, so it must not move this anchor.
# (Other consumers — fetch-external-signals fallback, print-today-closeout-recap — also want the
# last REAL AO-RESUME time here, not an auto-refresh time.) Root cause: 2026-06-11 critic review.
if ($WriteArchiveSkeleton) {
    [System.IO.File]::WriteAllText($stampPath, $nowStamp + [Environment]::NewLine, $utf8NoBom)
    Write-Host ""
    Write-Host ("AO-RESUME stamp updated: {0}" -f $nowStamp) -ForegroundColor DarkGray
} else {
    Write-Host ("AO-RESUME stamp NOT advanced (auto-refresh / non-interactive; no archive expected, gate anchor unchanged)") -ForegroundColor DarkGray
}

# --- AO-RESUME archive skeleton (preventer for health gate 12d / verify-aoresume-archive.ps1) ---
# Root cause (2026-06-08 investigation): Step 3 of ao-resume.md (write the AO-RESUME report to
# agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md) was a MANUAL Claude action. When forgotten at
# resume it surfaced only as a CRITICAL fail at the *next* AO-CLOSE, forcing manual self-repair
# (6/5 補寫 2026-06-05-1910.md; 6/6 補寫 2026-06-06-1933.md — the recurring friction the operator hit).
# This writes a clearly-marked skeleton IF-NOT-EXISTS so the gate is satisfied by construction.
# Claude's Step 3 still overwrites it with the real report; a left-behind skeleton is a visible
# signal that Step 3 was skipped (not a silent pass). Preventer, not a replacement for Step 3.
try {
    $arDir = Join-Path $WorkRoot "agency-os\reports\ao-resume"
    $null = New-Item -ItemType Directory -Force -Path $arDir
    # Archive filenames use CST (UTC+8) — same convention as verify-aoresume-archive.ps1.
    $arStampUtc = [DateTime]::Parse($nowStamp, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
    $arStampCst = $arStampUtc.AddHours(8)
    $arThreshold = $arStampCst.AddMinutes(-10)   # mirror gate's 10-min grace window
    # Skip if an archive already covers this stamp window (Claude or a prior run wrote it).
    $arCovered = $false
    foreach ($af in @(Get-ChildItem -LiteralPath $arDir -Filter "????-??-??-????.md" -File -ErrorAction SilentlyContinue)) {
        if ($af.Name -match '^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.md$') {
            try {
                $arFt = [DateTime]::ParseExact(("{0}-{1}-{2} {3}:{4}" -f $Matches[1], $Matches[2], $Matches[3], $Matches[4], $Matches[5]), "yyyy-MM-dd HH:mm", $null)
                if ($arFt -ge $arThreshold) { $arCovered = $true; break }
            } catch { }
        }
    }
    if ($WriteArchiveSkeleton -and -not $arCovered) {
        $arName = $arStampCst.ToString("yyyy-MM-dd-HHmm") + ".md"
        $arPath = Join-Path $arDir $arName
        if (-not (Test-Path -LiteralPath $arPath)) {
            $arBody = @"
# AO-RESUME — $($arStampCst.ToString("yyyy-MM-dd HH:mm")) CST

<!-- AUTO-SKELETON written by ao-resume.ps1. Claude MUST overwrite this with the real report (ao-resume.md Step 3, identical to chat output). §0 + §6 + §7 are MANDATORY (print even if empty). If this placeholder survives to AO-CLOSE, Step 3 was skipped. -->

## 0. 一句話總結（TL;DR）
（待 Claude 填寫）

## 1. 系統快照
（待 Claude 填寫：精簡狀態表 | 項目 | 狀態 | — Git 對齊 / 整體健康% / Smoke / 備份 / VPS 自動重啟 / Cloudflare / 排程新鮮度 / 跨機 import）

**跨機 import 逐檔狀態（secrets vault — 固定每次開機同步的檔，必填每一列）**

| 檔案 | 狀態 |
|------|------|
| MEMORY.md | （待 Claude 填寫）|
| user-env.ps1 | （待 Claude 填寫）|
| .ssh/config | （待 Claude 填寫）|
| .ssh/id_ed25519 (+.pub) | （待 Claude 填寫）|
| .ssh/hetzner_trigger (+.pub) | （待 Claude 填寫）|
| .ssh/hostinger_soulful | （待 Claude 填寫）|
| AWARE_WAVE_CREDENTIALS.md | （待 Claude 填寫）|
| ao-close-last.txt (gap 錨) | （待 Claude 填寫）|

## 2. 外部信號
（待 Claude 填寫）

## 3. 已完成
（待 Claude 填寫）

## 4. 目前進度
（待 Claude 填寫）

## 5. 未完成待辦（TASKS）
（待 Claude 填寫）

## 6. 阻塞與風險
（待 Claude 填寫；空也要印一行）

## 7. 需你決策 / 期限提醒
（待 Claude 填寫；空也要印一行）

## 8. 下一步
（待 Claude 填寫）
"@
            [System.IO.File]::WriteAllText($arPath, $arBody, $utf8NoBom)
            Write-Host ("AO-RESUME archive skeleton written: agency-os/reports/ao-resume/{0} (Claude Step 3 overwrites with real report)" -f $arName) -ForegroundColor DarkGray
        }
    }
} catch {
    Write-Host ("WARN: AO-RESUME archive skeleton write failed (non-fatal): {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}
# --- end AO-RESUME archive skeleton ---

if ($healthGateExit -ne 0) {
    Write-Host ""
    Write-Host ("ao-resume: state files generated; health gate failures remain (exit {0}). Claude reads fresh state files and reports health issues in Section 1." -f $healthGateExit) -ForegroundColor Red
    exit $healthGateExit
}
exit 0
