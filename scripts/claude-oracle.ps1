<#
.SYNOPSIS
  Cross-model oracle for changes WRITTEN BY CODEX: Claude reviews, read-only.

.DESCRIPTION
  Mirror of /codex-review for the reversed direction (AGENTS.md section 4: the
  oracle is always the model that did not write the change). Same three steps
  and the same ORACLE-gate artifact as the Codex path:
    1. write-oracle-artifact.ps1 -Mode capture   (diff snapshot BEFORE review)
    2. claude -p over that snapshot              (read-only tools, hooks off)
    3. write-oracle-artifact.ps1 -Mode review -Reviewer claude
  Refuses to run inside a Claude session (scripts/_agent-host.ps1): Claude
  reviewing Claude would satisfy the ORACLE gate without a second model.
  The child `claude -p` runs with disableAllHooks (so it cannot trigger
  AO-RESUME), no MCP servers, and --tools limited to Read/Grep/Glob. Quota
  errors trip scripts/oracle-quota.ps1 (tool `critic` = the Claude quota).

  Exit codes: 0 artifact written | 2 nothing to review | 3 quota blocked |
              4 wrong host (same model as the writer) | 1 failure.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claude-oracle.ps1 -Context "what this change solves"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Context,
    [string]$Model = 'opus',
    [string]$WorkRoot = '',
    # Escape hatch for a human running this by hand from a Claude terminal; it
    # still records reviewer=claude, so the artifact stays honest.
    [switch]$AllowSameHost,
    # Scope the capture (same semantics as write-oracle-artifact.ps1): a whole dirty
    # worktree can exceed what the reviewer returns valid JSON for (470KB, 2026-09-30).
    [string]$DiffRef = '',
    [string[]]$Path = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Path = @($Path | Where-Object { $_ })   # an empty -Path '' would be dropped by PS 5.1 native-arg passing

if (-not $WorkRoot) { $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }
$quota = Join-Path $PSScriptRoot 'oracle-quota.ps1'
$writer = Join-Path $PSScriptRoot 'write-oracle-artifact.ps1'
. (Join-Path $PSScriptRoot '_agent-host.ps1')

$agentHost = Get-AgentHost
if ($agentHost -eq 'claude' -and -not $AllowSameHost) {
    Write-Host "claude-oracle: refusing - this is a Claude session, so Claude is the writer. Use /codex-review; -AllowSameHost only if you are running this by hand for a Codex-authored change." -ForegroundColor Red
    exit 4
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quota -Action check -Tool critic
if ($LASTEXITCODE -eq 3) {
    Write-Host "claude-oracle: Claude quota blocked -> written self-review + mutation evidence, then '- ORACLE_WAIVED: claude quota blocked' in WORKLOG." -ForegroundColor Yellow
    exit 3
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "claude-oracle: 'claude' CLI not on PATH." -ForegroundColor Red
    exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tmp = Join-Path $env:TEMP "claude-oracle-$stamp"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$diffFile = Join-Path $tmp 'reviewed.diff'
$answerFile = Join-Path $tmp 'answer.json'
$stderrFile = Join-Path $tmp 'claude-stderr.txt'
$settingsFile = Join-Path $tmp 'settings.json'
$mcpFile = Join-Path $tmp 'mcp.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($settingsFile, '{"disableAllHooks": true}', $utf8)
[IO.File]::WriteAllText($mcpFile, '{"mcpServers": {}}', $utf8)

$captureArgs = @('-Mode', 'capture', '-Out', $diffFile, '-RepoRoot', $WorkRoot)
if ($DiffRef) { $captureArgs += @('-DiffRef', $DiffRef) }
if ($Path.Count -gt 0) { $captureArgs += '-Path'; $captureArgs += ($Path -join ',') }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $writer @captureArgs
if ($LASTEXITCODE -eq 2) { Write-Host "claude-oracle: nothing to review." -ForegroundColor DarkGray; exit 2 }
if ($LASTEXITCODE -ne 0) { Write-Host "claude-oracle: capture failed (exit $LASTEXITCODE)." -ForegroundColor Red; exit 1 }

$prompt = @'
You are the cross-model oracle for a change written by OpenAI Codex in this repository. The complete change (unified diff plus untracked files) follows these instructions.
Review it adversarially for real defects only: correctness, security, data loss, broken invariants, cross-file contract breaks, governance rules in CLAUDE.md / agency-os/AGENTS.md that the change violates.
Also verify: does this change depend on something NOT visible in the diff (a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo)? If that makes the change wrong or silently unreachable, report it.
Confirm every claim with Read/Grep/Glob against the repository and cite file:line. If you cannot support a real finding, return no findings; never invent a weak or speculative finding.
Reply with ONLY this JSON, no prose, no code fence:
{"verdict":"approve|needs-attention","findings":[{"severity":"critical|high|medium|low","file":"path","line":1,"title":"...","detail":"...","fix":"..."}]}
'@

# Instructions travel on stdin with the diff: Windows PowerShell 5.1 does not
# escape embedded double quotes when passing an argument to a native exe, so the
# JSON example above would split the command line.
$stdinText = $prompt + "`n`n===== CHANGE UNDER REVIEW (unified diff + untracked files) =====`n" + (Get-Content -Raw -Encoding UTF8 -LiteralPath $diffFile)

$prevOut = $OutputEncoding
$prevConsole = [Console]::OutputEncoding
$prevEap = $ErrorActionPreference
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8
# Native stderr under $ErrorActionPreference='Stop' is raised as a terminating
# NativeCommandError, which would kill this script before the quota check below.
$ErrorActionPreference = 'Continue'
Push-Location -LiteralPath $WorkRoot
try {
    $raw = $stdinText |
        & claude -p 'Follow the review instructions at the top of stdin and answer with the JSON they specify.' `
            --model $Model --output-format text --no-session-persistence `
            --settings $settingsFile --strict-mcp-config --mcp-config $mcpFile `
            --tools 'Read,Grep,Glob' --permission-mode dontAsk 2> $stderrFile
    $claudeExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
} finally {
    Pop-Location
    $OutputEncoding = $prevOut
    [Console]::OutputEncoding = $prevConsole
    $ErrorActionPreference = $prevEap
}
$answer = (@($raw) | ForEach-Object { [string]$_ }) -join "`n"
$stderrText = if (Test-Path -LiteralPath $stderrFile) { (Get-Content -Raw -Encoding UTF8 -LiteralPath $stderrFile) } else { '' }

# Keep only the JSON object if the model wrapped it anyway, so the artifact
# writer's JSON-first findings count works.
$fence = [regex]::Match($answer, '(?s)```(?:json)?\s*(\{.*\})\s*```')
if ($fence.Success) { $answer = $fence.Groups[1].Value }
# The reviewer may put prose before/after the JSON (seen 2026-10-01, opus): keep the span
# from the verdict object's opening brace to the last closing brace; parsing below still
# decides validity, so a prose-only or malformed answer still fails closed.
if ($answer -notmatch '^\s*\{') {
    # The JSON must END the answer (quoted objects inside prose, e.g. echoed from the diff,
    # are not accepted), and the first `{` whose slice parses with a verdict wins.
    $close = $answer.LastIndexOf('}')
    if ($close -ge 0 -and -not $answer.Substring($close + 1).Trim()) {
        $open = $answer.IndexOf('{')
        while ($open -ge 0 -and $open -lt $close) {
            $slice = $answer.Substring($open, $close - $open + 1)
            $sliceObj = $null
            try { $sliceObj = $slice | ConvertFrom-Json -ErrorAction Stop } catch { $sliceObj = $null }
            if ($sliceObj -and ($sliceObj.PSObject.Properties.Name -contains 'verdict')) { $answer = $slice; break }
            $open = $answer.IndexOf('{', $open + 1)
        }
    }
}
$answerIsJson = $false
$parsedAnswer = $null
try {
    $parsedAnswer = $answer | ConvertFrom-Json -ErrorAction Stop
    $hasVerdict = $parsedAnswer.PSObject.Properties.Name -contains 'verdict'
    $hasFindings = $parsedAnswer.PSObject.Properties.Name -contains 'findings'
    $validVerdict = $hasVerdict -and ([string]$parsedAnswer.verdict -in @('approve', 'needs-attention'))
    $answerIsJson = $hasVerdict -and $hasFindings -and $validVerdict
} catch { $answerIsJson = $false }

# Quota detection runs ONLY on a failed call: the reviewed diff itself can
# contain "rate limit" or "429" (this repo has such code), and matching that in
# a successful answer would block the critic quota for five hours.
if (-not $answerIsJson -or $claudeExit -ne 0) {
    $failText = ($stderrText + "`n" + $answer)
    if ($failText -match '(?i)usage limit|rate limit|\b429\b|try again at|limit reached') {
        $reason = (($failText -split "`n" | Where-Object { $_ -match '(?i)limit|429' } | Select-Object -First 1) -replace '"', "'")
        if ($reason.Length -gt 150) { $reason = $reason.Substring(0, 150) }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quota -Action set -Tool critic -Hours 5 -Reason ("claude-oracle: " + $reason)
        Write-Host "claude-oracle: Claude quota hit; breaker set. Fallback: written self-review + ORACLE_WAIVED." -ForegroundColor Yellow
        exit 3
    }
}
if ($claudeExit -ne 0 -or -not $answer.Trim() -or -not $answerIsJson) {
    Write-Host "claude-oracle: claude -p failed or returned an invalid/incomplete review schema (exit $claudeExit)." -ForegroundColor Red
    if ([string]$stderrText -and $stderrText.Trim()) { Write-Host $stderrText.Trim() }
    exit 1
}

[IO.File]::WriteAllText($answerFile, $answer, $utf8)

# -Context is operator text: strip quotes/newlines, because PS 5.1 passes native
# arguments without escaping embedded quotes.
$safeContext = ($Context -replace '"', "'" -replace '\r?\n', ' ')
# Same scope as the capture: the writer labels the artifact `partialreview` (not accepted by
# the ORACLE gate) only when it sees -DiffRef/-Path here; omitting them would record a
# scoped review as a whole-repo one.
$reviewArgs = @('-Mode', 'review', '-Reviewer', 'claude', '-ReviewedDiff', $diffFile, '-Context', $safeContext, '-AnswerFile', $answerFile, '-RepoRoot', $WorkRoot)
if ($DiffRef) { $reviewArgs += @('-DiffRef', $DiffRef) }
if ($Path.Count -gt 0) { $reviewArgs += '-Path'; $reviewArgs += ($Path -join ',') }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $writer @reviewArgs
if ($LASTEXITCODE -ne 0) { Write-Host "claude-oracle: artifact write failed (exit $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quota -Action clear -Tool critic | Out-Null

Write-Host ""
Write-Host "---- Claude oracle answer (verify every file:line before acting) ----"
Write-Host $answer
exit 0
