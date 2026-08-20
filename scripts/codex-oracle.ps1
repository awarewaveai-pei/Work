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

function Invoke-Git {
    <#
      Runs git and returns @{ Text; Exit }.

      Two traps handled here:
      - git writes advisory text to stderr (CRLF-conversion warnings, hint blocks). Under
        $ErrorActionPreference='Stop' a native command's stderr becomes a TERMINATING error
        in PowerShell 5.1, so a harmless warning would abort the run. The exit code is the
        authority on success; stderr text is informational.
      - captured output may contain CJK (commit subjects, diff bodies), so it goes through
        the UTF-8 console wrapper.
    #>
    param([string[]]$GitArgs, [string]$Root)

    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out  = Invoke-WithUtf8Console { & git -C $Root @GitArgs 2>&1 }
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
    $Prompt = Get-Content -LiteralPath $PromptFile -Raw
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
        if ($Path.Count -gt 0) { $diffArgs += @('--') + $Path }

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
            if ($Path.Count -gt 0) { $stagedArgs += @('--') + $Path }
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
            $reviewableExt = @('.ps1','.psm1','.ts','.tsx','.js','.jsx','.mjs','.cjs','.sh',
                               '.py','.sql','.json','.yml','.yaml','.toml','.md','.php','.css','.html')
            $secretish     = '(^|[\\/._-])(env|secret|secrets|credential|credentials|token|tokens|password|passwd|vault|id_rsa|id_ed25519)([\\/._-]|$)|\.(pem|key|pfx|p12|crt|keystore)$'

            $ru        = Invoke-Git -GitArgs @('ls-files','--others','--exclude-standard') -Root $root
            $untracked = @($ru.Text -split "`n" | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
            if ($Path.Count -gt 0) {
                $untracked = @($untracked | Where-Object {
                    $f = $_
                    ($Path | Where-Object { $f -like (($_ -replace '\\', '/').TrimEnd('/') + '*') }).Count -gt 0
                })
            }

            $inlined = @()
            $skipped = @()
            foreach ($u in $untracked) {
                $full = Join-Path $root ($u -replace '/', '\')
                if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
                if ($u -match $secretish) { $skipped += "$u (name suggests a secret)"; continue }
                if ($reviewableExt -notcontains ([IO.Path]::GetExtension($u).ToLower())) {
                    $skipped += "$u (not a reviewable source type)"; continue
                }
                if ((Get-Item -LiteralPath $full).Length -gt 512KB) {
                    $skipped += "$u (larger than 512KB)"; continue
                }
                # -Encoding UTF8 is required: Windows PowerShell 5.1 decodes BOM-less files
                # with the ANSI codepage (CP950 here), which mangles CJK before it is sent.
                $body = Get-Content -LiteralPath $full -Raw -Encoding UTF8
                $diffText += "`n`n--- NEW UNTRACKED FILE: $u ---`n" + $body
                $inlined  += $u
            }

            if ($inlined.Count -gt 0) {
                Write-Host ("codex-oracle: inlining {0} untracked file(s): {1}" -f $inlined.Count, ($inlined -join ', ')) -ForegroundColor DarkGray
            }
            if ($skipped.Count -gt 0) {
                # Announced, not swallowed: an unreviewed new file is a gap the caller must know about.
                Write-Host ("codex-oracle: NOT reviewed ({0}): {1}" -f $skipped.Count, ($skipped -join '; ')) -ForegroundColor DarkYellow
            }
        }

        if (-not $diffText.Trim()) {
            Write-Error "Nothing to review: no diff for the given ref/paths. Pass -DiffRef <commit> to review an existing commit."
            exit 2
        }
        Set-Content -LiteralPath $diffFile -Value $diffText -Encoding UTF8
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
    [void]$sb.AppendLine((Get-Content -LiteralPath $diffFile -Raw))
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
$stamp   = [guid]::NewGuid().ToString('N').Substring(0,8)
$pktFile = Join-Path $env:TEMP "codex-oracle-packet-$stamp.md"
$outFile = Join-Path $env:TEMP "codex-oracle-out-$stamp.txt"
$logFile = Join-Path $env:TEMP "codex-oracle-log-$stamp.txt"
$errFile = $logFile + '.err'
Set-Content -LiteralPath $pktFile -Value $packet -Encoding UTF8

Write-Host ("codex-oracle: mode={0} root={1} packet={2}KB" -f `
    $Mode, $root, [math]::Round((Get-Item -LiteralPath $pktFile).Length / 1KB, 1)) -ForegroundColor DarkGray

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

$answer = (Get-Content -LiteralPath $outFile -Raw)
Write-Host ""
Write-Host $answer
Write-Host ""

$bytes = [Text.Encoding]::UTF8.GetByteCount($answer)
Write-Host ("codex-oracle: exit={0} ms={1} answer={2}B" -f $exit, $sw.ElapsedMilliseconds, $bytes) -ForegroundColor DarkGray

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
