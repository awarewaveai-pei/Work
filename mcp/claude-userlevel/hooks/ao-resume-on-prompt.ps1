# Claude Code UserPromptSubmit: when the user message is AO-RESUME, run the real
# ao-resume.ps1 on disk (not "rules only"). Writes agency-os/.agency-state
# artifacts for the agent to read; always returns continue=true so chat proceeds.
#
# Ported from .cursor/hooks/run-ao-resume-on-prompt.ps1 (Cursor beforeSubmitPrompt).
# Both hooks call the same scripts/ao-resume.ps1 and write to the same state dir,
# so the 300-second de-dup guard in ao-resume-hook-last.json works across both IDEs.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-HookResponse {
    param([string]$Json)
    [Console]::Out.WriteLine($Json)
}

function Resolve-MonorepoRootWithAoResume {
    param([string[]]$WorkspaceRoots)

    $candidates = New-Object System.Collections.Generic.List[string]
    if ($WorkspaceRoots) {
        foreach ($w in $WorkspaceRoots) {
            if ($w) { $candidates.Add($w) | Out-Null }
        }
    }
    $candidates.Add((Get-Location).Path) | Out-Null

    foreach ($start in $candidates) {
        if (-not $start) { continue }
        if (-not [System.IO.Path]::IsPathRooted($start)) { continue }
        $cur = $start
        for ($i = 0; $i -lt 16; $i++) {
            # Sentinel must be paired with .git: scripts\ao-resume.ps1 also exists as a thin
            # wrapper at agency-os\scripts\ao-resume.ps1 (owner script lives at monorepo
            # root scripts\ao-resume.ps1). Without the .git co-condition, a walk starting
            # under agency-os\ stops at that inner wrapper and resolves the wrong root,
            # writing hook state into a nested agency-os\agency-os\.agency-state\ (found
            # 2026-09-05: 4 orphan debris trees from exactly this).
            $scriptPath = Join-Path $cur "scripts\ao-resume.ps1"
            $gitPath = Join-Path $cur ".git"
            if ((Test-Path -LiteralPath $scriptPath) -and (Test-Path -LiteralPath $gitPath)) {
                return (Resolve-Path -LiteralPath $cur).Path
            }
            $parent = [System.IO.Path]::GetDirectoryName($cur)
            if (-not $parent -or ($parent -eq $cur)) { break }
            $cur = $parent
        }
    }
    return $null
}

function Test-IsAoResumePrompt {
    param([string]$Prompt)
    if ([string]::IsNullOrWhiteSpace($Prompt)) { return $false }
    return ($Prompt.Trim() -match '(?i)^AO-RESUME\b')
}

function Get-GitDirtyEntries {
    param([string]$RepoRoot)
    Push-Location -LiteralPath $RepoRoot
    try {
        $out = @(git status --porcelain 2>$null)
        if ($LASTEXITCODE -ne 0) { return @() }
        return @($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    catch { return @() }
    finally {
        Pop-Location | Out-Null
    }
}

try {
    $stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $raw = $stdin.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $obj = $raw | ConvertFrom-Json
    $prompt = [string]$obj.prompt
    # Claude Code UserPromptSubmit payload carries session_id (stable for the whole conversation;
    # verified 2026-06-11 against the live payload). Cursor's conversation_id/generation_id are NOT
    # sent by Claude Code, so the old hook read them and always got empty -> see auto-trigger block.
    $sessionId = ""
    if ($obj.PSObject.Properties.Name -contains "session_id") { $sessionId = [string]$obj.session_id }
    $isAoResume = Test-IsAoResumePrompt -Prompt $prompt

    $roots = @()
    if ($obj.PSObject.Properties.Name -contains "workspace_roots" -and $obj.workspace_roots) {
        $roots = @($obj.workspace_roots)
    }

    $root = Resolve-MonorepoRootWithAoResume -WorkspaceRoots $roots
    if (-not $root) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    # ── STEP 0: self-heal .claude junction BEFORE any git operation ────────────
    # CLAUDE.md R1 mandates that repo-root `.claude/` is a junction to ~/.claude/.
    # If junction is silently broken (became a real folder), the next auto-checkpoint
    # below will commit "deletions" of 49+ tracked files (observed 2026-05-28).
    # ensure-claude-junction.ps1 is idempotent — no-op when junction OK.
    $ensureJunctionScript = Join-Path $root "scripts\ensure-claude-junction.ps1"
    if (Test-Path -LiteralPath $ensureJunctionScript) {
        Push-Location -LiteralPath $root
        try {
            $savedEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
            $junctionOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureJunctionScript -EmitState 2>&1
            $junctionExit = $LASTEXITCODE
            $ErrorActionPreference = $savedEAP
            # Only surface output when something was repaired or errored (exit 1/2).
            # Exit 0 with verdict=ok = silent (junction already healthy).
            if ($junctionExit -ne 0) {
                Write-Host ("⚠️ ensure-claude-junction exit=$junctionExit — review state file agency-os/.agency-state/junction-last.json") -ForegroundColor Yellow
                $junctionOutput | ForEach-Object { Write-Host $_ }
            }
        } finally {
            Pop-Location | Out-Null
        }
    }

    # Auto-trigger AO-RESUME on the first prompt of a GENUINELY NEW session.
    # Original problem (Class B, 2026-05-29): when the user types a greeting (not literally
    # "AO-RESUME"), CLAUDE.md auto-invokes AO-RESUME in the agent, but this hook only fired
    # ao-resume.ps1 for prompts starting with "AO-RESUME" -> state file stayed days-stale.
    # The 2026-05-29 fix used ">8h since last run" as a PROXY for "new session" — but only
    # because the hook (ported from Cursor) read conversation_id/generation_id, which Claude
    # Code never sends (always empty). That time-proxy misfired on long sessions crossing 8h
    # (esp. working past midnight), writing orphan AO-RESUME skeletons (2026-06-08-1807,
    # 2026-06-10-1718 — both ~8-9h after the morning resume, neither an actual open/close).
    # Fix (2026-06-11): use the REAL Claude Code session_id (verified present in the live
    # payload). session_id is stable for an entire conversation (incl. --continue/--resume) and
    # changes only on /clear or a new terminal session — so it is a correct new-session signal,
    # immune to clock/date/late-night work. We auto-trigger ONLY when session_id changed.
    # Fail-safe: empty session_id (unexpected) => no auto-trigger (the user can type AO-RESUME).
    # DELIBERATE DROP: the old 8h block also force-triggered when ao-resume-hook-last.json was
    # missing/corrupt. That is intentionally gone — the new trigger keys off the separate
    # ao-resume-last-session-id.txt, so json corruption no longer affects triggering, and a missing
    # session-id file still triggers (lastSessionId="" != non-empty sessionId). Not an accidental loss.
    # ORDERING: MUST run BEFORE the dirty-tree short-circuit below (that branch exits early).
    $autoTriggerAoResume = $false
    $sessionIdFile = Join-Path $root "agency-os\.agency-state\ao-resume-last-session-id.txt"
    if (-not $isAoResume -and $sessionId) {
        $lastSessionId = ""
        try {
            if (Test-Path -LiteralPath $sessionIdFile) {
                $lastSessionId = (Get-Content -LiteralPath $sessionIdFile -Raw -Encoding UTF8).Trim()
            }
        } catch { $lastSessionId = "" }
        if ($sessionId -ne $lastSessionId) { $autoTriggerAoResume = $true }
    }

    # REMOVED 2026-08-25: per-prompt auto-checkpoint (git add -A + commit on EVERY user
    # prompt whenever the tree was dirty). Do not re-add it. It is not a save point that
    # was tuned badly - it had no alignment role at all: this branch committed and then
    # `exit 0`, while dirty-tree handling for AO-RESUME lives in the FullMainlineParity
    # path below. Removing it drops straight through to the identical early-exit that
    # follows, so behaviour is unchanged except that nothing is committed.
    #
    # It produced 2,568 commits (56.4% of this repo's history) with messages that carry
    # neither root cause nor verification (violating CLAUDE.md R2), and six documented
    # harm classes, none of which any tuning could remove because they all stem from the
    # same thing - it authored commits nobody asked for:
    #   - committed 49 tracked files as deletions (2026-05-28, bad commit 0d63eb9)
    #   - committed 12 .claude/plans files as deletions (853cd26a, junction broke mid-session)
    #   - swept an uncommitted mem_limit edit into the repo; drifted from prod for 10 weeks (35834a0d)
    #   - reverted a fix every session, making the underlying bug look recurring
    #   - stole sessions' work, leaving external review a diff of nothing to review
    #   - pushed code to main while the verify gate was blocking that same code
    # Documented saves, searched across all WORKLOG history: zero.
    # Full analysis: agency-os/WORKLOG.md 2026-08-25.

    if (-not $isAoResume -and -not $autoTriggerAoResume) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $stateDir = Join-Path $root "agency-os\.agency-state"
    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }

    $logFile = Join-Path $stateDir "ao-resume-hook-last.log"
    $jsonFile = Join-Path $stateDir "ao-resume-hook-last.json"
    $resumeScript = Join-Path $root "scripts\ao-resume.ps1"

    $genId = $null
    if ($obj.PSObject.Properties.Name -contains "generation_id") { $genId = [string]$obj.generation_id }
    $convId = $null
    if ($obj.PSObject.Properties.Name -contains "conversation_id") { $convId = [string]$obj.conversation_id }

    $autoCheckpointAttempted = $false
    $autoCheckpointCommitted = $false
    $autoCheckpointExit = 0
    $autoCheckpointSummary = ""
    $allLogLines = New-Object System.Collections.Generic.List[string]

    # REMOVED 2026-08-25: the pre-AO-RESUME auto-checkpoint that used to live here.
    # This was the THIRD call site of commit-checkpoint (after the per-prompt one above and
    # a fallback inside ao-resume.ps1) and the last one still authoring commits. It existed
    # because git-align needs a clean tree; ao-resume.ps1 now always passes -AllowStash, so
    # git-align parks the dirty tree in a named stash and restores it in its finally.
    # Committing here would publish the operator's in-progress work to main under a message
    # that describes nothing, on every single AO-RESUME.
    # $autoCheckpoint* stay declared above: they are still reported in the state file, and
    # now truthfully read "attempted=false" because nothing is attempted.
    $dirtyBefore = Get-GitDirtyEntries -RepoRoot $root
    if (@($dirtyBefore).Count -gt 0) {
        $allLogLines.Add("== AO-RESUME hook: dirty tree detected; git-align will stash and restore it (no commit) ==") | Out-Null
        $autoCheckpointSummary = "dirty=$(@($dirtyBefore).Count); handled by git-align -AllowStash (no commit)"
    }


    # Record the session_id we are handling so the next prompt in THIS session does not re-trigger
    # (only a genuinely new session_id should). Written before the run so a failing run still
    # records the session (prevents a re-trigger loop on a broken session).
    if ($sessionId) {
        try { [System.IO.File]::WriteAllText($sessionIdFile, $sessionId, (New-Object System.Text.UTF8Encoding $false)) } catch { }
    }

    # Skeleton is OPT-IN: ao-resume.ps1 writes the AO-RESUME archive skeleton ONLY when this hook
    # passes -WriteArchiveSkeleton, i.e. only for an explicit "AO-RESUME" prompt where the agent
    # will produce + archive a real report (Step 3). Auto-refresh on a new session does NOT pass it,
    # so non-interactive / new-session-without-AO-RESUME runs never leave orphan skeletons.
    $skelArg = if ($isAoResume) { @('-WriteArchiveSkeleton') } else { @() }
    Push-Location -LiteralPath $root
    try {
        $savedEAP3 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        $resumeOut = @(
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resumeScript -FullMainlineParity @skelArg 2>&1
        )
        $ErrorActionPreference = $savedEAP3
        $exit = $LASTEXITCODE
        foreach ($line in $resumeOut) { $allLogLines.Add([string]$line) | Out-Null }
    }
    finally {
        Pop-Location | Out-Null
    }

    ($allLogLines -join "`r`n") | Set-Content -LiteralPath $logFile -Encoding UTF8

    $meta = [ordered]@{
        hook_event        = "UserPromptSubmit"
        session_id        = $sessionId
        generation_id     = $genId
        conversation_id   = $convId
        work_root         = $root
        exit_code         = $exit
        finished_utc      = (Get-Date).ToUniversalTime().ToString("o")
        log_relative      = "agency-os/.agency-state/ao-resume-hook-last.log"
        auto_checkpoint_attempted = $autoCheckpointAttempted
        auto_checkpoint_committed = $autoCheckpointCommitted
        auto_checkpoint_exit_code = $autoCheckpointExit
        auto_checkpoint_summary   = $autoCheckpointSummary
        agent_skip_rerun_seconds = 300
        note              = "If this file mtime is within agent_skip_rerun_seconds of agent handling AO-RESUME, do not re-run ao-resume.ps1; read steps_summary (preferred) or log_tail in this JSON and TASKS/snapshot."
    }

    # Structured step summary: parse '== ... ==' headers from ao-resume.ps1 output.
    # Claude reads steps_summary directly instead of grep-ing log_tail (which can be
    # truncated when ao-resume grows new sub-steps). Each entry captures the step
    # header + next 3 non-blank lines as a short status snapshot.
    # Root cause this prevents: 2026-05-23 hallucination where Claude saw no
    # "cross-machine import" in last-48-line log_tail and incorrectly reported
    # import as skipped (import had actually succeeded — log front-half was truncated).
    $stepsSummary = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $allLogLines.Count; $i++) {
        $line = [string]$allLogLines[$i]
        if ($line -match '^\s*==\s+(.+?)\s+==\s*$') {
            $stepName = $matches[1].Trim()
            $detailLines = @()
            # Lookahead window = 10 lines (was 6). Real ao-resume.ps1 has no >5-blank-line
            # patterns today, but 10 gives headroom against future blank-line padding
            # without changing O(n) total cost (10*n is still linear).
            for ($j = $i + 1; $j -lt [Math]::Min($i + 10, $allLogLines.Count); $j++) {
                $d = [string]$allLogLines[$j]
                if ($d -match '^\s*==\s+(.+?)\s+==\s*$') { break }
                if (-not [string]::IsNullOrWhiteSpace($d)) { $detailLines += $d.Trim() }
                if ($detailLines.Count -ge 3) { break }
            }
            $stepsSummary.Add([ordered]@{
                name   = $stepName
                detail = ($detailLines -join ' | ')
            }) | Out-Null
        }
    }
    $meta["steps_summary"] = $stepsSummary

    # log_tail: was 48 lines (too short — front-half steps truncated, causing
    # Claude to hallucinate skipped sub-steps). 200 gives ~3x headroom against
    # future ao-resume.ps1 growth. Defense-in-depth alongside steps_summary above.
    # Source = in-memory $allLogLines (not Get-Content re-read of $logFile) to
    # avoid (a) redundant disk I/O and (b) race window where another hook session
    # could mutate the file between our Set-Content above and Get-Content here.
    $tailLines = 200
    $tailText = ""
    if ($allLogLines.Count -gt 0) {
        $tailSlice = if ($allLogLines.Count -le $tailLines) {
            $allLogLines
        } else {
            $allLogLines[($allLogLines.Count - $tailLines)..($allLogLines.Count - 1)]
        }
        $tailText = ($tailSlice -join "`n")
        if ($tailText.Length -gt 120000) {
            $tailText = $tailText.Substring($tailText.Length - 120000)
        }
    }
    $meta["log_tail"] = $tailText

    # -Depth 6 (was 4): current schema needs 4 ($meta → steps_summary → ordered
    # hashtable → string), so 4 = zero headroom. Bumping to 6 is cheap insurance
    # against future nested fields silently truncating to "System.Object[]" on PS 5.1.
    ($meta | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $jsonFile -Encoding UTF8

    Write-HookResponse '{"continue":true}'
    exit 0
}
catch {
    # Observability: write the exception to a fail log so silent failures are diagnosable.
    # Best-effort — we still always return continue=true so chat is never blocked by the hook.
    try {
        $failRoot = $null
        try {
            if ($obj -and $obj.PSObject.Properties.Name -contains "workspace_roots" -and $obj.workspace_roots) {
                foreach ($w in @($obj.workspace_roots)) {
                    if ($w -and (Test-Path -LiteralPath (Join-Path $w "agency-os"))) { $failRoot = $w; break }
                }
            }
        } catch { }
        if (-not $failRoot) { try { $failRoot = (Get-Location).Path } catch { } }
        if ($failRoot) {
            $failDir = Join-Path $failRoot "agency-os\.agency-state"
            if (-not (Test-Path -LiteralPath $failDir)) {
                try { New-Item -ItemType Directory -Path $failDir -Force | Out-Null } catch { }
            }
            $failLog = Join-Path $failDir "ao-resume-hook-fail.log"
            $now = (Get-Date).ToUniversalTime().ToString("o")
            $msg = if ($_ -and $_.Exception) { $_.Exception.Message } else { "<no exception object>" }
            $stack = if ($_ -and $_.ScriptStackTrace) { $_.ScriptStackTrace } else { "" }
            $payload = "[$now] HOOK EXCEPTION`r`nMessage: $msg`r`nStack:`r`n$stack`r`n---`r`n"
            try { Add-Content -LiteralPath $failLog -Value $payload -Encoding UTF8 } catch { }
        }
    } catch { }
    try {
        Write-HookResponse '{"continue":true}'
    }
    catch { }
    exit 0
}
