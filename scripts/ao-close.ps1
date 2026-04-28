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

param(
    [string]$WorkRoot = "",
    [string]$CommitMessage = "",
    # 多行／多代理彙總：`git commit -F`（若與 -CommitMessage 並存，**以檔案為準**）。
    [string]$CommitMessageFile = "",
    [switch]$SkipPush,
    [switch]$SkipVerify,
    [switch]$AllowNonPerfectHealth,
    [switch]$AllowPushWhileBehind,
    [switch]$SkipTodayRecap,
    [switch]$SkipAutoTaskCheckmarks,
    [switch]$SkipInboxGuard,
    [ValidateSet("warn","strict","off")]
    [string]$InboxGuardMode = "strict",
    [ValidateSet("off", "warn", "strict")]
    [string]$CompletenessGate = "strict",
    [switch]$SkipCompletenessGate
)

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
$healthReportUtils = Join-Path $WorkRoot "scripts\health-report-utils.ps1"
if (Test-Path -LiteralPath $healthReportUtils) {
    . (Resolve-Path $healthReportUtils).Path
}
$guardScript = Join-Path $agencyRoot "scripts\system-guard.ps1"
if (-not (Test-Path -LiteralPath $guardScript)) {
    Write-Error "ao-close: missing system-guard at $guardScript"
    exit 1
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
                    Write-Error $msg
                    exit 1
                }
                Write-Warning $msg
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
                        Write-Error $msg
                        exit 1
                    }
                    Write-Warning $msg
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
        git fetch origin 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-close: git fetch failed; fix network/auth or pass -SkipPush."
            exit 1
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
                        Write-Error "ao-close: $remoteRef is ahead by $behind commit(s). Run AO-RESUME or git pull --ff-only origin $branch (then resolve), then AO-CLOSE again. Or pass -AllowPushWhileBehind (unsafe)."
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
        Write-Error "ao-close: verify-build-gates failed (exit $LASTEXITCODE). Fix before push."
        exit $LASTEXITCODE
    }
} elseif ($SkipVerify) {
    Write-Host "== AO-CLOSE: -SkipVerify set; skipping verify-build-gates ==" -ForegroundColor Yellow
}

Write-Host "== AO-CLOSE: system-guard (doc-sync + health + guard) ==" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guardScript -WorkspaceRoot $agencyRoot -Mode manual
$guardExit = $LASTEXITCODE
if ($guardExit -ne 0) {
    Write-Error "ao-close: system-guard failed (exit $guardExit). Fix health/closeout before push."
    exit $guardExit
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
                Write-Error "ao-close: health score is $score% (<100%). Fix remaining checks or rerun with -AllowNonPerfectHealth only when explicitly approved."
                exit 1
            }
            if (($score -lt 100.0) -and $AllowNonPerfectHealth) {
                Write-Host "== AO-CLOSE: health score $score% allowed by -AllowNonPerfectHealth ==" -ForegroundColor Yellow
            }
        } elseif (-not $AllowNonPerfectHealth) {
            Write-Error "ao-close: unable to parse health score from JSON or Markdown under $healthDir."
            exit 1
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

Write-Host ""
Write-Host "=== AO-CLOSE: automation boundary (every run) ===" -ForegroundColor Cyan
Write-Host "SCRIPT DID: daily scaffold; inbox guard; merge-closeout-inbox (verbatim -> WORKLOG + memory/daily + CONVERSATION_MEMORY pointer); recap; verify/guard/report; apply AUTO_TASK_DONE -> TASKS; after git add, verify-closeout-completeness (default strict) before commit." -ForegroundColor Green
Write-Host "SCRIPT DID NOT: infer task completion; write AUTO_TASK_DONE lines; author CONVERSATION_MEMORY prose (agent must edit that file BEFORE this script, same AO-CLOSE turn); touch LAST_AO_RESUME_BRIEF (AO-RESUME only) or SESSION_TEMPLATE." -ForegroundColor Yellow
Write-Host "Legend: agency-os/memory/MEMORY_INDEX.md; rules: 10-memory-maintenance + 40-shutdown-closeout." -ForegroundColor DarkGray
Write-Host ""

if ($SkipPush) {
    Write-Host "== AO-CLOSE: -SkipPush set; skipping git commit/push ==" -ForegroundColor Yellow
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
    foreach ($p in $staged) {
        if ($p -match '(?i)(^|/)\.claude/|\.credentials\.json$|(^|/)mcp-local-wrappers/node_modules/') {
            Write-Error "ao-close: blocked sensitive or ignored path from staging: $p"
            exit 1
        }
    }

    $patch = (& git diff --cached -U0 2>&1 | Out-String)
    if ($patch -match '(?m)^\+<<<<<<< ') {
        Write-Error "ao-close: staged diff contains merge conflict markers (+<<<<<<<). Resolve conflicts before commit."
        exit 1
    }

    $complScript = Join-Path $WorkRoot "scripts\verify-closeout-completeness.ps1"
    if (-not $SkipCompletenessGate -and (Test-Path -LiteralPath $complScript)) {
        Write-Host "== AO-CLOSE: verify-closeout-completeness ($CompletenessGate) ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $complScript -WorkRoot $WorkRoot -Gate $CompletenessGate
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-close: verify-closeout-completeness failed (exit $LASTEXITCODE). Add today WORKLOG evidence (- AUTO_TASK_DONE: and/or inbox merge block) or use -CompletenessGate warn / -SkipCompletenessGate."
            exit $LASTEXITCODE
        }
    }

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
            $CommitMessage = "[cursor] chore: AO-CLOSE sync " + (Get-Date -Format "yyyy-MM-dd HHmm")
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
    git push origin $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: git push failed (check auth / network)"
        exit 1
    }
    Write-Host "ao-close: done (verify + guard + integrated report + push OK)." -ForegroundColor Green
    Write-Host "Re-read the automation boundary block above if anything feels missing." -ForegroundColor DarkGray
} finally {
    Pop-Location
}
exit 0
