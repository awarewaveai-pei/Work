# Local-only git checkpoint (no push). Intended for the agent to run at milestones;
# the operator does not need to run this by hand unless the environment blocks git.
param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$WorkRoot = "",
    [string[]]$Paths = @(),
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    # Junction integrity, checked at the LAST possible moment (2026-08-12).
    # `ensure-claude-junction.ps1` already runs at UserPromptSubmit STEP 0 in both
    # hooks, and health gate 12b covers AO-CLOSE — but both are point-in-time. If
    # the junction dies MID-session (observed 2026-08-12: 12 files under
    # .claude/plans/ were staged as deletions and committed as 853cd26a), every
    # earlier check has already passed and nothing stands between `git add -A` and
    # a commit that deletes the whole shared .claude/ tree for every machine.
    # This is the last line of defence, so it runs immediately before staging.
    $claudeJunction = Join-Path $WorkRoot ".claude"
    $claudeTracked = @(git ls-files -- ".claude" 2>$null)
    if ($claudeTracked.Count -gt 0 -and -not (Test-Path -LiteralPath $claudeJunction)) {
        throw @"
Refusing checkpoint: '.claude' is tracked in git ($($claudeTracked.Count) files) but does not exist on disk.
The junction is broken, so 'git add -A' would stage every one of those files as a DELETION
and propagate it to all machines on push.

Repair it first, then re-run:
  powershell -NoProfile -ExecutionPolicy Bypass -File "$WorkRoot\scripts\ensure-claude-junction.ps1"
"@
    }

    if ($Paths.Count -eq 0) {
        if ($DryRun) {
            Write-Host "[dry-run] would: git add -A" -ForegroundColor Cyan
        } else {
            git add -A
        }
    } else {
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
    }

    if ($DryRun) {
        Write-Host "[dry-run] would: git commit -m <message>" -ForegroundColor Cyan
        exit 0
    }

    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "commit-checkpoint: nothing staged to commit (working tree clean or no changes after add)." -ForegroundColor Yellow
        exit 0
    }

    # Shell-artifact junk guard (2026-07-02): `git add -A` blindly staged stray
    # files created by shell accidents: literal `$null`/`null` (PowerShell-style
    # redirection run under bash) and 0-byte files whose NAMES are doc-content
    # fragments (word-split of a heredoc). Those got committed into the SSOT on
    # 2026-06-20 (16d95c8). Policy: UNSTAGE junk and continue (never abort; the
    # checkpoint's real work must still be saved).
    # Delegated to Node (critic 2026-07-02 finding 3): with git's default
    # core.quotePath=true, non-ASCII staged names reach PowerShell as
    # octal-escaped ASCII, so a PS-side non-ASCII test never fires. The Node
    # helper reads raw bytes via NUL-separated output and works identically on
    # every platform. Best-effort: node missing = guard skipped with warning.
    $junkGuard = Join-Path $PSScriptRoot "checkpoint-junk-guard.mjs"
    if (Test-Path -LiteralPath $junkGuard) {
        try {
            & node $junkGuard --repo $WorkRoot
            if ($LASTEXITCODE -ne 0) { Write-Warning "commit-checkpoint: junk guard exited $LASTEXITCODE (continuing)" }
        } catch {
            Write-Warning "commit-checkpoint: junk guard unavailable (node missing?): $_"
        }
    }
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "commit-checkpoint: only junk was staged; nothing to commit after guard." -ForegroundColor Yellow
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
