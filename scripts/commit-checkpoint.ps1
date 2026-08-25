# Scoped, local-only git commit helper (no push).
#
# 2026-08-25: this script no longer stages blindly. `-Paths` is mandatory, the `git add -A`
# fallback is gone, and every automated caller has been removed. It exists now for one job:
# committing a NAMED set of paths on behalf of a command that knows exactly what it changed
# (today: .claude/commands/tomo.md). For ordinary work use `git commit -m "<message>"` --
# it is the same thing, and CLAUDE.md R2 wants the message to carry root cause + verification.
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

    foreach ($p in $Paths) {
        $full = Join-Path $WorkRoot $p
        if (-not (Test-Path -LiteralPath $full)) {
            throw "Path not found: $p"
        }
        if ($DryRun) {
            Write-Host "[dry-run] would: git add -- $p" -ForegroundColor Cyan
        } else {
            git add -- $p
        }
    }

    if ($DryRun) {
        Write-Host "[dry-run] would: git commit -m <message>" -ForegroundColor Cyan
        exit 0
    }

    git diff --cached --quiet
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
    $staged = @(git diff --cached --name-only)
    foreach ($f in $staged) {
        foreach ($pat in $blocked) {
            if ($f -match $pat) {
                throw "Refusing commit: staged path looks sensitive: $f (adjust staging or use .gitignore)"
            }
        }
    }

    git commit -m $Message
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    Write-Host "commit-checkpoint: local commit created (not pushed)." -ForegroundColor Green
    exit 0
} finally {
    Pop-Location
}
