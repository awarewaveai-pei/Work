<#
.SYNOPSIS
  一鍵：fetch → 本機 main 與 origin/main 完全一致 → AO-RESUME →（可選）回到功能分支並併入最新 main 再 AO-RESUME。

.DESCRIPTION
  你手寫的 `git reset --hard origin/main,origin/fix/...` 在 Git 裡不合法（reset 只能接一個目標）。
  正確心智模型：
  1) `origin/main` 是主線單一真相（routine / AO-RESUME 在 main 上 = 0 ahead 0 behind）。
  2) 功能分支（例如 fix/trigger-clickhouse-oom）在開工前應 **包含** `origin/main`（behind=0），再跑 AO-RESUME。

.PARAMETER WorkRoot
  Monorepo 根（預設為本腳本上一層）。

.PARAMETER FeatureBranch
  結束 main 流程後要切回的分支名（預設 fix/trigger-clickhouse-oom）。

.PARAMETER SkipFeature
  只做 main 對齊 + 一次 AO-RESUME，不切回功能分支。

.PARAMETER PushFeature
  若功能分支比遠端超前，在合併 main 後執行 `git push -u origin <branch>`。

.PARAMETER AllowStash
  工作區不乾淨時，先 `git stash push` 再繼續（結束後**不**自動 pop，請自行處理）。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-align-main-aoresume-feature.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-align-main-aoresume-feature.ps1 -FeatureBranch "fix/trigger-clickhouse-oom" -PushFeature
#>

param(
    [string]$WorkRoot = "",
    [string]$FeatureBranch = "fix/trigger-clickhouse-oom",
    [switch]$SkipFeature,
    [switch]$PushFeature,
    [switch]$AllowStash
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

$aoResume = Join-Path $WorkRoot "scripts\ao-resume.ps1"
if (-not (Test-Path -LiteralPath $aoResume)) {
    throw "Missing $aoResume"
}

function Invoke-Git {
    param([string[]]$Args)
    Push-Location -LiteralPath $WorkRoot
    try {
        & git @Args
        if ($LASTEXITCODE -ne 0) {
            throw ("git {0} failed (exit {1})" -f ($Args -join " "), $LASTEXITCODE)
        }
    } finally {
        Pop-Location
    }
}

function Test-WorktreeClean {
    Push-Location -LiteralPath $WorkRoot
    try {
        $porcelain = (& git status --porcelain 2>&1)
        return [string]::IsNullOrWhiteSpace($porcelain)
    } finally {
        Pop-Location
    }
}

Push-Location -LiteralPath $WorkRoot
try {
    Write-Host "== git-align-main-aoresume-feature (WorkRoot=$WorkRoot) ==" -ForegroundColor Cyan

    Invoke-Git @("fetch", "origin", "--prune")

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
    Invoke-Git @("reset", "--hard", "origin/main")
    Write-Host "== main is now identical to origin/main ==" -ForegroundColor Green

    Write-Host "== AO-RESUME on main ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aoResume
    if ($LASTEXITCODE -ne 0) {
        throw "AO-RESUME on main failed (exit $LASTEXITCODE)."
    }

    if ($SkipFeature) {
        Write-Host "== Done (-SkipFeature: left on main) ==" -ForegroundColor Green
        return
    }

    # Local feature branch: create from origin/<same> if missing
    Push-Location -LiteralPath $WorkRoot
    try {
        $null = & git show-ref --verify --quiet "refs/heads/$FeatureBranch" 2>&1
        $hasLocal = ($LASTEXITCODE -eq 0)
    } finally {
        Pop-Location
    }
    if (-not $hasLocal) {
        Push-Location -LiteralPath $WorkRoot
        try {
            $null = & git show-ref --verify --quiet "refs/remotes/origin/$FeatureBranch" 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "No local branch '$FeatureBranch' and no origin/$FeatureBranch. Push the branch first or fix -FeatureBranch."
            }
        } finally {
            Pop-Location
        }
        Invoke-Git @("checkout", "-b", $FeatureBranch, "origin/$FeatureBranch")
    } else {
        Invoke-Git @("checkout", $FeatureBranch)
    }

    # Merge main into feature if feature does not already contain origin/main
    $null = & git merge-base --is-ancestor "origin/main" "HEAD" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "== Merging origin/main into $FeatureBranch ==" -ForegroundColor Yellow
        Invoke-Git @("merge", "--no-edit", "origin/main")
    } else {
        Write-Host "== $FeatureBranch already contains origin/main (skip merge) ==" -ForegroundColor DarkGray
    }

    Write-Host "== AO-RESUME on $FeatureBranch ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aoResume
    if ($LASTEXITCODE -ne 0) {
        throw "AO-RESUME on $FeatureBranch failed (exit $LASTEXITCODE)."
    }

    if ($PushFeature) {
        $null = & git rev-list --left-right --count "origin/$FeatureBranch...HEAD" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $line = (& git rev-list --left-right --count "origin/$FeatureBranch...HEAD" 2>&1 | Select-Object -Last 1)
            if ($line -match '^\s*(\d+)\s+(\d+)\s*$') {
                $left = [int]$Matches[1]
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
