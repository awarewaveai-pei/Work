# Shared post-commit doc-integrity check for script/hook-authored commits (TASKS.md:655).
#
# `doc-link-commit-check.js` (PostToolUse: Bash `git commit`) only fires on a `git commit` that
# went through a Bash tool call it can see. `scripts/commit-checkpoint.ps1` and `scripts/ao-close.ps1`
# call `git commit` INSIDE PowerShell -- that PreToolUse/PostToolUse hook never sees it, so a commit
# these scripts make can leave a broken relative markdown link with nobody told. Example:
# `3f31d5eec` (2026-07-04 auto-checkpoint) broke 3 links; `validate-doc-integrity.mjs --commit=3f31d5eec`
# proves it retroactively, but nothing surfaced it at the time.
#
# Fix here: same validator (`lobster-factory/scripts/validate-doc-integrity.mjs --commit=<sha> --json`,
# the exact resolver doc-link-commit-check.js already uses), called by the script itself right after
# its own `git commit` succeeds. This NEVER blocks the commit -- it already happened by the time this
# runs -- it only writes a status file so `smoke-status-digest.ps1` can put it in front of the agent
# the same way it does the other ten sibling detectors (see that file's own header comment).
#
# Deliberately single-snapshot (not an accumulated log): every OTHER *-LATEST.json in
# agency-os/reports/status/ is "current state as of last check", not a history, and a read-modify-
# write merge here would race a concurrent session writing the same file with no lock protecting it
# (this file is not WORKLOG.md/TASKS.md, so git-shared-file-guard.js does not cover it either) --
# avoiding that whole failure class is cheaper than guarding it. The cost: if commit N breaks a link
# and commit N+1 (touching unrelated files) runs this check next, N+1's own --commit= report is clean
# and overwrites N's WARN with a fresh PASS, silently losing N's finding. Same shape as the pre-
# existing acknowledged limit of --commit mode itself (it only judges the one commit named, same as
# doc-link-commit-check.js already does for Bash-triggered commits) -- not a new gap this file opens.
#
# Usage (both real callers pass the real repo root for both params; a test can point -TargetWorkRoot
# at an isolated fixture repo while -ValidatorWorkRoot stays the real checkout, since only the real
# checkout HAS lobster-factory/scripts/validate-doc-integrity.mjs on disk):
#   . (Join-Path $PSScriptRoot "lib\post-commit-doc-check.ps1")
#   Invoke-PostCommitDocCheck -ValidatorWorkRoot $WorkRoot -Source "commit-checkpoint.ps1"
Set-StrictMode -Version Latest

function Invoke-PostCommitDocCheck {
    param(
        [Parameter(Mandatory = $true)][string]$ValidatorWorkRoot,
        [string]$TargetWorkRoot = "",
        [string]$Sha = "HEAD",
        [Parameter(Mandatory = $true)][string]$Source,
        [string]$StatusPath = ""
    )
    if (-not $TargetWorkRoot) { $TargetWorkRoot = $ValidatorWorkRoot }
    $nowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $result = [ordered]@{
        generatedAtUtc = $nowUtc
        source         = $Source
        sha            = $null
        ok             = $false
        brokenCount    = 0
        broken         = @()
        error          = $null
    }

    try {
        $validator = Join-Path $ValidatorWorkRoot "lobster-factory/scripts/validate-doc-integrity.mjs"
        if (-not (Test-Path -LiteralPath $validator)) {
            $result.error = "validator lobster-factory/scripts/validate-doc-integrity.mjs not found under the validator work root -- not the Work repo, or a partial checkout"   # no absolute paths: the status file is tracked
        } else {
            $shaResolved = (& git -C $TargetWorkRoot rev-parse $Sha 2>$null)
            if ($LASTEXITCODE -ne 0 -or -not $shaResolved) {
                $result.error = "could not resolve '$Sha' to a commit in the target work root"
            } else {
                $result.sha = $shaResolved.Trim()
                # `git commit -q` (this repo's common form, e.g. `-F <msgfile>`) prints no summary
                # line to parse, unlike doc-link-commit-check.js's approach -- the caller already
                # knows the commit it just made succeeded (checked $LASTEXITCODE itself), so this
                # helper is only ever invoked with a real, just-made sha (default "HEAD"). No reflog
                # fallback needed the way the Bash-hook version needs one.
                $nodeOut = & node $validator "--commit=$($result.sha)" "--json" "--workRoot=$TargetWorkRoot" 2>$null
                $nodeExit = $LASTEXITCODE
                $report = $null
                try { $report = ($nodeOut | Out-String).Trim() | ConvertFrom-Json } catch { $report = $null }
                if (-not $report) {
                    $result.error = "validate-doc-integrity.mjs produced no parseable JSON (exit $nodeExit)"
                } elseif ($report.PSObject.Properties["error"]) {
                    $result.error = [string]$report.error
                } else {
                    $result.ok = $true
                    $broken = @($report.broken)
                    $result.brokenCount = $broken.Count
                    $result.broken = @($broken | ForEach-Object {
                        [ordered]@{
                            from   = [string]$_.from
                            href   = [string]$_.href
                            detail = if ([string]$_.cause -eq 'target_removed') {
                                "this commit removed the target"
                            } else {
                                "resolves to $([string]$_.resolved): no such path in this commit"
                            }
                        }
                    })
                }
            }
        }
    } catch {
        # Never let a checker bug take down the caller's own commit flow -- this runs strictly
        # after `git commit` already succeeded.
        $result.error = "post-commit-doc-check threw: $($_.Exception.Message)"
    }

    if (-not $StatusPath) {
        $StatusPath = Join-Path $ValidatorWorkRoot "agency-os/reports/status/doc-integrity-commits-LATEST.json"
    }
    try {
        $statusDir = Split-Path -Parent $StatusPath
        if ($statusDir -and -not (Test-Path -LiteralPath $statusDir)) {
            New-Item -ItemType Directory -Force -Path $statusDir | Out-Null
        }
        ($result | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $StatusPath -Encoding utf8
    } catch {
        # Status-file write failure is itself never fatal to the caller -- log to the shared
        # gate-failure log the rest of this codebase's fail-open hooks already write to, when
        # it exists; otherwise just surface on the result object for the caller to Write-Warning.
        $result.error = if ($result.error) { "$($result.error); also failed to write status file: $($_.Exception.GetType().Name)" } else { "failed to write status file: $($_.Exception.GetType().Name)" }
        $result.ok = $false   # the digest would keep reading the previous file: callers must see the failure
    }

    return [pscustomobject]$result
}
