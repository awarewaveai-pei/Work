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

        $dirty = @(
            git status --porcelain 2>$null |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        ).Count -gt 0

        return [pscustomobject]@{
            IsGitRepo   = $true
            Branch      = $branch
            StatusLine  = $statusLine
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

Write-Host "== AO-CLOSE: preflight git snapshot (branch/ahead/behind/dirty) ==" -ForegroundColor Cyan
$preflight = Get-GitPreflightSnapshot -RepoRoot $WorkRoot
if (-not $preflight.IsGitRepo) {
    Write-Error "ao-close: not a git repository at $WorkRoot"
    exit 1
}
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
            # warranted here most of all; Initialize-BackupDir caps retention at 15 so this never spams.
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

    # ── Last line of defence before `git add -A` (moved here 2026-08-25) ──────────
    # These two guards lived in commit-checkpoint.ps1 and protected ITS `git add -A`.
    # That call site is gone (checkpoint now requires explicit -Paths), but the hazards
    # were never about which script staged everything -- they are about `git add -A`
    # itself, and this is now the only one left in the repo. Leaving the guards behind
    # in a script that no longer stages blindly would have retired the protection while
    # keeping the danger.

    # Guard 1 -- broken .claude junction. ensure-claude-junction.ps1 runs at
    # UserPromptSubmit STEP 0 and at health gate 12b, but both are point-in-time: if the
    # junction dies mid-session, every earlier check has already passed and nothing
    # stands between `git add -A` and a commit that deletes the whole shared .claude/
    # tree for every machine. Observed twice: 49 tracked files (2026-05-28, 0d63eb9) and
    # 12 files under .claude/plans/ (853cd26a). Runs immediately before staging.
    $claudeJunction = Join-Path $WorkRoot ".claude"
    # UTF-8 wrapped: tracked paths under .claude/ may contain non-ASCII, and a CP950
    # console mangles them on capture (scripts/audit-cp950-traps.ps1 trap class).
    $claudeTracked = @(Invoke-WithUtf8Console { & git ls-files -- ".claude" 2>$null })
    if ($claudeTracked.Count -gt 0 -and -not (Test-Path -LiteralPath $claudeJunction)) {
        Write-Error @"
ao-close: refusing to stage. '.claude' is tracked in git ($($claudeTracked.Count) files)
but does not exist on disk. The junction is broken, so 'git add -A' would stage every one
of those files as a DELETION and propagate it to all machines on push.

Repair it first, then re-run:
  powershell -NoProfile -ExecutionPolicy Bypass -File "$WorkRoot\scripts\ensure-claude-junction.ps1"
"@
        exit 1
    }

    git add -A
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: git add failed"
        exit 1
    }

    # Guard 2 -- shell-artifact junk. `git add -A` blindly stages stray files created by
    # shell accidents: literal `$null`/`null` (PowerShell-style redirection run under
    # bash) and 0-byte files whose NAMES are doc-content fragments (word-split heredoc).
    # Those reached the SSOT on 2026-06-20 (16d95c8). Policy: UNSTAGE junk and continue,
    # never abort -- the close-out's real work must still be committed.
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
            # Commit prefix per CLAUDE.md "Commit Prefix（強制）". Detect actor from env signals.
            # Default [claude] (per CLAUDE.md "全面切換至 Claude Code 後，預設使用 [claude]").
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
                [System.IO.File]::WriteAllText($closePrevTmp, ((Get-Content -Raw -LiteralPath $closeStampPath).Trim() + [Environment]::NewLine), $utf8NoBom2)
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
