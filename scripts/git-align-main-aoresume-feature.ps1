<#
.SYNOPSIS
  一鍵：fetch → 本機 main 與 origin/main 完全一致 →（可選）nested AO-RESUME。**預設永遠停在 main**，不切換到其他 Git 分支。

.DESCRIPTION
  你手寫的 `git reset --hard origin/main,origin/fix/...` 在 Git 裡不合法（reset 只能接一個目標）。
  正確心智模型：
  1) `origin/main` 是主線單一真相（routine / AO-RESUME 在 main 上 = 0 ahead 0 behind）。
  2) **預設不做任何「功能分支」流程**。若你真的需要（罕見），才加 **`-ContinueWithFeatureBranch`** 並指定 **`-FeatureBranch`**。

.PARAMETER WorkRoot
  Monorepo 根（預設為本腳本上一層）。

.PARAMETER FeatureBranch
  僅在 **`-ContinueWithFeatureBranch`** 時有效：要切換過去的分支名（**無預設值**；必須自行指定）。

.PARAMETER ContinueWithFeatureBranch
  **選填、預設關閉**。僅在傳入時：main 對齊後才會切到 `-FeatureBranch` 並 merge `origin/main`。日常 **AO-RESUME** 請勿使用——預設僅對齊 **main**。

.PARAMETER PushFeature
  若功能分支比遠端超前，在合併 main 後執行 `git push -u origin <branch>`。

.PARAMETER AllowStash
  工作區不乾淨時，先 `git stash push` 再繼續（結束後**不**自動 pop，請自行處理）。

.PARAMETER SkipAoResume
  只做 Git 步驟（fetch／reset main／切回功能分支／merge），**不**呼叫 `ao-resume.ps1`（供 `ao-resume -FullMainlineParity` 內嵌呼叫，避免遞迴）。

.PARAMETER AllowResetAheadOfOrigin
  允許在 **本機 main 尚未推送、超前 origin/main** 時仍執行 `reset --hard origin/main`（會**丟棄**未推送的 commits）。預設：**中止**並提示先 `git push origin main`，避免自動 checkpoint 後被對齊沖掉。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-align-main-aoresume-feature.ps1

.EXAMPLE
  # 罕見：對齊 main 後還要回到某功能分支（須明示分支名）
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-align-main-aoresume-feature.ps1 -ContinueWithFeatureBranch -FeatureBranch "fix/my-topic" -PushFeature
#>

param(
    [string]$WorkRoot = "",
    [string]$FeatureBranch = "",
    [switch]$ContinueWithFeatureBranch,
    [switch]$PushFeature,
    [switch]$AllowStash,
    [switch]$SkipAoResume,
    # If the feature branch does not exist locally and there is no origin/<FeatureBranch>, do not fail the whole
    # align step (common after a hotfix is merged to main and the branch is deleted on GitHub). Stay on `main` and
    # print a clear one-line follow-up. Use `-RequireFeatureBranch` to keep the old hard-fail behavior.
    [switch]$RequireFeatureBranch,
    [switch]$AllowResetAheadOfOrigin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Shared safe git wrappers (EAP-protected capture). SSOT: scripts/lib/git-safe-ops.ps1.
# Root cause this prevents: PS5.1 + EAP=Stop turns git's normal stderr ("From <url>",
# "LF will be replaced by CRLF") into a terminating NativeCommandError BEFORE
# $LASTEXITCODE is checked — the recurring AO-RESUME crash (2026-06-05 fired at the
# git fetch line below). Provides Invoke-SafeGitCapture for query commands.
. (Join-Path $PSScriptRoot 'lib\git-safe-ops.ps1')

# NOTE (Windows PowerShell 5.1):
# Passing a [bool] parameter through `powershell.exe -File` using `-Name:$true/$false` is unreliable in some hosts.
# Use switches only, and compute the effective behavior in-script.
$AllowMissingFeatureBranch = -not $RequireFeatureBranch

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

$aoResume = Join-Path $WorkRoot "scripts\ao-resume.ps1"
if (-not (Test-Path -LiteralPath $aoResume)) {
    throw "Missing $aoResume"
}

function Invoke-Git {
    param([string[]]$GitArgs)
    Push-Location -LiteralPath $WorkRoot
    try {
        & git @GitArgs
        if ($LASTEXITCODE -ne 0) {
            throw ("git {0} failed (exit {1})" -f ($GitArgs -join " "), $LASTEXITCODE)
        }
    } finally {
        Pop-Location
    }
}

function Write-GitFetchLedger {
    # Record the outcome of git fetch attempts so AO-RESUME (and any agent reading
    # the state file) can distinguish "no new commits because we are caught up"
    # from "no new commits because fetch failed and we don't actually know".
    # Without this, a DNS hiccup looks identical to a quiet repo (observed 2026-05-28).
    param(
        [bool]$Success,
        [int]$Attempts = 1,
        [int]$ExitCode = 0,
        [string]$ErrorText = '',
        [datetime]$StartUtc,
        [string]$RootDir
    )
    try {
        $stateDir  = Join-Path $RootDir 'agency-os\.agency-state'
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $statePath = Join-Path $stateDir 'git-fetch-last.json'
        $payload = [pscustomobject]@{
            schemaVersion = 1
            startedAtUtc  = $StartUtc.ToString('o')
            finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            success       = $Success
            attempts      = $Attempts
            exitCode      = $ExitCode
            errorExcerpt  = $ErrorText
        }
        $json = $payload | ConvertTo-Json -Depth 4
        $utf8 = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($statePath, $json, $utf8)
    } catch {
        Write-Host ("  WARN: failed to write git-fetch-last.json: " + $_.Exception.Message) -ForegroundColor Yellow
    }
}

function Invoke-GitFetchWithRetry {
    # Retries `git fetch origin --prune` on transient network/DNS failures.
    # Backoff: 5s, 10s, 20s (exponential). Each attempt writes outcome to
    # agency-os/.agency-state/git-fetch-last.json so downstream consumers don't
    # confuse "fetch failed silently" with "no remote changes". On final failure,
    # prints a loud red banner and throws — preserving original Invoke-Git contract.
    param(
        [int]$MaxAttempts = 3,
        [int[]]$BackoffSeconds = @(5, 10, 20)
    )
    $startUtc = (Get-Date).ToUniversalTime()
    $attempts = 0
    $lastExit = 0
    $lastError = ''
    while ($attempts -lt $MaxAttempts) {
        $attempts++
        Push-Location -LiteralPath $WorkRoot
        try {
            # EAP save/restore: PS5.1 + EAP=Stop raises NativeCommandError on git's
            # normal "From <url>" stderr BEFORE $LASTEXITCODE is read — the recurring
            # AO-RESUME crash (2026-06-05 fired exactly here). Same pattern as the
            # canonical lib (scripts/lib/git-safe-ops.ps1 Invoke-SafeGitFetch). Kept
            # in-place (not delegated to the lib) because this function's
            # Write-GitFetchLedger writes git-fetch-last.json, which
            # .claude/commands/ao-resume.md Step 0a reads for its HOOK FAILED banner.
            $savedEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $stderr = & git fetch origin --prune 2>&1
                $lastExit = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $savedEAP
            }
            if ($lastExit -eq 0) {
                Write-GitFetchLedger -Success $true -Attempts $attempts -StartUtc $startUtc -RootDir $WorkRoot
                return
            }
            $joined = ($stderr -join "`n")
            $lastError = if ($joined.Length -gt 500) { $joined.Substring(0, 500) } else { $joined }
            if ($attempts -lt $MaxAttempts) {
                $sleepSec = $BackoffSeconds[[Math]::Min($attempts - 1, $BackoffSeconds.Count - 1)]
                Write-Host ("  WARN: git fetch attempt $attempts/$MaxAttempts failed (exit $lastExit). Retrying in ${sleepSec}s...") -ForegroundColor Yellow
                Write-Host ("    stderr: " + $lastError.Substring(0, [Math]::Min(200, $lastError.Length))) -ForegroundColor DarkYellow
                Start-Sleep -Seconds $sleepSec
            }
        } finally {
            Pop-Location
        }
    }
    Write-GitFetchLedger -Success $false -Attempts $attempts -ExitCode $lastExit -ErrorText $lastError -StartUtc $startUtc -RootDir $WorkRoot
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "GIT FETCH FAILED after $MaxAttempts attempts (last exit $lastExit)" -ForegroundColor Red
    Write-Host "  Sync state with origin is UNKNOWN — do NOT trust 'no new commits' conclusions." -ForegroundColor Red
    Write-Host "  Ledger: agency-os/.agency-state/git-fetch-last.json" -ForegroundColor Red
    Write-Host "  Last error excerpt:" -ForegroundColor Red
    Write-Host ("    " + $lastError.Substring(0, [Math]::Min(300, $lastError.Length))) -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    throw ("git fetch origin --prune failed after $MaxAttempts attempts (exit $lastExit)")
}

function Test-WorktreeClean {
    # Routed through the lib's EAP-protected capture: `git status` can emit stderr
    # ("warning: ... LF will be replaced by CRLF") which, under EAP=Stop + 2>&1,
    # would throw NativeCommandError. Invoke-SafeGitCapture scopes EAP='Continue'.
    $r = Invoke-SafeGitCapture -GitArgs @('status', '--porcelain') -WorkRoot $WorkRoot
    return [string]::IsNullOrWhiteSpace($r.Text)
}

Push-Location -LiteralPath $WorkRoot
try {
    Write-Host "== git-align-main-aoresume-feature (WorkRoot=$WorkRoot) ==" -ForegroundColor Cyan

    # Replaced 2026-05-28 (Phase C4 of plan Z): retry 3x with exponential backoff +
    # write outcome ledger so downstream consumers can distinguish transient DNS
    # failures from a quiet remote. Original was Invoke-Git @("fetch", "origin", "--prune").
    Invoke-GitFetchWithRetry

    if (-not (Test-WorktreeClean)) {
        if (-not $AllowStash) {
            throw "Working tree is dirty. Commit, discard, or re-run with -AllowStash (creates stash; does not auto-pop)."
        }
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Write-Host "== Stashing dirty tree (git-align-main-$stamp) ==" -ForegroundColor Yellow
        Invoke-Git @("stash", "push", "-m", "git-align-main-aoresume-feature-$stamp")
    }

    # --- Mainline parity ---
    Invoke-Git @("checkout", "main")

    $aheadMain = 0
    # Routed through the lib's EAP-protected capture (same NativeCommandError class).
    $aheadRes = Invoke-SafeGitCapture -GitArgs @('rev-list', '--count', 'origin/main..HEAD') -WorkRoot $WorkRoot
    $aheadStr = ($aheadRes.Output | Select-Object -Last 1)
    if ($aheadRes.ExitCode -eq 0 -and $aheadStr -match '^\s*(\d+)\s*$') {
        $aheadMain = [int]$Matches[1]
    }

    if ($aheadMain -gt 0 -and -not $AllowResetAheadOfOrigin) {
        throw @"
git-align: local branch main is ahead of origin/main by $aheadMain unpublished commit(s).
Push first: git push origin main
Then re-run this script (or AO-RESUME / FullMainlineParity).
To intentionally discard those commits (destructive): pass -AllowResetAheadOfOrigin.
"@
    }
    if ($aheadMain -gt 0 -and $AllowResetAheadOfOrigin) {
        Write-Host "== WARNING: reset --hard will DROP $aheadMain local commit(s) not on origin (-AllowResetAheadOfOrigin). ==" -ForegroundColor Yellow
    }

    Invoke-Git @("reset", "--hard", "origin/main")
    Write-Host "== main is now identical to origin/main ==" -ForegroundColor Green

    if (-not $SkipAoResume) {
        Write-Host "== AO-RESUME on main ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aoResume
        if ($LASTEXITCODE -ne 0) {
            throw "AO-RESUME on main failed (exit $LASTEXITCODE)."
        }
    } else {
        Write-Host "== SkipAoResume: left on main (no nested ao-resume) ==" -ForegroundColor DarkGray
    }

    if (-not $ContinueWithFeatureBranch) {
        Write-Host "== Done (main only; no feature-branch continuation) ==" -ForegroundColor Green
        return
    }

    if ([string]::IsNullOrWhiteSpace($FeatureBranch)) {
        throw "git-align: -ContinueWithFeatureBranch requires a non-empty -FeatureBranch name."
    }

    # Local feature branch: create from origin/<same> if missing.
    # Routed through the lib's EAP-protected capture (same NativeCommandError class).
    $hasLocal = (Invoke-SafeGitCapture -GitArgs @('show-ref', '--verify', '--quiet', "refs/heads/$FeatureBranch") -WorkRoot $WorkRoot).ExitCode -eq 0
    if (-not $hasLocal) {
        $originRefRes = Invoke-SafeGitCapture -GitArgs @('show-ref', '--verify', '--quiet', "refs/remotes/origin/$FeatureBranch") -WorkRoot $WorkRoot
        if ($originRefRes.ExitCode -ne 0) {
            if ($AllowMissingFeatureBranch) {
                Write-Host "== Feature branch missing: '$FeatureBranch' (no local, no origin/$FeatureBranch). Staying on main. ==" -ForegroundColor Yellow
                Write-Host "   Fix options:" -ForegroundColor DarkYellow
                Write-Host "   - Omit -ContinueWithFeatureBranch (stay on main), or" -ForegroundColor DarkYellow
                Write-Host "   - Pass -FeatureBranch <name> to match an existing branch, or" -ForegroundColor DarkYellow
                Write-Host "   - Create/push the branch on origin, then re-run, or" -ForegroundColor DarkYellow
                Write-Host "   - Add -RequireFeatureBranch to hard-fail (legacy behavior)." -ForegroundColor DarkYellow
                Write-Host "== Done: main aligned; feature branch not present (skipped). ==" -ForegroundColor Green
                return
            }
            throw "No local branch '$FeatureBranch' and no origin/$FeatureBranch. Push the branch first or fix -FeatureBranch. (If the branch was merged and deleted on purpose, omit -RequireFeatureBranch / do not pass it from ao-resume.)"
        }
        Invoke-Git @("checkout", "-b", $FeatureBranch, "origin/$FeatureBranch")
    } else {
        Invoke-Git @("checkout", $FeatureBranch)
    }

    # Merge main into feature if feature does not already contain origin/main.
    # Routed through the lib's EAP-protected capture (same NativeCommandError class).
    $ancestorRes = Invoke-SafeGitCapture -GitArgs @('merge-base', '--is-ancestor', 'origin/main', 'HEAD') -WorkRoot $WorkRoot
    if ($ancestorRes.ExitCode -ne 0) {
        Write-Host "== Merging origin/main into $FeatureBranch ==" -ForegroundColor Yellow
        Invoke-Git @("merge", "--no-edit", "origin/main")
    } else {
        Write-Host "== $FeatureBranch already contains origin/main (skip merge) ==" -ForegroundColor DarkGray
    }

    if (-not $SkipAoResume) {
        Write-Host "== AO-RESUME on $FeatureBranch ==" -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aoResume
        if ($LASTEXITCODE -ne 0) {
            throw "AO-RESUME on $FeatureBranch failed (exit $LASTEXITCODE)."
        }
    } else {
        Write-Host "== SkipAoResume: on $FeatureBranch (no nested ao-resume) ==" -ForegroundColor DarkGray
    }

    if ($PushFeature) {
        # Routed through the lib's EAP-protected capture (single call; was invoked twice).
        $lrRes = Invoke-SafeGitCapture -GitArgs @('rev-list', '--left-right', '--count', "origin/$FeatureBranch...HEAD") -WorkRoot $WorkRoot
        if ($lrRes.ExitCode -eq 0) {
            $line = ($lrRes.Output | Select-Object -Last 1)
            if ($line -match '^\s*(\d+)\s+(\d+)\s*$') {
                $right = [int]$Matches[2]
                if ($right -gt 0) {
                    Write-Host "== git push -u origin $FeatureBranch (local ahead by $right) ==" -ForegroundColor Cyan
                    Invoke-Git @("push", "-u", "origin", $FeatureBranch)
                } else {
                    Write-Host "== No push needed (not ahead of origin/$FeatureBranch) ==" -ForegroundColor DarkGray
                }
            }
        } else {
            Write-Host "== origin/$FeatureBranch missing or not comparable; skip push ==" -ForegroundColor DarkYellow
        }
    }

    Write-Host "== Done: main aligned; $FeatureBranch merged with main if needed; AO-RESUME passed on both. ==" -ForegroundColor Green
} finally {
    Pop-Location
}

# Explicit exit 0 ensures callers (ao-resume, CI) see success even when the last
# native command in the try block leaves $LASTEXITCODE in an indeterminate state.
exit 0
