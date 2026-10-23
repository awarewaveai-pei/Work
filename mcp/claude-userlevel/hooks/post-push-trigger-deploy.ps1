#!/usr/bin/env pwsh
# Post-push auto-deploy hook for Trigger.dev workflows.
# Lives in ~/.claude/hooks/ (synced via mcp/claude-userlevel -- cross-machine SSOT).
#
# Wired on PostToolUse for every Bash call (Claude ~/.claude/settings.json and
# Codex ~/.codex/hooks.json); the payload decides whether this was a push.
#   1. Read the payload as UTF-8; continue only for a `git push` command.
#   2. AwareWave monorepo only (scripts/lobster-trigger-deploy.ps1 exists). Track
#      refs/remotes/origin/main, because the deploy script always deploys origin/main;
#      pushes to other branches leave it unchanged and so never trigger.
#   3. One deploy at a time: exclusive lock in the git common dir. The holder
#      re-reads origin/main after each deploy, so pushes that landed meanwhile
#      (another session, or Claude and Codex on the same repo) are not lost.
#   4. Each origin/main range is evaluated exactly once: the marker file holds the
#      sha already evaluated. A failed deploy does not advance it (next push retries).
# The trigger must come from the payload, not repo state: the pre-2026-09-19 version
# fired on EVERY Bash call and redeployed whenever HEAD~1..HEAD happened to touch
# workflows (5 redeploys in 23 min on 2026-09-12). Keep this file ASCII-only.

$ErrorActionPreference = "Continue"

# CP950 protection for git stdout capture. Same wrapper as scripts/_console-encoding-helpers.ps1,
# inlined: this deployed copy lives in ~/.claude/hooks and the repo path is unknown until the first
# git call below. Keep behaviour identical to the SSOT.
function Invoke-WithUtf8Console {
    param([Parameter(Mandatory = $true, Position = 0)][scriptblock]$ScriptBlock)
    $prev = $null
    $haveConsole = $false
    try {
        $prev = [Console]::OutputEncoding
        $haveConsole = $true
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    } catch { }
    try { & $ScriptBlock }
    finally { if ($haveConsole) { [Console]::OutputEncoding = $prev } }
}

$logFile = "$env:TEMP\post-push-trigger-deploy.log"
function Write-Log([string]$Message) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" | Add-Content -LiteralPath $logFile
}

$payload = $null
try {
    $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $payload = $reader.ReadToEnd() | ConvertFrom-Json
} catch { $payload = $null }
$command = ''
if ($payload -and $payload.tool_input) {
    $raw = $payload.tool_input.command
    if ($null -eq $raw) { $raw = $payload.tool_input.cmd }
    $command = (@($raw) -join ' ')
}
$push = [regex]::Match($command, '(?m)(?:^|[;&|]\s*)\s*git(?:\s+-C\s+(?:"([^"]+)"|''([^'']+)''|(\S+)))?\s+push\b')
if (-not $push.Success) { exit 0 }

if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 1MB) {
    Move-Item -LiteralPath $logFile -Destination "$logFile.1" -Force
}

$gitCwd = (Get-Location).Path
$cPath = @($push.Groups[1].Value, $push.Groups[2].Value, $push.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
if ($cPath) { $gitCwd = if ([IO.Path]::IsPathRooted($cPath)) { $cPath } else { Join-Path $gitCwd $cPath } }
$repoRoot = (Invoke-WithUtf8Console { git -C $gitCwd rev-parse --show-toplevel 2>$null })
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) { Write-Log "EXIT: no repo root ($gitCwd)"; exit 0 }
$repoRoot = $repoRoot.Trim()
$deployScript = Join-Path $repoRoot "scripts\lobster-trigger-deploy.ps1"
if (-not (Test-Path -LiteralPath $deployScript)) { exit 0 }

$commonDir = (Invoke-WithUtf8Console { git -C $repoRoot rev-parse --git-common-dir 2>$null })
if (-not $commonDir) { Write-Log "EXIT: no git common dir"; exit 0 }
$commonDir = $commonDir.Trim()
if (-not [IO.Path]::IsPathRooted($commonDir)) { $commonDir = Join-Path $repoRoot $commonDir }
$stateFile = Join-Path $commonDir 'awarewave-trigger-deploy-upstream'
$lockFile = Join-Path $commonDir 'awarewave-trigger-deploy.lock'
$tracked = 'refs/remotes/origin/main'

$watchPaths = @(
    "lobster-factory/packages/workflows/src/",
    "lobster-factory/packages/workflows/trigger.config.ts",
    "lobster-factory/packages/workflows/package.json"
)

function Get-Sha([string]$Ref) {
    $s = (Invoke-WithUtf8Console { git -C $repoRoot rev-parse --verify --quiet $Ref 2>$null })
    if ($s -and $s.Trim() -match '^([0-9a-f]{40}|[0-9a-f]{64})$') { return $s.Trim() }
    return $null
}

function New-DeployLock {
    param([string]$Path)
    # DeleteOnClose: the file disappears when this handle closes (including a
    # killed process), so a lock file can never outlive its owner and no separate
    # delete step can remove someone else's lock.
    return New-Object System.IO.FileStream($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::DeleteOnClose)
}

$lock = $null
try {
    $lock = New-DeployLock -Path $lockFile
} catch {
    # The age check cannot steal a lock from a LIVE deploy: the holder keeps the
    # file open with FileShare::None, so Remove-Item below fails and CreateNew
    # fails again (verified 2026-09-20 against a live holder with a 2h-old stamp).
    # It only reclaims a lock whose holder died (e.g. the hook hit its timeout).
    $ageMin = 0
    try { $ageMin = ((Get-Date) - (Get-Item -LiteralPath $lockFile).LastWriteTime).TotalMinutes } catch { $ageMin = 0 }
    if ($ageMin -lt 30) {
        Write-Log ("EXIT: a deploy is already running (lock {0:N0} min old); its holder re-checks origin/main when done" -f $ageMin)
        exit 0
    }
    # Only reachable when the previous holder is gone (its handle would block
    # this delete), e.g. after a machine crash that outlived DeleteOnClose.
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    try { $lock = New-DeployLock -Path $lockFile }
    catch { Write-Log "EXIT: lost lock race after stale-lock cleanup"; exit 0 }
}

$exitCode = 0
try {
    $pendingAfterCap = $true
    for ($round = 0; $round -lt 5; $round++) {
        $current = Get-Sha $tracked
        if (-not $current) { $pendingAfterCap = $false; Write-Log "EXIT: $tracked not found"; break }

        $base = $null
        if (Test-Path -LiteralPath $stateFile) {
            $m = (Get-Content -Raw -Encoding UTF8 -LiteralPath $stateFile)
            if ($m -and $m.Trim() -match '^([0-9a-f]{40}|[0-9a-f]{64})$') { $base = $m.Trim() }
        }
        if (-not $base) {
            # First run (or unreadable marker): evaluate only a push proven to have just
            # happened by the newest origin/main reflog entry; otherwise record a baseline.
            $entry = (Invoke-WithUtf8Console { git -C $repoRoot reflog show --date=unix -n 1 --format='%gd|%gs' $tracked 2>$null })
            if ($entry -match '@\{(\d+)\}\|update by push' -and
                ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - [long]$Matches[1]) -le 300) {
                $base = Get-Sha "$tracked@{1}"
            }
            if (-not $base) {
                Set-Content -LiteralPath $stateFile -Value $current -NoNewline
                $pendingAfterCap = $false
                Write-Log "EXIT: baseline recorded ($current)"
                break
            }
        }
        if ($base -eq $current) { $pendingAfterCap = $false; Write-Log "EXIT: nothing new on origin/main"; break }

        $changedFiles = @(Invoke-WithUtf8Console { git -C $repoRoot diff --name-only $base $current 2>$null })
        $diffOk = ($LASTEXITCODE -eq 0)
        $triggered = $false
        if (-not $diffOk) {
            # History rewritten or base object missing: the range cannot be evaluated.
            # Deploying current origin/main is idempotent, so deploy rather than risk
            # silently dropping a workflow change.
            $triggered = $true
            Write-Log "range $base..$current not diffable; deploying origin/main"
        } else {
            foreach ($path in $watchPaths) {
                if ($changedFiles | Where-Object { $_ -like "$path*" -or $_ -eq $path }) { $triggered = $true; break }
            }
            Write-Log "range=$base..$current files=$($changedFiles.Count) triggered=$triggered"
        }
        if (-not $triggered) {
            Set-Content -LiteralPath $stateFile -Value $current -NoNewline
            continue
        }

        Write-Host ""
        Write-Host "[auto-deploy] Workflow source changed on origin/main - starting Trigger.dev deploy..." -ForegroundColor Cyan
        $changedFiles | Where-Object {
            $p = $_
            $watchPaths | Where-Object { $p -like "$_*" -or $p -eq $_ }
        } | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
        Write-Host ""

        & powershell.exe -ExecutionPolicy Bypass -File $deployScript
        $ec = $LASTEXITCODE
        if ($ec -ne 0) {
            Write-Host ""
            Write-Host "[auto-deploy] Deploy FAILED (exit $ec). Run manually:" -ForegroundColor Red
            Write-Host "  powershell -File scripts\lobster-trigger-deploy.ps1" -ForegroundColor Yellow
            Write-Log "deploy FAILED exit=$ec; marker stays at $base (next push retries)"
            $exitCode = $ec
            $pendingAfterCap = $false
            break
        }
        Set-Content -LiteralPath $stateFile -Value $current -NoNewline
        Write-Host ""
        Write-Host "[auto-deploy] Deploy succeeded." -ForegroundColor Green
        Write-Log "deploy OK ($current)"
    }
    if ($pendingAfterCap) {
        # Five deploy rounds in a row and pushes are still arriving: stop looping,
        # but never end quietly with work left behind.
        Write-Log "WARN: round cap reached with a pending origin/main range; run scripts\lobster-trigger-deploy.ps1 manually or push again"
        Write-Host "[auto-deploy] Round cap reached while pushes kept arriving - a workflow range is still undeployed. Run scripts\lobster-trigger-deploy.ps1 manually." -ForegroundColor Yellow
    }
} finally {
    # Dispose deletes the file (DeleteOnClose); never unlink by path here, or a
    # lock a different process legitimately holds could be removed.
    if ($lock) { $lock.Dispose() }
}

exit $exitCode
