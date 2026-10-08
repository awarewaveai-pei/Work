<#
.SYNOPSIS
  Runs the Codex card queue for the cognitive platform: one card at a time, each in a throwaway worktree, each
  accepted by THIS script (not by Codex's own claim), until the queue is empty, a card needs a decision, a card is
  blocked, or Codex's quota is gone.

.DESCRIPTION
  Why (operator, 2026-10-04): when Claude's quota runs out, Codex must keep building without anyone approving every
  command. `codex exec --approve-for-me` runs commands inside the workspace-write sandbox with an automatic reviewer
  (probed on this machine 2026-10-04: runs python, writes files). Everything else is mechanical here:
    - the queue and the standing rules live in agency-os/handoffs/cos-codex-queue/ (queue.json, PREAMBLE.md, cards/);
    - Codex works ONLY in the worktree ($Worktree, detached HEAD). Its commits are kept reachable as refs/codex/work
      in the main repository (a ref, not a branch). Nothing is merged into main, pushed or deployed by this script:
      a Claude session clears agency-os/reports/review-debt.md first (a reviewer must not be the author);
    - a card is DONE only when this script saw: at least one new commit, a clean worktree, the commit touching
      review-debt.md, and every `check` command of the card exiting 0 (run here, outside Codex);
    - mcp_servers={} keeps the per-token LLM proxy servers of ~/.codex/config.toml out of every run.
  State (outside git): $StateDir\state.json, logs per attempt: $StateDir\logs\.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1 -MaxCards 1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$QueueDir = 'agency-os/handoffs/cos-codex-queue',
    [string]$Worktree = 'D:/tmp/cos-codex',
    [string]$StateDir = 'D:/tmp/cos-codex-state',
    [int]$MaxCards = 50,
    [int]$CardTimeoutMin = 120,
    [int]$MaxAttempts = 3,
    [switch]$NoPostgres,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path -replace '\\', '/'
$queueRoot = Join-Path $root $QueueDir
$cos = 'Projects/internal/cognitive-engineering-os'
$pgName = 'cos-db-test-codex-pg'
$pgImage = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
$quotaScript = Join-Path $PSScriptRoot 'oracle-quota.ps1'

function Say([string]$m, [string]$c = 'Gray') { Write-Host ("codex-continue: " + $m) -ForegroundColor $c }

function Resolve-CodexExe {
    $cands = @(Get-Command codex -All -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' })
    foreach ($ext in @('.cmd', '.exe', '.bat')) {
        $hit = $cands | Where-Object { $_.Source -and $_.Source.ToLower().EndsWith($ext) } | Select-Object -First 1
        if ($hit) { return $hit.Source }
    }
    if ($cands.Count -gt 0) { return $cands[0].Source }
    return $null
}

function GitRun([string[]]$GitArgs, [string]$Dir = $root) {
    # git writes progress ("Preparing worktree") to stderr; under -ErrorAction Stop that would be a terminating error
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & git -C $Dir @GitArgs 2>&1
        return @{ Text = (@($out | ForEach-Object { "$_" }) -join "`n"); Exit = $LASTEXITCODE }
    } finally { $ErrorActionPreference = $prev }
}

function Read-Json([string]$Path) { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }

function Save-State($State) {
    $json = $State | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText((Join-Path $StateDir 'state.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-LoggedProcess {
    param(
        [string]$FileName,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$InputFile,
        [string]$OutputFile,
        [string]$ErrorFile,
        [int]$TimeoutSec
    )
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $FileName
    $start.Arguments = (($Arguments | ForEach-Object {
        $argument = [string]$_
        if ($argument -notmatch '[\s"]') { $argument } else { '"' + $argument.Replace('\', '\\').Replace('"', '\"') + '"' }
    }) -join ' ')
    $start.WorkingDirectory = $WorkingDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $start
    $timedOut = $false
    try {
        if (-not $p.Start()) {
            [System.IO.File]::WriteAllText($OutputFile, '')
            [System.IO.File]::WriteAllText($ErrorFile, '')
            return @{ Exit = 125; TimedOut = $false }
        }
        $out = $p.StandardOutput.ReadToEndAsync()
        $err = $p.StandardError.ReadToEndAsync()
        if ($InputFile) {
            $input = [System.IO.File]::ReadAllText($InputFile)
            $p.StandardInput.Write($input)
        }
        $p.StandardInput.Close()
        if (-not $p.WaitForExit($TimeoutSec * 1000)) {
            $timedOut = $true
            try { & taskkill.exe /T /F /PID $p.Id 2>$null | Out-Null } catch { }
        }
        $p.WaitForExit()
        $out.Wait()
        $err.Wait()
        [System.IO.File]::WriteAllText($OutputFile, $out.Result)
        [System.IO.File]::WriteAllText($ErrorFile, $err.Result)
        return @{ Exit = if ($timedOut) { 124 } else { [int]$p.ExitCode }; TimedOut = $timedOut }
    } finally { $p.Dispose() }
}

function Run-Command([string]$CmdLine, [string]$Dir, [string]$LogFile, [int]$TimeoutSec) {
    $result = Invoke-LoggedProcess 'cmd.exe' @('/d', '/s', '/c', $CmdLine) $Dir $null $LogFile ($LogFile + '.err') $TimeoutSec
    return [int]$result.Exit
}

# ---- preflight ----------------------------------------------------------------------------------------------
$codexExe = Resolve-CodexExe
if (-not $codexExe) { Write-Error 'codex CLI not found on PATH (npm install -g @openai/codex)'; exit 2 }
if (-not (Test-Path -LiteralPath (Join-Path $queueRoot 'queue.json'))) { Write-Error "no queue.json in $queueRoot"; exit 2 }
$null = New-Item -ItemType Directory -Force -Path $StateDir, (Join-Path $StateDir 'logs')

& powershell -NoProfile -ExecutionPolicy Bypass -File $quotaScript -Action check -Tool codex | Out-Null
if ($LASTEXITCODE -eq 3) { Say 'Codex quota is blocked (oracle-quota.ps1); nothing started' 'Yellow'; exit 3 }

$queue = Read-Json (Join-Path $queueRoot 'queue.json')
$queueValidator = Join-Path $root 'Projects/internal/cognitive-engineering-os/scripts/validate-codex-queue.py'
$queueValidation = & python $queueValidator 2>&1
$queueValidationExit = $LASTEXITCODE
if ($queueValidationExit -ne 0) {
    Say "queue validation failed before any card: $($queueValidation -join "`n")" 'Red'
    exit 2
}
$statePath = Join-Path $StateDir 'state.json'
if (Test-Path -LiteralPath $statePath) { $state = Read-Json $statePath } else { $state = [pscustomobject]@{ cards = [pscustomobject]@{} } }

function Card-State([string]$Id) {
    $p = $state.cards.PSObject.Properties[$Id]
    if ($p) { return $p.Value }
    return $null
}
function Set-Card([string]$Id, [hashtable]$Fields) {
    $cur = Card-State $Id
    if (-not $cur) { $cur = [pscustomobject]@{ status = 'pending'; attempts = 0 }; $state.cards | Add-Member -NotePropertyName $Id -NotePropertyValue $cur }
    foreach ($k in $Fields.Keys) {
        if ($cur.PSObject.Properties[$k]) { $cur.$k = $Fields[$k] } else { $cur | Add-Member -NotePropertyName $k -NotePropertyValue $Fields[$k] }
    }
    Save-State $state
}
function Is-Done([string]$Id) {
    $s = Card-State $Id
    if ($s -and $s.status -eq 'done') { return $true }
    $c = @($queue.cards | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
    if ($c -and $c.PSObject.Properties['done_elsewhere'] -and $c.done_elsewhere) { return $true }   # finished by another worker (the note names where)
    return $false
}
function Gate-Open($Card) {
    if (-not $Card.PSObject.Properties['gate'] -or -not $Card.gate) { return $true }
    return (Test-Path -LiteralPath (Join-Path $queueRoot ("gates/" + $Card.gate)))
}

# ---- worktree (detached; its commits stay reachable as refs/codex/work) ----------------------------------------
if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $Worktree)) {
        $base = (GitRun @('rev-parse', '--verify', '-q', 'refs/codex/work')).Text
        if (-not $base -or $base -match 'fatal') { $base = (GitRun @('rev-parse', 'HEAD')).Text }
        $r = GitRun @('worktree', 'add', '--detach', $Worktree, $base.Trim())
        if ($r.Exit -ne 0) { Write-Error "worktree add failed: $($r.Text)"; exit 2 }
        Say "worktree created at $Worktree from $($base.Trim().Substring(0, 9))"
    }
    $junction = Join-Path $Worktree "$cos/apps/cognitive-web/node_modules"
    $target = Join-Path $root "$cos/apps/cognitive-web/node_modules"
    if (-not (Test-Path -LiteralPath $junction) -and (Test-Path -LiteralPath $target)) {
        & cmd.exe /c "mklink /J `"$($junction -replace '/', '\')`" `"$($target -replace '/', '\')`"" | Out-Null
    }
}

# ---- one PostgreSQL for the whole session (tests/pg.py uses it through the URL) -----------------------------------
$startedPg = $false
if (-not $NoPostgres -and -not $DryRun) {
    $have = (& docker ps -a --filter "name=$pgName" --format '{{.Names}}' 2>$null)
    if (-not $have) {
        $pw = [guid]::NewGuid().ToString('N')
        & docker run -d --rm --name $pgName -e "POSTGRES_PASSWORD=$pw" -p '127.0.0.1:55432:5432' $pgImage | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $startedPg = $true
            $env:COGNITIVE_OS_TEST_DATABASE_URL = "postgresql://postgres:$pw@127.0.0.1:55432/postgres"
            for ($i = 0; $i -lt 60; $i++) { & docker exec $pgName pg_isready -U postgres 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
            Say 'PostgreSQL test server up on 127.0.0.1:55432'
        } else { Say 'docker is not available: PostgreSQL tests will skip (loudly)' 'Yellow' }
    } else { Say "container $pgName already exists; tests use their own container if the URL is not set" 'Yellow' }
}

# ---- the loop -------------------------------------------------------------------------------------------------
$done = 0
$exitCode = 0
$previousRequirePostgres = [Environment]::GetEnvironmentVariable('COGNITIVE_OS_REQUIRE_POSTGRES', 'Process')
try {
    $env:COGNITIVE_OS_REQUIRE_POSTGRES = '1'
    foreach ($card in $queue.cards) {
        if ($done -ge $MaxCards) { break }
        $id = [string]$card.id
        if (Is-Done $id) { continue }
        $cur = Card-State $id
        if ($cur -and $cur.status -in @('blocked', 'needs_decision')) { Say "skipping $id ($($cur.status)): $($cur.note)" 'Yellow'; $exitCode = 1; continue }
        if ($card.PSObject.Properties['high_stop'] -and $card.high_stop) { Say "$id is a High-STOP card (needs the operator's go-ahead): skipped" 'Yellow'; continue }
        if (-not (Gate-Open $card)) { Say "$id waits for gate '$($card.gate)' (not open): skipped" 'Yellow'; continue }
        $missing = @($card.depends | Where-Object { $_ -and -not (Is-Done $_) })
        if ($missing.Count -gt 0) { Say "$id waits for $($missing -join ', '): skipped" 'Yellow'; continue }

        Say "card $id" 'Cyan'
        if ($DryRun) { Say "  (dry run) would run $($card.file)"; $done++; continue }

        # keep the chain on top of the current main: new rules, cards and merged code appear in the worktree
        $mainHead = (GitRun @('rev-parse', 'main')).Text.Trim()
        $rb = GitRun @('rebase', $mainHead) $Worktree
        if ($rb.Exit -ne 0) {
            $null = GitRun @('rebase', '--abort') $Worktree
            Set-Card $id @{ status = 'blocked'; note = "rebase of the Codex chain onto main failed: $($rb.Text.Split("`n")[0])" }
            Say "blocked: the Codex chain does not rebase onto main (conflict). A person resolves it in $Worktree" 'Red'; $exitCode = 1; break
        }
        $null = GitRun @('update-ref', 'refs/codex/work', (GitRun @('rev-parse', 'HEAD') $Worktree).Text.Trim())

        $cardOk = $false
        $feedback = ''
        $cardBase = (GitRun @('rev-parse', 'HEAD') $Worktree).Text.Trim()   # the card is judged on everything since here, across attempts
        for ($attempt = 1; $attempt -le $MaxAttempts -and -not $cardOk; $attempt++) {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $quotaScript -Action check -Tool codex | Out-Null
            if ($LASTEXITCODE -eq 3) { Say 'Codex quota is blocked; stopping' 'Yellow'; $exitCode = 3; break }
            Set-Card $id @{ status = 'running'; attempts = $attempt; started = (Get-Date).ToString('s') }

            # A restarted card can have the same attempt number. Unique logs prevent a prior `.last.txt`
            # from becoming this attempt's BLOCKED / DECISION_NEEDED result after a CLI crash.
            $logBase = Join-Path $StateDir ("logs/{0}-{1}-{2}" -f $id, $attempt, ([guid]::NewGuid().ToString('N')))
            $prompt = @(
                "You are continuing the cognitive platform build as a worker. Work only in the current directory ($Worktree).",
                "Read these two UTF-8 files completely, then do the card: 1) $($queueRoot -replace '\\','/')/PREAMBLE.md  2) $($queueRoot -replace '\\','/')/$($card.file)",
                "When the card is done, make exactly the commit(s) the preamble describes and end your final message with one line: CARD_DONE $id",
                "If you need a decision only the operator can make, stop and end your final message with one line: DECISION_NEEDED: <the question>",
                "If you are blocked, end with one line: BLOCKED: <why>"
            )
            if ($feedback) { $prompt += "The previous attempt did NOT pass the acceptance check run outside you. Output:`n$feedback`nFix exactly that, in the same worktree (amend or add a commit)." }
            $promptFile = $logBase + '.prompt.txt'
            [System.IO.File]::WriteAllText($promptFile, ($prompt -join "`n"), (New-Object System.Text.UTF8Encoding($false)))

            $outFile = $logBase + '.last.txt'
            $codexArgs = @('exec', '--approve-for-me', '-C', $Worktree, '--skip-git-repo-check', '-c', 'mcp_servers={}', '-o', $outFile, '-')
            $codexRun = Invoke-LoggedProcess $codexExe $codexArgs $Worktree $promptFile ($logBase + '.out.txt') ($logBase + '.err.txt') ($CardTimeoutMin * 60)
            $codexExit = [int]$codexRun.Exit

            $rawLog = ''
            foreach ($f in @(($logBase + '.out.txt'), ($logBase + '.err.txt'))) { if (Test-Path -LiteralPath $f) { $rawLog += (Get-Content -LiteralPath $f -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) } }
            if ($codexRun.TimedOut) { $feedback = "codex timed out after $CardTimeoutMin minutes`n$rawLog"; Say "  attempt $attempt timed out; captured output is in $logBase" 'Yellow'; continue }
            # Only the CLI's own error lines count. The raw log also holds files Codex READ (AGENTS.md mentions 429 and
            # "rate limit"), which made the first smoke run stop on a card that had in fact been committed.
            if ($codexExit -ne 0 -and $rawLog -match '(?im)^\s*(ERROR|Error)\b[^\r\n]*(usage limit|rate limit|try again at|\b429\b)') {
                & powershell -NoProfile -ExecutionPolicy Bypass -File $quotaScript -Action set -Tool codex -Hours 5 -Reason 'codex-continue saw a quota message' | Out-Null
                Set-Card $id @{ status = 'pending'; note = 'stopped: Codex quota' }
                Say 'Codex quota reached; recorded in oracle-quota; stopping' 'Yellow'; $exitCode = 3; break
            }
            $last = ''
            if (Test-Path -LiteralPath $outFile) { $last = Get-Content -LiteralPath $outFile -Raw -Encoding UTF8 }
            if ($last -match '(?m)^DECISION_NEEDED:\s*(.+)$') { Set-Card $id @{ status = 'needs_decision'; note = $Matches[1].Trim() }; Say "needs a decision: $($Matches[1].Trim())" 'Yellow'; $exitCode = 1; break }
            if ($last -match '(?m)^BLOCKED:\s*(.+)$') { Set-Card $id @{ status = 'blocked'; note = $Matches[1].Trim() }; Say "blocked: $($Matches[1].Trim())" 'Red'; $exitCode = 1; break }

            # ---- acceptance, run here (outside Codex) ----
            $problems = @()
            $newCommits = [int](GitRun @('rev-list', '--count', "$cardBase..HEAD") $Worktree).Text.Trim()
            if ($newCommits -lt 1) { $problems += 'no new commit in the worktree' }
            if ((GitRun @('status', '--porcelain') $Worktree).Text.Trim()) { $problems += 'the worktree is not clean (uncommitted or untracked files)' }
            $touched = (GitRun @('diff', '--name-only', "$cardBase..HEAD") $Worktree).Text
            if ($newCommits -ge 1 -and $touched -notmatch 'agency-os/reports/review-debt\.md') { $problems += 'the commit(s) did not add a row to agency-os/reports/review-debt.md' }
            $n = 0
            foreach ($chk in @($card.check)) {
                if (-not $chk) { continue }
                $n++
                $dir = if ($chk.PSObject.Properties['cwd'] -and $chk.cwd) { Join-Path $Worktree $chk.cwd } else { $Worktree }
                $log = "$logBase.check$n.txt"
                $code = Run-Command ([string]$chk.cmd) $dir $log 1800
                if ($code -ne 0) {
                    $tail = ((Get-Content -LiteralPath $log -Tail 25 -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath ($log + '.err') -Tail 25 -ErrorAction SilentlyContinue)) -join "`n"
                    $problems += "check failed (exit $code): $($chk.cmd)`n$tail"
                }
            }
            if ($problems.Count -eq 0) {
                $head = (GitRun @('rev-parse', 'HEAD') $Worktree).Text.Trim()
                $null = GitRun @('update-ref', 'refs/codex/work', $head)
                Set-Card $id @{ status = 'done'; commit = $head; finished = (Get-Date).ToString('s'); note = '' }
                Say "  done: $id at $($head.Substring(0, 9)) (kept as refs/codex/work; review-debt.md lists it)" 'Green'
                $cardOk = $true; $done++
            } else {
                $feedback = ($problems -join "`n---`n")
                Say "  attempt $attempt did not pass: $($problems[0].Split("`n")[0])" 'Yellow'
            }
        }
        if (-not $cardOk) {
            $s = Card-State $id
            if ($s.status -eq 'running') { Set-Card $id @{ status = 'blocked'; note = "failed $MaxAttempts attempts: $($feedback.Split("`n")[0])" }; $exitCode = 1 }
            if ($exitCode -eq 3) { break }   # the quota is gone: nothing else can run
            continue
        }
    }
} finally {
    if ($startedPg) { & docker stop $pgName 2>$null | Out-Null }
    if ($null -eq $previousRequirePostgres) { Remove-Item Env:COGNITIVE_OS_REQUIRE_POSTGRES -ErrorAction SilentlyContinue } else { $env:COGNITIVE_OS_REQUIRE_POSTGRES = $previousRequirePostgres }
}
Say "finished: $done card(s) done this run" 'Cyan'
exit $exitCode
