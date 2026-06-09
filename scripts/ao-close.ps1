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
    [ValidateSet("warn","strict","off")]
    [string]$InboxGuardMode = "strict",
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

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} else {
    $fromWorkScripts = Join-Path $PSScriptRoot "..\agency-os\scripts\system-guard.ps1"
    $fromAgencyScripts = Join-Path $PSScriptRoot "system-guard.ps1"
    if (Test-Path -LiteralPath $fromWorkScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } elseif (Test-Path -LiteralPath $fromAgencyScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
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
    . (Resolve-Path $healthReportUtils).Path
}

# Four-phase refactor (2026-06-09): single quality-gate collector. Quality gates record
# pass/fail into $gate instead of exiting on first failure; one decision point before publish
# reports ALL blockers at once (root-fix for the recurring serial-retry "30-min close").
# Behavior contract: publish IFF zero blockers — identical commit decision to the old per-gate
# exits, only batched reporting. Preconditions (git topology / infra) stay fail-fast below.
$gateLib = Join-Path $WorkRoot "scripts\lib\ao-close-gates.ps1"
if (Test-Path -LiteralPath $gateLib) {
    . (Resolve-Path $gateLib).Path
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

        $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
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
            $aheadSubjects = @(& git log "origin/$($preflight.Branch)..HEAD" --format="%s" 2>$null)
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

# Inbox guard (before merge resets inbox). Default warn: do not block solo second close after auto-merge.
if (-not $SkipInboxGuard -and $InboxGuardMode -ne "off") {
    Write-Host "== AO-CLOSE: closeout inbox guard ($InboxGuardMode) ==" -ForegroundColor Cyan
    Push-Location $WorkRoot
    try {
        $today = Get-Date
        $dayStart = (Get-Date -Year $today.Year -Month $today.Month -Day $today.Day -Hour 0 -Minute 0 -Second 0)
        $since = $dayStart.ToString("yyyy-MM-dd HH:mm:ss")
        $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
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

        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
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

    git add -A
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: git add failed"
        exit 1
    }

    $staged = @(git diff --cached --name-only | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
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
            $CommitMessage = "$autoPrefix chore: AO-CLOSE sync " + (Get-Date -Format "yyyy-MM-dd HHmm")
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

    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
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
