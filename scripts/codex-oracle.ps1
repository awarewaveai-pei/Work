#requires -Version 5.1
<#
.SYNOPSIS
  Run Codex as a READ-ONLY external oracle: repo inspection or adversarial review.

.DESCRIPTION
  Claude Code is the only writer in this repo — every governance gate (git-log-injector,
  file-path-router, high-risk-bash-warn, verify-gate-commit, audit-cp950-traps) is a
  Claude Code hook and does not exist for other processes. Codex therefore never edits;
  it reads, analyses, and argues. This wrapper makes that non-negotiable by hardcoding
  `-s read-only`.

  It also fixes the context-cost problem. A bare `codex exec` echoes its whole system
  prompt to stdout — ~120 KB per call, all of which lands in the caller's context. With
  `-o <file>` only the final message is kept: the same answer costs ~150 bytes. Relying
  on remembering the flag does not work (three calls on 2026-08-17 forgot it), so the
  flag lives here instead.

.PARAMETER Mode
  inspect — read-only analysis of the repo. Use BEFORE planning, so the expensive
            "read many files" step runs on the cheaper quota and returns a digest.
  review  — adversarial review of a diff. Use AFTER writing code, as the external
            oracle that R0 requires (self-description does not satisfy it).

.PARAMETER DiffRef
  review mode only. A commit, range, or ref to review. Omit to review the working tree
  (staged + unstaged), which is the usual pre-commit case.

.EXAMPLE
  .\scripts\codex-oracle.ps1 -Mode inspect -Prompt "How does client onboarding write to Supabase? Files and entry points only."

.EXAMPLE
  .\scripts\codex-oracle.ps1 -Mode review -Context "Fixes a monitor that reported PASS while its only detector was blind."

.NOTES
  Cost: runs on the operator's ChatGPT subscription via `codex` CLI auth (authMethod
  chatgpt). It does NOT touch OPENAI_API_KEY, and must not be swapped for the
  chatgpt-*/gemini-*/grok-* MCP tools, which bill per token against a separate account.
#>
[CmdletBinding()]
param(
    [ValidateSet('inspect','review')]
    [string]$Mode = 'review',

    [string]$Prompt = '',
    [string]$PromptFile = '',

    # review mode: what the change is FOR. The oracle finds far less without intent.
    [string]$Context = '',

    [string]$DiffRef = '',
    [string[]]$Path = @(),

    [string]$RepoRoot = '',
    [int]$TimeoutSec = 900,

    # Keep the noisy transcript for debugging the wrapper itself.
    [switch]$Raw
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# git output may carry CJK (commit subjects, diff bodies). Capturing it unwrapped on a
# Big5 console is the CP950 trap that audit-cp950-traps.ps1 exists to catch.
$encHelpers = Join-Path $PSScriptRoot '_console-encoding-helpers.ps1'
if (Test-Path -LiteralPath $encHelpers) { . $encHelpers }
. (Join-Path $PSScriptRoot 'oracle-capture-policy.ps1')
$capturePolicy = Get-OracleCapturePolicy

function Invoke-Git {
    <#
      Runs git and returns @{ Text; Exit }.

      Three traps handled here:
      - git writes advisory text to stderr (CRLF-conversion warnings, hint blocks). Under
        $ErrorActionPreference='Stop' a native command's stderr becomes a TERMINATING error
        in PowerShell 5.1, so a harmless warning would abort the run. The exit code is the
        authority on success; stderr text is informational.
      - captured output may contain CJK (commit subjects, diff bodies), so it goes through
        the UTF-8 console wrapper.
      - core.quotepath defaults to true, which C-quotes+octal-escapes any path containing
        a non-ASCII byte in diff headers and --name-only output (e.g. a literal
        `"Website\342\200\231s Guide.md"` instead of `Website's Guide.md`). The
        files-reviewed extraction below regex-matches the diff header directly, so a
        quoted path would silently fail to match and the review would look like it never
        touched that file (codex stop-hook, round 5). -c here is the single choke point
        for every git call this script makes.
    #>
    param([string[]]$GitArgs, [string]$Root)

    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out  = Invoke-WithUtf8Console { & git -c core.quotepath=false -C $Root @GitArgs 2>&1 }
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        return @{ Text = (@($out) -join "`n"); Exit = $code }
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Resolve-RepoRoot {
    param([string]$Given)
    if ($Given -and (Test-Path -LiteralPath $Given)) {
        return (Resolve-Path -LiteralPath $Given).Path
    }
    if (Get-Command Invoke-WithUtf8Console -ErrorAction SilentlyContinue) {
        $r = Invoke-Git -GitArgs @('rev-parse','--show-toplevel') -Root (Get-Location).Path
        if ($r.Exit -eq 0 -and $r.Text.Trim()) { return ($r.Text.Trim() -replace '/', '\') }
    }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }
    return (Get-Location).Path
}

function Resolve-CodexExe {
    # npm installs three shims: `codex` (shell), `codex.cmd`, `codex.ps1`. Get-Command
    # resolves `codex` to the .ps1 first, which Start-Process cannot launch ("not a valid
    # Win32 application"). Pick a real executable instead.
    $cands = @(Get-Command codex -All -ErrorAction SilentlyContinue |
               Where-Object { $_.CommandType -eq 'Application' })
    foreach ($ext in @('.cmd', '.exe', '.bat')) {
        $hit = $cands | Where-Object { $_.Source -and $_.Source.ToLower().EndsWith($ext) } | Select-Object -First 1
        if ($hit) { return $hit.Source }
    }
    if ($cands.Count -gt 0) { return $cands[0].Source }
    return $null
}

$codexExe = Resolve-CodexExe
if (-not $codexExe) {
    Write-Error "codex CLI not found on PATH. Install with: npm install -g @openai/codex"
    exit 2
}

$root = Resolve-RepoRoot -Given $RepoRoot

# ---- Assemble the question -------------------------------------------------
if ($PromptFile) {
    if (-not (Test-Path -LiteralPath $PromptFile)) {
        Write-Error "PromptFile not found: $PromptFile"
        exit 2
    }
    $Prompt = Get-Content -LiteralPath $PromptFile -Raw -Encoding UTF8
}

# Rule 4 is the one that matters most: without an explicit licence to return nothing,
# a reviewer pads the list with theoretical concerns and the real findings drown.
$rules = @(
    '# HARD RULES',
    '',
    '1. Cite `file:line` you actually verified by reading the file. If you cannot verify a',
    '   line number, do not make the claim.',
    '2. Report defects only: wrong behaviour, crash, silent failure, security issue, or a',
    '   check that fails to detect what it claims. No style, naming, or comment opinions.',
    '3. Give a concrete scenario per finding: specific state -> specific wrong outcome.',
    '   "This could be fragile" is not a finding.',
    '4. If you find nothing real, say NO FINDINGS and stop. Inventing weak findings to look',
    '   useful is the worst possible outcome.',
    '5. Mark each finding CONFIRMED (traced in code) or PLAUSIBLE (suspected, unverified).',
    '6. You are in a read-only sandbox. Do not attempt to modify anything.'
) -join "`n"

$sb       = New-Object System.Text.StringBuilder
$diffFile = $null
$inlined  = @()   # untracked files inlined into the diff; populated below only when reviewing the working tree

# Codex must not review a change Codex wrote (AGENTS.md section 4).
. (Join-Path $PSScriptRoot '_agent-host.ps1')
if ((Get-AgentHost) -eq 'codex') {
    Write-Host "codex-oracle: refusing - this is a Codex session, so Codex is the writer. Run /claude-review instead." -ForegroundColor Red
    exit 4
}

if ($Mode -eq 'review') {
    $diffFile = Join-Path $env:TEMP ("codex-oracle-diff-{0}.patch" -f ([guid]::NewGuid().ToString('N').Substring(0,8)))
    try {
        # `git diff <commit>` compares the WORKING TREE against that commit — it does not
        # show what the commit changed. Reviewing a single commit needs `git show`; only a
        # two-dot/three-dot range belongs on `git diff`.
        if ($DiffRef) {
            if ($DiffRef -match '\.\.') { $diffArgs = @('diff', $DiffRef) }
            else                        { $diffArgs = @('show', '--format=', '--patch', $DiffRef) }
        } else {
            $diffArgs = @('diff')
        }
        # FINDING 4 (codex round 2, 2026-08-20): AO-CLOSE runs `git add -A` before the
        # gate, so a rerun after any later gate failure would see the PREVIOUS artifact
        # as STAGED content. Excluding it from the untracked collector alone was not
        # enough -- the artifact directory is excluded from every diff, staged or not.
        # Widened 2026-09-20 from the oracle artifact dir alone to every runtime/generated
        # path in the shared policy. The untracked collector already skipped them; the
        # TRACKED diff did not, and 8 deleted `.claude/sessions/*.md` files were still
        # arriving as 9656 lines of deletion hunks -- 81% of a measured 640KB packet.
        # Derived from Get-OracleCapturePolicy so this list cannot drift from the regex one.
        $excludeArtifacts = @(Get-OracleGitExcludePathspecs -Policy $capturePolicy)
        if ($Path.Count -gt 0) { $diffArgs += @('--') + $Path + $excludeArtifacts }
        else                   { $diffArgs += @('--', '.') + $excludeArtifacts }

        $r        = Invoke-Git -GitArgs $diffArgs -Root $root
        $diffText = $r.Text

        # stderr is folded into the text, so without an exit-code check a typo'd ref would
        # be handed to the oracle AS the diff and it would dutifully review git's error.
        if ($r.Exit -ne 0) {
            Write-Error "git $($diffArgs -join ' ') failed (exit=$($r.Exit)): $($diffText.Trim())"
            exit 2
        }

        if (-not $DiffRef) {
            # Working tree: the unstaged diff alone misses anything already staged, which
            # is the normal pre-commit state and exactly what needs reviewing.
            $stagedArgs = @('diff', '--cached')
            if ($Path.Count -gt 0) { $stagedArgs += @('--') + $Path + $excludeArtifacts }
            else                   { $stagedArgs += @('--', '.') + $excludeArtifacts }
            $rs = Invoke-Git -GitArgs $stagedArgs -Root $root
            if ($rs.Exit -ne 0) {
                Write-Error "git diff --cached failed (exit=$($rs.Exit)): $($rs.Text.Trim())"
                exit 2
            }
            $diffText = ($rs.Text + "`n" + $diffText).Trim()
        }

        # Untracked files are invisible to `git diff`. Left unhandled, a review of a
        # brand-new file silently examines nothing and still reports "no findings" —
        # the reviewer goes blind while looking like it passed. Same failure class this
        # repo hit in check-smoke-tests.ps1 (skip treated as PASS), so it is handled here
        # rather than trusted to the caller noticing.
        #
        # But inlining sends file contents to a third party, so scope is deliberately
        # narrow: reviewable source extensions only, never anything whose name suggests a
        # secret, and every inlined path is printed so the caller sees what left the machine.
        if (-not $DiffRef) {
            $ru        = Invoke-Git -GitArgs @('ls-files','--others','--exclude-standard') -Root $root
            $untracked = @($ru.Text -split "`n" | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
            if ($Path.Count -gt 0) {
                # @() is required around the inner Where-Object. Under Set-StrictMode
                # -Version Latest (line 61), the synthetic Count/Length ETS member is
                # suppressed on anything that isn't a REAL array -- that includes both
                # $null (zero matches) AND a bare scalar (exactly one match, which
                # PowerShell's pipeline does not wrap). So `.Count` on the unwrapped
                # result throws PropertyNotFoundStrict for 0-match AND 1-match, i.e. on
                # nearly every real -Path run (verified: throws even when $f DOES match
                # $Path, if $Path itself has exactly one element). Only @()-wrapping
                # guarantees a true array regardless of match count. Confirmed via
                # isolated repro + critic cross-check, 2026-08-29.
                $untracked = @($untracked | Where-Object {
                    $f = $_
                    @($Path | Where-Object { $f -like (($_ -replace '\\', '/').TrimEnd('/') + '*') }).Count -gt 0
                })
            }

            $capture = Invoke-OracleUntrackedCapture -Root $root -Candidates $untracked -Policy $capturePolicy -Path $Path
            $diffText += $capture.Additions
            $inlined = @($capture.Inlined)
            $skipped = @($capture.Skipped)

            if ($inlined.Count -gt 0) {
                Write-Host ("codex-oracle: inlining {0} untracked file(s): {1}" -f $inlined.Count, ($inlined -join ', ')) -ForegroundColor DarkGray
            }
            if ($skipped.Count -gt 0) {
                # Announced, not swallowed: an unreviewed new file is a gap the caller must know about.
                Write-Host ("codex-oracle: NOT reviewed ({0}): {1}" -f $skipped.Count, ($skipped -join '; ')) -ForegroundColor DarkYellow
            }
        }

        # This repo's session hooks auto-commit the dirty tree mid-task ("[claude]
        # checkpoint: ..."), so a no-DiffRef review can silently review a SMALLER (or
        # completely EMPTY) diff than the operator intends -- the real work already
        # landed in HEAD before this ran. Codex has no way to know that happened; its
        # finding then looks like "this change was never made" when it was, just
        # earlier, in a different commit (codex stop-hook, 2026-08-24: this exact
        # scenario produced one false-positive finding that took a manual `git show
        # HEAD` to clear). Computed BEFORE the empty-diff check below on purpose (round
        # 2 of this same fix, codex stop-hook again): the fully-absorbed case -- ALL of
        # the work already auto-committed, leaving nothing at all to diff -- is the more
        # severe manifestation of this exact problem, and it hits the generic "Nothing
        # to review" exit first if this check runs after it, silently excluding the case
        # the warning exists to explain. Not auto-resolved -- picking the "right" earlier
        # commit to diff against is a judgement call this script shouldn't guess at --
        # just surfaced so neither an empty nor a non-empty diff is silently trusted.
        # Generalised 2026-08-25 from '[claude] checkpoint:' to any '[claude] ' automated
        # commit. The per-prompt auto-checkpoint that motivated this warning is gone, but the
        # HAZARD is not: ao-close.ps1 also runs `git add -A` + commit, this repo already has
        # 101 '[claude] chore: AO-CLOSE sync' commits, and a PARALLEL session's AO-CLOSE can
        # commit THIS session's working tree. Keying on the checkpoint prefix alone would
        # have retired the warning while the thing it warns about still happens -- a guard
        # must be scoped to the hazard, not to the string that happened to trigger it first.
        $looksLikeAutoCommitted = $false
        if (-not $DiffRef) {
            $rLog = Invoke-Git -GitArgs @('log', '-3', '--format=%H %s') -Root $root
            $looksLikeAutoCommitted = ($rLog.Exit -eq 0 -and ($rLog.Text -match '(?m)^\S+ \[claude\] '))
        }

        if (-not $diffText.Trim()) {
            if ($looksLikeAutoCommitted) {
                Write-Error "Nothing to review -- AND recent commit(s) at HEAD are automated ones ([claude] checkpoint / AO-CLOSE sync), so this is likely because the work already landed there, not because nothing changed. Re-run with -DiffRef <commit before the checkpoints> to review it."
            } else {
                Write-Error "Nothing to review: no diff for the given ref/paths. Pass -DiffRef <commit> to review an existing commit."
            }
            exit 2
        }

        if ($looksLikeAutoCommitted) {
            Write-Host "codex-oracle: WARNING -- recent commit(s) at HEAD look like session auto-checkpoints. This review's diff may not include everything you expect (the real work may have already landed in one of them). If the finding looks incomplete or contradicts work you know happened, re-run with -DiffRef <commit before the checkpoints> instead of trusting this diff." -ForegroundColor DarkYellow
        }

        Set-Content -LiteralPath $diffFile -Value $diffText -Encoding UTF8

        # Record exactly which paths were IN the diff sent to Codex -- including deleted
        # files, whose `diff --git a/<path> b/<path>` header survives even though there is
        # no post-change content (verified empirically 2026-08-24: git still emits it for a
        # pure deletion). Persisted into the artifact below. Without this, the gate can only
        # infer "the review probably covered this file" from mtime ordering, which proves
        # timing lined up, not that the file's diff was actually in what Codex read (codex
        # stop-hook, round 4: a deletion could pass on ordering alone with no such check).
        # `Invoke-Git` runs every git call with `-c core.quotepath=false` (round 5), so
        # header paths with spaces or non-ASCII characters arrive unquoted here -- the
        # regex below expects exactly that unquoted `a/`/`b/` form. (Literal double-quote
        # or backslash BYTES in a filename would still force quoting regardless of this
        # setting; no such path exists in this repo, verified via `git ls-files`, so that
        # residual case is not handled -- premature generality R0 warns against.)
        #
        # files-reviewed vs deletions-reviewed (round 6, codex CONFIRMED finding): a path
        # appearing in files-reviewed only proves SOME diff for that path was sent to
        # Codex -- it does not distinguish "reviewed as a deletion" from "reviewed as a
        # prior modification, before being deleted later without a re-review". The gate
        # needs the stronger claim for the deletion-confirmation check, so deletions get
        # their own list, populated only when the file's diff block actually contains
        # `deleted file mode` (git's own marker for a pure deletion).
        # Round 7 (codex CONFIRMED): a bare path in deletions-reviewed only proves SOME
        # deletion of that path was reviewed today -- if the file gets restored, edited,
        # and deleted again later the same day, the stale path-only entry would wrongly
        # vouch for a deletion of DIFFERENT content that was never reviewed. Bind to the
        # blob hash git already prints for the removed content (`index <hash>..0000000`)
        # so a confirmation matches the specific version reviewed, not just the path.
        $reviewedPaths = New-Object System.Collections.Generic.List[string]
        $deletedPaths  = New-Object System.Collections.Generic.List[string]
        foreach ($block in [regex]::Split($diffText, '(?m)(?=^diff --git )')) {
            $dm = [regex]::Match($block, '(?m)^diff --git a/.+? b/(.+?)\s*$')
            if (-not $dm.Success) { continue }
            $p = $dm.Groups[1].Value
            $reviewedPaths.Add($p)
            if ($block -match '(?m)^deleted file mode') {
                $ixm = [regex]::Match($block, '(?m)^index ([0-9a-f]+)\.\.')
                # Fallback to bare path if the index line is ever absent (unexpected diff
                # shape) -- degrades to round 6's precision rather than losing the signal.
                if ($ixm.Success) { $deletedPaths.Add(('{0}@{1}' -f $p, $ixm.Groups[1].Value)) }
                else { $deletedPaths.Add($p) }
            }
        }
        foreach ($u in $inlined) { $reviewedPaths.Add($u) }
        $reviewedPathsList = (@($reviewedPaths) | Select-Object -Unique) -join ', '
        $deletedPathsList  = (@($deletedPaths) | Select-Object -Unique) -join ', '
    } catch {
        Write-Error "Failed to collect diff: $($_.Exception.Message)"
        exit 2
    }

    [void]$sb.AppendLine('# ROLE')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('You are an INDEPENDENT reviewer acting as an external oracle. A different AI wrote')
    [void]$sb.AppendLine('the change below. Your value is finding what it could not see in its own work.')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($rules)
    [void]$sb.AppendLine()
    if ($Context) {
        [void]$sb.AppendLine('# WHAT THIS CHANGE IS FOR')
        [void]$sb.AppendLine()
        [void]$sb.AppendLine($Context)
        [void]$sb.AppendLine()
    }
    if ($Prompt) {
        [void]$sb.AppendLine('# SPECIFIC QUESTIONS')
        [void]$sb.AppendLine()
        [void]$sb.AppendLine($Prompt)
        [void]$sb.AppendLine()
    }

    # A digest is bounded by the question asked. On 2026-08-17 the single decisive fact
    # about a change (the plugin prunes its log table at 14 days, making the new 21-day
    # threshold unreachable dead code) appeared in neither review round — nobody asked.
    # This standing question exists to attack that boundary directly.
    [void]$sb.AppendLine('# BEFORE YOU ANSWER')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('The questions above define what the author already suspects. The costly mistakes')
    [void]$sb.AppendLine('live outside them. Before writing findings, ask yourself: what does this change')
    [void]$sb.AppendLine('DEPEND ON that is not visible in the diff — a config value, a retention or')
    [void]$sb.AppendLine('timeout setting, a schema assumption, a cron job, an upstream default, a value')
    [void]$sb.AppendLine('set far above in the same file? Go read it rather than assuming it. If any such')
    [void]$sb.AppendLine('dependency contradicts the change, that is a finding and it outranks everything')
    [void]$sb.AppendLine('you were explicitly asked about.')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('# OUTPUT FORMAT')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('FINDING N: <one-line claim>')
    [void]$sb.AppendLine('  file:line   -> <path>:<line>')
    [void]$sb.AppendLine('  confidence  -> CONFIRMED | PLAUSIBLE')
    [void]$sb.AppendLine('  scenario    -> <concrete state -> concrete wrong outcome>')
    [void]$sb.AppendLine('  why missed  -> <why the author plausibly did not see it>')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('Final line: TOTAL: <n> findings   (or NO FINDINGS)')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('# DIFF UNDER REVIEW')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('```diff')
    [void]$sb.AppendLine((Get-Content -LiteralPath $diffFile -Raw -Encoding UTF8))
    [void]$sb.AppendLine('```')
}
else {
    if (-not $Prompt) {
        Write-Error "inspect mode needs -Prompt (or -PromptFile): the question to answer about the repo."
        exit 2
    }
    [void]$sb.AppendLine('# ROLE')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('You are inspecting an existing repository for another engineer who will do the')
    [void]$sb.AppendLine('design work. Report what IS there, not what should be. Answer only what is asked.')
    [void]$sb.AppendLine('Be terse: the reader pays for every token, and a digest is the whole point.')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($rules)
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('# QUESTION')
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($Prompt)
}

$packet  = $sb.ToString()
$packetBytes = Assert-OraclePacketSize -Packet $packet -Policy $capturePolicy
$stamp   = [guid]::NewGuid().ToString('N').Substring(0,8)
$pktFile = Join-Path $env:TEMP "codex-oracle-packet-$stamp.md"
$outFile = Join-Path $env:TEMP "codex-oracle-out-$stamp.txt"
$logFile = Join-Path $env:TEMP "codex-oracle-log-$stamp.txt"
$errFile = $logFile + '.err'
Set-Content -LiteralPath $pktFile -Value $packet -Encoding UTF8

Write-Host ("codex-oracle: mode={0} root={1} packet={2}KB" -f `
    $Mode, $root, [math]::Round($packetBytes / 1KB, 1)) -ForegroundColor DarkGray

# -s read-only is deliberate and must never become a parameter: it is the mechanical
# half of "Codex does not write". --ephemeral keeps one-shot reviews out of the store.
#
# mcp_servers={} disables the servers declared in ~/.codex/config.toml. Several of them
# (chatgpt-*, gemini-*, grok-*) are LLM proxies billed per token against OPENAI_API_KEY /
# GEMINI_API_KEY — a different account from the ChatGPT subscription this wrapper is meant
# to stay inside. A read-only code review needs none of them, and leaving them enabled
# also drags their startup failures into every run.
$codexArgs = @(
    'exec',
    '-C', $root,
    '-s', 'read-only',
    '--ephemeral',
    '-c', 'mcp_servers={}',
    '-o', $outFile,
    '-'
)

$sw    = [Diagnostics.Stopwatch]::StartNew()
$exit  = 0
$tries = 0

# The CLI exits 0 even when the response stream dies mid-flight ("stream disconnected
# before completion"), leaving no output file. Retry once: observed failures were
# transient network drops, and a silent empty review is the outcome to avoid.
while ($tries -lt 2) {
    $tries++
    $proc = Start-Process -FilePath $codexExe -ArgumentList $codexArgs `
            -RedirectStandardInput $pktFile -RedirectStandardOutput $logFile `
            -RedirectStandardError $errFile -NoNewWindow -PassThru

    if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
        try { $proc.Kill() } catch { }
        Write-Error "codex timed out after ${TimeoutSec}s. Raw log: $logFile"
        exit 3
    }
    # The WaitForExit(ms) overload returning true does not guarantee ExitCode is
    # populated; the parameterless call flushes the handle first. Without it $exit comes
    # back empty and `exit $exit` silently becomes 0 — a failed run would look like a pass.
    $proc.WaitForExit()
    $exit = $proc.ExitCode
    if ($null -eq $exit) { $exit = 0 }

    if (Test-Path -LiteralPath $outFile) { break }

    if ($tries -lt 2) {
        Write-Host "codex-oracle: no final message (exit=$exit) — retrying once" -ForegroundColor DarkYellow
        Start-Sleep -Seconds 5
    }
}

if (-not (Test-Path -LiteralPath $outFile)) {
    # Never fall through as success: an empty review must not be mistaken for a clean one.
    Write-Error "codex produced no final message after $tries attempt(s) (exit=$exit). Raw log: $logFile"
    exit 3
}

$answer = (Get-Content -LiteralPath $outFile -Raw -Encoding UTF8)
if ($exit -ne 0 -or -not $answer.Trim()) {
    Write-Error "codex produced an empty or failed final message (exit=$exit). Raw log: $logFile"
    exit 3
}
Write-Host ""
Write-Host $answer
Write-Host ""

$bytes = [Text.Encoding]::UTF8.GetByteCount($answer)
Write-Host ("codex-oracle: exit={0} ms={1} answer={2}B" -f $exit, $sw.ElapsedMilliseconds, $bytes) -ForegroundColor DarkGray
# Persist the answer into the repo. TEMP-only output made this collaboration
# unfalsifiable: nothing on disk distinguished "ran the oracle" from "said I ran it",
# so the only enforcement was the agent's own memory -- the exact failure mode the
# governance gates exist to remove. verify-closeout-completeness reads this directory;
# deleting these files is a governance regression, not cleanup.
$oracleDir = Join-Path $root 'agency-os\reports\oracle'
if (-not (Test-Path -LiteralPath $oracleDir)) {
    New-Item -ItemType Directory -Path $oracleDir -Force | Out-Null
}
# FINDING 1 (codex round 2, 2026-08-20): -Path / -DiffRef narrow what was reviewed, but
# the gate only pattern-matches '<date>-review-*.md'. A scoped review would therefore
# vouch for files it never saw. Scoped runs are named 'partialreview' so the gate's
# filter cannot match them; the scope is also recorded in the metadata below.
$artifactKind = if ($Mode -eq 'review' -and ($DiffRef -or $Path.Count -gt 0)) { 'partialreview' } else { $Mode }
$artifact = Join-Path $oracleDir (('{0}-{1}-{2}.md' -f (Get-Date -Format 'yyyy-MM-dd'), $artifactKind, $stamp))
$meta = @(
    ('# codex-oracle {0} -- {1}' -f $Mode, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')),
    '',
    ('- mode: `{0}`' -f $Mode),
    ('- scope: {0}' -f $(if ($Path.Count -gt 0) { '-Path ' + ($Path -join ', ') + '  <-- PARTIAL: does not satisfy the ORACLE gate' } else { 'whole repo' })),
    ('- target: `{0}`' -f $(if ($DiffRef) { $DiffRef } else { 'working tree (staged + unstaged + untracked)' })),
    ('- context: {0}' -f $(if ($Context) { $Context } else { '(none given)' })),
    ('- exit: {0} | elapsed: {1}ms | answer: {2}B' -f $exit, $sw.ElapsedMilliseconds, $bytes),
    # Machine-checkable record of which paths were IN the diff (round 4 fix). 'inspect'
    # mode has no diff, so it never sets $reviewedPathsList -- StrictMode would throw on
    # a bare reference, hence the Get-Variable guard rather than assuming Mode.
    ('- files-reviewed: {0}' -f $(
        if ((Get-Variable -Name reviewedPathsList -ErrorAction SilentlyContinue) -and $reviewedPathsList) { $reviewedPathsList }
        else { '(n/a for this mode)' }
    )),
    # Deliberately separate from files-reviewed (round 6): only paths whose diff block
    # carried git's own `deleted file mode` marker land here, each as `path@blobhash`
    # (round 7) so a same-day re-delete of different content after this one can't be
    # vouched for by this entry. See the extraction comment above for why a file's mere
    # presence in files-reviewed is not enough to confirm a DELETION of it was reviewed.
    ('- deletions-reviewed: {0}' -f $(
        if ((Get-Variable -Name deletedPathsList -ErrorAction SilentlyContinue) -and $deletedPathsList) { $deletedPathsList }
        else { '(none)' }
    )),
    '',
    '> Codex output, NOT verified truth. R0 requires the caller to confirm every',
    '> `file:line` before acting on it. Archived so that SKIPPING the oracle is',
    '> visible -- not so that its findings are trusted.',
    '',
    '---',
    '',
    $answer
)
Set-Content -LiteralPath $artifact -Value ($meta -join [Environment]::NewLine) -Encoding UTF8
Write-Host ("codex-oracle: artifact -> {0}" -f $artifact) -ForegroundColor DarkGray

if ($Mode -eq 'review') {
    # Count only, never a verdict: whether a finding is real is the caller's judgement,
    # and R0 requires the caller to verify each file:line before recording anything.
    $n = ([regex]::Matches($answer, '(?m)^\s*FINDING\s+\d+')).Count
    Write-Host ""
    Write-Host "Verify each finding yourself, then record in WORKLOG [verification]:" -ForegroundColor DarkGray
    Write-Host ("- REVIEW_DONE: critic=Deep | verdict=<pass/warn/fail> | findings=<Nc>/{0}m/<Nn>" -f $n) -ForegroundColor DarkGray
    Write-Host "  - external oracle = Codex CLI (codex exec -s read-only), not self-description" -ForegroundColor DarkGray
}

if ($Raw) {
    Write-Host "raw: packet=$pktFile log=$logFile out=$outFile" -ForegroundColor DarkGray
} else {
    Remove-Item -LiteralPath $pktFile, $logFile, $errFile -Force -ErrorAction SilentlyContinue
    if ($diffFile) { Remove-Item -LiteralPath $diffFile -Force -ErrorAction SilentlyContinue }
}

exit $exit
