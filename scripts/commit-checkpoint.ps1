# Scoped, local-only git commit helper (no push).
#
# 2026-08-25: this script no longer stages blindly. `-Paths` is mandatory, the `git add -A`
# fallback is gone, and every automated caller has been removed. It exists now for one job:
# committing a NAMED set of paths on behalf of a command that knows exactly what it changed
# (today: .claude/commands/tomo.md). For ordinary work use `git commit -m "<message>"` --
# it is the same thing, and CLAUDE.md R2 wants the message to carry root cause + verification.
# CAUTION if your message contains a literal `"`: PowerShell 5.1's argv marshalling does not
# escape an embedded quote, so `git commit -m "fix: add ""X"" class"` (or an unescaped one)
# can re-split at the quote and fail with a pathspec error. Prefer `git commit -F <file>`, or
# avoid embedded double quotes in the -m string, when composing a message by hand.
#
# Why the change: as an automated whole-tree committer this script produced 2,568 commits
# (56.4% of repo history) and six documented harm classes -- 49 tracked files committed as
# deletions (2026-05-28, 0d63eb9), 12 more (853cd26a), an uncommitted mem_limit edit swept
# in and left drifting from production for ten weeks (35834a0d), fixes silently reverted,
# external review handed empty diffs, and code pushed to main while the verify gate was
# blocking it. None of that came from the staging logic being wrong; it came from staging
# everything, automatically, on a schedule nobody chose. Requiring named paths removes the
# class at the signature level instead of guarding against it.
# Full analysis: agency-os/WORKLOG.md 2026-08-25.
param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$WorkRoot = "",
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$Paths,
    [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    # The broken-junction and shell-junk guards that used to sit here MOVED to
    # scripts/ao-close.ps1 on 2026-08-25, immediately before its `git add -A` -- the only
    # blind staging left in the repo, and therefore the only place those hazards can still
    # occur. Deleting them along with this script's `git add -A` would have retired the
    # protection while leaving the danger. Nothing to guard here any more: only the paths
    # the caller names are staged, so a broken junction cannot become a mass deletion.

    # 2026-09-05 (critic, in response to a live-reproduced concurrency bug): `git commit
    # <pathspec>` is refused outright while a merge/cherry-pick/revert/rebase/stash-pop/am
    # is unresolved (git-commit(1) EXAMPLES). Failing that here, before staging, gives an
    # actionable error instead of a bare `fatal: cannot do a partial commit during a merge`
    # after work is already staged. Mirrors the invariant-shaped check in ao-close.ps1
    # (marker files UNION `git ls-files --unmerged`, not just MERGE_HEAD) since that script
    # already found and fixed the narrower, path-shaped version of this same check twice.
    $inProgressMarkers = @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer')
    $inProgress = @($inProgressMarkers | Where-Object {
        $gp = (git rev-parse --git-path $_ 2>$null)
        $gp -and (Test-Path -LiteralPath $gp.Trim())
    })
    $unmergedNow = @(git ls-files --unmerged | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($inProgress.Count -gt 0 -or $unmergedNow.Count -gt 0) {
        throw "commit-checkpoint: refusing to run -- a merge/cherry-pick/revert/rebase/stash-pop/am operation is in progress in $WorkRoot. A scoped 'git commit -- <paths>' cannot complete until it is resolved or aborted."
    }

    # $Paths must be files, not directories: a directory pathspec would stage/commit every
    # dirty tracked file under it, including a concurrent session's, defeating the point of
    # naming paths at all. 2026-09-05: enforced structurally, not just documented in this
    # comment -- both current callers (.claude/commands/tomo.md) already pass files, so this
    # closes the residual gap without changing behavior for any real caller.
    foreach ($p in $Paths) {
        $full = Join-Path $WorkRoot $p
        if (-not (Test-Path -LiteralPath $full)) {
            throw "Path not found: $p"
        }
        if (Test-Path -LiteralPath $full -PathType Container) {
            throw "commit-checkpoint: '$p' is a directory -- -Paths only accepts individual files. Name each file explicitly."
        }
        if ($DryRun) {
            Write-Host "[dry-run] would: git add -- $p" -ForegroundColor Cyan
        } else {
            git add -- $p
            if ($LASTEXITCODE -ne 0) {
                throw "git add failed for '$p' (exit $LASTEXITCODE) -- possible index lock contention from a concurrent session"
            }
        }
    }

    if ($DryRun) {
        Write-Host "[dry-run] would: git commit -F <message-file> -- $($Paths -join ' ')" -ForegroundColor Cyan
        exit 0
    }

    # Scoped to $Paths, matching the pathspec the actual commit below uses (2026-09-05 fix):
    # an unrelated file staged by a concurrent session must not affect this script's
    # "nothing to commit" decision, and must not be scanned by the secret guard for a
    # commit that will never include it.
    git diff --cached --quiet -- $Paths
    if ($LASTEXITCODE -eq 0) {
        Write-Host "commit-checkpoint: nothing staged to commit (named paths had no changes)." -ForegroundColor Yellow
        exit 0
    }

    # Basename `.env` only; common key material (not all possible secrets)
    $blocked = @(
        "[\\/]\.env$",
        "[\\/]id_rsa$",
        "[\\/]id_ed25519$",
        "\.pem$",
        "\.p12$",
        "recovery-codes",
        "\.key$"
    )
    $staged = @(git diff --cached --name-only -- $Paths)
    foreach ($f in $staged) {
        foreach ($pat in $blocked) {
            if ($f -match $pat) {
                throw "Refusing commit: staged path looks sensitive: $f (adjust staging or use .gitignore)"
            }
        }
    }

    # `git commit <pathspec>` reads the WORKING TREE for $Paths at commit time (not the
    # index snapshot `git add` took above) -- confirm nothing external touched them in
    # between, so the just-scanned $staged content is what actually gets committed.
    git diff --quiet -- $Paths
    if ($LASTEXITCODE -ne 0) {
        throw "commit-checkpoint: working tree changed for one of `$Paths between staging and commit (concurrent write?) -- aborting instead of committing unscanned content. Re-run."
    }

    # `git commit -m $Message` hands $Message to PowerShell's native-command argv marshalling,
    # which (PS 5.1, CommandLineToArgvW) does not escape an embedded literal `"` -- a message
    # like `fix: add "Repo-hygiene audit" class` gets re-split at the quote and the tail lands
    # as extra pathspec args after `--`, failing with "pathspec '...' did not match any file(s)"
    # (live-reproduced 2026-09-05). `-F <file>` reads the message as file content, bypassing
    # argv marshalling entirely, so no embedded character -- quote, backtick, `$`, newline -- can
    # break it. Removes the class instead of guarding for the one character that was reported.
    # BOM-free write (Set-Content -Encoding UTF8 on PS 5.1 adds a BOM, which git would then
    # embed as a leading U+FEFF in the commit subject line -- caught live 2026-09-05 by
    # inspecting `git log` output, not just the exit code).
    # Critic review (2026-09-05): cleanup must never be able to flip a successful commit into a
    # reported failure (or vice versa), and a temp file must not leak if `git commit` throws
    # (e.g. git missing from PATH under $ErrorActionPreference = "Stop"). try/finally + capturing
    # $LASTEXITCODE inside the try, immediately after the call, keeps both invariants.
    $tempMsgFile = Join-Path ([System.IO.Path]::GetTempPath()) "commit-checkpoint-msg-$([guid]::NewGuid()).txt"
    try {
        [System.IO.File]::WriteAllText($tempMsgFile, $Message, (New-Object System.Text.UTF8Encoding $false))
        git commit -F $tempMsgFile -- $Paths
        $commitExitCode = $LASTEXITCODE
    } finally {
        Remove-Item -LiteralPath $tempMsgFile -ErrorAction SilentlyContinue
    }
    if ($commitExitCode -ne 0) {
        exit $commitExitCode
    }
    Write-Host "commit-checkpoint: local commit created (not pushed)." -ForegroundColor Green

    # TASKS.md:655 -- this commit never goes through a Bash tool call, so
    # doc-link-commit-check.js (PostToolUse: Bash `git commit`) never sees it. Never blocks: the
    # commit above already happened; this only records the result for smoke-status-digest.ps1.
    try {
        . (Join-Path $PSScriptRoot "lib/post-commit-doc-check.ps1")
        $docCheck = Invoke-PostCommitDocCheck -ValidatorWorkRoot $WorkRoot -Source "commit-checkpoint.ps1"
        if (-not $docCheck.ok) {
            Write-Host "commit-checkpoint: post-commit doc-integrity check could not run: $($docCheck.error)" -ForegroundColor Yellow
        } elseif ($docCheck.brokenCount -gt 0) {
            Write-Host "commit-checkpoint: WARNING -- this commit leaves $($docCheck.brokenCount) broken relative doc link(s); see agency-os/reports/status/doc-integrity-commits-LATEST.json" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "commit-checkpoint: post-commit doc-integrity check threw (non-fatal): $($_.Exception.Message)" -ForegroundColor Yellow
    }

    exit 0
} finally {
    Pop-Location
}
