# AO-CLOSE: ensure-daily-progress-scaffold -> closeout inbox guard -> merge-closeout-inbox-into-progress ->
#   print-today-closeout-recap (see -SkipTodayRecap) -> verify-build-gates ->
#   system-guard (doc-sync + health + guard) -> generate integrated-status report ->
#   optional apply-closeout-task-checkmarks -> git add -> verify-closeout-completeness -> git commit + push.
# -CommitMessageFile: UTF-8 file passed to "git commit -F" (multiline safe). Staged diff must not contain +<<<<<<< conflict markers.
# Inbox: guard runs before merge; merge appends verbatim payload to WORKLOG + memory/daily then resets inbox from TEMPLATE.
# CONVERSATION_MEMORY: agent must edit agency-os/memory/CONVERSATION_MEMORY.md before this script (10-memory + 40-closeout); merge script may add inbox pointer only.
# apply-closeout-task-checkmarks: WORKLOG today "- AUTO_TASK_DONE: <substring>" + optional
# agency-os/.agency-state/pending-task-completions.txt (gitignored).
# Primary: monorepo root scripts\ao-close.ps1. agency-os\scripts\ao-close.ps1 is a thin wrapper (same flags).
# -SkipPush: no git commit/push (still runs gates and reports).
# -SkipVerify: skip verify-build-gates (faster; not recommended before company pull).
# -AllowAheadCommits: required override when local branch is already ahead of origin before AO-CLOSE starts.

param(
    [string]$WorkRoot = "",
    [string]$CommitMessage = "",
    # 多行／多代理彙總：`git commit -F`（若與 -CommitMessage 並存，**以檔案為準**）。
    [string]$CommitMessageFile = "",
    [switch]$SkipPush,
    [switch]$SkipVerify,
    [switch]$AllowNonPerfectHealth,
    [switch]$AllowPushWhileBehind,
    [switch]$AllowAheadCommits,
    [switch]$SkipTodayRecap,
    [switch]$SkipAutoTaskCheckmarks,
    [switch]$SkipInboxGuard,
    # 2026-06-10: 預設 off。closeout-inbox 是 Cursor+Claude 雙 IDE 時代的協作機制（協作 AI
    # 寫 inbox → AO-CLOSE merge）。現為單 AI（僅 Claude，直接寫 WORKLOG），guard 只剩摩擦。
    # merge 步驟保留為無害 no-op（空 inbox 自動 skip）。若日後 Cursor 回歸 → 設回 strict/warn。
    [ValidateSet("warn","strict","off")]
    [string]$InboxGuardMode = "off",
    [ValidateSet("off", "warn", "strict")]
    [string]$CompletenessGate = "strict",
    [switch]$SkipCompletenessGate
)

# Partial splats (e.g. agency-os wrapper only forwarding @PSBoundParameters) can omit keys; under
# StrictMode, reading an uninitialized param binder throws VariableIsUndefined. Normalize before StrictMode.
if (-not (Get-Variable -Name CommitMessage -Scope Script -ErrorAction SilentlyContinue)) {
    New-Variable -Name CommitMessage -Scope Script -Value ""
}
if (-not (Get-Variable -Name CommitMessageFile -Scope Script -ErrorAction SilentlyContinue)) {
    New-Variable -Name CommitMessageFile -Scope Script -Value ""
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# CP950 protection for native-git stdout capture (see scripts/_console-encoding-helpers.ps1).
# Unconditional on purpose: the git-safe-ops dot-source below is Test-Path-guarded, so relying
# on it transitively would leave Invoke-WithUtf8Console undefined exactly when the lib is absent.
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} else {
    $fromWorkScripts = Join-Path $PSScriptRoot "..\agency-os\scripts\system-guard.ps1"
    $fromAgencyScripts = Join-Path $PSScriptRoot "system-guard.ps1"
    if (Test-Path -LiteralPath $fromWorkScripts) {
        $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    } elseif (Test-Path -LiteralPath $fromAgencyScripts) {
        $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
    } else {
        Write-Error "ao-close: cannot locate system-guard.ps1 (expected under monorepo). PSScriptRoot=$PSScriptRoot"
        exit 1
    }
}

$agencyRoot = Join-Path $WorkRoot "agency-os"

# Phase C (2026-05-30): dot-source shared git-safe-ops lib.
# Replaces bare `git fetch origin` (line ~277) and `git push origin $branch` (line ~511)
# which NativeCommandError'd under PS5.1 $ErrorActionPreference=Stop + any git stderr.
$gitSafeOpsLib = Join-Path $WorkRoot "scripts\lib\git-safe-ops.ps1"
if (Test-Path -LiteralPath $gitSafeOpsLib) {
    . $gitSafeOpsLib
} else {
    Write-Warning "ao-close: git-safe-ops.ps1 not found at $gitSafeOpsLib — bare git calls will be used (unsafe)"
}

$healthReportUtils = Join-Path $WorkRoot "scripts\health-report-utils.ps1"
if (Test-Path -LiteralPath $healthReportUtils) {
    . (Resolve-Path -LiteralPath $healthReportUtils).Path
}

# Four-phase refactor (2026-06-09): single quality-gate collector. Quality gates record
# pass/fail into $gate instead of exiting on first failure; one decision point before publish
# reports ALL blockers at once (root-fix for the recurring serial-retry "30-min close").
# Behavior contract: publish IFF zero blockers — identical commit decision to the old per-gate
# exits, only batched reporting. Preconditions (git topology / infra) stay fail-fast below.
$gateLib = Join-Path $WorkRoot "scripts\lib\ao-close-gates.ps1"
if (Test-Path -LiteralPath $gateLib) {
    . (Resolve-Path -LiteralPath $gateLib).Path
    $gate = New-CloseoutGate
} else {
    Write-Error "ao-close: missing quality-gate lib at $gateLib"
    exit 1
}

# Single decision point: report every recorded blocker at once, then refuse to publish.
# Called at the SkipPush exit (pre-stage gates only) and before commit (pre + post-stage gates).
function Invoke-CloseoutGateDecision {
    param([Parameter(Mandatory = $true)] $Gate)
    if (Test-CloseoutShouldBlock $Gate) {
        # Write-Host (NOT Write-Error): under $ErrorActionPreference='Stop' Write-Error throws a
        # terminating exception, which would (a) make `return $true` dead code and (b) bury the clean
        # consolidated report under a raw stack trace — defeating the whole point of batched reporting.
        # The caller owns the exit via `if (Invoke-CloseoutGateDecision ...) { exit 1 }`.
        Write-Host ""
        Write-Host (Get-CloseoutGateReport $Gate) -ForegroundColor Red
        return $true   # blocked
    }
    return $false       # clean
}

$guardScript = Join-Path $agencyRoot "scripts\system-guard.ps1"
if (-not (Test-Path -LiteralPath $guardScript)) {
    Write-Error "ao-close: missing system-guard at $guardScript"
    exit 1
}

function Get-GitPreflightSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    Push-Location $RepoRoot
    try {
        $null = git rev-parse --git-dir 2>$null
        if ($LASTEXITCODE -ne 0) {
            return [pscustomobject]@{
                IsGitRepo   = $false
                Branch      = ""
                StatusLine  = ""
                StatusRawZ  = ""
                Ahead       = $null
                Behind      = $null
                Dirty       = $null
                RemoteRef   = ""
                RemoteFound = $false
            }
        }

        $statusLine = (git status -sb 2>$null | Select-Object -First 1)
        if ($null -eq $statusLine) {
            $statusLine = ""
        } else {
            $statusLine = $statusLine.Trim()
        }

        $branch = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD 2>$null }).Trim()
        $remoteRef = if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") { "" } else { "origin/$branch" }
        $remoteFound = $false
        $ahead = $null
        $behind = $null

        if (-not [string]::IsNullOrWhiteSpace($remoteRef)) {
            git rev-parse --verify $remoteRef 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $remoteFound = $true
                $lr = (git rev-list --left-right --count "${remoteRef}...HEAD" 2>$null).Trim()
                $parts = @($lr -split '\s+' | Where-Object { $_ })
                if ($parts.Count -ge 2) {
                    $behind = [int]$parts[0]
                    $ahead = [int]$parts[1]
                }
            }
        }

        # `-z`: NOT `--porcelain` text mode. Two real bugs found by critic review
        # (2026-09-03) on the FIRST version of the scoped-add fix that used text mode:
        #   - text mode C-quotes any path containing a space (`"with space.md"`,
        #     quotes included) even with core.quotepath=false, which only suppresses
        #     non-ASCII escaping, not quoting -- 632 tracked paths in this repo contain
        #     spaces. `-z` never quotes.
        #   - default `--porcelain` (without `-uall`/`--untracked-files=all`) collapses
        #     an untracked DIRECTORY into one line (`?? newdir/`), so a NEW file inside
        #     a NEW directory (a normal shape for this session's own work) is invisible
        #     to per-file parsing. `-uall` lists every untracked file individually.
        # `-z` output is NUL-separated with NO quoting; a rename/copy entry is TWO
        # consecutive NUL-terminated fields (`XY new-path\0old-path\0`, new path first
        # -- verified empirically, this is the REVERSE of the human-readable
        # `old -> new` arrow form). Captured as ONE raw string (not split into lines --
        # there are no newlines in `-z` output, and PowerShell's native-command output
        # capture does NOT truncate embedded NUL bytes within a single returned string,
        # confirmed empirically on this machine's real powershell.exe 5.1). Parsed by
        # Get-AoCloseStagePaths's ConvertTo-StatusPathMap, which needs real paths, not
        # just a count.
        $statusRawZ = (Invoke-WithUtf8Console { git -c core.quotepath=false status --porcelain -z --untracked-files=all }) -join ''
        $dirty = -not [string]::IsNullOrEmpty($statusRawZ)

        return [pscustomobject]@{
            IsGitRepo   = $true
            Branch      = $branch
            StatusLine  = $statusLine
            StatusRawZ  = $statusRawZ
            Ahead       = $ahead
            Behind      = $behind
            Dirty       = $dirty
            RemoteRef   = $remoteRef
            RemoteFound = $remoteFound
        }
    } finally {
        Pop-Location
    }
}

# Replaces `git add -A` (TASKS.md 544 "AO-CLOSE 的 git add -A"): a bare, un-scoped
# stage sweeps up ANY dirty file in this repo's shared working directory, including
# another concurrent Claude Code session's uncommitted work -- attributed to whatever
# commit message THIS AO-CLOSE run happens to write. Same invariant as
# git-add-scope-tracker.js's 2026-09-02 fix (mcp/claude-userlevel/hooks/rules/): only
# stage paths this session can actually account for.
#
# THREE sources, unioned (a third added 2026-09-03 after critic review found the
# first version only handled the WORKING TREE, not the INDEX -- see M1 below):
#   A. session-edit-tracker.js's tracker -- every file THIS session's Write/Edit/
#      MultiEdit tool calls touched, any extension, for the WHOLE session (not
#      cleared by /verify-recent or anything else).
#   B. a before/after `git status --porcelain -z --untracked-files=all` diff
#      bracketing AO-CLOSE's own pipeline (baseline captured at preflight, before
#      scaffold/inbox-merge/checkmarks/dispatch/WORKLOG-rotate/prune-reports run;
#      "after" taken here). Deliberately NOT a hardcoded path allowlist: AO-CLOSE's
#      pipeline has ~8 steps today and grows over time, and a list needs updating
#      every time a step's output path changes -- a status diff captures whatever
#      changed without needing to know in advance where.
#   C. git-add-scope-tracker.js's OWN tracker (the SAME session-scoped "files this
#      session verified via `git add`" list that git-commit-scope-guard.js already
#      uses to protect a bare `git commit` typed directly in a Bash tool call) --
#      reused here so a file THIS session legitimately `git add`-ed earlier (and is
#      therefore already sitting in the INDEX, not just the working tree) is not
#      mistaken for "foreign" by the M1 guard below.
# A path dirty at baseline that none of A/B/C account for is left UNSTAGED on
# purpose: it is either another session's work, or a file this session changed some
# OTHER way (e.g. a Bash script writing directly to disk) that was never routed
# through Write/Edit or `git add` -- the agent must stage that explicitly if it
# needs to be part of this commit, same as git-add-scope-tracker.js already
# requires for a bare `git add`/`git commit`.
#
# M1 (critic finding, 2026-09-03): the working-tree diff above says nothing about
# the INDEX. Another session can `git add` its own files and leave them staged,
# mid-session, in this repo's shared index (a designed-for state --
# git-add-scope-tracker.js actively expects sessions to do exactly this). `git
# commit` publishes the WHOLE index, not just what THIS run just staged -- so
# without this guard, AO-CLOSE would still absorb another session's already-staged
# work under its own auto-generated message, the exact bug this fix exists to
# close, just through the index instead of a blind `git add -A`. Caller
# (ao-close.ps1's staging section) unstages ("git reset --") any baseline index
# entry this function reports as foreign, BEFORE running the scoped `git add`.
function Get-AoCloseStagePaths {
    param(
        [Parameter(Mandatory = $true)] [string]$RepoRoot,
        [string]$BaselineStatusRawZ = ''
    )

    # NOT [System.IO.Path]::GetRelativePath -- that's .NET Core-only and this
    # script runs under Windows PowerShell 5.1 (.NET Framework) in production
    # (`powershell -ExecutionPolicy Bypass -File ao-close.ps1`, per
    # .claude/commands/ao-close.md); calling it throws MethodNotFound. All these
    # paths are already known to be under $RepoRoot, so a simple case-insensitive
    # prefix strip is sufficient -- no need for full relative-path resolution
    # (no `..` traversal to handle).
    #
    # M4 (critic finding): CLAUDE.md documents `.claude/` in the repo as a junction
    # to `~/.claude/`. A Write/Edit tool call can address the SAME file via either
    # path (repo-relative-resolved-absolute, or the profile-side junction target),
    # and only the FIRST form strips to a repo-relative path directly. If the direct
    # strip fails, retry against the junction target so a session edit made via the
    # profile-side path is not silently dropped from staging.
    function ConvertTo-RepoRelativePath {
        param([string]$RepoRoot, [string]$AbsPath)
        $rootNorm = ($RepoRoot.TrimEnd('\', '/') -replace '/', '\')
        $pathNorm = ($AbsPath -replace '/', '\')
        if ($pathNorm.Length -gt $rootNorm.Length -and
            $pathNorm.Substring(0, $rootNorm.Length).ToLowerInvariant() -eq $rootNorm.ToLowerInvariant() -and
            $pathNorm[$rootNorm.Length] -eq '\') {
            return ($pathNorm.Substring($rootNorm.Length + 1) -replace '\\', '/')
        }
        $claudeJunctionPath = Join-Path $RepoRoot ".claude"
        if (Test-Path -LiteralPath $claudeJunctionPath) {
            try {
                $junctionItem = Get-Item -LiteralPath $claudeJunctionPath -Force -ErrorAction Stop
                $target = $null
                if ($junctionItem.PSObject.Properties['Target'] -and $junctionItem.Target) {
                    $target = $junctionItem.Target | Select-Object -First 1
                }
                if ($target) {
                    $targetNorm = ($target.TrimEnd('\', '/') -replace '/', '\')
                    if ($pathNorm.Length -gt $targetNorm.Length -and
                        $pathNorm.Substring(0, $targetNorm.Length).ToLowerInvariant() -eq $targetNorm.ToLowerInvariant() -and
                        $pathNorm[$targetNorm.Length] -eq '\') {
                        return (".claude/" + ($pathNorm.Substring($targetNorm.Length + 1) -replace '\\', '/'))
                    }
                }
            } catch {
                # Get-Item on the junction failed -- fall through to $null rather than guess.
            }
        }
        return $null
    }

    # C2/C3 fix (critic findings, 2026-09-03): the first version of this function
    # parsed `git status --porcelain` TEXT output, which (a) C-quotes any path
    # containing a space even with core.quotepath=false (that setting only
    # suppresses non-ASCII escaping, not quoting -- 632 tracked paths in this repo
    # contain spaces) and (b) without `-uall` collapses a whole untracked directory
    # into one line, so a new file inside a new directory was invisible to per-file
    # parsing. `-z --untracked-files=all` fixes both: NUL-separated, never quoted,
    # every untracked file listed individually. A rename/copy entry is TWO
    # consecutive NUL-terminated fields (`XY new-path\0old-path\0`, NEW path first
    # -- verified empirically; this is the REVERSE of the human-readable
    # `old -> new` arrow form `git status` uses without `-z`).
    # v2 (critic round 2, 2026-09-03 -- 2 more Critical findings on the v1 of this
    # function, reproduced live):
    #   - C-A: rename/copy is only correctly signaled by column 1 (Y) in some git
    #     shapes (` R`/` C`, e.g. a worktree-only rename with an intent-to-add index
    #     entry -- reachable via `git add -N`, which `git stash -u` and some editor
    #     integrations use). Checking only `$xy[0]` missed these, so the paired
    #     OLD-path token got RE-PARSED as if it were its own status entry --
    #     `Substring(0,2)`/`Substring(3)` on a bare filename produces a GARBAGE path
    #     that then either hard-aborts a later `git add` (pathspec matches nothing,
    #     exit 128) or silently no-ops a `git reset`. Fixed: check BOTH `$xy[0]` and
    #     `$xy[1]`.
    #   - C-B: even with C-A fixed, `git reset -- <new-path>` on a FOREIGN staged
    #     rename only removes the new-path index entry, leaving the old path staged
    #     as a bare deletion -- AO-CLOSE would then commit "deleted: <old-path>" for
    #     a file another session only renamed, never deleted. Fixed: this function
    #     now also returns a new-path -> old-path map so the caller can reset BOTH
    #     paths for any foreign rename/copy.
    # m3-3 fix (critic round 3): the old `if ($null -ne $old)` guard on
    # `$tokens[$i+1]` was dead code -- under this script's own Set-StrictMode, an
    # out-of-bounds array index throws IndexOutOfRangeException, it does not
    # return $null. Not reachable with well-formed `-z` output (git always
    # NUL-terminates the final token too, so a trailing "" element follows any
    # real rename entry), but the guard as written claimed a safety it didn't
    # have. Fixed with an explicit bounds check.
    # m3-4 fix (critic round 3): bare `@{}` hashtables are case-INSENSITIVE by
    # default in PowerShell -- silently undoes the case-sensitive Ordinal
    # HashSets used downstream ($targetSet/$stageSet, m6) if two case-variant
    # paths ever appear in one status output (e.g. this session's `foo.md` vs.
    # another session's staged `Foo.md`). Fixed with an explicit ordinal
    # comparer on both hashtables.
    function ConvertTo-StatusPathMap {
        param([string]$RawZ)
        $map = New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)
        $renameOldPath = New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)
        $unmerged = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::Ordinal)
        if ([string]::IsNullOrEmpty($RawZ)) {
            return [pscustomobject]@{ Map = $map; RenameOldPath = $renameOldPath; Unmerged = $unmerged }
        }
        $tokens = $RawZ -split "`0"
        $i = 0
        while ($i -lt $tokens.Count) {
            $entry = $tokens[$i]
            if ([string]::IsNullOrEmpty($entry) -or $entry.Length -lt 3) { $i++; continue }
            $xy = $entry.Substring(0, 2)
            $p  = $entry.Substring(3)
            $map[$p] = $entry
            # Merge conflict shapes (git status --porcelain table): UU, AA, DD, AU,
            # UA, DU, UD -- ANY of these has 'U' in a column, or is the literal 'AA'/
            # 'DD' pair. M-D fix: these must never be treated as "just another staged
            # file" -- the caller aborts rather than `git reset`-ing them (that would
            # destroy the conflict's stage-1/2/3 blobs, see header note at the reset
            # call site).
            if ($xy[0] -eq 'U' -or $xy[1] -eq 'U' -or $xy -eq 'AA' -or $xy -eq 'DD') {
                [void]$unmerged.Add($p)
            }
            if ($xy[0] -eq 'R' -or $xy[0] -eq 'C' -or $xy[1] -eq 'R' -or $xy[1] -eq 'C') {
                if ($i + 1 -lt $tokens.Count) { $renameOldPath[$p] = $tokens[$i + 1] }
                $i += 2  # skip the paired OLD-path token
            } else {
                $i += 1
            }
        }
        return [pscustomobject]@{ Map = $map; RenameOldPath = $renameOldPath; Unmerged = $unmerged }
    }

    Push-Location $RepoRoot
    try {
        $currentRawZ = (Invoke-WithUtf8Console { git -c core.quotepath=false status --porcelain -z --untracked-files=all }) -join ''
    } finally {
        Pop-Location
    }
    $baselineInfo = ConvertTo-StatusPathMap -RawZ $BaselineStatusRawZ
    $currentInfo  = ConvertTo-StatusPathMap -RawZ $currentRawZ
    $baselineMap = $baselineInfo.Map
    $currentMap  = $currentInfo.Map

    # B: present now with a DIFFERENT (or absent-at-baseline) status entry.
    # M3-2 fix (critic round 3): the Unmerged exclusion below only covered the
    # BASELINE side -- a path that was clean at baseline but becomes a live
    # conflict DURING this run (e.g. AO-CLOSE's own pipeline writes to a file
    # that's mid-`git stash pop` conflict for someone else, changing its status
    # entry) was still eligible for `$pipelinePaths` and would get `git add`-ed,
    # RESOLVING that conflict as a side effect. Excluded here too; the primary
    # whole-script abort above should make this unreachable in practice, but this
    # is defense-in-depth for the same reason the baseline-side exclusion is.
    $pipelinePaths = @($currentMap.Keys | Where-Object {
        (-not $baselineMap.ContainsKey($_) -or $baselineMap[$_] -ne $currentMap[$_]) -and
            -not $currentInfo.Unmerged.Contains($_)
    })

    # M1: baseline INDEX entries (first status char not ' ' and not '?') that this
    # session's OWN git-add-scope-tracker.js tracker does not claim -- i.e. staged
    # by someone/something else before this run even started.
    # IgnoreCase deliberately, unlike $targetSet/$stageSet below (m6, case-sensitive
    # Ordinal): this set is membership-tested against Windows filesystem paths from a
    # tracker file, mirroring lib/shared.js normalizePath()'s win32 case-insensitive
    # dedup for the SAME tracker on the JS side -- not an oversight.
    $ownGitAddSet = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::OrdinalIgnoreCase)
    $sidHelperPath = Join-Path $PSScriptRoot "verify-sid-shared.ps1"
    $sid = $null
    # m2 fix (critic finding): writeTracker() in lib/shared.js caps a tracker at
    # TRACKER_MAX_ENTRIES (500) and appends a `# +N entries truncated` marker line
    # once a session crosses that -- the ONE signal that data was lost. Both
    # trackers read below used to filter `^#` lines and discard that marker
    # silently along with genuine comments. $trackerTruncated below surfaces it.
    $trackerTruncated = $false
    if (Test-Path -LiteralPath $sidHelperPath) {
        . $sidHelperPath
        $sid = Get-VerifySid
        $gitAddTrackerFile = Join-Path $env:TEMP "claude-git-staged-$sid.txt"
        if (Test-Path -LiteralPath $gitAddTrackerFile) {
            $gitAddRawLines = @(Get-Content -LiteralPath $gitAddTrackerFile -Encoding UTF8 | ForEach-Object { $_.Trim() })
            if ($gitAddRawLines | Where-Object { $_ -match '^#.*truncated' }) { $trackerTruncated = $true }
            $gitAddRawLines | Where-Object { $_ -and $_ -notmatch '^#' } |
                ForEach-Object { [void]$ownGitAddSet.Add($_) }
        }
    }
    # M-D fix (critic round 2): an unmerged path (conflict stages 1/2/3 --
    # UU/AA/DD/AU/UA/DU/UD) must NEVER be treated as "just another foreign staged
    # file" -- `git reset -- <path>` on one DESTROYS the conflict's stage entries
    # (verified: `git ls-files -u` goes from 3 stages to none after reset) while
    # leaving MERGE_HEAD in place, so the NEXT `git commit` silently CONCLUDES
    # someone else's unresolved merge with whatever half-state remains -- and the
    # conflict-marker gate elsewhere in this script can no longer see it, because
    # the file is no longer staged. The whole-script MERGE_HEAD/CHERRY_PICK_HEAD/
    # REVERT_HEAD check right after Get-GitPreflightSnapshot below is the primary
    # defense (aborts before ANY pipeline step runs); this exclusion is
    # defense-in-depth for the case that check somehow misses (e.g. a conflict
    # left over from something other than merge/cherry-pick/revert).
    $foreignStagedAtBaseline = @($baselineMap.Keys | Where-Object {
        $entry = $baselineMap[$_]
        $entry.Length -ge 1 -and $entry[0] -ne ' ' -and $entry[0] -ne '?' -and
            -not $ownGitAddSet.Contains($_) -and -not $baselineInfo.Unmerged.Contains($_)
    })
    # C-B fix (critic round 2): a foreign staged RENAME/COPY is keyed on the NEW
    # path only; resetting just that path leaves the OLD path staged as a bare
    # deletion -- AO-CLOSE would then commit "deleted: <old path>" for a file
    # another session only renamed. Expand the reset target list to include the
    # paired old path for any foreign entry that is a rename/copy.
    # m3-2 fix (critic round 3): if that OLD path happens to be something THIS
    # session separately, legitimately `git add`-ed (this session staged A;
    # another session then `git mv A B`) -- resetting it would discard this
    # session's own staged content (A no longer exists on disk once moved, so
    # it's only recoverable as a dangling blob). Skip + warn instead of silently
    # preferring the foreign rename in that narrow collision.
    $foreignStagedResetPaths = @()
    foreach ($p in $foreignStagedAtBaseline) {
        $foreignStagedResetPaths += $p
        if ($baselineInfo.RenameOldPath.ContainsKey($p)) {
            $oldPath = $baselineInfo.RenameOldPath[$p]
            if ($ownGitAddSet.Contains($oldPath)) {
                Write-Warning "ao-close: '$oldPath' is both this session's own staged content AND the source of a foreign rename to '$p' -- NOT resetting it (would discard this session's own staged blob). Leaving '$p' staged may still absorb the foreign rename; check manually."
            } else {
                $foreignStagedResetPaths += $oldPath
            }
        }
    }
    $foreignStagedResetPaths = @($foreignStagedResetPaths | Select-Object -Unique)

    # A: session-edit-tracker.js's list, normalized to repo-relative (the tracker
    # stores whatever path form the tool_input used, typically absolute).
    $sessionRelPaths = @()
    $sessionTrackerMissing = $true
    if ($sid) {
        $editTrackerFile = Join-Path $env:TEMP "claude-session-edits-$sid.txt"
        if (Test-Path -LiteralPath $editTrackerFile) {
            $sessionTrackerMissing = $false
            $editRawLines = @(Get-Content -LiteralPath $editTrackerFile -Encoding UTF8 | ForEach-Object { $_.Trim() })
            if ($editRawLines | Where-Object { $_ -match '^#.*truncated' }) { $trackerTruncated = $true }
            $rawSessionPaths = @($editRawLines | Where-Object { $_ -and $_ -notmatch '^#' })
            foreach ($p in $rawSessionPaths) {
                $abs = if ([System.IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $RepoRoot $p }
                $rel = ConvertTo-RepoRelativePath -RepoRoot $RepoRoot -AbsPath $abs
                if ($rel) { $sessionRelPaths += $rel } # $null -> outside RepoRoot, skip rather than guess
            }
        }
    }

    # M6: deliberately a case-sensitive .NET HashSet, not `Select-Object -Unique`
    # (git paths are case-sensitive; correction, critic round 3: `-Unique` was
    # measured NOT to collapse case-variant strings on PS 5.1 either, so the
    # original "-Unique is case-insensitive" rationale was itself wrong -- but an
    # explicit Ordinal HashSet is still the right, unambiguous choice here, and
    # critically the OLD-path addition further below (C-B fix) depends on this
    # collection actually being ordinal, not on whatever `-Unique`'s real
    # comparison semantics happen to be).
    $targetSet = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::Ordinal)
    foreach ($p in ($pipelinePaths + $sessionRelPaths)) { [void]$targetSet.Add($p) }
    # Only paths ACTUALLY dirty right now: drops anything from the session tracker
    # that was already committed/reverted some other way, and avoids a no-op `git add`
    # warning for a clean path.
    $stagePaths = @($targetSet | Where-Object { $currentMap.ContainsKey($_) })

    # M3: everything dirty right now that this function is NOT staging AND is not
    # already legitimately staged some other way (source C -- own git-add-tracker
    # entries are already sitting correctly in the index; they don't appear in
    # $stagePaths because there is nothing left to `git add`, not because they were
    # dropped), for the caller to print -- turns every silent-drop scenario above
    # into a visible one.
    $stageSet = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::Ordinal)
    foreach ($p in $stagePaths) { [void]$stageSet.Add($p) }
    $leftUnstaged = @($currentMap.Keys | Where-Object {
        if ($stageSet.Contains($_)) { return $false }
        $entry = $currentMap[$_]
        $alreadyLegitimatelyStaged = ($entry.Length -ge 1 -and $entry[0] -ne ' ' -and $entry[0] -ne '?' -and $ownGitAddSet.Contains($_))
        -not $alreadyLegitimatelyStaged
    })

    return [pscustomobject]@{
        StagePaths              = $stagePaths
        ForeignStagedAtBaseline = $foreignStagedAtBaseline   # for display: new-path names only
        ForeignStagedResetPaths = $foreignStagedResetPaths   # for `git reset --`: includes paired old paths (C-B)
        LeftUnstaged            = $leftUnstaged
        SessionTrackerMissing   = $sessionTrackerMissing
        TrackerTruncated        = $trackerTruncated
    }
}

Write-Host "== AO-CLOSE: preflight git snapshot (branch/ahead/behind/dirty) ==" -ForegroundColor Cyan
$preflight = Get-GitPreflightSnapshot -RepoRoot $WorkRoot
if (-not $preflight.IsGitRepo) {
    Write-Error "ao-close: not a git repository at $WorkRoot"
    exit 1
}

# M-D fix, primary defense (critic round 2, 2026-09-03): a merge/cherry-pick/
# revert/rebase/stash-pop/am genuinely in progress leaves conflict-stage index
# entries (UU/AA/DD/...) that the scoped-add machinery below must never touch --
# `git reset -- <path>` on one destroys the conflict's stage 1/2/3 blobs, so the
# next `git commit` would silently CONCLUDE someone else's unresolved operation
# with whatever half-state remains, and the conflict-marker gate further down
# this script can no longer see it (the file is no longer staged).
#
# v2 (critic round 3, 2026-09-03 -- TWO more real bugs found in v1 of this exact
# check, both reproduced live):
#   - C3-1 (Critical): `@('MERGE_HEAD', ...) | Where-Object {...}` -- the `@()`
#     wraps the ARRAY LITERAL, not the pipeline's result. `Where-Object` with
#     zero matches (the normal case, every ordinary run) returns $null, and
#     exactly one match returns a bare [String] -- both throw
#     PropertyNotFoundStrict on `.Count` under this script's own
#     Set-StrictMode. Reproduced: AO-CLOSE crashed on 100% of runs with zero or
#     one marker present, i.e. every normal run and every real single-marker
#     conflict -- only "2+ markers simultaneously" (essentially never) survived
#     to the intended `exit 1`. The EXACT C1 bug class this same pass already
#     fixed elsewhere, reintroduced fresh in this new check. Fixed by wrapping
#     the WHOLE pipeline: `@(@(...) | Where-Object {...})`.
#   - M3-1 (Major): checking only 3 marker FILES is path-shaped, not
#     invariant-shaped. Measured against this repo's own real tooling
#     (git-align-main-aoresume-feature.ps1's documented `git stash pop`
#     conflict recovery path; ao-resume.ps1's documented `git rebase
#     --continue` recovery path): a conflicted `git stash pop` leaves ONLY
#     `AUTO_MERGE` (no MERGE_HEAD); a conflicted `git rebase`/`git am -3`
#     leaves `REBASE_HEAD` + `rebase-merge`/`rebase-apply` (not one of the
#     three checked); and a rebase whose conflicts were already resolved +
#     `git add`-ed but not yet `--continue`d has NO unmerged index entries AT
#     ALL while still mid-rebase on a detached HEAD -- invisible to both the
#     marker check AND the Unmerged status-code exclusion. The real invariant
#     is "no unmerged index entries AND no sequencer operation in progress",
#     checked via `git ls-files --unmerged` (catches every conflict-shaped
#     index state regardless of which operation produced it) UNIONED with the
#     broader marker/directory set `git rev-parse --git-path` resolves
#     correctly even from a linked worktree (m3-1's `Join-Path .git` did not).
$inProgressMarkers = @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer')
$inProgress = @($inProgressMarkers | Where-Object {
    $p = (Invoke-WithUtf8Console { git -C $WorkRoot rev-parse --git-path $_ 2>$null }).Trim()
    $p -and (Test-Path -LiteralPath $p)
})
$unmergedNow = @(Invoke-WithUtf8Console { git -C $WorkRoot ls-files --unmerged } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($inProgress.Count -gt 0 -or $unmergedNow.Count -gt 0) {
    Write-Host @"
ao-close: refusing to run -- a merge/cherry-pick/revert/rebase/stash-pop/am
operation is in progress in $WorkRoot ($(if ($inProgress.Count -gt 0) { "markers: $($inProgress -join ', ')" } else { "$($unmergedNow.Count) unmerged path(s)" })).
AO-CLOSE's scoped `git add`/`git reset` logic is not safe to run over an
unresolved operation (it can destroy conflict stage entries and silently
conclude the operation with the wrong content). Resolve or abort it first
(e.g. `git merge --abort` / `git cherry-pick --abort` / `git revert --abort` /
`git rebase --abort` / `git am --abort`, or finish resolving and continue it),
then re-run AO-CLOSE.
"@ -ForegroundColor Red
    exit 1
}

# Baseline for the scoped `git add` below (replaces `git add -A` -- TASKS.md 544):
# captured HERE, before any pipeline step (scaffold/inbox-merge/checkmarks/dispatch/
# WORKLOG-rotate/prune-reports) has run, so Get-AoCloseStagePaths can tell "AO-CLOSE's
# own output this run" apart from "was already dirty before this run started" (which
# may be another concurrent session's uncommitted work in this repo's shared working
# directory, or this session's own earlier edits already captured separately via the
# session-edit-tracker).
$aoCloseBaselineStatus = $preflight.StatusRawZ
if (-not [string]::IsNullOrWhiteSpace($preflight.StatusLine)) {
    Write-Host "  status: $($preflight.StatusLine)" -ForegroundColor DarkGray
}
if ($preflight.RemoteFound -and $null -ne $preflight.Ahead -and $null -ne $preflight.Behind) {
    Write-Host "  branch: $($preflight.Branch) | remote: $($preflight.RemoteRef) | ahead=$($preflight.Ahead) behind=$($preflight.Behind) | dirty=$($preflight.Dirty)" -ForegroundColor DarkGray
    if ($preflight.Ahead -gt 0 -and -not $AllowAheadCommits) {
        # Phase C4 (2026-05-30): auto-detect whether all ahead commits are system-generated
        # checkpoints. If yes, bypass the flag — the operator shouldn't need -AllowAheadCommits
        # just because the auto-checkpoint hook ran between the last push and AO-CLOSE.
        Push-Location $WorkRoot
        try {
            # CP950 wrap is load-bearing here, not cosmetic: this captures commit SUBJECTS, which
            # in this repo are overwhelmingly CJK. Decoding UTF-8 as Big5 can swallow the newline
            # between two subjects and merge them onto one line (same failure that broke
            # backfill-missed-daily.ps1 on 2026-05-22). A human subject absorbed into the preceding
            # "[claude] checkpoint:" line then matches the checkpoint regex below, $humanCommits
            # drops to 0, and this gate waves through unpublished human work.
            # Reproduced 2026-08-25 on a big5 console: 400 commits -> bare capture returned 377
            # lines and 177 of 200 human commits; wrapped returned 400 / 200.
            $aheadSubjects = @(Invoke-WithUtf8Console { & git log "origin/$($preflight.Branch)..HEAD" --format="%s" 2>$null })
        } finally { Pop-Location }
        $humanCommits = @($aheadSubjects | Where-Object { $_ -notmatch '^\[claude\] (checkpoint:|chore: AO-CLOSE)' })
        if ($aheadSubjects.Count -gt 0 -and $humanCommits.Count -eq 0) {
            Write-Host ("  note: ahead=$($preflight.Ahead) commit(s) are all auto-generated " +
                        "checkpoints — bypassing -AllowAheadCommits requirement.") -ForegroundColor DarkGray
        } else {
            Write-Error ("ao-close: preflight blocked — local branch is $($preflight.Ahead) commit(s) " +
                "ahead including human-authored work.`n" +
                "  Re-run with -AllowAheadCommits to continue.")
            exit 1
        }
    }
    if ($preflight.Ahead -gt 0 -and $AllowAheadCommits) {
        Write-Host "  note: -AllowAheadCommits acknowledged; continuing with existing ahead=$($preflight.Ahead)." -ForegroundColor Yellow
    }
} else {
    Write-Host "  branch: $($preflight.Branch) | remote ref not found yet (no ahead/behind snapshot) | dirty=$($preflight.Dirty)" -ForegroundColor DarkGray
}

$scaffoldScript = Join-Path $WorkRoot "scripts\ensure-daily-progress-scaffold.ps1"
if (Test-Path -LiteralPath $scaffoldScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scaffoldScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: ensure-daily-progress-scaffold failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
}

# Inbox guard (before merge resets inbox). Default off (single-AI; closeout-inbox is dual-IDE legacy).
if (-not $SkipInboxGuard -and $InboxGuardMode -ne "off") {
    Write-Host "== AO-CLOSE: closeout inbox guard ($InboxGuardMode) ==" -ForegroundColor Cyan
    Push-Location $WorkRoot
    try {
        $today = Get-Date
        $dayStart = (Get-Date -Year $today.Year -Month $today.Month -Day $today.Day -Hour 0 -Minute 0 -Second 0)
        $since = $dayStart.ToString("yyyy-MM-dd HH:mm:ss")
        $branch = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD 2>$null }).Trim()
        if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") {
            Write-Host "AO-CLOSE inbox guard: detached HEAD; skip commit coverage check." -ForegroundColor DarkGray
            $todayCommits = @()
        } else {
            $remoteRef = "origin/$branch"
            git rev-parse --verify $remoteRef 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $logRange = "$remoteRef..HEAD"
            } else {
                $logRange = "HEAD"
            }
            $todayCommits = @(
                git log $logRange --since="$since" --pretty=format:"%h" 2>$null |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
            )
        }

        if ($todayCommits.Count -gt 0) {
            $inboxPath = Join-Path $WorkRoot "agency-os\.agency-state\closeout-inbox.md"
            $inboxExists = Test-Path -LiteralPath $inboxPath
            if (-not $inboxExists) {
                $msg = "ao-close: closeout-inbox missing at $inboxPath. Run scripts\init-closeout-inbox.ps1 and append today's entries."
                if ($InboxGuardMode -eq "strict") {
                    Add-CloseoutGateResult -Gate $gate -Name "closeout-inbox (strict)" -Failed $true -Detail $msg -Fix "run scripts\init-closeout-inbox.ps1 and append today's entries, or use -InboxGuardMode warn"
                } else {
                    Write-Warning $msg
                }
            } else {
                $inboxText = Get-Content -LiteralPath $inboxPath -Raw -Encoding UTF8
                $todayToken = $today.ToString("yyyy-MM-dd")
                $hasTodaySection = [regex]::IsMatch(
                    $inboxText,
                    "(?m)^###\s+(?!example-agent\b).*" + [regex]::Escape($todayToken) + ".*$",
                    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
                )

                if (-not $hasTodaySection) {
                    $msg = "ao-close: unpushed commits exist today ($($todayCommits.Count)), but closeout-inbox has no real section for $todayToken. Add: '### <AGENT_ID> <yyyy-MM-dd HH:mm>' (or rely on merge after other agents append)."
                    if ($InboxGuardMode -eq "strict") {
                        Add-CloseoutGateResult -Gate $gate -Name "closeout-inbox today section (strict)" -Failed $true -Detail $msg -Fix "add '### <AGENT_ID> <yyyy-MM-dd HH:mm>' to closeout-inbox, or use -InboxGuardMode warn"
                    } else {
                        Write-Warning $msg
                    }
                }
            }
        } else {
            Write-Host "No unpushed commits today on current branch; inbox guard skipped." -ForegroundColor DarkGray
        }
    } finally {
        Pop-Location
    }
} elseif ($SkipInboxGuard -or $InboxGuardMode -eq "off") {
    Write-Host "== AO-CLOSE: inbox guard disabled ==" -ForegroundColor DarkYellow
}

# Prior-close archive report guard (2026-06-10): every "[claude|cursor] chore: AO-CLOSE sync <date> <hhmm>"
# commit must have a matching agency-os/reports/ao-close/<date>-<hhmm>.md (the four-section report the agent
# writes per the ao-close skill Final Step). Root cause: the report write was agent-discretion and got
# repeatedly forgotten (no machine check). This deferred ratchet validates the PREVIOUS close's report on the
# NEXT close and blocks until written — same pattern as the archive-lift gate. Confident-parse + definite-
# absence only: if no sync commit is found or the subject does not parse, it skips (never a false block).
Write-Host "== AO-CLOSE: prior-close archive report guard ==" -ForegroundColor Cyan
Push-Location $WorkRoot
try {
    $lastSyncSubject = (git log -1 --pretty=format:"%s" --grep="chore: AO-CLOSE sync" 2>$null)
    if (-not [string]::IsNullOrWhiteSpace($lastSyncSubject)) {
        $m = [regex]::Match($lastSyncSubject, 'AO-CLOSE sync (\d{4}-\d{2}-\d{2}) (\d{4})')
        if ($m.Success) {
            $rptName = "{0}-{1}.md" -f $m.Groups[1].Value, $m.Groups[2].Value
            $rptPath = Join-Path $WorkRoot ("agency-os\reports\ao-close\" + $rptName)
            # Prune-horizon skip (critic m1): the ao-close skill prunes reports older than 90 days.
            # If a session gap exceeds that, the prior report was legitimately deleted — checking for it
            # would false-block forever (you cannot un-prune). Skip when the parsed date is past the horizon.
            # Use -89 (not -90) so this skip window STRICTLY CONTAINS the pruner's >90d delete window — a
            # 1-day safety margin against an off-by-one in the pruner's comparison (critic 2nd-pass Minor#2),
            # since the pruner lives in the skill (out of this file). Worst case we skip one extra day's check.
            $rptDate = [datetime]::MinValue
            $parsedOk = [datetime]::TryParseExact($m.Groups[1].Value, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$rptDate)
            if ($parsedOk -and $rptDate -lt (Get-Date).Date.AddDays(-89)) {
                Write-Host "  prior-close report past 90d prune horizon ($rptName); skip (legitimately pruned)." -ForegroundColor DarkGray
            } elseif (-not (Test-Path -LiteralPath $rptPath)) {
                Add-CloseoutGateResult -Gate $gate -Name "prior AO-CLOSE archive report" -Failed $true `
                    -Detail "last AO-CLOSE sync commit ($($m.Groups[1].Value) $($m.Groups[2].Value)) has no archive report at agency-os/reports/ao-close/$rptName" `
                    -Fix "write the four-section AO-CLOSE report to agency-os/reports/ao-close/$rptName (ao-close skill Final Step), then re-run ao-close.ps1"
            } elseif ((Get-Content -LiteralPath $rptPath -Raw -Encoding UTF8) -match 'AUTO-SKELETON') {
                # M3-3 fix (critic round 3): existence alone is not enough once this
                # script commits+pushes the skeleton itself (M2/M-C fix, 2026-09-03) --
                # "forgot to overwrite", "overwrote but forgot to commit", and "wrong
                # timestamp guessed" all now leave a file that EXISTS at $rptPath and
                # would silently pass an existence-only check, while what actually
                # reached origin is the stub whose own text says "seeing this stub
                # committed means the agent forgot to fill it". Keyed on the literal
                # marker this script itself writes into the skeleton template below.
                Add-CloseoutGateResult -Gate $gate -Name "prior AO-CLOSE archive report content" -Failed $true `
                    -Detail "agency-os/reports/ao-close/$rptName is still the AUTO-SKELETON stub (agent did not overwrite it, or overwrote but never committed it)" `
                    -Fix "overwrite it with the real four-section report, then git add + commit + push it (ao-close skill Final Step), then re-run ao-close.ps1"
            } else {
                Write-Host "  prior-close report present: $rptName" -ForegroundColor DarkGray
            }
        }
    }
} finally {
    Pop-Location
}

$mergeInboxScript = Join-Path $WorkRoot "scripts\merge-closeout-inbox-into-progress.ps1"
if (Test-Path -LiteralPath $mergeInboxScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $mergeInboxScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: merge-closeout-inbox-into-progress failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
}

$recapScript = Join-Path $WorkRoot "scripts\print-today-closeout-recap.ps1"
if (-not $SkipTodayRecap -and (Test-Path -LiteralPath $recapScript)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $recapScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: print-today-closeout-recap failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
} elseif ($SkipTodayRecap) {
    Write-Host "== AO-CLOSE: -SkipTodayRecap (略過今日機器摘要) ==" -ForegroundColor DarkYellow
}

if (-not $SkipPush -and -not $AllowPushWhileBehind) {
    Write-Host "== AO-CLOSE: git fetch + push safety (ahead/behind vs origin) ==" -ForegroundColor Cyan
    Push-Location $WorkRoot
    try {
        $null = git rev-parse --git-dir 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-close: not a git repository at $WorkRoot"
            exit 1
        }
        # Phase C (2026-05-30): was `git fetch origin 2>&1 | Out-Host` — caused NativeCommandError
        # under PS5.1 EAP=Stop whenever git wrote "From https://..." to stderr.
        if (Get-Command Invoke-SafeGitFetch -ErrorAction SilentlyContinue) {
            Invoke-SafeGitFetch -WorkRoot $WorkRoot -Prune
        } else {
            $savedEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            try { & git fetch origin --prune 2>&1 | Out-Host; $fetchExit = $LASTEXITCODE }
            finally { $ErrorActionPreference = $savedEAP }
            if ($fetchExit -ne 0) {
                Write-Error "ao-close: git fetch failed (exit $fetchExit); fix network/auth or pass -SkipPush."
                exit 1
            }
        }

        $branch = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD }).Trim()
        if ($branch -ne "HEAD") {
            $remoteRef = "origin/$branch"
            git rev-parse --verify $remoteRef 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $lr = (git rev-list --left-right --count "${remoteRef}...HEAD").Trim()
                $parts = @($lr -split '\s+' | Where-Object { $_ })
                if ($parts.Count -ge 2) {
                    $behind = [int]$parts[0]
                    $ahead = [int]$parts[1]
                    if ($behind -gt 0) {
                        Write-Error ("ao-close: remote is ahead by $behind commit(s) — local main is stale.`n" +
                            "  Fix: run AO-RESUME first (which will git pull), then AO-CLOSE again.`n" +
                            "  Quick fix (if safe): git pull --ff-only origin $branch`n" +
                            "  Bypass (unsafe): pass -AllowPushWhileBehind")
                        exit 1
                    }
                }
            }
        }
    } finally {
        Pop-Location
    }
} elseif ($AllowPushWhileBehind) {
    Write-Host "== AO-CLOSE: -AllowPushWhileBehind set; skipping behind-remote guard ==" -ForegroundColor Yellow
}

$verifyScript = Join-Path $WorkRoot "scripts\verify-build-gates.ps1"
if (-not $SkipVerify -and (Test-Path -LiteralPath $verifyScript)) {
    Write-Host "== AO-CLOSE: verify-build-gates (lobster bootstrap + agency health) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Add-CloseoutGateResult -Gate $gate -Name "verify-build-gates" -Failed $true -Detail "verify-build-gates exited $LASTEXITCODE (see output above)" -Fix "fix the failing build gate(s) reported above"
    }
} elseif ($SkipVerify) {
    Write-Host "== AO-CLOSE: -SkipVerify set; skipping verify-build-gates ==" -ForegroundColor Yellow
}

# --- Claude Code user-level sync self-heal (deterministic, runs BEFORE health gate) ---
# Root cause (2026-06-08 investigation): the real recurring drift was ~/.claude/mcp.json being
# re-populated by the Claude Code runtime (22 MCP servers on 2026-06-02) while the SSOT mandates
# {} (project-scoped .mcp.json is the SSOT). It surfaced as a CRITICAL fail at AO-CLOSE, forcing
# the agent to manually run `sync-claude-userlevel.ps1 -Mode merge` — and the manual narrative was
# then copied forward and MIS-LABELLED as "hooks object→array" (that class was already neutralised
# by verify-settings-governed-keys.mjs on 2026-05-14; proven by test). Auto-heal the deterministic
# fix so the gate stops blocking close on a problem with a known, backup-first, idempotent remedy.
# Conditional: only merge when verify actually reports drift → zero side effects on a clean run.
$syncScript = Join-Path $WorkRoot "scripts\sync-claude-userlevel.ps1"
if (Test-Path -LiteralPath $syncScript) {
    Write-Host "== AO-CLOSE: Claude Code sync self-heal (verify -> merge only if drift) ==" -ForegroundColor Cyan
    # try/catch: an unexpected fault must degrade to "let the health gate decide", never abort close
    # (parity with the ao-resume skeleton block's non-fatal design). The & powershell.exe calls do not
    # throw on non-zero exit, but $ErrorActionPreference='Stop' would surface any other terminating error.
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Mode verify *> $null
        if ($LASTEXITCODE -ne 0) {
            # merge WITH backup (default): the merge mutates ~/.claude/mcp.json, so a recovery copy is
            # warranted here most of all; Initialize-BackupDir prunes on a time window (see
            # scripts/lib/backup-retention.ps1) so repeated auto-heals never spam the backup dir.
            Write-Host "  sync drift detected -> running -Mode merge (backup-first, retention-capped) auto-heal" -ForegroundColor Yellow
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Mode merge
            # Re-verify; if it still fails, do NOT swallow — let the health gate (check-claude-sync) surface it.
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Mode verify *> $null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  sync self-heal OK (verify clean after merge)." -ForegroundColor Green
            } else {
                Write-Host "  WARN: sync still drifts after merge — health gate (check-claude-sync) will report specifics." -ForegroundColor Yellow
            }
        } else {
            Write-Host "  sync clean (no drift; no merge needed)." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host ("  WARN: sync self-heal errored (non-fatal; health gate will decide): {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }
}
# --- end Claude Code user-level sync self-heal ---

# --- Codex Claude-first bridge self-heal and proof ---
$codexBridgeSync = Join-Path $WorkRoot "mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1"
$codexParityCheck = Join-Path $WorkRoot "mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1"
if ((Test-Path -LiteralPath $codexBridgeSync) -and (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex'))) {
    Write-Host "== AO-CLOSE: Codex Claude-first bridge sync + parity proof ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $codexBridgeSync -WorkRoot $WorkRoot -Mode linked
    if ($LASTEXITCODE -ne 0) {
        Add-CloseoutGateResult -Gate $gate -Name "codex Claude-first bridge sync" -Failed $true -Detail "sync-claude-to-codex exited $LASTEXITCODE" -Fix "run mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1 -WorkRoot $WorkRoot -Mode linked and inspect its backup"
    } elseif (Test-Path -LiteralPath $codexParityCheck) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $codexParityCheck -WorkRoot $WorkRoot
        if ($LASTEXITCODE -ne 0) {
            Add-CloseoutGateResult -Gate $gate -Name "codex Claude-first bridge parity" -Failed $true -Detail "check-claude-codex-parity exited $LASTEXITCODE" -Fix "repair the failed named parity check, then rerun the generated bridge sync"
        }
    }
}

Write-Host "== AO-CLOSE: system-guard (doc-sync + health + guard) ==" -ForegroundColor Cyan
$guardArgs = @("-WorkspaceRoot", $agencyRoot, "-Mode", "manual")
if ($AllowNonPerfectHealth) { $guardArgs += @("-MinHealthScore", "0") }
# Enable AO-RESUME archive *content* enforcement (sec0/sec6/sec7 must be filled, no surviving
# skeleton) ONLY here at AO-CLOSE. Inherited by the guard -> system-health-check ->
# verify-aoresume-archive child processes. AO-RESUME leaves this unset = existence-only.
$env:AORESUME_ARCHIVE_ENFORCE_CONTENT = '1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guardScript @guardArgs
$env:AORESUME_ARCHIVE_ENFORCE_CONTENT = $null
$guardExit = $LASTEXITCODE
if ($guardExit -ne 0) {
    Add-CloseoutGateResult -Gate $gate -Name "system-guard (health/doc-sync/closeout)" -Failed $true -Detail "system-guard exited $guardExit" -Fix "fix the failing health/closeout items in LAST_SYSTEM_STATUS.md (doc-sync already ran)"
}

$genScript = Join-Path $agencyRoot "scripts\generate-integrated-status-report.ps1"
if (Test-Path -LiteralPath $genScript) {
    Write-Host "== AO-CLOSE: generate integrated-status report ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $genScript -WorkspaceRoot $agencyRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: generate-integrated-status-report failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# Enforce health score = 100% by default (unless explicitly relaxed).
# Prefer machine-readable health-*.json (schemaVersion=1); fallback to Markdown line.
$healthDir = Join-Path $agencyRoot "reports\health"
if (Test-Path -LiteralPath $healthDir) {
    $hasHealthArtifact = @(
        @(Get-ChildItem -LiteralPath $healthDir -Filter "health-*.md" -File -ErrorAction SilentlyContinue) +
        @(Get-ChildItem -LiteralPath $healthDir -Filter "health-*.json" -File -ErrorAction SilentlyContinue)
    ).Count -gt 0
    if ($hasHealthArtifact) {
        $score = $null
        if (Get-Command Get-LatestHealthScorePercent -ErrorAction SilentlyContinue) {
            $score = Get-LatestHealthScorePercent -HealthDir $healthDir
        }
        if ($null -eq $score) {
            $latestHealth = Get-ChildItem -LiteralPath $healthDir -Filter "health-*.md" -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending |
                Select-Object -First 1
            if ($latestHealth) {
                $healthText = Get-Content -LiteralPath $latestHealth.FullName -Raw -Encoding UTF8
                $scoreMatch = [regex]::Match($healthText, 'Score:\s*\*\*([0-9]+(?:\.[0-9]+)?)%')
                if ($scoreMatch.Success) {
                    $score = [double]$scoreMatch.Groups[1].Value
                }
            }
        }
        if ($null -ne $score) {
            if (($score -lt 100.0) -and (-not $AllowNonPerfectHealth)) {
                Add-CloseoutGateResult -Gate $gate -Name "health score 100%" -Failed $true -Detail "health score is $score% (<100%)" -Fix "fix the failing health checks (see reports/health), or rerun with -AllowNonPerfectHealth only when explicitly approved"
            }
            if (($score -lt 100.0) -and $AllowNonPerfectHealth) {
                Write-Host "== AO-CLOSE: health score $score% allowed by -AllowNonPerfectHealth ==" -ForegroundColor Yellow
            }
        } elseif (-not $AllowNonPerfectHealth) {
            Add-CloseoutGateResult -Gate $gate -Name "health score parse" -Failed $true -Detail "unable to parse health score from JSON or Markdown under $healthDir" -Fix "ensure system-health-check wrote a valid health-*.json/md, or rerun with -AllowNonPerfectHealth"
        }
    }
}

$applyMarks = Join-Path $WorkRoot "scripts\apply-closeout-task-checkmarks.ps1"
if (-not $SkipAutoTaskCheckmarks -and (Test-Path -LiteralPath $applyMarks)) {
    Write-Host "== AO-CLOSE: TASKS checkmarks (WORKLOG AUTO_TASK_DONE + optional pending file) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $applyMarks -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: apply-closeout-task-checkmarks failed (exit $LASTEXITCODE). Fix WORKLOG markers, pending file, or TASKS.md."
        exit $LASTEXITCODE
    }
} elseif ($SkipAutoTaskCheckmarks) {
    Write-Host "== AO-CLOSE: -SkipAutoTaskCheckmarks（略過自動打勾）==" -ForegroundColor DarkYellow
}

$dispatchScript = Join-Path $WorkRoot "scripts\append-agent-dispatch-to-worklog.ps1"
if (Test-Path -LiteralPath $dispatchScript) {
    Write-Host "== AO-CLOSE: agent dispatch summary → WORKLOG ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dispatchScript -WorkRoot $WorkRoot
}

# WORKLOG monthly rotation (2026-07-02): keep current + previous month in
# WORKLOG.md; older day-blocks move to agency-os/WORKLOG-archive/YYYY-MM.md.
# Best-effort: node missing or script failure never blocks close-out (the next
# close retries). Runs BEFORE git add so rotated files land in this commit.
$rotateScript = Join-Path $WorkRoot "scripts\rotate-worklog.mjs"
if (Test-Path -LiteralPath $rotateScript) {
    Write-Host "== AO-CLOSE: WORKLOG monthly rotation ==" -ForegroundColor Cyan
    try {
        & node $rotateScript --repo $WorkRoot
        if ($LASTEXITCODE -ne 0) { Write-Warning "AO-CLOSE: rotate-worklog exited $LASTEXITCODE (non-fatal; will retry next close)" }
    } catch {
        Write-Warning "AO-CLOSE: rotate-worklog failed (non-fatal): $_"
    }
}

Write-Host ""
Write-Host "=== AO-CLOSE: automation boundary (every run) ===" -ForegroundColor Cyan
Write-Host "SCRIPT DID: daily scaffold; inbox guard; merge-closeout-inbox (verbatim -> WORKLOG + memory/daily + CONVERSATION_MEMORY pointer); recap; verify/guard/report; apply AUTO_TASK_DONE -> TASKS; after git add, verify-closeout-completeness (default strict) before commit." -ForegroundColor Green
Write-Host "SCRIPT DID NOT: infer task completion; write AUTO_TASK_DONE lines; author CONVERSATION_MEMORY prose (agent must edit that file BEFORE this script, same AO-CLOSE turn); touch LAST_AO_RESUME_BRIEF (AO-RESUME only) or SESSION_TEMPLATE." -ForegroundColor Yellow
Write-Host "Legend: agency-os/memory/MEMORY_INDEX.md; rules: 10-memory-maintenance + 40-shutdown-closeout." -ForegroundColor DarkGray
Write-Host ""

if ($SkipPush) {
    Write-Host "== AO-CLOSE: -SkipPush set; skipping git commit/push ==" -ForegroundColor Yellow
    # Pre-stage quality gates still apply with -SkipPush (matches old per-gate exits, which
    # fired before this point). Post-stage gates need git add, which -SkipPush never reaches.
    if (Invoke-CloseoutGateDecision -Gate $gate) { exit 1 }
    exit 0
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: not a git repository at $WorkRoot"
        exit 1
    }

    # ── Report retention (added 2026-08-26) ──────────────────────────────────────
    # Runs BEFORE staging so deletions land in the same commit as the close-out, rather than
    # showing up as unexplained removals in the next one. Warn-only by contract: housekeeping
    # must never block a close-out. Policy: agency-os/reports/retention.json.
    $pruneScript = Join-Path $PSScriptRoot "prune-reports.ps1"
    if (Test-Path -LiteralPath $pruneScript) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pruneScript -WorkRoot $WorkRoot | Out-Host
        $global:LASTEXITCODE = 0
    }

    # ── Unverified-code gate (added 2026-08-25) ──────────────────────────────────
    # AO-CLOSE commits AND pushes. Until now it consulted verify-build-gates and
    # verify-closeout-completeness but never the per-session code-change tracker, so code
    # that never passed /verify-recent could still reach main through this door.
    # The auto-checkpoint that used to walk through the same door on every prompt is gone
    # (2026-08-25); this is the last one, and unlike that one it is at least deliberate.
    # Refusing rather than warning: AO-CLOSE is preauthorised to self-heal, so the correct
    # response is to run /verify-recent and re-run, not to publish and hope.
    $sidHelper = Join-Path $PSScriptRoot "verify-sid-shared.ps1"
    if (Test-Path -LiteralPath $sidHelper) {
        . $sidHelper
        $ttf = Get-VerifyTrackerPath -Sid (Get-VerifySid)
        if ($ttf -and (Test-Path -LiteralPath $ttf)) {
            $pending = @(Get-Content -LiteralPath $ttf -Encoding UTF8 |
                         ForEach-Object { $_.Trim() } |
                         Where-Object { $_ -and $_ -notmatch '^#' })
            if ($pending.Count -gt 0) {
                Write-Error @"
ao-close: refusing to commit -- $($pending.Count) code file(s) have not been verified this session:
$($pending -join "`n")

Run /verify-recent (or /verify-recent --trivial for comment-only edits), then re-run AO-CLOSE.
"@
                exit 1
            }
        }
    }

    # ── Last line of defence before staging (moved here 2026-08-25; staging itself
    # de-scoped from `git add -A` on 2026-09-03, see Get-AoCloseStagePaths above) ──
    # These two guards lived in commit-checkpoint.ps1 and protected ITS `git add -A`.
    # That call site is gone (checkpoint now requires explicit -Paths), and THIS
    # call site no longer blindly stages everything either -- but both guards stay:
    # Guard 1 is still relevant whenever `.claude` paths legitimately end up in the
    # scoped list (this session edited something under `.claude/`), and Guard 2 is
    # cheap, unconditional insurance against a scoped path itself being shell-junk
    # (e.g. a stray `$null` this session's own tool calls happened to create).
    # Leaving the guards behind in a script that no longer stages blindly would have
    # retired the protection while the danger (a broken junction, stray junk) can
    # still occur for the SAME underlying reasons, just through a narrower door.

    # Guard 1 -- broken .claude junction. ensure-claude-junction.ps1 runs at
    # UserPromptSubmit STEP 0 and at health gate 12b, but both are point-in-time: if the
    # junction dies mid-session, every earlier check has already passed and nothing
    # stands between staging `.claude/...` paths and a commit that deletes the whole
    # shared .claude/ tree for every machine. Observed twice: 49 tracked files
    # (2026-05-28, 0d63eb9) and 12 files under .claude/plans/ (853cd26a, back when
    # staging WAS `git add -A`; kept as a guard because the failure mode is identical
    # whenever `.claude` paths are in the scoped list, not specific to `-A`). Runs
    # immediately before staging.
    $claudeJunction = Join-Path $WorkRoot ".claude"
    # UTF-8 wrapped: tracked paths under .claude/ may contain non-ASCII, and a CP950
    # console mangles them on capture (scripts/audit-cp950-traps.ps1 trap class).
    $claudeTracked = @(Invoke-WithUtf8Console { & git ls-files -- ".claude" 2>$null })
    if ($claudeTracked.Count -gt 0 -and -not (Test-Path -LiteralPath $claudeJunction)) {
        Write-Error @"
ao-close: refusing to stage. '.claude' is tracked in git ($($claudeTracked.Count) files)
but does not exist on disk. The junction is broken, so staging any '.claude/...' path
would record it as a DELETION and propagate that to all machines on push.

Repair it first, then re-run:
  powershell -NoProfile -ExecutionPolicy Bypass -File "$WorkRoot\scripts\ensure-claude-junction.ps1"
"@
        exit 1
    }

    # Scoped add (TASKS.md 544 "AO-CLOSE 的 git add -A" -- replaces the former
    # `git add -A`): only paths this session's own Write/Edit tool calls touched
    # (session-edit-tracker.js), this session's own verified `git add`s
    # (git-add-scope-tracker.js), or AO-CLOSE's own pipeline steps produced this run
    # (the $aoCloseBaselineStatus vs. now diff) get staged. See Get-AoCloseStagePaths
    # above for the full rationale and all three sources.
    #
    # C1 fix (critic finding, 2026-09-03): PowerShell returning an EMPTY array from a
    # function/pipeline collapses to $null, not @() -- under this script's
    # Set-StrictMode + $ErrorActionPreference='Stop', `$null.SomeProperty` throws
    # PropertyNotFound. Reproduced live: any run with nothing to stage (common --
    # e.g. a re-run after a push failure where everything is already committed)
    # crashed here with a raw stack trace, AFTER the pipeline had already mutated
    # the working tree and BEFORE any commit/push. `$result` below is never $null
    # (Get-AoCloseStagePaths always returns a pscustomobject), but its array
    # PROPERTIES need the same @() guard at the point they're read.
    $result = Get-AoCloseStagePaths -RepoRoot $WorkRoot -BaselineStatusRawZ $aoCloseBaselineStatus
    $stagePaths = @($result.StagePaths)
    $foreignStagedAtBaseline = @($result.ForeignStagedAtBaseline)
    $foreignStagedResetPaths = @($result.ForeignStagedResetPaths)
    $leftUnstaged = @($result.LeftUnstaged)

    if ($result.SessionTrackerMissing) {
        Write-Warning "ao-close: session-edit-tracker.js's tracker file was not found -- this session's own Write/Edit-tool file edits (if any) will only be staged if AO-CLOSE's own pipeline also touched them. (Normal for a session that made no Write/Edit calls, or if mcp/claude-userlevel/hooks/ was synced to ~/.claude/ mid-session -- see WORKLOG 2026-09-03.)"
    }
    if ($result.TrackerTruncated) {
        Write-Warning "ao-close: a session tracker (session-edit-tracker.js or git-add-scope-tracker.js) hit its 500-entry cap and truncated -- some of this session's own file edits/adds may be MISSING from staging. See lib/shared.js TRACKER_MAX_ENTRIES."
    }

    # M1 fix (critic finding, 2026-09-03): unstage (NOT discard -- `git reset` only
    # touches the index, the working-tree content is untouched and fully recoverable)
    # any baseline index entry this session cannot account for, BEFORE the scoped
    # add below. `git commit` publishes the WHOLE index regardless of what gets
    # `git add`-ed now, so leaving these staged would let AO-CLOSE's commit absorb
    # another session's already-staged work -- the exact mis-attribution bug this
    # fix exists to close, reached through the index instead of a blind `-A`.
    if ($foreignStagedAtBaseline.Count -gt 0) {
        Write-Host "== AO-CLOSE: unstaging $($foreignStagedAtBaseline.Count) path(s) already staged by something other than this session ==" -ForegroundColor Yellow
        foreach ($f in $foreignStagedAtBaseline) { Write-Host "  unstaging (left on disk, untouched): $f" -ForegroundColor Yellow }
        # C-B fix: $foreignStagedResetPaths includes the paired OLD path for any
        # foreign rename/copy (see Get-AoCloseStagePaths / ConvertTo-StatusPathMap) --
        # resetting only the new path would leave the old path staged as a bare
        # deletion of another session's file.
        # m-E fix: chunked, same reasoning as the `git add` chunking below (m4) --
        # an ACK'd broad add by another session can leave hundreds of paths staged.
        $resetChunkSize = 100
        $resetFailedAt = $null
        Push-Location $WorkRoot
        try {
            for ($i = 0; $i -lt $foreignStagedResetPaths.Count; $i += $resetChunkSize) {
                $chunk = $foreignStagedResetPaths[$i..([Math]::Min($i + $resetChunkSize, $foreignStagedResetPaths.Count) - 1)]
                & git reset -q -- $chunk
                if ($LASTEXITCODE -ne 0) { $resetFailedAt = $i; break }
            }
        } finally { Pop-Location }
        if ($null -ne $resetFailedAt) {
            Write-Error "ao-close: git reset (unstaging foreign index entries) failed (chunk starting at index $resetFailedAt)"
            exit 1
        }
    }

    if ($stagePaths.Count -gt 0) {
        Write-Host "== AO-CLOSE: staging $($stagePaths.Count) path(s) (session edits + this run's own pipeline output) ==" -ForegroundColor Cyan
        # m4 fix (critic finding): chunk the pathspec list. A 500-entry tracker at
        # ~60 chars/path approaches the ~32KB Windows command-line limit; overflow
        # previously surfaced as an opaque `git add failed`.
        $addChunkSize = 100
        $addFailedAt = $null
        Push-Location $WorkRoot
        try {
            for ($i = 0; $i -lt $stagePaths.Count; $i += $addChunkSize) {
                $chunk = $stagePaths[$i..([Math]::Min($i + $addChunkSize, $stagePaths.Count) - 1)]
                & git add -- $chunk
                if ($LASTEXITCODE -ne 0) { $addFailedAt = $i; break }
            }
        } finally { Pop-Location }
        if ($null -ne $addFailedAt) {
            Write-Error "ao-close: git add failed (chunk starting at index $addFailedAt)"
            exit 1
        }
    } else {
        Write-Host "== AO-CLOSE: nothing to stage (no session edits or pipeline output this run) ==" -ForegroundColor DarkGray
    }

    # M3 fix (critic finding, 2026-09-03): print what's dirty right now but NOT
    # staged -- every silent-drop scenario above (out-of-root session path, a path
    # gone stale between capture and staging, ...) becomes visible here instead of
    # invisible. This is also what a concurrent session's genuinely unrelated
    # uncommitted work looks like -- expected to appear here, not an error.
    if ($leftUnstaged.Count -gt 0) {
        Write-Host "== AO-CLOSE: $($leftUnstaged.Count) dirty path(s) left unstaged (not attributable to this session) ==" -ForegroundColor DarkGray
        foreach ($f in ($leftUnstaged | Select-Object -First 20)) { Write-Host "  left unstaged: $f" -ForegroundColor DarkGray }
        if ($leftUnstaged.Count -gt 20) { Write-Host "  ...and $($leftUnstaged.Count - 20) more" -ForegroundColor DarkGray }
    }

    # Guard 2 -- shell-artifact junk. Kept as unconditional insurance even though
    # staging is now scoped: a stray `$null`/word-split file could in principle still
    # land in $stagePaths if this session's own tool calls created one. Was originally
    # written for `git add -A` blindly staging shell accidents: literal `$null`/`null`
    # (PowerShell-style redirection run under bash) and 0-byte files whose NAMES are
    # doc-content fragments (word-split heredoc). Those reached the SSOT on 2026-06-20
    # (16d95c8). Policy: UNSTAGE junk and continue, never abort -- the close-out's real
    # work must still be committed.
    # Delegated to Node: with git's default core.quotePath=true, non-ASCII staged names
    # reach PowerShell as octal-escaped ASCII, so a PS-side non-ASCII test never fires.
    $junkGuard = Join-Path $PSScriptRoot "checkpoint-junk-guard.mjs"
    if (Test-Path -LiteralPath $junkGuard) {
        try {
            & node $junkGuard --repo $WorkRoot
            if ($LASTEXITCODE -ne 0) { Write-Warning "ao-close: junk guard exited $LASTEXITCODE (continuing)" }
        } catch {
            Write-Warning "ao-close: junk guard unavailable ($($_.Exception.Message)); continuing"
        }
    }

    # Sensitive-path gate input. Hardening, NOT a fix for a reachable bug -- stated plainly so a
    # future reader does not treat this as load-bearing and does not re-derive the analysis:
    # a CP950 capture here CAN swallow a newline and merge two staged paths, but it cannot defeat
    # this gate. `git diff --cached --name-only` emits index order = sorted by path bytes, so every
    # ASCII path (`.claude/...` = 0x2E, `mcp-local-wrappers/...` = 0x6D) sorts BEFORE every
    # non-ASCII path (0xE4+) and can never be the absorbed tail of a mojibaked predecessor. A
    # sensitive path under a CJK directory survives too: merging preserves the `/` in front of
    # `.claude`, and `\.credentials\.json$` still anchors at the end of the merged string.
    # Verified empirically 2026-08-25 (303 staged files, 3 sensitive, core.quotePath=false, big5
    # console): bare and wrapped both matched 3/3.
    # Kept anyway for two reasons:
    #  - -c core.quotepath=false pins the path encoding instead of inheriting an unowned git
    #    config, so this gate's behaviour stops depending on a setting nobody owns.
    #  - it makes this query byte-identical to the sibling gate at
    #    verify-closeout-completeness.ps1:61, so the two cannot drift apart.
    $staged = @(Invoke-WithUtf8Console { git -c core.quotepath=false diff --cached --name-only } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $sensitive = @($staged | Where-Object { $_ -match '(?i)(^|/)\.claude/|\.credentials\.json$|(^|/)mcp-local-wrappers/node_modules/' })
    if ($sensitive.Count -gt 0) {
        Add-CloseoutGateResult -Gate $gate -Name "sensitive path guard" -Failed $true -Detail ("staged sensitive/ignored path(s): " + ($sensitive -join ", ")) -Fix "git reset these paths and add to .gitignore; memory/.claude must not enter git (CLAUDE.md R1)"
    }

    # Routed through the EAP-protected lib helper: git diff can emit stderr (e.g. CRLF
    # warnings) which under EAP=Stop + 2>&1 throws NativeCommandError before $patch is set.
    $patch = (Invoke-SafeGitCapture -GitArgs @('diff', '--cached', '-U0') -WorkRoot $WorkRoot).Text
    if ($patch -match '(?m)^\+<<<<<<< ') {
        Add-CloseoutGateResult -Gate $gate -Name "merge conflict markers" -Failed $true -Detail "staged diff contains +<<<<<<< conflict markers" -Fix "resolve the merge conflicts before commit"
    }

    $complScript = Join-Path $WorkRoot "scripts\verify-closeout-completeness.ps1"
    if (-not $SkipCompletenessGate -and (Test-Path -LiteralPath $complScript)) {
        Write-Host "== AO-CLOSE: verify-closeout-completeness ($CompletenessGate) ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $complScript -WorkRoot $WorkRoot -Gate $CompletenessGate
        if ($LASTEXITCODE -ne 0) {
            Add-CloseoutGateResult -Gate $gate -Name "verify-closeout-completeness ($CompletenessGate)" -Failed $true -Detail "completeness/bughunt-oracle gate exited $LASTEXITCODE (see output above)" -Fix "add today's WORKLOG evidence (- AUTO_TASK_DONE: and/or inbox merge block), or use -CompletenessGate warn / -SkipCompletenessGate"
        }
    }

    # --- Phase 3 -> Phase 4 boundary: single decision point ---
    # Every quality gate above (pre-stage + post-stage) recorded into $gate instead of exiting.
    # Report ALL blockers at once and refuse to publish (commit/push/export) if any exist.
    # This is the one-pass replacement for the old scattered per-gate `exit 1` calls.
    if (Invoke-CloseoutGateDecision -Gate $gate) { exit 1 }

    # Captured ONCE so the auto commit subject and the skeleton report filename below share the exact
    # same minute (kills the timestamp-drift false-block class — critic M1, 2026-06-10). Stays $null when
    # the operator supplies -CommitMessage / -CommitMessageFile (then no deterministic name → skip skeleton).
    $autoCloseStamp = $null
    $hasStaged = $staged.Count -gt 0
    if ($hasStaged) {
        $resolvedMsgFile = $null
        if ($CommitMessageFile) {
            $resolvedMsgFile = if ([System.IO.Path]::IsPathRooted($CommitMessageFile)) { $CommitMessageFile } else { Join-Path $WorkRoot $CommitMessageFile }
            if (-not (Test-Path -LiteralPath $resolvedMsgFile)) {
                Write-Error "ao-close: -CommitMessageFile not found: $resolvedMsgFile"
                exit 1
            }
            $fileBody = (Get-Content -LiteralPath $resolvedMsgFile -Raw -Encoding UTF8).Trim()
            if ([string]::IsNullOrWhiteSpace($fileBody)) {
                Write-Error "ao-close: -CommitMessageFile is empty: $resolvedMsgFile"
                exit 1
            }
        }
        if (-not $CommitMessage -and -not $resolvedMsgFile) {
            # Auto-commit prefix. Detect actor from env signals; default [claude].
            # (Historical note: the CLAUDE.md "Commit Prefix" section this used to cite was
            # removed in the 2026-09-04 slimming -- this script is now the SSOT for the default.)
            # Override via env AO_CLOSE_COMMIT_PREFIX or by passing -CommitMessage / -CommitMessageFile.
            $autoPrefix = "[claude]"
            $envPrefix = $env:AO_CLOSE_COMMIT_PREFIX
            if (-not [string]::IsNullOrWhiteSpace($envPrefix)) {
                $autoPrefix = $envPrefix.Trim()
            } elseif ($env:CLAUDECODE -eq "1" -or ($env:AI_AGENT -and $env:AI_AGENT.StartsWith("claude-code"))) {
                $autoPrefix = "[claude]"
            } elseif ($env:CURSOR_TRACE_ID -or $env:CURSOR_LAYOUT) {
                # Cursor signals present without Claude Code → assume Cursor agent context.
                # NOTE: Claude Code running inside Cursor's IDE shell sets BOTH; CLAUDECODE check above wins.
                $autoPrefix = "[cursor]"
            }
            $autoCloseStamp = (Get-Date -Format "yyyy-MM-dd HHmm")
            $CommitMessage = "$autoPrefix chore: AO-CLOSE sync $autoCloseStamp"
        }
        if ($resolvedMsgFile) {
            git commit -F $resolvedMsgFile
        } else {
            git commit -m $CommitMessage
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-close: git commit failed"
            exit 1
        }
    } else {
        Write-Host "== AO-CLOSE: nothing to commit (working tree clean after add) ==" -ForegroundColor DarkGray
    }

    $branch = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD }).Trim()
    Write-Host "== AO-CLOSE: git push origin $branch ==" -ForegroundColor Cyan
    # Phase C (2026-05-30): was bare `git push origin $branch` — same NativeCommandError issue as fetch.
    if (Get-Command Invoke-SafeGitPush -ErrorAction SilentlyContinue) {
        Invoke-SafeGitPush -WorkRoot $WorkRoot -Branch $branch
    } else {
        $savedEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { & git push origin $branch 2>&1 | Out-Host; $pushFbExit = $LASTEXITCODE }
        finally { $ErrorActionPreference = $savedEAP }
        if ($pushFbExit -ne 0) {
            Write-Error "ao-close: git push failed (exit $pushFbExit; check auth / network)"
            exit 1
        }
    }
    Write-Host "ao-close: done (verify + guard + integrated report + push OK)." -ForegroundColor Green
    Write-Host "Re-read the automation boundary block above if anything feels missing." -ForegroundColor DarkGray

    # AO-CLOSE archive report — machine-guaranteed existence (2026-06-10, critic M1 fix).
    # Root cause: the four-section report was agent-discretion and got repeatedly forgotten; the
    # prior-close gate above keyed off the commit minute, which the agent had to hand-match (drift =
    # false-block). Fix: the SCRIPT writes a skeleton at the EXACT $autoCloseStamp minute it stamped the
    # commit with, so filename == commit-minute by construction and a report ALWAYS exists. The agent then
    # overwrites this stub with the full four-section prose (ao-close skill Final Step). Best-effort: a
    # write failure warns but never changes the close exit code. Skipped when operator gave a custom message.
    if ($autoCloseStamp) {
        try {
            $rptStamp = $autoCloseStamp -replace ' ', '-'
            $rptDir   = Join-Path $WorkRoot "agency-os\reports\ao-close"
            $rptFile  = Join-Path $rptDir ($rptStamp + ".md")
            $null = New-Item -ItemType Directory -Force -Path $rptDir
            if (-not (Test-Path -LiteralPath $rptFile)) {
                # NOTE: skeleton strings are ASCII-only on purpose. CJK inside a PS *string literal* is a
                # CP950 parse-break trap (a CJK trailing byte can be 0x22/0x5C and terminate the string).
                # The agent overwrites this stub with the real CJK four-section report; the gate only checks
                # existence, so ASCII headers here are fine.
                $skel = @(
                    "# AO-CLOSE report - $autoCloseStamp",
                    "",
                    "> AUTO-SKELETON: machine-created stub so the report is never missing. The agent SHOULD",
                    "> overwrite this with the full four-section report (ao-close skill Final Step). Seeing this",
                    "> stub committed in git means the agent forgot to fill it.",
                    "",
                    "**Session window**: last AO-RESUME -> this close ($autoCloseStamp)",
                    "",
                    "## Done this session (agent: rewrite as the CJK four-section report)",
                    "- (agent fills: completed since last AO-RESUME)",
                    "",
                    "## Not done",
                    "- (agent fills)",
                    "",
                    "## Linked checks",
                    "- commit: $CommitMessage",
                    "- (agent fills: health gate / build gates / doc-sync / push)",
                    "",
                    "## Tomorrow priorities",
                    "- (agent fills)"
                ) -join [Environment]::NewLine
                # Atomic write (tmp + Move-Item -Force) to match the ao-close-last.txt house standard below:
                # WriteAllText is truncate-then-write (~ms 0-byte window). The Test-Path guard already makes
                # double-writes rare, but a parallel-session second close in the same minute could race — so
                # write to .tmp then atomically rename (NTFS same-volume Move is atomic). (critic 2nd-pass Minor#1)
                $utf8Bom = New-Object System.Text.UTF8Encoding $true
                $rptTmp = "$rptFile.tmp"
                [System.IO.File]::WriteAllText($rptTmp, $skel + [Environment]::NewLine, $utf8Bom)
                Move-Item -LiteralPath $rptTmp -Destination $rptFile -Force
                Write-Host ("AO-CLOSE: report skeleton written -> agency-os/reports/ao-close/{0}.md" -f $rptStamp) -ForegroundColor Cyan
                Write-Host ("AO-CLOSE: OVERWRITE that file with the full four-section report (do not leave the AUTO-SKELETON stub)." ) -ForegroundColor Yellow

                # M2 fix (critic finding, 2026-09-03): this file is written AFTER the
                # main commit+push above, so it is NOT part of that commit. Under the
                # OLD `git add -A`, the NEXT run's blind stage-everything swept it in
                # anyway; under the NEW scoped add, a file written directly to disk by
                # this script (not through Write/Edit, not in ANY session's tracker) is
                # baseline-dirty on every future run and would never be captured by
                # either scoped-add source -- permanently orphaned on disk, never
                # committed. Fixed by giving it its own tiny follow-up commit+push right
                # here, self-contained, instead of relying on a later run to pick it up.
                try {
                    $rptRelPath = "agency-os/reports/ao-close/$rptStamp.md"
                    git add -- $rptRelPath
                    if ($LASTEXITCODE -ne 0) {
                        Write-Warning "AO-CLOSE: could not stage report skeleton (non-fatal, will remain uncommitted on disk): git add exited $LASTEXITCODE"
                    } else {
                        # m3-5 fix (critic round 3): use the SAME prefix logic as the main
                        # commit ($autoPrefix, honours AO_CLOSE_COMMIT_PREFIX / Cursor
                        # detection) instead of a hardcoded "[claude]" -- two commits from
                        # one run should not carry different prefixes.
                        git commit -q -m "$autoPrefix chore: AO-CLOSE report skeleton $autoCloseStamp"
                        if ($LASTEXITCODE -ne 0) {
                            Write-Warning "AO-CLOSE: could not commit report skeleton (non-fatal, will remain staged/uncommitted on disk): git commit exited $LASTEXITCODE"
                        } else {
                            # m3-6 fix (critic round 3): the push result was never checked --
                            # Invoke-SafeGitPush throws on failure (caught below), but the
                            # bare-git fallback's exit code was silently discarded, so a
                            # failed push there would still print the "committed + pushed"
                            # success line.
                            $skeletonPushOk = $true
                            if (Get-Command Invoke-SafeGitPush -ErrorAction SilentlyContinue) {
                                Invoke-SafeGitPush -WorkRoot $WorkRoot -Branch $branch
                            } else {
                                git push origin $branch 2>&1 | Out-Host
                                if ($LASTEXITCODE -ne 0) { $skeletonPushOk = $false }
                            }
                            if ($skeletonPushOk) {
                                Write-Host "AO-CLOSE: report skeleton committed + pushed separately (see M2, WORKLOG 2026-09-03)." -ForegroundColor DarkGray
                            } else {
                                Write-Warning "AO-CLOSE: report skeleton committed locally but push failed (non-fatal here, but it will NOT be on origin until pushed manually)."
                            }
                        }
                    }
                } catch {
                    Write-Warning "AO-CLOSE: report skeleton follow-up commit/push failed (non-fatal, will remain on disk): $_"
                }
            } else {
                Write-Host ("AO-CLOSE: report already present -> agency-os/reports/ao-close/{0}.md" -f $rptStamp) -ForegroundColor DarkGray
            }
        } catch {
            Write-Warning "AO-CLOSE: could not write report skeleton (non-fatal): $_"
        }
    }

    # Non-blocking app-code deploy drift hint (SSH probe ~5s; any error is silently ignored).
    try {
        $driftScript = Join-Path $WorkRoot "scripts\check-deploy-drift.ps1"
        if (Test-Path -LiteralPath $driftScript) {
            $driftRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $driftScript -AppCodeOnly -SkipFetch -Json 2>&1 | Out-String
            $driftObj = $null
            try { $driftObj = $driftRaw | ConvertFrom-Json -ErrorAction Stop } catch { }
            if ($driftObj -and $driftObj.behind -gt 0) {
                Write-Host ("DEPLOY HINT: SG production is {0} app-code commit(s) behind. Run sg-deploy.sh when ready." -f $driftObj.behind) -ForegroundColor Yellow
            }
        }
    } catch { }

    # Write close timestamp BEFORE cross-machine export so vault gets the fresh value.
    # Ordering bug history: export used to run first → vault kept N-1's stamp → next AO-RESUME's
    # import overwrote local NEW with vault OLD → cross-machine stamp permanently stuck.
    #
    # Atomic write via tmp + Move-Item -Force: WriteAllText is non-atomic on Windows (truncate-then-
    # write, ~5ms window with 0 bytes). A concurrent reader hitting that window would get null and
    # crash under StrictMode. Move-Item -Force on NTFS is atomic (same volume), so readers always
    # see either the OLD content or the complete NEW content — never an empty/partial file.
    try {
        $closeStampDir  = Join-Path $WorkRoot "agency-os\.agency-state"
        $closeStampPath = Join-Path $closeStampDir "ao-close-last.txt"
        $closeStampTmp  = "$closeStampPath.tmp"
        $null = New-Item -ItemType Directory -Force -Path $closeStampDir
        $closeNow = (Get-Date).ToUniversalTime().ToString("o")
        $utf8NoBom2 = New-Object System.Text.UTF8Encoding $false
        # Snapshot the OUTGOING close stamp to ao-close-prev.txt BEFORE overwriting ao-close-last.
        # [ao-close-prev -> ao-close-last] then bounds the LAST completed work session (commits made
        # between the previous close and this one). Consumer: hooks/rules/git-log-injector.js prints every commit
        # of that window, uncapped — replacing the fixed `-10` that truncated >10-commit sessions.
        # Closes are chronological, so prev < last ALWAYS (never a backwards/empty window) and no
        # date-guard is needed (unlike a resume-anchored design, which a same-day re-resume corrupts).
        $closePrevPath = Join-Path $closeStampDir "ao-close-prev.txt"
        if (Test-Path -LiteralPath $closeStampPath) {
            try {
                $closePrevTmp = "$closePrevPath.tmp"
                [System.IO.File]::WriteAllText($closePrevTmp, ((Get-Content -Raw -LiteralPath $closeStampPath -Encoding UTF8).Trim() + [Environment]::NewLine), $utf8NoBom2)
                Move-Item -LiteralPath $closePrevTmp -Destination $closePrevPath -Force
            } catch {
                Write-Warning "AO-CLOSE: could not write ao-close-prev.txt (non-fatal): $_"
            }
        }
        [System.IO.File]::WriteAllText($closeStampTmp, $closeNow + [Environment]::NewLine, $utf8NoBom2)
        Move-Item -LiteralPath $closeStampTmp -Destination $closeStampPath -Force
        Write-Host ("AO-CLOSE: close stamp written ({0})" -f $closeNow) -ForegroundColor DarkGray
    } catch {
        # Best-effort cleanup of orphaned .tmp on failure.
        if ($closeStampTmp -and (Test-Path -LiteralPath $closeStampTmp)) {
            Remove-Item -LiteralPath $closeStampTmp -Force -ErrorAction SilentlyContinue
        }
        Write-Warning "AO-CLOSE: could not write ao-close-last.txt (non-fatal): $_"
    }

    # Cross-machine memory export — non-blocking; failure does not affect AO-CLOSE exit code.
    # Runs AFTER write-stamp so vault sees the just-written value (see ordering note above).
    $exportScript = Join-Path $WorkRoot "scripts\export-cross-machine-memory.ps1"
    if (Test-Path -LiteralPath $exportScript) {
        Write-Host "== AO-CLOSE: cross-machine memory export ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $exportScript -WorkRoot $WorkRoot
    }
} finally {
    Pop-Location
}
exit 0
